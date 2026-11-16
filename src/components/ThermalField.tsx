import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

/**
 * A living thermal map: domain-warped noise drawn as glowing topographic isotherms.
 * The pointer is a heat source; it warms the field where it moves and the heat slowly diffuses away.
 */
const frag = /* glsl */ `
precision highp float;
uniform float uTime; uniform vec2 uRes; uniform vec2 uMouse; uniform float uHeat; uniform float uIntensity;
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for(int i=0;i<5;i++){ v += a*noise(p); p = m*p; a *= 0.5; } return v; }
vec3 thermal(float t){
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(0.016,0.027,0.043), c1 = vec3(0.04,0.18,0.26), c2 = vec3(0.23,0.91,0.88), c3 = vec3(0.49,0.96,0.72), c4 = vec3(1.0,0.76,0.37), c5 = vec3(1.0,0.42,0.24);
  if (t < 0.25) return mix(c0, c1, t/0.25);
  if (t < 0.5) return mix(c1, c2, (t-0.25)/0.25);
  if (t < 0.68) return mix(c2, c3, (t-0.5)/0.18);
  if (t < 0.85) return mix(c3, c4, (t-0.68)/0.17);
  return mix(c4, c5, (t-0.85)/0.15);
}
void main(){
  vec2 uv = vUv; vec2 p = (uv - 0.5) * vec2(uRes.x/uRes.y, 1.0) * 2.2;
  float t = uTime * 0.035;
  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p + 3.0*q + vec2(1.7, 9.2) + t*1.3), fbm(p + 3.0*q + vec2(8.3, 2.8) - t));
  float f = fbm(p + 2.6*r);
  vec2 m = (uMouse - 0.5) * vec2(uRes.x/uRes.y, 1.0) * 2.2;
  float d = length(p - m);
  float heat = exp(-d*d*2.6) * uHeat;
  float field = f*0.9 + heat*0.55;
  float temp = smoothstep(0.28, 0.95, field);
  // glowing isotherms (topographic thermal lines)
  float bands = field * 14.0;
  float line = 1.0 - smoothstep(0.0, 0.06 + 0.04*heat, abs(fract(bands) - 0.5));
  vec3 col = thermal(temp) * (0.22 + 0.5*temp);
  col += thermal(temp + 0.12) * line * (0.18 + 0.9*temp*temp + heat*0.6);
  col += vec3(1.0, 0.55, 0.3) * heat * 0.12;
  float vig = smoothstep(1.35, 0.25, length((uv-0.5)*vec2(1.25,1.0)));
  col *= vig * uIntensity;
  gl_FragColor = vec4(col, 1.0);
}`
const vert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`

function Plane({ intensity }: { intensity: number }) {
  const mat = useRef<THREE.ShaderMaterial>(null)
  const { size } = useThree()
  const target = useRef(new THREE.Vector2(0.72, 0.45))
  const heat = useRef(0.35)
  const uniforms = useMemo(() => ({
    uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uMouse: { value: new THREE.Vector2(0.72, 0.45) },
    uHeat: { value: 0.35 }, uIntensity: { value: intensity },
  }), [intensity])
  useFrame(({ clock, pointer }, dt) => {
    const u = mat.current!.uniforms
    u.uTime.value = clock.elapsedTime
    u.uRes.value.set(size.width, size.height)
    const nx = pointer.x * 0.5 + 0.5, ny = pointer.y * 0.5 + 0.5
    const moved = Math.hypot(nx - target.current.x, ny - target.current.y)
    target.current.set(nx, ny)
    heat.current = Math.min(1.2, heat.current + moved * 6) * (1 - dt * 0.35) + dt * 0.04
    u.uHeat.value = THREE.MathUtils.lerp(u.uHeat.value, heat.current, 0.08)
    u.uMouse.value.lerp(target.current, 0.06)
  })
  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial ref={mat} vertexShader={vert} fragmentShader={frag} uniforms={uniforms} depthWrite={false} />
    </mesh>
  )
}

export default function ThermalField({ intensity = 1 }: { intensity?: number }) {
  return (
    <Canvas dpr={[1, 1.25]} gl={{ antialias: false, powerPreference: 'high-performance' }} style={{ position: 'absolute', inset: 0 }} eventSource={typeof document !== 'undefined' ? document.body : undefined} eventPrefix="client">
      <Plane intensity={intensity} />
    </Canvas>
  )
}
