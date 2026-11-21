import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useFlow } from '../context/FlowContext.jsx'
import { submitEntry } from '../utils/api.js'

/**
 * The last screen: what the visitor won, and nothing to fill in.
 *
 * There used to be a confirm-your-details form before this. It is gone —
 * registration already collected everything — so this screen makes the
 * final write itself, straight from the registration details.
 *
 * The prize is shown immediately rather than after the save, and that is
 * honest: claimGift already locked the prize onto this visitor's row when
 * the wheel stopped. What this save adds is the score, the answers and the
 * confirmation email. The server still returns a reference, which is kept
 * in the flow state (it marks the entry as saved) but no longer shown.
 */
export default function ThankYouPage() {
  const { visitor, gift, score, questions, answers, entry, setEntry, reset } = useFlow()
  const reduced = useReducedMotion()
  const [status, setStatus] = useState(entry.ref ? 'saved' : 'saving')
  const [error, setError] = useState('')
  // React's dev-mode double effect would otherwise submit twice, and the
  // server answers a repeat submit by re-sending the confirmation email.
  const started = useRef(false)

  const isDud = !gift || gift.tier === 'consolation'
  const isSuper = gift?.tier === 'superpremium'
  const firstName = visitor.name.split(' ')[0]

  const save = useCallback(async () => {
    setStatus('saving')
    setError('')
    const total = questions.length
    const result = await submitEntry({
      name: visitor.name,
      email: visitor.email,
      phone: visitor.mobile,
      organization: visitor.organization,
      designation: visitor.designation,
      score,
      total,
      percent: total ? Math.round((score / total) * 100) : 0,
      gift: gift?.title || '',
      answers,
    })
    if (result.ok) {
      setEntry({ ref: result.ref || '', email: visitor.email, phone: visitor.mobile })
      setStatus('saved')
    } else {
      setError(result.error || 'We couldn’t save your entry.')
      setStatus('error')
    }
  }, [answers, gift, questions.length, score, setEntry, visitor])

  useEffect(() => {
    if (started.current || entry.ref) return
    started.current = true
    save()
  }, [entry.ref, save])

  return (
    <div className="panel panel--narrow panel--center won">
      <motion.span
        className={`won__badge ${isSuper ? 'won__badge--super' : ''} ${isDud ? 'won__badge--dud' : ''}`}
        aria-hidden="true"
        initial={{ scale: reduced ? 1 : 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 14 }}
      >
        {gift?.emoji || '🎉'}
      </motion.span>

      <span className="kicker">Step 04</span>
      <h2 className="panel__title">
        {isDud
          ? `Thanks for playing${firstName ? `, ${firstName}` : ''}!`
          : `Congratulations${firstName ? `, ${firstName}` : ''}!`}
      </h2>

      {isDud ? (
        <p className="panel__sub">The wheel didn’t land on a prize this time — thanks for taking the quiz.</p>
      ) : (
        <>
          <p className="won__label">{isSuper ? 'You hit the jackpot' : 'You won'}</p>
          <p className="won__prize">{gift.title}</p>
        </>
      )}

      <div className="won__status" role="status" aria-live="polite">
        {status === 'saving' && <span className="won__muted">Saving your entry…</span>}
        {status === 'error' && (
          <>
            <span className="won__error">{error}</span>
            <button type="button" className="btn btn--ghost" onClick={save}>Try again</button>
          </>
        )}
      </div>

      {status === 'saved' && visitor.email && (
        <p className="won__muted">A confirmation is on its way to <strong>{visitor.email}</strong>.</p>
      )}

      <div className="actions actions--single">
        {/* Held back until the save lands, so the stall can't reset the
            tablet onto the next player while this entry is still in flight. */}
        <button className="btn btn--gold btn--xl" onClick={reset} disabled={status === 'saving'}>
          Start over
        </button>
      </div>
    </div>
  )
}
