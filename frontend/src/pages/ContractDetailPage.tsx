import type { PolicyInput } from '@arbiter/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowRight, ChevronDown, Mail, Pencil, Scale, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { MilestoneTimeline } from '../components/contracts/MilestoneTimeline';
import { PolicyEditor } from '../components/contracts/PolicyEditor';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { ErrorState } from '../components/ui/ErrorState';
import { Input } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { Bones } from '../components/ui/Skeletons';
import { Chip } from '../components/ui/StatusChip';
import { api } from '../lib/api';
import { money, pct } from '../lib/format';
import { useSession } from '../providers/SessionProvider';

export function ContractDetailPage() {
  const { id = '' } = useParams();
  const { user } = useSession();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['contract', id, user.id], queryFn: () => api.contract(id) });
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyDraft, setPolicyDraft] = useState<PolicyInput | null>(null);
  const [sowOpen, setSowOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  const savePolicy = useMutation({
    mutationFn: (p: PolicyInput) => api.updatePolicy(id, p),
    onSuccess: () => {
      setPolicyOpen(false);
      toast.success('Release policy updated');
      void qc.invalidateQueries({ queryKey: ['contract', id] });
    },
    onError: (e: Error) => toast.error('Could not update policy', { description: e.message }),
  });
  const saveEmail = useMutation({
    mutationFn: (v: string) => api.updateMe(v),
    onSuccess: () => {
      toast.success('Payout email saved');
      setEmail(null);
      void qc.invalidateQueries({ queryKey: ['contract', id] });
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: Error) => toast.error('Could not save email', { description: e.message }),
  });

  if (q.isError) return <ErrorState title="Could not load this contract" message={(q.error as Error).message} onRetry={() => void q.refetch()} />;
  const c = q.data;
  const isBuyer = c ? user.role === 'buyer' && user.id === c.buyerId : false;
  const isContractor = c ? user.role === 'contractor' && user.id === c.contractorId : false;

  return (
    <Bones kind="detail" loading={q.isLoading}>
      {c ? (
        <div>
          <motion.header initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} className="mb-8">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-iris-300">
              Contract
              {c.status === 'COMPLETED' ? <Chip tone="success" size="sm">Completed</Chip> : <Chip tone="info" size="sm">Active</Chip>}
            </div>
            <h1 className="text-3xl font-semibold text-white sm:text-4xl">{c.title}</h1>
            {c.summary ? <p className="mt-2 max-w-3xl text-[15px] text-ink-300">{c.summary}</p> : null}

            <div className="mt-6 grid gap-4 md:grid-cols-[1fr_auto]">
              <div className="glass flex flex-wrap items-center gap-4 rounded-2xl px-4 py-3">
                <Party label="Buyer" name={c.buyer.name} country={c.buyer.country} />
                <ArrowRight className="size-4 text-ink-500" />
                <Party label="Contractor" name={c.contractor.name} country={c.contractor.country} />
              </div>
              <div className="glass min-w-[280px] rounded-2xl px-4 py-3">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-[11px] uppercase tracking-wider text-ink-400">Total</span>
                  <span className="font-display text-2xl font-semibold tabular-nums text-white">{money(c.totalCents, c.currency)}</span>
                </div>
                <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-white/5">
                  <motion.div className="h-full bg-mint-400" initial={{ width: 0 }} animate={{ width: `${(c.paidCents / c.totalCents) * 100}%` }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }} />
                  <motion.div className="h-full bg-sky-400/70" initial={{ width: 0 }} animate={{ width: `${(c.escrowedCents / c.totalCents) * 100}%` }} transition={{ duration: 1, delay: 0.1, ease: [0.16, 1, 0.3, 1] }} />
                </div>
                <div className="mt-1.5 flex justify-between text-[11.5px] tabular-nums text-ink-400">
                  <span>
                    <span className="text-mint-300">●</span> Paid {money(c.paidCents, c.currency)}
                  </span>
                  <span>
                    <span className="text-sky-300">●</span> In escrow {money(c.escrowedCents, c.currency)}
                  </span>
                </div>
              </div>
            </div>
          </motion.header>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <MilestoneTimeline contract={c} />

            <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
              <Card>
                <CardHeader
                  icon={<Scale className="size-4" />}
                  title="Release policy"
                  subtitle="Outside these limits the agent escalates"
                  action={
                    isBuyer || user.role === 'admin' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Pencil className="size-3.5" />}
                        onClick={() => {
                          setPolicyDraft(c.policy);
                          setPolicyOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                    ) : null
                  }
                />
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    ['Min confidence', pct(c.policy.minConfidence)],
                    ['Auto-release limit', money(c.policy.maxAutoReleaseCents)],
                    ['Human approval above', money(c.policy.humanApprovalAboveCents)],
                    ['Daily payout cap', money(c.policy.dailyPayoutCapCents)],
                    ['Dispute window', `${c.policy.disputeWindowSeconds}s`],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-white/[0.03] p-2.5">
                      <dt className="text-ink-400">{k}</dt>
                      <dd className="font-medium tabular-nums text-ink-100">{v}</dd>
                    </div>
                  ))}
                </dl>
              </Card>

              <Card>
                <CardHeader icon={<Mail className="size-4" />} title="Payout account" subtitle="PayPal Payouts recipient (sandbox)" />
                {isContractor ? (
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (email) saveEmail.mutate(email);
                    }}
                  >
                    <Input type="email" aria-label="PayPal payout email" value={email ?? c.contractor.paypalEmail ?? ''} onChange={(e) => setEmail(e.target.value)} />
                    <Button type="submit" size="md" variant="secondary" loading={saveEmail.isPending} disabled={!email}>
                      Save
                    </Button>
                  </form>
                ) : (
                  <p className="break-all font-mono text-sm text-ink-200">{c.contractor.paypalEmail ?? 'Not set yet'}</p>
                )}
              </Card>

              {c.sowText ? (
                <Card>
                  <button onClick={() => setSowOpen((v) => !v)} aria-expanded={sowOpen} className="flex w-full items-center justify-between gap-2 text-left">
                    <span className="flex items-center gap-2 text-[15px] font-semibold text-white">
                      <ScrollText className="size-4 text-iris-300" /> Statement of work
                    </span>
                    <ChevronDown className={`size-4 text-ink-400 transition-transform ${sowOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {sowOpen ? (
                    <pre data-lenis-prevent className="scrollbar-thin mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-black/30 p-3 font-mono text-[12px] leading-relaxed text-ink-300">
                      {c.sowText}
                    </pre>
                  ) : null}
                </Card>
              ) : null}
            </div>
          </div>

          <Modal
            open={policyOpen}
            onClose={() => setPolicyOpen(false)}
            title="Edit release policy"
            description="Changes apply to the next decision and to any release still waiting on its dispute window."
            footer={
              <>
                <Button variant="ghost" onClick={() => setPolicyOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" loading={savePolicy.isPending} onClick={() => policyDraft && savePolicy.mutate(policyDraft)}>
                  Save policy
                </Button>
              </>
            }
          >
            {policyDraft ? <PolicyEditor value={policyDraft} onChange={setPolicyDraft} /> : null}
          </Modal>
        </div>
      ) : (
        <div className="h-[570px]" />
      )}
    </Bones>
  );
}

function Party({ label, name, country }: { label: string; name: string; country: string | null }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-iris-500/30 to-mint-400/20 font-display text-sm font-semibold text-white ring-1 ring-white/10">
        {name
          .split(' ')
          .map((p) => p[0])
          .join('')
          .slice(0, 2)}
      </span>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-ink-400">{label}</div>
        <div className="text-sm font-medium text-white">
          {name} {country ? <span className="text-ink-400">· {country}</span> : null}
        </div>
      </div>
    </div>
  );
}
