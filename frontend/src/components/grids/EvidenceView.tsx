import type { InspectionDTO, JudgeOutput, PolicyEvaluation } from '@arbiter/shared';
import { CheckCircle2, CircleHelp, XCircle } from 'lucide-react';
import { pct, titleCase } from '../../lib/format';

function isJudge(e: Record<string, unknown>): e is JudgeOutput & Record<string, unknown> {
  return typeof e.verdict === 'string' && Array.isArray(e.criteria);
}
function isPolicy(e: Record<string, unknown>): e is PolicyEvaluation & Record<string, unknown> {
  return typeof e.outcome === 'string' && Array.isArray(e.reasons);
}

export function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre data-lenis-prevent className="scrollbar-thin max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/30 p-3 font-mono text-[11.5px] leading-relaxed text-ink-200">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/** Human-readable evidence for each inspection layer, falling back to raw JSON. */
export function EvidenceView({ inspection }: { inspection: InspectionDTO }) {
  const e = inspection.evidence;
  return (
    <div className="space-y-3 text-sm">
      <p className="text-ink-200">{inspection.message}</p>
      {isJudge(e) ? (
        <div className="space-y-2">
          <p className="text-ink-300">
            <span className="font-semibold text-white">{titleCase(e.verdict)}</span> · confidence {pct(e.confidence)} — {e.summary}
          </p>
          <ul className="space-y-1.5">
            {e.criteria.map((c, i) => (
              <li key={i} className="flex gap-2">
                {c.status === 'MET' ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-mint-400" />
                ) : c.status === 'NOT_MET' ? (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-rose-400" />
                ) : (
                  <CircleHelp className="mt-0.5 size-4 shrink-0 text-amber-300" />
                )}
                <span>
                  <span className="text-ink-100">{c.criterion}</span>
                  <span className="block text-xs text-ink-400">{c.evidence}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : isPolicy(e) ? (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {e.reasons.map((r) => (
            <li key={r.rule} className="flex gap-2 text-xs">
              {r.passed ? <CheckCircle2 className="size-4 shrink-0 text-mint-400" /> : <XCircle className="size-4 shrink-0 text-rose-400" />}
              <span>
                <span className="font-mono text-ink-100">{r.rule}</span>
                <span className="block text-ink-400">{r.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : Array.isArray(e.matches) ? (
        <ul className="space-y-2">
          {(e.matches as { source: string; excerpt: string }[]).map((m, i) => (
            <li key={i} className="rounded-xl bg-rose-500/[0.07] p-3 ring-1 ring-rose-400/20">
              <div className="mb-1 font-mono text-[11px] uppercase tracking-wide text-rose-300">{m.source}</div>
              <q className="text-[13px] text-rose-100">{m.excerpt}</q>
            </li>
          ))}
        </ul>
      ) : (
        <JsonBlock value={e} />
      )}
    </div>
  );
}
