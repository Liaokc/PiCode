import { useCallback, useEffect, useReducer, useRef, useState, type JSX } from 'react'
import {
  MCP_SECURITY_COPY,
  filterMcpRows,
  mergeMcpLayers,
  mcpDeleteCopy,
  mcpReadOnlyWinnerCopy,
  mcpWinnerBadgeLabel,
  partitionMcpRows,
  entryToForm,
  type McpConfigLayer,
  type McpEffectiveServer,
  type McpLayerReport,
  type McpServerEntry,
  type McpServerForm
} from '../../../../shared/mcp-management'
import {
  mcpStatusBadgeLabel,
  mcpStatusLine,
  mcpStatusToolCountLabel,
  serverStatusEntry,
  shouldShowRuntimeBadge,
  shouldShowToolCount,
  type McpServerStatusData,
  type McpStatusSnapshotData
} from '../../../../shared/mcp-status'
import { mcpAuthStore, type McpAuthState } from './mcp-auth-store'
import { mcpStatusStore } from './mcp-status-store'
import { FolderIcon, LoaderIcon, PlusIcon, RefreshIcon, TrashIcon } from '../icons'

/**
 * The MCP section (ticket 89): the pi-mcp-adapter's config surface split
 * across TWO cards — Global (user-global shared + .agents + Pi global
 * override) and Project (project shared + Pi project override). Every row
 * shows the EFFECTIVE merged definition with its winning source badge and
 * every layer that defines it (the merged view's 来源 badges); the switch
 * writes ONLY the disabled flag into the project Pi override (adapter
 * `/mcp enable|disable` semantics); Add/Edit/Delete write the adapter's
 * `/mcp setup` targets. The OAuth Authenticate action rides the focused
 * session's host bridge (the adapter's own flow — system browser,
 * localhost callback, keychain credentials; PiCode never touches tokens),
 * with the manual callback-URL paste fallback for gateway scenarios.
 * Per-layer entries open the config file's location read-only.
 */

interface McpSectionProps {
  /** The focused session's cwd (null = the global face only). */
  cwd: string | null
  /** The focused session's id — the OAuth flow targets ITS host. */
  focusedSessionId: string | null
  /** Toast surface (same channel as the Packages ops). */
  onNotify: (message: string, level: 'info' | 'error') => void
}

type ConfirmState = { row: McpEffectiveServer } | null
type FormState = {
  mode: 'add' | 'edit'
  target: 'project' | 'global'
  editing: McpEffectiveServer | null
  form: McpServerForm
} | null

function emptyForm(): McpServerForm {
  return { name: '', transport: 'stdio', command: '', args: '', env: '', url: '', oauth: false }
}

export default function McpSection({ cwd, focusedSessionId, onNotify }: McpSectionProps): JSX.Element {
  const [report, setReport] = useState<McpLayerReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [confirm, setConfirm] = useState<ConfirmState>(null)
  const [form, setForm] = useState<FormState>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [authState, setAuthState] = useState<McpAuthState>(mcpAuthStore.getState())
  // Ticket 96: the focused session's live adapter snapshot (last-wins per
  // session; the store notifies on every forwarded snapshot).
  const [, bumpStatus] = useReducer((count: number) => count + 1, 0)
  useEffect(() => mcpStatusStore.subscribe(bumpStatus), [])

  useEffect(() => mcpAuthStore.subscribe(setAuthState), [])
  useEffect(() => {
    mcpAuthStore.resetFinished()
  }, [])

  const refresh = useCallback(
    (force: boolean): void => {
      void Promise.resolve()
        .then(() => setLoading(true))
        .then(() => window.picode.settings.listMcpConfig(cwd))
        .then((payload) => {
          setReport(payload)
          setLoading(false)
        })
        .catch(() => {
          setReport(null)
          setLoading(false)
          if (force) onNotify('The MCP configuration could not be loaded.', 'error')
        })
    },
    [cwd, onNotify]
  )

  useEffect(() => {
    refresh(false)
  }, [refresh])

  const rows = report === null ? [] : mergeMcpLayers([...report.globalLayers, ...report.projectLayers])
  const { global: globalRows, project: projectRows } = partitionMcpRows(rows)
  const visibleGlobal = filterMcpRows(globalRows, query)
  const visibleProject = filterMcpRows(projectRows, query)
  // Ticket 96: the focused session's live adapter snapshot (null = no
  // session / the adapter has not reported — the honest no-data state).
  const statusSnapshot = mcpStatusStore.snapshotFor(focusedSessionId)
  const statusLine = mcpStatusLine({ focusedSessionId, snapshot: statusSnapshot, configRowCount: rows.length })

  async function toggle(row: McpEffectiveServer, disable: boolean): Promise<void> {
    setBusy(row.name)
    try {
      const outcome = await window.picode.settings.toggleMcpServer(row.name, disable, cwd)
      if (!outcome.ok && outcome.error) onNotify(outcome.error, 'error')
    } finally {
      setBusy(null)
      refresh(true)
    }
  }

  async function remove(row: McpEffectiveServer): Promise<void> {
    setBusy(row.name)
    setConfirm(null)
    try {
      const outcome = await window.picode.settings.removeMcpServer(row.name, cwd)
      if (!outcome.ok && outcome.error) onNotify(outcome.error, 'error')
    } finally {
      setBusy(null)
      refresh(true)
    }
  }

  async function saveForm(): Promise<void> {
    if (form === null) return
    setBusy('form')
    try {
      const preserve = form.editing?.entry ?? {}
      const outcome = await window.picode.settings.writeMcpServer(form.mode, form.form, form.target, cwd, preserve)
      if (!outcome.ok && outcome.error) {
        onNotify(outcome.error, 'error')
      } else {
        onNotify(form.mode === 'add' ? `Server "${form.form.name}" added.` : `Server "${form.form.name}" updated.`, 'info')
        setForm(null)
      }
    } finally {
      setBusy(null)
      refresh(true)
    }
  }

  function authenticate(row: McpEffectiveServer): void {
    if (focusedSessionId === null) {
      onNotify('OAuth needs a session — open one for this workspace first.', 'error')
      return
    }
    mcpAuthStore.flowStarted(focusedSessionId, row.name)
    window.picode.chat.sendToHost({
      type: 'session_command',
      sessionId: focusedSessionId,
      command: { type: 'mcp_auth_start', serverName: row.name }
    })
  }

  function reveal(layerPath: string): void {
    void window.picode.settings.revealMcpLayer(layerPath, cwd)
  }

  function openEdit(row: McpEffectiveServer): void {
    if (row.winnerId === 'agents-global' || row.winnerId === 'agents-nested-global') {
      onNotify(mcpReadOnlyWinnerCopy(row), 'error')
      return
    }
    setForm({
      mode: 'edit',
      target: row.winnerScope === 'global' ? 'global' : 'project',
      editing: row,
      form: entryToForm(row.entry, row.name)
    })
  }

  return (
    <div className="settings-page" data-mcp-section>
      <header className="settings-page-header">
        <h1>MCP</h1>
        <p className="settings-page-subtitle">
          The MCP servers Pi loads — global servers everywhere, project servers for the focused workspace.
        </p>
        <p className="settings-page-note">{MCP_SECURITY_COPY}</p>
      </header>

      <div className="settings-skill-search">
        <input
          type="text"
          className="settings-skill-search-input"
          placeholder="Search servers by name, url, or command…"
          aria-label="Search MCP servers"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {(authState.running || authState.completed !== null) && authState.serverName !== null && (
        <div
          className={authState.completed !== null && !authState.running && !authState.completed.ok ? 'settings-mcp-auth settings-mcp-auth-error' : 'settings-mcp-auth'}
          role="status"
          data-mcp-auth-status
        >
          {authState.running && (
            <p>
              <LoaderIcon size={12} /> Authenticating “{authState.serverName}” — the authorization page opened in your browser. Complete it there, or paste the callback URL below.
            </p>
          )}
          {authState.inputRequired !== null && (
            <McpAuthPaste
              key={authState.inputRequired.requestId}
              title={authState.inputRequired.title}
              onSubmit={(value) => mcpAuthStore.submitInput(authState.inputRequired?.requestId ?? '', value)}
            />
          )}
          {!authState.running && authState.completed !== null && (
            <p>
              {authState.completed.ok
                ? `OAuth authentication successful for “${authState.serverName}”.`
                : `OAuth authentication failed for “${authState.serverName}”. ${authState.completed.notices.find((n) => n.level === 'error')?.message ?? ''}`}
            </p>
          )}
        </div>
      )}

      {report?.error != null && (
        <p className="settings-skills-error" role="alert">
          {report.error}
        </p>
      )}

      {statusLine !== null && (
        <p className="settings-mcp-status-line" data-mcp-status-line>
          {statusLine}
        </p>
      )}

      <McpCard
        title="Global servers"
        fileNote="~/.config/mcp/mcp.json · ~/.pi/agent/mcp.json"
        rows={visibleGlobal}
        loading={loading}
        layers={report?.globalLayers ?? []}
        emptyCopy={query.trim() !== '' ? 'No servers match the search.' : 'No global MCP servers configured.'}
        onRefresh={() => refresh(true)}
        onReveal={reveal}
        onAdd={() => setForm({ mode: 'add', target: 'global', editing: null, form: emptyForm() })}
        onToggle={toggle}
        onEdit={openEdit}
        onDelete={(row) => setConfirm({ row })}
        onAuthenticate={authenticate}
        busy={busy}
        authServerName={authState.running ? authState.serverName : null}
        statusSnapshot={statusSnapshot}
      />

      <McpCard
        title="Project servers"
        fileNote=".mcp.json · .pi/mcp.json per workspace"
        rows={visibleProject}
        loading={loading}
        layers={report?.projectLayers ?? []}
        emptyCopy={
          cwd === null
            ? 'No focused workspace — project servers belong to the focused session’s directory. Open a session to manage its servers.'
            : query.trim() !== ''
              ? 'No servers match the search.'
              : 'No project servers for this workspace.'
        }
        onRefresh={() => refresh(true)}
        onReveal={reveal}
        onAdd={() => setForm({ mode: 'add', target: 'project', editing: null, form: emptyForm() })}
        onToggle={toggle}
        onEdit={openEdit}
        onDelete={(row) => setConfirm({ row })}
        onAuthenticate={authenticate}
        busy={busy}
        authServerName={authState.running ? authState.serverName : null}
        statusSnapshot={statusSnapshot}
      />

      {confirm !== null && (
        <div className="skill-confirm" role="alertdialog" aria-label={`Delete ${confirm.row.name}`}>
          <p className="skill-confirm-copy">{mcpDeleteCopy(confirm.row)}</p>
          <div className="skill-confirm-actions">
            <button type="button" className="skill-confirm-cancel" onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button type="button" className="skill-confirm-delete" onClick={() => void remove(confirm.row)}>
              Remove server
            </button>
          </div>
        </div>
      )}

      {form !== null && (
        <McpForm
          form={form}
          busy={busy === 'form'}
          onForm={(next) => setForm(next === null ? null : { ...form, form: next })}
          onCancel={() => setForm(null)}
          onSave={() => void saveForm()}
        />
      )}
    </div>
  )
}

// ---- the shared card frame (both cards) ----

interface McpCardProps {
  title: string
  fileNote: string
  rows: McpEffectiveServer[]
  loading: boolean
  layers: McpConfigLayer[]
  emptyCopy: string
  onRefresh: () => void
  onReveal: (layerPath: string) => void
  onAdd: () => void
  onToggle: (row: McpEffectiveServer, disable: boolean) => void
  onEdit: (row: McpEffectiveServer) => void
  onDelete: (row: McpEffectiveServer) => void
  onAuthenticate: (row: McpEffectiveServer) => void
  busy: string | null
  authServerName: string | null
  statusSnapshot: McpStatusSnapshotData | null
}

function McpCard(props: McpCardProps): JSX.Element {
  const { title, rows, loading, layers, emptyCopy } = props
  return (
    <section className="settings-card" data-mcp-card={title.toLowerCase().replace(/\s+/g, '-')}>
      <div className="settings-card-head">
        <div>
          <h2 className="settings-card-head-title">{title}</h2>
          <span className="settings-card-head-note">{props.fileNote}</span>
        </div>
        <div className="settings-skills-toolbar">
          <button type="button" className="settings-skills-refresh" onClick={props.onAdd}>
            <PlusIcon size={13} />
            Add server
          </button>
          <button type="button" className="settings-skills-refresh" aria-label={`Refresh ${title}`} onClick={props.onRefresh} disabled={loading}>
            {loading ? <LoaderIcon size={13} /> : <RefreshIcon size={13} />}
            Refresh
          </button>
        </div>
      </div>

      {layers.length > 0 && (
        <div className="settings-mcp-layers">
          {layers.map((layer) => (
            <button
              key={layer.id}
              type="button"
              className="settings-mcp-layer"
              title={`Open ${layer.path}${layer.exists ? '' : ' (file does not exist yet)'}`}
              onClick={() => props.onReveal(layer.path)}
            >
              <FolderIcon size={12} />
              {layer.label}
            </button>
          ))}
        </div>
      )}

      {rows.length === 0 && !loading && <p className="settings-skills-empty">{emptyCopy}</p>}
      {rows.map((row) => (
        <McpRow
          key={row.name}
          row={row}
          statusEntry={serverStatusEntry(row.name, props.statusSnapshot)}
          busy={props.busy === row.name}
          onToggle={(disable) => props.onToggle(row, disable)}
          onEdit={() => props.onEdit(row)}
          onDelete={() => props.onDelete(row)}
          onAuthenticate={() => props.onAuthenticate(row)}
          authRunning={props.authServerName === row.name}
          onReveal={props.onReveal}
        />
      ))}
    </section>
  )
}

// ---- one server row ----

interface McpRowProps {
  row: McpEffectiveServer
  /** The focused session's live status for this server (undefined = no
   * data — the row renders without a runtime badge, never an invention). */
  statusEntry: McpServerStatusData | undefined
  busy: boolean
  onToggle: (disable: boolean) => void
  onEdit: () => void
  onDelete: () => void
  onAuthenticate: () => void
  authRunning: boolean
  onReveal: (layerPath: string) => void
}

function McpRow({ row, statusEntry, busy, onToggle, onEdit, onDelete, onAuthenticate, authRunning, onReveal }: McpRowProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const url = typeof row.entry['url'] === 'string' ? (row.entry['url'] as string) : null
  const command = typeof row.entry['command'] === 'string' ? (row.entry['command'] as string) : null
  const args = Array.isArray(row.entry['args']) ? (row.entry['args'] as unknown[]).filter((a): a is string => typeof a === 'string') : null
  const summary = url ?? (command !== null ? [command, ...(args ?? [])].join(' ') : null)
  // Ticket 96: the runtime badge (skipped for 'disabled' — the config
  // Disabled badge below already says it) + the tool chip where the count
  // is the server's truth (connected / cached).
  const status = statusEntry?.status ?? null
  const showToolCount = status !== null && shouldShowToolCount(status)
  return (
    <div className={row.disabled ? 'skill-row skill-row-broken' : 'skill-row'} data-mcp-server={row.name}>
      <div className="skill-row-main">
        <div className="skill-row-title">
          <span className="skill-row-name">{row.name}</span>
          {status !== null && shouldShowRuntimeBadge(status) && (
            <span className={`skill-badge skill-badge-status skill-badge-status-${status}`} data-mcp-status={row.name}>
              {mcpStatusBadgeLabel(status)}
            </span>
          )}
          {showToolCount && statusEntry !== undefined && (
            <span className="skill-badge skill-badge-tools">{mcpStatusToolCountLabel(statusEntry.toolCount)}</span>
          )}
          <span className={`skill-badge skill-badge-${row.winnerKind === 'pi' ? 'pi' : 'shared'}`}>{mcpWinnerBadgeLabel(row)}</span>
          {row.definedIn.length > 1 && (
            <span className="skill-badge skill-badge-layers" title={row.definedIn.map((d) => d.label).join(' → ')}>
              {row.definedIn.length} layers
            </span>
          )}
          {row.oauth && <span className="skill-badge skill-badge-oauth">OAuth</span>}
          {row.disabled && <span className="skill-badge skill-badge-off">Disabled</span>}
        </div>
        {summary !== null && (
          <button type="button" className="settings-mcp-summary" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
            {summary}
          </button>
        )}
        <div className="settings-mcp-row-paths">
          {row.definedIn.map((d) => (
            <button key={d.id} type="button" className="settings-mcp-layer" title={`Open ${d.path}`} onClick={() => onReveal(d.path)}>
              <FolderIcon size={11} />
              {d.label}
            </button>
          ))}
        </div>
        {expanded && <McpEntryDetails entry={row.entry} />}
      </div>

      <div className="skill-row-actions">
        {(row.oauth || status === 'needs-auth') && (
          <button
            type="button"
            className="settings-skills-refresh"
            onClick={onAuthenticate}
            disabled={busy || authRunning || row.disabled}
            aria-label={`Authenticate ${row.name}`}
          >
            {authRunning ? <LoaderIcon size={13} /> : null}
            Authenticate
          </button>
        )}
        <button type="button" className="skill-row-btn" aria-label={`Edit ${row.name}`} onClick={onEdit} disabled={busy}>
          ✎
        </button>
        <button type="button" className="skill-row-btn skill-row-danger" aria-label={`Delete ${row.name}`} onClick={onDelete} disabled={busy}>
          <TrashIcon size={14} />
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={!row.disabled}
          aria-label={`Enable ${row.name}`}
          className={row.disabled ? 'skill-switch' : 'skill-switch skill-switch-on'}
          disabled={busy}
          onClick={() => onToggle(!row.disabled)}
        >
          <span className="skill-switch-knob" />
        </button>
      </div>
    </div>
  )
}

function McpEntryDetails({ entry }: { entry: McpServerEntry }): JSX.Element {
  return <pre className="settings-mcp-json">{JSON.stringify(entry, null, 2)}</pre>
}

// ---- the add/edit dialog ----

interface McpFormProps {
  form: NonNullable<FormState>
  busy: boolean
  onForm: (form: McpServerForm | null) => void
  onCancel: () => void
  onSave: () => void
}

function McpForm({ form, busy, onForm, onCancel, onSave }: McpFormProps): JSX.Element {
  const f = form.form
  const set = (patch: Partial<McpServerForm>): void => onForm({ ...f, ...patch })
  return (
    <div className="settings-mcp-form-backdrop" role="dialog" aria-label={form.mode === 'add' ? 'Add MCP server' : `Edit ${f.name}`}>
      <div className="settings-mcp-form" data-mcp-form={form.mode}>
        <h3 className="settings-mcp-form-title">
          {form.mode === 'add' ? (form.target === 'global' ? 'Add a global server' : 'Add a project server') : `Edit “${f.name}”`}
        </h3>
        <p className="settings-mcp-form-note">
          {form.mode === 'add'
            ? form.target === 'global'
              ? 'Writes ~/.config/mcp/mcp.json — the user-global shared config.'
              : 'Writes .mcp.json in the focused workspace.'
            : `Rewrites the winning definition (${form.editing?.winnerLabel ?? ''}).`}
        </p>

        <label className="settings-mcp-field">
          <span>Name</span>
          <input
            type="text"
            value={f.name}
            disabled={form.mode === 'edit'}
            aria-label="Server name"
            onChange={(event) => set({ name: event.target.value })}
            placeholder="my-server"
          />
        </label>

        <div className="settings-mcp-field-row" role="radiogroup" aria-label="Transport">
          <button
            type="button"
            role="radio"
            aria-checked={f.transport === 'stdio'}
            className={f.transport === 'stdio' ? 'settings-mcp-transport settings-mcp-transport-active' : 'settings-mcp-transport'}
            onClick={() => set({ transport: 'stdio' })}
          >
            Local (command)
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={f.transport === 'http'}
            className={f.transport === 'http' ? 'settings-mcp-transport settings-mcp-transport-active' : 'settings-mcp-transport'}
            onClick={() => set({ transport: 'http' })}
          >
            Remote (url)
          </button>
        </div>

        {f.transport === 'stdio' ? (
          <>
            <label className="settings-mcp-field">
              <span>Command</span>
              <input type="text" value={f.command} aria-label="Command" onChange={(event) => set({ command: event.target.value })} placeholder="npx" />
            </label>
            <label className="settings-mcp-field">
              <span>Arguments (one per line)</span>
              <textarea rows={2} value={f.args} aria-label="Arguments" onChange={(event) => set({ args: event.target.value })} placeholder={'-y\nmy-mcp-server'} />
            </label>
            <label className="settings-mcp-field">
              <span>Environment (KEY=value per line)</span>
              <textarea rows={2} value={f.env} aria-label="Environment" onChange={(event) => set({ env: event.target.value })} placeholder="API_KEY=…" />
            </label>
          </>
        ) : (
          <>
            <label className="settings-mcp-field">
              <span>URL</span>
              <input type="text" value={f.url} aria-label="URL" onChange={(event) => set({ url: event.target.value })} placeholder="https://example.com/mcp" />
            </label>
            <label className="settings-mcp-field settings-mcp-checkbox">
              <input type="checkbox" checked={f.oauth} aria-label="OAuth authentication" onChange={(event) => set({ oauth: event.target.checked })} />
              <span>OAuth authentication</span>
            </label>
          </>
        )}

        <div className="settings-mcp-form-actions">
          <button type="button" className="skill-confirm-cancel" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="skill-confirm-delete" onClick={onSave} disabled={busy}>
            {form.mode === 'add' ? 'Add server' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- the manual paste fallback (gateway scenario) ----

function McpAuthPaste({ title, onSubmit }: { title: string; onSubmit: (value: string | null) => void }): JSX.Element {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return (
    <div className="settings-mcp-paste" data-mcp-paste>
      <p className="settings-mcp-paste-title">{title}</p>
      <div className="settings-mcp-paste-row">
        <input
          ref={ref}
          type="text"
          placeholder="Paste the full callback URL (code + state)…"
          aria-label="Paste the OAuth callback URL"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && value.trim() !== '') onSubmit(value.trim())
          }}
        />
        <button type="button" className="skill-confirm-delete" onClick={() => onSubmit(value.trim())} disabled={value.trim() === ''}>
          Complete
        </button>
        <button type="button" className="skill-confirm-cancel" onClick={() => onSubmit(null)}>
          Cancel
        </button>
      </div>
    </div>
  )
}
