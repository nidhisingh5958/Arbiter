import type { AgentDecisionDTO, InspectionDTO, JudgeOutput, PaymentDTO, PolicyDTO, PolicyEvaluation, SubmissionDTO } from '@arbiter/shared';
import { motion } from 'framer-motion';
import { CheckCircle2, ChevronDown, CircleHelp, FileText, Link2, ListChecks, Scale, ShieldAlert, ShieldCheck, Wallet, XCircle } from 'lucide-react';
import { useState } from 'react';
import { clock, money, pct, relativeTime, shortHash, titleCase } from '../../lib/format';
import { cn } from '../../lib/cn';
import { JsonBlock } from '../grids/EvidenceView';
import { Card, CardHeader } from '../ui/Card';
import { CopyText } from '../ui/CopyText';
import { CheckChip, Chip, toneForPayment } from '../ui/StatusChip';

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } };

export function CriteriaList({ judge }: { judge: JudgeOutput | null }) {
  return (
    <Card>
      <CardHeader icon={<ListChecks className="size-4" />} title="Acceptance criteria" subtitle="Per-criterion judgment with cited evidence" />
      {!judge ? (
        <p className="text-sm text-ink-400">The LLM judge has not evaluated this milestone yet.</p>
      ) : (
        <motion.ul variants={stagger} initial="hidden" animate="show" className="space-y-3">
          {judge.criteria.map((c, i) => (
            <motion.li key={i} variants={item} className="flex gap-3 rounded-2xl bg-white/[0.025] p-3.5 ring-1 ring-white/[0.05]">
              {c.status === 'MET' ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-mint-400" aria-label="Met" />
              ) : c.status === 'NOT_MET' ? (
                <XCircle className="mt-0.5 size-5 shrink-0 text-rose-400" aria-label="Not met" />
              ) : (
                <CircleHelp className="mt-0.5 size-5 shrink-0 text-amber-300" aria-label="Unclear" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-ink-100">{c.criterion}</p>
                  <span className="shrink-0 text-xs tabular-nums text-ink-400">{pct(c.confidence)}</span>
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-300">{c.evidence}</p>
              </div>
            </motion.li>
          ))}
        </motion.ul>
      )}
      {judge?.risks.length ? (
        <div className="mt-4 rounded-2xl bg-amber-400/[0.06] p-3.5 text-sm text-amber-100 ring-1 ring-amber-300/20">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-300">Risks noted by the judge</div>
          <ul className="list-disc space-y-1 pl-5">
            {judge.risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

function CheckRow({ i }: { i: InspectionDTO }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.li variants={item} className="rounded-2xl bg-white/[0.025] ring-1 ring-white/[0.05]">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
        <CheckChip status={i.status} size="sm" />
        <span className="font-mono text-[12px] text-ink-200">{i.checkName}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-ink-300">{i.message}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-ink-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <div className="px-3.5 pb-3.5">
          <p className="mb-2 text-sm text-ink-200">{i.message}</p>
          <JsonBlock value={i.evidence} />
        </div>
      ) : null}
    </motion.li>
  );
}

export function ChecksList({ inspections }: { inspections: InspectionDTO[] }) {
  const checks = inspections.filter((i) => i.category === 'deterministic');
  const failed = checks.filter((c) => c.status === 'FAIL' || c.status === 'ERROR').length;
  return (
    <Card>
      <CardHeader
        icon={<ListChecks className="size-4" />}
        title="Deterministic checks"
        subtitle="Hard gate — any failure means no automatic payout"
        action={checks.length ? <Chip tone={failed ? 'danger' : 'success'}>{failed ? `${failed} failed` : 'All passed'}</Chip> : null}
      />
      {checks.length === 0 ? (
        <p className="text-sm text-ink-400">No checks have run yet.</p>
      ) : (
        <motion.ul variants={stagger} initial="hidden" animate="show" className="space-y-2">
          {checks.map((c) => (
            <CheckRow key={c.id} i={c} />
          ))}
        </motion.ul>
      )}
    </Card>
  );
}

export function InjectionPanel({ inspections, flagged }: { inspections: InspectionDTO[]; flagged: boolean }) {
  const rows = inspections.filter((i) => i.category === 'injection');
  const matches = rows.flatMap((r) => ((r.evidence.matches as { source: string; excerpt: string }[] | undefined) ?? []).map((m) => ({ ...m, rule: r.checkName })));
  const classifier = rows.find((r) => r.checkName === 'injection:llm_classifier')?.evidence.classifier as { rationale?: string; confidence?: number } | null | undefined;
  if (rows.length === 0) return null;
  return (
    <Card className={cn(flagged && 'border-rose-400/30 bg-rose-500/[0.04]')}>
      <CardHeader
        icon={flagged ? <ShieldAlert className="size-4 text-rose-300" /> : <ShieldCheck className="size-4 text-mint-300" />}
        title={flagged ? 'Prompt-injection attempt caught' : 'No prompt injection found'}
        subtitle="Submitted content is treated as untrusted data — heuristics plus an LLM classifier"
      />
      {flagged ? (
        <div className="space-y-2.5">
          {matches.slice(0, 6).map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              className="rounded-2xl bg-ink-950/60 p-3.5 ring-1 ring-rose-400/20"
            >
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                <span className="font-mono uppercase tracking-wide text-rose-300">{m.source}</span>
                <span className="text-ink-500">·</span>
                <span className="font-mono text-ink-400">{m.rule.replace('injection:', '')}</span>
              </div>
              <q className="text-[13px] leading-relaxed text-rose-100">{m.excerpt}</q>
            </motion.div>
          ))}
          {classifier?.rationale ? (
            <p className="text-sm text-ink-300">
              <span className="font-semibold text-ink-100">Classifier ({pct(classifier.confidence ?? null)}):</span> {classifier.rationale}
            </p>
          ) : null}
          <p className="text-xs text-ink-400">The instructions were never followed: the judge sees this content only inside delimited untrusted-data blocks, and the policy engine blocks automatic release.</p>
        </div>
      ) : (
        <p className="text-sm text-ink-300">PR text, diffs, page copy, hidden elements and notes were scanned. Nothing tried to instruct the reviewer.</p>
      )}
    </Card>
  );
}

export function PolicyGatePanel({ evaluation, policy }: { evaluation: PolicyEvaluation | null; policy: PolicyDTO }) {
  return (
    <Card>
      <CardHeader
        icon={<Scale className="size-4" />}
        title="Policy gate"
        subtitle="The policy engine — not the LLM — decides whether money moves"
        action={
          evaluation ? (
            <Chip tone={evaluation.outcome === 'AUTO_RELEASE' ? 'success' : evaluation.outcome === 'REJECT' ? 'danger' : 'warning'}>
              {titleCase(evaluation.outcome)}
            </Chip>
          ) : null
        }
      />
      {evaluation ? (
        <ul className="space-y-1.5">
          {evaluation.reasons.map((r) => (
            <li key={r.rule} className="flex items-start gap-2.5 text-sm">
              {r.passed ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-mint-400" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-rose-400" />}
              <span>
                <span className="font-mono text-[12px] text-ink-100">{r.rule}</span>
                <span className="block text-xs text-ink-400">{r.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            ['Min confidence', pct(policy.minConfidence)],
            ['Auto-release limit', money(policy.maxAutoReleaseCents)],
            ['Human approval above', money(policy.humanApprovalAboveCents)],
            ['Daily cap', money(policy.dailyPayoutCapCents)],
            ['Dispute window', `${policy.disputeWindowSeconds}s`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-white/[0.03] p-2.5">
              <div className="text-ink-400">{k}</div>
              <div className="font-medium tabular-nums text-ink-100">{v}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function PaymentsList({ payments }: { payments: PaymentDTO[] }) {
  return (
    <Card>
      <CardHeader icon={<Wallet className="size-4" />} title="PayPal transactions" subtitle="Orders, captures and payouts for this milestone" />
      {payments.length === 0 ? (
        <p className="text-sm text-ink-400">No PayPal activity yet.</p>
      ) : (
        <ul className="space-y-2">
          {[...payments].reverse().map((p) => (
            <li key={p.id} className="rounded-2xl bg-white/[0.025] p-3 ring-1 ring-white/[0.05]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Chip tone="neutral" size="sm">
                    {titleCase(p.kind)}
                  </Chip>
                  <Chip tone={toneForPayment(p.status)} size="sm" pulse={['PENDING', 'PROCESSING'].includes(p.status)}>
                    {titleCase(p.status)}
                  </Chip>
                </div>
                <span className="text-sm font-medium tabular-nums text-ink-100">{money(p.amountCents, p.currency)}</span>
              </div>
              <div className="mt-2 grid gap-1 text-xs text-ink-400">
                {p.paypalOrderId ? <span>Order <CopyText value={p.paypalOrderId} /></span> : null}
                {p.paypalCaptureId ? <span>Capture <CopyText value={p.paypalCaptureId} /></span> : null}
                {p.paypalAuthorizationId ? <span>Authorization <CopyText value={p.paypalAuthorizationId} /></span> : null}
                {p.payoutBatchId ? <span>Payout batch <CopyText value={p.payoutBatchId} /></span> : null}
                {p.payoutItemId ? <span>Payout item <CopyText value={p.payoutItemId} /></span> : null}
                {p.refundId ? <span>Refund <CopyText value={p.refundId} /></span> : null}
                {p.feeCents !== null ? <span>Fee {money(p.feeCents, p.currency)}</span> : null}
                <span>
                  via {p.source.toLowerCase()} · {relativeTime(p.updatedAt)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function SubmissionHistory({ submissions }: { submissions: SubmissionDTO[] }) {
  if (submissions.length === 0) return null;
  return (
    <Card>
      <CardHeader icon={<FileText className="size-4" />} title="Submissions" subtitle={`${submissions.length} deliverable${submissions.length === 1 ? '' : 's'} submitted`} />
      <ul className="space-y-2">
        {submissions.map((s, i) => (
          <li key={s.id} className="flex items-start gap-3 rounded-2xl bg-white/[0.025] p-3 ring-1 ring-white/[0.05]">
            <span className="mt-0.5 rounded-md bg-white/5 px-1.5 text-[11px] tabular-nums text-ink-300">#{submissions.length - i}</span>
            <div className="min-w-0 flex-1 text-sm">
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer noopener" className="break-all text-iris-200 hover:underline">
                  {s.url}
                </a>
              ) : (
                <span className="text-ink-100">
                  {s.fileName} · <span className="font-mono text-xs text-ink-400">sha256 {shortHash(s.fileSha256, 12)}</span>
                </span>
              )}
              {s.notes ? <p className="mt-1 text-xs text-ink-400">“{s.notes}”</p> : null}
            </div>
            <span className="shrink-0 text-xs text-ink-400">{relativeTime(s.createdAt)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function DecisionTimeline({ decisions }: { decisions: AgentDecisionDTO[] }) {
  return (
    <Card>
      <CardHeader icon={<Link2 className="size-4" />} title="Decision log" subtitle="Append-only, hash-chained record of every agent action" />
      {decisions.length === 0 ? (
        <p className="text-sm text-ink-400">No agent actions recorded yet.</p>
      ) : (
        <ol className="relative space-y-3 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-white/10">
          {decisions.map((d, i) => (
            <motion.li key={d.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.03, 0.5) }} className="relative pl-6">
              <span className={cn('absolute left-0 top-1.5 size-[15px] rounded-full ring-4 ring-ink-900', d.action === 'TOOL_CALL' ? 'bg-iris-400' : d.action === 'HUMAN_OVERRIDE' ? 'bg-amber-300' : d.action === 'INJECTION_SCAN' ? 'bg-rose-400' : 'bg-ink-400')} />
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                <span className="font-medium text-ink-100">
                  {d.action === 'TOOL_CALL' ? `Tool call · ${(d.outputs as { tool?: string } | null)?.tool ?? ''}` : titleCase(d.action)}
                </span>
                {d.verdict ? <span className="text-xs text-ink-300">{titleCase(d.verdict)}</span> : null}
                <span className="font-mono text-[11px] text-ink-500">{d.actor}</span>
                <span className="ml-auto font-mono text-[11px] text-ink-500">
                  #{d.seq} · {clock(d.createdAt)}
                </span>
              </div>
              <div className="mt-0.5 font-mono text-[10.5px] text-ink-500">
                hash {shortHash(d.hash, 14)} ← {shortHash(d.prevHash, 8)}
              </div>
            </motion.li>
          ))}
        </ol>
      )}
    </Card>
  );
}
