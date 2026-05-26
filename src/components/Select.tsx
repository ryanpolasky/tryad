export interface SelectOption<T extends string> {
  value: T
  label: string
}

export interface SelectGroup<T extends string> {
  label: string
  options: SelectOption<T>[]
}

interface SelectProps<T extends string> {
  value: T
  onChange: (v: T) => void
  /** flat option list. ignored when `groups` is set. */
  options?: SelectOption<T>[]
  /** grouped options. renders <optgroup>s for easier scanning of long lists. */
  groups?: SelectGroup<T>[]
  label?: string
  className?: string
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  groups,
  label,
  className = '',
}: SelectProps<T>) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      {label ? <span className="eyebrow">{label}</span> : null}
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          className="input appearance-none pr-8 w-full cursor-pointer lowercase"
        >
          {groups
            ? groups.map((g) => (
                <optgroup key={g.label} label={g.label} className="bg-bg-card text-ink">
                  {g.options.map((o) => (
                    <option key={o.value} value={o.value} className="bg-bg-card text-ink">
                      {o.label.toLowerCase()}
                    </option>
                  ))}
                </optgroup>
              ))
            : (options ?? []).map((o) => (
                <option key={o.value} value={o.value} className="bg-bg-card text-ink">
                  {o.label.toLowerCase()}
                </option>
              ))}
        </select>
        <svg
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-mute"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </div>
    </label>
  )
}
