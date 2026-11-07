import type { DashboardSummaryDTO } from '@arbiter/shared';
import { motion } from 'framer-motion';
import { AlertOctagon, ArrowUpRight, Clock3, Hourglass, Vault } from 'lucide-react';
import type { ReactNode } from 'react';
import { duration, money } from '../../lib/format';
import { cn } from '../../lib/cn';
import { AnimatedNumber } from '../ui/AnimatedNumber';

interface Tile {
  label: string;
  value: number;
  format: (n: number) => string;
  icon: ReactNode;
  accent: string;
  foot: ReactNode;
}

const usd = (n: number) => money(Math.round(n));

export function SummaryTiles({ s }: { s: DashboardSummaryDTO }) {
  const tiles: Tile[] = [
    {
      label: 'Total escrowed',
      value: s.totalEscrowedCents,
      format: usd,
      icon: <Vault className="size-4" />,
      accent: 'from-sky-400/25 text-sky-200',
      foot: 'Captured or authorized, not yet released',
    },
    {
      label: 'Total released',
      value: s.totalReleasedCents,
      format: usd,
      icon: <ArrowUpRight className="size-4" />,
      accent: 'from-mint-400/25 text-mint-200',
      foot: `${s.paidCount} milestone${s.paidCount === 1 ? '' : 's'} paid out`,
    },
    {
      label: 'Pending funding',
      value: s.pendingFundingCents,
      format: usd,
      icon: <Hourglass className="size-4" />,
      accent: 'from-iris-500/30 text-iris-200',
      foot: `${s.inReviewCount} deliverable${s.inReviewCount === 1 ? '' : 's'} in agent review now`,
    },
    {
      label: 'Escalations',
      value: s.escalationCount + s.disputeCount,
      format: (n) => String(Math.round(n)),
      icon: <AlertOctagon className="size-4" />,
      accent: 'from-amber-400/25 text-amber-200',
      foot: (
        <>
          {s.disputeCount} disputed · <span className="text-rose-300">{s.injectionFlags} injection flag{s.injectionFlags === 1 ? '' : 's'}</span>
        </>
      ),
    },
    {
      label: 'Avg time to payout',
      value: s.avgTimeToPayoutSeconds ?? 0,
      format: (n) => (s.avgTimeToPayoutSeconds === null ? '—' : duration(n)),
      icon: <Clock3 className="size-4" />,
      accent: 'from-white/15 text-ink-100',
      foot: 'Submission → payout settled',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {tiles.map((t, i) => (
        <motion.div
          key={t.label}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          whileHover={{ y: -3 }}
          className={cn('glass group relative overflow-hidden rounded-3xl p-4', i === 4 && 'col-span-2 md:col-span-1')}
        >
          <div className={cn('pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-gradient-to-br to-transparent blur-2xl transition-opacity group-hover:opacity-100', t.accent.split(' ')[0], 'opacity-70')} />
          <div className="relative flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-ink-300">
            <span className={cn('grid size-7 place-items-center rounded-lg bg-white/5 ring-1 ring-white/10', t.accent.split(' ')[1])}>{t.icon}</span>
            {t.label}
          </div>
          <AnimatedNumber value={t.value} format={t.format} className="relative mt-3 block font-display text-2xl font-semibold tabular-nums text-white sm:text-[28px]" />
          <div className="relative mt-1 text-[11.5px] text-ink-400">{t.foot}</div>
        </motion.div>
      ))}
    </div>
  );
}
