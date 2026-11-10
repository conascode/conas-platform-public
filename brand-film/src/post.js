// Post-processing: render -> subtle bloom -> ACES tone mapping -> grade
// (vignette, seeded grain, fade, light burst). Motion blur is done by averaging
// several sub-frame renders into an accumulation buffer before presenting.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Depth-based ambient occlusion (Alchemy-style, 12 taps) and depth of field
// (32-tap gather). Both read the depth texture of the main render, so the scene
// is only drawn once per sub-frame.
const VIEWPOS = `
  uniform sampler2D tDepth; uniform float uNear, uFar; uniform vec2 uProj; // proj[0][0], proj[1][1]
  float linZ(vec2 uv){ float d = texture2D(tDepth, uv).x; return (uNear * uFar) / ((uFar - uNear) * d - uFar); } // negative view z
  vec3 viewPos(vec2 uv){ float z = linZ(uv); vec2 ndc = uv * 2.0 - 1.0; return vec3(ndc.x * -z / uProj.x, ndc.y * -z / uProj.y, z); }
`;

class DepthPass extends Pass {
  constructor(fragment, uniforms, shared) {
    super();
    this.shared = shared;
    this.material = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, tDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 100 }, uProj: { value: new THREE.Vector2(1, 1) }, uRes: { value: new THREE.Vector2(1, 1) }, ...uniforms },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: fragment,
      depthTest: false, depthWrite: false,
    });
    this.uniforms = this.material.uniforms;
    this.quad = new FullScreenQuad(this.material);
  }
  render(renderer, writeBuffer, readBuffer) {
    if (readBuffer.depthTexture && !this.shared.depth) this.shared.depth = readBuffer.depthTexture;
    const cam = this.shared.camera;
    this.uniforms.tColor.value = readBuffer.texture;
    this.uniforms.tDepth.value = this.shared.depth;
    this.uniforms.uNear.value = cam.near;
    this.uniforms.uFar.value = cam.far;
    this.uniforms.uProj.value.set(cam.projectionMatrix.elements[0], cam.projectionMatrix.elements[5]);
    this.uniforms.uRes.value.set(readBuffer.width, readBuffer.height);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

const AO_FRAG = `varying vec2 vUv; uniform sampler2D tColor; uniform vec2 uRes; uniform float uAoRadius, uAoIntensity;
  ${VIEWPOS}
  void main(){
    vec4 col = texture2D(tColor, vUv);
    float d = texture2D(tDepth, vUv).x;
    if (d >= 0.99999 || uAoIntensity <= 0.0) { gl_FragColor = col; return; }
    vec3 P = viewPos(vUv);
    vec3 N = normalize(cross(dFdx(P), dFdy(P)));
    vec2 rUv = vec2(uAoRadius * uProj.x, uAoRadius * uProj.y) / -P.z * 0.5;
    float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float occ = 0.0;
    for (int i = 0; i < 12; i++) {
      float fi = float(i);
      float a = fi * 2.39996 + noise * 6.2831;
      float r = (fi + 0.5) / 12.0;
      vec2 suv = vUv + vec2(cos(a), sin(a)) * rUv * r;
      vec3 Q = viewPos(suv);
      vec3 v = Q - P;
      float vv = dot(v, v);
      float range = 1.0 - smoothstep(0.0, uAoRadius * uAoRadius, vv);
      occ += max(0.0, dot(v, N) - 0.02 * -P.z) / (vv + 0.002 * P.z * P.z) * range;
    }
    float ao = clamp(1.0 - uAoIntensity * occ / 12.0 * uAoRadius, 0.0, 1.0);
    gl_FragColor = vec4(col.rgb * mix(1.0, ao, 0.9), col.a);
  }`;

const DOF_FRAG = `varying vec2 vUv; uniform sampler2D tColor; uniform vec2 uRes; uniform float uFocus, uAperture, uMaxBlur;
  ${VIEWPOS}
  float coc(vec2 uv){ float z = -linZ(uv); return min(uMaxBlur, uAperture * abs(z - uFocus) / max(z, 1e-3)) * uRes.y / 1080.0; }
  void main(){
    float c0 = coc(vUv);
    vec4 base = texture2D(tColor, vUv);
    if (c0 < 0.6 || uAperture <= 0.0) { gl_FragColor = base; return; }
    vec3 acc = base.rgb; float wsum = 1.0;
    for (int i = 0; i < 32; i++) {
      float fi = float(i);
      float r = sqrt((fi + 0.5) / 32.0) * c0;
      float a = fi * 2.39996;
      vec2 suv = vUv + vec2(cos(a), sin(a)) * r / uRes;
      float cs = coc(suv);
      float w = smoothstep(r - 1.0, r + 1.0, max(cs, c0 * 0.6));
      acc += texture2D(tColor, suv).rgb * w; wsum += w;
    }
    gl_FragColor = vec4(acc / wsum, base.a);
  }`;

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uFade: { value: 1 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color('#cfe0ff') },
    uVignette: { value: 0.42 },
    uGrain: { value: 0.018 },
    uSeed: { value: 0 },
    uAspect: { value: 16 / 9 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uFade, uFlash, uVignette, uGrain, uSeed, uAspect; uniform vec3 uFlashColor;
    varying vec2 vUv;
    float h(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
      float r = length(q);
      // Cool lift in the shadows toward midnight navy, keep highlights neutral.
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c += vec3(0.004, 0.008, 0.016) * (1.0 - smoothstep(0.0, 0.25, l));
      c *= 1.0 - uVignette * smoothstep(0.35, 1.05, r);
      // Light burst: center-weighted, never a flat white frame.
      float burst = uFlash * (0.35 + 0.65 * exp(-r * r * 3.2));
      c = c + uFlashColor * burst;
      c *= uFade;
      float g = h(vUv * 1000.0 + uSeed * 17.31) - 0.5;
      c += g * uGrain * (0.4 + 0.6 * (1.0 - l));
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export function createPost(renderer, scene, camera, width, height) {
  const dpr = renderer.getPixelRatio();
  const w = Math.round(width * dpr), h = Math.round(height * dpr);
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
  rt.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
  const composer = new EffectComposer(renderer, rt);
  composer.renderToScreen = false;
  composer.setPixelRatio(1);
  composer.setSize(w, h);

  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.5, 0.55, 0.82);
  const output = new OutputPass();
  const grade = new ShaderPass(GradeShader);
  const shared = { camera, depth: null };
  const aoPass = new DepthPass(AO_FRAG, { uAoRadius: { value: 0.5 }, uAoIntensity: { value: 0.0 } }, shared);
  const dofPass = new DepthPass(DOF_FRAG, { uFocus: { value: 10 }, uAperture: { value: 0 }, uMaxBlur: { value: 14 } }, shared);
  composer.addPass(renderPass);
  composer.addPass(aoPass);
  composer.addPass(dofPass);
  composer.addPass(bloom);
  composer.addPass(output);
  composer.addPass(grade);

  // accumulation
  const accum = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const addMat = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, uWeight: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: `uniform sampler2D tSrc; uniform float uWeight; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tSrc, vUv).rgb * uWeight, 1.0); }`,
    blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true,
  });
  const copyMat = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: `uniform sampler2D tSrc; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){ vec3 c = texture2D(tSrc, vUv).rgb; c += (h(gl_FragCoord.xy) - 0.5) / 255.0; gl_FragColor = vec4(c, 1.0); }`,
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(quadGeo, addMat);
  const quadScene = new THREE.Scene();
  quadScene.add(quad);

  /** renderSub(i) sets up the scene for sub-frame i, then this renders + accumulates. */
  function render(subframes, setupSub) {
    renderer.setRenderTarget(accum);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    for (let i = 0; i < subframes; i++) {
      setupSub(i);
      shared.depth = null; // re-captured from whichever buffer RenderPass drew into
      composer.render();
      quad.material = addMat;
      addMat.uniforms.tSrc.value = composer.readBuffer.texture;
      addMat.uniforms.uWeight.value = 1 / subframes;
      renderer.setRenderTarget(accum);
      renderer.autoClear = false;
      renderer.render(quadScene, quadCam);
      renderer.autoClear = true;
    }
    quad.material = copyMat;
    copyMat.uniforms.tSrc.value = accum.texture;
    renderer.setRenderTarget(null);
    renderer.render(quadScene, quadCam);
  }

  return { composer, bloom, grade: grade.uniforms, ao: aoPass.uniforms, dof: dofPass.uniforms, render };
}
