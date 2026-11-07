import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from './Button';

export function ErrorState({ title = 'Something went wrong', message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="glass w-full rounded-3xl border-rose-400/20 p-6">
      <div className="flex items-start gap-4">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30">
          <AlertTriangle className="size-5" aria-hidden />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-white">{title}</h3>
          <p className="mt-1 text-sm text-ink-300">{message}</p>
          {onRetry ? (
            <Button size="sm" className="mt-4" icon={<RotateCw className="size-3.5" />} onClick={onRetry}>
              Try again
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
