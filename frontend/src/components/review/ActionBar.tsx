import type { ReviewDTO } from '@arbiter/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Flag, Gavel, RefreshCcw, RotateCcw, ThumbsDown, ThumbsUp, Undo2, Zap } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import { useSession } from '../../providers/SessionProvider';
import { FundButton } from '../contracts/FundButton';
import { ReasonModal } from '../contracts/ReasonModal';
import { ReleaseCountdown } from '../contracts/ReleaseCountdown';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';

type ModalKind = 'approve' | 'reject' | 'dispute' | 'refund' | null;

/** Human-in-the-loop controls. Buttons render only for actions the server will accept for this role. */
export function ActionBar({ review, onSubmitClick }: { review: ReviewDTO; onSubmitClick: () => void }) {
  const { milestone: m, allowedActions: a, policy } = review;
  const { user, switchRole } = useSession();
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalKind>(null);

  const done = (title: string, description?: string) => {
    setModal(null);
    toast.success(title, { description });
    void qc.invalidateQueries({ queryKey: ['milestone', m.id] });
    void qc.invalidateQueries({ queryKey: ['contract', m.contractId] });
  };
  const fail = (e: Error) => toast.error('Action failed', { description: e.message });

  const resolve = useMutation({
    mutationFn: (v: { action: 'APPROVE' | 'REJECT'; note: string }) => api.resolve(m.id, v.action, v.note),
    onSuccess: (_d, v) => done(v.action === 'APPROVE' ? 'Approved — releasing payout' : 'Rejected', 'Recorded as a human override in the decision log.'),
    onError: fail,
  });
  const dispute = useMutation({ mutationFn: (reason: string) => api.dispute(m.id, reason), onSuccess: () => done('Dispute raised', 'Payout paused pending admin review.'), onError: fail });
  const refund = useMutation({ mutationFn: (reason: string) => api.refund(m.id, reason), onSuccess: () => done('Refund issued', 'Funds returned to the buyer via PayPal.'), onError: fail });
  const release = useMutation({ mutationFn: () => api.releaseNow(m.id), onSuccess: () => done('Releasing payout now'), onError: fail });
  const reverify = useMutation({ mutationFn: () => api.reverify(m.id), onSuccess: () => done('Verification restarted'), onError: fail });

  const nothing = a.length === 0;
  const needsAdmin = m.status === 'DISPUTED' && user.role !== 'admin';

  return (
    <Card>
      <CardHeader icon={<Gavel className="size-4" />} title="Decision controls" subtitle={`Acting as ${user.name} (${user.role})`} />

      {m.status === 'APPROVED' && m.releaseAt ? (
        <div className="mb-4">
          <ReleaseCountdown releaseAt={m.releaseAt} windowSeconds={policy.disputeWindowSeconds} />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {a.includes('FUND') ? <FundButton milestoneId={m.id} amountCents={m.amountCents} currency={m.currency} /> : null}
        {a.includes('SUBMIT') ? (
          <Button variant="agent" onClick={onSubmitClick}>
            {m.status === 'FUNDED' ? 'Submit deliverable' : 'Resubmit deliverable'}
          </Button>
        ) : null}
        {a.includes('RESOLVE_APPROVE') ? (
          <Button variant="primary" icon={<ThumbsUp className="size-4" />} onClick={() => setModal('approve')}>
            Approve & release
          </Button>
        ) : null}
        {a.includes('RESOLVE_REJECT') ? (
          <Button variant="danger" icon={<ThumbsDown className="size-4" />} onClick={() => setModal('reject')}>
            Reject
          </Button>
        ) : null}
        {a.includes('WAIVE_WINDOW') ? (
          <Button variant="primary" loading={release.isPending} icon={<Zap className="size-4" />} onClick={() => release.mutate()}>
            Release now
          </Button>
        ) : null}
        {a.includes('DISPUTE') ? (
          <Button variant="warning" icon={<Flag className="size-4" />} onClick={() => setModal('dispute')}>
            Dispute decision
          </Button>
        ) : null}
        {a.includes('REFUND') ? (
          <Button variant="secondary" icon={<Undo2 className="size-4" />} onClick={() => setModal('refund')}>
            Refund buyer
          </Button>
        ) : null}
        {a.includes('REVERIFY') ? (
          <Button variant="secondary" loading={reverify.isPending} icon={<RefreshCcw className="size-4" />} onClick={() => reverify.mutate()}>
            Re-run verification
          </Button>
        ) : null}
      </div>

      {nothing ? (
        <p className="text-sm text-ink-400">
          {m.status === 'PAID'
            ? 'Settled — the contractor has been paid via PayPal Payouts.'
            : m.status === 'VERIFYING' || m.status === 'SUBMITTED'
              ? 'The agent is verifying the deliverable. Results stream in live.'
              : 'No actions are available to your role right now.'}
        </p>
      ) : null}
      {needsAdmin ? (
        <button onClick={() => switchRole('admin')} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-iris-300 hover:text-iris-200">
          <RotateCcw className="size-3" /> Disputes are resolved by a neutral admin — switch to admin
        </button>
      ) : null}

      <ReasonModal
        open={modal === 'approve'}
        onClose={() => setModal(null)}
        title="Approve and release payout"
        description="Overrides the agent. The policy engine issues a human release grant and the payments agent pays the contractor."
        confirmLabel="Approve & release"
        loading={resolve.isPending}
        placeholder="Why is this deliverable acceptable?"
        onConfirm={(note) => resolve.mutate({ action: 'APPROVE', note })}
      />
      <ReasonModal
        open={modal === 'reject'}
        onClose={() => setModal(null)}
        title="Reject deliverable"
        description="The contractor can resubmit or dispute. Funds stay in escrow."
        confirmLabel="Reject"
        variant="danger"
        loading={resolve.isPending}
        placeholder="What needs to change?"
        onConfirm={(note) => resolve.mutate({ action: 'REJECT', note })}
      />
      <ReasonModal
        open={modal === 'dispute'}
        onClose={() => setModal(null)}
        title="Dispute this decision"
        description="Pauses any payout and escalates to a neutral admin."
        confirmLabel="Raise dispute"
        variant="warning"
        minLength={10}
        loading={dispute.isPending}
        placeholder="Explain what is wrong with the decision"
        onConfirm={(reason) => dispute.mutate(reason)}
      />
      <ReasonModal
        open={modal === 'refund'}
        onClose={() => setModal(null)}
        title="Refund the buyer"
        description="Refunds the PayPal capture (or voids the authorization) and closes this milestone."
        confirmLabel="Issue refund"
        variant="danger"
        loading={refund.isPending}
        placeholder="Reason for the refund"
        onConfirm={(reason) => refund.mutate(reason)}
      />
    </Card>
  );
}
