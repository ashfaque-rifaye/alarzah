import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, Environment, Float, Html, Lightformer, RoundedBox } from '@react-three/drei'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { MutableRefObject, useMemo, useRef } from 'react'
import * as THREE from 'three'

const C = { cool: '#3be8e0', mint: '#7cf5b8', warm: '#ffc15e', ember: '#ff6a3d' }
function thermalColor(t: number, out = new THREE.Color()) {
  const stops: [number, string][] = [[0, C.cool], [0.45, C.mint], [0.75, C.warm], [1, C.ember]]
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) {
    const f = (t - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0])
    return out.set(stops[i - 1][1]).lerp(new THREE.Color(stops[i][1]), f)
  }
  return out.set(C.ember)
}

/** Scroll-driven exploded view: progress 0 = assembled, 1 = fully exploded. */
export function Clip({ progress, labels = false }: { progress?: MutableRefObject<number>; labels?: boolean }) {
  const root = useRef<THREE.Group>(null)
  const top = useRef<THREE.Group>(null), board = useRef<THREE.Group>(null), batt = useRef<THREE.Group>(null)
  const base = useRef<THREE.Group>(null), padL = useRef<THREE.Group>(null), padR = useRef<THREE.Group>(null)
  const padMatL = useRef<THREE.MeshStandardMaterial>(null), padMatR = useRef<THREE.MeshStandardMaterial>(null)
  const led = useRef<THREE.MeshStandardMaterial>(null)
  const labelRefs = useRef<(HTMLDivElement | null)[]>([])
  const glass = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#9fe9ff', metalness: 0, roughness: 0.08, transmission: 0.92, thickness: 0.5, ior: 1.4, clearcoat: 1, transparent: true, opacity: 0.6 }), [])
  const shell = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#0f171d', metalness: 0.55, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 }), [])
  const tmp = useMemo(() => new THREE.Color(), [])
  useFrame(({ clock, pointer }) => {
    const p = progress ? progress.current : 0
    const e = THREE.MathUtils.smoothstep(p, 0.05, 0.75)
    const t = clock.elapsedTime
    root.current!.rotation.y = THREE.MathUtils.lerp(root.current!.rotation.y, pointer.x * 0.45 + Math.sin(t * 0.25) * 0.2 - e * 0.35, 0.06)
    root.current!.rotation.x = THREE.MathUtils.lerp(root.current!.rotation.x, -pointer.y * 0.25 + 0.15 + e * 0.35, 0.06)
    top.current!.position.y = 0.33 + e * 1.1
    board.current!.position.y = 0.26 + e * 0.38
    batt.current!.position.y = 0.16 - e * 0.28
    base.current!.position.y = 0.06 - e * 0.75
    padL.current!.position.set(-0.5 - e * 0.5, -0.95 - e * 0.45, 0.12 + e * 0.3)
    padR.current!.position.set(0.5 + e * 0.5, -0.95 - e * 0.45, 0.12 + e * 0.3)
    const l = (Math.sin(t * 0.7) + 1) / 2, r = (Math.sin(t * 0.7 + 1.9) + 1) / 2
    padMatL.current!.emissive.copy(thermalColor(0.55 + l * 0.45, tmp)); padMatL.current!.color.copy(padMatL.current!.emissive)
    padMatR.current!.emissive.copy(thermalColor(0.05 + r * 0.45, tmp)); padMatR.current!.color.copy(padMatR.current!.emissive)
    led.current!.emissiveIntensity = 2 + Math.sin(t * 3) * 1.5
    labelRefs.current.forEach((el, i) => { if (el) el.style.opacity = String(THREE.MathUtils.clamp((p - 0.3 - i * 0.07) * 6, 0, 1)) })
  })
  const label = (i: number, title: string, sub: string, pos: [number, number, number]) => labels ? (
    <Html position={pos} center distanceFactor={7} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <div ref={el => { labelRefs.current[i] = el }} className="hl" style={{ opacity: 0 }}><b>{title}</b><span>{sub}</span></div>
    </Html>
  ) : null
  return (
    <group ref={root} scale={1.12}>
      <group ref={top}>
        <RoundedBox args={[1.9, 0.18, 0.34]} radius={0.08} smoothness={6} material={glass} />
        {label(0, 'Washable shell', 'medical silicone · no camera, no mic', [1.45, 0.12, 0])}
      </group>
      <group ref={board}>
        <mesh><boxGeometry args={[1.6, 0.05, 0.26]} /><meshStandardMaterial color="#0a2a26" metalness={0.3} roughness={0.5} /></mesh>
        {([[-0.45, 0.24], [0.05, 0.16], [0.42, 0.12]] as const).map(([x, w], i) => (
          <mesh key={i} position={[x, 0.05, 0]}><boxGeometry args={[w, 0.05, 0.14]} /><meshStandardMaterial color="#141a1f" metalness={0.8} roughness={0.3} /></mesh>))}
        {Array.from({ length: 9 }, (_, i) => <mesh key={i} position={[-0.7 + i * 0.17, 0.03, 0.11]}><boxGeometry args={[0.08, 0.005, 0.01]} /><meshStandardMaterial color="#e8c26a" metalness={1} roughness={0.25} /></mesh>)}
        <mesh position={[-0.72, 0.06, 0.08]}><sphereGeometry args={[0.03, 16, 16]} /><meshStandardMaterial ref={led} color={C.cool} emissive={C.cool} toneMapped={false} /></mesh>
        {label(1, 'nRF52840 + motion sensor', 'Bluetooth LE · knows lying from upright', [1.45, 0.05, 0])}
      </group>
      <group ref={batt}>
        <RoundedBox args={[1.2, 0.09, 0.22]} radius={0.04} smoothness={4}><meshStandardMaterial color="#b9c3c9" metalness={0.9} roughness={0.25} /></RoundedBox>
        {label(2, '200 mAh LiPo', '7 days of 1-minute samples', [1.3, -0.02, 0])}
      </group>
      <group ref={base}>
        <RoundedBox args={[1.9, 0.2, 0.34]} radius={0.09} smoothness={6} material={shell} />
      </group>
      {[padL, padR].map((ref, k) => (
        <group key={k} ref={ref}>
          <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.27, 0.27, 0.05, 48]} /><meshStandardMaterial ref={k ? padMatR : padMatL} emissiveIntensity={0.75} roughness={0.35} /></mesh>
          <mesh position={[0, 0.5, -0.04]}><boxGeometry args={[0.035, 0.95, 0.02]} /><meshStandardMaterial color="#c58b3a" metalness={0.8} roughness={0.35} /></mesh>
          {label(3 + k, k ? 'Right pad · MAX30205' : 'Left pad · MAX30205', '±0.1 °C skin temperature', [0, -0.6, 0])}
        </group>
      ))}
    </group>
  )
}

export function Studio() {
  return (
    <>
      <ambientLight intensity={0.25} />
      <directionalLight position={[3, 4, 5]} intensity={1.2} color="#e6fbff" />
      <pointLight position={[-3, -1, 2]} intensity={10} color={C.cool} />
      <pointLight position={[3, -2, 2]} intensity={8} color={C.warm} />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={3} position={[0, 4, 2]} scale={[8, 2, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={2} position={[-5, 0, 0]} rotation-y={Math.PI / 2} scale={[4, 6, 1]} color={C.cool} />
        <Lightformer form="rect" intensity={2} position={[5, 0, 0]} rotation-y={-Math.PI / 2} scale={[4, 6, 1]} color={C.warm} />
        <Lightformer form="ring" intensity={1.5} position={[0, -3, 3]} scale={3} color={C.mint} />
      </Environment>
    </>
  )
}

export default function ClipScene({ height = 520, progress, labels = false, bloom = false }: { height?: number | string; progress?: MutableRefObject<number>; labels?: boolean; bloom?: boolean }) {
  return (
    <div style={{ height, width: '100%' }}>
      <Canvas camera={{ position: [labels ? 0.6 : 0, 0, labels ? 8.4 : 5.2], fov: 38 }} dpr={[1, 1.75]} gl={{ antialias: true, alpha: true }} style={{ overflow: 'visible' }}>
        <Studio />
        <Float speed={1.4} rotationIntensity={0.15} floatIntensity={0.5}><group position={[0, labels ? -0.1 : 0.3, 0]}><Clip progress={progress} labels={labels} /></group></Float>
        <ContactShadows position={[0, -2.3, 0]} opacity={0.45} scale={9} blur={2.8} far={4} color="#000" />
        {bloom && <EffectComposer multisampling={0}><Bloom intensity={0.9} luminanceThreshold={0.55} luminanceSmoothing={0.3} mipmapBlur /></EffectComposer>}
      </Canvas>
    </div>
  )
}
