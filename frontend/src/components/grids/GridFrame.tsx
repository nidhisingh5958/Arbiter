import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/** Fixed-height container for a grid; opts out of Lenis so the grid scrolls natively. */
export function GridFrame({ children, toolbar, height = 560, className }: { children: ReactNode; toolbar?: ReactNode; height?: number; className?: string }) {
  return (
    <div className={cn('glass overflow-hidden rounded-3xl', className)}>
      {toolbar ? <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-3">{toolbar}</div> : null}
      <div data-lenis-prevent className="ag-theme-arbiter" style={{ height }}>
        {children}
      </div>
    </div>
  );
}

export function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors',
        active ? 'bg-iris-500/20 text-iris-100 ring-iris-400/40' : 'bg-white/[0.03] text-ink-300 ring-white/10 hover:text-white',
      )}
    >
      {children}
    </button>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="h-8 w-full rounded-lg bg-ink-900/70 px-3 text-xs text-ink-100 ring-1 ring-inset ring-white/10 placeholder:text-ink-500 focus:outline-none focus:ring-iris-400/60 sm:w-56"
    />
  );
}
