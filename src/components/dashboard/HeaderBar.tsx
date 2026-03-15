import { cn } from '@/lib/utils'

type HeaderBarProps = {
  isDarkMode: boolean
  onToggleTheme: () => void
}

export function HeaderBar({ isDarkMode, onToggleTheme }: HeaderBarProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-border/75 bg-background/88 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1360px] items-center justify-between px-3 py-2 md:px-4 md:py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="relative flex size-8 items-center justify-center overflow-hidden rounded-md border border-primary/55 bg-gradient-to-br from-amber-400/25 via-amber-500/12 to-transparent shadow-glow">
            <span className="font-mono text-[10px] font-semibold tracking-[0.1em] text-primary">CM</span>
            <span className="absolute inset-x-1.5 top-1.5 h-px bg-primary/45" />
            <span className="absolute inset-x-2 bottom-1.5 h-px bg-primary/25" />
          </div>
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-primary/80">U.S. Construction Market</p>
            <h1 className="text-[13px] font-semibold tracking-[0.015em] text-foreground md:text-sm">National Intelligence Dashboard</h1>
            <p className="text-[10.5px] leading-none text-muted-foreground">Permits • Starts • Labor • Cost Pressure • Scenario Forecasting</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            className="inline-flex h-7.5 w-7.5 items-center justify-center rounded-md border border-border/80 bg-card/75 text-[10.5px] font-medium text-muted-foreground transition hover:border-primary/55 hover:text-primary"
            type="button"
            aria-label="Information"
          >
            i
          </button>
          <button
            className={cn(
              'inline-flex h-7.5 w-7.5 items-center justify-center rounded-md border border-border/80 bg-card/75 text-[11px] transition hover:border-primary/55',
              isDarkMode ? 'text-primary' : 'text-muted-foreground'
            )}
            type="button"
            onClick={onToggleTheme}
            aria-label="Toggle theme"
          >
            {isDarkMode ? '☀' : '☾'}
          </button>
        </div>
      </div>
    </header>
  )
}
