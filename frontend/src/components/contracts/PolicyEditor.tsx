import type { PolicyInput } from '@arbiter/shared';
import { Field, Input, useFieldId } from '../ui/Field';

function MoneyInput({ id, cents, onChange }: { id: string; cents: number; onChange: (c: number) => void }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-400">$</span>
      <Input id={id} type="number" min={0} step="1" className="pl-7 tabular-nums" value={cents / 100} onChange={(e) => onChange(Math.max(0, Math.round(Number(e.target.value || 0) * 100)))} />
    </div>
  );
}

/** Per-contract guardrails for the payments agent. Anything outside them escalates to a human. */
export function PolicyEditor({ value, onChange }: { value: PolicyInput; onChange: (p: PolicyInput) => void }) {
  const id = useFieldId('policy');
  const set = <K extends keyof PolicyInput>(k: K, v: PolicyInput[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={`Minimum confidence to auto-approve · ${Math.round(value.minConfidence * 100)}%`} htmlFor={`${id}-conf`} className="sm:col-span-2">
        <input
          id={`${id}-conf`}
          type="range"
          min={0.5}
          max={0.99}
          step={0.01}
          value={value.minConfidence}
          onChange={(e) => set('minConfidence', Number(e.target.value))}
          className="w-full accent-iris-500"
        />
      </Field>
      <Field label="Max auto-release per milestone" htmlFor={`${id}-max`} hint="Larger milestones escalate">
        <MoneyInput id={`${id}-max`} cents={value.maxAutoReleaseCents} onChange={(c) => set('maxAutoReleaseCents', c)} />
      </Field>
      <Field label="Human approval above" htmlFor={`${id}-human`}>
        <MoneyInput id={`${id}-human`} cents={value.humanApprovalAboveCents} onChange={(c) => set('humanApprovalAboveCents', c)} />
      </Field>
      <Field label="Daily payout cap" htmlFor={`${id}-cap`}>
        <MoneyInput id={`${id}-cap`} cents={value.dailyPayoutCapCents} onChange={(c) => set('dailyPayoutCapCents', c)} />
      </Field>
      <Field label="Dispute window (seconds)" htmlFor={`${id}-win`} hint="Delay between approval and payout">
        <Input
          id={`${id}-win`}
          type="number"
          min={0}
          max={2592000}
          value={value.disputeWindowSeconds}
          onChange={(e) => set('disputeWindowSeconds', Math.max(0, Math.round(Number(e.target.value) || 0)))}
        />
      </Field>
    </div>
  );
}
