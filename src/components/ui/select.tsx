import type { ChangeEvent } from 'react'

type SelectOption = {
  label: string
  value: string
}

type SelectProps = {
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  options: SelectOption[]
  className?: string
}

export function Select({ value, defaultValue, onChange, options, className }: SelectProps) {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange?.(event.target.value)
  }

  return (
    <select
      value={value}
      defaultValue={defaultValue}
      onChange={handleChange}
      className={[
        'h-7.5 min-w-[7rem] rounded-md border border-border/80 bg-background/80 px-2.5 text-[10.5px] font-medium tracking-[0.03em] text-foreground shadow-inset focus:outline-none focus:ring-1 focus:ring-ring/70',
        className
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
