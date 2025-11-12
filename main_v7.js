/* global THREE */
// ========= Walkable 3D Town — main_v7.js =========

const VERSION = "v7.2";

// ---------- DOM ----------
const dbg   = document.getElementById("dbg");
const ui    = document.getElementById("ui");
const touch = document.getElementById("touch-ui");
const stick = document.getElementById("stick-left");
const knob  = stick ? stick.querySelector(".knob") : null;
const look  = document.getElementById("look-right");

const btnJump  = document.getElementById("jump-btn");
const btnNight = document.getElementById("night-btn");
const btnFlash = document.getElementById("flash-btn");

// ---------- Device detection ----------
const isCoarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
const hasTouch = "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0;
const isMobile = !!(isCoarse || hasTouch);
if (dbg) dbg.textContent = `mode: ${isMobile ? "mobile" : "desktop"} • ${VERSION}`;

// ---------- Renderer / Scene / Camera ----------
const canvas   = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const DPR      = Math.min(window.devicePixelRatio || 1, 1.75);
renderer.setPixelRatio(DPR);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !isMobile; // perf on phones

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

// ---------- Day/Night palette ----------
let nightMode    = false;
let flashlightOn = false;
const SKY_DAY      = 0xcfefff;
const SKY_NIGHT    = 0x050b14;
const GROUND_DAY   = 0x87b86a;
const GROUND_NIGHT = 0x1c3a33;
const WATER_DAY    = 0x86c5da;
const WATER_NIGHT  = 0x031f2d;

// ---------- Sky Dome ----------
const skyGeo = new THREE.SphereGeometry(220, 32, 32);
const skyMat = new THREE.MeshBasicMaterial({ color: SKY_DAY, side: THREE.BackSide });
const sky    = new THREE.Mesh(skyGeo, skyMat);
scene.add(sky);

// ---------- Ground ----------
const groundGeo = new THREE.PlaneGeometry(220, 220);
const groundMat = new THREE.MeshStandardMaterial({ color: GROUND_DAY, roughness: 1 });
const ground    = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---------- Simple Water (gentle bobbing plane) ----------
const waterGeo = new THREE.PlaneGeometry(110, 110, 1, 1);
const waterMat = new THREE.MeshPhongMaterial({
  color: WATER_DAY, transparent: true, opacity: 0.65,
  shininess: 80, specular: 0x88aaff
});
const water = new THREE.Mesh(waterGeo, waterMat);
water.rotation.x = -Math.PI / 2;
water.position.y = 0.05;
scene.add(water);

// ---------- Lights ----------
const hemi = new THREE.HemisphereLight(0xffffff, 0x8899aa, isMobile ? 0.45 : 0.6);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, isMobile ? 0.55 : 0.85);
sun.position.set(18, 24, 12);
sun.castShadow = !isMobile;
if (!isMobile) {
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far  = 200;
}
scene.add(sun);

// Flashlight (attached to camera)
const flash = new THREE.SpotLight(0xffffff, 0, 15, Math.PI / 7, 0.5, 1.2);
flash.position.set(0, 0, 0);
flash.target.position.set(0, 0, -1);
scene.add(flash);
scene.add(flash.target);

// ---------- Town Builders ----------
const HOUSE_Y = 0; // ground
const houses = [];

function makeHouse({ x, z, w = 4, d = 4, h = 2.6, color = 0xe5d3b3, roofColor = 0x9b6a6c }) {
  const g = new THREE.Group();
  g.position.set(x, HOUSE_Y, z);

  // Body
  const bodyGeo = new THREE.BoxGeometry(w, h, d);
  const bodyMat = new THREE.MeshStandardMaterial({ color });
  const body    = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = !isMobile;
  body.receiveShadow = true;
  body.position.y = h / 2;
  g.add(body);

  // Roof
  const roofGeo = new THREE.ConeGeometry(Math.max(w, d) * 0.75, Math.max(h * 0.8, 2), 4);
  const roofMat = new THREE.MeshStandardMaterial({ color: roofColor });
  const roof    = new THREE.Mesh(roofGeo, roofMat);
  roof.castShadow = !isMobile;
  roof.position.y = h + 0.7;
  roof.rotation.y = Math.PI * 0.25;
  g.add(roof);

  // Door indicator (front = +z face)
  const doorGeo = new THREE.PlaneGeometry(1.6, 2.0);
  const doorMat = new THREE.MeshBasicMaterial({ color: 0x6b4f3a });
  const door    = new THREE.Mesh(doorGeo, doorMat);
  door.position.set(0, 1.0, d / 2 + 0.01);
  g.add(door);

  // Store AABB footprint + door width
  g.userData.aabb = {
    min: new THREE.Vector3(x - w / 2, 0, z - d / 2),
    max: new THREE.Vector3(x + w / 2, 0, z + d / 2)
  };
  g.userData.doorWidth = 1.6; // centered on +z
  g.userData.depth     = d;

  scene.add(g);
  houses.push(g);
}

// Trees
function makeTree(x, z) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.35, 2, 8),
    new THREE.MeshStandardMaterial({ color: 0x8b5a2b })
  );
  trunk.position.set(x, 1, z);
  trunk.castShadow = !isMobile;
  trunk.receiveShadow = true;
  scene.add(trunk);

  const crown = new THREE.Mesh(
    new THREE.ConeGeometry(1.2, 2.2, 10),
    new THREE.MeshStandardMaterial({ color: 0x2f7d32 })
  );
  crown.position.set(x, 2.6, z);
  crown.castShadow = !isMobile;
  scene.add(crown);
}

// Paths
function makePath(x, z, w, d) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ color: 0xc8c2b0, roughness: 1 })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.001, z);
  m.receiveShadow = true;
  scene.add(m);
}

// Build a small town
makeHouse({ x: 10,  z: -5,  color: 0xd8e2dc });
makeHouse({ x: -8,  z: -12, color: 0xffe5d9 });
makeHouse({ x: -14, z:  8,  color: 0xcdeac0 });
makeHouse({ x: 8,   z:  12, color: 0xa3cef1 });

for (let i = 0; i < 12; i++) {
  makeTree(-18 + Math.random() * 36, -18 + Math.random() * 36);
}

makePath(0, -2, 28, 4);
makePath(-10, 8, 16, 3);
makePath(9, 8, 16, 3);

// ---------- Player Rig & Controls ----------
let controls;      // desktop pointer lock
let yaw, pitch;    // mobile rig
let playerObject;  // THREE.Object3D to move (controls.getObject() or yaw)
const EYE_HEIGHT = 1.6;

// Movement state
const moveKeys = { fwd: 0, right: 0 };
let verticalVelocity = 0;
let onGround = true;
const JUMP_SPEED = 6.0;
const GRAVITY    = 15.0;

// Desktop controls
if (!isMobile) {
  controls = new THREE.PointerLockControls(camera, document.body);
  scene.add(controls.getObject());
  playerObject = controls.getObject();
  playerObject.position.set(0, EYE_HEIGHT, 10);

  document.body.addEventListener("click", () => {
    if (ui) ui.style.display = "none";
    controls.lock();
  });
} else {
  // Mobile: yaw/pitch rig
  yaw   = new THREE.Object3D();
  pitch = new THREE.Object3D();
  yaw.add(pitch);
  pitch.add(camera);
  camera.position.set(0, EYE_HEIGHT, 0);
  playerObject = yaw;
  scene.add(yaw);

  // Tap to start HUD
  document.body.addEventListener("click", () => {
    if (ui) ui.style.display = "none";
    if (touch) touch.style.display = "block";
  }, { passive: true });
}

// ---------- UI state helper ----------
function updateUI() {
  if (btnNight) btnNight.classList.toggle('active', nightMode);
  if (btnFlash) btnFlash.classList.toggle('active', flashlightOn);
}

// ---------- Touch-safe button binding ----------
function eat(e){ e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.(); }
function bindButton(el, handler){
  if (!el) return;
  el.addEventListener('touchstart', eat,            {passive:false});
  el.addEventListener('touchend',   (e)=>{ eat(e); handler(); }, {passive:false});
  el.addEventListener('click',      (e)=>{ eat(e); handler(); });
}

bindButton(btnJump,  () => { if (onGround){ verticalVelocity = JUMP_SPEED; onGround = false; } });
bindButton(btnNight, () => { nightMode = !nightMode; applyNight(); updateUI(); });
bindButton(btnFlash, () => { flashlightOn = !flashlightOn; applyFlash(); updateUI(); });

// ---------- Mobile Joystick + Look ----------
const stickState = { active: false, startX: 0, startY: 0 };
const lookState  = { active: false, lastX: 0, lastY: 0 };
const JOY_MAX    = 36;         // clamp knob travel
const JOY_SPEED  = 6.0;        // m/s when joystick fully deflected
const LOOK_SENS  = 0.0025;     // swipe sensitivity
const PITCH_CLAMP = Math.PI * 0.48;
let joyVec = new THREE.Vector2(0, 0);

function touchPos(ev) {
  const t = ev.touches ? ev.touches[0] : ev;
  return { x: t.clientX, y: t.clientY };
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

if (isMobile && stick && knob && look) {
  // movement stick
  const onStickStart = (e) => {
    e.preventDefault(); e.stopPropagation();
    const p = touchPos(e);
    stickState.active = true;
    stickState.startX = p.x;
    stickState.startY = p.y;
    knob.style.transform = `translate(0px,0px)`;
  };
  const onStickMove = (e) => {
    if (!stickState.active) return;
    e.preventDefault(); e.stopPropagation();
    const p = touchPos(e);
    const dx = p.x - stickState.startX;
    const dy = p.y - stickState.startY;
    const len = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const radius = Math.min(len, JOY_MAX);
    const kx = Math.cos(angle) * radius;
    const ky = Math.sin(angle) * radius;
    knob.style.transform = `translate(${kx}px, ${ky}px)`;
    joyVec.set(kx / JOY_MAX, ky / JOY_MAX).clampScalar(-1, 1);
  };
  const onStickEnd = (e) => {
    e.preventDefault(); e.stopPropagation();
    stickState.active = false;
    knob.style.transform = `translate(0px,0px)`;
    joyVec.set(0, 0);
  };
  stick.addEventListener("touchstart", onStickStart, { passive: false });
  stick.addEventListener("touchmove",  onStickMove,  { passive: false });
  stick.addEventListener("touchend",   onStickEnd,   { passive: false });

  // look area (natural mapping)
  const onLookStart = (e) => {
    e.preventDefault(); e.stopPropagation();
    const p = touchPos(e);
    lookState.active = true;
    lookState.lastX  = p.x;
    lookState.lastY  = p.y;
  };
  const onLookMove = (e) => {
    if (!lookState.active) return;
    e.preventDefault(); e.stopPropagation();
    const p = touchPos(e);
    const dx = p.x - lookState.lastX;
    const dy = p.y - lookState.lastY;
    lookState.lastX = p.x;
    lookState.lastY = p.y;

    // Natural feel: swipe RIGHT -> look RIGHT; swipe UP -> look UP
    yaw.rotation.y   += dx * LOOK_SENS;
    pitch.rotation.x  = clamp(pitch.rotation.x + (-dy) * LOOK_SENS, -PITCH_CLAMP, PITCH_CLAMP);
  };
  const onLookEnd = (e) => {
    e.preventDefault(); e.stopPropagation();
    lookState.active = false;
  };
  look.addEventListener("touchstart", onLookStart, { passive: false });
  look.addEventListener("touchmove",  onLookMove,  { passive: false });
  look.addEventListener("touchend",   onLookEnd,   { passive: false });
}

// ---------- Night / Flashlight (apply) ----------
function applyNight() {
  skyMat.color.setHex(nightMode ? SKY_NIGHT : SKY_DAY);
  groundMat.color.setHex(nightMode ? GROUND_NIGHT : GROUND_DAY);
  waterMat.color.setHex(nightMode ? WATER_NIGHT : WATER_DAY);
  hemi.intensity = nightMode ? 0.12 : (isMobile ? 0.45 : 0.6);
  sun.intensity  = nightMode ? 0.25 : (isMobile ? 0.55 : 0.85);
}
function applyFlash() {
  flash.intensity = flashlightOn ? 2.2 : 0;
}

// ---------- Keyboard (desktop + mobile external keyboards) ----------
window.addEventListener("keydown", (e) => {
  // Toggle keys always work
  if (e.code === "KeyN") { e.preventDefault(); nightMode = !nightMode; applyNight(); updateUI(); }
  if (e.code === "KeyF") { e.preventDefault(); flashlightOn = !flashlightOn; applyFlash(); updateUI(); }
  if (e.code === "Space") { e.preventDefault(); if (onGround){ verticalVelocity = JUMP_SPEED; onGround = false; } }

  if (!isMobile) {
    if (e.code === "ArrowUp" || e.code === "KeyW") moveKeys.fwd =  1;
    if (e.code === "ArrowDown" || e.code === "KeyS") moveKeys.fwd = -1;
    if (e.code === "ArrowLeft" || e.code === "KeyA") moveKeys.right = -1;
    if (e.code === "ArrowRight" || e.code === "KeyD") moveKeys.right = 1;
  }
});
window.addEventListener("keyup", (e) => {
  if (!isMobile) {
    if ((e.code === "ArrowUp" || e.code === "KeyW") && moveKeys.fwd === 1)  moveKeys.fwd = 0;
    if ((e.code === "ArrowDown" || e.code === "KeyS") && moveKeys.fwd === -1) moveKeys.fwd = 0;
    if ((e.code === "ArrowLeft" || e.code === "KeyA") && moveKeys.right === -1) moveKeys.right = 0;
    if ((e.code === "ArrowRight" || e.code === "KeyD") && moveKeys.right === 1) moveKeys.right = 0;
  }
});

// ---------- Resize ----------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Animate ----------
let t0 = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const t1 = performance.now();
  const dt = Math.min((t1 - t0) / 1000, 0.05);
  t0 = t1;

  // gentle water bob
  water.position.y = 0.05 + Math.sin(t1 * 0.0012) * 0.02;

  // horizontal movement
  if (!isMobile) {
    const canMove = !!(document.pointerLockElement || document.mozPointerLockElement);
    if (canMove) {
      const desired = getDesktopMove(dt);
      if (desired.lengthSq() > 0) {
        const next = playerObject.position.clone().add(desired);
        if (!willCollide(next)) playerObject.position.copy(next);
      }
    }
  } else {
    const desired = getMobileMove(dt);
    if (desired.lengthSq() > 0) {
      const next = playerObject.position.clone().add(desired);
      if (!willCollide(next)) playerObject.position.copy(next);
    }
  }

  // vertical (jump/gravity)
  if (!onGround || verticalVelocity > 0) {
    verticalVelocity -= GRAVITY * dt;
    let newY = playerObject.position.y + verticalVelocity * dt;
    if (newY <= EYE_HEIGHT) {
      newY = EYE_HEIGHT;
      verticalVelocity = 0;
      onGround = true;
    }
    playerObject.position.y = newY;
  }

  // flashlight follows camera
  flash.position.copy(camera.position);
  const lookDir = new THREE.Vector3();
  camera.getWorldDirection(lookDir);
  flash.target.position.copy(camera.position.clone().add(lookDir.multiplyScalar(5)));

  renderer.render(scene, camera);
}
animate();

// ---------- Movement helpers ----------
function getDesktopMove(dt) {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
  const rightVec = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0,1,0)).normalize().multiplyScalar(-1);

  let desired = new THREE.Vector3();
  if (moveKeys.fwd !== 0)   desired.add(dir.clone().multiplyScalar(moveKeys.fwd));
  if (moveKeys.right !== 0) desired.add(rightVec.clone().multiplyScalar(moveKeys.right));

  if (desired.lengthSq() > 0) {
    desired.normalize().multiplyScalar(6 * dt); // speed
  }
  return desired;
}
function getMobileMove(dt) {
  if (joyVec.lengthSq() === 0) return new THREE.Vector3();

  const yawFwd   = new THREE.Vector3(-Math.sin(yaw.rotation.y), 0, -Math.cos(yaw.rotation.y));
  const yawRight = new THREE.Vector3(yawFwd.z, 0, -yawFwd.x);

  let desired = new THREE.Vector3();
  desired.add(yawFwd.multiplyScalar(joyVec.y));
  desired.add(yawRight.multiplyScalar(joyVec.x));
  desired.normalize().multiplyScalar(JOY_SPEED * dt);
  return desired;
}

// ---------- Collisions (AABB) with door opening ----------
function willCollide(nextPos) {
  for (const h of houses) {
    const { min, max } = h.userData.aabb;
    const doorWidth = h.userData.doorWidth || 1.4;

    // inside footprint?
    if (
      nextPos.x > min.x - 0.25 && nextPos.x < max.x + 0.25 &&
      nextPos.z > min.z - 0.25 && nextPos.z < max.z + 0.25
    ) {
      // allow entry at front (+z) if within doorWidth centered on house x
      const doorXmin = h.position.x - doorWidth / 2;
      const doorXmax = h.position.x + doorWidth / 2;
      const frontZ   = max.z; // front face
      if (nextPos.x > doorXmin && nextPos.x < doorXmax && nextPos.z > frontZ - 0.2) {
        return false; // pass through the “door”
      }
      return true; // blocked by walls
    }
  }
  return false;
}

// ---------- Init camera position ----------
if (!isMobile) {
  camera.position.set(0, EYE_HEIGHT, 10);
} else {
  yaw.position.set(0, 0, 10);
  pitch.rotation.x = 0;
}
