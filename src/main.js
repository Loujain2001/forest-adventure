
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import {
  startGame, setGameRunning, getExerciseState,
  pauseGame, resumeGame,
  jumpCharacter, collectStar, activateShield, blowWind
} from './game.js';

const el = id => document.getElementById(id);
const video = el('webcam');
const startButton = el('startButton');
const calibrateButton = el('calibrateButton');
const status = el('status');
const feedbackBox = el('movementResult');
const pauseButton = el('pauseButton');
const pauseOverlay = el('pauseOverlay');
const pauseTitle = el('pauseTitle');
const pauseDescription = el('pauseDescription');
const resumeButton = el('resumeButton');

const wizard = el('calibrationWizard');
const wizardStep = el('calibrationStep');
const wizardTitle = el('calibrationTitle');
const wizardIcon = el('calibrationIcon');
const wizardInstruction = el('calibrationInstruction');
const wizardFill = el('calibrationProgressFill');
const wizardTimer = el('calibrationTimer');
const wizardPhase = el('calibrationPhase');
const wizardNote = el('calibrationNote');
const retryButton = el('calibrationRetry');
const gentleButton = el('calibrationGentle');
const cancelButton = el('calibrationCancel');
const calibrationSummary = el('calibrationSummary');

startGame(el('gameCanvas'));

const PREP_MS = 3000;
const MEASURE_MS = 2400;
const DONE_MS = 850;

// A short change in pose or momentary camera loss must not trap mobile users.
const TRACKING_GRACE_MS = 1800;
const VIDEO_STALL_MS = 1000;
const AUTO_RESUME_STABLE_MS = 450;
const RESUME_BLOCK_MS = 650;

const SMOOTHING = 0.42;
const GESTURE_ON_MS = 150;
const GESTURE_OFF_MS = 140;
const EYE_HOLD_MS = 600;
const GENTLE_EYE_HOLD_MS = 850;
const ACTION_COOLDOWN_MS = 500;

const STEPS = [
  {
    type: 'neutral',
    icon: '😌',
    title: 'Relax your face',
    instruction: 'Look straight at the camera with a relaxed face.'
  },
  {
    type: 'smile',
    icon: '😊',
    title: 'Smile',
    instruction: 'Smile comfortably. You do not need to force it.'
  },
  {
    type: 'eyebrow',
    icon: '🤨',
    title: 'Raise your eyebrows',
    instruction: 'Gently lift your eyebrows.'
  },
  {
    type: 'eyes',
    icon: '😌',
    title: 'Close your eyes',
    instruction: 'Close your eyes gently, without squeezing.'
  },
  {
    type: 'lips',
    icon: '😘',
    title: 'Make a kiss face',
    instruction: 'Gently purse your lips as if giving a kiss.'
  }
];

let landmarker = null;
let lastVideoTime = -1;
let lastVideoFrameAt = 0;
let trackingRecoveredAt = null;

let latest = null;
let filtered = null;
let profile = null;
let calibration = null;

let faceVisible = false;
let faceAligned = false;
let lastFaceSeenAt = 0;

let lastAcceptedAt = -Infinity;
let blockInputUntil = 0;

let feedback = '';
let feedbackUntil = 0;

let activeExerciseKey = '';
let eyesSince = null;
let eyesUsed = false;
let eyesOpenFirst = false;

const movementStates = {
  smile: {
    active: false,
    onSince: null,
    offSince: null
  },
  eyebrow: {
    active: false,
    onSince: null,
    offSince: null
  },
  lips: {
    active: false,
    onSince: null,
    offSince: null
  }
};


// 1. Reset gestures
function resetGestures() {
  for (const state of Object.values(movementStates)) {
    state.active = false;
    state.onSince = null;
    state.offSince = null;
  }

  eyesSince = null;
  eyesUsed = false;
  eyesOpenFirst = false;
  activeExerciseKey = '';
}


// 2. Display movement feedback
function notify(message) {
  feedback = message;
  feedbackUntil = performance.now() + 1200;
}


// 3. Smooth facial tracking values
// Always use raw values for calibration.
function smoothSample(raw) {
  if (!filtered) {
    filtered = { ...raw };
  } else {
    for (const field of Object.keys(raw)) {
      filtered[field] +=
        (raw[field] - filtered[field]) * SMOOTHING;
    }
  }

  return filtered;
}


// 4. Detect a stable facial movement
function risingGesture(type, detected, now) {
  const state = movementStates[type];

  if (detected) {
    state.offSince = null;

    if (state.onSince === null) {
      state.onSince = now;
    }

    if (
      !state.active &&
      now - state.onSince >= GESTURE_ON_MS
    ) {
      state.active = true;
      return true;
    }

  } else {
    state.onSince = null;

    if (state.active) {
      if (state.offSince === null) {
        state.offSince = now;
      }

      if (
        now - state.offSince >=
        GESTURE_OFF_MS
      ) {
        state.active = false;
        state.offSince = null;
      }

    } else {
      state.offSince = null;
    }
  }

  return false;
}


// 5. Update pause interface
function updatePauseUI() {
  const state = getExerciseState();

  const inGame =
    Boolean(profile) &&
    !calibration &&
    state.phase !== 'intro' &&
    !state.levelComplete;

  pauseButton.hidden = !inGame;

  pauseButton.disabled =
    !inGame ||
    state.paused ||
    !faceVisible;

  pauseOverlay.hidden = !state.paused;

  if (state.paused) {
    const trackingPause =
      state.pauseReason === 'tracking';

    pauseTitle.textContent = trackingPause
      ? 'Camera Paused'
      : 'Adventure Paused';

    pauseDescription.textContent = trackingPause
      ? (
          faceVisible
            ? 'Face detected! The adventure will continue automatically.'
            : 'Move back into camera view. The adventure will continue automatically.'
        )
      : (
          faceVisible
            ? 'Take your time. Continue when you feel ready.'
            : 'Look at the camera again, then press Continue.'
        );

    // Only manual/background pauses need the Continue button.
    resumeButton.hidden = trackingPause;

    resumeButton.disabled =
      !faceVisible ||
      !faceAligned ||
      !profile ||
      Boolean(calibration);

  } else {
    resumeButton.hidden = false;
  }
}


// 6. Manual pause
function manualPause() {
  if (!profile || calibration) return;

  if (pauseGame('manual')) {
    resetGestures();

    feedbackBox.textContent =
      'Adventure paused. Take a break.';
  }

  updatePauseUI();
}


// 7. Manual resume
function manualResume() {
  if (
    !faceVisible ||
    !faceAligned ||
    !profile ||
    calibration
  ) {
    return;
  }

  if (resumeGame()) {
    resetGestures();

    filtered = null;

    blockInputUntil =
      performance.now() + RESUME_BLOCK_MS;

    feedbackBox.textContent =
      'Welcome back! Watch the next challenge.';
  }

  updatePauseUI();
}

pauseButton.addEventListener(
  'click',
  manualPause
);

resumeButton.addEventListener(
  'click',
  manualResume
);


// 8. Handle temporary face loss
// Stop game time while tracking is unavailable.
// Automatic pause only happens after a grace period.
function handleTrackingLoss(now) {
  const justLostFace = faceVisible;

  faceVisible = false;
  faceAligned = false;

  latest = null;
  filtered = null;
  trackingRecoveredAt = null;

  calibrateButton.disabled = true;

  if (justLostFace) {
    resetGestures();

    blockInputUntil =
      now + RESUME_BLOCK_MS;
  }

  setGameRunning(false);

  if (
    profile &&
    !calibration &&
    now - lastFaceSeenAt >= TRACKING_GRACE_MS
  ) {
    pauseGame('tracking');
  }

  if (
    calibration &&
    calibration.mode !== 'review' &&
    !calibration.awaitingFace
  ) {
    calibration.mode = 'prep';
    calibration.startedAt = now;
    calibration.samples = [];
    calibration.awaitingFace = true;

    displayCalibration();
  }

  if (!calibration) {
    feedbackBox.textContent =
      'Looking for your face. The game will continue automatically.';
  }

  updatePauseUI();
}


// 9. Recover tracking automatically
// Manual pauses are never resumed automatically.
function recoverTracking(now, wasMissing) {
  const state = getExerciseState();

  if (wasMissing) {
    filtered = null;

    resetGestures();

    blockInputUntil =
      now + RESUME_BLOCK_MS;

    trackingRecoveredAt = now;
  }

  if (
    state.paused &&
    state.pauseReason === 'tracking'
  ) {
    if (trackingRecoveredAt === null) {
      trackingRecoveredAt = now;
    }

    if (
      now - trackingRecoveredAt >=
      AUTO_RESUME_STABLE_MS
    ) {
      if (resumeGame()) {
        resetGestures();

        filtered = null;

        blockInputUntil =
          now + RESUME_BLOCK_MS;

        feedbackBox.textContent =
          'Welcome back! Your adventure continues.';
      }

      trackingRecoveredAt = null;
    }

  } else {
    trackingRecoveredAt = null;
  }
}


// 10. Average values
function average(samples, field) {
  return samples.reduce(
    (sum, s) => sum + s[field],
    0
  ) / samples.length;
}


// 11. Percentile
function percentile(values, fraction = 0.8) {
  const sorted = [...values].sort(
    (a, b) => a - b
  );

  return sorted[
    Math.floor(
      (sorted.length - 1) * fraction
    )
  ] ?? 0;
}


// 12. Measure facial movement range
function movementRanges(type, samples, neutral) {
  const rise = field => percentile(
    samples.map(
      s => Math.max(
        0,
        s[field] - neutral[field]
      )
    )
  );

  if (type === 'smile') {
    return Math.max(
      rise('smileLeft'),
      rise('smileRight')
    );
  }

  if (type === 'eyebrow') {
    return rise('brow');
  }

  if (type === 'lips') {
    return rise('pucker');
  }

  if (type === 'eyes') {
    return {
      left: rise('eyeLeft'),
      right: rise('eyeRight')
    };
  }

  return 0;
}


// 13. Check movement strength
function isMeasurable(type, value, noise) {
  const clear = (rise, jitter, minimum) =>
    rise >= Math.max(
      minimum,
      jitter * 2.2
    );

  if (type === 'eyes') {
    return (
      clear(
        value.left,
        noise.eyeLeft,
        0.055
      ) &&
      clear(
        value.right,
        noise.eyeRight,
        0.055
      )
    );
  }

  if (type === 'smile') {
    return clear(
      value,
      Math.max(
        noise.smileLeft,
        noise.smileRight
      ),
      0.03
    );
  }

  if (type === 'eyebrow') {
    return clear(
      value,
      noise.brow,
      0.03
    );
  }

  return clear(
    value,
    noise.pucker,
    0.03
  );
}


// 14. Create personalized calibration profile
function createProfile(cal) {
  const neutral = cal.neutral;
  const noise = cal.noise;
  const ranges = cal.ranges;

  const limit = (
    range,
    fluctuation,
    min,
    max
  ) =>
    Math.min(
      max,
      Math.max(
        min,
        range * 0.43,
        fluctuation * 2.2
      )
    );

  return {
    neutral,

    gentle: [...cal.gentle],

    thresholds: {
      smile: limit(
        ranges.smile,
        Math.max(
          noise.smileLeft,
          noise.smileRight
        ),
        0.025,
        0.30
      ),

      eyebrow: limit(
        ranges.eyebrow,
        noise.brow,
        0.03,
        0.30
      ),

      lips: limit(
        ranges.lips,
        noise.pucker,
        0.025,
        0.30
      ),

      eyeLeft: limit(
        ranges.eyes.left,
        noise.eyeLeft,
        0.05,
        0.60
      ),

      eyeRight: limit(
        ranges.eyes.right,
        noise.eyeRight,
        0.05,
        0.60
      )
    }
  };
}


// 15. Display calibration
function displayCalibration() {
  if (!calibration) return;

  const step = STEPS[calibration.step];

  const elapsed =
    performance.now() -
    calibration.startedAt;

  wizard.hidden = false;

  wizardStep.textContent =
    `Movement ${calibration.step + 1} of ${STEPS.length}`;

  wizardTitle.textContent = step.title;
  wizardIcon.textContent = step.icon;
  wizardInstruction.textContent =
    step.instruction;

  retryButton.hidden =
    calibration.mode !== 'review';

  gentleButton.hidden =
    calibration.mode !== 'review' ||
    step.type === 'neutral';

  let progress = 0;

  if (calibration.mode === 'review') {
    wizardTimer.textContent = '?';

    wizardPhase.textContent =
      'Try that movement again';

    wizardNote.textContent =
      step.type === 'neutral'
        ? 'Keep your face in the camera and tap Try Again.'
        : 'This movement was difficult to detect. Try Again, or Continue Anyway with less reliable recognition.';

  } else if (calibration.mode === 'prep') {
    wizardTimer.textContent = String(
      Math.max(
        1,
        Math.ceil(
          (PREP_MS - elapsed) / 1000
        )
      )
    );

    wizardPhase.textContent =
      'Get ready — wait for GO!';

    wizardNote.textContent =
      'When GO appears, do the movement shown above.';

    progress =
      Math.min(
        1,
        elapsed / PREP_MS
      ) * 0.35;

  } else if (calibration.mode === 'measure') {
    wizardTimer.textContent = 'GO!';

    wizardPhase.textContent =
      'Hold gently for 2 seconds';

    wizardNote.textContent =
      'Keep your face visible. Do not strain.';

    progress =
      0.35 +
      Math.min(
        1,
        elapsed / MEASURE_MS
      ) * 0.65;

  } else if (calibration.mode === 'done') {
    wizardTimer.textContent = '✓';

    wizardPhase.textContent =
      'Great! Movement saved';

    wizardNote.textContent =
      'Relax your face. The next movement is coming.';

    progress = 1;
  }

  wizardFill.style.width =
    `${(calibration.step + progress) / STEPS.length * 100}%`;
}


// 16. Begin calibration
function beginCalibration() {
  if (
    !latest ||
    !landmarker ||
    getExerciseState().paused
  ) {
    return;
  }

  setGameRunning(false);
  resetGestures();

  filtered = null;

  calibration = {
    step: 0,
    mode: 'prep',
    startedAt: performance.now(),
    samples: [],
    neutral: null,
    noise: {},
    ranges: {},
    gentle: [],
    awaitingFace: false
  };

  calibrateButton.disabled = true;
  calibrationSummary.hidden = true;

  feedbackBox.textContent =
    'Face setup started. Just follow each simple instruction.';

  displayCalibration();
}


// 17. Retry calibration step
function retryStep() {
  if (!calibration) return;

  calibration.mode = 'prep';
  calibration.startedAt = performance.now();
  calibration.samples = [];

  displayCalibration();
}


// 18. Next calibration step
function nextCalibrationStep() {
  calibration.step++;

  if (calibration.step < STEPS.length) {
    return retryStep();
  }

  profile = createProfile(calibration);

  const gentle =
    profile.gentle.length > 0;

  calibration = null;
  wizard.hidden = true;
  calibrationSummary.hidden = false;

  calibrationSummary.textContent = gentle
    ? '✓ Setup finished! Some movements could not be measured clearly; recognition may be less accurate.'
    : '✓ Face setup complete! Your game is ready.';

  calibrateButton.textContent =
    'Set Up Again';

  calibrateButton.disabled = false;

  resetGestures();

  filtered = null;

  blockInputUntil =
    performance.now() + 600;

  setGameRunning(true);
  updatePauseUI();

  feedbackBox.textContent =
    'Great! Watch the next object and enjoy your adventure!';
}


// 19. Gentle detection mode
function useGentleSetting() {
  if (
    !calibration ||
    calibration.mode !== 'review'
  ) {
    return;
  }

  const type =
    STEPS[calibration.step].type;

  calibration.gentle.push(type);

  if (
    type === 'eyes' &&
    !calibration.ranges.eyes
  ) {
    calibration.ranges.eyes = {
      left: 0,
      right: 0
    };

  } else if (!calibration.ranges[type]) {
    calibration.ranges[type] = 0;
  }

  nextCalibrationStep();
}


// 20. Process calibration
function updateCalibration(sample) {
  if (!calibration) return;

  const now = performance.now();

  const elapsed =
    now - calibration.startedAt;

  if (calibration.mode === 'review') {
    return displayCalibration();
  }

  if (calibration.mode === 'done') {
    if (elapsed >= DONE_MS) {
      nextCalibrationStep();
    } else {
      displayCalibration();
    }

    return;
  }

  if (calibration.mode === 'prep') {
    if (elapsed >= PREP_MS) {
      calibration.mode = 'measure';
      calibration.startedAt = now;
      calibration.samples = [];
    }

    displayCalibration();
    return;
  }

  calibration.samples.push(sample);

  if (elapsed < MEASURE_MS) {
    return displayCalibration();
  }

  if (calibration.samples.length < 8) {
    calibration.mode = 'review';
    return displayCalibration();
  }

  const type =
    STEPS[calibration.step].type;

  if (type === 'neutral') {
    const fields = [
      'brow',
      'smileLeft',
      'smileRight',
      'pucker',
      'eyeLeft',
      'eyeRight',
      'eyeDistance',
      'headPosition'
    ];

    calibration.neutral =
      Object.fromEntries(
        fields.map(
          field => [
            field,
            average(
              calibration.samples,
              field
            )
          ]
        )
      );

    calibration.noise =
      Object.fromEntries(
        fields.map(
          field => [
            field,
            percentile(
              calibration.samples.map(
                s => Math.abs(
                  s[field] -
                  calibration.neutral[field]
                )
              ),
              0.9
            )
          ]
        )
      );

  } else {
    const range = movementRanges(
      type,
      calibration.samples,
      calibration.neutral
    );

    calibration.ranges[type] = range;

    if (
      !isMeasurable(
        type,
        range,
        calibration.noise
      )
    ) {
      calibration.mode = 'review';
      return displayCalibration();
    }
  }

  calibration.mode = 'done';
  calibration.startedAt = now;

  displayCalibration();
}


// 21. Cancel calibration
function cancelCalibration() {
  calibration = null;

  wizard.hidden = true;
  calibrationSummary.hidden = !profile;

  calibrateButton.disabled = !latest;

  resetGestures();
  filtered = null;

  if (profile) {
    setGameRunning(true);
  }

  feedbackBox.textContent = profile
    ? 'Previous face setup restored.'
    : 'Press Set Up My Face when you are ready.';

  updatePauseUI();
}


// 22. Start camera and MediaPipe
async function startCamera() {
  startButton.disabled = true;

  status.textContent =
    'Loading facial tracking...';

  try {
    const vision =
      await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

    landmarker =
      await FaceLandmarker.createFromOptions(
        vision,
        {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
          },

          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true
        }
      );

    const stream =
      await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user'
        },
        audio: false
      });

    video.srcObject = stream;

    await video.play();

    status.textContent =
      'Camera ready. Press Set Up My Face.';

    requestAnimationFrame(detectFace);

  } catch (error) {
    startButton.disabled = false;

    status.textContent =
      `Camera error: ${error.message}`;

    console.error(error);
  }
}


// 23. Main face detection loop
function detectFace() {
  const now = performance.now();

  if (
    video.readyState >= 2 &&
    video.currentTime !== lastVideoTime
  ) {
    lastVideoTime = video.currentTime;
    lastVideoFrameAt = now;

    try {
      const result =
        landmarker.detectForVideo(
          video,
          now
        );

      // 24. Face not detected
      if (
        !result.faceLandmarks?.length ||
        !result.faceBlendshapes?.length
      ) {
        handleTrackingLoss(now);

      } else {
        // 25. Extract facial landmarks
        const landmarks =
          result.faceLandmarks[0];

        const scores = new Map(
          result.faceBlendshapes[0].categories.map(
            c => [
              c.categoryName,
              c.score
            ]
          )
        );

        const get = name =>
          scores.get(name) ?? 0;

        const left = landmarks[33];
        const right = landmarks[263];
        const nose = landmarks[1];

        const eyeDistance = Math.max(
          0.001,
          Math.hypot(
            left.x - right.x,
            left.y - right.y
          )
        );

        const raw = {
          brow: Math.max(
            get('browInnerUp'),
            get('browOuterUpLeft'),
            get('browOuterUpRight')
          ),

          smileLeft:
            get('mouthSmileLeft'),

          smileRight:
            get('mouthSmileRight'),

          pucker:
            get('mouthPucker'),

          eyeLeft:
            get('eyeBlinkLeft'),

          eyeRight:
            get('eyeBlinkRight'),

          eyeDistance,

          headPosition:
            (
              nose.y -
              (left.y + right.y) / 2
            ) / eyeDistance
        };

        // 26. Mobile position fix
        const wasMissing = !faceVisible;

        latest = raw;
        faceVisible = true;

        // Any detected face is considered aligned.
        // A change in sitting position no longer freezes the game.
        faceAligned = true;

        lastFaceSeenAt = now;

        recoverTracking(
          now,
          wasMissing
        );

        calibrateButton.disabled =
          Boolean(calibration) ||
          getExerciseState().paused;

        // 27. Update technical scores
        el('eyebrowScore').textContent =
          `Eyebrows: ${raw.brow.toFixed(2)}`;

        el('eyeScore').textContent =
          `Eyes: ${raw.eyeLeft.toFixed(2)} / ${raw.eyeRight.toFixed(2)}`;

        el('smileScore').textContent =
          `Smile: ${Math.max(raw.smileLeft, raw.smileRight).toFixed(2)}`;

        el('puckerScore').textContent =
          `Lips: ${raw.pucker.toFixed(2)}`;

        // 28. Calibration in progress
        if (calibration) {
          setGameRunning(false);

          if (calibration.awaitingFace) {
            calibration.awaitingFace = false;
            retryStep();
          }

          updateCalibration(raw);

          feedbackBox.textContent =
            'Follow the instruction above.';

        // 29. No calibration profile
        } else if (!profile) {
          resetGestures();

          feedbackBox.textContent =
            'Press Set Up My Face to begin your adventure.';

        // 30. Normal gameplay
        } else {
          const sample =
            smoothSample(raw);

          const neutral =
            profile.neutral;

          const limit =
            profile.thresholds;

          const delta = field =>
            Math.max(
              0,
              sample[field] -
              neutral[field]
            );

          const smileChange = Math.max(
            delta('smileLeft'),
            delta('smileRight')
          );

          const browChange =
            delta('brow');

          const lipsChange =
            delta('pucker');

          const eyeLeftChange =
            delta('eyeLeft');

          const eyeRightChange =
            delta('eyeRight');

          const smileStrength =
            smileChange / limit.smile;

          const lipsStrength =
            lipsChange / limit.lips;

          // 31. Eye closure recognition
          // Normal mode: both eyes.
          // Gentle mode: either eye, held longer.
          const gentleEyes =
            profile.gentle.includes('eyes');

          const eyesClosed = gentleEyes
            ? (
                eyeLeftChange >= limit.eyeLeft ||
                eyeRightChange >= limit.eyeRight
              )
            : (
                eyeLeftChange >= limit.eyeLeft &&
                eyeRightChange >= limit.eyeRight
              );

          // 32. Smile recognition
          const validSmile =
            faceAligned &&
            !eyesClosed &&
            smileStrength >= 1 &&
            (
              lipsStrength < 1 ||
              smileStrength >=
              lipsStrength * 1.2
            );

          // 33. Lips recognition
          const validLips =
            faceAligned &&
            !eyesClosed &&
            lipsStrength >= 1 &&
            (
              smileStrength < 1 ||
              lipsStrength >=
              smileStrength * 1.2
            );

          // 34. Eyebrow recognition
          const validBrow =
            faceAligned &&
            !eyesClosed &&
            !validSmile &&
            !validLips &&
            browChange >=
            limit.eyebrow;

          // 35. Keep game running when face is visible
          const state =
            getExerciseState();

          if (
            !state.levelComplete &&
            !state.paused
          ) {
            setGameRunning(true);
          }

          const current =
            getExerciseState();

          const key =
            `${current.level}:${current.completed}:${current.type}`;

          if (activeExerciseKey !== key) {
            activeExerciseKey = key;

            eyesSince = null;
            eyesUsed = false;
            eyesOpenFirst = false;
          }

          // 36. Track movement states
          const canTrack =
            faceAligned &&
            !current.paused &&
            !current.levelComplete;

          if (!canTrack) {
            resetGestures();

          } else {
            const smileRise =
              risingGesture(
                'smile',
                validSmile,
                now
              );

            const browRise =
              risingGesture(
                'eyebrow',
                validBrow,
                now
              );

            const lipsRise =
              risingGesture(
                'lips',
                validLips,
                now
              );

            // 37. Prevent accidental repeated actions
            const accept = (fn, text) => {
              if (
                now - lastAcceptedAt <
                ACTION_COOLDOWN_MS
              ) {
                return;
              }

              if (fn()) {
                lastAcceptedAt = now;
                notify(text);
              }
            };

            // 38. Smile, eyebrows and lips actions
            if (
              current.ready &&
              now >= blockInputUntil
            ) {
              if (
                current.type === 'smile' &&
                smileRise
              ) {
                accept(
                  collectStar,
                  'Great smile! You brought the forest light back!'
                );

              } else if (
                current.type === 'eyebrow' &&
                browRise
              ) {
                accept(
                  jumpCharacter,
                  'Great eyebrow raise! The fox jumped!'
                );

              } else if (
                current.type === 'lips' &&
                lipsRise
              ) {
                accept(
                  blowWind,
                  'Wonderful! The magic wind cleared the path.'
                );
              }
            }

            // 39. Eye exercise
            if (
              current.ready &&
              current.type === 'eyes'
            ) {
              if (
                now < blockInputUntil
              ) {
                eyesSince = null;
                eyesOpenFirst = false;

              } else if (!eyesClosed) {
                eyesOpenFirst = true;
                eyesSince = null;
                eyesUsed = false;

              } else if (
                eyesOpenFirst &&
                !eyesUsed
              ) {
                if (eyesSince === null) {
                  eyesSince = now;
                }

                const hold = gentleEyes
                  ? GENTLE_EYE_HOLD_MS
                  : EYE_HOLD_MS;

                if (
                  now - eyesSince >= hold &&
                  now >= blockInputUntil
                ) {
                  accept(
                    activateShield,
                    'Shield activated! Great eye movement.'
                  );

                  eyesUsed = true;
                }
              }

            } else {
              eyesSince = null;
            }
          }

          // 40. Display game feedback
          const next =
            getExerciseState();

          if (next.paused) {
            feedbackBox.textContent =
              faceVisible
                ? 'Game paused. Press Continue when you are ready.'
                : 'Camera lost. Look at the camera to continue.';

          } else if (
            next.levelComplete
          ) {
            feedbackBox.textContent =
              'Well done! Continue to the next chapter.';

          } else if (
            now < feedbackUntil
          ) {
            feedbackBox.textContent =
              feedback;

          } else if (
            next.phase === 'countdown'
          ) {
            feedbackBox.textContent =
              `Get ready! ${next.countdown}…`;

          } else if (
            next.phase === 'approach'
          ) {
            feedbackBox.textContent =
              'Watch the forest. Your next challenge is approaching!';

          } else if (
            next.phase === 'ready' &&
            next.type === 'eyes' &&
            !eyesOpenFirst
          ) {
            feedbackBox.textContent =
              'Open your eyes first, then close gently.';

          } else if (
            next.phase === 'ready'
          ) {
            feedbackBox.textContent = {
              smile:
                'Smile to collect the light!',

              eyebrow:
                'Raise your eyebrows to jump!',

              eyes: gentleEyes
                ? 'Close your eyes gently. Gentle eye detection is active.'
                : 'Close both eyes gently and hold for a moment!',

              lips:
                'Purse your lips to blow the leaves away!'
            }[next.type];

          } else {
            feedbackBox.textContent =
              'Lovely movement!';
          }
        }

        updatePauseUI();
      }

    } catch (error) {
      console.error(error);

      pauseGame('tracking');

      status.textContent =
        `Tracking error: ${error.message}`;

      updatePauseUI();
    }

  } else if (
    lastVideoFrameAt > 0 &&
    now - lastVideoFrameAt >=
    VIDEO_STALL_MS
  ) {
    // Mobile Safari may briefly suspend camera frames
    // when the phone moves.
    handleTrackingLoss(now);
  }

  requestAnimationFrame(detectFace);
}


// 41. Pause when browser tab is hidden
document.addEventListener(
  'visibilitychange',
  () => {
    if (
      document.hidden &&
      profile &&
      !calibration
    ) {
      pauseGame('background');

      resetGestures();

      updatePauseUI();
    }
  }
);


// 42. Connect buttons
startButton.addEventListener(
  'click',
  startCamera
);

calibrateButton.addEventListener(
  'click',
  beginCalibration
);

retryButton.addEventListener(
  'click',
  retryStep
);

gentleButton.addEventListener(
  'click',
  useGentleSetting
);

cancelButton.addEventListener(
  'click',
  cancelCalibration
);
