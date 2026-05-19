# A Wearable Injury Prevention System
**Real-time feedback and personalized training guidance through wearables**

Masterwork Project | Interaction Design MA (2026)  
**Author:** Virág Tibenszki  
**Institution:** Moholy-Nagy University of Art and Design Budapest (MOME)

---

## 🔗 Quick Links & Project Deliverables
* **Live Functional Data Bridge Website:** https://tviri.github.io/wearable/
* **Figma Interaction Prototype:** 
* **Full Masterwork Documentation:** https://docs.google.com/document/d/1SLA1WWXHuug2KVbxbjE3d0UWoRQ9C4QH4S2Lfm2qqtE/edit?usp=sharing

---

## ⚠️ Important Technical Disclaimer

> **Please Note:** The live demo web application is designed to function as a real-time data bridge for custom-built physiological hardware. It relies entirely on active Bluetooth data streams to process sensor packets, calculate symmetry metrics, and validate repetitions. 
> 
> **The interactive workout flow cannot be completed on the website without connecting the functional wearable modules.** > 
> Without physical hardware connected via Web Bluetooth, the software environment will remain on the peripheral pairing screen and will not dynamically transition through the workout phases.

---

## 📱 Project Overview
This project is an ecosystem consisting of physical wearable sensor modules and a connected digital interface designed to track biomechanical forms, count repetitions, and prevent injuries during training through real-time feedback.

### Key Components:
1. **The Wearables (Hardware):** Armbands/modules powered by **ESP32-C3-SUPERMINI** microcontrollers, utilizing integrated IMU (Inertial Measurement Units) and heart rate sensors to capture real-time physiological data.
2. **The Data Bridge (Web Application):** A lightweight frontend interface built with vanilla web technologies (HTML, CSS, JavaScript) that utilizes the **Web Bluetooth API** to capture sensor streams directly from the hardware, bypassing the processing limitations of traditional high-fidelity prototyping tools like Figma.
│   └── js/                    # Core logic (Web Bluetooth API, data processing, metrics math)
│
└── README.md                  # Project documentation
