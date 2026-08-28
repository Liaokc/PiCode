import { describe, expect, it } from 'vitest'
import {
  SETTINGS_NAV,
  initialSettingsUiState,
  settingsUiReducer
} from '../../src/shared/settings-model.ts'

describe('settings nav (cropped from ZCode)', () => {
  it('offers exactly General/Appearance/Models plus the Data & Statistics group', () => {
    expect(SETTINGS_NAV).toEqual([
      { label: 'General', sections: ['general', 'appearance', 'models'] },
      { label: 'Data & Statistics', sections: ['usage'] }
    ])
  })
})

describe('settingsUiReducer', () => {
  it('opens on the usage section with daily heatmap and the 30-day range', () => {
    expect(initialSettingsUiState()).toEqual({
      section: 'usage',
      heatmapMode: 'daily',
      trendRange: 30,
      drillDown: null
    })
  })

  it('switches sections and closes any open drill-down', () => {
    const opened = settingsUiReducer(initialSettingsUiState(), { type: 'open-drilldown', date: '2026-08-26', model: null })
    const moved = settingsUiReducer(opened, { type: 'select-section', section: 'appearance' })
    expect(moved.section).toBe('appearance')
    expect(moved.drillDown).toBeNull()
  })

  it('switches heatmap mode and trend range independently', () => {
    let s = settingsUiReducer(initialSettingsUiState(), { type: 'set-heatmap-mode', mode: 'weekly' })
    expect(s.heatmapMode).toBe('weekly')
    s = settingsUiReducer(s, { type: 'set-trend-range', rangeDays: 7 })
    expect(s.trendRange).toBe(7)
    expect(s.heatmapMode).toBe('weekly')
  })

  it('opens drill-downs by date, by model, or both, and closes them', () => {
    let s = settingsUiReducer(initialSettingsUiState(), { type: 'open-drilldown', date: '2026-08-26', model: null })
    expect(s.drillDown).toEqual({ date: '2026-08-26', model: null })
    s = settingsUiReducer(s, { type: 'open-drilldown', date: null, model: 'm2' })
    expect(s.drillDown).toEqual({ date: null, model: 'm2' })
    s = settingsUiReducer(s, { type: 'open-drilldown', date: '2026-08-27', model: 'm1' })
    expect(s.drillDown).toEqual({ date: '2026-08-27', model: 'm1' })
    s = settingsUiReducer(s, { type: 'close-drilldown' })
    expect(s.drillDown).toBeNull()
    expect(settingsUiReducer(s, { type: 'close-drilldown' })).toEqual(s)
  })
})
