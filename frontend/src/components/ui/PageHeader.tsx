import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
        {eyebrow ? <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-iris-300">{eyebrow}</div> : null}
        <h1 className="text-3xl font-semibold text-white sm:text-4xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-[15px] text-ink-300">{description}</p> : null}
      </motion.div>
      {actions ? (
        <motion.div
          className="flex flex-wrap gap-2"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
        >
          {actions}
        </motion.div>
      ) : null}
    </div>
  );
}
