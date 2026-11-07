import type { ReviewDTO } from '@arbiter/shared';
import { motion } from 'framer-motion';
import { Bot, Cpu, ShieldAlert } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Card } from '../ui/Card';
import { ConfidenceGauge } from '../ui/ConfidenceGauge';

const WORD = { APPROVE: 'Approved', REJECT: 'Rejected', ESCALATE: 'Escalated' } as const;
const COLOR = { APPROVE: 'text-mint-300', REJECT: 'text-rose-300', ESCALATE: 'text-amber-200' } as const;

export function VerdictPanel({ review }: { review: ReviewDTO }) {
  const { milestone, judge, decisions, policy } = review;
  const verdictDecision = [...decisions].reverse().find((d) => d.action === 'LLM_VERDICT');
  const verdict = milestone.decisionVerdict;
  const verifying = milestone.status === 'VERIFYING' || milestone.status === 'SUBMITTED';

  return (
    <Card className="overflow-hidden">
      <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-iris-500/15 blur-3xl" />
      <div className="relative flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-ink-300">
        <Bot className="size-4 text-iris-300" /> Agent verdict
      </div>

      {verifying ? (
        <div className="relative py-8 text-center">
          <div className="text-gradient font-display text-3xl font-semibold">Verifying…</div>
          <p className="mt-2 text-sm text-ink-300">Running checks, scanning for injection and asking the judge.</p>
        </div>
      ) : verdict ? (
        <div className="relative mt-3 flex flex-col items-center">
          <motion.div
            key={verdict}
            initial={{ opacity: 0, y: 10, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className={cn('font-display text-4xl font-semibold tracking-tight', COLOR[verdict])}
          >
            {WORD[verdict]}
          </motion.div>
          <div className="mt-3">
            <ConfidenceGauge value={judge?.confidence ?? milestone.decisionConfidence} threshold={policy.minConfidence} />
          </div>
          {milestone.injectionFlag ? (
            <div className="mt-4 flex w-full items-center gap-2 rounded-2xl bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-100 ring-1 ring-rose-400/30">
              <ShieldAlert className="size-4 shrink-0 text-rose-300" /> Prompt-injection attempt detected — automatic payout blocked.
            </div>
          ) : null}
          <p className="mt-4 text-center text-sm leading-relaxed text-ink-200">{milestone.decisionSummary}</p>
          {judge && judge.summary !== milestone.decisionSummary ? (
            <p className="mt-2 text-center text-xs leading-relaxed text-ink-400">Judge: “{judge.summary}”</p>
          ) : null}
        </div>
      ) : (
        <div className="relative py-8 text-center">
          <div className="font-display text-2xl font-semibold text-ink-200">No verdict yet</div>
          <p className="mt-2 text-sm text-ink-400">The agent runs as soon as the contractor submits a deliverable.</p>
        </div>
      )}

      {verdictDecision?.model ? (
        <div className="relative mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-white/[0.06] pt-4 text-[11px] text-ink-400">
          <span className="inline-flex items-center gap-1">
            <Cpu className="size-3" /> {verdictDecision.model}
          </span>
          {verdictDecision.promptTokens !== null ? (
            <span className="tabular-nums">
              {verdictDecision.promptTokens} in / {verdictDecision.completionTokens} out tokens
            </span>
          ) : null}
          {verdictDecision.latencyMs !== null ? <span className="tabular-nums">{verdictDecision.latencyMs} ms</span> : null}
        </div>
      ) : null}
    </Card>
  );
}
