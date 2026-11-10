// Post-processing: render -> subtle bloom -> ACES tone mapping -> grade
// (vignette, seeded grain, fade, light burst). Motion blur is done by averaging
// several sub-frame renders into an accumulation buffer before presenting.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

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
  const composer = new EffectComposer(renderer, rt);
  composer.renderToScreen = false;
  composer.setPixelRatio(1);
  composer.setSize(w, h);

  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.5, 0.55, 0.82);
  const output = new OutputPass();
  const grade = new ShaderPass(GradeShader);
  composer.addPass(renderPass);
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

  return { composer, bloom, grade: grade.uniforms, render };
}
