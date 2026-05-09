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

**Jelenlegi implementáció:** mindkét oldal ugyanazzal a BLE UUID párossal és **azonos CSV formátummal** van kezelve; az érkező értékek **memóriában frissülnek**, de a workout képernyők **nem kötik** őket megjelenítéshez vagy logikához.

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

---

## 3. Képernyőtérkép (workout flow)

| # | DOM id | Szerep (üzleti jelentés) |
|---|--------|---------------------------|
| 1 | `screen1` | Start — belépés a flow-ba |
| 2 | `screen2` | Aktivitás választás: Upper / Lower / Full (`data-activity`) |
| 3 | `screen3` | Sensor setup: felhelyezési szöveg + Pair Left / Pair Right (BLE) |
| 4 | `screen4` | Pre-workout HRV mérés (UI) + kalibráció (UI) → warm-up indítás |
| 5 | `screen5` | Warm-up: 5 gyakorlat, progress, „motion detect” + számláló |
| 6 | `screen6` | Warm-up kész → workout overview |
| 7 | `screen7` | Workout overview: név, focus, gyakorlatlista (`renderWorkoutOverview`) |
| 8 | `screen8` | Gyakorlat infó: izmok, sets/reps/súly, Start / Skip |
| 9 | `screen9` | Set előtti visszaszámláló (3 mp) |
| 10 | `screen10` | Aktív szett: rep számláló (demo) |
| 11 | `screen11` | Pihenő (60 mp vagy Skip) |
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
| `currentStretchIndex` | Cooldown stretch index |
| `preWorkoutHRV` | Screen 4 „eredmény” száma; screen 14 összehasonlításhoz |
| `leftSensorData`, `rightSensorData` | BLE-ből frissített objektumok |
| `leftConnected`, `rightConnected` | Párosítás állapot |

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

`characteristicvaluechanged`: UTF-8 szöveg, **vesszővel elválasztott 4 szám**:

```text
pitch, roll, bpm, hrv
```

Mind a bal, mind a jobb oldali ág **ugyanígy** parse-ol (`parseFloat`). Ha a jobb ESP csak gyrot küld, a firmware-nek valószínűleg **placeholder** BPM/HRV értékeket kell küldenie, vagy a protokollt később szét kell választani oldal szerint.

### 5.4 Kimeneti / rezgés

`buzzESP(characteristic)`:

- `TextEncoder` → `'1'` write
- 500 ms után `'0'` write

**Nincs** külön „csak bal” / „csak jobb” hívás a flow-ból — csak párosításkor fut le egyszer oldalanként. Külön rezgetéshez a két characteristic referenciát érdemes tárolni (jelenleg nincs globálisan elmentve).

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

## 7. Workout állapotgép (egyszerűsített)

```
screen7 → Start → screen8 (renderExerciseInfo)
screen8 → Start Exercise → screen9 (renderSetCountdown: 3…1)
screen9 → screen10 (renderActiveSet)
screen10 → reps done → screen11 (renderRest)
screen11 → timer vége / Skip → advanceSet()
  → ha van következő szett: screen9
  → ha gyakorlat vége: screen8 + következő gyakorlat
  → ha workout vége: screen12
screen8 Skip exercise → következő gyakorlat vagy screen12
```

**Demo jellegű részek:**

- **Repszámlálás (`renderActiveSet`):** fix `setInterval` ~1 mp-enként növeli a rep-et, nem IMU alapú.
- **Warm-up „motion detection”:** fix 3 mp `setTimeout`, utána countdown; a countdown intervalluma `1000/6` (gyorsított demo).
- **Screen 4 HRV:** fix `score = 75`, időzítés és szöveg sablon; nem `leftSensorData.hrv`.
- **Screen 14 recovery:** fix `postScore = 68`, összevetés `preWorkoutHRV`-val.
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
| BLE párosítás + notify + write buzz | Megvan |
| Élő szenzoradat a UI-ban és a workout logikában | **Nincs** (csak `left/rightSensorData` memória) |
| Bal/jobb protokoll különbség (csak gyro jobb) | **Nincs** külön ág |
| HRV / readiness / recovery számítás | **Placeholder** fix értékek |
| Rep counting / forma / symmetry | **Statikus vagy demo** szöveg |

---

## 13. Javasolt következő integrációs pontok (referencia, nem követelmény)

1. **Characteristic referenciák** tárolása (`leftWriteChar`, `rightWriteChar`) + közös `vibrateSide('left'|'right')`.
2. **UI binding:** `#leftGyroData` / `#rightGyroData` vagy dedikált workout sorok — throttle-lal frissítve.
3. **Rep / motion:** `renderActiveSet` és warm-up helyett IMU pipeline (küszöbök, aktivitás-specifikus modell).
4. **HRV:** `leftSensorData.bpm` / `hrv` bekötése screen 4 és 14 időzítőibe (és természetesen firmware egyeztetés).
5. **`selectedActivity` védelem:** presenter ugrásnál default vagy guard.

---

*Utolsó frissítés a dokumentáció szempontjából: a táblázatok és viselkedés a repo aktuális `index.html` és `script.js` alapján készült.*
