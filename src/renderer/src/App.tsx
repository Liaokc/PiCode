import { useReducer, type JSX } from 'react'
import { initialShellUiState, shellUiReducer } from '../../shared/layout-model'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import EmptyState from './components/EmptyState'
import SidePanel from './components/SidePanel'

/**
 * Window shell — three zones matching reference screenshots 02/03:
 * [nav sidebar | main zone | collapsible side panel], launched with the
 * panel collapsed and the sidebar visible.
 * `VITE_PICODE_PANEL_OPEN=1` expands the panel at startup (screenshot-QA hook).
 */
export default function App(): JSX.Element {
  const [ui, dispatch] = useReducer(shellUiReducer, undefined, () => ({
    ...initialShellUiState(),
    sidePanelOpen: import.meta.env.VITE_PICODE_PANEL_OPEN === '1'
  }))

  return (
    <div className="app-shell">
      <TitleBar ui={ui} dispatch={dispatch} />
      <Sidebar open={ui.sidebarOpen} />
      <main className="main-zone">
        <EmptyState />
      </main>
      <SidePanel open={ui.sidePanelOpen} />
    </div>
  )
}
