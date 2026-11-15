import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, Float, RoundedBox, Sparkles } from '@react-three/drei'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

function thermalColor(t: number) {
  const c = new THREE.Color()
  const stops = [[0, '#3be8e0'], [0.45, '#7cf5b8'], [0.75, '#ffc15e'], [1, '#ff6a3d']] as const
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) { const f = (t - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]); return c.set(stops[i - 1][1]).lerp(new THREE.Color(stops[i][1]), f) }
  }
  return c.set('#ff6a3d')
}

function Pad({ x, phase }: { x: number; phase: number }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  const ring = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const t = (Math.sin(clock.elapsedTime * 0.6 + phase) + 1) / 2
    const col = thermalColor(0.15 + t * 0.75)
    mat.current!.color.copy(col); mat.current!.emissive.copy(col)
    const s = 1 + ((clock.elapsedTime * 0.5 + phase) % 1) * 0.9
    ring.current!.scale.setScalar(s)
    ;(ring.current!.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - ((clock.elapsedTime * 0.5 + phase) % 1))
    ;(ring.current!.material as THREE.MeshBasicMaterial).color.copy(col)
  })
  return (
    <group position={[x, -0.95, 0.12]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.32, 0.32, 0.06, 48]} />
        <meshStandardMaterial ref={mat} emissiveIntensity={0.55} roughness={0.35} metalness={0.3} toneMapped={false} />
      </mesh>
      <mesh ref={ring} position={[0, 0, 0.04]}>
        <ringGeometry args={[0.36, 0.4, 64]} />
        <meshBasicMaterial transparent side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.48, -0.02]}>
        <boxGeometry args={[0.04, 0.6, 0.03]} />
        <meshStandardMaterial color="#26323a" metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  )
}

function Clip() {
  const g = useRef<THREE.Group>(null)
  const led = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(({ clock, pointer }) => {
    g.current!.rotation.y = THREE.MathUtils.lerp(g.current!.rotation.y, pointer.x * 0.6 + Math.sin(clock.elapsedTime * 0.3) * 0.25, 0.05)
    g.current!.rotation.x = THREE.MathUtils.lerp(g.current!.rotation.x, -pointer.y * 0.3 + 0.12, 0.05)
    led.current!.emissiveIntensity = 1.5 + Math.sin(clock.elapsedTime * 3) * 1.2
  })
  const bodyMat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#141c22', metalness: 0.35, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15, sheen: 0.4, sheenColor: new THREE.Color('#3be8e0') }), [])
  return (
    <group ref={g} scale={1.08} position={[0, 0.35, 0]}>
      <RoundedBox args={[1.9, 0.82, 0.32]} radius={0.16} smoothness={8} material={bodyMat} position={[0, 0.25, 0]} />
      <mesh position={[0, 0.25, 0.165]}>
        <planeGeometry args={[1.55, 0.5]} />
        <meshPhysicalMaterial color="#0b1217" roughness={0.1} metalness={0.1} transmission={0.2} clearcoat={1} />
      </mesh>
      <mesh position={[-0.55, 0.3, 0.17]}>
        <circleGeometry args={[0.045, 32]} />
        <meshStandardMaterial ref={led} color="#3be8e0" emissive="#3be8e0" />
      </mesh>
      {[-0.2, 0.05, 0.3, 0.55].map((x, i) => (
        <mesh key={i} position={[x, 0.18, 0.17]}>
          <planeGeometry args={[0.14, 0.03 + i * 0.03]} />
          <meshBasicMaterial color={i > 2 ? '#ffc15e' : '#7cf5b8'} transparent opacity={0.85} />
        </mesh>
      ))}
      <Pad x={-0.48} phase={0} />
      <Pad x={0.48} phase={1.7} />
    </group>
  )
}

export default function ClipScene({ height = 520 }: { height?: number | string }) {
  return (
    <div style={{ height, width: '100%' }}>
      <Canvas camera={{ position: [0, 0, 5.2], fov: 38 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.35} />
        <directionalLight position={[3, 4, 5]} intensity={1.6} color="#dff8ff" />
        <pointLight position={[-3, -1, 2]} intensity={14} color="#3be8e0" />
        <pointLight position={[3, -2, 2]} intensity={10} color="#ffc15e" />
        <Float speed={1.6} rotationIntensity={0.25} floatIntensity={0.6}>
          <Clip />
        </Float>
        <Sparkles count={60} scale={[6, 4, 3]} size={2.2} speed={0.35} color="#7cf5b8" opacity={0.6} />
        <ContactShadows position={[0, -1.7, 0]} opacity={0.5} scale={8} blur={2.6} far={3} color="#000" />
      </Canvas>
    </div>
  )
}
