import { describe, expect, it } from 'vitest'
import { greetingForHour } from '../../src/shared/greeting'

describe('greetingForHour', () => {
  it('greets by morning through 5:00–11:59', () => {
    expect(greetingForHour(5)).toMatch(/Good morning/)
    expect(greetingForHour(8)).toMatch(/Good morning/)
    expect(greetingForHour(11)).toMatch(/Good morning/)
  })

  it('switches to afternoon at noon', () => {
    expect(greetingForHour(12)).toMatch(/Good afternoon/)
    expect(greetingForHour(17)).toMatch(/Good afternoon/)
  })

  it('greets evening from 18:00', () => {
    expect(greetingForHour(18)).toMatch(/Good evening/)
    expect(greetingForHour(22)).toMatch(/Good evening/)
  })

  it('acknowledges late-night hours', () => {
    expect(greetingForHour(23)).not.toMatch(/Good (morning|afternoon|evening)/)
    expect(greetingForHour(0)).not.toMatch(/Good (morning|afternoon|evening)/)
    expect(greetingForHour(4)).not.toMatch(/Good (morning|afternoon|evening)/)
    expect(greetingForHour(3).length).toBeGreaterThan(0)
  })

  it('rejects hours outside a 24h clock', () => {
    expect(() => greetingForHour(-1)).toThrow(RangeError)
    expect(() => greetingForHour(24)).toThrow(RangeError)
    expect(() => greetingForHour(7.5)).toThrow(RangeError)
  })
})
