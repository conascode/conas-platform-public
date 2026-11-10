// Scene 02: the CONAS headquarters tower.
// Realistic, symmetric glass tower: dark curtain wall with floor spandrels and a few lit
// offices, brushed-metal vertical fins, a black-marble podium and a dim surrounding city.
// One shared shader hook adds the light sweep, base uplight and the "glass becomes data"
// dissolve used for the transition into Scene 03.
import * as THREE from 'three';
import { rng } from './util.js';
import { COLORS } from './materials.js';
import { createSymbol } from './symbol.js';

export const TOWER = {
  half: 16,          // half width of the shaft footprint
  chamfer: 3.2,
  base: 11.5,        // top of podium
  shaftTop: 232,
  crownTop: 252,
  logoY: 242,
};

export function createBuilding(lib) {
  const group = new THREE.Group();
  group.name = 'hq';

  const U = {
    uDissolve: { value: 0 },
    uDataGlow: { value: 0 },
    uDataCenter: { value: new THREE.Vector3(0, TOWER.logoY, TOWER.half) },
    uDataRadius: { value: 0 },
    uSweepY: { value: -100 },
    uSweepAmt: { value: 0 },
    uUplight: { value: 1 },
    uBlue: { value: COLORS.blue.clone().multiplyScalar(1.6) },
  };

  function arch(material, { windows = false, cellW = 3.2, floorH = 4.0, spandrel = '#11161d', lit = 0.9 } = {}) {
    material.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.defines = sh.defines || {};
      sh.defines.CELLW = cellW.toFixed(3);
      sh.defines.FLOORH = floorH.toFixed(3);
      sh.defines.LITCUT = lit.toFixed(3);
      if (windows) sh.defines.AR_WINDOWS = '';
      sh.uniforms.uSpandrel = { value: new THREE.Color(spandrel) };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vArPos; varying vec3 vArNrm;')
        .replace('#include <project_vertex>', `#include <project_vertex>
          vec4 arp = vec4(transformed, 1.0);
          mat3 arn = mat3(modelMatrix);
          #ifdef USE_INSTANCING
            arp = instanceMatrix * arp;
            arn = arn * mat3(instanceMatrix);
          #endif
          vArPos = (modelMatrix * arp).xyz;
          vArNrm = normalize(arn * objectNormal);`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vArPos; varying vec3 vArNrm;
          uniform float uDissolve, uDataGlow, uDataRadius, uSweepY, uSweepAmt, uUplight;
          uniform vec3 uDataCenter, uBlue, uSpandrel;
          float arHash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
          vec2 arCell(){
            float hc = abs(vArNrm.x) > 0.5 ? vArPos.z : vArPos.x;
            return vec2(hc / CELLW, vArPos.y / FLOORH);
          }
          float arDissolveValue(){
            vec3 c = floor(vArPos / vec3(CELLW, FLOORH, CELLW));
            float dd = length(vArPos - uDataCenter);
            return arHash(c) * 0.32 + clamp(dd / 230.0, 0.0, 1.0) * 0.64;
          }`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          float arDV = arDissolveValue();
          if (arDV < uDissolve) discard;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          #ifdef AR_WINDOWS
            float arSp = step(fract(arCell().y), 0.17);
            diffuseColor.rgb = mix(diffuseColor.rgb, uSpandrel, arSp);
          #endif`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          #ifdef AR_WINDOWS
            roughnessFactor = mix(roughnessFactor, 0.38, step(fract(arCell().y), 0.17));
          #endif`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          vec2 arC = arCell();
          vec2 arI = floor(arC); vec2 arF = fract(arC);
          float arGx = min(arF.x, 1.0 - arF.x) * CELLW;
          float arGy = min(arF.y, 1.0 - arF.y) * FLOORH;
          float arLine = 1.0 - smoothstep(0.0, 0.05, min(arGx, arGy));
          #ifdef AR_WINDOWS
            float arFace = abs(vArNrm.x) > 0.5 ? sign(vArNrm.x) * 3.0 : sign(vArNrm.z) * 7.0;
            float arH = arHash(vec3(arI, arFace));
            float arLit = step(LITCUT, arH) * (1.0 - step(arF.y, 0.17)) * (0.25 + 0.75 * arHash(vec3(arI + 7.0, arFace)));
            // soft edges so a lit office is not a flat tile
            arLit *= smoothstep(0.0, 0.18, arF.x) * smoothstep(1.0, 0.82, arF.x) * smoothstep(0.17, 0.4, arF.y);
            float arWarm = arHash(vec3(arI + 3.0, arFace));
            vec3 arLc = mix(vec3(0.62, 0.70, 0.84), vec3(0.92, 0.86, 0.74), step(0.75, arWarm));
            // interior falloff: brighter toward the ceiling of each floor
            arLit *= 0.55 + 0.45 * smoothstep(0.2, 1.0, arF.y);
            totalEmissiveRadiance += arLc * arLit * 0.11 * (1.0 - uDataGlow);
          #endif
          float arDD = length(vArPos - uDataCenter);
          float arFront = 1.0 - smoothstep(uDataRadius - 30.0, uDataRadius, arDD);
          totalEmissiveRadiance += uBlue * arLine * arFront * uDataGlow * 0.85;
          totalEmissiveRadiance += uBlue * 0.012 * arFront * uDataGlow;
          float arEdge = 1.0 - smoothstep(0.0, 0.012, arDV - uDissolve);
          totalEmissiveRadiance += uBlue * arEdge * arLine * step(0.001, uDissolve) * 1.4;
          float arSw = (vArPos.y - uSweepY);
          totalEmissiveRadiance += vec3(0.70, 0.78, 0.90) * exp(-arSw * arSw / 40.0) * uSweepAmt * (0.12 + arLine * 0.45);
          totalEmissiveRadiance += vec3(0.50, 0.58, 0.72) * exp(-max(vArPos.y, 0.0) / 16.0) * uUplight * 0.22;`);
    };
    material.customProgramCacheKey = () => `arch-${windows}-${cellW}-${floorH}-${lit}`;
    return material;
  }

  // ---------- materials ----------
  const glass = arch(new THREE.MeshPhysicalMaterial({
    color: '#0b1321', metalness: 0.9, roughness: 0.06, envMapIntensity: 1.35, clearcoat: 0.4, clearcoatRoughness: 0.05,
  }), { windows: true, cellW: 3.2, floorH: 4.0, lit: 0.955 });
  const finBase = lib.brushedFrame();
  finBase.roughness = 0.5;
  finBase.envMapIntensity = 0.75;
  const finMat = arch(finBase, { cellW: 3.2, floorH: 4.0 });
  const marble = arch(lib.marble(), { cellW: 4, floorH: 4 });
  const graphite = arch(lib.graphite(), { cellW: 4, floorH: 4 });
  const lobby = arch(new THREE.MeshPhysicalMaterial({
    color: '#0e1622', metalness: 0.6, roughness: 0.08, envMapIntensity: 1.2, emissive: '#9fb2c9', emissiveIntensity: 0.16,
  }), { windows: true, cellW: 2.4, floorH: 9.0, lit: 2.0 });
  const cityGlass = arch(new THREE.MeshPhysicalMaterial({
    color: '#0a1019', metalness: 0.75, roughness: 0.18, envMapIntensity: 0.9,
  }), { windows: true, cellW: 3.0, floorH: 3.8, lit: 0.975 });

  const m = lib.textures.marble;
  m.repeat.set(4, 4);

  // ---------- tower shaft (chamfered square, extruded upward) ----------
  const chamferRect = (h, c) => {
    const s = new THREE.Shape();
    s.moveTo(-h + c, -h); s.lineTo(h - c, -h); s.lineTo(h, -h + c); s.lineTo(h, h - c);
    s.lineTo(h - c, h); s.lineTo(-h + c, h); s.lineTo(-h, h - c); s.lineTo(-h, -h + c); s.closePath();
    return s;
  };
  const prism = (half, chamfer, y0, y1, mat) => {
    const g = new THREE.ExtrudeGeometry(chamferRect(half, chamfer), { depth: y1 - y0, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.translate(0, y0, 0);
    const mesh = new THREE.Mesh(g, mat);
    group.add(mesh);
    return mesh;
  };
  prism(TOWER.half, TOWER.chamfer, TOWER.base, TOWER.shaftTop, glass);
  // Crown: slight setback, same glass, capped by graphite roof.
  // Crown glass carries the signage, so no lit offices behind the letters.
  const crownGlass = arch(new THREE.MeshPhysicalMaterial({
    color: '#0b1321', metalness: 0.9, roughness: 0.06, envMapIntensity: 1.35, clearcoat: 0.4, clearcoatRoughness: 0.05,
  }), { windows: true, cellW: 3.2, floorH: 4.0, lit: 2.0 });
  prism(TOWER.half - 1.2, TOWER.chamfer, TOWER.shaftTop, TOWER.crownTop, crownGlass);
  prism(TOWER.half - 1.6, TOWER.chamfer, TOWER.crownTop, TOWER.crownTop + 0.8, graphite);
  // Thin metal reveal between shaft and crown.
  prism(TOWER.half + 0.25, TOWER.chamfer, TOWER.shaftTop - 0.4, TOWER.shaftTop + 0.5, finMat);

  // ---------- vertical fins on the four flat faces ----------
  const finGeo = new THREE.BoxGeometry(0.34, 1, 0.9);
  finGeo.translate(0, 0.5, 0);
  const finsPerFace = Math.floor(((TOWER.half - TOWER.chamfer) * 2) / 3.2) + 1;
  const crownFins = Math.floor(((TOWER.half - 1.2 - TOWER.chamfer) * 2) / 3.2) + 1;
  const fins = new THREE.InstancedMesh(finGeo, finMat, (finsPerFace + crownFins) * 4);
  const tmp = new THREE.Object3D();
  let fi = 0;
  const placeFins = (half, n, y0, y1) => {
    const span = (half - TOWER.chamfer) * 2;
    for (let face = 0; face < 4; face++) {
      for (let i = 0; i < n; i++) {
        const u = -span / 2 + (i * span) / (n - 1);
        const off = half + 0.45;
        const a = (face * Math.PI) / 2;
        tmp.position.set(Math.sin(a) * off + Math.cos(a) * u, y0, Math.cos(a) * off - Math.sin(a) * u);
        tmp.rotation.set(0, a, 0);
        tmp.scale.set(1, y1 - y0, 1);
        tmp.updateMatrix();
        fins.setMatrixAt(fi++, tmp.matrix);
      }
    }
  };
  placeFins(TOWER.half, finsPerFace, TOWER.base, TOWER.shaftTop);
  placeFins(TOWER.half - 1.2, crownFins, TOWER.shaftTop + 0.5, TOWER.crownTop);
  fins.count = fi;
  group.add(fins);

  // ---------- podium: glass lobby under a marble canopy, on a marble plinth ----------
  const box = (w, h, d, x, y, z, mat) => {
    const g = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(x, y + h / 2, z);
    group.add(mesh);
    return mesh;
  };
  box(74, 0.8, 74, 0, 0, 0, marble);               // plinth
  box(44, 8.2, 44, 0, 0.8, 0, lobby);              // lobby glass
  box(60, 2.5, 60, 0, 9.0, 0, marble);             // canopy slab
  box(60.4, 0.25, 60.4, 0, 8.95, 0, finMat);       // metal reveal under canopy
  // Entrance columns.
  for (let i = -2; i <= 2; i++) box(0.7, 8.2, 0.7, i * 8.5, 0.8, 28.5, finMat);

  // ---------- ground ----------
  const groundTex = lib.textures.marble.clone();
  groundTex.needsUpdate = true;
  groundTex.repeat.set(40, 40);
  const groundMat = arch(new THREE.MeshPhysicalMaterial({
    map: groundTex, color: '#7f8a99', metalness: 0.1, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2, envMapIntensity: 0.6,
  }), { cellW: 6, floorH: 6 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), groundMat);
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  // ---------- surrounding city (dim, lower than the HQ) ----------
  const R = rng(4242);
  const cityGeo = new THREE.BoxGeometry(1, 1, 1);
  cityGeo.translate(0, 0.5, 0);
  const city = new THREE.InstancedMesh(cityGeo, cityGlass, 140);
  let ci = 0;
  for (let gx = -7; gx <= 7; gx++) {
    for (let gz = -7; gz <= 7; gz++) {
      const x = gx * 62 + (R() - 0.5) * 20, z = gz * 62 + (R() - 0.5) * 20;
      const d = Math.hypot(x, z);
      if (d < 95 || d > 460 || ci >= 140) continue;
      if (R() < 0.3) continue;
      const near = 1 - Math.min(1, (d - 95) / 360);
      const h = 30 + R() * 90 + near * 40;
      tmp.position.set(x, 0, z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(20 + R() * 18, h, 20 + R() * 18);
      tmp.updateMatrix();
      city.setMatrixAt(ci++, tmp.matrix);
    }
  }
  city.count = ci;
  group.add(city);

  // ---------- rooftop signage on the crown (front face) ----------
  const logo = new THREE.Group();
  logo.position.set(0, TOWER.logoY, TOWER.half - 1.2 + 0.95);
  const sym = createSymbol(lib);
  sym.setAssembly(1);
  sym.group.scale.setScalar(3.7);
  sym.group.position.set(-9.6, 0, 0.3);
  logo.add(sym.group);

  const c = document.createElement('canvas');
  c.width = 2048; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.font = '300 300px "Inter Display", "Inter", sans-serif';
  g.letterSpacing = '70px';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText('CONAS', 30, 270);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const textMat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, color: new THREE.Color(1.15, 1.18, 1.22),
  });
  const textPlane = new THREE.Mesh(new THREE.PlaneGeometry(19, 4.75), textMat);
  textPlane.position.set(5.6, 0, 0.35);
  logo.add(textPlane);
  // Backing panel so the sign reads against the glass.
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(31, 10.5), new THREE.MeshPhysicalMaterial({
    color: '#05080d', metalness: 0.7, roughness: 0.35, transparent: true, opacity: 0.9,
  }));
  plate.position.z = 0.05;
  plate.visible = false; // signage sits directly on the crown glass
  group.add(logo);

  // ---------- night sky dome ----------
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uOpacity: { value: 1 } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec3 vD; uniform float uOpacity;
      void main(){
        float y = max(vD.y, 0.0);
        vec3 c = mix(vec3(0.045,0.065,0.10), vec3(0.008,0.012,0.022), pow(y, 0.45));
        c += vec3(0.05,0.08,0.13) * exp(-y*16.0);
        gl_FragColor = vec4(c * uOpacity, 1.0);
      }`,
  }));
  group.add(sky);

  return { group, uniforms: U, logo, logoSymbol: sym, textMat, plate, sky, ground, city };
}
