import { useState } from 'react'
import { useFlow, STEPS } from '../context/FlowContext.jsx'
import Float from '../components/motion/Float.jsx'
import { capitalizeName } from '../utils/formatName.js'
import { registerVisitor, prefetchEligibility } from '../utils/api.js'
import PhoneInput from '../components/PhoneInput.jsx'
import { splitPhone, joinPhone } from '../utils/phone.js'
import formImg from '../assets/doctor-form.png'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * Name, mobile and email — that is the whole form. The doctor app asks for
 * a specialty and a category here because it picks questions from them;
 * this campaign draws every question from one shared bank, so there is
 * nothing to branch on and nothing more to ask.
 *
 * Email moves up to this step (the doctor app collects it at the very end)
 * so the entry is complete from the first submit, and the screen after the
 * wheel is a confirmation rather than a second round of data entry.
 */
export default function RegisterPage() {
  const { setStep, visitor, setVisitor } = useFlow()
  const [name, setName] = useState(visitor.name)
  const [countryCode, setCountryCode] = useState(() => splitPhone(visitor.mobile).code)
  const [mobile, setMobile] = useState(() => splitPhone(visitor.mobile).number)
  const [email, setEmail] = useState(visitor.email)
  const [error, setError] = useState('')

  function onSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return setError('Please enter your name.')
    if (mobile.length !== 10) return setError('Please enter a valid 10-digit mobile number.')
    if (!EMAIL_RE.test(email.trim())) return setError('Please enter a valid email address.')
    setError('')

    const details = {
      name: capitalizeName(name).trim(),
      mobile: joinPhone(countryCode, mobile),
      email: email.trim(),
    }
    setVisitor(details)
    // Best-effort, not awaited: this is what puts the visitor's first row in
    // the Sheet (see registerVisitor() in utils/api.js), but a slow or failed
    // request shouldn't hold up starting the quiz — the claim and submit
    // steps later fall back to creating that row themselves if this one
    // never lands.
    registerVisitor(details)
    prefetchEligibility(details.mobile)
    setStep(STEPS.QUIZINTRO)
  }

  return (
    <div className="split">
      <div className="split__main">
        <h2 className="card__title">Let's get to know you</h2>
        <p className="card__sub">Please enter your details to continue.</p>

        <form className="form" onSubmit={onSubmit}>
          <label className="field">
            <span className="field__label">Full Name</span>
            <input
              className="field__input"
              type="text"
              placeholder="Shivangi Mittal"
              value={name}
              onChange={(e) => setName(capitalizeName(e.target.value))}
              autoCapitalize="words"
              autoFocus
            />
          </label>

          <PhoneInput
            id="register-mobile"
            label="Mobile Number"
            code={countryCode}
            number={mobile}
            onCodeChange={setCountryCode}
            onNumberChange={setMobile}
          />

          <label className="field">
            <span className="field__label">
              Email <span className="field__hint">(where we send your confirmation)</span>
            </span>
            <input
              className="field__input"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          {error && <p className="form__error">{error}</p>}

          <div className="form__actions">
            <button type="button" className="btn btn--ghost" onClick={() => setStep(STEPS.LANDING)}>
              Back
            </button>
            <button type="submit" className="btn btn--primary">
              Continue <span className="btn__arrow">→</span>
            </button>
          </div>
        </form>
      </div>

      <div className="split__aside">
        <Float amplitude={7} duration={6}>
          <img className="art" src={formImg} alt="" />
        </Float>
      </div>
    </div>
  )
}
