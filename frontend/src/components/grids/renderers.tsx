import type { CheckStatus, MilestoneStatus, Severity, Verdict } from '@arbiter/shared';
import type { ICellRendererParams } from 'ag-grid-community';
import { FileUp, GitPullRequest, Globe, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { money, relativeTime, titleCase } from '../../lib/format';
import { cn } from '../../lib/cn';
import { CheckChip, Chip, StatusChip, VerdictChip, toneForPayment, toneForSeverity, type Tone } from '../ui/StatusChip';

type P<T = unknown> = ICellRendererParams<Record<string, unknown>, T>;

export function MilestoneStatusCell(p: P<MilestoneStatus>) {
  return p.value ? <StatusChip status={p.value} size="sm" /> : null;
}

export function VerdictCell(p: P<Verdict | null>) {
  return p.data && 'id' in p.data && p.data.id !== '__total' ? <VerdictChip verdict={p.value ?? null} size="sm" /> : null;
}

export function CheckStatusCell(p: P<CheckStatus>) {
  return p.value ? <CheckChip status={p.value} size="sm" /> : null;
}

export function SeverityCell(p: P<Severity>) {
  return p.value ? (
    <Chip tone={toneForSeverity(p.value)} size="sm">
      {titleCase(p.value)}
    </Chip>
  ) : null;
}

export function PaymentStatusCell(p: P<string>) {
  return p.value ? (
    <Chip tone={toneForPayment(p.value)} size="sm" pulse={['PENDING', 'PROCESSING'].includes(p.value)}>
      {titleCase(p.value)}
    </Chip>
  ) : null;
}

const KIND_TONE: Record<string, Tone> = { ORDER: 'info', CAPTURE: 'success', AUTHORIZATION: 'agent', PAYOUT: 'success', REFUND: 'warning' };
export function KindCell(p: P<string>) {
  return p.value ? (
    <Chip tone={KIND_TONE[p.value] ?? 'neutral'} size="sm">
      {titleCase(p.value)}
    </Chip>
  ) : null;
}

export function MoneyCell(p: P<number | null>) {
  const currency = (p.data?.currency as string | undefined) ?? 'USD';
  return <span className="font-medium tabular-nums text-ink-100">{p.value === null || p.value === undefined ? '—' : money(p.value, currency)}</span>;
}

export function ConfidenceCell(p: P<number | null>) {
  if (p.value === null || p.value === undefined) return <span className="text-ink-500">—</span>;
  const v = Math.max(0, Math.min(1, p.value));
  const color = v >= 0.85 ? 'bg-mint-400' : v >= 0.6 ? 'bg-amber-300' : 'bg-rose-400';
  return (
    <div className="flex h-full items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/[0.06]">
        <div className={cn('h-full rounded-full transition-[width] duration-700', color)} style={{ width: `${v * 100}%` }} />
      </div>
      <span className="tabular-nums text-ink-200">{Math.round(v * 100)}%</span>
    </div>
  );
}

export function InjectionCell(p: P<boolean>) {
  return p.value ? (
    <span className="inline-flex items-center gap-1 text-rose-300" title="Prompt-injection attempt detected">
      <ShieldAlert className="size-4" aria-hidden />
      <span className="text-[11px] font-semibold uppercase tracking-wide">Flagged</span>
    </span>
  ) : null;
}

export function VerificationCell(p: P<{ type: string }>) {
  const t = p.value?.type;
  if (!t) return null;
  const Icon = t === 'GITHUB_PR' ? GitPullRequest : t === 'URL' ? Globe : FileUp;
  return (
    <span className="inline-flex items-center gap-1.5 text-ink-200">
      <Icon className="size-3.5 text-iris-300" aria-hidden />
      {t === 'GITHUB_PR' ? 'GitHub PR' : t === 'URL' ? 'Deployed URL' : 'File'}
    </span>
  );
}

export function RelativeTimeCell(p: P<string | null>) {
  return (
    <span className="tabular-nums text-ink-300" title={p.value ?? ''}>
      {relativeTime(p.value)}
    </span>
  );
}

export function MilestoneLinkCell(p: P<string>) {
  const id = (p.data?.milestoneId ?? p.data?.id) as string | undefined;
  if (!id || id === '__total') return <span className="font-semibold text-white">{p.value}</span>;
  return (
    <Link to={`/milestones/${id}`} className="font-medium text-ink-100 underline-offset-4 hover:text-iris-200 hover:underline">
      {p.value}
    </Link>
  );
}

export function MonoCell(p: P<string | null>) {
  return p.value ? <span className="font-mono text-[12px] text-ink-200">{p.value}</span> : <span className="text-ink-500">—</span>;
}
