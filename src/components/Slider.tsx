interface SliderProps {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  label?: string
  suffix?: string
  className?: string
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  suffix,
  className = '',
}: SliderProps) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      {label ? (
        <span className="eyebrow flex justify-between items-baseline">
          <span>{label}</span>
          <span className="font-mono text-[11px] tracking-normal text-ink normal-case">
            {value}
            {suffix ? <span className="text-ink-mute">{suffix}</span> : null}
          </span>
        </span>
      ) : null}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}
