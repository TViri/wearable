 
  
  // Screen switching
  let currentScreen = 1;
  let selectedActivity = '';

  function showScreen(num){
    for(let i=1;i<=15;i++){
      document.getElementById('screen'+i).classList.remove('active');
    }
    document.getElementById('screen'+num).classList.add('active');
    currentScreen = num;
  }

  // Screen1 -> Screen2
  document.getElementById('startWorkoutBtn').addEventListener('click', ()=>{
    showScreen(2);
  });

  // Screen2: Activity selection
  document.querySelectorAll('.activity-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        selectedActivity = btn.dataset.activity;

        // Remove 'selected' class from all buttons
        document.querySelectorAll('.activity-btn').forEach(b => b.classList.remove('selected'));

        // Add 'selected' class to clicked button
        btn.classList.add('selected');

        // selection is stored in background (no popup)
        console.log('Activity selected:', selectedActivity);
    });
    });

  document.getElementById('screen2Next').addEventListener('click', ()=>{
    // Update placement text based on activity
    let placementText = 'Place sensors on ';
    if(selectedActivity === 'upper') placementText += 'upper arms.';
    else if(selectedActivity === 'lower') placementText += 'thighs.';
    else placementText += 'upper arms first. We\'ll move them later.';
    document.getElementById('placementText').innerText = placementText;

    showScreen(3);
  });

// Screen3: Sensor Setup
  document.getElementById('sensorsReadyBtn').addEventListener('click', ()=>{
    document.getElementById('pairBox').style.display = 'block';
  });

// === BLE VÁLTOZÓK ÉS ADATTÁROLÁS ===
  const bleServiceUUID = '19b10000-e8f2-537e-4f6c-d104768a1214'; 
  const bleCharacteristicUUID = '19b10001-e8f2-537e-4f6c-d104768a1214';
  
  let leftConnected = false;
  let rightConnected = false;

  // Itt tároljuk az éles adatokat külön változókban
  let leftSensorData = { pitch: 0, roll: 0, bpm: 0, hrv: 0 };
  let rightSensorData = { pitch: 0, roll: 0, bpm: 0, hrv: 0 };

  async function buzzESP(characteristic) {
    try {
        const encoder = new TextEncoder();
        // Bekapcsolás (küldünk egy '1'-est)
        await characteristic.writeValue(encoder.encode('1'));
        
        // Fél másodperc múlva kikapcsoljuk (küldünk egy '0'-ást)
        setTimeout(async () => {
            await characteristic.writeValue(encoder.encode('0'));
        }, 500);
    } catch (error) {
        console.error("Hiba a rezgetésnél:", error);
    }
  }
  async function connectSensor(buttonId, sideName) {
    const button = document.getElementById(buttonId);
    const statusDiv = document.getElementById('pairingStatus');
    const nextBtn = document.getElementById('screen3Next');

    try {
        statusDiv.style.color = '#000';
        statusDiv.innerText = `Searching for ${sideName} sensor...`;
        
        const device = await navigator.bluetooth.requestDevice({
            filters: [{ services: [bleServiceUUID] }] 
        });

        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(bleServiceUUID);
        const characteristic = await service.getCharacteristic(bleCharacteristicUUID);

        await characteristic.startNotifications();
        
        buzzESP(characteristic);

        button.innerText = `${sideName} Connected`;
        button.disabled = true;
        button.style.backgroundColor = "#4CAF50"; 
        button.style.color = "white";

        if (sideName === 'Left') leftConnected = true;
        if (sideName === 'Right') rightConnected = true;

        // Csak a státuszt írjuk ki, az éles adatokat nem jelenítjük meg itt
        statusDiv.innerHTML = `<span style="color:green">✓ ${sideName} sensor: Connected</span>`;

        if (leftConnected && rightConnected) {
            nextBtn.style.display = 'block'; 
        }

        // --- ADATFELDOLGOZÁS ---
        characteristic.addEventListener('characteristicvaluechanged', (event) => {
            const value = event.target.value;
            const decoder = new TextDecoder('utf-8');
            const dataString = decoder.decode(value); 
            
            const dataArray = dataString.split(',');
            if (dataArray.length === 4) {
                // Szétbontjuk és külön változókba mentjük
                const data = {
                    pitch: parseFloat(dataArray[0]),
                    roll: parseFloat(dataArray[1]),
                    bpm: parseFloat(dataArray[2]),
                    hrv: parseFloat(dataArray[3])
                };

                // Tárolás a megfelelő oldali változóban
                if (sideName === 'Left') {
                    leftSensorData = data;
                } else {
                    rightSensorData = data;
                }
                
                // Konzolon ellenőrizheted, hogy jönnek-e az adatok
                // console.log(`${sideName} data updated:`, data);
            }
        });

        device.addEventListener('gattserverdisconnected', () => {
            button.innerText = `Pair ${sideName} Sensor`;
            button.disabled = false;
            button.style.backgroundColor = "";
            button.style.color = "";
            
            if (sideName === 'Left') leftConnected = false;
            if (sideName === 'Right') rightConnected = false;
            
            statusDiv.innerHTML = `<span style="color:red">⚠ ${sideName} sensor disconnected.</span>`;
            nextBtn.style.display = 'none'; 
        });

    } catch (error) {
        console.error(`Error:`, error);
        statusDiv.innerHTML = `<span style="color:red">Error: ${error.message}</span>`;
    }
  }

  // A gombokhoz rendelt eseménykezelők (a displayId paramétert kivettem)
  document.getElementById('pairLeftBtn').addEventListener('click', () => {
    connectSensor('pairLeftBtn', 'Left');
  });

  document.getElementById('pairRightBtn').addEventListener('click', () => {
    connectSensor('pairRightBtn', 'Right');
  });
  // === BLE LOGIKA VÉGE ===
  
  document.getElementById('screen3Back').addEventListener('click', ()=>{ showScreen(2); });
  document.getElementById('screen3Next').addEventListener('click', ()=>{ showScreen(4); });

 
  let preWorkoutHRV = 0;

  // Screen4: HRV Measurement + Calibration
  document.getElementById('startHRVBtn').addEventListener('click', ()=>{
    document.getElementById('hrvFinger').style.display = 'block';
    document.getElementById('fingerPlaceholder').style.display = 'block';

    // Fake finger placement after 5s
    setTimeout(() => {
        // Hide finger placeholder and show countdown + wave
        document.getElementById('fingerPlaceholder').style.display = 'none';
        document.getElementById('hrvCountdown').style.display = 'block';
        document.getElementById('hrvWave').style.display = 'block';

        let count = 30;
        let interval = setInterval(() => {
            count--;
            document.getElementById('hrvCountdown').innerText = count;

            if (count <= 0) {
            clearInterval(interval);
            document.getElementById('hrvCountdown').style.display = 'none';
            document.getElementById('hrvWave').style.display = 'none';

            // === START: Readiness score thresholds ===
            let score = 75; // Replace with actual sensor data later
            preWorkoutHRV = score;
            let message = '';

            if (score >= 80) {
                message = "High readiness. Your body is well recovered. Go for heavier loads with confidence.";
                
            } else if (score >= 60) {
                message = "Moderate readiness. Focus on technique today. Your body is recovering. Consider lighter loads with focus on movement quality.";
            } else if (score >= 40) {
                message = "Low readiness. Consider skipping intense training today. Focus on mobility, warm-up, and recovery.";
            } else {
                message = "Very low readiness. Prioritize rest, sleep, or very light activity; high injury risk if training hard.";
            }
            // === END: Readiness score thresholds ===

            // Show readiness result
            document.getElementById('readinessResult').style.display = 'block';
            document.getElementById('readinessScore').innerText = score + ' / 100';
            document.getElementById('readinessMessage').innerText = message;

            // Show calibration box
            document.getElementById('calibrationBox').style.display = 'block';
            }
        }, 100);
    }, 5000);
  });

  // Calibration
  document.getElementById('startCalibrationBtn').addEventListener('click', ()=>{
    document.getElementById('calibrationCountdown').style.display='block';
    let count = 3;
    document.getElementById('calibrationCountdown').innerText = count;
    document.getElementById('calibrationText').innerText='Stand with feet hip-width apart';
    let countdownInterval = setInterval(()=>{
      count--;
      if(count>0) document.getElementById('calibrationCountdown').innerText = count;
      else{
        clearInterval(countdownInterval);
        document.getElementById('calibrationCountdown').style.display='none';
        document.getElementById('calibrationText').innerText='Stand still...';
        // start fake loading
        let loading = 0;
        let loadingEl = document.getElementById('calibrationLoading');
        loadingEl.style.display='block';
        let loadInterval = setInterval(()=>{
          loading += 2;
          loadingEl.innerText = loading+'%';
          if(loading>=100){
            clearInterval(loadInterval);
            loadingEl.style.display='none';
            document.getElementById('calibrationText').style.display='none';
            document.getElementById('calibrationComplete').style.display='block';
            document.getElementById('startWarmupBtn').style.display='block';
          }
        },100);
      }
    },1000);
  });

  document.getElementById('startWarmupBtn').addEventListener('click', ()=>{ 
    currentWarmup = 0;
    showScreen(5); 
    updateWarmupScreen(currentWarmup);
});

  const warmupExercises = [
  {name: "Arm Circles", instruction:"Big circles forward, then backward", duration:30},
  {name: "Torso Twists", instruction:"Rotate torso side to side", duration:30},
  {name: "Bodyweight Squat", instruction:"Sit hips back, chest up, stand", duration:45},
  {name: "Walking Lunges", instruction:"Step forward, bend knees, alternate", duration:45},
  {name: "Jumping Jacks", instruction:"Jump feet out, arms overhead", duration:45}
];

let currentWarmup = 0;
const remainingDiv = document.getElementById('remainingExercises');

// generate exercise tiles
warmupExercises.forEach((ex,i)=>{
  const tile = document.createElement('div');
  tile.className = 'exercise-tile';
  tile.id = 'tile'+i;
  tile.innerHTML = `<div class="circle">${i+1}</div><div>${ex.name}</div><div>${ex.duration}s</div>`;
  remainingDiv.appendChild(tile);
});

// update screen for current exercise
function updateWarmupScreen(exIndex){
  const ex = warmupExercises[exIndex];
  document.getElementById('exerciseName').innerText = ex.name;
  document.getElementById('exerciseInstruction').innerText = ex.instruction;
  document.getElementById('exerciseAnimation').innerText = "Animation placeholder: how to do it";

  const percent = Math.round((exIndex)/warmupExercises.length*100);
  document.getElementById('warmupProgressBar').style.width = percent+'%';
  document.getElementById('warmupProgressText').innerText = `${exIndex} of 5 complete (${percent}%)`;

  warmupExercises.forEach((_,i)=>{
    const t = document.getElementById('tile'+i);
    t.classList.remove('active','completed');
    if(i<exIndex) t.classList.add('completed');
    if(i===exIndex) t.classList.add('active');
  });

  document.getElementById('waitingMotion').style.display='block';
  document.getElementById('exerciseCountdown').style.display='none';

  // fake motion detection (3s)
  setTimeout(()=>{
    document.getElementById('waitingMotion').style.display='none';
    document.getElementById('exerciseCountdown').style.display='block';

    let count = ex.duration;
    const interval = setInterval(()=>{
      count--;
      document.getElementById('exerciseCountdown').innerText = count;
      if(count<=0){
        clearInterval(interval);
        currentWarmup++;
        if(currentWarmup < warmupExercises.length){
          updateWarmupScreen(currentWarmup);
        }else{
          showScreen(6);
        }
      }
    },1000/6); // speed-up demo
  },3000);
}

// start workout button
document.getElementById('startWorkoutBtn2').addEventListener('click',()=>{
  showScreen(7);
  renderWorkoutOverview(selectedActivity);
});


const workouts = {
  'full': {
    name: 'Full Body Strength',
    info: '40 min • 6 exercises • 18 sets',
    focus: 'Total body strength & coordination',
    description: 'This workout targets major muscle groups in both the upper and lower body, combining compound lifts for overall strength development.',
    exercises: [
      {name:'Overhead Press', muscles:'Shoulders, Traps, Triceps', sets:'3 × 10', weight:'13 kg'},
      {name:'Goblet Squat', muscles:'Quads, Glutes, Core', sets:'3 × 12', weight:'18 kg'},
      {name:'Romanian Deadlift', muscles:'Hamstrings, Glutes, Lower Back', sets:'3 × 10', weight:'20 kg'},
      {name:'Bent Over Row', muscles:'Lats, Rhomboids, Biceps', sets:'3 × 12', weight:'11 kg'},
      {name:'Walking Lunge', muscles:'Quads, Glutes, Core', sets:'3 × 10', weight:'10 kg'},
      {name:'Plank to Shoulder Tap', muscles:'Core, Shoulders', sets:'3 × 30 sec', weight:'Bodyweight'}
    ]
  },
  'lower': {
    name: 'Lower Body Strength',
    info: '35 min • 6 exercises • 18 sets',
    focus: 'Legs & Glutes',
    description: 'This workout targets your lower body with compound movements for strength and muscle development.',
    exercises: [
      {name:'Goblet Squat', muscles:'Quads, Glutes, Core', sets:'3 × 12', weight:'18 kg'},
      {name:'Romanian Deadlift', muscles:'Hamstrings, Glutes, Lower Back', sets:'3 × 10', weight:'20 kg'},
      {name:'Split Squat', muscles:'Quads, Glutes, Core', sets:'3 × 10', weight:'10 kg'},
      {name:'Leg Press', muscles:'Quads, Glutes', sets:'3 × 12', weight:'45 kg'},
      {name:'Hamstring Curl', muscles:'Hamstrings', sets:'3 × 12', weight:'14 kg'},
      {name:'Calf Raise', muscles:'Calves', sets:'3 × 15', weight:'Bodyweight'}
    ]
  },
  'upper': {
    name: 'Upper Body Strength',
    info: '35 min • 6 exercises • 18 sets',
    focus: 'Upper body power & posture',
    description: 'This workout develops shoulder, chest, back, and arm strength with compound and accessory movements for functional upper body performance.',
    exercises: [
      {name:'Overhead Press', muscles:'Shoulders, Traps, Triceps', sets:'3 × 10', weight:'13 kg'},
      {name:'Bench Press', muscles:'Chest, Shoulders, Triceps', sets:'3 × 10', weight:'22 kg'},
      {name:'Pull-Up', muscles:'Lats, Biceps, Upper Back', sets:'3 × 8', weight:'Bodyweight'},
      {name:'Dumbbell Row', muscles:'Lats, Rhomboids, Biceps', sets:'3 × 12', weight:'9 kg'},
      {name:'Lateral Raise', muscles:'Shoulders', sets:'3 × 12', weight:'4 kg'},
      {name:'Face Pull', muscles:'Rear Delts, Upper Back', sets:'3 × 12', weight:'6 kg'}
    ]
  }
};

// render workout overview based on activity
function renderWorkoutOverview(activity){
  const w = workouts[activity];
  document.getElementById('workoutName').innerText = w.name;
  document.getElementById('workoutInfo').innerText = w.info;
  document.getElementById('focusArea').innerText = w.focus;
  document.getElementById('focusDescription').innerText = w.description;

  const listDiv = document.getElementById('exerciseList');
  listDiv.innerHTML = ''; // clear old content
  w.exercises.forEach((ex,i)=>{
    const card = document.createElement('div');
    card.className = 'exercise-card';
    card.innerHTML = `
      <div class="number">${i+1}</div>
      <div class="exercise-info">
        <div>${ex.name}</div>
        <div>${ex.muscles}</div>
      </div>
      <div class="exercise-sets">${ex.sets} / ${ex.weight}</div>
    `;
    listDiv.appendChild(card);
  });
}


//screen 8
// Screen 7 → Screen 8: Start Workout
document.getElementById('startWorkoutOverviewBtn').addEventListener('click', () => {
  currentExerciseIndex = 0;
  currentSetIndex = 0;
  showScreen(8);
  renderExerciseInfo();
});

let currentExerciseIndex = 0;
let currentSetIndex = 0;

function renderExerciseInfo() {
  const w = workouts[selectedActivity];
  const ex = w.exercises[currentExerciseIndex];

  // Parse sets and reps from e.g. "3 × 10"
  const [totalSets, reps] = ex.sets.split(' × ');

  // Header
  document.getElementById('workoutType').innerText = w.name;

  // Progress bar & counters
  const totalExercises = w.exercises.length;
  const progressPercent = (currentExerciseIndex / totalExercises) * 100;
  document.getElementById('workoutProgressBar').style.width = progressPercent + '%';

  // Update all instances of these IDs across screens 8/9/10/11
  document.querySelectorAll('#exerciseCounter').forEach(el => {
    el.innerText = `Exercise ${currentExerciseIndex + 1} of ${totalExercises}`;
  });
  document.querySelectorAll('#setCounter').forEach(el => {
    el.innerText = `Set ${currentSetIndex + 1} of ${totalSets}`;
  });

  // Exercise card
  document.querySelector('#screen8 #exerciseName').innerText = ex.name;

  // Muscle tags
  const muscleTagsDiv = document.getElementById('targetMuscles');
  muscleTagsDiv.innerHTML = '';
  ex.muscles.split(', ').forEach(muscle => {
    const tag = document.createElement('span');
    tag.className = 'muscle-tag';
    tag.innerText = muscle;
    muscleTagsDiv.appendChild(tag);
  });

  // Info cards (sets / reps / weight)
  const infoCards = document.querySelectorAll('#screen8 .exercise-info-cards .info-card');
  infoCards[0].innerHTML = `<div class="big-number">${totalSets}</div><div>Sets</div>`;
  infoCards[1].innerHTML = `<div class="big-number">${reps}</div><div>Reps</div>`;
  infoCards[2].innerHTML = `<div class="big-number">${ex.weight}</div><div>Weight</div>`;
}

// Skip Exercise button
document.getElementById('skipExerciseBtn').addEventListener('click', () => {
  currentExerciseIndex++;
  const w = workouts[selectedActivity];
  if (currentExerciseIndex >= w.exercises.length) {
    showScreen(12); // end of workout → cooldown
  } else {
    currentSetIndex = 0;
    showScreen(8);
    renderExerciseInfo();
  }
});

// Start Exercise button → Screen 9
document.getElementById('startExerciseBtn').addEventListener('click', () => {
  showScreen(9);
  renderSetCountdown();
});

function renderSetCountdown() {
  const w = workouts[selectedActivity];
  const ex = w.exercises[currentExerciseIndex];
  const [totalSets, reps] = ex.sets.split(' × ');

  // Header
  document.querySelectorAll('#screen9 #workoutType').forEach(el => el.innerText = w.name);

  // Progress
  const totalExercises = w.exercises.length;
  const progressPercent = (currentExerciseIndex / totalExercises) * 100;
  document.querySelectorAll('#screen9 #workoutProgressBar').forEach(el => el.style.width = progressPercent + '%');
  document.querySelectorAll('#screen9 #exerciseCounter').forEach(el => el.innerText = `Exercise ${currentExerciseIndex + 1} of ${totalExercises}`);
  document.querySelectorAll('#screen9 #setCounter').forEach(el => el.innerText = `Set ${currentSetIndex + 1} of ${totalSets}`);

  // Set title and info
  document.getElementById('setCountdownTitle').innerText = `Set ${currentSetIndex + 1}`;
  document.getElementById('setCountdownInfo').innerText = `${reps} reps • ${ex.weight}`;

  // Countdown
  const countdownEl = document.getElementById('setCountdown');
  countdownEl.style.display = 'block';
  let count = 3;
  countdownEl.innerText = count;

  const interval = setInterval(() => {
    count--;
    if (count > 0) {
      countdownEl.innerText = count;
    } else {
      clearInterval(interval);
      renderActiveSet();
    }
  }, 1000);
}

function renderActiveSet() {
  const w = workouts[selectedActivity];
  const ex = w.exercises[currentExerciseIndex];
  const [totalSets, reps] = ex.sets.split(' × ');
  const totalReps = parseInt(reps);

  // Header
  document.querySelectorAll('#screen10 #workoutType').forEach(el => el.innerText = w.name);

  // Progress
  const totalExercises = w.exercises.length;
  const progressPercent = (currentExerciseIndex / totalExercises) * 100;
  document.querySelectorAll('#screen10 #workoutProgressBar').forEach(el => el.style.width = progressPercent + '%');
  document.querySelectorAll('#screen10 #exerciseCounter').forEach(el => el.innerText = `Exercise ${currentExerciseIndex + 1} of ${totalExercises}`);
  document.querySelectorAll('#screen10 #setCounter').forEach(el => el.innerText = `Set ${currentSetIndex + 1} of ${totalSets}`);

  // Exercise name & rep target
  document.getElementById('activeExerciseName').innerText = ex.name;
  document.getElementById('repTotal').innerText = totalReps;

  // Rep counter
  let currentRep = 0;
  document.getElementById('repCount').innerText = 0;

  showScreen(10);

  const repInterval = setInterval(() => {
    currentRep++;
    document.getElementById('repCount').innerText = currentRep;

    if (currentRep >= totalReps) {
      clearInterval(repInterval);
      setTimeout(() => {
        renderRest();
      }, 800);
    }
  }, 1000); // 1 rep per second for demo
}

function renderRest() {
  const w = workouts[selectedActivity];
  const ex = w.exercises[currentExerciseIndex];
  const [totalSets] = ex.sets.split(' × ');

  // Header
  document.querySelectorAll('#screen11 #workoutType').forEach(el => el.innerText = w.name);

  // Progress
  const totalExercises = w.exercises.length;
  const progressPercent = (currentExerciseIndex / totalExercises) * 100;
  document.querySelectorAll('#screen11 #workoutProgressBar').forEach(el => el.style.width = progressPercent + '%');
  document.querySelectorAll('#screen11 #exerciseCounter').forEach(el => el.innerText = `Exercise ${currentExerciseIndex + 1} of ${totalExercises}`);
  document.querySelectorAll('#screen11 #setCounter').forEach(el => el.innerText = `Set ${currentSetIndex + 1} of ${totalSets}`);

  showScreen(11);

  // Rest countdown
  let restTime = 60;
  const restEl = document.getElementById('restCountdown');
  restEl.innerText = restTime;

  const restInterval = setInterval(() => {
    restTime--;
    restEl.innerText = restTime;
    if (restTime <= 0) {
      clearInterval(restInterval);
      advanceSet();
    }
  }, 1000);

  // Skip rest button
  document.getElementById('skipRestBtn').onclick = () => {
    clearInterval(restInterval);
    advanceSet();
  };
}

function advanceSet() {
  const w = workouts[selectedActivity];
  const ex = w.exercises[currentExerciseIndex];
  const [totalSets] = ex.sets.split(' × ');

  currentSetIndex++;

  if (currentSetIndex >= parseInt(totalSets)) {
    // All sets done → next exercise
    currentSetIndex = 0;
    currentExerciseIndex++;

    if (currentExerciseIndex >= w.exercises.length) {
      showScreen(12); // cooldown
    } else {
      showScreen(8);
      renderExerciseInfo();
    }
  } else {
    // Next set → back to countdown
    showScreen(9);
    renderSetCountdown();
  }
}

const stretches = {
  'full': [
    { name: 'Standing Quad Stretch',       instruction: 'Pull heel toward glutes' },
    { name: 'Hamstring Stretch',           instruction: 'Hinge forward, keep legs straight' },
    { name: 'Hip Flexor Stretch',          instruction: 'Push hips forward in lunge' },
    { name: 'Chest Opener',                instruction: 'Clasp hands, open chest forward' },
    { name: 'Cross-body Shoulder Stretch', instruction: 'Pull arm across chest gently' },
    { name: 'Lat Stretch',                 instruction: 'Reach up, lean to side' }
  ],
  'lower': [
    { name: 'Standing Quad Stretch', instruction: 'Pull heel toward glutes' },
    { name: 'Hamstring Stretch',     instruction: 'Hinge forward, keep legs straight' },
    { name: 'Figure 4 Stretch',      instruction: 'Cross ankle over knee, sit' },
    { name: 'Hip Flexor Stretch',    instruction: 'Push hips forward in lunge' },
    { name: 'Calf Stretch',          instruction: 'Press heel down, lean forward' }
  ],
  'upper': [
    { name: 'Chest Opener',                instruction: 'Clasp hands, open chest forward' },
    { name: 'Cross-body Shoulder Stretch', instruction: 'Pull arm across chest gently' },
    { name: 'Overhead Triceps Stretch',    instruction: 'Pull elbow behind head down' },
    { name: 'Lat Stretch',                 instruction: 'Reach up, lean to side' },
    { name: 'Neck Stretch',               instruction: 'Tilt head, hold gently down' }
  ]
};

// =====================
// SCREEN 12: Workout Complete
// =====================
const originalShowScreen = showScreen;
window.showScreen = function(num) {
  originalShowScreen(num);
  if (num === 12) {
    let count = 3;
    const countdownEl = document.getElementById('cooldownCountdown');
    countdownEl.innerText = count;

    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        countdownEl.innerText = count;
      } else {
        clearInterval(interval);
        startCooldown();
      }
    }, 1000);
  }
}


// =====================
// SCREEN 13: Cooldown Stretches
// =====================
let currentStretchIndex = 0;
let stretchCountdownInterval = null;
let stretchStartTimeout = null;

function startCooldown() {
  currentStretchIndex = 0;
  const stretchList = stretches[selectedActivity];

  // Clear and build stretch tiles
  const remainingDiv = document.getElementById('remainingStretches');
  remainingDiv.innerHTML = '';
  stretchList.forEach((s, i) => {
    const tile = document.createElement('div');
    tile.className = 'stretch-tile';
    tile.id = 'stretchTile' + i;
    tile.innerHTML = `<div>${i + 1}</div><div>${s.name}</div>`;
    remainingDiv.appendChild(tile);
  });

  showScreen(13);
  updateStretchScreen(currentStretchIndex);
}

function updateStretchScreen(index) {
  const stretchList = stretches[selectedActivity];
  const stretch = stretchList[index];
  const total = stretchList.length;

  // Content
  document.getElementById('stretchName').innerText = stretch.name;
  document.getElementById('stretchInstruction').innerText = stretch.instruction;

  // Progress
  const percent = Math.round((index / total) * 100);
  document.getElementById('cooldownProgressBar').style.width = percent + '%';
  document.getElementById('cooldownProgressText').innerText = `${index} of ${total} complete (${percent}%)`;

  // Tiles
  stretchList.forEach((_, i) => {
    const t = document.getElementById('stretchTile' + i);
    t.classList.remove('active', 'completed');
    if (i < index) t.classList.add('completed');
    if (i === index) t.classList.add('active');
  });

  // Reset countdown UI — show 30 but don't start yet
  document.getElementById('stretchCountdown').style.display = 'block';
  document.getElementById('stretchCountdown').innerText = 30;

  // Clear any existing timers
  clearTimeout(stretchStartTimeout);
  if (stretchCountdownInterval) clearInterval(stretchCountdownInterval);

  // Skip button — works even during the 2s delay
  document.getElementById('skipStretchBtn').onclick = () => {
    clearTimeout(stretchStartTimeout);
    if (stretchCountdownInterval) clearInterval(stretchCountdownInterval);
    completeStretch(index);
  };

  // 1 second delay before countdown starts
  stretchStartTimeout = setTimeout(() => {
    let count = 30;
    stretchCountdownInterval = setInterval(() => {
      count--;
      document.getElementById('stretchCountdown').innerText = count;
      if (count <= 0) {
        clearInterval(stretchCountdownInterval);
        completeStretch(index);
      }
    }, 1000);
  }, 1000);
}

function completeStretch(index) {
  const stretchList = stretches[selectedActivity];

  // Mark tile green
  const tile = document.getElementById('stretchTile' + index);
  tile.classList.remove('active');
  tile.classList.add('completed');

  // Update progress to reflect this one done
  const total = stretchList.length;
  const percent = Math.round(((index + 1) / total) * 100);
  document.getElementById('cooldownProgressBar').style.width = percent + '%';
  document.getElementById('cooldownProgressText').innerText = `${index + 1} of ${total} complete (${percent}%)`;

  currentStretchIndex++;

  if (currentStretchIndex >= stretchList.length) {
    showScreen(14);
  } else {
    updateStretchScreen(currentStretchIndex);
  }
}
// =====================
// SCREEN 14: Recovery Check
// =====================
document.getElementById('startPostHRVBtn').addEventListener('click', () => {
  const fingerEl = document.getElementById('postHrvFinger');
  const placeholderEl = document.getElementById('postFingerPlaceholder');
  const countdownEl = document.getElementById('postHrvCountdown');
  const waveEl = document.getElementById('postHrvWave');
  const resultEl = document.getElementById('recoveryResult');
  const scoreEl = document.getElementById('recoveryScore');
  const messageEl = document.getElementById('recoveryMessage');
  const changeEl = document.getElementById('recoveryChange');
  const summaryBtn = document.getElementById('viewSummaryBtn');

  // Hide button
  document.getElementById('startPostHRVBtn').style.display = 'none';

  // Show finger placement
  fingerEl.style.display = 'block';
  placeholderEl.style.display = 'block';
  countdownEl.style.display = 'none';
  waveEl.style.display = 'none';
  resultEl.style.display = 'none';
  summaryBtn.style.display = 'none';

  // After 5s simulate finger placed
  setTimeout(() => {
    placeholderEl.style.display = 'none';
    countdownEl.style.display = 'block';
    waveEl.style.display = 'block';

    let count = 30;
    countdownEl.innerText = count;

    const interval = setInterval(() => {
      count--;
      countdownEl.innerText = count;

      if (count <= 0) {
        clearInterval(interval);

        // Hide measurement UI
        countdownEl.style.display = 'none';
        waveEl.style.display = 'none';
        fingerEl.style.display = 'none';

        // Calculate results
        const postScore = 68; // replace with real sensor data later
        const delta = preWorkoutHRV - postScore;

        let message = '';
        if (delta < 5) {
          message = "Your body tolerated this session well. Continue regular training with normal intensity over the next few days.";
        } else if (delta < 15) {
          message = "Moderate training strain detected. Prioritize hydration, light mobility, and quality sleep in the next 1–2 days. Avoid maximal lifts.";
        } else if (delta < 25) {
          message = "High strain detected. Include active recovery (mobility, stretching, light cardio), ensure proper sleep and nutrition over the next 2–3 days. Reduce training intensity.";
        } else {
          message = "Very high strain detected. Focus on full recovery: rest or very light activity, sleep well, and monitor soreness. Resume intense training in 3+ days.";
        }

        // Show results
        scoreEl.innerText = postScore + ' / 100';
        messageEl.innerText = message;
        if (delta > 20) {
          changeEl.innerText = 'HRV: ' + preWorkoutHRV + ' → ' + postScore + ' (significant drop — prioritize recovery)';
        } else {
          changeEl.innerText = 'HRV: ' + preWorkoutHRV + ' → ' + postScore + ' (normal post-workout drop)';
        }
        resultEl.style.display = 'block';
        summaryBtn.style.display = 'block';
      }
    }, 100);
  }, 5000);
});

document.getElementById('viewSummaryBtn').addEventListener('click', () => {
  showScreen(15); 
});



















//Presenter toggle

const presenterToggle = document.getElementById('presenterToggle');
const presenterPanel = document.getElementById('presenterPanel');

presenterToggle.addEventListener('click', () => {
  if (presenterPanel.style.display === 'block') {
    presenterPanel.style.display = 'none';
  } else {
    presenterPanel.style.display = 'block';
  }
});

document.addEventListener('click', (e) => {
  const menu = document.getElementById('presenterMenu');

  // if click is outside the menu → close it
  if (!menu.contains(e.target)) {
    presenterPanel.style.display = 'none';
  }
});

