import { motion, type HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface CardProps extends HTMLMotionProps<'section'> {
  children?: ReactNode;
  interactive?: boolean;
}

export function Card({ className, children, interactive, ...rest }: CardProps) {
  return (
    <motion.section
      className={cn('glass relative rounded-3xl p-5 sm:p-6', interactive && 'transition-colors hover:border-white/15', className)}
      {...rest}
    >
      {children}
    </motion.section>
  );
}

export function CardHeader({ title, subtitle, icon, action }: { title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        {icon ? <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-white/5 text-iris-300 ring-1 ring-white/10">{icon}</div> : null}
        <div>
          <h3 className="text-[15px] font-semibold text-white">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-sm text-ink-300">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}
