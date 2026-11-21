// The whole visitor journey in a real browser, on both a stall tablet and a
// phone (see playwright.config.mjs). The Apps Script is faked, so these
// tests can play, spin and "win" as often as they like.
import { test, expect } from '@playwright/test'
import { fakeBackend, QUESTIONS, GIFTS, REF } from './backend.mjs'

const VISITOR = {
  name: 'Asha Verma',
  mobile: '9876543210',
  organization: 'Sun Pharmaceutical Industries Ltd',
  designation: 'Senior QA Manager',
  email: 'asha@example.com',
}

/** Nothing on the page may push it wider than the screen — not even mid-spin. */
async function expectNoSideScroll(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'page is wider than the screen').toBeLessThanOrEqual(0)
}

/** A lone button must sit in the middle of its card, not in a left-hand column. */
async function expectCentred(page, button) {
  const btn = await button.boundingBox()
  const card = await button.locator('xpath=ancestor::*[contains(@class,"panel")][1]').boundingBox()
  const offset = Math.abs((btn.x + btn.width / 2) - (card.x + card.width / 2))
  expect(offset, 'button is off-centre in its card').toBeLessThanOrEqual(2)
}

// Fields are found by their visible labels, not placeholders, so rewording
// a placeholder (e.g. the designation example) never breaks these tests.
// Continue goes straight into the quiz — there is no "ready?" screen.
async function register(page, { designation = VISITOR.designation } = {}) {
  await page.getByRole('button', { name: /Test your knowledge/ }).click()
  await page.getByLabel(/^Full name/).fill(VISITOR.name)
  await page.getByLabel(/^Mobile number/).fill(VISITOR.mobile)
  await page.getByLabel(/^Organization/).fill(VISITOR.organization)
  await page.getByLabel(/^Designation/).fill(designation)
  await page.getByLabel(/^Email/).fill(VISITOR.email)
  await page.getByRole('button', { name: /Continue/ }).click()
  await expect(page.locator('.quiz__question')).toBeVisible()
}

/** Answers each question right or wrong per `plan`, using the real answer key. */
async function answer(page, plan) {
  for (const right of plan) {
    await expect(page.locator('.choice:not([disabled])').first()).toBeVisible()
    const text = (await page.locator('.quiz__question').innerText()).trim()
    const question = QUESTIONS.find((q) => q.q === text)
    expect(question, `question on screen is not in the bank: "${text}"`).toBeTruthy()
    const pick = right ? question.answer : (question.answer + 1) % 4
    await page.locator('.choice').nth(pick).click()
    await expect(page.locator('.verdict')).toHaveText(right ? /Correct/ : /Not quite/)
    await page.getByRole('button', { name: /Next question|See my score/ }).click()
  }
}

async function spin(page) {
  const hub = page.locator('.wheel__hub')
  await expect(hub).toBeEnabled()
  await expectNoSideScroll(page)
  await hub.click()
  await page.waitForTimeout(1500)
  await expectNoSideScroll(page) // a rotating wheel briefly reports a larger box
  await expect(page.locator('.prize')).toBeVisible()
}

test('register, play, spin and see the prize — saved once with every field', async ({ page }) => {
  const posts = await fakeBackend(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Think you know/ })).toBeVisible()
  await expect(page.locator('.teaser__bulb')).toBeVisible()
  await expect(page.locator('.rules')).toHaveCount(0)
  await expect(page.getByText(/Answer three pharma questions/)).toHaveCount(0)
  await expectNoSideScroll(page)

  await register(page)
  await answer(page, [true, true, false])

  await expect(page.locator('.score__value')).toHaveText(/^2\s*\/\s*3$/)
  await expectCentred(page, page.getByRole('button', { name: /Spin the wheel/ }))
  await page.getByRole('button', { name: /Spin the wheel/ }).click()
  await spin(page)
  await page.getByRole('button', { name: /^Continue/ }).click()

  // Straight to the result: no second form, no reference, no stall line.
  await expect(page.getByRole('heading', { name: /Congratulations, Asha/ })).toBeVisible()
  await expect(page.locator('form')).toHaveCount(0)
  await expect(page.getByText(`A confirmation is on its way to ${VISITOR.email}`)).toBeVisible()
  await expect(page.locator('.won__ref')).toHaveCount(0)
  await expect(page.getByText(REF)).toHaveCount(0)
  await expect(page.getByText(/Collect it/)).toHaveCount(0)
  await expect(page.locator('.won__status'), 'no empty box once saved').toBeHidden()
  await expectCentred(page, page.getByRole('button', { name: /Start over/ }))
  await expectNoSideScroll(page)

  const claim = posts.find((p) => p.action === 'claimGift')
  const winnable = [...GIFTS.superpremium, ...GIFTS.premium, ...GIFTS.standard]
    .filter((g) => g.active !== false && g.stock !== 0).map((g) => g.id)
  expect(winnable, 'the wheel must never land on an out-of-stock or withdrawn prize').toContain(claim.id)

  const submits = posts.filter((p) => p.action === 'submit')
  expect(submits, 'the entry must be saved exactly once').toHaveLength(1)
  expect(submits[0]).toMatchObject({
    name: VISITOR.name,
    phone: `+91 ${VISITOR.mobile}`,
    email: VISITOR.email,
    organization: VISITOR.organization,
    designation: VISITOR.designation,
    score: 2,
    total: 3,
  })
  expect(submits[0].answers).toHaveLength(3)

  await page.getByRole('button', { name: /Start over/ }).click()
  await expect(page.getByRole('button', { name: /Test your knowledge/ })).toBeVisible()
})

test('registration requires organization and email, but not designation', async ({ page }) => {
  await fakeBackend(page)
  await page.goto('/')
  await page.getByRole('button', { name: /Test your knowledge/ }).click()

  // Required fields carry a star; the optional one carries nothing at all.
  for (const label of ['Full name', 'Mobile number', 'Organization', 'Email']) {
    await expect(page.locator('.field__label', { hasText: label }).locator('.field__req')).toHaveText('*')
  }
  await expect(page.locator('.field__label', { hasText: 'Designation' }).locator('.field__req')).toHaveCount(0)
  await expect(page.getByText(/optional/i)).toHaveCount(0)
  await expect(page.getByPlaceholder('Your company')).toBeVisible()
  await expect(page.getByPlaceholder('e.g. Senior Manager')).toBeVisible()

  await page.getByLabel(/^Full name/).fill(VISITOR.name)
  await page.getByLabel(/^Mobile number/).fill(VISITOR.mobile)

  const cont = page.getByRole('button', { name: /Continue/ })
  await cont.click()
  await expect(page.getByRole('alert')).toHaveText(/organization/i)
  await page.getByLabel(/^Organization/).fill(VISITOR.organization)
  await cont.click()
  await expect(page.getByRole('alert')).toHaveText(/email/i) // designation left blank is fine
  await page.getByLabel(/^Email/).fill('not-an-email')
  await cont.click()
  await expect(page.getByRole('alert')).toHaveText(/email/i)

  await page.getByLabel(/^Email/).fill(VISITOR.email)
  await cont.click()
  await expect(page.locator('.quiz__question')).toBeVisible()
})

test('blank designation, and the first save fails: Try again recovers it', async ({ page }) => {
  const posts = await fakeBackend(page, { failFirstSubmit: true })
  await page.goto('/')
  await register(page, { designation: '' })
  await answer(page, [true, true, false])
  await page.getByRole('button', { name: /Spin the wheel/ }).click()
  await spin(page)
  await page.getByRole('button', { name: /^Continue/ }).click()

  await expect(page.getByText('Server busy, please try again.')).toBeVisible()
  await expect(page.getByRole('button', { name: /Start over/ })).toBeEnabled()
  await page.getByRole('button', { name: /Try again/ }).click()
  await expect(page.getByText(/confirmation is on its way/)).toBeVisible()
  const submits = posts.filter((p) => p.action === 'submit')
  expect(submits).toHaveLength(2)
  expect(submits[1].designation).toBe('')
})

test('one right answer is not enough: So close offers Try again and Leave', async ({ page }) => {
  const posts = await fakeBackend(page)
  await page.goto('/')
  await register(page)
  await answer(page, [true, false, false])
  await expect(page.getByRole('heading', { name: /So close/ })).toBeVisible()
  await expect(page.getByText(/at least two right answers to unlock the prizes/)).toBeVisible()
  await expect(page.locator('.wheel__hub')).toHaveCount(0)
  await expectNoSideScroll(page)

  // Try again: a fresh round of questions, straight away.
  await page.getByRole('button', { name: /Try again/ }).click()
  await expect(page.locator('.quiz__top .kicker')).toContainText('Question 1')
  await answer(page, [false, false, false])
  await expect(page.getByRole('heading', { name: /So close/ })).toBeVisible()

  // Leave: back to the home screen.
  await page.getByRole('button', { name: /Leave/ }).click()
  await expect(page.getByRole('button', { name: /Test your knowledge/ })).toBeVisible()
  expect(posts.filter((p) => p.action === 'claimGift')).toHaveLength(0)
})

test('a number that already won cannot spin again', async ({ page }) => {
  const posts = await fakeBackend(page, { eligible: false })
  await page.goto('/')
  await register(page)
  await answer(page, [true, true, true])
  await page.getByRole('button', { name: /Spin the wheel/ }).click()
  await expect(page.getByRole('heading', { name: /already won/ })).toBeVisible()
  await expect(page.locator('.wheel__hub')).toHaveCount(0)
  expect(posts.filter((p) => p.action === 'claimGift')).toHaveLength(0)
})
