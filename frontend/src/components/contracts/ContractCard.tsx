import type { ContractDTO, MilestoneStatus } from '@arbiter/shared';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { money, relativeTime } from '../../lib/format';
import { cn } from '../../lib/cn';
import { Chip } from '../ui/StatusChip';

const SEG: Partial<Record<MilestoneStatus, string>> = {
  PAID: 'bg-mint-400',
  APPROVED: 'bg-mint-300/70',
  VERIFYING: 'bg-iris-400',
  SUBMITTED: 'bg-iris-300',
  FUNDED: 'bg-sky-300',
  FUNDING_REQUIRED: 'bg-sky-400/40',
  ESCALATED: 'bg-amber-300',
  DISPUTED: 'bg-amber-400',
  REJECTED: 'bg-rose-400',
};

export function ContractCard({ c, index }: { c: ContractDTO; index: number }) {
  const paidPct = c.totalCents ? (c.paidCents / c.totalCents) * 100 : 0;
  const attention = c.milestoneStatuses.some((s) => s === 'ESCALATED' || s === 'DISPUTED');
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.4), duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -4 }}
    >
      <Link to={`/contracts/${c.id}`} className="glass group block h-full rounded-3xl p-5 transition-colors hover:border-white/15">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[17px] font-semibold text-white">{c.title}</h3>
            <p className="mt-0.5 text-xs text-ink-400">
              {c.buyerName} → {c.contractorName} · {relativeTime(c.createdAt)}
            </p>
          </div>
          <ArrowUpRight className="size-5 shrink-0 text-ink-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-iris-300" />
        </div>

        <div className="mt-5 flex items-end justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-ink-400">Contract value</div>
            <div className="font-display text-2xl font-semibold tabular-nums text-white">{money(c.totalCents, c.currency)}</div>
          </div>
          <div className="flex gap-1.5">
            {c.status === 'COMPLETED' ? <Chip tone="success" size="sm">Completed</Chip> : null}
            {attention ? <Chip tone="warning" size="sm">Needs attention</Chip> : null}
          </div>
        </div>

        <div className="mt-4 flex h-2 gap-1" aria-label="Milestone progress">
          {c.milestoneStatuses.map((s, i) => (
            <span key={i} title={s} className={cn('h-full flex-1 rounded-full', SEG[s] ?? 'bg-white/10')} />
          ))}
        </div>
        <div className="mt-3 flex justify-between text-xs tabular-nums text-ink-300">
          <span>
            Paid <b className="text-mint-300">{money(c.paidCents, c.currency)}</b> ({Math.round(paidPct)}%)
          </span>
          <span>
            In escrow <b className="text-sky-200">{money(c.escrowedCents, c.currency)}</b>
          </span>
        </div>
      </Link>
    </motion.div>
  );
}
