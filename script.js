import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";

const canvas = document.querySelector("#raceScene");
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x07080b, 22, 118);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 220);
camera.position.set(0, 5.2, 13.5);
camera.lookAt(0, 1, -18);

scene.add(new THREE.AmbientLight(0x9dcfff, 0.65));

const keyLight = new THREE.PointLight(0x24d6ff, 5.2, 80);
keyLight.position.set(-7, 8, 5);
scene.add(keyLight);

const rimLight = new THREE.PointLight(0xff415f, 4.2, 70);
rimLight.position.set(9, 5, -18);
scene.add(rimLight);

const road = new THREE.Group();
scene.add(road);

const roadMat = new THREE.MeshStandardMaterial({
  color: 0x111821,
  roughness: 0.72,
  metalness: 0.12,
});

const laneMat = new THREE.MeshStandardMaterial({
  color: 0xc9ff38,
  emissive: 0xc9ff38,
  emissiveIntensity: 1.9,
});

const railMatLeft = new THREE.MeshStandardMaterial({
  color: 0x24d6ff,
  emissive: 0x24d6ff,
  emissiveIntensity: 1.5,
});

const railMatRight = new THREE.MeshStandardMaterial({
  color: 0xff415f,
  emissive: 0xff415f,
  emissiveIntensity: 1.55,
});

function makeBox(width, height, depth, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  return mesh;
}

const roadSegments = [];
for (let i = 0; i < 16; i += 1) {
  const z = -i * 12;
  const segment = makeBox(10, 0.18, 9.5, roadMat, 0, 0, z);
  road.add(segment);
  roadSegments.push(segment);

  const leftRail = makeBox(0.16, 0.24, 8.4, railMatLeft, -5.25, 0.36, z);
  const rightRail = makeBox(0.16, 0.24, 8.4, railMatRight, 5.25, 0.36, z);
  road.add(leftRail, rightRail);
  roadSegments.push(leftRail, rightRail);

  const lane = makeBox(0.18, 0.05, 2.8, laneMat, 0, 0.16, z - 1.8);
  road.add(lane);
  roadSegments.push(lane);
}

const car = new THREE.Group();
scene.add(car);

const bodyMat = new THREE.MeshStandardMaterial({
  color: 0x1f86ff,
  roughness: 0.28,
  metalness: 0.72,
});
const glassMat = new THREE.MeshStandardMaterial({
  color: 0x101721,
  roughness: 0.18,
  metalness: 0.2,
  emissive: 0x1ddfff,
  emissiveIntensity: 0.28,
});
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.5, metalness: 0.35 });
const glowMat = new THREE.MeshStandardMaterial({
  color: 0xffbf47,
  emissive: 0xffbf47,
  emissiveIntensity: 2.3,
});

const body = makeBox(2.9, 0.56, 4.35, bodyMat, 0, 0.95, 0);
const nose = makeBox(2.35, 0.36, 1.35, bodyMat, 0, 0.78, -2.4);
const cabin = makeBox(1.55, 0.48, 1.55, glassMat, 0, 1.36, -0.42);
const spoiler = makeBox(3.2, 0.12, 0.42, bodyMat, 0, 1.48, 2.1);
car.add(body, nose, cabin, spoiler);

for (const x of [-1.52, 1.52]) {
  for (const z of [-1.42, 1.28]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.32, 28), wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.62, z);
    car.add(wheel);
  }
}

const flameLeft = makeBox(0.34, 0.2, 0.78, glowMat, -0.58, 0.82, 2.58);
const flameRight = makeBox(0.34, 0.2, 0.78, glowMat, 0.58, 0.82, 2.58);
car.add(flameLeft, flameRight);
car.position.set(2.1, 0, 3.2);
car.rotation.y = -0.14;

const buildingGroup = new THREE.Group();
scene.add(buildingGroup);

const buildingMats = [
  new THREE.MeshStandardMaterial({ color: 0x151c28, roughness: 0.62, metalness: 0.18 }),
  new THREE.MeshStandardMaterial({ color: 0x211622, roughness: 0.6, metalness: 0.16 }),
  new THREE.MeshStandardMaterial({ color: 0x10242a, roughness: 0.58, metalness: 0.18 }),
];

const buildings = [];
for (let i = 0; i < 34; i += 1) {
  const side = i % 2 === 0 ? -1 : 1;
  const height = 4 + Math.random() * 13;
  const width = 2.8 + Math.random() * 2.4;
  const depth = 5 + Math.random() * 7;
  const z = -i * 5.6 - 6;
  const x = side * (8.8 + Math.random() * 4.2);
  const building = makeBox(width, height, depth, buildingMats[i % buildingMats.length], x, height / 2 - 0.05, z);
  buildingGroup.add(building);
  buildings.push(building);

  const signMat = i % 3 === 0 ? railMatLeft : i % 3 === 1 ? railMatRight : laneMat;
  const sign = makeBox(0.08, 0.75, 1.9, signMat, x - side * (width / 2 + 0.05), height * 0.62, z);
  buildingGroup.add(sign);
  buildings.push(sign);
}

const particles = new THREE.BufferGeometry();
const particleCount = 320;
const positions = new Float32Array(particleCount * 3);
for (let i = 0; i < particleCount; i += 1) {
  positions[i * 3] = (Math.random() - 0.5) * 38;
  positions[i * 3 + 1] = Math.random() * 13 + 0.8;
  positions[i * 3 + 2] = -Math.random() * 116;
}
particles.setAttribute("position", new THREE.BufferAttribute(positions, 3));
const particleMat = new THREE.PointsMaterial({
  color: 0xdff7ff,
  size: 0.055,
  transparent: true,
  opacity: 0.74,
});
const particleField = new THREE.Points(particles, particleMat);
scene.add(particleField);

const revealObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.16 }
);

document.querySelectorAll("[data-reveal]").forEach((el, index) => {
  el.style.transitionDelay = `${Math.min(index * 70, 420)}ms`;
  revealObserver.observe(el);
});

document.querySelector(".signup-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const note = document.querySelector(".form-note");
  note.textContent = "Đã giữ chỗ Beta. Hẹn gặp bạn ở vạch xuất phát.";
  event.currentTarget.reset();
});

function recycleZ(object, speed, resetZ = -142, frontZ = 12) {
  object.position.z += speed;
  if (object.position.z > frontZ) object.position.z = resetZ;
}

function animate(timeMs) {
  const time = timeMs * 0.001;
  const speed = 0.72;

  for (const segment of roadSegments) recycleZ(segment, speed, -180, 16);
  for (const item of buildings) recycleZ(item, speed * 0.82, -190, 20);

  const pos = particles.attributes.position;
  for (let i = 0; i < particleCount; i += 1) {
    const zIndex = i * 3 + 2;
    pos.array[zIndex] += 0.95;
    if (pos.array[zIndex] > 12) pos.array[zIndex] = -118;
  }
  pos.needsUpdate = true;

  car.position.x = 2.1 + Math.sin(time * 1.8) * 0.35;
  car.position.y = Math.sin(time * 3.4) * 0.035;
  car.rotation.z = Math.sin(time * 2.2) * 0.025;
  car.rotation.y = -0.14 + Math.sin(time * 1.6) * 0.04;
  flameLeft.scale.z = 0.7 + Math.sin(time * 23) * 0.22;
  flameRight.scale.z = 0.78 + Math.cos(time * 21) * 0.22;

  camera.position.x = Math.sin(time * 0.8) * 0.36;
  camera.lookAt(0, 1.2, -18);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

window.addEventListener("resize", resize);
requestAnimationFrame(animate);
