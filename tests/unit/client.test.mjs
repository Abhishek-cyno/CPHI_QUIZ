// Tests for the browser-side helpers that decide where the wheel lands and
// how phone numbers are handled.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickWinnerIndex, rotationForIndex } from '../../src/utils/wheel.js'
import { splitPhone, joinPhone, cleanNumber } from '../../src/utils/phone.js'
import { pickRandom } from '../../src/utils/shuffle.js'

const wheel = [
  { id: 'speaker', weight: 1 },
  { id: 'lamp', weight: 1 },
  { id: 'pen', weight: 3 },
  { id: 'dud', weight: 1 },
]

test('the wheel only ever lands on a winnable slice', () => {
  // e.g. the jackpot is out of stock: still drawn, never won.
  const winnable = wheel.filter((g) => g.id !== 'speaker')
  for (let i = 0; i < 5000; i++) {
    const idx = pickWinnerIndex(wheel, winnable)
    assert.notEqual(wheel[idx].id, 'speaker')
  }
})

test('the draw follows the weights from the Gifts tab', () => {
  const winnable = [wheel[1], wheel[2]] // lamp (1) and pen (3): total weight 4
  assert.equal(wheel[pickWinnerIndex(wheel, winnable, () => 0.2)].id, 'lamp') // 0.8 of 4 falls in lamp's 1
  assert.equal(wheel[pickWinnerIndex(wheel, winnable, () => 0.5)].id, 'pen')  // 2.0 of 4 falls in pen's 3
  assert.equal(wheel[pickWinnerIndex(wheel, winnable, () => 0.999)].id, 'pen')
})

test('an empty wheel cannot be spun, and an empty winnable list never dead-ends', () => {
  assert.equal(pickWinnerIndex([], []), -1)
  assert.ok(pickWinnerIndex(wheel, []) >= 0)
})

test('the wheel stops with the chosen slice under the pointer', () => {
  assert.equal(rotationForIndex(0, 4), 315)
  assert.equal(rotationForIndex(2, 4), 135)
})

test('phone numbers round-trip through the country-code picker', () => {
  assert.deepEqual(splitPhone('+91 9876543210'), { code: '+91', number: '9876543210' })
  assert.deepEqual(splitPhone('+971 501234567'), { code: '+971', number: '501234567' })
  assert.equal(joinPhone('+91', '9876543210'), '+91 9876543210')
  assert.equal(cleanNumber('98765-43210 99'), '9876543210')
})

test('each visitor gets distinct questions', () => {
  const bank = Array.from({ length: 51 }, (_, i) => ({ id: `q${i}` }))
  for (let i = 0; i < 200; i++) {
    const picked = pickRandom(bank, 3)
    assert.equal(picked.length, 3)
    assert.equal(new Set(picked.map((q) => q.id)).size, 3)
  }
})
