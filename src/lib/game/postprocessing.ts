// Post-processing pipeline: bloom + FXAA + vignette for cinematic visuals.

import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js'

// Custom vignette shader — darkens the edges of the screen.
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    offset: { value: 1.0 },
    darkness: { value: 1.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float offset;
    uniform float darkness;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - 0.5) * vec2(offset + 0.5);
      float vignette = clamp(1.0 - dot(uv, uv), 0.0, 1.0);
      vignette = pow(vignette, darkness);
      gl_FragColor = vec4(texel.rgb * vignette, texel.a);
    }
  `,
}

export class PostProcessing {
  composer: EffectComposer
  bloomPass: UnrealBloomPass
  vignettePass: ShaderPass
  fxaaPass: ShaderPass
  enabled = true

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.composer = new EffectComposer(renderer)
    this.composer.addPass(new RenderPass(scene, camera))

    // Bloom — makes glowstone and the sun glow.
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.5,  // strength
      0.6,  // radius
      0.85, // threshold (only bright pixels bloom)
    )
    this.composer.addPass(this.bloomPass)

    // Vignette.
    this.vignettePass = new ShaderPass(VignetteShader)
    this.vignettePass.uniforms.offset.value = 0.95
    this.vignettePass.uniforms.darkness.value = 0.7
    this.composer.addPass(this.vignettePass)

    // FXAA — anti-aliasing pass.
    this.fxaaPass = new ShaderPass(FXAAShader)
    this.fxaaPass.material['transparent'] = false
    this.composer.addPass(this.fxaaPass)

    this.resize(window.innerWidth, window.innerHeight)
  }

  setEnabled(on: boolean): void {
    this.enabled = on
  }

  setBloomStrength(v: number): void {
    this.bloomPass.strength = v
  }

  resize(w: number, h: number): void {
    this.composer.setSize(w, h)
    // FXAA needs pixel ratio.
    const pr = Math.min(window.devicePixelRatio, 2)
    this.fxaaPass.material.uniforms['resolution'].value.set(
      1 / (w * pr), 1 / (h * pr),
    )
  }

  render(): void {
    if (this.enabled) {
      this.composer.render()
    }
  }

  dispose(): void {
    this.composer.dispose()
  }
}
