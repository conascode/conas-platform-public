// CONAS HOLDINGS — Corporate Brand Film (15s / 450 frames / 30fps).
// One timeline drives everything: FILM.renderFrame(n) puts the whole film into the
// exact state for frame n (camera, objects, text, post) and draws it. Nothing depends
// on wall-clock time or unseeded randomness, so any frame renders identically.
import * as THREE from 'three';
import { FPS, TOTAL_FRAMES, prog, ease, lerp, clamp, window4, rng } from './util.js';
import { buildEnvironment, materialLibrary, glowTexture, COLORS } from './materials.js';
import { createSymbol } from './symbol.js';
import { createBuilding, TOWER } from './building.js';
import { createNetwork } from './network.js';
import { createGlobe } from './globe.js';
import { createPost } from './post.js';

const W = 1920, H = 1080;

// ---------------------------------------------------------------- key times (s)
const T = {
  textIn: 2.45,
  dollyIn: 2.95,
  cut1: 3.2,            // symbol -> HQ
  craneEnd: 5.85,
  pushEnd: 6.4,
  netSettle: 7.7,
  pullStart: 10.0,
  pullEnd: 12.3,
  rushStart: 12.55,
  cut2: 392 / FPS,      // network -> signature (frame 392, 13.067s)
  fadeOut: 14.55,
};

// ---------------------------------------------------------------- renderer / scene
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = COLORS.bg.clone();
scene.fog = new THREE.FogExp2(new THREE.Color('#070b12'), 0.002);
scene.environment = buildEnvironment(renderer);
const camera = new THREE.PerspectiveCamera(35, W / H, 0.05, 4000);

const key = new THREE.DirectionalLight('#dfe7f2', 1.1);
key.position.set(-30, 60, 40);
scene.add(key);
const rimLight = new THREE.DirectionalLight('#6f9fff', 0.5);
rimLight.position.set(40, 20, -60);
scene.add(rimLight);

const lib = materialLibrary();
const glow = glowTexture(256, 2.0);
const pointGlow = glowTexture(256, 5.0);

// ---------------------------------------------------------------- scene 01 / 05: symbol stage
const stage = new THREE.Group();
scene.add(stage);
const SYM_SCALE = 0.78;
const symbol = createSymbol(lib);
symbol.group.scale.setScalar(SYM_SCALE);
stage.add(symbol.group);

const centerGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: pointGlow, color: new THREE.Color('#d6e4ff'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
stage.add(centerGlow);
const haze = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color('#122036'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
haze.position.set(0, 0, -4);
haze.scale.set(22, 16, 1);
stage.add(haze);

// Metallic particles: start in a loose shell, converge onto the mark's surface.
const PCOUNT = 6000;
const targets = symbol.samplePoints(PCOUNT, 5);
const R = rng(20261110);
const pStart = new Float32Array(PCOUNT * 3), pSeed = new Float32Array(PCOUNT * 4), pCol = new Float32Array(PCOUNT * 3);
for (let i = 0; i < PCOUNT; i++) {
  const u = R() * 2 - 1, th = R() * Math.PI * 2, rad = 2.0 + Math.pow(R(), 0.6) * 5.5;
  const s = Math.sqrt(1 - u * u);
  pStart[i * 3] = Math.cos(th) * s * rad;
  pStart[i * 3 + 1] = u * rad * 0.75;
  pStart[i * 3 + 2] = Math.min(3.2, Math.sin(th) * s * rad) - 0.5;
  pSeed[i * 4] = R();                    // delay
  pSeed[i * 4 + 1] = 0.018 + R() * 0.035; // size
  pSeed[i * 4 + 2] = R();                // phase
  pSeed[i * 4 + 3] = 0.35 + R() * 0.65;  // brightness
  const blue = R() < 0.14;
  pCol[i * 3] = blue ? 0.45 : 0.82; pCol[i * 3 + 1] = blue ? 0.62 : 0.86; pCol[i * 3 + 2] = blue ? 1.0 : 0.92;
  targets[i * 3] *= SYM_SCALE; targets[i * 3 + 1] *= SYM_SCALE; targets[i * 3 + 2] *= SYM_SCALE;
}
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pStart, 3));
pGeo.setAttribute('aTarget', new THREE.BufferAttribute(targets, 3));
pGeo.setAttribute('aSeed', new THREE.BufferAttribute(pSeed, 4));
pGeo.setAttribute('aColor', new THREE.BufferAttribute(pCol, 3));
const pMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  uniforms: { uT: { value: 0 }, uScale: { value: 500 }, uMap: { value: glowTexture(64, 1.6) }, uOpacity: { value: 1 } },
  vertexShader: `
    attribute vec3 aTarget; attribute vec4 aSeed; attribute vec3 aColor;
    uniform float uT, uScale; varying float vA; varying vec3 vC;
    float ioc(float x){ return x < 0.5 ? 4.0*x*x*x : 1.0 - pow(-2.0*x + 2.0, 3.0) / 2.0; }
    void main(){
      float k = ioc(clamp((uT - 0.5 - aSeed.x * 0.85) / 0.9, 0.0, 1.0));
      vec3 drift = vec3(sin(uT*0.7 + aSeed.z*6.28), cos(uT*0.55 + aSeed.z*4.1), sin(uT*0.45 + aSeed.z*2.7)) * 0.18;
      vec3 s = position + drift;
      // swirl around the axis while converging
      float ang = (1.0 - k) * 1.2 * (aSeed.z - 0.5);
      s.xz = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * s.xz;
      vec3 p = mix(s, aTarget, k);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = max(1.0, aSeed.y * uScale / -mv.z);
      float born = smoothstep(0.0, 0.5, uT - aSeed.x * 0.5);
      float gone = 1.0 - smoothstep(2.0, 2.75, uT - aSeed.x * 0.15);
      float spark = 0.75 + 0.25 * sin(uT * 9.0 + aSeed.z * 40.0);
      vA = born * gone * aSeed.w * spark * clamp(gl_PointSize / 1.2, 0.0, 1.0);
      vC = aColor;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `uniform sampler2D uMap; uniform float uOpacity; varying float vA; varying vec3 vC;
    void main(){ float a = texture2D(uMap, gl_PointCoord).a * vA * uOpacity; if (a < 0.003) discard; gl_FragColor = vec4(vC * a * 1.3, a); }`,
});
const particles = new THREE.Points(pGeo, pMat);
particles.frustumCulled = false;
stage.add(particles);

// ---------------------------------------------------------------- scene 02: HQ
const hq = createBuilding(lib);
scene.add(hq.group);
const LOGO = hq.logo.position.clone();

// ---------------------------------------------------------------- scenes 03-04: network + globe
const labelsEl = document.getElementById('labels');
const net = createNetwork(lib, labelsEl);
const N0 = LOGO.clone().sub(net.byId.H.home); // holding company node sits exactly on the rooftop sign
net.group.position.copy(N0);
scene.add(net.group);
const globe = createGlobe(lib, 62);
globe.group.position.set(-6, -78, -92);
net.group.add(globe.group);

const post = createPost(renderer, scene, camera, W, H);

// ---------------------------------------------------------------- DOM text
const $ = (id) => document.getElementById(id);
const dom = {
  lockup: $('lockup'), brand: $('lk-brand'), rule: $('lk-rule'), sub: $('lk-sub'), line: $('lk-line'),
  capHq: $('cap-hq'), capNet: $('cap-net'), net1: $('cap-net-1'), net2: $('cap-net-2'), labels: labelsEl,
};

function reveal(el, k, { spacing0, spacing1, blur = 10, rise = 0 } = {}) {
  const e = ease.outCubic(clamp(k));
  el.style.opacity = String(e);
  el.style.filter = e < 0.999 ? `blur(${((1 - e) * blur).toFixed(2)}px)` : 'none';
  if (spacing0 !== undefined) {
    const s = lerp(spacing0, spacing1, e);
    el.style.letterSpacing = `${s}em`;
    el.style.paddingLeft = `${s}em`;
  }
  el.style.transform = rise ? `translateY(${((1 - e) * rise).toFixed(2)}px)` : '';
}

function updateText(t) {
  const final = t >= T.cut2;
  // Lockup: scene 01 then scene 05 (same composition both times).
  let kBrand, kRule, kSub, kLine = 0, out = 0, outScale = 1;
  if (!final) {
    kBrand = prog(t, T.textIn, T.textIn + 0.4);
    kRule = prog(t, T.textIn + 0.12, T.textIn + 0.45);
    kSub = prog(t, T.textIn + 0.18, T.textIn + 0.52);
    out = prog(t, T.dollyIn + 0.02, T.dollyIn + 0.2);
    outScale = 1 + ease.inCubic(out) * 0.25;
  } else {
    kBrand = prog(t, 13.35, 13.85);
    kRule = prog(t, 13.5, 13.9);
    kSub = prog(t, 13.58, 14.0);
    kLine = prog(t, 13.85, 14.3);
  }
  dom.lockup.style.opacity = String(1 - out);
  dom.lockup.style.transform = `scale(${outScale})`;
  dom.lockup.style.filter = out > 0 ? `blur(${(out * 8).toFixed(2)}px)` : 'none';
  reveal(dom.brand, kBrand, { spacing0: 0.5, spacing1: 0.34, blur: 12 });
  dom.rule.style.width = `${(ease.outCubic(kRule) * 72).toFixed(1)}px`;
  dom.rule.style.opacity = String(kRule);
  reveal(dom.sub, kSub, { spacing0: 1.15, spacing1: 0.9, blur: 6 });
  reveal(dom.line, kLine, { spacing0: 0.68, spacing1: 0.5, blur: 6, rise: 6 });

  // Scene 02 caption.
  const hqK = window4(t, 3.9, 4.45, 5.55, 5.9);
  dom.capHq.style.opacity = String(ease.outCubic(hqK));
  dom.capHq.style.filter = hqK < 0.999 ? `blur(${((1 - hqK) * 6).toFixed(2)}px)` : 'none';
  dom.capHq.querySelector('.tick').style.width = `${(ease.outCubic(prog(t, 3.9, 4.6)) * 46).toFixed(1)}px`;
  dom.capHq.querySelector('.txt').style.letterSpacing = `${lerp(0.5, 0.36, ease.outCubic(prog(t, 3.9, 4.7)))}em`;

  // Scene 04 captions.
  const netOut = 1 - prog(t, 12.1, 12.45);
  dom.capNet.style.opacity = String(netOut);
  for (const [el, a] of [[dom.net1, 10.45], [dom.net2, 10.95]]) {
    const k = prog(t, a, a + 0.5);
    el.style.opacity = String(ease.outCubic(k));
    el.style.filter = k < 0.999 ? `blur(${((1 - k) * 6).toFixed(2)}px)` : 'none';
    el.querySelector('.tick').style.width = `${(ease.outCubic(prog(t, a, a + 0.6)) * 46).toFixed(1)}px`;
    el.querySelector('.txt').style.letterSpacing = `${lerp(0.5, 0.36, ease.outCubic(prog(t, a, a + 0.7)))}em`;
  }
}

// ---------------------------------------------------------------- camera
const tmpV = new THREE.Vector3();
function orbit(target, r, theta, phi) {
  return new THREE.Vector3(
    target.x + r * Math.cos(phi) * Math.sin(theta),
    target.y + r * Math.sin(phi),
    target.z + r * Math.cos(phi) * Math.cos(theta),
  );
}
const STAGE_TARGET = new THREE.Vector3(0, -0.5, 0);
const NET_T1 = () => N0.clone().add(new THREE.Vector3(1.6, -4.9, 4.0));
const NET_T2 = () => N0.clone().add(new THREE.Vector3(-2, -10, -40));
const H_WORLD = () => N0.clone().add(net.byId.H.home);

function cameraAt(t) {
  let pos, target;
  if (t < T.dollyIn) {
    // Scene 01: slow dolly in with a slight orbital drift around the forming structure.
    const k = ease.inOutSine(prog(t, 0, T.dollyIn));
    const d = lerp(10.6, 7.7, k);
    const th = 0.16 * (1 - ease.inOutSine(prog(t, 0, 2.4))) + 0.06 * Math.sin(Math.PI * prog(t, 1.2, 2.7));
    const ph = 0.06 * (1 - k);
    target = STAGE_TARGET.clone();
    pos = orbit(new THREE.Vector3(0, 0, 0), d, th, ph);
    pos.y += target.y;
  } else if (t < T.cut1) {
    // Dolly through the core.
    const k = ease.inExpo(prog(t, T.dollyIn, T.cut1));
    const d = lerp(7.7, 0.55, k);
    target = new THREE.Vector3(0, lerp(-0.5, 0, k), 0);
    pos = new THREE.Vector3(0, target.y, d);
  } else if (t < T.craneEnd) {
    // Scene 02: crane up the tower with a slow orbit, ending square on the rooftop sign.
    const k = prog(t, T.cut1, T.craneEnd);
    const e = ease.inOutCubic(k);
    const eo = ease.outCubic(k);
    const th = lerp(0.52, 0, ease.inOutSine(k));
    const r = lerp(84, 46.25, eo);
    pos = new THREE.Vector3(Math.sin(th) * r, lerp(3, LOGO.y, e), LOGO.z + Math.cos(th) * r);
    target = new THREE.Vector3(0, lerp(46, LOGO.y, ease.inOutCubic(clamp(k * 1.04))), lerp(0, LOGO.z, e));
  } else if (t < T.pushEnd) {
    // Push in toward the façade while the glass turns into data.
    const k = ease.inOutSine(prog(t, T.craneEnd, T.pushEnd));
    target = LOGO.clone();
    pos = new THREE.Vector3(0, LOGO.y, LOGO.z + lerp(46.25, 20.25, k));
  } else if (t < T.netSettle) {
    // Scene 03: pull away from the building, rotate to a diagonal view of the network.
    const k = ease.inOutCubic(prog(t, T.pushEnd, T.netSettle));
    target = LOGO.clone().lerp(NET_T1(), k);
    pos = orbit(target, lerp(20.25, 36, k), lerp(0, 0.44, k), lerp(0, 0.2, k));
  } else if (t < T.pullStart) {
    const k = ease.inOutSine(prog(t, T.netSettle, T.pullStart));
    target = NET_T1();
    pos = orbit(target, lerp(36, 34, k), lerp(0.44, 0.22, k), lerp(0.2, 0.24, k));
  } else if (t < T.pullEnd) {
    // Scene 04: controlled pull back to reveal the wider network and the globe.
    const k = ease.inOutCubic(prog(t, T.pullStart, T.pullEnd));
    target = NET_T1().lerp(NET_T2(), k);
    pos = orbit(target, lerp(34, 125, k), lerp(0.22, 0.5, k), lerp(0.24, 0.3, k));
  } else if (t < T.rushStart) {
    const k = prog(t, T.pullEnd, T.rushStart);
    target = NET_T2();
    pos = orbit(target, lerp(125, 122, k), lerp(0.5, 0.51, k), 0.3);
  } else if (t < T.cut2) {
    // Scene 05: rush to the centre as everything converges into the holding company.
    const k = prog(t, T.rushStart, T.cut2);
    const e = ease.inCubic(k);
    target = NET_T2().lerp(H_WORLD(), ease.outCubic(k));
    pos = orbit(target, lerp(122, 2.2, e), lerp(0.51, 0, ease.inOutSine(k)), lerp(0.3, 0.0, ease.inOutSine(k)));
  } else {
    // Signature: settle, then hold almost still for the last second.
    const k = ease.outQuint(prog(t, T.cut2, 14.0));
    const d = lerp(8.8, 7.75, k) - 0.08 * prog(t, 14.0, 15.0);
    target = STAGE_TARGET.clone();
    pos = new THREE.Vector3(0, target.y, d);
  }
  return { pos, target };
}

// ---------------------------------------------------------------- per-time state
function setState(t) {
  const inStage = t < T.cut1 || t >= T.cut2;
  const inHQ = t >= T.cut1 && t < 6.95;
  const inNet = t >= 6.0 && t < T.cut2;
  const final = t >= T.cut2;

  // camera
  const { pos, target } = cameraAt(t);
  camera.position.copy(pos);
  camera.lookAt(target);
  camera.updateMatrixWorld();

  // environment rotation = moving reflections (light sweeps)
  let envRot;
  if (t < T.cut1) envRot = lerp(1.5, -0.1, ease.inOutSine(prog(t, 0, 3.0)));
  else if (t < 6.4) envRot = lerp(-0.6, 0.9, prog(t, T.cut1, 6.4));
  else if (!final) envRot = lerp(0.9, 1.9, prog(t, 6.4, T.cut2));
  else envRot = lerp(-0.9, 0.25, ease.outCubic(prog(t, T.cut2, 14.3)));
  scene.environmentRotation.set(0, envRot, 0);
  scene.environmentIntensity = 1.0;
  key.intensity = inStage ? 2.4 : inHQ ? 1.0 : 0.25;

  // ---------- stage (symbol) ----------
  stage.visible = inStage;
  if (inStage) {
    if (!final) {
      const ka = prog(t, 0.5, 2.25);
      symbol.setAssembly(ka, 1);
      symbol.pieces.forEach((p) => p.mesh.scale.setScalar(Math.max(0.001, ease.outCubic(clamp((ka - p.delay * 0.6) * 2.4)))));
      const rot = 1 - ease.inOutCubic(prog(t, 0.5, 2.3));
      symbol.group.rotation.set(rot * 0.35, rot * 1.25, rot * -0.1);
      pMat.uniforms.uT.value = t;
      pMat.uniforms.uOpacity.value = 1;
      const g0 = ease.outCubic(prog(t, 0.0, 0.45)) * (1 - 0.7 * prog(t, 0.6, 1.4)) * (1 - prog(t, 1.6, 2.4));
      centerGlow.material.opacity = 0.9 * g0;
      centerGlow.scale.setScalar(lerp(0.25, 1.3, prog(t, 0, 1.2)));
      haze.material.opacity = 0.22 * prog(t, 0.3, 2.0);
      symbol.sweep.uSwPos.value = lerp(-1.4, 1.4, ease.inOutSine(prog(t, 1.5, 2.15)));
      symbol.sweep.uSwAmt.value = window4(t, 1.45, 1.6, 2.05, 2.2);
    } else {
      const ka = ease.outCubic(prog(t, T.cut2, 13.5));
      symbol.setAssembly(ka, 0.32);
      symbol.pieces.forEach((p) => p.mesh.scale.setScalar(1));
      symbol.group.rotation.set(0, (1 - ka) * 0.35, 0);
      pMat.uniforms.uT.value = lerp(1.35, 2.75, prog(t, T.cut2, 13.65));
      pMat.uniforms.uOpacity.value = 0.8;
      centerGlow.material.opacity = 1.0 * (1 - ease.outCubic(prog(t, T.cut2, 13.55)));
      centerGlow.scale.setScalar(lerp(4, 1.2, prog(t, T.cut2, 13.55)));
      haze.material.opacity = 0.22;
      symbol.sweep.uSwPos.value = lerp(-1.4, 1.4, ease.inOutSine(prog(t, 13.4, 14.0)));
      symbol.sweep.uSwAmt.value = window4(t, 13.35, 13.5, 13.9, 14.05);
    }
    symbol.sweep.uSwOrigin.value.set(0, 0, 0);
    symbol.sweep.uSwWidth.value = 0.03;
    const H = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
    pMat.uniforms.uScale.value = H * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  }

  // ---------- HQ ----------
  hq.group.visible = inHQ;
  if (inHQ) {
    const U = hq.uniforms;
    U.uSweepY.value = lerp(-10, 270, ease.inOutSine(prog(t, 3.4, 5.9)));
    U.uSweepAmt.value = 0.55 * window4(t, 3.3, 3.7, 5.6, 6.0);
    U.uUplight.value = 1;
    U.uDataGlow.value = ease.inOutSine(prog(t, 5.8, 6.2));
    U.uDataRadius.value = lerp(0, 300, ease.inCubic(prog(t, 5.8, 6.75)));
    U.uDissolve.value = ease.inQuad(prog(t, 6.12, 6.72));
    const logoK = prog(t, 4.85, 5.45) * (1 - prog(t, 6.1, 6.3));
    hq.textMat.opacity = ease.outCubic(logoK);
    hq.plate.material.opacity = 0.9 * (1 - prog(t, 6.05, 6.3));
    hq.logo.visible = t < 6.3;
    hq.logoSymbol.group.scale.setScalar(3.7 * (1 - ease.inCubic(prog(t, 6.15, 6.3))) + 0.001);
    const ls = hq.logoSymbol.sweep;
    ls.uSwOrigin.value.copy(hq.logoSymbol.group.getWorldPosition(tmpV));
    ls.uSwPos.value = lerp(-5, 5, ease.inOutSine(prog(t, 5.0, 5.6)));
    ls.uSwWidth.value = 0.14;
    ls.uSwAmt.value = window4(t, 4.95, 5.05, 5.5, 5.65);
    hq.sky.material.uniforms.uOpacity.value = 1 - prog(t, 6.1, 6.7);
    // The camera is square on the façade from 6.2s; the city, ground and podium are out of frame.
    hq.ground.visible = hq.city.visible = t < 6.25;
  }

  // fog: city depth in the HQ shot, lighter in the network space
  scene.fog.density = inHQ && t < 6.2 ? 0.0021 : 0.0016;

  // ---------- network + globe ----------
  const converge = prog(t, T.rushStart, T.cut2 - 0.05);
  net.update(t, camera, renderer, {
    visible: inNet,
    labelAlpha: 1 - prog(t, 10.15, 10.6),
    expand: prog(t, 9.95, 10.1),
    converge,
    core: inNet ? ease.inCubic(prog(t, 12.75, T.cut2)) * 1.0 : 0,
  });
  const globeO = inNet ? ease.inOutSine(prog(t, 10.1, 11.2)) * (1 - prog(t, 12.55, 12.9)) : 0;
  const Hpx = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
  globe.update(t, { opacity: globeO, scale: Hpx * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) });

  // ---------- post ----------
  const g = post.grade;
  let flash = 0;
  flash += 0.42 * ease.inCubic(prog(t, 3.0, 3.18)) * (t < T.cut1 ? 1 : 0);
  flash += t >= T.cut1 && t < 4 ? 0.42 * (1 - ease.outCubic(prog(t, T.cut1, 3.55))) : 0;
  flash += 0.05 * window4(t, 2.18, 2.24, 2.3, 2.6);
  flash += t < T.cut2 ? 0.45 * ease.inCubic(prog(t, 12.88, T.cut2)) : 0.45 * (1 - ease.outCubic(prog(t, T.cut2, 13.4)));
  g.uFlash.value = flash;
  g.uFade.value = 1 - ease.inOutSine(prog(t, T.fadeOut, 14.97));
  g.uSeed.value = Math.floor(t * FPS) % 97;
  post.bloom.strength = inHQ ? 0.45 : inNet ? 0.62 : 0.55;
  post.bloom.threshold = inHQ ? 0.8 : 0.78;
  post.bloom.radius = 0.55;
}

function subframesFor(t) {
  if (t >= T.dollyIn && t < T.cut1) return 5;
  if (t >= T.pullStart + 0.3 && t < T.pullEnd - 0.4) return 3;
  if (t >= T.rushStart && t < T.cut2) return 5;
  if (t >= T.cut1 && t < T.cut1 + 0.3) return 3;
  return 1;
}
const SHUTTER = 0.5 / FPS; // 180° shutter

function renderFrame(frame) {
  const f = clamp(Math.round(frame), 0, TOTAL_FRAMES - 1);
  const t = f / FPS;
  const n = subframesFor(t);
  post.render(n, (i) => {
    // last sub-frame is the frame time itself so DOM labels match the final state
    const ts = n === 1 ? t : t - SHUTTER * (n - 1 - i) / (n - 1);
    // keep sub-frames on the same side of a cut
    const tc = (t >= T.cut1 && ts < T.cut1) ? T.cut1 : (t >= T.cut2 && ts < T.cut2) ? T.cut2 : ts;
    setState(tc);
  });
  updateText(t);
  const fade = post.grade.uFade.value;
  for (const el of [dom.lockup, dom.capHq, dom.capNet, dom.labels]) {
    el.style.visibility = fade < 0.002 ? 'hidden' : 'visible';
  }
  dom.lockup.style.opacity = String(Number(dom.lockup.style.opacity) * fade);
  renderer.getContext().finish();
  return t;
}

// ---------------------------------------------------------------- boot
async function boot() {
  await document.fonts.ready;
  await Promise.all([
    document.fonts.load('300 112px "Inter Display"'),
    document.fonts.load('400 30px "Inter Display"'),
    document.fonts.load('500 30px "Inter Display"'),
    document.fonts.load('500 30px "Noto Sans KR"', '서현학원 오름스터디카페'),
  ]);
  // Rooftop sign texture was drawn before fonts settled; redraw it now.
  {
    const c = hq.textMat.map.image;
    const g2 = c.getContext('2d');
    g2.clearRect(0, 0, c.width, c.height);
    g2.fillStyle = '#ffffff';
    g2.font = '300 300px "Inter Display", "Inter", sans-serif';
    g2.letterSpacing = '70px';
    g2.textBaseline = 'middle';
    g2.fillText('CONAS', 30, 270);
    hq.textMat.map.needsUpdate = true;
  }
  // Warm up every shader so frame timing is stable.
  for (const f of [0, 60, 96, 150, 190, 230, 330, 380, 400]) renderFrame(f);
  window.FILM.isReady = true;
}

window.FILM = { isReady: false, renderFrame, FPS, TOTAL_FRAMES };
boot();
