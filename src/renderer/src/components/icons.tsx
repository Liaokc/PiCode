import type { JSX, SVGProps } from 'react'

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number
}

function base(size: number | undefined, className: string | undefined): SVGProps<SVGSVGElement> {
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
    <svg {...base(size, className)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function SearchIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...base(size, className)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

export function ChevronLeftIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...base(size, className)}>
      <path d="m14 6-6 6 6 6" />
    </svg>
  )
}

export function ChevronRightIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...base(size, className)}>
      <path d="m10 6 6 6-6 6" />
    </svg>
  )
}

export function PanelLeftIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...base(size, className)}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M9.5 4v16" />
    </svg>
  )
}

export function PanelRightIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...base(size, className)}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M14.5 4v16" />
    </svg>
  )
}

export function HelpCircleIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.4 9.2a2.7 2.7 0 0 1 5.2.9c0 1.8-2.6 2.4-2.6 3.7" />
      <path d="M12 17.2h.01" strokeWidth={2.2} />
    </svg>
  )
}

export function HashIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...base(size, className)}>
      <path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16" />
    </svg>
  )
}

export function FolderIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...base(size, className)}>
      <path d="M3 8.2A2.2 2.2 0 0 1 5.2 6h3.9l1.9 2h8A2.2 2.2 0 0 1 21.2 10v7A2.2 2.2 0 0 1 19 19.2H5A2.2 2.2 0 0 1 2.8 17l.2-8.8Z" />
    </svg>
  )
}

export function ProjectsFolderIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...base(size, className)}>
      <path d="M3 8.2A2.2 2.2 0 0 1 5.2 6h3.9l1.9 2h8A2.2 2.2 0 0 1 21.2 10v7A2.2 2.2 0 0 1 19 19.2H5A2.2 2.2 0 0 1 2.8 17l.2-8.8Z" />
      <path d="M12 11.5v4M10 13.5h4" />
    </svg>
  )
}

export function ExpandArrowsIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...base(size, className)}>
      <path d="M9 3H3v6M3 3l6.5 6.5M15 21h6v-6M21 21l-6.5-6.5" />
    </svg>
  )
}

export function FilterIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...base(size, className)}>
      <path d="M3 5.5h18L14.5 13v5.5L9.5 21v-8Z" />
    </svg>
  )
}

export function TrashIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...base(size, className)}>
      <path d="M4 7h16M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2M6.5 7l1 12a2 2 0 0 0 2 1.8h5a2 2 0 0 0 2-1.8l1-12M10 11v6M14 11v6" />
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
    <svg {...base(size, className)} fill="currentColor" stroke="none">
      {dots.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.25" />
      ))}
    </svg>
  )
}

export function SparkleIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...base(size, className)}>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8ZM18.5 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9Z" />
    </svg>
  )
}

export function GearIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19 12a7 7 0 0 0-.14-1.4l2-1.55-2-3.46-2.35.95a7 7 0 0 0-2.42-1.4L13.73 2.7h-3.46l-.36 2.44a7 7 0 0 0-2.42 1.4l-2.35-.95-2 3.46 2 1.55a7 7 0 0 0 0 2.8l-2 1.55 2 3.46 2.35-.95a7 7 0 0 0 2.42 1.4l.36 2.44h3.46l.36-2.44a7 7 0 0 0 2.42-1.4l2.35.95 2-3.46-2-1.55A7 7 0 0 0 19 12Z" />
    </svg>
  )
}

export function ShieldCheckIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...base(size, className)}>
      <path d="M12 3l7 2.8v5c0 4.4-2.9 7.5-7 9.2-4.1-1.7-7-4.8-7-9.2v-5Z" />
      <path d="m9.3 11.6 2 2 3.6-4.2" />
    </svg>
  )
}

export function GaugeIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 10v3.8M10 2.5h4M17.8 8.2l1.4-1.4" />
    </svg>
  )
}

export function ArrowUpIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...base(size, className)}>
      <path d="M12 19V5.5M5.5 12 12 5.5 18.5 12" />
    </svg>
  )
}

export function FileTextIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...base(size, className)}>
      <path d="M7 3h7l4 4v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M13.5 3v4.5H18M9 12h6M9 15.5h6" />
    </svg>
  )
}

export function TerminalSquareIcon({ size, className }: IconProps): JSX.Element {
  return (
    <svg {...base(size, className)}>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="m7 9.5 3 3-3 3M12.5 15.5H17" />
    </svg>
  )
}
