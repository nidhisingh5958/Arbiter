import { computeAllowedActions, type ContractDetailDTO, type MilestoneDTO, type MilestoneStatus } from '@arbiter/shared';
import { useGSAP } from '@gsap/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import gsap from 'gsap';
import { ArrowRight, CalendarDays, FileUp, Flag, GitPullRequest, Globe, ShieldAlert, Upload, Zap } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { money, pct, shortDate } from '../../lib/format';
import { useSession } from '../../providers/SessionProvider';
import { Button, buttonClasses } from '../ui/Button';
import { StatusChip, VerdictChip } from '../ui/StatusChip';
import { FundButton } from './FundButton';
import { ReasonModal } from './ReasonModal';
import { ReleaseCountdown } from './ReleaseCountdown';
import { SubmissionForm } from './SubmissionForm';

const NODE: Partial<Record<MilestoneStatus, string>> = {
  PAID: 'bg-mint-400 ring-mint-300/40',
  APPROVED: 'bg-mint-300 ring-mint-300/40',
  VERIFYING: 'bg-iris-400 ring-iris-300/50',
  SUBMITTED: 'bg-iris-400 ring-iris-300/50',
  FUNDED: 'bg-sky-300 ring-sky-300/40',
  FUNDING_REQUIRED: 'bg-sky-400 ring-sky-300/40',
  ESCALATED: 'bg-amber-300 ring-amber-300/40',
  DISPUTED: 'bg-amber-400 ring-amber-300/40',
  REJECTED: 'bg-rose-400 ring-rose-300/40',
};

const VERIF = { GITHUB_PR: { icon: GitPullRequest, label: 'GitHub PR' }, URL: { icon: Globe, label: 'Deployed URL' }, FILE: { icon: FileUp, label: 'File' } } as const;

export function MilestoneTimeline({ contract }: { contract: ContractDetailDTO }) {
  const lineRef = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    gsap.fromTo(lineRef.current, { scaleY: 0 }, { scaleY: 1, transformOrigin: 'top center', duration: 1.4, ease: 'expo.out' });
  }, []);
  return (
    <div className="relative">
      <div ref={lineRef} className="absolute bottom-6 left-[19px] top-6 w-px bg-gradient-to-b from-iris-400/70 via-white/10 to-transparent" aria-hidden />
      <ol className="space-y-4">
        {contract.milestones.map((m, i) => (
          <MilestoneCard key={m.id} m={m} index={i} contract={contract} />
        ))}
      </ol>
    </div>
  );
}

function MilestoneCard({ m, index, contract }: { m: MilestoneDTO; index: number; contract: ContractDetailDTO }) {
  const { user } = useSession();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const isBuyer = user.role === 'buyer' && user.id === contract.buyerId;
  const isContractor = user.role === 'contractor' && user.id === contract.contractorId;
  const actions = computeAllowedActions({ status: m.status, role: user.role, isBuyer, isContractor, hasPayout: false });
  const V = VERIF[m.verification.type];
  const active = !['PENDING', 'PAID', 'REFUNDED', 'EXPIRED'].includes(m.status);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['contract', contract.id] });
    void qc.invalidateQueries({ queryKey: ['milestone', m.id] });
  };
  const release = useMutation({
    mutationFn: () => api.releaseNow(m.id),
    onSuccess: () => {
      toast.success('Releasing payout now', { description: 'The payments agent is calling PayPal Payouts.' });
      refresh();
    },
    onError: (e: Error) => toast.error('Could not release', { description: e.message }),
  });
  const dispute = useMutation({
    mutationFn: (reason: string) => api.dispute(m.id, reason),
    onSuccess: () => {
      setDisputeOpen(false);
      toast.warning('Dispute raised — payout paused');
      refresh();
    },
    onError: (e: Error) => toast.error('Could not raise dispute', { description: e.message }),
  });

  return (
    <motion.li
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.1 + index * 0.08, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="relative pl-12"
    >
      <span className={cn('absolute left-3 top-6 grid size-[15px] place-items-center rounded-full ring-4', NODE[m.status] ?? 'bg-ink-500 ring-white/5')}>
        {m.status === 'VERIFYING' ? <span className="absolute inset-0 animate-pulse-ring rounded-full bg-iris-400" /> : null}
      </span>

      <div className={cn('glass rounded-3xl p-5 transition-colors', active && 'border-white/12')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-400">Milestone {m.seq}</div>
            <h3 className="mt-0.5 text-lg font-semibold text-white">{m.title}</h3>
          </div>
          <StatusChip status={m.status} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-300">
          <span className="font-display text-xl font-semibold tabular-nums text-white">{money(m.amountCents, m.currency)}</span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-4 text-ink-400" /> Due {shortDate(m.deadline)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <V.icon className="size-4 text-iris-300" /> {V.label}
            {m.verification.type === 'GITHUB_PR' ? <code className="font-mono text-xs text-ink-400">{m.verification.params.repo}</code> : null}
          </span>
        </div>

        {m.description ? <p className="mt-3 text-sm leading-relaxed text-ink-300">{m.description}</p> : null}

        {m.decisionVerdict ? (
          <div className="mt-4 flex flex-wrap items-start gap-3 rounded-2xl bg-white/[0.03] p-3.5 ring-1 ring-white/[0.06]">
            <VerdictChip verdict={m.decisionVerdict} />
            {m.decisionConfidence !== null ? <span className="text-xs tabular-nums text-ink-400">confidence {pct(m.decisionConfidence)}</span> : null}
            {m.injectionFlag ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/12 px-2 py-0.5 text-[11px] font-semibold text-rose-200 ring-1 ring-rose-400/30">
                <ShieldAlert className="size-3" /> Injection attempt
              </span>
            ) : null}
            <p className="w-full text-sm text-ink-200">{m.decisionSummary}</p>
          </div>
        ) : null}

        {m.status === 'APPROVED' && m.releaseAt ? (
          <div className="mt-4">
            <ReleaseCountdown releaseAt={m.releaseAt} windowSeconds={contract.policy.disputeWindowSeconds} />
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {actions.includes('FUND') ? <FundButton milestoneId={m.id} amountCents={m.amountCents} currency={m.currency} /> : null}
          {actions.includes('SUBMIT') ? (
            <Button variant="agent" icon={<Upload className="size-4" />} onClick={() => setShowForm((v) => !v)} aria-expanded={showForm}>
              {showForm ? 'Hide form' : m.status === 'FUNDED' ? 'Submit deliverable' : 'Resubmit deliverable'}
            </Button>
          ) : null}
          {actions.includes('WAIVE_WINDOW') ? (
            <Button variant="primary" loading={release.isPending} icon={<Zap className="size-4" />} onClick={() => release.mutate()}>
              Release now
            </Button>
          ) : null}
          {actions.includes('DISPUTE') ? (
            <Button variant="warning" icon={<Flag className="size-4" />} onClick={() => setDisputeOpen(true)}>
              Dispute
            </Button>
          ) : null}
          {m.status !== 'PENDING' && m.status !== 'FUNDING_REQUIRED' ? (
            <Link to={`/milestones/${m.id}`} className={buttonClasses('ghost', 'md', 'ml-auto')}>
              {actions.some((a) => a.startsWith('RESOLVE') || a === 'REFUND') ? 'Review & decide' : 'Open evidence'} <ArrowRight className="size-4" />
            </Link>
          ) : m.status === 'PENDING' ? (
            <span className="text-xs text-ink-400">Opens for funding once the previous milestone settles.</span>
          ) : !actions.includes('FUND') ? (
            <span className="text-xs text-ink-400">Waiting for the buyer to fund this milestone.</span>
          ) : null}
        </div>

        <AnimatePresence>{showForm ? <SubmissionForm milestone={m} onDone={() => setShowForm(false)} /> : null}</AnimatePresence>
      </div>

      <ReasonModal
        open={disputeOpen}
        onClose={() => setDisputeOpen(false)}
        title="Raise a dispute"
        description="A dispute pauses any payout and sends the milestone to a neutral admin for review."
        confirmLabel="Raise dispute"
        variant="warning"
        minLength={10}
        placeholder="What is wrong with the decision?"
        loading={dispute.isPending}
        onConfirm={(r) => dispute.mutate(r)}
      />
    </motion.li>
  );
}
