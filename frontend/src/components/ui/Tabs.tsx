import { motion } from 'framer-motion';
import { useId, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface TabDef<K extends string> {
  key: K;
  label: string;
  icon?: ReactNode;
  count?: number;
}

/** Segmented tabs with a spring-animated active pill (framer layoutId). */
export function Tabs<K extends string>({ tabs, value, onChange, className }: { tabs: TabDef<K>[]; value: K; onChange: (k: K) => void; className?: string }) {
  const layoutId = useId();
  return (
    <div role="tablist" className={cn('glass inline-flex flex-wrap gap-1 rounded-2xl p-1', className)}>
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={cn('relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors', active ? 'text-white' : 'text-ink-300 hover:text-white')}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-xl bg-white/[0.08] ring-1 ring-inset ring-white/10"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            ) : null}
            <span className="relative flex items-center gap-2">
              {t.icon}
              {t.label}
              {t.count !== undefined ? (
                <span className={cn('rounded-md px-1.5 text-[11px] tabular-nums', active ? 'bg-iris-500/25 text-iris-100' : 'bg-white/5 text-ink-400')}>{t.count}</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
