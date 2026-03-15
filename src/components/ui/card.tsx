import * as React from 'react'

import { cn } from '@/lib/utils'

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'relative overflow-hidden rounded-lg border border-border/85 bg-card/95 text-card-foreground shadow-panel shadow-inset transition-colors',
        'before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent_30%)]',
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-header" className={cn('relative z-[1] flex flex-col gap-1 px-3.5 pt-3', className)} {...props} />
}

function CardTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return <h3 data-slot="card-title" className={cn('text-[12px] font-semibold tracking-[0.015em] text-foreground', className)} {...props} />
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('relative z-[1] p-3.5 pt-2.5', className)} {...props} />
}

export { Card, CardContent, CardHeader, CardTitle }
