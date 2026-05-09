#include <Wire.h>
#include <MPU9250_WE.h>

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
          Serial.println("Motor BE");
        } else if (value[0] == '0') {
          motorUzemmod = 0;
          Serial.println("Motor KI");
        }
      }
    }
};

// Szenzorok
MPU9250_WE mpu = MPU9250_WE(0x68);

void setup() {
  Serial.begin(115200);
  delay(3000); 

  pinMode(MOTOR_PIN, OUTPUT);
  Wire.begin(8, 9);

  // --- BLE INICIALIZÁLÁSA ---
  BLEDevice::init("ESP_Right"); // NÉV MEGVÁLTOZTATVA
  
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
}

void loop() {
  // --- 1. ADATOK BEOLVASÁSA ---
  // Gyroszkóp/Dőlés adatok
  xyzFloat szogek = mpu.getAngles();
  float taroltPitch = szogek.x;
  float taroltRoll = szogek.y;

  // --- 2. MOTOR VEZÉRLÉSE ---
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
      Serial.println("-----------------------");

      if (deviceConnected) {
        // Csak a két létező értéket küldjük
        char bleData[32]; 
        sprintf(bleData, "%.1f,%.1f", taroltPitch, taroltRoll);
        
        pCharacteristic->setValue(bleData);
        pCharacteristic->notify();
      }

      utolsoSorosKiiras = millis();
  }

  // --- BLE KAPCSOLAT KEZELÉSE ---
  if (!deviceConnected && oldDeviceConnected) {
      delay(500);
      pServer->startAdvertising(); 
      Serial.println("Kapcsolat megszakadt. Bluetooth ujrainditva...");
      oldDeviceConnected = deviceConnected;
  }
  if (deviceConnected && !oldDeviceConnected) {
      oldDeviceConnected = deviceConnected;
      Serial.println("Weboldal csatlakozott!");
  }
}