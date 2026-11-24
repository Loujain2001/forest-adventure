
// Forest Adventure – The Enchanted Trail
// 12 mixed challenges per level: 3 per facial movement.

const WIDTH = 960;
const HEIGHT = 480;
const GROUND = 377;
const FOX_X = 200;
const TARGET_X = 340;

const SPEEDS = {
  relaxed: 115,
  normal: 180,
  challenge: 275
};

const LEVELS = [
  {
    name: "Sunlit Grove",
    chapter: "The Lost Forest Lights",
    story: "Bring the morning light back to the forest.",
    colors: [
      "#b7e7e4", "#fff3c9", "#bcdabb",
      "#7fb5a0", "#437b66", "#9ac581"
    ],
    order: [
      "smile", "eyebrow", "lips", "eyes",
      "smile", "lips", "eyebrow", "eyes",
      "lips", "smile", "eyes", "eyebrow"
    ]
  },
  {
    name: "Crystal Woods",
    chapter: "The Crystal River",
    story: "Clear the trail and awaken the shining river.",
    colors: [
      "#81cecc", "#e8f6e5", "#a4d3cb",
      "#649d9b", "#326f72", "#7bb6a3"
    ],
    order: [
      "eyes", "smile", "eyebrow", "lips",
      "smile", "eyes", "lips", "eyebrow",
      "eyes", "lips", "smile", "eyebrow"
    ]
  },
  {
    name: "Twilight Trail",
    chapter: "A Way Home",
    story: "Guide the fox safely through the glowing night.",
    colors: [
      "#667caa", "#d8bcd8", "#9398c0",
      "#6f80a4", "#435677", "#7d9ca1"
    ],
    order: [
      "lips", "eyebrow", "smile", "eyes",
      "eyebrow", "lips", "eyes", "smile",
      "lips", "eyes", "eyebrow", "smile"
    ]
  }
];

const SCENES = {
  smile: [
    { kind: "star", title: "A fallen sunbeam", hint: "Smile to bring back the golden light!" },
    { kind: "butterfly", title: "A shy butterfly", hint: "Smile to welcome your little friend!" },
    { kind: "firefly", title: "A lost firefly", hint: "Smile to guide the light home!" },
    { kind: "crystal", title: "A glowing crystal", hint: "Smile to awaken the crystal!" },
    { kind: "lantern", title: "The forest lantern", hint: "Smile to light the lantern!" },
    { kind: "moonstar", title: "A moonlit star", hint: "Smile to catch the starlight!" }
  ],
  eyebrow: [
    { kind: "log", title: "A fallen log", hint: "Raise your eyebrows to jump!" },
    { kind: "mushroom", title: "A giant mushroom", hint: "Raise your eyebrows to hop over it!" },
    { kind: "rock", title: "A mossy rock", hint: "Raise your eyebrows to leap!" },
    { kind: "stump", title: "An old stump", hint: "Raise your eyebrows to jump!" },
    { kind: "crystalrock", title: "Crystal stones", hint: "Raise your eyebrows to hop across!" },
    { kind: "root", title: "A tangled tree root", hint: "Raise your eyebrows to jump!" }
  ],
  eyes: [
    { kind: "mist", title: "A magical mist", hint: "Close both eyes gently for your shield!" },
    { kind: "storm", title: "A little rain cloud", hint: "Close both eyes gently for your shield!" },
    { kind: "shadow", title: "A forest shadow", hint: "Close both eyes to light your shield!" },
    { kind: "sparkfog", title: "Sparkling fog", hint: "Close both eyes for your magic shield!" },
    { kind: "mooncloud", title: "A moon cloud", hint: "Close both eyes to protect the fox!" },
    { kind: "glowfog", title: "Glowing mist", hint: "Close both eyes for your shield!" }
  ],
  lips: [
    { kind: "leaves", title: "Whirling leaves", hint: "Purse your lips to blow the leaves away!" },
    { kind: "petals", title: "Floating petals", hint: "Purse your lips to make a wind gust!" },
    { kind: "branch", title: "A branch blocks the way", hint: "Purse your lips to clear the path!" },
    { kind: "seeds", title: "Dandelion seeds", hint: "Purse your lips to send them flying!" },
    { kind: "feathers", title: "Magic feathers", hint: "Purse your lips to blow them away!" },
    { kind: "vines", title: "Tangled forest vines", hint: "Purse your lips to sweep the vines aside!" }
  ]
};

const LABELS = {
  smile: "SMILE",
  eyebrow: "RAISE EYEBROWS",
  eyes: "CLOSE BOTH EYES",
  lips: "PURSE YOUR LIPS"
};

const SYMBOLS = {
  smile: "✦",
  eyebrow: "↟",
  eyes: "◉",
  lips: "〰"
};

// Game state
let canvas;
let ctx;
let started = false;
let playing = false;

// NEW: Pause state
let paused = false;
let pauseReason = null;

let level = 0;
let sceneIndex = 0;
let score = 0;

let levelSeconds = 0;
let levelPoints = 0;

let phase = "intro";
let countdown = 3;
let successTime = 0;

let scene = null;
let objectX = WIDTH + 50;

let pace = "normal";
let elapsed = 0;
let scroll = 0;
let lastTime = 0;

let foxY = 0;
let jumpVelocity = 0;
let shieldTime = 0;
let windTime = 0;

let particles = [];

let counts = {
  smile: 0,
  eyebrow: 0,
  eyes: 0,
  lips: 0
};

let message = "";
let messageTime = 0;

const el = id => document.getElementById(id);
const currentLevel = () => LEVELS[level];
const speed = () => SPEEDS[pace] ?? SPEEDS.normal;
const rand = (a, b) => a + Math.random() * (b - a);

// Prepare next challenge
function beginScene() {
  const type = currentLevel().order[sceneIndex];
  const index = counts[type] + level * 2;

  scene = {
    type,
    ...SCENES[type][index % SCENES[type].length]
  };

  objectX = WIDTH + 50;
  phase = "approach";
  message = "";

  updateUI();
}

// Format active level time
function formatDuration(seconds) {
  const whole = Math.round(seconds);

  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

// Fill level report
function updateLevelReport() {
  el("reportTotal").textContent = `${sceneIndex} / 12`;
  el("reportTime").textContent = formatDuration(levelSeconds);
  el("reportPoints").textContent = String(levelPoints);
  el("reportSmile").textContent = `${counts.smile} / 3`;
  el("reportEyebrow").textContent = `${counts.eyebrow} / 3`;
  el("reportEyes").textContent = `${counts.eyes} / 3`;
  el("reportLips").textContent = `${counts.lips} / 3`;
}

// Intro and result screen
function showOverlay(title, description, button = false) {
  const completed = phase === "levelDone";

  el("screenOverlay").hidden = false;
  el("screenOverlay").classList.toggle("has-report", completed);
  el("levelReport").hidden = !completed;

  if (completed) updateLevelReport();

  el("overlayChapter").textContent =
    `Chapter ${level + 1} · ${currentLevel().name}`;

  el("overlayTitle").textContent = title;
  el("overlayDescription").textContent = description;

  el("nextLevelButton").hidden = !button;
  el("nextLevelButton").textContent =
    level < 2 ? `Continue to Level ${level + 2} →` : "Play Again ↻";
}

// Progress cards and speed
function updateUI() {
  el("levelLabel").textContent =
    `Chapter ${level + 1} / 3 · ${currentLevel().name}`;

  el("chapterHint").textContent = currentLevel().story;
  el("speedReadout").textContent = `${speed()} px/s`;
  el("taskCount").textContent = `${sceneIndex} / 12`;
  el("progressFill").style.width = `${sceneIndex / 12 * 100}%`;

  const title = phase === "levelDone"
    ? "Chapter complete!"
    : scene?.title ?? currentLevel().chapter;

  el("questTitle").textContent = title;

  el("questHint").textContent = phase === "levelDone"
    ? "Wonderful work. Enjoy your achievement!"
    : scene?.hint ?? currentLevel().story;

  for (const type of Object.keys(counts)) {
    const card = document.querySelector(
      `[data-gesture="${type}"]`
    );

    if (!card) continue;

    card.querySelector(".dots").textContent =
      Array.from(
        { length: 3 },
        (_, i) => i < counts[type] ? "●" : "○"
      ).join(" ");

    card.classList.toggle("complete", counts[type] === 3);

    card.classList.toggle(
      "active",
      scene?.type === type &&
      !["intro", "levelDone"].includes(phase)
    );
  }
}

// Start game canvas
export function startGame(gameCanvas) {
  if (started) return;

  if (!gameCanvas) {
    throw new Error("gameCanvas is missing in index.html");
  }

  canvas = gameCanvas;
  ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas is not supported");
  }

  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  pace = el("paceSelect")?.value ?? "normal";

  el("paceSelect")?.addEventListener("change", event => {
    pace = event.target.value;
    updateUI();
  });

  el("nextLevelButton")?.addEventListener("click", continueLevel);

  showOverlay(
    "A forest needs your magic",
    "Start the camera, relax your face and calibrate. Your fox is ready for an adventure!"
  );

  started = true;
  updateUI();

  requestAnimationFrame(loop);
}

// Game starts after calibration
export function setGameRunning(value) {
  // Face detection must not override a pause
  if (paused || phase === "levelDone") return;

  playing = Boolean(value);

  if (playing && phase === "intro") {
    el("screenOverlay").hidden = true;

    phase = "countdown";
    countdown = 3;

    updateUI();
  }
}

// NEW: Stop the game
export function pauseGame(reason = "manual") {
  if (paused || phase === "intro" || phase === "levelDone") {
    return false;
  }

  paused = true;
  pauseReason = reason;
  playing = false;

  return true;
}

// NEW: Continue at the same position
export function resumeGame() {
  if (!paused || phase === "levelDone") {
    return false;
  }

  paused = false;
  pauseReason = null;
  playing = true;

  return true;
}

// Information for MediaPipe and controls
export function getExerciseState() {
  return {
    phase,
    type: scene?.type ?? null,
    level: level + 1,
    repetition: scene?.type ? counts[scene.type] + 1 : 0,
    completed: sceneIndex,
    score,
    levelPoints,
    elapsedSeconds: levelSeconds,
    counts: { ...counts },
    ready: playing && !paused && phase === "ready",
    paused,
    pauseReason,
    levelComplete: phase === "levelDone",
    countdown: Math.ceil(countdown)
  };
}

// Reward particles
function bursts(x, y, color, number = 20) {
  for (let i = 0; i < number; i++) {
    particles.push({
      x,
      y,
      vx: rand(-150, 150),
      vy: rand(-240, -45),
      life: rand(.45, 1.15),
      max: 1.15,
      color,
      r: rand(2, 5)
    });
  }
}

// Accept the correct face movement
function act(type) {
  if (
    !playing ||
    phase !== "ready" ||
    scene?.type !== type
  ) {
    return false;
  }

  phase = "success";
  successTime = .82;

  counts[type]++;
  sceneIndex++;

  const gained = type === "smile" ? 3 : 2;

  score += gained;
  levelPoints += gained;

  if (type === "eyebrow") jumpVelocity = -720;
  if (type === "eyes") shieldTime = 2.15;
  if (type === "lips") windTime = .95;

  bursts(
    objectX,
    scene.type === "smile" ? 245 : 300,
    type === "smile" ? "#ffe39a" : "#b1f3d7",
    30
  );

  message = `+${gained}  •  WELL DONE!`;
  messageTime = 1;

  updateUI();
  return true;
}

export const jumpCharacter = () => act("eyebrow");
export const collectStar = () => act("smile");
export const activateShield = () => act("eyes");
export const blowWind = () => act("lips");

// Move to next challenge or finish level
function finishScene() {
  if (sceneIndex >= 12) {
    phase = "levelDone";
    playing = false;

    bursts(480, 240, "#fbd98a", 80);

    showOverlay(
      level === 2
        ? "You saved the forest!"
        : "Well done, Forest Hero!",

      `12 varied exercises completed! ${
        level === 2
          ? "All three chapters are complete. Play again whenever you like."
          : "You unlocked a new part of the enchanted forest."
      }`,

      true
    );

    updateUI();
  } else {
    beginScene();
  }
}

// Level 2, Level 3 or Play Again
function continueLevel() {
  if (phase !== "levelDone") return;

  if (level === 2) {
    level = 0;
    score = 0;
  } else {
    level++;
  }

  sceneIndex = 0;

  counts = {
    smile: 0,
    eyebrow: 0,
    eyes: 0,
    lips: 0
  };

  levelSeconds = 0;
  levelPoints = 0;

  particles = [];
  foxY = 0;
  jumpVelocity = 0;
  shieldTime = 0;
  windTime = 0;

  phase = "countdown";
  countdown = 3;
  playing = true;
  paused = false;
  pauseReason = null;

  el("screenOverlay").hidden = true;
  el("screenOverlay").classList.remove("has-report");
  el("levelReport").hidden = true;

  scene = null;
  updateUI();
}

// Update the playing game
function update(dt) {
  elapsed += dt;

  scroll += speed() * dt *
    (playing ? (phase === "ready" ? .18 : .82) : .02);

  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 230 * dt;
    p.life -= dt;
  }

  particles = particles.filter(p => p.life > 0);

  if (messageTime > 0) {
    messageTime = Math.max(0, messageTime - dt);
  }

  if (!playing) return;

  // Do not include calibration or countdown in the report time
  if (["approach", "ready", "success"].includes(phase)) {
    levelSeconds += dt;
  }

  // Fox jump and gravity
  if (jumpVelocity !== 0 || foxY < 0) {
    jumpVelocity += 1700 * dt;
    foxY += jumpVelocity * dt;

    if (foxY > 0) {
      foxY = 0;
      jumpVelocity = 0;
    }
  }

  shieldTime = Math.max(0, shieldTime - dt);
  windTime = Math.max(0, windTime - dt);

  if (phase === "countdown") {
    countdown = Math.max(0, countdown - dt);

    if (countdown <= 0) beginScene();

  } else if (phase === "approach") {
    objectX -= speed() * dt;

    if (objectX <= TARGET_X) {
      objectX = TARGET_X;
      phase = "ready";
      updateUI();
    }

  } else if (phase === "success") {
    objectX -= speed() * 1.65 * dt;
    successTime -= dt;

    if (successTime <= 0) {
      finishScene();
    }
  }
}

// Animation loop – pause stops every update
function loop(time) {
  const dt = lastTime
    ? Math.min((time - lastTime) / 1000, .05)
    : 0;

  // Keep updating the timestamp to avoid a jump on resume
  lastTime = time;

  if (!paused) {
    update(dt);
  }

  draw();
  requestAnimationFrame(loop);
}

// Drawing helpers
function blob(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function oval(x, y, rx, ry, color, angle = 0) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2);
  ctx.fill();
}

function rounded(x, y, w, h, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function line(points, color, width = 3) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();

  points.forEach(([x, y], i) => {
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });

  ctx.stroke();
}

// Draw trees
function drawTree(x, scale, trunk, leaves, variation = 0) {
  const base = GROUND + 14;

  rounded(
    x - 8 * scale,
    base - 100 * scale,
    16 * scale,
    101 * scale,
    7 * scale,
    trunk
  );

  blob(x, base - 162 * scale, 49 * scale, leaves);
  blob(x - 34 * scale, base - 137 * scale, 37 * scale, leaves);
  blob(x + 33 * scale, base - 143 * scale, 43 * scale, leaves);
  blob(x + 4 * scale, base - 195 * scale, 30 * scale, leaves);

  for (let j = 0; j < 4; j++) {
    blob(
      x + (j - 1.5) * 19 * scale,
      base - (173 + variation * 5 + j * 7) * scale,
      2.5 * scale,
      "#c0e4bb65"
    );
  }
}

// Draw forest worlds
function background() {
  const theme = currentLevel().colors;
  const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);

  grad.addColorStop(0, theme[0]);
  grad.addColorStop(1, theme[1]);

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const night = level === 2;

  ctx.save();
  ctx.shadowColor = night ? "#fff0d5" : "#fff9c7";
  ctx.shadowBlur = 55;

  blob(
    790, 100,
    night ? 31 : 43,
    night ? "#fff2d4" : "#fff1b4"
  );

  ctx.restore();

  // Clouds
  for (let i = 0; i < 4; i++) {
    const x =
      ((i * 300 + 90 - scroll * .06) % 1200 + 1200) % 1200 - 110;

    const y = 72 + (i % 2) * 46;

    oval(x, y, 59, 13, "#ffffff45");
    blob(x - 20, y - 8, 20, "#ffffff45");
    blob(x + 17, y - 11, 23, "#ffffff45");
  }

  // Hills
  ctx.fillStyle = theme[2];
  ctx.beginPath();
  ctx.moveTo(0, 337);

  ctx.bezierCurveTo(160, 200, 240, 310, 390, 286);
  ctx.bezierCurveTo(570, 196, 720, 263, 960, 280);

  ctx.lineTo(WIDTH, HEIGHT);
  ctx.lineTo(0, HEIGHT);
  ctx.fill();

  // Forest trees
  const back = (scroll * .23) % 190;
  const front = (scroll * .61) % 270;

  for (let i = -2; i < 9; i++) {
    drawTree(
      i * 190 + 60 - back,
      .75,
      "#7c6655",
      theme[3],
      i % 2
    );
  }

  for (let i = -2; i < 7; i++) {
    drawTree(
      i * 270 + 80 - front,
      1.05,
      "#745840",
      theme[4],
      i % 3
    );
  }

  // Ground
  ctx.fillStyle = theme[5];
  ctx.fillRect(0, GROUND, WIDTH, HEIGHT - GROUND);
  rounded(0, GROUND, WIDTH, 7, 0, "#568e6a");

  // Flowers
  const groundOffset = scroll % 95;

  for (let i = 0; i < 15; i++) {
    const x = i * 95 - groundOffset;

    line([[x, 425], [x - 1, 412]], "#518b62", 2);
    blob(x, 409, 4.5, i % 2 ? "#ffe0f0" : "#fff5c1");
    blob(x - 8, 450, 3, "#d5e4ae");
  }

  // Magical fireflies
  for (let i = 0; i < 16; i++) {
    const x = (i * 71 + 38 - scroll * .12) % 1100;

    blob(
      (x + 1100) % 1100,
      160 + i % 5 * 34 + Math.sin(elapsed * 2 + i) * 6,
      2.5,
      "#fff5c288"
    );
  }
}

// Fox drawing and running animation
function drawFox() {
  const bob =
    playing && phase !== "ready" && foxY === 0
      ? Math.sin(elapsed * speed() / 12) * 3
      : 0;

  ctx.save();
  ctx.translate(FOX_X, GROUND + foxY + bob);

  oval(0, -foxY - bob - 1, 36, 7, "#35594036");

  // Tail
  oval(29, -38, 37, 16, "#c7784d", -.38);
  oval(52, -47, 13, 11, "#fff0d8", -.35);

  // Feet
  const leg = playing && foxY === 0
    ? Math.sin(elapsed * speed() / 9) * 8
    : 0;

  rounded(-21 + leg, -25, 17, 24, 7, "#ac6242");
  rounded(5 - leg, -25, 17, 24, 7, "#ac6242");

  // Body
  oval(0, -45, 28, 38, "#e39158");
  oval(0, -40, 16, 25, "#fff0db");

  // Ears
  for (const side of [-1, 1]) {
    ctx.fillStyle = "#b76546";
    ctx.beginPath();
    ctx.moveTo(side * 12, -107);
    ctx.lineTo(side * 28, -146);
    ctx.lineTo(side * 33, -103);
    ctx.fill();

    ctx.fillStyle = "#efb3a2";
    ctx.beginPath();
    ctx.moveTo(side * 20, -110);
    ctx.lineTo(side * 27, -133);
    ctx.lineTo(side * 29, -110);
    ctx.fill();
  }

  // Head and face
  blob(0, -103, 35, "#f0a26a");
  blob(-17, -90, 19, "#fff0db");
  blob(17, -90, 19, "#fff0db");

  blob(-12, -108, 4, "#343038");
  blob(12, -108, 4, "#343038");

  blob(-10, -110, 1.5, "white");
  blob(14, -110, 1.5, "white");
  blob(0, -89, 5, "#493137");

  ctx.strokeStyle = "#965f48";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, -84, 8, .2, Math.PI - .2);
  ctx.stroke();

  // Scarf
  line([[-23, -68], [3, -62], [24, -68]], "#f5d385", 6);

  ctx.restore();
}

// Moving challenge objects
function drawObject() {
  if (!scene) return;

  const { type, kind } = scene;
  const x = objectX;
  const rise = Math.sin(elapsed * 3.7) * 6;
  const y = type === "smile" ? 260 + rise : GROUND;

  ctx.save();

  if (type === "smile") {
    ctx.translate(x, y);
    ctx.shadowBlur = 22;
    ctx.shadowColor = "#ffeb9a";

    if (kind === "star" || kind === "moonstar") {
      ctx.fillStyle = kind === "moonstar"
        ? "#fbebd9"
        : "#ffd05a";

      ctx.beginPath();

      for (let i = 0; i < 10; i++) {
        const a = i * Math.PI / 5 - Math.PI / 2;
        const r = i % 2 ? 11 : 26;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;

        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }

      ctx.closePath();
      ctx.fill();

    } else if (kind === "crystal") {
      ctx.fillStyle = "#80edf2";
      ctx.beginPath();

      ctx.moveTo(0, -29);
      ctx.lineTo(22, -5);
      ctx.lineTo(13, 27);
      ctx.lineTo(-13, 27);
      ctx.lineTo(-22, -5);

      ctx.closePath();
      ctx.fill();

      line([[0, -26], [0, 22]], "#ecffff", 2);

    } else if (kind === "butterfly") {
      for (const s of [-1, 1]) {
        oval(s * 15, -8, 15, 20, "#edafe5", s * .3);
        oval(s * 12, 13, 11, 14, "#c4a6e9", -s * .4);
      }

      rounded(-3, -17, 6, 36, 3, "#665570");

    } else if (kind === "lantern") {
      rounded(-17, -20, 34, 43, 8, "#947043");
      rounded(-12, -15, 24, 32, 7, "#ffe8a0");
      line(
        [[-11, -20], [-9, -28], [9, -28], [11, -20]],
        "#896947", 3
      );

    } else {
      // Firefly
      oval(-12, -3, 15, 10, "#f9ffffab", -.4);
      oval(12, -3, 15, 10, "#f9ffffab", .4);
      blob(0, 2, 14, "#fff5a6");
      blob(0, -15, 6, "#7b6859");
    }

  } else if (type === "eyebrow") {
    if (kind === "mushroom") {
      rounded(x - 9, y - 42, 19, 42, 8, "#f3d8b3");
      oval(x, y - 43, 41, 22, "#c97e68");
      blob(x - 17, y - 51, 5, "#fff0db");
      blob(x + 13, y - 55, 6, "#fff0db");

    } else if (kind === "rock" || kind === "crystalrock") {
      ctx.fillStyle = kind === "rock"
        ? "#8c9ba3"
        : "#92d4d7";

      ctx.beginPath();
      ctx.moveTo(x - 33, y);
      ctx.lineTo(x - 27, y - 31);
      ctx.lineTo(x, y - 57);
      ctx.lineTo(x + 31, y - 34);
      ctx.lineTo(x + 37, y);
      ctx.closePath();
      ctx.fill();

      line([[x - 11, y - 25], [x + 4, y - 39]], "#ffffff85", 3);

    } else {
      // Log, stump or root
      rounded(x - 38, y - 40, 76, 40, 12, "#825f47");
      oval(x, y - 41, 36, 8, "#be9871");
      line(
        [[x - 24, y - 14], [x - 19, y - 31]],
        "#694d3a", 3
      );
    }

  } else if (type === "eyes") {
    const fog =
      kind === "storm" || kind === "mooncloud"
        ? "#92b9d5bb"
        : kind === "shadow"
          ? "#6e74a8ba"
          : "#b494d2bc";

    for (const [dx, dy, r] of [
      [-25, -47, 30],
      [6, -71, 41],
      [36, -45, 29],
      [7, -21, 36]
    ]) {
      blob(
        x + dx,
        y + dy + Math.sin(elapsed * 3 + dx) * 4,
        r,
        fog
      );
    }

    for (let i = 0; i < 6; i++) {
      blob(
        x - 30 + i * 11,
        y - 90 + (i % 3) * 12,
        3,
        "#e7eeffb9"
      );
    }

  } else {
    // Wind challenges
    if (kind === "branch" || kind === "vines") {
      line(
        [[x - 46, y - 18], [x + 42, y - 18]],
        kind === "vines" ? "#548a61" : "#855b44",
        14
      );

      line(
        [[x - 5, y - 18], [x + 8, y - 45]],
        "#6c8960",
        7
      );

    } else {
      for (let i = 0; i < 8; i++) {
        const px = x - 40 + i * 12;
        const py =
          y - 36 - (i % 3) * 22 +
          Math.sin(elapsed * 3 + i) * 5;

        oval(
          px,
          py,
          kind === "seeds" ? 6 : 12,
          kind === "feathers" ? 14 : 7,
          kind === "petals"
            ? "#f4bdcc"
            : kind === "feathers"
              ? "#f4eadd"
              : "#d9b86d",
          i * .3
        );
      }
    }
  }

  ctx.restore();

  // Glow around the current target
  if (phase === "ready") {
    ctx.save();

    ctx.strokeStyle = "#ffe7a5";
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 8]);

    ctx.beginPath();

    ctx.arc(
      x,
      type === "smile" ? y : y - 50,
      57 + Math.sin(elapsed * 5) * 4,
      0, Math.PI * 2
    );

    ctx.stroke();
    ctx.restore();
  }
}

// Shield, wind and score effects
function magic() {
  if (shieldTime > 0) {
    ctx.save();
    ctx.fillStyle = "#87dcf831";
    ctx.strokeStyle = "#9eeaff";
    ctx.lineWidth = 5;
    ctx.shadowBlur = 18;
    ctx.shadowColor = "#9eeaff";

    ctx.beginPath();
    ctx.arc(
      FOX_X,
      GROUND + foxY - 78,
      91,
      0, Math.PI * 2
    );

    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  if (windTime > 0) {
    const p = 1 - windTime / .95;

    ctx.save();
    ctx.strokeStyle = "#b3fff0";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";

    for (let i = 0; i < 5; i++) {
      const y = GROUND - 130 + i * 20;

      ctx.beginPath();
      ctx.moveTo(FOX_X + 28, y);
      ctx.bezierCurveTo(
        FOX_X + 92,
        y - 28,
        FOX_X + 100 + 300 * p,
        y + 25,
        FOX_X + 55 + 320 * p,
        y
      );
      ctx.stroke();
    }

    ctx.restore();
  }

  for (const p of particles) {
    ctx.globalAlpha = Math.min(
      1,
      Math.max(0, p.life / p.max)
    );
    blob(p.x, p.y, p.r, p.color);
  }

  ctx.globalAlpha = 1;
}

// Text and progress on the game canvas
function drawHud() {
  rounded(20, 17, 248, 72, 17, "#fffdf0e6");

  ctx.fillStyle = "#345d48";
  ctx.font = "bold 16px system-ui";
  ctx.fillText(`CHAPTER ${level + 1} / 3`, 37, 43);

  ctx.font = "15px system-ui";
  ctx.fillText(
    `✦  ${score} points  ·  ${sceneIndex}/12 done`,
    37, 69
  );

  rounded(653, 17, 286, 57, 16, "#fffdf0dc");

  ctx.font = "bold 16px system-ui";
  ctx.fillText(currentLevel().name, 668, 41);

  ctx.font = "12px system-ui";
  ctx.fillText(
    `${pace.toUpperCase()} · ${speed()} px/s`,
    668, 61
  );

  if (phase === "intro" || phase === "levelDone") {
    return;
  }

  rounded(279, 20, 345, 71, 16, "#fffdf0ee");

  ctx.fillStyle = "#325c46";
  ctx.textAlign = "center";
  ctx.font = "bold 16px system-ui";

  ctx.fillText(
    scene?.title ?? "Get ready, little fox...",
    451, 46
  );

  ctx.font = "13px system-ui";

  const instruction =
    phase === "ready"
      ? LABELS[scene.type] + " NOW!"
      : phase === "approach"
        ? "Look ahead! Your next challenge is coming."
        : phase === "success"
          ? "Wonderful move!"
          : "Get ready...";

  ctx.fillText(instruction, 451, 69);
  ctx.textAlign = "left";

  // Countdown before each level
  if (phase === "countdown") {
    rounded(383, 158, 195, 155, 25, "#fffdf0ef");

    ctx.textAlign = "center";
    ctx.fillStyle = "#396f50";
    ctx.font = "bold 75px Georgia";

    ctx.fillText(String(Math.ceil(countdown)), 480, 253);

    ctx.font = "bold 13px system-ui";
    ctx.fillText("READY · SET · GO", 480, 287);

    ctx.textAlign = "left";
  }

  if (messageTime > 0) {
    rounded(342, 115, 280, 44, 15, "#fff9d9ed");

    ctx.fillStyle = "#75602c";
    ctx.font = "bold 19px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(message, 482, 144);
    ctx.textAlign = "left";
  }
}

// Draw all game elements
function draw() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  background();
  drawObject();
  drawFox();
  magic();
  drawHud();
}

// Keyboard controls for testing without webcam
window.addEventListener("keydown", event => {
  if (
    event.repeat ||
    ["INPUT", "SELECT", "TEXTAREA"].includes(
      event.target?.tagName
    )
  ) {
    return;
  }

  const actions = {
    KeyS: collectStar,
    Space: jumpCharacter,
    KeyE: activateShield,
    KeyW: blowWind
  };

  if (!actions[event.code]) return;

  if (event.code === "Space") {
    event.preventDefault();
  }

  if (phase === "intro") {
    setGameRunning(true);
  }

  actions[event.code]();
});
