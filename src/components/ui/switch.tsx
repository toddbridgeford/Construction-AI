import { cn } from '@/lib/utils'

type SwitchProps = {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  defaultChecked?: boolean
}

export function Switch({ checked, defaultChecked = false, onCheckedChange }: SwitchProps) {
  const isChecked = checked ?? defaultChecked

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isChecked}
      onClick={() => onCheckedChange?.(!isChecked)}
      className={cn(
        'inline-flex h-[17px] w-8 items-center rounded-full border border-border/80 bg-muted px-[2px] transition',
        isChecked && 'border-primary/75 bg-gradient-to-r from-primary/35 to-primary/20 shadow-[0_0_0_1px_rgba(245,158,11,0.22)]'
      )}
    >
      <span
        className={cn(
          'size-[12px] rounded-full bg-slate-100 transition-transform',
          isChecked && 'translate-x-[13px] bg-primary shadow-[0_0_10px_rgba(245,158,11,0.72)]'
        )}
      />
    </button>
  )
}
