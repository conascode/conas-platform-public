// Environment lighting and the material library.
// Reflections come from a procedural "studio at night" environment: a dark navy dome,
// a soft cool horizon band and a few softbox strips. Rotating it sweeps highlights
// across metal and glass, which is how the light sweeps in the film are done.
import * as THREE from 'three';
import { rng } from './util.js';

export const COLORS = {
  bg: new THREE.Color('#05070B'),
  bg2: new THREE.Color('#0A101A'),
  text: new THREE.Color('#F3F5F7'),
  silver: new THREE.Color('#AEB8C4'),
  blue: new THREE.Color('#4A8DFF'),
  cyan: new THREE.Color('#54D9E8'),
};

export function buildEnvironment(renderer) {
  const env = new THREE.Scene();

  // Dome: vertical gradient, near-black below the horizon, deep navy above.
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {},
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec3 vDir;
      void main(){
        float y = vDir.y;
        vec3 top = vec3(0.014,0.018,0.026);
        vec3 hor = vec3(0.050,0.058,0.074);
        vec3 bot = vec3(0.005,0.006,0.008);
        vec3 c = y > 0. ? mix(hor, top, pow(y, .55)) : mix(hor*.6, bot, pow(-y,.35));
        c += vec3(.09,.11,.15) * exp(-abs(y)*22.) * .7; // thin horizon glow
        gl_FragColor = vec4(c,1.);
      }`,
  });
  env.add(new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), domeMat));

  const strip = (w, h, intensity, color, pos, lookAt) => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    p.position.copy(pos);
    p.lookAt(lookAt);
    env.add(p);
  };
  const O = new THREE.Vector3();
  // Key softbox overhead-front, long silver strips at the sides, faint blue kicker behind.
  strip(30, 9, 4.2, '#e9eef4', new THREE.Vector3(0, 30, 18), O);      // key softbox
  strip(6, 44, 3.0, '#dde3ea', new THREE.Vector3(-34, 4, 8), O);      // left strip
  strip(4, 44, 2.0, '#d3dae3', new THREE.Vector3(34, 4, -4), O);      // right strip
  strip(30, 2, 0.9, '#7aa6ff', new THREE.Vector3(0, -6, -38), O);     // faint blue kicker
  strip(10, 10, 1.3, '#cfd6df', new THREE.Vector3(26, 24, -20), O);
  strip(40, 6, 0.35, '#9aa6b5', new THREE.Vector3(0, -30, 10), O);    // floor bounce

  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.015).texture;
  pmrem.dispose();
  return tex;
}

/** Concentric "spun metal" roughness map for the symbol (shape coords -1..1 mapped to 0..1). */
function spunMetalTexture(size = 1024) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const R = rng(7);
  const rings = new Float32Array(2048);
  for (let i = 0; i < rings.length; i++) rings[i] = R();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x / size - 0.5, dy = y / size - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy) * 2;
      const k = Math.floor(r * 1400) % rings.length;
      const n = rings[k] * 0.6 + rings[(k * 7 + 3) % rings.length] * 0.4;
      const v = 120 + n * 70; // roughness ~0.47..0.75 before material factor
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.repeat.set(0.5, 0.5);
  t.offset.set(0.5, 0.5);
  t.anisotropy = 4;
  return t;
}

/** Linear brushing streaks (for building fins / panel frames). */
function brushedTexture(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const R = rng(11);
  g.fillStyle = 'rgb(140,140,140)';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const v = 100 + R() * 110;
    g.fillStyle = `rgba(${v},${v},${v},${0.08 + R() * 0.15})`;
    g.fillRect(0, R() * size, size, 0.5 + R() * 1.2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Black marble: dark base with faint silver veins (value noise, seeded). */
function marbleTexture(size = 1024) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const R = rng(23);
  const G = 64;
  const grid = new Float32Array(G * G);
  for (let i = 0; i < grid.length; i++) grid[i] = R();
  const vn = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const s = (a) => a * a * (3 - 2 * a);
    const at = (i, j) => grid[((j % G + G) % G) * G + ((i % G + G) % G)];
    const a = at(xi, yi), b = at(xi + 1, yi), cc = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * s(xf) + (cc - a) * s(yf) + (a - b - cc + d) * s(xf) * s(yf);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * 8, v = (y / size) * 8;
      let n = 0, amp = 1, f = 1;
      for (let o = 0; o < 5; o++) { n += vn(u * f, v * f) * amp; amp *= 0.5; f *= 2; }
      const vein = Math.pow(1 - Math.abs(Math.sin((u + v * 0.6 + n * 3.2) * 1.7)), 18);
      const base = 10 + n * 6;
      const val = base + vein * 60;
      const i = (y * size + x) * 4;
      img.data[i] = val * 0.95; img.data[i + 1] = val; img.data[i + 2] = val * 1.08; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

let cache = null;
export function materialLibrary() {
  if (cache) return cache;
  const spun = spunMetalTexture();
  const brushed = brushedTexture();
  const marble = marbleTexture();

  cache = {
    textures: { spun, brushed, marble },
    // 1. Brushed titanium — warm-neutral silver, medium roughness, spun grain.
    titanium: () => new THREE.MeshPhysicalMaterial({
      color: '#d3d9e0', metalness: 1, roughness: 0.38, roughnessMap: spun, envMapIntensity: 1.6,
    }),
    // 2. Dark chrome — near-mirror, deep tone.
    darkChrome: () => new THREE.MeshPhysicalMaterial({
      color: '#7d8590', metalness: 1, roughness: 0.08, envMapIntensity: 1.5,
    }),
    // Polished silver (logo core).
    silver: () => new THREE.MeshPhysicalMaterial({
      color: '#d8dee6', metalness: 1, roughness: 0.16, clearcoat: 0.6, clearcoatRoughness: 0.08, envMapIntensity: 1.5,
    }),
    // 3. Smoked glass.
    smokedGlass: (opacity = 0.62) => new THREE.MeshPhysicalMaterial({
      color: '#0b121d', metalness: 0.25, roughness: 0.22, clearcoat: 0.5, clearcoatRoughness: 0.2,
      transparent: true, opacity, envMapIntensity: 0.7, depthWrite: false,
    }),
    // 4. Black marble.
    marble: () => new THREE.MeshPhysicalMaterial({
      color: '#ffffff', map: marble, metalness: 0, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.9,
    }),
    // 5. Matte graphite.
    graphite: () => new THREE.MeshPhysicalMaterial({
      color: '#1a1e24', metalness: 0.55, roughness: 0.7, envMapIntensity: 0.7,
    }),
    // 7. Brushed linear metal for architectural fins and panel frames.
    brushedFrame: () => {
      const t = brushed.clone();
      t.needsUpdate = true;
      return new THREE.MeshPhysicalMaterial({ color: '#9aa4b0', metalness: 1, roughness: 0.38, roughnessMap: t, envMapIntensity: 1.1 });
    },
  };
  return cache;
}

/** Soft radial sprite texture used for glows, particles and data pulses. */
export function glowTexture(size = 128, falloff = 2.2) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size * 2 - 1, dy = (y + 0.5) / size * 2 - 1;
      const r = Math.min(1, Math.sqrt(dx * dx + dy * dy));
      const v = Math.pow(1 - r, falloff);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(v * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
