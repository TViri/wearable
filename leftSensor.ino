#include <Wire.h>
#include <MPU9250_WE.h>
#include "MAX30105.h" 
#include "heartRate.h" // A SparkFun könyvtár része a pulzus detektáláshoz

// --- BLE KÖNYVTÁRAK BEEMELÉSE ---
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// --- BLE VÁLTOZÓK ÉS UUID-k (Egyezniük kell a JavaScript-tel!) ---
#define SERVICE_UUID        "19b10000-e8f2-537e-4f6c-d104768a1214"
#define CHARACTERISTIC_UUID "19b10001-e8f2-537e-4f6c-d104768a1214"

BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// Konfiguráció
const int MOTOR_PIN = 3;
unsigned long utolsoSorosKiiras = 0;
const long UJJ_DETEKTALASI_KUSZOB = 50000;
const unsigned long UJJ_DEBOUNCE_MS = 500;
const byte BPM_ATLAG_MERET = 4;
const byte IBI_TOMB_MERET = 10;

// MOTOR VEZÉRLŐ VÁLTOZÓ
// 0: kikapcsolva, 1: rezeg
int motorUzemmod = 0;

// Bluetooth csatlakozás/lecsatlakozás eseménykezelője
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
    };

    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
    }
};

// Callback osztály az íráshoz
class MyCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      String value = pCharacteristic->getValue();
      if (value.length() > 0) {
        if (value[0] == '1') {
          motorUzemmod = 1;
          // Rezgés bekapcsolása
          Serial.println("Motor BE");
        } else if (value[0] == '0') {
          motorUzemmod = 0;
          // Rezgés kikapcsolása
          Serial.println("Motor KI");
        }
      }
    }
};

// Szenzorok
MPU9250_WE mpu = MPU9250_WE(0x68);
MAX30105 particleSensor;

// PULZUS ÉS HRV VÁLTOZÓK
long utolsoDobbanasIdeje = 0;
float bpmErtek = 0;
float hrvErtek = 0;
long ibiIdok[IBI_TOMB_MERET];
// Az utolsó 10 szívverés közötti idő tárolása a HRV-hez
int ibiIndex = 0;
byte ibiMintakSzama = 0;
long elozoElfogadottIBI = 0;
float simitottHrv = 0;
bool elsoDetektaltBeat = true;
bool ujjStabilanRajta = false;
unsigned long ujjDetektalasKezdete = 0;
float bpmTomb[BPM_ATLAG_MERET];
byte bpmTombIndex = 0;
byte bpmMintakSzama = 0;

void resetPulzusAllapot() {
  bpmErtek = 0;
  hrvErtek = 0;
  simitottHrv = 0;
  elozoElfogadottIBI = 0;
  elsoDetektaltBeat = true;
  ibiIndex = 0;
  ibiMintakSzama = 0;
  bpmTombIndex = 0;
  bpmMintakSzama = 0;
  utolsoDobbanasIdeje = millis();

  for (byte i = 0; i < IBI_TOMB_MERET; i++) {
    ibiIdok[i] = 0;
  }

  for (byte i = 0; i < BPM_ATLAG_MERET; i++) {
    bpmTomb[i] = 0;
  }
}

void setup() {
  Serial.begin(115200);
  delay(3000); 

  pinMode(MOTOR_PIN, OUTPUT);
  Wire.begin(8, 9);

  // --- BLE INICIALIZÁLÁSA ---
  // FIGYELEM: A másik ESP-n ezt írd át "ESP_Right"-ra!
  BLEDevice::init("ESP_Left"); 
  
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_READ   |
                      BLECharacteristic::PROPERTY_NOTIFY |
                      BLECharacteristic::PROPERTY_WRITE
                    );
  pCharacteristic->addDescriptor(new BLE2902());
  pService->start();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(false);
  pAdvertising->setMinPreferred(0x0);  
  pCharacteristic->setCallbacks(new MyCallbacks());
  BLEDevice::startAdvertising();
  Serial.println("Várakozás Bluetooth kliensre...");
  // --- BLE INICIALIZÁLÁS VÉGE ---

  mpu.init();
  mpu.autoOffsets();
  mpu.setAccRange(MPU9250_ACC_RANGE_8G);
  mpu.enableGyrDLPF();

  if (!particleSensor.begin(Wire, I2C_SPEED_STANDARD)) {
    Serial.println("MAX30102 nem talalhato!");
    while(1);
  }
  
  // Stabilabb beállítások BPM/HRV-hez
  byte ledBrightness = 60;   // Kicsit erősebb LED a jobb jelhez
  byte sampleAverage = 4;    // Hardveres átlagolás zajcsökkentéshez
  byte ledMode = 2;          // Red + IR
  int sampleRate = 100;      // Stabil mintavétel a beat detektáláshoz
  int pulseWidth = 411;      // Széles impulzus a jobb jel/zaj arányhoz
  int adcRange = 4096;       // Szenzor érzékenysége

  particleSensor.setup(ledBrightness, sampleAverage, ledMode, sampleRate, pulseWidth, adcRange);
  resetPulzusAllapot();
}

void loop() {
  // --- 1. ADATOK BEOLVASÁSA ÉS KISZÁMÍTÁSA VÁLTOZÓKBA ---
  
  // Gyroszkóp/Dőlés adatok
  xyzFloat szogek = mpu.getAngles();
  float taroltPitch = szogek.x;
  float taroltRoll = szogek.y;

  // Pulzus adatok beolvasása FIFO-ból (csak új mintákat dolgozunk fel)
  particleSensor.check();
  while (particleSensor.available()) {
    long nyersIR = particleSensor.getFIFOIR();
    particleSensor.nextSample();

    // Ujj detektálás + debounce
    if (nyersIR > UJJ_DETEKTALASI_KUSZOB) {
      if (ujjDetektalasKezdete == 0) {
        ujjDetektalasKezdete = millis();
      }

      if (!ujjStabilanRajta && (millis() - ujjDetektalasKezdete >= UJJ_DEBOUNCE_MS)) {
        ujjStabilanRajta = true;
        resetPulzusAllapot();
      }
    } else {
      ujjDetektalasKezdete = 0;
      if (ujjStabilanRajta) {
        ujjStabilanRajta = false;
        resetPulzusAllapot();
      }
      continue;
    }

    if (!ujjStabilanRajta) {
      continue;
    }

    if (checkForBeat(nyersIR) == true) {
      unsigned long mostaniIdo = millis();

      // Az első detektált beat csak szinkronpont, ebből még nem számolunk BPM-et.
      if (elsoDetektaltBeat) {
        utolsoDobbanasIdeje = mostaniIdo;
        elsoDetektaltBeat = false;
        continue;
      }

      long elteltIdo = (long)(mostaniIdo - utolsoDobbanasIdeje);
      utolsoDobbanasIdeje = mostaniIdo;

      // Reális IBI tartomány (kb. 40-200 BPM)
      if (elteltIdo > 300 && elteltIdo < 1500) {
        // Kicsit lazább artifact filter, hogy ne dobjon el túl sok valós beatet.
        bool artifactSzuresOk = (elozoElfogadottIBI == 0) ||
                                (labs(elteltIdo - elozoElfogadottIBI) <= (long)(elozoElfogadottIBI * 0.35f));

        if (artifactSzuresOk) {
          float pillanatnyiBpm = 60000.0f / (float)elteltIdo;

          // BPM futó átlag (SparkFun jellegű simítás)
          bpmTomb[bpmTombIndex] = pillanatnyiBpm;
          bpmTombIndex = (bpmTombIndex + 1) % BPM_ATLAG_MERET;
          if (bpmMintakSzama < BPM_ATLAG_MERET) {
            bpmMintakSzama++;
          }

          float bpmOsszeg = 0;
          for (byte i = 0; i < bpmMintakSzama; i++) {
            bpmOsszeg += bpmTomb[i];
          }
          bpmErtek = bpmOsszeg / bpmMintakSzama;

          // IBI eltárolása körkörös tömbben
          ibiIdok[ibiIndex] = elteltIdo;
          ibiIndex = (ibiIndex + 1) % IBI_TOMB_MERET;
          if (ibiMintakSzama < IBI_TOMB_MERET) {
            ibiMintakSzama++;
          }

          // RMSSD számítás időrendben a circular bufferből
          if (ibiMintakSzama >= 2) {
            float sumOfSquares = 0;
            int validPairs = 0;
            int startIdx = (ibiMintakSzama == IBI_TOMB_MERET) ? ibiIndex : 0;

            for (byte i = 0; i < ibiMintakSzama - 1; i++) {
              int idx = (startIdx + i) % IBI_TOMB_MERET;
              int nextIdx = (startIdx + i + 1) % IBI_TOMB_MERET;
              long current = ibiIdok[idx];
              long next = ibiIdok[nextIdx];

              if (current > 0 && next > 0) {
                float diff = (float)(current - next);
                sumOfSquares += (diff * diff);
                validPairs++;
              }
            }

            if (validPairs > 0) {
              hrvErtek = sqrt(sumOfSquares / validPairs);
              if (simitottHrv == 0) {
                simitottHrv = hrvErtek;
              } else {
                simitottHrv = (simitottHrv * 0.90f) + (hrvErtek * 0.10f);
              }
            }
          }

          elozoElfogadottIBI = elteltIdo;
        }
      }
    }
  }

  // --- 2. MOTOR VEZÉRLÉSE VÁLTOZÓ ALAPJÁN ---
  if (motorUzemmod == 1) {
    digitalWrite(MOTOR_PIN, HIGH);
  } else {
    digitalWrite(MOTOR_PIN, LOW);
  }

  // --- 3. KIÍRÁS ÉS BLUETOOTH KÜLDÉS ---
  if (millis() - utolsoSorosKiiras > 200) {
      
      // Serial monitor kiírás (fejlesztéshez)
      Serial.println("--- AKTUALIS ADATOK ---");
      Serial.print("Doles X: "); Serial.println(taroltPitch);
      Serial.print("Doles Y: "); Serial.println(taroltRoll);
      Serial.print("Szivritmus (BPM): "); Serial.println(bpmErtek);
      Serial.print("Variabilitas (HRV): "); Serial.println(simitottHrv);
      Serial.println("-----------------------");

      if (deviceConnected) {
        // Mind a négy változót elküldjük: Pitch, Roll, BPM, HRV
        char bleData[64]; // Megnövelt puffer a 4 értéknek
        sprintf(bleData, "%.1f,%.1f,%.1f,%.1f", taroltPitch, taroltRoll, bpmErtek, simitottHrv);
        
        pCharacteristic->setValue(bleData);
        pCharacteristic->notify();
      }

      utolsoSorosKiiras = millis();
  }

  // --- BLE KAPCSOLAT KEZELÉSE (Újracsatlakozás) ---
  if (!deviceConnected && oldDeviceConnected) {
      delay(500);
      pServer->startAdvertising(); // Újra hirdeti magát, ha megszakad a kapcsolat
      Serial.println("Kapcsolat megszakadt. Bluetooth ujrainditva...");
      oldDeviceConnected = deviceConnected;
  }
  if (deviceConnected && !oldDeviceConnected) {
      oldDeviceConnected = deviceConnected;
      Serial.println("Weboldal csatlakozott!");
  }
}