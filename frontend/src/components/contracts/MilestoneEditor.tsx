import {
  defaultVerification,
  type MilestoneDraft,
  type Verification,
} from '@arbiter/shared';
import { motion } from 'framer-motion';
import { FileUp, GitPullRequest, Globe, Plus, Trash2, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Field, Input, ListInput, Textarea, Toggle, useFieldId } from '../ui/Field';

const TYPES: { type: Verification['type']; label: string; icon: typeof Globe }[] = [
  { type: 'GITHUB_PR', label: 'GitHub PR', icon: GitPullRequest },
  { type: 'URL', label: 'Deployed URL', icon: Globe },
  { type: 'FILE', label: 'File upload', icon: FileUp },
];

export function MilestoneEditor({
  value,
  index,
  onChange,
  onRemove,
  issues,
  canRemove,
}: {
  value: MilestoneDraft;
  index: number;
  onChange: (m: MilestoneDraft) => void;
  onRemove: () => void;
  issues: Record<string, string>;
  canRemove: boolean;
}) {
  const id = useFieldId(`ms${index}`);
  const set = <K extends keyof MilestoneDraft>(k: K, v: MilestoneDraft[K]) => onChange({ ...value, [k]: v });
  const v = value.verification;

  const setVerificationType = (type: Verification['type']) => {
    if (type === v.type) return;
    set('verification', defaultVerification(type));
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="glass rounded-3xl p-5"
    >
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-8 place-items-center rounded-xl bg-iris-500/15 font-display text-sm font-semibold text-iris-200 ring-1 ring-iris-400/25">
          M{index + 1}
        </span>
        <Input aria-label="Milestone title" value={value.title} onChange={(e) => set('title', e.target.value)} invalid={Boolean(issues.title)} className="h-10 flex-1 text-[15px] font-medium" />
        {canRemove ? (
          <button onClick={onRemove} className="rounded-xl p-2 text-ink-400 hover:bg-rose-500/10 hover:text-rose-300" aria-label={`Remove milestone ${index + 1}`}>
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_1fr_1.4fr]">
        <Field label="Amount" htmlFor={`${id}-amt`} error={issues.amountCents}>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-400">$</span>
            <Input
              id={`${id}-amt`}
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              className="pl-7 tabular-nums"
              value={(value.amountCents / 100).toString()}
              onChange={(e) => set('amountCents', Math.round(Number(e.target.value || 0) * 100))}
            />
          </div>
        </Field>
        <Field label="Deadline" htmlFor={`${id}-dl`} error={issues.deadline}>
          <Input id={`${id}-dl`} type="date" value={value.deadline} onChange={(e) => set('deadline', e.target.value)} />
        </Field>
        <Field label="Verification">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-ink-900/70 p-1 ring-1 ring-inset ring-white/10" role="radiogroup" aria-label="Verification type">
            {TYPES.map((t) => (
              <button
                key={t.type}
                role="radio"
                aria-checked={v.type === t.type}
                onClick={() => setVerificationType(t.type)}
                className={cn('relative flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium', v.type === t.type ? 'text-white' : 'text-ink-400 hover:text-ink-200')}
              >
                {v.type === t.type ? <motion.span layoutId={`${id}-vt`} className="absolute inset-0 rounded-lg bg-iris-500/25 ring-1 ring-iris-400/30" /> : null}
                <t.icon className="relative size-3.5" />
                <span className="relative">{t.label}</span>
              </button>
            ))}
          </div>
        </Field>
      </div>

      <Field label="Description" htmlFor={`${id}-desc`} className="mt-4">
        <Textarea id={`${id}-desc`} value={value.description} onChange={(e) => set('description', e.target.value)} className="min-h-16" />
      </Field>

      <div className="mt-4">
        <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-ink-300">Acceptance criteria</div>
        <ul className="space-y-2">
          {value.acceptanceCriteria.map((c, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-5 text-right text-xs tabular-nums text-ink-500">{i + 1}.</span>
              <Input
                aria-label={`Criterion ${i + 1}`}
                value={c}
                onChange={(e) => set('acceptanceCriteria', value.acceptanceCriteria.map((x, j) => (j === i ? e.target.value : x)))}
              />
              <button
                onClick={() => set('acceptanceCriteria', value.acceptanceCriteria.filter((_, j) => j !== i))}
                className="rounded-lg p-1.5 text-ink-500 hover:text-rose-300"
                aria-label={`Remove criterion ${i + 1}`}
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
        {issues.acceptanceCriteria ? <p className="mt-1 text-xs text-rose-300">{issues.acceptanceCriteria}</p> : null}
        <button onClick={() => set('acceptanceCriteria', [...value.acceptanceCriteria, ''])} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-iris-300 hover:text-iris-200">
          <Plus className="size-3.5" /> Add criterion
        </button>
      </div>

      <div className="mt-5 rounded-2xl bg-ink-950/50 p-4 ring-1 ring-white/[0.05]">
        <VerificationParams v={v} onChange={(nv) => set('verification', nv)} id={id} issue={issues.verification} />
      </div>
    </motion.div>
  );
}

function VerificationParams({ v, onChange, id, issue }: { v: Verification; onChange: (v: Verification) => void; id: string; issue?: string }) {
  if (v.type === 'GITHUB_PR') {
    const p = v.params;
    const up = (patch: Partial<typeof p>) => onChange({ type: 'GITHUB_PR', params: { ...p, ...patch } });
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Repository" htmlFor={`${id}-repo`} hint="owner/name" error={issue}>
          <Input id={`${id}-repo`} value={p.repo} onChange={(e) => onChange({ type: 'GITHUB_PR', params: { ...p, repo: e.target.value } })} placeholder="acme/storefront" />
        </Field>
        <Field label="Base branch" htmlFor={`${id}-br`}>
          <Input id={`${id}-br`} value={p.baseBranch} onChange={(e) => up({ baseBranch: e.target.value || 'main' })} />
        </Field>
        <Field label="Required CI checks" htmlFor={`${id}-ck`} hint="Comma separated check-run names">
          <ListInput id={`${id}-ck`} value={p.requiredChecks} onChange={(requiredChecks) => up({ requiredChecks })} placeholder="build, test" />
        </Field>
        <Field label="Expected paths" htmlFor={`${id}-paths`} hint="Globs, e.g. src/checkout/**">
          <ListInput id={`${id}-paths`} value={p.expectedPaths} onChange={(expectedPaths) => up({ expectedPaths })} placeholder="src/checkout/**" />
        </Field>
        <Toggle checked={p.requireMerged} onChange={(requireMerged) => up({ requireMerged })} label="Pull request must be merged" />
      </div>
    );
  }
  if (v.type === 'URL') {
    const p = v.params;
    const up = (patch: Partial<typeof p>) => onChange({ type: 'URL', params: { ...p, ...patch } });
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Expected URL" htmlFor={`${id}-url`} hint="The submission must be on this host" error={issue}>
          <Input id={`${id}-url`} value={p.url ?? ''} onChange={(e) => up({ url: e.target.value || undefined })} placeholder="https://example.com/launch" />
        </Field>
        <Field label="Required CSS selectors" htmlFor={`${id}-sel`} hint="Comma separated, e.g. #signup-form">
          <ListInput id={`${id}-sel`} value={p.requiredSelectors} onChange={(requiredSelectors) => up({ requiredSelectors })} />
        </Field>
        <Field label="Required text" htmlFor={`${id}-txt`} hint="One phrase per line" className="md:col-span-2">
          <ListInput id={`${id}-txt`} separator={'\n'} multiline value={p.requiredText} onChange={(requiredText) => up({ requiredText })} />
        </Field>
      </div>
    );
  }
  const p = v.params;
  const up = (patch: Partial<typeof p>) => onChange({ type: 'FILE', params: { ...p, ...patch } });
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Allowed extensions" htmlFor={`${id}-ext`} hint="Comma separated, e.g. .pdf, .md">
        <ListInput id={`${id}-ext`} value={p.allowedExtensions} onChange={(allowedExtensions) => up({ allowedExtensions })} />
      </Field>
      <Field label="Max size (KB)" htmlFor={`${id}-kb`}>
        <Input id={`${id}-kb`} type="number" min={1} max={2048} value={p.maxSizeKb} onChange={(e) => up({ maxSizeKb: Math.max(1, Math.min(2048, Number(e.target.value) || 1)) })} />
      </Field>
      <Field label="Required text" htmlFor={`${id}-ftxt`} hint="One phrase per line" className="md:col-span-2">
        <ListInput id={`${id}-ftxt`} separator={'\n'} multiline value={p.requiredText} onChange={(requiredText) => up({ requiredText })} />
      </Field>
    </div>
  );
}

