import type { AgentStep, ReviewDTO } from '@arbiter/shared';
import { motion } from 'framer-motion';
import { Brain, Check, Gavel, ListChecks, Loader2, Scale, ShieldAlert, Wallet } from 'lucide-react';
import { useMemo } from 'react';
import { cn } from '../../lib/cn';
import { useLiveEvents } from '../../lib/liveEvents';

const STEPS: { key: AgentStep | 'payout'; label: string; icon: typeof Brain }[] = [
  { key: 'deterministic_checks', label: 'Deterministic checks', icon: ListChecks },
  { key: 'injection_scan', label: 'Injection scan', icon: ShieldAlert },
  { key: 'llm_judgment', label: 'LLM judgment', icon: Brain },
  { key: 'policy_gate', label: 'Policy gate', icon: Scale },
  { key: 'decision', label: 'Decision', icon: Gavel },
  { key: 'payout', label: 'PayPal payout', icon: Wallet },
];

type State = 'done' | 'active' | 'pending' | 'blocked';

/** Live view of the verification pipeline, driven by agent.step SSE events while running. */
export function AgentStepper({ review }: { review: ReviewDTO }) {
  const events = useLiveEvents();
  const { milestone, decisions } = review;

  const states = useMemo<State[]>(() => {
    const running = milestone.status === 'VERIFYING' || milestone.status === 'SUBMITTED';
    if (running) {
      const latest = events.find((e) => e.type === 'agent.step' && e.milestoneId === milestone.id);
      const idx = latest && latest.type === 'agent.step' ? Math.max(0, STEPS.findIndex((s) => s.key === latest.step)) : 0;
      return STEPS.map((_, i) => (i < idx ? 'done' : i === idx ? 'active' : 'pending'));
    }
    const has = (a: string) => decisions.some((d) => d.action === a);
    const decided = Boolean(milestone.decidedAt);
    const payout: State =
      milestone.status === 'PAID'
        ? 'done'
        : milestone.status === 'APPROVED'
          ? 'active'
          : ['REJECTED', 'ESCALATED', 'DISPUTED', 'REFUNDED'].includes(milestone.status) && decided
            ? 'blocked'
            : 'pending';
    return [
      has('DETERMINISTIC_CHECKS') ? 'done' : 'pending',
      has('INJECTION_SCAN') ? (milestone.injectionFlag ? 'blocked' : 'done') : 'pending',
      has('LLM_VERDICT') ? 'done' : 'pending',
      has('POLICY_GATE') ? 'done' : 'pending',
      decided ? (milestone.decisionVerdict === 'APPROVE' ? 'done' : 'blocked') : 'pending',
      payout,
    ];
  }, [events, milestone, decisions]);

  const progress = (states.filter((s) => s === 'done' || s === 'blocked').length + (states.includes('active') ? 0.5 : 0)) / STEPS.length;

  return (
    <div className="glass relative overflow-hidden rounded-3xl px-4 py-5 sm:px-6" aria-label="Verification pipeline">
      <div className="absolute left-10 right-10 top-[42px] hidden h-px bg-white/[0.07] sm:block" />
      <motion.div
        className="absolute left-10 top-[42px] hidden h-px bg-gradient-to-r from-iris-400 to-mint-400 sm:block"
        initial={{ width: 0 }}
        animate={{ width: `calc((100% - 5rem) * ${Math.min(1, progress)})` }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      />
      <ol className="relative grid grid-cols-3 gap-y-5 sm:grid-cols-6">
        {STEPS.map((s, i) => {
          const st = states[i]!;
          return (
            <li key={s.key} className="flex flex-col items-center gap-2 text-center">
              <motion.div
                animate={{ scale: st === 'active' ? 1.08 : 1 }}
                className={cn(
                  'relative grid size-11 place-items-center rounded-2xl ring-1 transition-colors duration-500',
                  st === 'done' && 'bg-mint-400/15 text-mint-200 ring-mint-400/40',
                  st === 'active' && 'bg-iris-500/20 text-iris-100 ring-iris-400/60 shadow-[0_0_30px_-4px_rgb(139_123_255/0.6)]',
                  st === 'blocked' && 'bg-amber-400/12 text-amber-200 ring-amber-300/40',
                  st === 'pending' && 'bg-white/[0.03] text-ink-500 ring-white/10',
                )}
              >
                {st === 'active' ? <Loader2 className="size-5 animate-spin" /> : st === 'done' ? <Check className="size-5" /> : <s.icon className="size-5" />}
              </motion.div>
              <span className={cn('text-[11.5px] font-medium', st === 'pending' ? 'text-ink-500' : 'text-ink-200')}>{s.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
