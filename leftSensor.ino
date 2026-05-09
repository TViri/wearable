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
long ibiIdok[10];
// Az utolsó 10 szívverés közötti idő tárolása a HRV-hez
int ibiIndex = 0;
long elozoElfogadottIBI = 0;
float simitottHrv = 0;

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
  
  // Beállítás: 400 Hz mintavétel (2.5 ms pontosság), 0 átlagolás (nyers sebesség)
  byte ledBrightness = 0x1F; // Erős LED fény a stabil jelhez
  byte sampleAverage = 1;    // Nincs hardveres átlagolás, hogy gyorsabb legyen
  byte ledMode = 2;          // Red + IR
  int sampleRate = 400;      // 400 minta/másodperc (nagyon fontos a HRV-hez!)
  int pulseWidth = 411;      // Széles impulzus a jobb jel/zaj arányhoz
  int adcRange = 4096;       // Szenzor érzékenysége

  particleSensor.setup(ledBrightness, sampleAverage, ledMode, sampleRate, pulseWidth, adcRange);
}

void loop() {
  // --- 1. ADATOK BEOLVASÁSA ÉS KISZÁMÍTÁSA VÁLTOZÓKBA ---
  
  // Gyroszkóp/Dőlés adatok
  xyzFloat szogek = mpu.getAngles();
  float taroltPitch = szogek.x;
  float taroltRoll = szogek.y;

  // Pulzus adatok beolvasása
  long nyersIR = particleSensor.getIR();

  // JAVÍTÁS: Csak akkor vizsgáljuk a pulzust, ha van ujj a szenzoron (> 50,000 érték)
  if (nyersIR > 50000) {
      
      // Szívverés detektálása
      if (checkForBeat(nyersIR) == true) {
        long mostaniIdo = millis();
        long elteltIdo = mostaniIdo - utolsoDobbanasIdeje;
        utolsoDobbanasIdeje = mostaniIdo;
    
        // Szigorúbb BPM szűrés (kb. 40-200 BPM közötti reális értékek)
        if (elteltIdo > 400 && elteltIdo < 1500) { 
          
          // 1. ZAJ ÉS FANTOM ÜTÉSEK KISZŰRÉSE (Artifact filtering)
          if (elozoElfogadottIBI == 0 || abs(elteltIdo - elozoElfogadottIBI) < (elozoElfogadottIBI * 0.25)) {
          
            // Stabil BPM számítás
            bpmErtek = 60000 / (float)elteltIdo;

            // IBI eltárolása a körkörös tömbben a HRV-hez
            ibiIdok[ibiIndex] = elteltIdo;
            ibiIndex = (ibiIndex + 1) % 10;
            
            // 2. VALÓDI RMSSD (HRV) KISZÁMÍTÁSA A TÖMBBŐL
            float sumOfSquares = 0;
            int validPairs = 0;
            
            // Végigmegyünk a tömb elemein, és a szomszédosak különbségét vizsgáljuk
            for (int i = 0; i < 9; i++) {
              long current = ibiIdok[i];
              long next = ibiIdok[i+1];
              
              // Csak azokat a párokat nézzük, ahol már van valós adat (nem 0)
              if (current > 0 && next > 0) {
                float diff = current - next;
                sumOfSquares += (diff * diff);
                validPairs++;
              }
            }
            
            // Ha van legalább egy érvényes párunk, kiszámoljuk a gyököt
            if (validPairs > 0) {
              hrvErtek = sqrt(sumOfSquares / validPairs);

              // EMA SZŰRŐ: A korábbi érték 90%-át és az új érték 10%-át vesszük.
              if (simitottHrv == 0) simitottHrv = hrvErtek; // Kezdeti érték beállítása
              simitottHrv = (simitottHrv * 0.90) + (hrvErtek * 0.10);
            }
            
            // Eltesszük az értéket a következő szűréshez
            elozoElfogadottIBI = elteltIdo;

          } 
        }
      }
  } else {
      // JAVÍTÁS: Nincs ujj a szenzoron. Változók nullázása.
      bpmErtek = 0;
      simitottHrv = 0;
      elozoElfogadottIBI = 0;
      
      // Időzítő szinkronizálása, hogy amikor visszateszed az ujjad, az első elteltIdo ne legyen irreálisan nagy
      utolsoDobbanasIdeje = millis(); 
      
      // Tömb nullázása, hogy a régi értékek ne rontsák az új HRV mérést
      for (int i = 0; i < 10; i++) {
          ibiIdok[i] = 0;
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