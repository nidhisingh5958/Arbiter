import { useMutation, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { FlaskConical, Lock } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { ErrorState } from '../components/ui/ErrorState';
import { api } from '../lib/api';
import { money } from '../lib/format';
import { useSession } from '../providers/SessionProvider';

function withParams(base: string, params: Record<string, string>): string {
  const u = new URL(base, window.location.origin);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

/** Offline stand-in for PayPal's approval page (PAYPAL_MODE=mock). Clearly labeled as simulated. */
export function MockCheckoutPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { user } = useSession();
  const order = useQuery({ queryKey: ['mock-order', token], queryFn: () => api.mockOrder(token), enabled: Boolean(token), retry: false });
  const approve = useMutation({
    mutationFn: () => api.mockApprove(token),
    onSuccess: (r) => window.location.assign(withParams(r.returnUrl, { token, PayerID: 'MOCKPAYER' })),
  });

  return (
    <div className="grid min-h-screen place-items-center bg-[#f5f7fa] px-4 py-10 text-slate-900">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-amber-100 px-3 py-2 text-xs font-medium text-amber-900 ring-1 ring-amber-300">
          <FlaskConical className="size-4" /> Simulated checkout · PAYPAL_MODE=mock · no real money
        </div>
        <div className="overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-slate-200">
          <div className="border-b border-slate-100 px-6 py-5">
            <div className="text-lg font-bold tracking-tight text-slate-900">Checkout simulator</div>
            <div className="text-xs text-slate-500">Mirrors the PayPal sandbox approval step</div>
          </div>
          <div className="px-6 py-6">
            {!token ? (
              <ErrorState title="Missing order token" message="Open this page from the Fund button on a milestone." />
            ) : order.isLoading ? (
              <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
            ) : order.isError ? (
              <ErrorState title="Order not found" message={(order.error as Error).message} />
            ) : order.data ? (
              <>
                <div className="text-sm text-slate-500">You are paying ArbiterAI (escrow)</div>
                <div className="mt-1 text-4xl font-bold tabular-nums">{money(order.data.amountCents, order.data.currency)}</div>
                <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{order.data.description}</div>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-slate-500">Paying as</dt>
                    <dd className="font-medium">{user.name} (sandbox buyer)</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Order</dt>
                    <dd className="font-mono">{order.data.id}</dd>
                  </div>
                </dl>
                {approve.isError ? <p className="mt-3 text-sm text-rose-600">{(approve.error as Error).message}</p> : null}
                <Button
                  size="lg"
                  variant="agent"
                  loading={approve.isPending || approve.isSuccess}
                  onClick={() => approve.mutate()}
                  className="mt-6 w-full"
                  icon={<Lock className="size-4" />}
                >
                  Approve payment
                </Button>
                <button
                  onClick={() => window.location.assign(withParams(order.data.cancelUrl, { token }))}
                  className="mt-3 w-full rounded-xl py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
                >
                  Cancel and return
                </button>
              </>
            ) : null}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
