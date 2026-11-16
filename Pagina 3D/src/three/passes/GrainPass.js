import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/* ---------------------------------------------------------------
   Final lens pass: vignette, a whisper of chromatic aberration at
   the edges, and animated grain. Runs after OutputPass, so it works
   in display space where 1/255 of noise is exactly 1/255 of noise.
   --------------------------------------------------------------- */

const GrainShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAmount: { value: 0.028 },
    uVignette: { value: 1 },
    uAberration: { value: 0.0022 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAmount;
    uniform float uVignette;
    uniform float uAberration;

    varying vec2 vUv;

    void main() {
      vec2 centered = vUv - 0.5;
      float r2 = dot(centered, centered);

      // radial split: zero in the middle, a couple of pixels in the corners
      vec2 offset = centered * r2 * uAberration;

      vec4 color;
      color.r = texture2D(tDiffuse, vUv + offset).r;
      color.g = texture2D(tDiffuse, vUv).g;
      color.b = texture2D(tDiffuse, vUv - offset).b;
      color.a = 1.0;

      float vignette = smoothstep(1.02, 0.32, length(centered) * 1.32);
      color.rgb *= mix(1.0, vignette, uVignette);

      float grain = fract(sin(dot(vUv * 1024.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      color.rgb += (grain - 0.5) * uAmount;

      gl_FragColor = color;
    }
  `,
};

export function createGrainPass() {
  const pass = new ShaderPass(GrainShader);
  pass.material.depthTest = false;
  pass.material.depthWrite = false;
  return pass;
}

export { GrainShader };
