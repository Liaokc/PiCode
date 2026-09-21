import type { JSX, SVGProps } from 'react'

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number
}

function svgProps(size: number | undefined, className: string | undefined): SVGProps<SVGSVGElement> {
  return {
    width: size ?? 16,
    height: size ?? 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className,
    'aria-hidden': true
  }
}

export function PlusIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function SearchIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

export function ChevronDownIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="m6 9.5 6 6 6-6" />
    </svg>
  )
}

export function ChevronLeftIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="m14 6-6 6 6 6" />
    </svg>
  )
}

export function ChevronRightIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="m10 6 6 6-6 6" />
    </svg>
  )
}

export function PanelLeftIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M9.5 4v16" />
    </svg>
  )
}

export function PanelRightIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M14.5 4v16" />
    </svg>
  )
}

/** Bottom-panel glyph (ticket 18): the terminal dock toggle in the titlebar.
 * Filled lower band reads as "panel docked at the bottom" (ZCode parity). */
export function PanelBottomIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <rect x="5.2" y="14" width="13.6" height="3.8" rx="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Activity pulse glyph (ticket 18 feedback): the Bridge Dock toggle —
 * a heartbeat line reads as "agent command activity feed". */
export function PulseIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M3 12h4.2l2.3-6.2 4.4 12.4 2.3-6.2H21" />
    </svg>
  )
}

export function HashIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16" />
    </svg>
  )
}

export function FolderIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M3 8.2A2.2 2.2 0 0 1 5.2 6h3.9l1.9 2h8A2.2 2.2 0 0 1 21.2 10v7A2.2 2.2 0 0 1 19 19.2H5A2.2 2.2 0 0 1 2.8 17l.2-8.8Z" />
    </svg>
  )
}

export function ProjectsFolderIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M3 8.2A2.2 2.2 0 0 1 5.2 6h3.9l1.9 2h8A2.2 2.2 0 0 1 21.2 10v7A2.2 2.2 0 0 1 19 19.2H5A2.2 2.2 0 0 1 2.8 17l.2-8.8Z" />
      <path d="M12 11.5v4M10 13.5h4" />
    </svg>
  )
}

export function ExpandArrowsIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M9 3H3v6M3 3l6.5 6.5M15 21h6v-6M21 21l-6.5-6.5" />
    </svg>
  )
}

export function FilterIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M3 5.5h18L14.5 13v5.5L9.5 21v-8Z" />
    </svg>
  )
}

export function TrashIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M4 7h16M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2M6.5 7l1 12a2 2 0 0 0 2 1.8h5a2 2 0 0 0 2-1.8l1-12M10 11v6M14 11v6" />
    </svg>
  )
}

/** Archive box (ticket 35): the row hover archive action — a lidded box,
 * deliberately NOT the trash glyph (archive ≠ delete, CONTEXT.md). */
export function ArchiveBoxIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v2A1.5 1.5 0 0 1 18.5 9h-13A1.5 1.5 0 0 1 4 7.5Z M5.5 9v8.5A2.5 2.5 0 0 0 8 20h8a2.5 2.5 0 0 0 2.5-2.5V9 M10 13.5h4" />
    </svg>
  )
}

export function GripDotsIcon({ size, className }: IconProps): JSX.Element {
  const dots: Array<[number, number]> = [
    [9, 7],
    [15, 7],
    [9, 12],
    [15, 12],
    [9, 17],
    [15, 17]
  ]
  return (
    <svg {...svgProps(size, className)} fill="currentColor" stroke="none">
      {dots.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.25" />
      ))}
    </svg>
  )
}

export function GearIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19 12a7 7 0 0 0-.14-1.4l2-1.55-2-3.46-2.35.95a7 7 0 0 0-2.42-1.4L13.73 2.7h-3.46l-.36 2.44a7 7 0 0 0-2.42 1.4l-2.35-.95-2 3.46 2 1.55a7 7 0 0 0 0 2.8l-2 1.55 2 3.46 2.35-.95a7 7 0 0 0 2.42 1.4l.36 2.44h3.46l.36-2.44a7 7 0 0 0 2.42-1.4l2.35.95 2-3.46-2-1.55A7 7 0 0 0 19 12Z" />
    </svg>
  )
}

export function ShieldCheckIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M12 3l7 2.8v5c0 4.4-2.9 7.5-7 9.2-4.1-1.7-7-4.8-7-9.2v-5Z" />
      <path d="m9.3 11.6 2 2 3.6-4.2" />
    </svg>
  )
}

/** Ticket 122 (spec R5): the thinking-level brain. Self-drawn geometry —
 * two hemispheres (a 12-segment closed blob symmetric about x=12) around a
 * central fissure, with two fold squiggles per hemisphere. Pure geometric
 * paths: no font, no copied ZCode asset (the red line). Retires the gauge
 * (thinking chip is the only consumer). */
export function BrainIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M12 19.6c1.8 0 3.4-1.2 3.7-2.9 1.6-.1 2.9-1.4 2.9-3 1.4-.7 2-2.5 1.3-4 .4-1.7-.7-3.3-2.4-3.5-.4-1.6-2.1-2.5-3.6-2-.6-.3-1.3-.3-1.9-.2-.6-.1-1.3-.1-1.9.2-1.5-.5-3.2.4-3.6 2-1.7.2-2.8 1.8-2.4 3.5-.7 1.5-.1 3.3 1.3 4 0 1.6 1.3 2.9 2.9 3 .3 1.7 1.9 2.9 3.7 2.9Z" />
      <path d="M12 4.8v14" />
      <path d="M8.2 8.5c.2 1.2 1.2 2.1 2.4 2.2" />
      <path d="M15.8 8.5c-.2 1.2-1.2 2.1-2.4 2.2" />
      <path d="M7.4 12.9c.6.9 1.7 1.4 2.8 1.2" />
      <path d="M16.6 12.9c-.6.9-1.7 1.4-2.8 1.2" />
    </svg>
  )
}

export function ArrowUpIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M12 19V5.5M5.5 12 12 5.5 18.5 12" />
    </svg>
  )
}

export function ArrowDownIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M12 5v13.5M5.5 12 12 18.5 18.5 12" />
    </svg>
  )
}

/** Expand-all (ticket 37): chevrons pointing apart, ZCode's unfold glyph. */
export function UnfoldIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M12 3.5 6.5 9M12 3.5 17.5 9" />
      <path d="M12 20.5 6.5 15M12 20.5 17.5 15" />
    </svg>
  )
}

/** Collapse-all (ticket 37): chevrons pointing together, ZCode's fold glyph. */
export function FoldIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M6.5 5 12 10.5 17.5 5" />
      <path d="M6.5 19 12 13.5 17.5 19" />
    </svg>
  )
}

export function FileTextIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M7 3h7l4 4v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M13.5 3v4.5H18M9 12h6M9 15.5h6" />
    </svg>
  )
}

export function CalendarIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 2.5V6M16 2.5V6" />
    </svg>
  )
}

export function BugIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <rect x="8" y="7.5" width="8" height="11" rx="4" />
      <path d="M9.5 7.5a2.5 2.5 0 0 1 5 0M8 11H3.5M8 14.5H4.5M8 18l-3 2.5M16 11h4.5M16 14.5h3.5M16 18l3 2.5M9.5 18.5 8 21M14.5 18.5 16 21" />
    </svg>
  )
}

export function MonitorIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <rect x="3" y="4.5" width="18" height="12.5" rx="2" />
      <path d="M9.5 20.5h5M12 17v3.5" />
    </svg>
  )
}

export function ClockIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <circle cx="12" cy="12" r="8.75" />
      <path d="M12 7.5V12l3 2.5" />
    </svg>
  )
}

export function TerminalSquareIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="m7 9.5 3 3-3 3M12.5 15.5H17" />
    </svg>
  )
}

export function StopIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function SlidersIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M5 4v6m0 4v6M12 4v10m0 4v2m7-16v2m0 4v10" />
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="16" r="2" />
      <circle cx="19" cy="8" r="2" />
    </svg>
  )
}

export function PinIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M12 17v4" />
      <path d="M8.5 4h7l-1 6 2.8 2.8a1 1 0 0 1-.7 1.7H7.4a1 1 0 0 1-.7-1.7L9.5 10Z" />
    </svg>
  )
}

export function PaletteIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M12 21a9 9 0 1 1 9-9c0 2.5-1.7 3.6-3.4 3.6h-2a2.1 2.1 0 0 0-1.6 3.5c.5.6.2 1.9-2 1.9Z" />
      <circle cx="7.8" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="11" cy="7.3" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.3" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function PencilIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M4 20h4.5L20 8.5a2.1 2.1 0 0 0-3-3L5.5 17Z" />
      <path d="m13.5 7 3 3" />
    </svg>
  )
}

export function CubeIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z" />
      <path d="m4.2 7.7 7.8 4.3 7.8-4.3M12 12v9" />
    </svg>
  )
}

export function BoxesIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M7.5 11.5 3 14v5l4.5 2.5L12 19v-5Z" />
      <path d="M3.3 13.8 7.5 16l4.2-2.2M7.5 16v5.2" />
      <path d="M16.5 11.5 12 14v5l4.5 2.5L21 19v-5Z" />
      <path d="m12.3 13.8 4.2 2.2 4.2-2.2M16.5 16v5.2" />
      <path d="m12 2.5-4.5 2.5v5L12 12.5l4.5-2.5V5Z" />
      <path d="M7.8 5.3 12 7.5l4.2-2.2M12 7.5v5" />
    </svg>
  )
}

/** Ticket 89: the MCP nav icon — a plug (server connection). */
export function PlugIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M9 7V3M15 7V3" />
      <path d="M7 7h10v4a5 5 0 0 1-5 5 5 5 0 0 1-5-5Z" />
      <path d="M12 16v5" />
    </svg>
  )
}

export function BarChartIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M4 20V10M10 20V4M16 20v-7M21 20H3.5" />
    </svg>
  )
}

export function HistoryIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5" />
      <path d="M3.5 3.5v5h5" />
      <path d="M12 8v4.5l3 1.8" />
    </svg>
  )
}

export function CloseIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  )
}

export function CheckIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  )
}

export function CopyIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5.5 14.5A1.5 1.5 0 0 1 4 13V5.5A1.5 1.5 0 0 1 5.5 4H13a1.5 1.5 0 0 1 1.5 1.5" />
    </svg>
  )
}

export function SparklesIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M12 4.5 13.8 9.7 19 11.5 13.8 13.3 12 18.5 10.2 13.3 5 11.5 10.2 9.7Z" />
      <path d="M19 16.5 19.7 18.3 21.5 19 19.7 19.7 19 21.5 18.3 19.7 16.5 19 18.3 18.3Z" />
    </svg>
  )
}

/** Skill marker (ticket 23): wand with a spark, à la ZCode's skill row. */
export function WandIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="m4.5 19.5 9-9" />
      <path d="m13 7 4-4 4 4-4 4Z" />
      <path d="M19.5 15.5v.01M15.5 19.5v.01M21 19.5v.01" strokeWidth={2.2} />
    </svg>
  )
}

export function LoaderIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M12 3.5v3.4M12 17.1v3.4M3.5 12h3.4M17.1 12h3.4M6 6l2.4 2.4M15.6 15.6 18 18M18 6l-2.4 2.4M8.4 15.6 6 18" />
    </svg>
  )
}

export function RefreshIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v4.5h-4.5" />
    </svg>
  )
}

export function ArrowRightIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M4 12h16M14 6l6 6-6 6" />
    </svg>
  )
}

export function CodeIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="m8.5 8-4 4 4 4M15.5 8l4 4-4 4" />
    </svg>
  )
}

export function EyeIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.7" />
    </svg>
  )
}

export function WrapTextIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M4 6h16" />
      <path d="M4 12h10" />
      <path d="M4 18h16" />
      <path d="M14 12h3.5a3.5 3.5 0 0 1 0 7H14" />
      <path d="m16 16-2 3 2 3" />
    </svg>
  )
}

export function GitBranchIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <circle cx="6" cy="5" r="2.2" />
      <circle cx="6" cy="19" r="2.2" />
      <circle cx="18" cy="9" r="2.2" />
      <path d="M6 7.2v9.6M18 11.2c0 3-2.5 4.3-5.5 4.6" />
    </svg>
  )
}

/** Group-row hover action (ticket 19): ZCode's ⋯ more-menu glyph. */
export function EllipsisIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)} fill="currentColor" stroke="none">
      <circle cx="5.5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="18.5" cy="12" r="1.5" />
    </svg>
  )
}

/** Group-row hover action (ticket 19): ZCode's new-task glyph — a speech
 * bubble with a plus, "start a task in this project". */
export function MessagePlusIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M21 11.4a8.4 8.4 0 0 1-8.5 8.3 9 9 0 0 1-3.9-.9L3.5 20l1.2-4.1a8 8 0 0 1-1.2-4.5A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.3Z" />
      <path d="M12 8.2v6M9 11.2h6" />
    </svg>
  )
}

/** Group-row hover action (ticket 26): ZCode's view-files glyph — the list
 * icon, "browse this project's files". */
export function FilesListIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.8" cy="6" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="4.8" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="4.8" cy="18" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** File-type icon (ticket 26): config/json files — braces glyph. */
export function BracesIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M8.5 4H8a2.5 2.5 0 0 0-2.5 2.5v2.6a1.9 1.9 0 0 1-1.5 1.9 1.9 1.9 0 0 1 1.5 1.9v2.6A2.5 2.5 0 0 0 8 18h.5" />
      <path d="M15.5 4h.5a2.5 2.5 0 0 1 2.5 2.5v2.6a1.9 1.9 0 0 0 1.5 1.9 1.9 1.9 0 0 0-1.5 1.9v2.6A2.5 2.5 0 0 1 16 18h-.5" />
    </svg>
  )
}

/** File-type icon (ticket 26): image files — framed picture glyph. */
export function ImageIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <rect x="3.5" y="5" width="17" height="14" rx="2.2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m5.5 17 4.2-4.2a1.6 1.6 0 0 1 2.3 0l4.5 4.2M14 14.5l1.7-1.7a1.6 1.6 0 0 1 2.3 0l2 2" />
    </svg>
  )
}

/** Diagram-card download control (ticket 59): arrow into a tray glyph. */
export function DownloadIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M12 3.5v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4.5 20.5h15" />
    </svg>
  )
}

/** Diagram-card fullscreen control (ticket 59): four corner brackets. */
export function FullscreenIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M4 9.5V4h5.5" />
      <path d="M20 9.5V4h-5.5" />
      <path d="M4 14.5V20h5.5" />
      <path d="M20 14.5V20h-5.5" />
    </svg>
  )
}

/** Diagram zoom-out control (ticket 59): plain minus. */
export function MinusIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M5 12h14" />
    </svg>
  )
}

/** Diagram zoom-reset control (ticket 59): crosshair / fit glyph. */
export function TargetIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21" />
    </svg>
  )
}
