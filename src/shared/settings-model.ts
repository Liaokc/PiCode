/**
 * Settings window model (ticket 10): the ZCode-shaped nav, cropped to
 * General / Appearance / Models / Data & Statistics, plus the Usage page's
 * control state (heatmap mode, trend range, drill-down). Pure reducer so the
 * window composition is testable without Electron.
 */
import type { HeatmapMode } from './usage/charts.ts'

export type SettingsSection = 'general' | 'appearance' | 'models' | 'skills' | 'packages' | 'mcp' | 'usage'

export interface SettingsNavGroup {
  label: string
  sections: SettingsSection[]
}

/** Cropped from ZCode's nav groups; unused ZCode entries are intentionally absent.
 * Ticket 63 adds the Agent Resources group: Skills (this ticket) and Packages
 * (ticket 64 delivers the section; the nav slot already exists). Ticket 89
 * adds the MCP management section (ticket 96 delivers the status projection). */
export const SETTINGS_NAV: readonly SettingsNavGroup[] = [
  { label: 'General', sections: ['general', 'appearance', 'models'] },
  { label: 'Agent Resources', sections: ['skills', 'packages', 'mcp'] },
  { label: 'Data & Statistics', sections: ['usage'] }
]

export const SETTINGS_SECTION_LABELS: Record<SettingsSection, string> = {
  general: 'General',
  appearance: 'Appearance',
  models: 'Models',
  skills: 'Skills',
  packages: 'Packages',
  mcp: 'MCP',
  usage: 'Usage'
}

export type TrendRange = 7 | 30

export interface DrillDownSelection {
  date: string | null
  /** Inclusive range end (weekly heatmap cells drill into a whole week). */
  dateTo: string | null
  model: string | null
}

export interface SettingsUiState {
  section: SettingsSection
  heatmapMode: HeatmapMode
  trendRange: TrendRange
  drillDown: DrillDownSelection | null
}

/** The Usage page is the only wired section for now, so it opens selected. */
export function initialSettingsUiState(): SettingsUiState {
  return { section: 'usage', heatmapMode: 'daily', trendRange: 30, drillDown: null }
}

export type SettingsUiAction =
  | { type: 'select-section'; section: SettingsSection }
  | { type: 'set-heatmap-mode'; mode: HeatmapMode }
  | { type: 'set-trend-range'; rangeDays: TrendRange }
  | { type: 'open-drilldown'; date: string | null; dateTo?: string | null; model: string | null }
  | { type: 'close-drilldown' }

export function settingsUiReducer(state: SettingsUiState, action: SettingsUiAction): SettingsUiState {
  switch (action.type) {
    case 'select-section':
      return { ...state, section: action.section, drillDown: null }
    case 'set-heatmap-mode':
      return state.heatmapMode === action.mode ? state : { ...state, heatmapMode: action.mode }
    case 'set-trend-range':
      return state.trendRange === action.rangeDays ? state : { ...state, trendRange: action.rangeDays }
    case 'open-drilldown':
      return { ...state, drillDown: { date: action.date, dateTo: action.dateTo ?? null, model: action.model } }
    case 'close-drilldown':
      return state.drillDown === null ? state : { ...state, drillDown: null }
    default:
      return state
  }
}
