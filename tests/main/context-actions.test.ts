import { describe, expect, it } from 'vitest'
import { parseSessionContextAction, type SessionContextAction } from '../../src/shared/sessions/context-actions'
import { SessionContextActionService } from '../../src/main/sessions/context-actions'

describe('parseSessionContextAction — the read-only context-action payload', () => {
  it.each([
    [{ kind: 'reveal', file: '/store/a.jsonl' }, { kind: 'reveal', file: '/store/a.jsonl' }],
    [{ kind: 'copy', text: '/work/api' }, { kind: 'copy', text: '/work/api' }],
    [{ kind: 'copy', text: 'abc-123' }, { kind: 'copy', text: 'abc-123' }]
  ])('parses %p', (raw, expected) => {
    expect(parseSessionContextAction(raw)).toEqual(expected)
  })

  it.each([
    undefined,
    null,
    'reveal',
    42,
    {},
    { kind: 'reveal' }, // missing file
    { kind: 'reveal', file: '' }, // blank file
    { kind: 'reveal', file: 42 },
    { kind: 'copy' }, // missing text
    { kind: 'copy', text: '' }, // blank text
    { kind: 'delete', file: '/store/a.jsonl' } // NOT a read-only action
  ])('rejects %p', (raw) => {
    expect(parseSessionContextAction(raw)).toBeNull()
  })
})

describe('SessionContextActionService — dispatch + smoke log', () => {
  it('routes reveal to io.reveal and copy to io.copy, reporting success', () => {
    const revealed: string[] = []
    const copied: string[] = []
    const service = new SessionContextActionService({
      reveal: (file) => revealed.push(file),
      copy: (text) => copied.push(text)
    })
    expect(service.perform({ kind: 'reveal', file: '/store/a.jsonl' })).toBe(true)
    expect(service.perform({ kind: 'copy', text: 'abc-123' })).toBe(true)
    expect(revealed).toEqual(['/store/a.jsonl'])
    expect(copied).toEqual(['abc-123'])
  })

  it('records every performed action in order (the smoke assertion surface)', () => {
    const service = new SessionContextActionService({ reveal: () => undefined, copy: () => undefined })
    service.perform({ kind: 'copy', text: '/work/api' })
    service.perform({ kind: 'reveal', file: '/store/a.jsonl' })
    expect(service.log).toEqual([{ kind: 'copy', text: '/work/api' }, { kind: 'reveal', file: '/store/a.jsonl' }])
  })

  it('rejects junk without touching io or the log', () => {
    let ioTouched = false
    const service = new SessionContextActionService({
      reveal: () => {
        ioTouched = true
      },
      copy: () => {
        ioTouched = true
      }
    })
    expect(service.perform({ kind: 'rm-rf', file: '/' })).toBe(false)
    expect(service.perform('nope')).toBe(false)
    expect(ioTouched).toBe(false)
    expect(service.log).toEqual([])
  })

  it('caps the log so a long smoke run cannot grow it unboundedly', () => {
    const service = new SessionContextActionService({ reveal: () => undefined, copy: () => undefined })
    for (let i = 0; i < 50; i++) service.perform({ kind: 'copy', text: `t-${i}` } as SessionContextAction)
    expect(service.log.length).toBeLessThan(50)
    expect(service.log.at(-1)).toEqual({ kind: 'copy', text: 't-49' })
  })
})
