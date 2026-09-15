import { useEffect, useMemo, useState, type JSX, type KeyboardEvent, type ReactNode } from 'react'
import {
  authHealth,
  type AuthHealth,
  type AuthProbeReport,
  type ModelCatalogEntry,
  type ProviderAuthStatus
} from '../../../../shared/auth-status'
import type { ThinkingLevel } from '../../../../shared/contract'
import type { AppPreferences } from '../../../../shared/preferences'
import { configuredProviderIds, sortProvidersConfiguredFirst } from '../../../../shared/provider-sort'
import { flatMenuKey } from '../../../../shared/composer/menu-keys'
import { THINKING_LABELS } from '../composer/menus'
import { useNowTick } from '../use-now'
import { ChevronRightIcon, CubeIcon, LoaderIcon, RefreshIcon } from '../icons'

interface ModelsSectionProps {
  preferences: AppPreferences
  auth: AuthProbeReport | null
  /** True while a fresh auth probe is running. */
  authScanning: boolean
  onSetPreferences: (patch: Partial<AppPreferences>) => void
  onRefreshAuth: () => void
}

const THINKING_OPTIONS: Array<{ value: ThinkingLevel | null; label: string }> = [
  { value: null, label: 'Pi default' },
  { value: 'off', label: THINKING_LABELS.off },
  { value: 'minimal', label: THINKING_LABELS.minimal },
  { value: 'low', label: THINKING_LABELS.low },
  { value: 'medium', label: THINKING_LABELS.medium },
  { value: 'high', label: THINKING_LABELS.high },
  { value: 'xhigh', label: THINKING_LABELS.xhigh },
  { value: 'max', label: THINKING_LABELS.max }
]

const HEALTH_DOT_LABEL: Record<AuthHealth, string> = {
  ok: 'Signed in',
  expired: 'Sign-in expired',
  'not-configured': 'Not configured'
}

function expiryText(expiresAt: number, now: number): string {
  const delta = expiresAt - now
  if (delta <= 0) return 'expired'
  const days = Math.floor(delta / 86_400_000)
  if (days >= 1) return `expires in ${days}d`
  const hours = Math.floor(delta / 3_600_000)
  if (hours >= 1) return `expires in ${hours}h`
  return 'expires soon'
}

function modelsForProvider(models: readonly ModelCatalogEntry[], providerId: string): ModelCatalogEntry[] {
  return models.filter((model) => model.providerId === providerId)
}

/**
 * Models settings (ticket 11): the default model + thinking level applied to
 * NEW sessions, and the read-only per-provider sign-in status. Login itself
 * stays in the Pi TUI — unconfigured or expired rows guide there and never
 * offer a PiCode login flow (spec: no OAuth/API-key GUI).
 *
 * Ticket 76: every provider list in the section (sign-in rows and the
 * default-model cascade) is ordered configured-first, alphabetical within
 * each group — joined from this report's own credential rows (zero new
 * contract); a missing/empty report degrades to the registry order.
 */
export default function ModelsSection({ preferences, auth, authScanning, onSetPreferences, onRefreshAuth }: ModelsSectionProps): JSX.Element {
  const now = useNowTick(30_000)
  // Scan automatically the first time the section is shown (and after a
  // forced refresh resolves); an error report still counts as "scanned".
  useEffect(() => {
    if (auth === null && !authScanning) onRefreshAuth()
  }, [auth, authScanning, onRefreshAuth])
  const providers = useMemo(
    () => sortProvidersConfiguredFirst(auth?.providers ?? [], configuredProviderIds(auth)),
    [auth]
  )
  return (
    <div className="settings-page">
      <header className="settings-page-header">
        <h1>Models</h1>
        <p className="settings-page-subtitle">Defaults for new tasks and read-only provider sign-in status.</p>
      </header>

      <section className="settings-card">
        <h2 className="settings-card-title">Defaults for new tasks</h2>
        <DefaultModelRow preferences={preferences} auth={auth} providers={providers} now={now} onSetPreferences={onSetPreferences} />
        <ThinkingLevelRow preferences={preferences} onSetPreferences={onSetPreferences} />
      </section>

      <section className="settings-card">
        <header className="settings-card-header">
          <h2 className="settings-card-title">Provider sign-in</h2>
          <button
            type="button"
            className="settings-refresh-btn"
            onClick={onRefreshAuth}
            disabled={authScanning}
            aria-label="Refresh sign-in status"
          >
            {authScanning ? <LoaderIcon size={13} /> : <RefreshIcon size={13} />}
            {authScanning ? 'Scanning…' : 'Refresh'}
          </button>
        </header>

        {auth === null ? (
          <div className="settings-note">
            {authScanning ? 'Scanning provider credentials…' : 'Provider status has not been scanned yet.'}
          </div>
        ) : auth.error !== null ? (
          <div className="settings-note settings-note-error">
            Could not scan provider credentials: {auth.error}
          </div>
        ) : auth.providers.length === 0 ? (
          <div className="settings-note">No providers found in the Pi registry.</div>
        ) : (
          <ul className="auth-list" aria-label="Provider sign-in status">
            {providers.map((provider) => (
              <AuthRow key={provider.providerId} provider={provider} now={now} />
            ))}
          </ul>
        )}
        <p className="settings-field-note">
          PiCode never stores or enters credentials. To sign in, open the Pi TUI in a terminal and run{' '}
          <code className="settings-inline-code">/login</code> — the status here updates on refresh.
        </p>
      </section>
    </div>
  )
}

/** Focusable keyboard-driven list container for the inline pickers. */
function CascadeList({
  label,
  rowCount,
  highlight,
  onHighlight,
  onPick,
  onClose,
  children
}: {
  label: string
  rowCount: number
  highlight: number
  onHighlight: (index: number) => void
  onPick: (index: number) => void
  onClose: () => void
  children: ReactNode
}): JSX.Element {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    flatMenuKey(event, rowCount, highlight, onHighlight, onPick, onClose)
  }
  return (
    <div className="settings-cascade" role="listbox" aria-label={label} tabIndex={-1} autoFocus onKeyDown={onKeyDown}>
      {children}
      <div className="settings-cascade-hint" aria-hidden="true">
        ↑↓ navigate · ↵ select · Esc cancel
      </div>
    </div>
  )
}

function cascadeRowClass(active: boolean): string {
  return active ? 'settings-cascade-row settings-cascade-row-active' : 'settings-cascade-row'
}

// ---- default model picker (provider → model cascade, inline) ----

type PickerStep = { step: 'closed' } | { step: 'provider' } | { step: 'model'; providerId: string }

function DefaultModelRow({
  preferences,
  auth,
  providers,
  now,
  onSetPreferences
}: {
  preferences: AppPreferences
  auth: AuthProbeReport | null
  /** Ticket 76: the section's provider order (configured-first) — shared
   * with the sign-in list so both lists never disagree. */
  providers: ProviderAuthStatus[]
  now: number
  onSetPreferences: (patch: Partial<AppPreferences>) => void
}): JSX.Element {
  const [picker, setPicker] = useState<PickerStep>({ step: 'closed' })
  const [highlight, setHighlight] = useState(0)

  const models = picker.step === 'model' && auth !== null ? modelsForProvider(auth.models, picker.providerId) : []
  const current = preferences.defaultModel
  const currentName = current
    ? (auth?.models.find((m) => m.providerId === current.providerId && m.modelId === current.modelId)?.name ??
      `${current.providerId} / ${current.modelId}`)
    : 'Pi default'

  function closePicker(): void {
    setPicker({ step: 'closed' })
    setHighlight(0)
  }

  if (picker.step === 'closed') {
    return (
      <div className="settings-field">
        <div className="settings-field-label">Default model</div>
        <div className="settings-picker-row">
          <button type="button" className="settings-select-btn" onClick={() => setPicker({ step: 'provider' })}>
            <CubeIcon size={13} />
            <span>{currentName}</span>
            <ChevronRightIcon size={12} />
          </button>
        </div>
        <p className="settings-field-note">
          Applied when a task starts. The session can still switch models any time from the composer.
        </p>
      </div>
    )
  }

  if (picker.step === 'provider') {
    return (
      <div className="settings-field">
        <div className="settings-field-label">Default model · choose a provider</div>
        <CascadeList
          label="Choose a provider"
          rowCount={providers.length + 1}
          highlight={highlight}
          onHighlight={setHighlight}
          onPick={(i) => {
            if (i === 0) {
              onSetPreferences({ defaultModel: null })
              closePicker()
              return
            }
            const provider = providers[i - 1]
            if (provider) {
              setHighlight(0)
              setPicker({ step: 'model', providerId: provider.providerId })
            }
          }}
          onClose={closePicker}
        >
          <button
            type="button"
            role="option"
            aria-selected={highlight === 0}
            className={cascadeRowClass(highlight === 0)}
            onClick={() => {
              onSetPreferences({ defaultModel: null })
              closePicker()
            }}
            onMouseEnter={() => setHighlight(0)}
          >
            Use Pi default
          </button>
          {providers.map((provider, i) => (
            <button
              key={provider.providerId}
              type="button"
              role="option"
              aria-selected={highlight === i + 1}
              className={cascadeRowClass(highlight === i + 1)}
              onClick={() => {
                setHighlight(0)
                setPicker({ step: 'model', providerId: provider.providerId })
              }}
              onMouseEnter={() => setHighlight(i + 1)}
            >
              <span className={`auth-dot auth-dot-${authHealth(provider, now)}`} aria-hidden="true" />
              {provider.name}
              <span className="settings-cascade-count">{provider.modelCount} models</span>
            </button>
          ))}
        </CascadeList>
      </div>
    )
  }

  return (
    <div className="settings-field">
      <div className="settings-field-label">
        Default model · {providers.find((p) => p.providerId === picker.providerId)?.name ?? picker.providerId}
      </div>
      <CascadeList
        label="Choose a model"
        rowCount={models.length}
        highlight={highlight}
        onHighlight={setHighlight}
        onPick={(i) => {
          const model = models[i]
          if (model) {
            onSetPreferences({ defaultModel: { providerId: model.providerId, modelId: model.modelId } })
            closePicker()
          }
        }}
        onClose={closePicker}
      >
        {models.map((model, i) => (
          <button
            key={model.modelId}
            type="button"
            role="option"
            aria-selected={highlight === i}
            className={cascadeRowClass(highlight === i)}
            onClick={() => {
              onSetPreferences({ defaultModel: { providerId: model.providerId, modelId: model.modelId } })
              closePicker()
            }}
            onMouseEnter={() => setHighlight(i)}
          >
            {model.name}
          </button>
        ))}
        {models.length === 0 && <div className="settings-note">No models known for this provider.</div>}
      </CascadeList>
    </div>
  )
}

// ---- thinking level picker ----

function ThinkingLevelRow({
  preferences,
  onSetPreferences
}: {
  preferences: AppPreferences
  onSetPreferences: (patch: Partial<AppPreferences>) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const current = THINKING_OPTIONS.find((option) => option.value === preferences.defaultThinkingLevel)

  function close(): void {
    setOpen(false)
    setHighlight(0)
  }

  function pick(index: number): void {
    const option = THINKING_OPTIONS[index]
    if (option) onSetPreferences({ defaultThinkingLevel: option.value })
    close()
  }

  return (
    <div className="settings-field">
      <div className="settings-field-label">Default thinking level</div>
      {!open && (
        <div className="settings-picker-row">
          <button type="button" className="settings-select-btn" onClick={() => setOpen(true)}>
            {current?.label ?? 'Pi default'}
            <ChevronRightIcon size={12} />
          </button>
        </div>
      )}
      {open && (
        <CascadeList
          label="Choose a thinking level"
          rowCount={THINKING_OPTIONS.length}
          highlight={highlight}
          onHighlight={setHighlight}
          onPick={pick}
          onClose={close}
        >
          {THINKING_OPTIONS.map((option, i) => (
            <button
              key={option.label}
              type="button"
              role="option"
              aria-selected={highlight === i}
              className={cascadeRowClass(highlight === i)}
              onClick={() => pick(i)}
              onMouseEnter={() => setHighlight(i)}
            >
              {option.label}
            </button>
          ))}
        </CascadeList>
      )}
      <p className="settings-field-note">
        Clamped to what the chosen model supports. Sessions can change this per message.
      </p>
    </div>
  )
}

// ---- read-only auth rows ----

function AuthRow({ provider, now }: { provider: ProviderAuthStatus; now: number }): JSX.Element {
  const health = authHealth(provider, now)
  const statusText =
    health === 'ok' ? (provider.source ?? HEALTH_DOT_LABEL[health]) : HEALTH_DOT_LABEL[health]
  return (
    <li className={`auth-row auth-row-${health}`}>
      <span className={`auth-dot auth-dot-${health}`} role="img" aria-label={HEALTH_DOT_LABEL[health]} />
      <div className="auth-row-main">
        <span className="auth-row-name">{provider.name}</span>
        <span className="auth-row-meta">
          {provider.modelCount} {provider.modelCount === 1 ? 'model' : 'models'}
          {provider.authType === 'oauth' &&
            provider.oauthExpiresAt !== null &&
            ` · token ${expiryText(provider.oauthExpiresAt, now)}`}
        </span>
      </div>
      <div className="auth-row-side">
        <span className="auth-row-status">{statusText}</span>
        {health !== 'ok' && <span className="auth-row-guide">Sign in from the Pi TUI (/login)</span>}
      </div>
    </li>
  )
}
