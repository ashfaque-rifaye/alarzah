// The Alarzah Clip reference design: parts, specs, safety, how to wear it. Shared by the app and the website.

export const CLIP_STATUS = 'Reference design · parts specified, bench validation in pilot weeks 0–8'

export const CLIP_PARTS = [
  { id: 'shell', name: 'Outer shell', part: 'Medical-grade silicone overmould', detail: 'ISO 10993 skin-contact grade · IP67 sealed · 38 × 18 × 7 mm · about 6 g', color: '#9fb3bc' },
  { id: 'amb', name: 'Room reference', part: 'Sensirion SHT40', detail: 'On the outer face: air temperature and humidity, so a hot room or car is not mistaken for body heat', color: '#7cc8ff' },
  { id: 'mcu', name: 'Radio + processor', part: 'Nordic nRF52832 module', detail: 'Bluetooth LE 5, pre-certified radio · stores 7 days on board (~80 KB) · syncs when the app opens', color: '#7cf5b8' },
  { id: 'imu', name: 'Posture', part: 'Bosch BMA400 accelerometer', detail: 'Tells upright from lying; the left/right pattern only counts if it appears upright and fades lying down', color: '#c9a6ff' },
  { id: 'battery', name: 'Power', part: 'CR2032 coin cell, 225 mAh', detail: 'Screw-locked door · ~40 µA average · months per cell · no lithium-polymer pouch and no charging on the body', color: '#ffc15e' },
  { id: 'pads', name: 'Skin sensors × 2', part: 'Texas Instruments TMP117', detail: '±0.1 °C from −20 to +50 °C · read every minute · each sealed in a thermally conductive silicone dome, left and right', color: '#3be8e0' },
] as const

export const CLIP_SPECS: [string, string][] = [
  ['Sampling', 'Both pads every 60 s, averaged to 10-minute points (1,008 per pad per week)'],
  ['Accuracy', '±0.1 °C per pad (TMP117 datasheet); checked against a reference thermometer in a water bath before use'],
  ['Why TMP117', 'The MAX30205 body sensor is ±0.1 °C only from 37 to 39 °C. Scrotal skin sits near 32–35 °C, where the TMP117 keeps ±0.1 °C'],
  ['Wear', '3–7 days, day and night; at least 72 hours worn for a result'],
  ['Link', 'Bluetooth LE Health Thermometer profile (GATT 0x1809), LE Secure Connections pairing'],
  ['Battery life', 'About 5 months on one CR2032 (estimate: 225 mAh at ~40 µA average)'],
  ['Cleaning', '70 % alcohol wipe between wears; latex-free'],
  ['Estimated parts cost', 'About US$ 13 at 1,000 units (sensors, radio module, cell, PCB, silicone)'],
]

export const CLIP_SAFETY = [
  ['Passive sensing only', 'No current into the skin, no heating, no light. The sensors only listen to temperature.'],
  ['Low power, sealed', '3 V coin cell, about 0.1 mW in use: no measurable self-heating. Electronics are fully sealed in silicone; no metal touches skin.'],
  ['Child-safe cell', 'The coin-cell door is screw-locked, as button-battery rules require.'],
  ['Radio', 'Bluetooth LE at about 1 mW, far below exposure limits; encrypted pairing.'],
  ['Standards path', 'IEC 60601-1 and 60601-1-11 (home use), 60601-1-2 (EMC), ISO 10993 (biocompatibility), IEC 62304 (software), ISO 14971 (risk). Device class to be agreed with DoH.'],
]

export const POD_PARTS = [
  ['Controller', 'ESP32-C3 with an OLED display and one button'],
  ['Temperature', 'DS18B20 probe against the sample cup; 5 V heater pad switched by a MOSFET'],
  ['Container', 'Insulated cup holder that keeps 20–37 °C for the 60-minute lab window'],
  ['Chain of custody', 'QR with an anonymous order code; a temperature breach marks the sample as unreliable'],
]

export const WEAR_STEPS = [
  { t: 'Pull the tab', d: 'The Clip wakes and its light blinks teal.', tAr: 'اسحب الشريط', dAr: 'يستيقظ المشبك ويومض ضوؤه.', icon: 'tab' },
  { t: 'Pair with this app', d: 'Clip tab → Connect. Pairing is encrypted and carries no name.', tAr: 'اربطه بالتطبيق', dAr: 'من تبويب المشبك ← اتصال. الربط مشفّر ولا يحمل اسمًا.', icon: 'pair' },
  { t: 'Place it', d: 'Clip it to the inside front of snug briefs or trunks. The two soft pads rest on the skin, one left, one right.', tAr: 'ضعه في مكانه', dAr: 'ثبّته في الجهة الأمامية الداخلية لملابس داخلية ضيقة. تلامس الوسادتان الجلد يسارًا ويمينًا.', icon: 'place' },
  { t: 'Wear it 3–7 days', d: 'Day and night, same position. Take it off to shower, swim or use a sauna.', tAr: 'ارتدِه 3–7 أيام', dAr: 'ليلًا ونهارًا في الوضع نفسه. انزعه عند الاستحمام أو السباحة أو الساونا.', icon: 'week' },
  { t: 'Let the phone sync', d: 'Opening the app pulls the stored readings. The live view shows both pads as they change.', tAr: 'دع الهاتف يزامن', dAr: 'فتح التطبيق يسحب القراءات المخزنة، ويعرض العرض المباشر الوسادتين.', icon: 'sync' },
  { t: 'Get your result', d: 'After 72 hours worn, the phone computes heat load and the left/right pattern. Wipe the Clip with alcohol.', tAr: 'احصل على النتيجة', dAr: 'بعد 72 ساعة من الارتداء يحسب الهاتف الحِمل الحراري ونمط اليسار/اليمين.', icon: 'result' },
]

export function StepIcon({ k }: { k: string }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden>
      {k === 'tab' && <><rect x="5" y="11" width="18" height="10" rx="5" {...p} /><path d="M23 16h5" {...p} /><circle cx="10" cy="16" r="1.6" fill="#3be8e0" /></>}
      {k === 'pair' && <><rect x="10" y="4" width="12" height="24" rx="3" {...p} /><path d="M13 12l6 4-6 4M16 8v16" {...p} opacity=".0" /><path d="M14 11.5 18.5 16 14 20.5M16.2 9v14l3.3-3.3L16.2 16.5l3.3-3.2Z" {...p} /></>}
      {k === 'place' && <><path d="M6 9h20l-3 8c-2 6-5 9-7 9s-5-3-7-9Z" {...p} /><circle cx="12.5" cy="19" r="2" fill="#ffc15e" /><circle cx="19.5" cy="19" r="2" fill="#3be8e0" /></>}
      {k === 'week' && <>{[0, 1, 2, 3, 4, 5, 6].map(i => <rect key={i} x={4 + i * 3.6} y={22 - (i % 3) * 3 - 6} width="2.4" height={(i % 3) * 3 + 6} rx="1" fill="currentColor" opacity={0.4 + i * 0.08} />)}</>}
      {k === 'sync' && <><path d="M8 13a8 8 0 0 1 14-3l2 2M24 19a8 8 0 0 1-14 3l-2-2" {...p} /><path d="M24 7v5h-5M8 25v-5h5" {...p} /></>}
      {k === 'result' && <><path d="M5 24h22" {...p} /><path d="M7 20l5-6 4 3 5-8 4 4" {...p} /><circle cx="21" cy="9" r="1.8" fill="#ffc15e" /></>}
    </svg>
  )
}

/** Exploded view of the Clip. `open` is 0 (assembled) … 1 (exploded); pass a MotionValue to drive it by scroll. */
export function ClipExploded({ open = 1, labels = true, width = '100%' }: { open?: number; labels?: boolean; width?: number | string }) {
  const W = labels ? 440 : 240, cx = 112
  // layer: assembled y, exploded y
  const L = [
    { id: 'shell', a: 70, e: 22 }, { id: 'amb', a: 70, e: 22 },
    { id: 'mcu', a: 84, e: 96 }, { id: 'imu', a: 84, e: 96 },
    { id: 'battery', a: 98, e: 168 },
    { id: 'base', a: 108, e: 232 },
    { id: 'pads', a: 150, e: 316 },
  ]
  const yOf = (id: string) => { const l = L.find(x => x.id === id)!; return l.a + (l.e - l.a) * open }
  const ys = { shell: yOf('shell'), mcu: yOf('mcu'), battery: yOf('battery'), base: yOf('base'), pads: yOf('pads') }
  const lab = (y: number, part: (typeof CLIP_PARTS)[number], k: number) => labels && (
    <g key={part.id} opacity={Math.min(1, open * 1.4)}>
      <line x1={cx + 102} x2={262} y1={y} y2={y} stroke={part.color} strokeOpacity=".55" strokeDasharray="2 3" />
      <circle cx={cx + 102} cy={y} r="2.4" fill={part.color} />
      <text x={268} y={y - 3} fill="#eaf2f4" fontSize="14" fontWeight="600" fontFamily="var(--display)">{part.name}</text>
      <text x={268} y={y + 12} fill="#8fa3ad" fontSize="10.5" fontFamily="ui-monospace, Consolas, monospace">{part.part.replace('Medical-grade ', '')}</text>
      <title>{k}</title>
    </g>
  )
  const P = (id: string) => CLIP_PARTS.find(p => p.id === id)!
  return (
    <svg viewBox={`0 0 ${W} 370`} style={{ width, height: 'auto', display: 'block', overflow: 'visible' }} role="img" aria-label="Exploded view of the Alarzah Clip: silicone shell with room sensor, Bluetooth board with posture sensor, coin cell, inner shell, and two skin temperature sensors">
      <defs>
        <linearGradient id="dvShell" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#2a363e" /><stop offset="1" stopColor="#0b1218" /></linearGradient>
        <linearGradient id="dvPcb" x1="0" x2="1"><stop offset="0" stopColor="#0f3a30" /><stop offset="1" stopColor="#0a2620" /></linearGradient>
        <radialGradient id="dvCell" cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#e9eef1" /><stop offset=".55" stopColor="#9aa7ae" /><stop offset="1" stopColor="#56626a" /></radialGradient>
        <radialGradient id="dvPadL" cx=".4" cy=".35"><stop offset="0" stopColor="#ffe0a6" /><stop offset="1" stopColor="#ff9a3d" stopOpacity=".55" /></radialGradient>
        <radialGradient id="dvPadR" cx=".4" cy=".35"><stop offset="0" stopColor="#c8fff7" /><stop offset="1" stopColor="#3be8e0" stopOpacity=".55" /></radialGradient>
        <filter id="dvGlow"><feGaussianBlur stdDeviation="5" /></filter>
      </defs>
      {/* axis */}
      <line x1={cx} x2={cx} y1={12} y2={350} stroke="rgba(255,255,255,.07)" strokeDasharray="3 5" />

      {/* pads + flex tails */}
      <g transform={`translate(0 ${ys.pads})`}>
        <path d={`M${cx - 30} -40 C ${cx - 34} -20, ${cx - 40} -14, ${cx - 42} 0`} stroke="#c98a3d" strokeWidth="3" fill="none" opacity=".8" />
        <path d={`M${cx + 30} -40 C ${cx + 34} -20, ${cx + 40} -14, ${cx + 42} 0`} stroke="#c98a3d" strokeWidth="3" fill="none" opacity=".8" />
        <ellipse cx={cx - 42} cy={4} rx="22" ry="12" fill="#ff9a3d" opacity=".35" filter="url(#dvGlow)" />
        <ellipse cx={cx + 42} cy={4} rx="22" ry="12" fill="#3be8e0" opacity=".35" filter="url(#dvGlow)" />
        <ellipse cx={cx - 42} cy={2} rx="19" ry="10" fill="url(#dvPadL)" />
        <ellipse cx={cx + 42} cy={2} rx="19" ry="10" fill="url(#dvPadR)" />
        <rect x={cx - 46} y={-1} width="8" height="6" rx="1" fill="#1a1a1a" /><rect x={cx + 38} y={-1} width="8" height="6" rx="1" fill="#1a1a1a" />
        <text x={cx - 42} y={26} textAnchor="middle" fill="#ffc15e" fontSize="9" fontFamily="ui-monospace, Consolas, monospace">LEFT</text>
        <text x={cx + 42} y={26} textAnchor="middle" fill="#3be8e0" fontSize="9" fontFamily="ui-monospace, Consolas, monospace">RIGHT</text>
      </g>

      {/* inner shell */}
      <g transform={`translate(0 ${ys.base})`}>
        <rect x={cx - 92} y={-10} width="184" height="20" rx="10" fill="url(#dvShell)" stroke="rgba(255,255,255,.12)" />
        <circle cx={cx - 30} cy={0} r="3" fill="#0b1218" stroke="rgba(255,255,255,.2)" /><circle cx={cx + 30} cy={0} r="3" fill="#0b1218" stroke="rgba(255,255,255,.2)" />
      </g>

      {/* coin cell */}
      <g transform={`translate(0 ${ys.battery})`}>
        <ellipse cx={cx} cy={4} rx="40" ry="11" fill="#3d474e" />
        <ellipse cx={cx} cy={0} rx="40" ry="11" fill="url(#dvCell)" />
        <text x={cx} y={3} textAnchor="middle" fill="#2a3238" fontSize="8.5" fontWeight="700" fontFamily="var(--display)">CR2032 +</text>
      </g>

      {/* PCB */}
      <g transform={`translate(0 ${ys.mcu})`}>
        <rect x={cx - 86} y={-13} width="172" height="26" rx="7" fill="url(#dvPcb)" stroke="#1f6a55" />
        <rect x={cx - 30} y={-9} width="34" height="18" rx="2" fill="#141a1f" stroke="#3a4a52" /><text x={cx - 13} y={3} textAnchor="middle" fill="#7cf5b8" fontSize="6.5" fontFamily="ui-monospace, Consolas, monospace">nRF52</text>
        <rect x={cx + 14} y={-5} width="12" height="10" rx="1.5" fill="#141a1f" stroke="#3a4a52" />
        <path d={`M${cx + 40} -6 h10 v4 h-10 v4 h10 v4 h-10`} stroke="#c98a3d" fill="none" strokeWidth="1.2" />
        <rect x={cx - 74} y={-4} width="8" height="8" rx="1.5" fill="#141a1f" stroke="#3a4a52" />
        {[-60, -52, 64, 72].map(x => <circle key={x} cx={cx + x} cy={0} r="1.6" fill="#c98a3d" />)}
      </g>

      {/* outer shell */}
      <g transform={`translate(0 ${ys.shell})`}>
        <rect x={cx - 96} y={-17} width="192" height="34" rx="17" fill="url(#dvShell)" stroke="rgba(255,255,255,.18)" />
        <rect x={cx - 90} y={-14} width="180" height="6" rx="3" fill="rgba(255,255,255,.06)" />
        <circle cx={cx - 70} cy={0} r="3.2" fill="#3be8e0" /><circle cx={cx - 70} cy={0} r="7" fill="#3be8e0" opacity=".25" filter="url(#dvGlow)" />
        {[0, 1, 2].map(i => <rect key={i} x={cx + 58 + i * 7} y={-5} width="3" height="10" rx="1.5" fill="rgba(0,0,0,.5)" />)}
        <path d={`M${cx - 18} -3 c4 -4 8 4 12 0 s8 -4 10 0 M${cx - 18} 4 c4 -4 8 4 12 0 s8 -4 10 0`} stroke="rgba(255,255,255,.35)" strokeWidth="1.3" fill="none" />
      </g>

      {labels && <>
        {lab(yOf('shell') - 10, P('shell'), 0)}{lab(yOf('shell') + 28, P('amb'), 1)}
        {lab(yOf('mcu') - 8, P('mcu'), 2)}{lab(yOf('mcu') + 28, P('imu'), 3)}
        {lab(yOf('battery'), P('battery'), 4)}{lab(yOf('pads'), P('pads'), 5)}
      </>}
    </svg>
  )
}
