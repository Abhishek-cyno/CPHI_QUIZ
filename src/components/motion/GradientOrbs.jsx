import { motion, useReducedMotion } from 'framer-motion'
import { orbLoop } from '../../animations/motion.js'

/* =========================================================
   GradientOrbs — soft blurred depth layer
   ---------------------------------------------------------
   Heavily blurred colour blobs that breathe and wander behind the
   content. The blur is a static CSS filter; only transforms are
   animated, so the browser rasterises each orb once and then just
   moves the layer around.
   ========================================================= */

// Two navies and two golds, so the depth layer reads as the Eqova pair
// rather than the generic blue wash it started as. The golds sit lower on
// the page and at a lower alpha — gold at this blur radius goes muddy long
// before navy does.
const DEFAULT_ORBS = [
  { size: 460, top: '-14%', left: '-8%', color: 'rgba(61, 144, 185, 0.34)', duration: 22, delay: 0 },
  { size: 380, top: '8%', left: '62%', color: 'rgba(179, 212, 229, 0.50)', duration: 19, delay: 1.5, x: -30 },
  { size: 300, top: '58%', left: '38%', color: 'rgba(248, 196, 112, 0.30)', duration: 23, delay: 3, y: 26 },
  { size: 260, top: '62%', left: '80%', color: 'rgba(244, 172, 60, 0.20)', duration: 26, delay: 0.8, x: -20 },
]

export default function GradientOrbs({ orbs = DEFAULT_ORBS, className = '' }) {
  const reduced = useReducedMotion()

  return (
    <div className={`orbs ${className}`} aria-hidden="true">
      {orbs.map((orb, i) => (
        <motion.span
          key={i}
          className="orbs__orb"
          style={{
            width: orb.size,
            height: orb.size,
            top: orb.top,
            left: orb.left,
            background: `radial-gradient(circle at 32% 30%, ${orb.color}, transparent 68%)`,
            willChange: reduced ? 'auto' : 'transform',
          }}
          {...orbLoop(reduced, {
            scale: orb.scale ?? 1.14,
            x: orb.x ?? 26,
            y: orb.y ?? 20,
            duration: orb.duration ?? 20,
            delay: orb.delay ?? 0,
          })}
        />
      ))}
    </div>
  )
}
