import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, FileUp, GitPullRequest, Globe, Inbox } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SubmissionForm } from '../components/contracts/SubmissionForm';
import { ActionBar } from '../components/review/ActionBar';
import { AgentStepper } from '../components/review/AgentStepper';
import { ChecksList, CriteriaList, DecisionTimeline, InjectionPanel, PaymentsList, PolicyGatePanel, SubmissionHistory } from '../components/review/EvidencePanels';
import { VerdictPanel } from '../components/review/VerdictPanel';
import { Card } from '../components/ui/Card';
import { ErrorState } from '../components/ui/ErrorState';
import { Bones } from '../components/ui/Skeletons';
import { EmptyState } from '../components/ui/States';
import { StatusChip } from '../components/ui/StatusChip';
import { api } from '../lib/api';
import { money, shortDate } from '../lib/format';
import { useSession } from '../providers/SessionProvider';

const VERIF = { GITHUB_PR: { icon: GitPullRequest, label: 'GitHub PR' }, URL: { icon: Globe, label: 'Deployed URL' }, FILE: { icon: FileUp, label: 'File upload' } } as const;

export function ReviewPage() {
  const { id = '' } = useParams();
  const { user } = useSession();
  const q = useQuery({ queryKey: ['milestone', id, user.id], queryFn: () => api.review(id), refetchInterval: (query) => (query.state.data?.milestone.status === 'VERIFYING' ? 2500 : false) });
  const [showForm, setShowForm] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  if (q.isError) return <ErrorState title="Could not load this milestone" message={(q.error as Error).message} onRetry={() => void q.refetch()} />;

  const r = q.data;
  const latestSubmissionInspections = r ? r.inspections.filter((i) => i.submissionId === r.latestSubmission?.id) : [];
  const V = r ? VERIF[r.milestone.verification.type] : VERIF.URL;

  return (
    <Bones kind="review" loading={q.isLoading}>
      {r ? (
        <div className="space-y-5">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-ink-400">
            <Link to="/contracts" className="hover:text-white">
              Contracts
            </Link>
            <ChevronRight className="size-3.5" />
            <Link to={`/contracts/${r.contract.id}`} className="hover:text-white">
              {r.contract.title}
            </Link>
            <ChevronRight className="size-3.5" />
            <span className="text-ink-200">Milestone {r.milestone.seq}</span>
          </nav>

          <motion.header initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <StatusChip status={r.milestone.status} />
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs text-ink-200 ring-1 ring-inset ring-white/10">
                  <V.icon className="size-3.5 text-iris-300" /> {V.label}
                </span>
                <span className="text-xs text-ink-400">Due {shortDate(r.milestone.deadline)}</span>
              </div>
              <h1 className="text-3xl font-semibold text-white sm:text-4xl">{r.milestone.title}</h1>
              <p className="mt-1.5 text-sm text-ink-300">
                {r.contract.buyerName} → {r.contract.contractorName}
              </p>
            </div>
            <div className="text-left md:text-right">
              <div className="text-[11px] uppercase tracking-wider text-ink-400">Milestone amount</div>
              <div className="font-display text-4xl font-semibold tabular-nums text-white">{money(r.milestone.amountCents, r.milestone.currency)}</div>
            </div>
          </motion.header>

          <AgentStepper review={r} />

          <div className="grid gap-5 lg:grid-cols-12">
            <div className="space-y-5 lg:col-span-5">
              <VerdictPanel review={r} />
              <ActionBar
                review={r}
                onSubmitClick={() => {
                  setShowForm(true);
                  setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
                }}
              />
              <PolicyGatePanel evaluation={r.policyGate} policy={r.policy} />
              <PaymentsList payments={r.payments} />
            </div>

            <div className="space-y-5 lg:col-span-7">
              <div ref={formRef}>
                <AnimatePresence>
                  {showForm && r.allowedActions.includes('SUBMIT') ? (
                    <Card>
                      <h3 className="text-[15px] font-semibold text-white">Submit deliverable</h3>
                      <SubmissionForm milestone={r.milestone} onDone={() => setShowForm(false)} />
                    </Card>
                  ) : null}
                </AnimatePresence>
              </div>

              {!r.latestSubmission ? (
                <EmptyState
                  icon={<Inbox className="size-6" />}
                  title={r.milestone.status === 'FUNDING_REQUIRED' || r.milestone.status === 'PENDING' ? 'Waiting for funding' : 'Waiting for the deliverable'}
                  message={
                    r.milestone.status === 'FUNDING_REQUIRED' || r.milestone.status === 'PENDING'
                      ? 'Once the buyer funds this milestone through PayPal, the contractor can submit work for verification.'
                      : 'When the contractor submits, the agent runs deterministic checks, an injection scan, an LLM judgment and the policy gate — live.'
                  }
                />
              ) : (
                <>
                  <InjectionPanel inspections={latestSubmissionInspections} flagged={r.milestone.injectionFlag} />
                  <CriteriaList judge={r.judge} />
                  <ChecksList inspections={latestSubmissionInspections} />
                </>
              )}
              <SubmissionHistory submissions={r.submissions} />
              <DecisionTimeline decisions={r.decisions} />
            </div>
          </div>
        </div>
      ) : (
        <div className="h-[584px]" />
      )}
    </Bones>
  );
}
