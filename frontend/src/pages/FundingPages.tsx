import { useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowRight, Loader2, XCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { buttonClasses } from '../components/ui/Button';
import { ErrorState } from '../components/ui/ErrorState';
import { api } from '../lib/api';
import { money } from '../lib/format';

/** PayPal return URL: captures (or authorizes) the approved order into the escrow balance. */
export function FundingReturnPage() {
  const [params] = useSearchParams();
  const milestoneId = params.get('milestoneId');
  const token = params.get('token');
  const started = useRef(false);
  const capture = useMutation({ mutationFn: () => api.captureFunding(milestoneId!, token!) });

  useEffect(() => {
    if (started.current || !milestoneId || !token) return;
    started.current = true;
    capture.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run exactly once per return
  }, [milestoneId, token]);

  if (!milestoneId || !token) {
    return <ErrorState title="Missing PayPal details" message="This page expects ?milestoneId and PayPal's ?token in the URL. Start funding from the contract page." />;
  }

  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="glass relative overflow-hidden rounded-[2rem] p-8 text-center">
        <div className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-mint-400/15 blur-3xl" />
        {capture.isPending || capture.isIdle ? (
          <div className="relative py-6">
            <div className="relative mx-auto size-20">
              <motion.span className="absolute inset-0 rounded-full border-2 border-iris-400/30 border-t-iris-300" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }} />
              <Loader2 className="absolute inset-0 m-auto size-7 animate-spin text-mint-300" />
            </div>
            <h1 className="mt-6 text-2xl font-semibold text-white">Securing funds in escrow…</h1>
            <p className="mt-2 text-sm text-ink-300">Capturing the approved PayPal order into the platform balance.</p>
          </div>
        ) : capture.isError ? (
          <div className="relative space-y-4 text-left">
            <ErrorState title="Funding could not be completed" message={(capture.error as Error).message} onRetry={() => capture.mutate()} />
            <Link to="/contracts" className={buttonClasses('ghost', 'md')}>
              Back to contracts
            </Link>
          </div>
        ) : capture.data ? (
          <div className="relative">
            <svg viewBox="0 0 80 80" className="mx-auto size-24">
              <motion.circle cx="40" cy="40" r="34" fill="none" stroke="#4fe8b0" strokeWidth="4" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7 }} />
              <motion.path d="M25 41 l10 10 l20 -22" fill="none" stroke="#4fe8b0" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.5, duration: 0.5 }} />
            </svg>
            <h1 className="mt-4 text-3xl font-semibold text-white">Milestone funded</h1>
            <p className="mt-2 text-[15px] text-ink-300">
              <b className="text-white">{money(capture.data.amountCents, capture.data.currency)}</b> is held for “{capture.data.title}”. The contractor can now submit work.
            </p>
            <p className="mt-3 text-xs text-ink-400">Sandbox escrow simulation — funds sit in the platform's PayPal sandbox balance until the agent releases them.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link to={`/contracts/${capture.data.contractId}`} className={buttonClasses('primary', 'md')}>
                Back to contract <ArrowRight className="size-4" />
              </Link>
              <Link to="/dashboard" className={buttonClasses('secondary', 'md')}>
                Open dashboard
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function FundingCancelPage() {
  const [params] = useSearchParams();
  const milestoneId = params.get('milestoneId');
  const logged = useRef(false);
  useEffect(() => {
    if (logged.current || !milestoneId) return;
    logged.current = true;
    void api.cancelFunding(milestoneId).catch(() => undefined);
  }, [milestoneId]);
  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="glass rounded-[2rem] p-8 text-center">
        <XCircle className="mx-auto size-14 text-amber-300" />
        <h1 className="mt-4 text-2xl font-semibold text-white">Checkout cancelled</h1>
        <p className="mt-2 text-sm text-ink-300">Nothing was charged. The milestone still needs funding before work can be submitted.</p>
        <Link to="/contracts" className={buttonClasses('secondary', 'md', 'mt-6')}>
          Back to contracts
        </Link>
      </div>
    </div>
  );
}
