import {
  ContractDraftSchema,
  defaultVerification,
  sampleSow,
  type ContractDraft,
  type ExtractIssue,
  type MilestoneDraft,
  type PolicyInput,
} from '@arbiter/shared';
import { useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Bot, CheckCircle2, Plus, ShieldCheck, Sparkles, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { MilestoneEditor } from '../components/contracts/MilestoneEditor';
import { PolicyEditor } from '../components/contracts/PolicyEditor';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Field, Input, Select, Textarea } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/States';
import { useConfig } from '../hooks/useConfig';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { money } from '../lib/format';
import { useSession } from '../providers/SessionProvider';

function newMilestone(currency: string): MilestoneDraft {
  return {
    title: 'New milestone',
    description: '',
    acceptanceCriteria: ['Describe a verifiable outcome'],
    amountCents: 0,
    currency,
    deadline: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
    verification: defaultVerification('URL'),
  };
}

export function NewContractPage() {
  const { user, users, switchRole } = useSession();
  const navigate = useNavigate();
  const { data: config } = useConfig();
  const contractors = users.filter((u) => u.role === 'contractor');

  const [sow, setSow] = useState('');
  const [draft, setDraft] = useState<ContractDraft | null>(null);
  const [aiIssues, setAiIssues] = useState<ExtractIssue[]>([]);
  const [model, setModel] = useState<string | null>(null);
  const [contractorId, setContractorId] = useState('');
  const [policyOverride, setPolicyOverride] = useState<PolicyInput | null>(null);
  const policy = policyOverride ?? config?.defaultPolicy ?? null;

  const extract = useMutation({
    mutationFn: () => api.extract(sow),
    onSuccess: (res) => {
      setDraft(res.draft);
      setAiIssues(res.issues);
      setModel(res.model);
      toast.success(`Extracted ${res.draft.milestones.length} milestones`, { description: res.issues.length ? `${res.issues.length} item(s) need your review.` : 'Review and confirm below.' });
    },
    onError: (e: Error) => toast.error('Extraction failed', { description: e.message }),
  });

  const create = useMutation({
    mutationFn: () => {
      if (!draft || !policy) throw new Error('Nothing to create');
      return api.createContract({ draft, contractorId: contractorId || contractors[0]!.id, sowText: sow, policy });
    },
    onSuccess: (c) => {
      toast.success('Contract confirmed', { description: 'Milestone 1 is ready to fund via PayPal.' });
      navigate(`/contracts/${c.id}`);
    },
    onError: (e: Error) => toast.error('Could not create the contract', { description: e.message }),
  });

  const validation = useMemo(() => (draft ? ContractDraftSchema.safeParse(draft) : null), [draft]);
  const issuesByMilestone = useMemo(() => {
    const map: Record<number, Record<string, string>> = {};
    if (validation && !validation.success) {
      for (const i of validation.error.issues) {
        if (i.path[0] === 'milestones' && typeof i.path[1] === 'number') {
          const key = String(i.path[2] ?? 'title');
          (map[i.path[1]] ??= {})[key] = i.message;
        }
      }
    }
    return map;
  }, [validation]);
  const globalIssues = validation && !validation.success ? validation.error.issues.filter((i) => !(i.path[0] === 'milestones' && typeof i.path[1] === 'number')) : [];

  if (user.role !== 'buyer') {
    return (
      <EmptyState
        icon={<ShieldCheck className="size-6" />}
        title="Contracts are drafted by buyers"
        message="Switch to the buyer persona to paste a statement of work and fund milestones."
        action={
          <Button variant="primary" onClick={() => switchRole('buyer')}>
            Switch to buyer
          </Button>
        }
      />
    );
  }

  const sum = draft?.milestones.reduce((s, m) => s + m.amountCents, 0) ?? 0;
  const ratio = draft && draft.totalCents > 0 ? sum / draft.totalCents : 0;
  const setMilestone = (i: number, m: MilestoneDraft) => draft && setDraft({ ...draft, milestones: draft.milestones.map((x, j) => (j === i ? m : x)) });

  return (
    <div>
      <PageHeader
        eyebrow="New contract"
        title={draft ? 'Review the extracted milestones' : 'From statement of work to funded milestones'}
        description={
          draft
            ? 'Edit anything before confirming. Amounts must add up to the contract total — validated by the same schema the API enforces.'
            : 'Paste a natural-language SOW. The agent extracts milestones with testable acceptance criteria and how each one will be verified.'
        }
        actions={
          draft ? (
            <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => setDraft(null)}>
              Back to SOW
            </Button>
          ) : null
        }
      />

      <AnimatePresence mode="wait">
        {!draft ? (
          <motion.div key="sow" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
            <Card className="relative overflow-hidden">
              {extract.isPending ? <div className="shine pointer-events-none absolute inset-0" /> : null}
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="sow" className="text-sm font-medium text-ink-200">
                  Statement of work
                </label>
                <button onClick={() => setSow(sampleSow())} className="inline-flex items-center gap-1.5 text-xs font-medium text-iris-300 hover:text-iris-200">
                  <Wand2 className="size-3.5" /> Use the sample SOW
                </button>
              </div>
              <Textarea
                id="sow"
                value={sow}
                onChange={(e) => setSow(e.target.value)}
                className="min-h-[340px] font-mono text-[13px]"
                placeholder="Statement of Work — … Milestone 1 — Checkout page ($900, due 2026-12-01) …"
              />
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-ink-400">
                  <Bot className="mr-1 inline size-3.5 text-iris-300" />
                  {config?.llmMode === 'groq' ? `Extraction by ${config.llmModel} on Groq` : 'Extraction by the deterministic mock LLM (set GROQ_API_KEY for Groq)'} · output validated with zod
                </p>
                <Button variant="agent" size="lg" loading={extract.isPending} disabled={sow.trim().length < 40} icon={<Sparkles className="size-4" />} onClick={() => extract.mutate()}>
                  Extract milestones
                </Button>
              </div>
            </Card>
          </motion.div>
        ) : (
          <motion.div key="review" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-4">
              <Card>
                <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
                  <Field label="Contract title" htmlFor="ct-title">
                    <Input id="ct-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                  </Field>
                  <Field label="Contract total" htmlFor="ct-total">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-400">$</span>
                      <Input
                        id="ct-total"
                        type="number"
                        min={0}
                        step="0.01"
                        className="pl-7 tabular-nums"
                        value={draft.totalCents / 100}
                        onChange={(e) => setDraft({ ...draft, totalCents: Math.round(Number(e.target.value || 0) * 100) })}
                      />
                    </div>
                  </Field>
                  <Field label="Summary" htmlFor="ct-sum" className="md:col-span-2">
                    <Textarea id="ct-sum" value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} className="min-h-16" />
                  </Field>
                </div>
              </Card>

              <AnimatePresence initial={false}>
                {draft.milestones.map((m, i) => (
                  <MilestoneEditor
                    key={i}
                    index={i}
                    value={m}
                    issues={issuesByMilestone[i] ?? {}}
                    canRemove={draft.milestones.length > 1}
                    onChange={(nm) => setMilestone(i, nm)}
                    onRemove={() => setDraft({ ...draft, milestones: draft.milestones.filter((_, j) => j !== i) })}
                  />
                ))}
              </AnimatePresence>
              <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setDraft({ ...draft, milestones: [...draft.milestones, newMilestone(draft.currency)] })}>
                Add milestone
              </Button>
            </div>

            <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
              <Card>
                <CardHeader title="Allocation" subtitle="Milestones must sum to the contract total" />
                <div className="h-2.5 overflow-hidden rounded-full bg-white/5">
                  <motion.div
                    className={cn('h-full rounded-full', Math.abs(ratio - 1) < 1e-9 ? 'bg-mint-400' : ratio > 1 ? 'bg-rose-400' : 'bg-amber-300')}
                    animate={{ width: `${Math.min(100, ratio * 100)}%` }}
                    transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-sm tabular-nums">
                  <span className="text-ink-300">{money(sum, draft.currency)} allocated</span>
                  <span className="text-ink-100">{money(draft.totalCents, draft.currency)} total</span>
                </div>
                {sum !== draft.totalCents ? (
                  <button onClick={() => setDraft({ ...draft, totalCents: sum })} className="mt-2 text-xs font-medium text-iris-300 hover:text-iris-200">
                    Set total to {money(sum, draft.currency)}
                  </button>
                ) : null}

                <div className="mt-4 space-y-1.5">
                  {validation?.success ? (
                    <p className="flex items-center gap-2 text-sm text-mint-300">
                      <CheckCircle2 className="size-4" /> Draft is valid and ready to confirm
                    </p>
                  ) : (
                    [...globalIssues.map((i) => i.message), ...Object.entries(issuesByMilestone).flatMap(([k, v]) => Object.values(v).map((msg) => `Milestone ${Number(k) + 1}: ${msg}`))]
                      .slice(0, 6)
                      .map((msg, i) => (
                        <p key={i} className="text-xs text-rose-300">
                          • {msg}
                        </p>
                      ))
                  )}
                  {aiIssues.filter((i) => !i.message.includes('sum to')).slice(0, 4).map((i, k) => (
                    <p key={`ai${k}`} className="text-xs text-amber-200">
                      • {i.message}
                    </p>
                  ))}
                </div>
              </Card>

              <Card>
                <CardHeader title="Parties" />
                <Field label="Contractor" htmlFor="ct-contractor">
                  <Select id="ct-contractor" value={contractorId || contractors[0]?.id || ''} onChange={(e) => setContractorId(e.target.value)}>
                    {contractors.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.country ? `· ${c.country}` : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
              </Card>

              {policy ? (
                <Card>
                  <CardHeader title="Release policy" subtitle="Guardrails for the payments agent" />
                  <PolicyEditor value={policy} onChange={setPolicyOverride} />
                </Card>
              ) : null}

              <Button
                variant="primary"
                size="lg"
                className="w-full"
                loading={create.isPending}
                disabled={!validation?.success || !policy}
                icon={<ShieldCheck className="size-4" />}
                onClick={() => create.mutate()}
              >
                Confirm contract
              </Button>
              {model ? <p className="text-center text-[11px] text-ink-500">Extracted by {model}</p> : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
