import type { CheckStatus, MilestoneStatus, Severity, Verdict } from '@arbiter/shared';
import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { titleCase } from '../../lib/format';

export type Tone ='neutral' | 'info' | 'agent' | 'success' | 'warning' | 'danger' | 'muted';

const TONES: Record<Tone, { chip: string; dot: string }> = {
  neutral: { chip: 'bg-white/5 text-ink-200 ring-white/10', dot: 'bg-ink-300' },
  muted: { chip: 'bg-white/[0.03] text-ink-400 ring-white/5', dot: 'bg-ink-500' },
  info: { chip: 'bg-sky-400/10 text-sky-200 ring-sky-300/25', dot: 'bg-sky-300' },
  agent: { chip: 'bg-iris-500/12 text-iris-200 ring-iris-400/30', dot: 'bg-iris-400' },
  success: { chip: 'bg-mint-400/12 text-mint-200 ring-mint-400/30', dot: 'bg-mint-400' },
  warning: { chip: 'bg-amber-400/12 text-amber-200 ring-amber-300/30', dot: 'bg-amber-300' },
  danger: { chip: 'bg-rose-500/12 text-rose-200 ring-rose-400/30', dot: 'bg-rose-400' },
};

const MILESTONE_TONE: Record<MilestoneStatus, Tone> = {
  PENDING: 'muted',
  FUNDING_REQUIRED: 'info',
  FUNDED: 'neutral',
  SUBMITTED: 'agent',
  VERIFYING: 'agent',
  APPROVED: 'success',
  REJECTED: 'danger',
  ESCALATED: 'warning',
  DISPUTED: 'warning',
  PAID: 'success',
  EXPIRED: 'muted',
  REFUNDED: 'muted',
};

const LIVE: MilestoneStatus[] = ['VERIFYING', 'SUBMITTED'];

export function toneForPayment(status: string): Tone {
  const s = status.toUpperCase();
  if (['COMPLETED', 'SUCCESS', 'CAPTURED'].includes(s)) return 'success';
  if (['PENDING', 'PROCESSING', 'NEW', 'CREATED', 'PAYER_ACTION_REQUIRED', 'APPROVED'].includes(s)) return 'info';
  if (['UNCLAIMED', 'ONHOLD', 'VOIDED'].includes(s)) return 'warning';
  if (['FAILED', 'DENIED', 'DECLINED', 'RETURNED', 'BLOCKED', 'REVERSED', 'CANCELED'].includes(s)) return 'danger';
  return 'neutral';
}

const CHECK_TONE: Record<CheckStatus, Tone> = { PASS: 'success', FAIL: 'danger', WARN: 'warning', SKIP: 'muted', ERROR: 'warning' };
export const toneForCheck = (s: CheckStatus): Tone => CHECK_TONE[s];

const SEVERITY_TONE: Record<Severity, Tone> = { info: 'muted', low: 'neutral', medium: 'warning', high: 'danger', critical: 'danger' };
export const toneForSeverity = (s: Severity): Tone => SEVERITY_TONE[s];

export const toneForVerdict = (v: Verdict | null): Tone =>
  v === 'APPROVE' ? 'success' : v === 'REJECT' ? 'danger' : v === 'ESCALATE' ? 'warning' : 'muted';

export function Chip({
  tone = 'neutral',
  children,
  pulse,
  className,
  size = 'md',
}: {
  tone?: Tone;
  children: ReactNode;
  pulse?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const t = TONES[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        t.chip,
        className,
      )}
    >
      <span className="relative flex size-1.5">
        {pulse ? <span className={cn('absolute inset-0 rounded-full animate-pulse-ring', t.dot)} /> : null}
        <span className={cn('relative size-1.5 rounded-full', t.dot)} />
      </span>
      {children}
    </span>
  );
}

const STATUS_LABEL: Partial<Record<MilestoneStatus, string>> = { FUNDING_REQUIRED: 'Needs funding' };

export function StatusChip({ status, size }: { status: MilestoneStatus; size?: 'sm' | 'md' }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={status}
        initial={{ opacity: 0, scale: 0.85, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.85, y: -4 }}
        transition={{ type: 'spring', stiffness: 420, damping: 28 }}
        className="inline-flex"
      >
        <Chip tone={MILESTONE_TONE[status]} pulse={LIVE.includes(status)} size={size}>
          {STATUS_LABEL[status] ?? titleCase(status)}
        </Chip>
      </motion.span>
    </AnimatePresence>
  );
}

export function VerdictChip({ verdict, size }: { verdict: Verdict | null; size?: 'sm' | 'md' }) {
  if (!verdict) return <span className="text-ink-500">—</span>;
  return (
    <Chip tone={toneForVerdict(verdict)} size={size}>
      {titleCase(verdict)}
    </Chip>
  );
}

export function CheckChip({ status, size }: { status: CheckStatus; size?: 'sm' | 'md' }) {
  return (
    <Chip tone={toneForCheck(status)} size={size}>
      {status}
    </Chip>
  );
}
