import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../lib/cn';

/** Monospace id with a copy-to-clipboard affordance. */
export function CopyText({ value, display, className }: { value: string | null | undefined; display?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-ink-500">—</span>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      title={`Copy ${value}`}
      className={cn('group inline-flex max-w-full items-center gap-1.5 font-mono text-[12px] text-ink-200 hover:text-white', className)}
    >
      <span className="truncate">{display ?? value}</span>
      {copied ? <Check className="size-3 shrink-0 text-mint-400" /> : <Copy className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-70" />}
    </button>
  );
}
