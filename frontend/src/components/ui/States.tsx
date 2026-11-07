import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function EmptyState({ icon, title, message, action, className }: { icon?: ReactNode; title: string; message: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('flex flex-col items-center rounded-3xl border border-dashed border-white/10 px-6 py-14 text-center', className)}
    >
      {icon ? (
        <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-iris-500/20 to-mint-400/10 text-iris-200 ring-1 ring-white/10">
          {icon}
        </div>
      ) : null}
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm text-ink-300">{message}</p>
      {action ? <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div> : null}
    </motion.div>
  );
}
