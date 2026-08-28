import type { JSX } from 'react'

interface SegmentedOption<V> {
  value: V
  label: string
}

interface SegmentedProps<V> {
  options: readonly SegmentedOption<V>[]
  value: V
  onChange: (value: V) => void
  ariaLabel: string
}

/** ZCode-style segmented control (heatmap modes, trend ranges). */
export default function Segmented<V extends string | number>({ options, value, onChange, ariaLabel }: SegmentedProps<V>): JSX.Element {
  return (
    <div className="seg" role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className={option.value === value ? 'seg-btn seg-btn-active' : 'seg-btn'}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
