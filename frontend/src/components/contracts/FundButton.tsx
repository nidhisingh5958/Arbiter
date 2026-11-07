import { useMutation } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import { money } from '../../lib/format';
import { Button, type ButtonSize } from '../ui/Button';

/** Creates (or reuses) the milestone's PayPal order and sends the buyer to approve it. */
export function FundButton({ milestoneId, amountCents, currency, size = 'md' }: { milestoneId: string; amountCents: number; currency: string; size?: ButtonSize }) {
  const fund = useMutation({
    mutationFn: () => api.startFunding(milestoneId),
    onSuccess: (r) => {
      toast.message(r.reused ? 'Resuming your PayPal checkout…' : 'Redirecting to PayPal checkout…');
      window.location.assign(r.approveUrl);
    },
    onError: (e: Error) => toast.error('Could not start funding', { description: e.message }),
  });
  return (
    <Button variant="primary" size={size} loading={fund.isPending || fund.isSuccess} icon={<Wallet className="size-4" />} onClick={() => fund.mutate()}>
      Fund {money(amountCents, currency)} with PayPal
    </Button>
  );
}
