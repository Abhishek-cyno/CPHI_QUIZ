import { motion, useReducedMotion } from 'framer-motion'

/* =========================================================
   Backdrop — the room the whole app sits in
   ---------------------------------------------------------
   Three layers, back to front:
     glow     · two soft radial lights, gold and steel blue
     lattice  · a faint hexagonal grid (benzene-ring nod),
                drawn in CSS from an inline SVG tile
     capsules · a handful of two-tone pills drifting slowly

   All of it is decoration: aria-hidden, pointer-events off,
   and the capsules stop moving under reduced motion.
   ========================================================= */

const CAPSULES = [
  { top: '12%', left: '6%', size: 64, rotate: -28, duration: 16, delay: 0 },
  { top: '68%', left: '3%', size: 44, rotate: 34, duration: 19, delay: 2 },
  { top: '20%', left: '88%', size: 52, rotate: 52, duration: 17, delay: 1 },
  { top: '78%', left: '90%', size: 70, rotate: -14, duration: 21, delay: 3 },
  { top: '46%', left: '94%', size: 30, rotate: 80, duration: 14, delay: 0.5 },
]

export default function Backdrop() {
  const reduced = useReducedMotion()

  return (
    <div className="backdrop" aria-hidden="true">
      <span className="backdrop__glow backdrop__glow--gold" />
      <span className="backdrop__glow backdrop__glow--steel" />
      <span className="backdrop__lattice" />

      {CAPSULES.map((c, i) => (
        <motion.span
          key={i}
          className="capsule"
          style={{ top: c.top, left: c.left, width: c.size, height: c.size * 0.42, rotate: c.rotate }}
          animate={reduced ? undefined : { y: [0, -18, 0], rotate: [c.rotate, c.rotate + 10, c.rotate] }}
          transition={{ duration: c.duration, delay: c.delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}
