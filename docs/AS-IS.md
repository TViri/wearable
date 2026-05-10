# Wearable demo alkalmazás — AS-IS dokumentáció

Ez a dokumentum a jelenlegi kódbázis állapotát írja le referenciának későbbi fejlesztésekhez. Forrás: `index.html`, `script.js`, `style.css`.

---

## 1. Cél és kontextus

Az alkalmazás egy **workout flow demó**: több teljes képernyős lépésben vezeti a felhasználót előméréstől az összegzésig. Két ESP eszközt **Bluetooth Low Energy (Web Bluetooth)** segítségével kell párosítani (bal és jobb kéz).

**Tervezett hardver viselkedés (product intent, nem mind része az UI-nak):**

| Oldal | Várt szenzor / adat | Rezgés visszairány |
|-------|---------------------|---------------------|
| Bal   | Gyroszkóp szögek (pitch/roll), BPM, HRV | Igen, karakterisztikán írva |
| Jobb  | Gyroszkóp szögek | Igen, külön |

**Jelenlegi implementáció:** mindkét oldal **ugyanazzal** a BLE UUID párossal van kezelve; a CSV **mezőszáma eltér** (bal: 4 mező, jobb: 2 — lásd 5.3). Az érkező értékek **memóriában frissülnek**. A **screen 4** és **screen 14** HRV mérési blokkok a bal szenzor **BPM / HRV** értékeit használják; a többi workout képernyő továbbra sincs IMU/BPM alapon bekötve.

---

## 2. Technikai összefoglaló

| Elem | Állapot |
|------|---------|
| Keretrendszer | Nincs build step: statikus HTML + egy globális `script.js` |
| Stílus | `style.css` — mobil keret (`390×844`), `.screen` rétegezés |
| Képernyők száma | 15 (`screen1` … `screen15`) |
| Átkapcsolás | `showScreen(n)` — `.active` osztály |
| Globális hook | `window.showScreen` felülírva speciális screen 12 viselkedéshez |

**Fájlok:**

- `index.html` — DOM, képernyők, presenter/dev menü
- `script.js` — navigáció, BLE, workout/warmup/cooldown logika, demo időzítők
- `style.css` — megjelenés
- `images/dev.png` — presenter menü ikon

**Firmware referencia (ne módosítsd a repo-ban):** a `leftSensor.ino` és `rightSensor.ino` fájlok **csak kontextusnak** vannak a mappában — a tényleges ESP-kre már fel vannak írva. Ezeknek a tartalmát **nem célszerű** itt változtatni (duplikáció / eltérések elkerülése); ha firmware-t frissítesz, azt az Arduino projektben / az eszközön kezeld, és igazítsd hozzá a webes protokollt.

---

## 3. Képernyőtérkép (workout flow)

| # | DOM id | Szerep (üzleti jelentés) |
|---|--------|---------------------------|
| 1 | `screen1` | Start — belépés a flow-ba |
| 2 | `screen2` | Aktivitás választás: Upper / Lower / Full látható; **választható csak Upper Body** (Lower/Full `disabled`). **Next** csak ha van kiválasztott aktivitás (`#screen2Next` `disabled` amíg üres `selectedActivity`). |
| 3 | `screen3` | Sensor setup: felhelyezési szöveg + Pair Left / Pair Right (BLE) |
| 4 | `screen4` | Pre-workout HRV mérés (UI) + kalibráció (UI) → warm-up indítás |
| 5 | `screen5` | Warm-up UI (5 gyakorlat listája); **demo:** csak az 1. gyakorlat fut le, utána minden tile kész (zöld) → screen 6 |
| 6 | `screen6` | Warm-up kész → workout overview |
| 7 | `screen7` | Workout overview: név, focus, gyakorlatlista (`renderWorkoutOverview`) |
| 8 | `screen8` | Gyakorlat infó: izmok, sets/reps/súly; csak **Start Exercise** → screen 9 (nincs gyakorlat-kihagyás) |
| 9 | `screen9` | Set előtti visszaszámláló (3 mp) |
| 10 | `screen10` | Aktív szett: rep számláló bal `roll` (−30 / −10) + symmetry/tempo fault pause + automatikus `Continue set in` countdown |
| 11 | `screen11` | Pihenő — statikus „60” szám megjelenítés (`#restCountdown`); **Skip Rest** → közvetlenül **screen 12** (workout complete), nincs újabb szett/gyakorlat |
| 12 | `screen12` | Workout complete → auto cooldown countdown (3 mp) |
| 13 | `screen13` | Cooldown nyújtások aktivitás szerinti listával |
| 14 | `screen14` | Post-workout recovery check (HRV UI) |
| 15 | `screen15` | Session összegzés (statikus placeholder számok) |

Megjegyzés: az `index.html`-ben a kommentek részben angolul írják le a szekciókat (pl. Screen 1: Start Workout).

---

## 4. Alkalmazásállapot (script szinten)

| Változó | Jelentés |
|---------|-----------|
| `currentScreen` | Aktív képernyő sorszáma (`showScreen` után) |
| `selectedActivity` | `'upper' \| 'lower' \| 'full'` — workout és cooldown lista kulcsa |
| `currentExerciseIndex`, `currentSetIndex` | Workout progress |
| `currentWarmup` | Warm-up gyakorlat index |
| `warmupWaitingForRoll` | Screen 5: warm-up számláló csak `leftSensorData.roll < 30` után indul (bal BLE minták alapján) |
| `currentStretchIndex` | Cooldown stretch index |
| `preWorkoutHRV` | Screen 4 mért **HRV (ms, firmware RMSSD-jellegű simított érték)** |
| `postWorkoutHRV` | Screen 14 mért **HRV (ms)** — sikeres post-workout mérés után (`leftSensorData.hrv`), screen 15 felé jelenleg nem köttetve |
| `leftSensorData`, `rightSensorData` | BLE-ből frissített objektumok |
| `activeSetRepRafId` | Screen 10 aktív szett loop `requestAnimationFrame`-mel |
| `leftConnected`, `rightConnected` | Párosítás állapot |
| `leftBleWriteCharacteristic`, `rightBleWriteCharacteristic` | Bal/jobb BLE write handle (motor vezérléshez) |

Ha `selectedActivity` üres marad (pl. presenter menüből screen 7-re ugrás Next nélkül), `workouts[activity]` **undefined** lesz — ez runtime hiba lehetőség.

---

## 5. BLE — AS-IS viselkedés (`script.js`)

### 5.1 UUID-k

- Service: `19b10000-e8f2-537e-4f6c-d104768a1214`
- Characteristic (notify + write): `19b10001-e8f2-537e-4f6c-d104768a1214`

### 5.2 Kapcsolódás

- `navigator.bluetooth.requestDevice({ filters: [{ services: [bleServiceUUID] }] })`
- `startNotifications()` majd **azonnal** `buzzESP(characteristic)` (sikeres párosítás jelzése).

### 5.3 Bejövő adatformátum

`characteristicvaluechanged`: UTF-8 szöveg, vesszővel elválasztott számok.

- **Bal ESP (AS-IS firmware):** négy mező — `pitch, roll, bpm, hrv`.
- **Jobb ESP (AS-IS firmware):** két mező — `pitch, roll` (nincs pulzus szenzor; BPM/HRV nem küldött).

A `script.js` mindkét formát elfogadja: `length >= 4` esetén mind a négy mezőt tölti; **két mezőnél** BPM és HRV **0** marad a memóriában. Korábbi hiba volt a csak `length === 4` feltétel — ettől a jobb oldali gyro adatok nem frissültek.

### 5.4 Kimeneti / rezgés

Motor vezérlés webes mintákkal történik (`'1'` / `'0'` write), firmware oldalon nincs külön pattern parancs.

- `buzzESP(characteristic)` párosításkor egy hosszú impulzust küld (sikerjelzés).
- `vibrateSideLong('left'|'right')` csak a választott oldalt rezegteti (symmetry hiba).
- `vibrateBothLong(1)` mindkét oldalon 1 hosszú impulzus (tempo 10–40% eltérés).
- `vibrateBothLong(2)` mindkét oldalon 2 hosszú impulzus (tempo >40% eltérés).
- A script oldali timing konstansok vezérlik a hosszú impulzus és a köztük lévő szünet idejét.

### 5.5 UI és BLE

- `#pairingStatus` mutatja a keresés / siker / hiba / disconnect üzeneteket.
- `#bleDataDisplay` az HTML-ben létezik (`leftGyroData`, `rightGyroData`), de **`display: none`** és a script **nem tölti** — a komment szerint szándékosan csak státusz, nem élő adat.

---

## 6. Adatmodellek (statikus tartalom)

### 6.1 Workoutok — `workouts`

Kulcs: `full`, `lower`, `upper`. Mezők: `name`, `info`, `focus`, `description`, `exercises[]`.

Gyakorlat objektum: `name`, `muscles`, `sets` (pl. `"3 × 10"`), `weight`.

### 6.2 Warm-up — `warmupExercises`

Fix 5 elem: név, instrukció, `duration` (mp).

### 6.3 Cooldown — `stretches`

Aktivitáshoz kötött listák (`full` / `lower` / `upper`), eltérő hosszal.

---

## 7. Workout állapotgép (lineáris demó)

```
screen7 → Start → screen8 (renderExerciseInfo)
screen8 → Start Exercise → screen9 (renderSetCountdown: 3…1, showScreen(9) a countdown elején)
screen9 → automatikusan screen10 (renderActiveSet), ha lejárt a visszaszámláló
screen10 (measuring) → symmetry/tempo fault esetén pause + `Continue set in 5..1` countdown
screen10 (resume gate: `|left.roll| < 30 && |right.roll| < 30`) → measuring folytatás
screen10 → célreps elérve (`leftSensorData.roll` küszöbök) → screen11 (renderRest)
screen11 → Skip Rest → window.showScreen(12) (workout complete + cooldown előtti 3 mp)
```

**Megjegyzés:** nincs többszörös szett / több gyakorlat loop a flow-ban — egy „Exercise info → countdown → aktív szett → pihenő → complete” útvonal.

**Demo jellegű részek:**

- **Repszámlálás (`renderActiveSet`):** bal `leftSensorData.roll` — előbb −30 alá, majd −10 felé vissza (`roll ≥ -10`), egy rep; `requestAnimationFrame` loop.
- **Symmetry fault:** ha `Math.abs(left.roll - right.roll) > 10`, a magasabb roll oldal rezeg, a Symmetry card piros (`Symmetry: Level left/right arm`), a notification panel hibaüzenetet mutat; mérés pause.
- **Tempo fault:** első két inter-rep időkülönbség baseline átlagot ad; a 3. összehasonlított gap-től `pctDeviation = |gap-baseline|/baseline*100`. `<10%`: `Tempo: Stable`; `10–40%`: `Tempo: Inconsistent` + narancs + mindkét oldal 1 hosszú rezgés + pause; `>40%`: `Tempo: Fatigued` + piros + mindkét oldal 2 hosszú rezgés + pause.
- **Pause / resume:** fault alatt se rep, se új fault-ellenőrzés nem fut. Hiba után automatikus `Continue set in 5..1` visszaszámlálás fut; a végén mindkét oldal röviden rezeg (folytatásjel). A mérés csak akkor folytatódik, ha mindkét oldal `|roll| < 30`; a pause ideje nem számít bele a tempo időkbe.
- **Warm-up „motion detection”:** a countdown akkor indul, ha a **bal** szenzor BLE-jén érkező `leftSensorData.roll` érvényes és **30-nál kisebb** (minden gyakorlat előtt újra vár erre); a visszaszámláló lépésenként `WARMUP_COUNTDOWN_STEP_MS` (30 számjegy ≈ 15 mp összesen).
- **Warm-up demo rövidítés:** az első gyakorlat (**Arm Circles**) számlálója után az összes warm-up tile **completed** (zöld), progress **100%**, ~700 ms múlva **screen 6** (nem futnak le a 2–5. gyakorlatok).
- **Screen 4 HRV:** 30 mp valós visszaszámlálás (1 mp lépés); közben `#hrvLiveBpm` frissül `leftSensorData.bpm`-mel (~200 ms); a végén `preWorkoutHRV` és a kiírt érték `leftSensorData.hrv` (ms). Readiness szöveg **HRV ms** küszöbökkel (40 / 20 / 10); a **Start Measurement** gomb minden mérés után újra kattintható (ismételt mérés).
- **Screen 14 recovery:** ugyanaz a **30 mp / 1 mp** HRV mérési blokk mint screen 4-en (élő BPM ~200 ms); a végeredmény szöveg és `HRV: … ms` a **`getReadinessDisplayFromHrvMs`** logikával egyezik (screen 4-gyel közös küszöbök); nincs előző értékhez viszonyított „strain” összehasonlítás. A **`#startPostHRVBtn` Start Measurement** minden mérés után újra kattintható (ismétlés); csak érvényes (`!invalid`) mérésnél frissül `postWorkoutHRV`.
- **Kalibráció:** százalék animáció fix lépésekkel, nem szenzor.

---

## 8. Screen 12 — speciális `showScreen` wrapper

```javascript
const originalShowScreen = showScreen;
window.showScreen = function(num) {
  originalShowScreen(num);
  if (num === 12) { /* 3 mp countdown majd startCooldown() */ }
};
```

Hatások:

- A **presenter menü** `onclick="showScreen(12)"` hívás **indítja** a 3 mp-es cooldown előtti visszaszámlálót és utána `startCooldown()`-ot.
- Közvetlenül `originalShowScreen(12)` hívása (ha lenne) nem futtatná ezt — jelenleg minden publikus hívás `window.showScreen`-en megy keresztül a felülírás után.

---

## 9. Dev / Presenter menü

- DOM: `#presenterMenu`, `#presenterToggle` (kép), `#presenterPanel`
- Kattintásra nyit/csuk; dokumentum szintű kattintás **bezárja**, ha a menün kívülre kattintanak.
- Gombok: Diagnostic (1–4), Warm-up (5–6), Workout (7–12), Post-workout (13–15).
- **`showScreen` globálisan elérhető** az inline `onclick` attribútumok miatt.

---

## 10. HTML / DOM megjegyzések (technikai adósság)

- **`.countdown`:** globálisan `display: none` (HRV / stretch / set countdown JS-sel kap `display: block`-ot). Kivétel: `#restCountdown` CSS-ben látható — pihenő statikus „60” szám.
- **Duplikált `id`-k** több screenen (`workoutType`, `exerciseCounter`, `setCounter`, `workoutProgressBar`, `exerciseName`, `exerciseAnimation`). Ez invalid HTML5; a script részben `#screen8 #exerciseName` jellegű szűréssel, részben `querySelectorAll`-lal kezeli.
- **Beágyazott duplikált `id`:** `screen5`-ben két `#waitingMotion` blokk (belső és külső) — karbantartásnál zavaró lehet.
- **`startWorkoutBtn`** kétszer: screen1 és screen6 (`startWorkoutBtn2` a folytatásra).

---

## 11. Böngésző és környezet

- **Web Bluetooth:** tipikusan **Chrome / Edge**, **HTTPS vagy localhost**, felhasználói gesztus kell az eszköz választáshoz.
- Nincs service worker / offline manifest a vizsgált fájlokban.

---

## 12. Összefoglaló: mi kész, mi nincs

| Terület | AS-IS |
|---------|--------|
| Statikus képernyők és navigáció | Megvan (fő útvonal + presenter) |
| Aktivitás szerinti szöveg / lista | `selectedActivity` + `workouts` / `stretches` |
| BLE párosítás + notify + write buzz | Megvan (oldalspecifikus és kétoldali motor pattern hívásokkal is) |
| Élő szenzoradat a UI-ban és a workout logikában | Screen 4 és screen 14 HRV blokk: BPM + HRV **van**; screen 5 warm-up indulás: bal **roll** küszöb **van**; screen 10 aktív szett: bal **roll** reps + symmetry/tempo fault pause **van**; egyéb workout képernyők: **nincs** |
| Bal/jobb protokoll különbség (jobb: csak gyro CSV) | Parse: 4 vs 2 mező (`script.js`) |
| HRV / readiness / recovery számítás | Screen 4 és screen 14: firmware **HRV ms**, ugyanaz a readiness szövegblokk; recovery UI statikus címekkel |
| Rep counting / forma / symmetry | Screen 10: roll küszöbök (−30 / −10), symmetry diff fault, tempo baseline+eltérés fault, auto continue countdown + neutral resume gate |

---

## 13. Javasolt következő integrációs pontok (referencia, nem követelmény)

1. **UI binding:** `#leftGyroData` / `#rightGyroData` vagy dedikált workout sorok — throttle-lal frissítve.
2. **Rep / motion:** `renderActiveSet` és warm-up helyett IMU pipeline (küszöbök, aktivitás-specifikus modell).
3. **HRV:** Screen 4 és screen 14 kész (`bpm` / `hrv`, 30 s); opcionálisan **pre vs post** összehasonlítás / strain narratíva külön szabályokkal.
4. **`selectedActivity` védelem:** presenter ugrásnál default vagy guard.

---

*Utolsó frissítés (2026-05-10): Screen 5 warm-up visszaszámláló lépésideje `WARMUP_COUNTDOWN_STEP_MS` — 30→0 megjelenítés összesen ~15 mp. Screen 10 Active Set kibővítve symmetry + tempo fault logikával. Symmetry: `|left.roll-right.roll| > ACTIVE_SET_SYMMETRY_DIFF_THRESHOLD` esetén a magasabb roll oldal rezeg, piros kártya/üzenet, majd pause. Tempo: az első két inter-rep interval baseline, ezután `<10%` stable, `10–40%` inconsistent (narancs + 1 hosszú rezgés mindkét oldalon), `>40%` fatigued (piros + 2 hosszú rezgés mindkét oldalon), faultnál pause. Hiba után automatikus `Continue set in 5..1` countdown fut, majd mindkét eszköz egy rövid rezgéssel jelzi a folytatási lehetőséget; a valódi mérés csak `|left.roll| < 30 && |right.roll| < 30` feltételnél indul újra. A pause-idő nem számít tempo gap-be. BLE oldalon bal/jobb write characteristic globálisan tárolva; oldalspecifikus és kétoldali rezgés pattern API használatban.*
