/* global THREE */

// Get canvas and initialize renderer
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
// Cap device pixel ratio for performance on mobile
const DPR = Math.min(window.devicePixelRatio || 1, 1.75);
renderer.setPixelRatio(DPR);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

// Create scene and camera
const scene = new THREE.Scene();
scene.background = null; // use CSS gradient
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

// Detect mobile device
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// Controls variables
let controls;
let yaw, pitch;

if (!isMobile) {
  // Desktop: pointer lock controls
  controls = new THREE.PointerLockControls(camera, document.body);
  document.body.addEventListener('click', () => controls.lock());
  controls.addEventListener('lock', () => {
    document.getElementById('ui').style.display = 'none';
  });
  controls.addEventListener('unlock', () => {
    document.getElementById('ui').style.display = 'block';
  });
  scene.add(controls.getObject());
  camera.position.set(0, 1.6, 10);
} else {
  // Mobile: custom yaw/pitch rig
  yaw = new THREE.Object3D();
  pitch = new THREE.Object3D();
  yaw.add(pitch);
  pitch.add(camera);
  scene.add(yaw);
  camera.position.set(0, 1.6, 0);
  // Hide instructions overlay on first touch to simulate "tap to start"
  document.body.addEventListener(
    'touchstart',
    () => {
      const ui = document.getElementById('ui');
      if (ui) ui.style.display = 'none';
    },
    { once: true }
  );
}

// Lights
const hemi = new THREE.HemisphereLight(0xdeeedd, 0x889975, 0.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 0.8);
sun.position.set(10, 20, 10);
sun.castShadow = !isMobile;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);

// Ground
const groundGeo = new THREE.PlaneGeometry(200, 200);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x88c57f });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Town creation functions
function makeHouse(opts) {
  const { x, z, w = 4, d = 4, h = 2.5, color = 0xe5d3b3 } = opts;
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const bodyGeo = new THREE.BoxGeometry(w, h, d);
  const bodyMat = new THREE.MeshStandardMaterial({ color });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  body.position.y = h / 2;
  group.add(body);
  const roofGeo = new THREE.ConeGeometry(Math.max(w, d) * 0.75, h * 0.8, 4);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x8b4a2f });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.castShadow = true;
  roof.rotation.y = Math.PI / 4;
  roof.position.y = h + h * 0.4;
  group.add(roof);
  // Footprint AABB for collision detection
  group.userData.aabb = {
    min: new THREE.Vector3(x - w / 2, 0, z - d / 2),
    max: new THREE.Vector3(x + w / 2, 0, z + d / 2)
  };
  scene.add(group);
  return group;
}

function makeTree(opts) {
  const { x, z } = opts;
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.25, 2, 8),
    new THREE.MeshStandardMaterial({ color: 0x8b5a2b })
  );
  trunk.position.y = 1;
  trunk.castShadow = true;
  group.add(trunk);
  const foliage = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 2.2, 8),
    new THREE.MeshStandardMaterial({ color: 0x2d6a4f })
  );
  foliage.position.y = 2.5;
  foliage.castShadow = true;
  group.add(foliage);
  scene.add(group);
  return group;
}

function makePath(opts) {
  const { x1, z1, x2, z2, width = 2 } = opts;
  const len = Math.hypot(x2 - x1, z2 - z1);
  const geo = new THREE.PlaneGeometry(len, width);
  const mat = new THREE.MeshStandardMaterial({ color: 0xc2b280, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  mesh.position.set((x1 + x2) / 2, 0.001, (z1 + z2) / 2);
  mesh.rotation.z = Math.atan2(x2 - x1, z2 - z1);
  scene.add(mesh);
  return mesh;
}

// Build town
const houses = [
  makeHouse({ x: 10, z: -5, color: 0xd8e2dc }),
  makeHouse({ x: -8, z: -12, color: 0xffe5d9 }),
  makeHouse({ x: -14, z: 8, color: 0xcdeac0 }),
  makeHouse({ x: 8, z: 12, color: 0xa3cef1 })
];

for (let i = 0; i < 12; i++) {
  makeTree({ x: (Math.random() - 0.5) * 60, z: (Math.random() - 0.5) * 60 });
}

houses.forEach(h => {
  const { x, z } = h.position;
  makePath({ x1: 0, z1: 0, x2: x, z2: z, width: 1.8 });
});

// Movement state
const move = { forward: 0, right: 0 };
const SPEED = 6;

if (!isMobile) {
  // Desktop key input
  window.addEventListener('keydown', e => {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') move.forward = 1;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') move.forward = -1;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') move.right = -1;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') move.right = 1;
  });
  window.addEventListener('keyup', e => {
    if ((e.code === 'ArrowUp' || e.code === 'KeyW') && move.forward === 1) move.forward = 0;
    if ((e.code === 'ArrowDown' || e.code === 'KeyS') && move.forward === -1) move.forward = 0;
    if ((e.code === 'ArrowLeft' || e.code === 'KeyA') && move.right === -1) move.right = 0;
    if ((e.code === 'ArrowRight' || e.code === 'KeyD') && move.right === 1) move.right = 0;
  });
} else {
  // Mobile joystick state
  const moveVec = new THREE.Vector2(0, 0);
  let stickId = null;
  const stick = document.getElementById('stick-left');
  const knob = stick.querySelector('.knob');
  function moveKnob(cx, cy) {
    const rect = stick.getBoundingClientRect();
    const dx = cx - (rect.left + rect.width / 2);
    const dy = cy - (rect.top + rect.height / 2);
    const r = rect.width / 2;
    const vec = new THREE.Vector2(dx, dy);
    if (vec.length() > r) vec.setLength(r);
    knob.style.left = `${50 + (vec.x / r) * 50}%`;
    knob.style.top = `${50 + (vec.y / r) * 50}%`;
    moveVec.set(vec.x / r, -(vec.y / r));
  }
  function stickStart(e) {
    const t = (e.changedTouches || [e])[0];
    stickId = t.identifier ?? 'mouse';
    moveKnob(t.clientX, t.clientY);
    e.preventDefault();
  }
  function stickMove(e) {
    for (const t of e.changedTouches || [e]) {
      if ((t.identifier ?? 'mouse') !== stickId) continue;
      moveKnob(t.clientX, t.clientY);
    }
    e.preventDefault();
  }
  function stickEnd(e) {
    for (const t of e.changedTouches || [e]) {
      if ((t.identifier ?? 'mouse') !== stickId) continue;
      stickId = null;
      moveVec.set(0, 0);
      knob.style.left = '50%';
      knob.style.top = '50%';
      knob.style.transform = 'translate(-50%, -50%)';
    }
    e.preventDefault();
  }
  stick.addEventListener('touchstart', stickStart, { passive: false });
  stick.addEventListener('touchmove', stickMove, { passive: false });
  stick.addEventListener('touchend', stickEnd, { passive: false });
  stick.addEventListener('mousedown', stickStart, { passive: false });
  window.addEventListener('mousemove', stickMove, { passive: false });
  window.addEventListener('mouseup', stickEnd, { passive: false });

  // Look area controls
  const lookArea = document.getElementById('look-right');
  let lookActive = false;
  let lastX = 0;
  let lastY = 0;
  function lookStart(e) {
    const t = (e.changedTouches || [e])[0];
    lookActive = true;
    lastX = t.clientX;
    lastY = t.clientY;
    e.preventDefault();
  }
  function lookMove(e) {
    if (!lookActive) return;
    const t = (e.changedTouches || [e])[0];
    const dx = t.clientX - lastX;
    const dy = t.clientY - lastY;
    lastX = t.clientX;
    lastY = t.clientY;
    const sensitivity = 0.0025;
    yaw.rotation.y -= dx * sensitivity;
    const max = Math.PI * 0.47;
    pitch.rotation.x = THREE.MathUtils.clamp(pitch.rotation.x - dy * sensitivity, -max, max);
    e.preventDefault();
  }
  function lookEnd(e) {
    lookActive = false;
    e.preventDefault();
  }
  lookArea.addEventListener('touchstart', lookStart, { passive: false });
  lookArea.addEventListener('touchmove', lookMove, { passive: false });
  lookArea.addEventListener('touchend', lookEnd, { passive: false });
  lookArea.addEventListener('mousedown', lookStart, { passive: false });
  window.addEventListener('mousemove', lookMove, { passive: false });
  window.addEventListener('mouseup', lookEnd, { passive: false });

  // Attach move vector for animation loop
  move.mobile = moveVec;
}

// Collision detection function
function willCollide(nextPos) {
  for (const h of houses) {
    const a = h.userData.aabb;
    if (!a) continue;
    if (
      nextPos.x > a.min.x - 0.3 &&
      nextPos.x < a.max.x + 0.3 &&
      nextPos.z > a.min.z - 0.3 &&
      nextPos.z < a.max.z + 0.3
    ) {
      return true;
    }
  }
  return false;
}

// Animation loop
let last = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  if (!isMobile) {
    // Desktop update
    if (controls.isLocked) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      dir.y = 0;
      dir.normalize();
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(-1);
      const desired = new THREE.Vector3();
      if (move.forward !== 0) desired.add(dir.clone().multiplyScalar(move.forward));
      if (move.right !== 0) desired.add(right.clone().multiplyScalar(move.right));
      if (desired.lengthSq() > 0) {
        desired.normalize().multiplyScalar(SPEED * dt);
        const next = controls.getObject().position.clone().add(desired);
        if (!willCollide(next)) {
          controls.getObject().position.copy(next);
        } else {
          const nextX = controls.getObject().position.clone().add(new THREE.Vector3(desired.x, 0, 0));
          const nextZ = controls.getObject().position.clone().add(new THREE.Vector3(0, 0, desired.z));
          if (!willCollide(nextX)) controls.getObject().position.copy(nextX);
          else if (!willCollide(nextZ)) controls.getObject().position.copy(nextZ);
        }
      }
    }
  } else {
    // Mobile update
    const vec = move.mobile;
    if (vec && (vec.x !== 0 || vec.y !== 0)) {
      const dir = new THREE.Vector3();
      // Forward vector based on yaw rotation
      dir.set(-Math.sin(yaw.rotation.y), 0, -Math.cos(yaw.rotation.y));
      const right = new THREE.Vector3(dir.z, 0, -dir.x);
      const desired = new THREE.Vector3();
      desired.add(dir.multiplyScalar(vec.y)).add(right.multiplyScalar(vec.x));
      desired.normalize().multiplyScalar(SPEED * dt);
      const next = yaw.position.clone().add(desired);
      if (!willCollide(next)) {
        yaw.position.add(desired);
      } else {
        const nextX = yaw.position.clone().add(new THREE.Vector3(desired.x, 0, 0));
        const nextZ = yaw.position.clone().add(new THREE.Vector3(0, 0, desired.z));
        if (!willCollide(nextX)) yaw.position.copy(nextX);
        else if (!willCollide(nextZ)) yaw.position.copy(nextZ);
      }
    }
  }
  renderer.render(scene, camera);
}
animate();

// Resize handling
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
