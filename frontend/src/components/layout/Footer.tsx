import { ShieldAlert } from 'lucide-react';
import { useConfig } from '../../hooks/useConfig';

export function Footer() {
  const { data } = useConfig();
  return (
    <footer className="mt-24 border-t border-white/[0.06]">
      <div className="mx-auto grid max-w-[1400px] gap-6 px-4 py-10 sm:px-6 md:grid-cols-[1fr_auto]">
        <div className="flex gap-3">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-300" aria-hidden />
          <p className="max-w-3xl text-sm leading-relaxed text-ink-300">
            <strong className="font-semibold text-ink-100">Sandbox escrow simulation.</strong> Milestone funds are captured into the platform's PayPal{' '}
            {data?.paypalMode === 'sandbox' ? 'sandbox' : 'simulated'} account and released with PayPal Payouts. No real money moves. Production use would
            require a licensed escrow partner or PayPal's multiparty delayed-disbursement capability.
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 text-xs text-ink-400 md:items-end">
          <span>ArbiterAI · MIT licensed</span>
          {data ? (
            <span>
              Escrow mode <code className="font-mono text-ink-300">{data.escrowMode}</code> · v{data.version}
            </span>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
