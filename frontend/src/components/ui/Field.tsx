import { forwardRef, useEffect, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

const control =
  'w-full rounded-xl bg-ink-900/70 px-3.5 text-sm text-ink-100 ring-1 ring-inset ring-white/10 placeholder:text-ink-500 ' +
  'transition-shadow focus:outline-none focus:ring-2 focus:ring-iris-400/70 disabled:opacity-60';

export function Field({ label, hint, error, children, htmlFor, className }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium uppercase tracking-wider text-ink-300">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-rose-300" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(control, 'h-10', invalid && 'ring-rose-400/60', className)} aria-invalid={invalid || undefined} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea(
  { className, invalid, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      data-lenis-prevent
      className={cn(control, 'scrollbar-thin min-h-24 py-2.5 leading-relaxed', invalid && 'ring-rose-400/60', className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(control, 'h-10 appearance-none bg-[length:12px] pr-8', className)} {...rest}>
      {children}
    </select>
  );
});

/** Edits a string[] as comma- or newline-separated text, committing on blur. */
export function ListInput({
  value,
  onChange,
  separator = ',',
  placeholder,
  id,
  multiline,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  separator?: ',' | '\n';
  placeholder?: string;
  id?: string;
  multiline?: boolean;
}) {
  const join = separator === ',' ? ', ' : '\n';
  const [text, setText] = useState(value.join(join));
  useEffect(() => setText(value.join(join)), [value, join]);
  const commit = () =>
    onChange(
      text
        .split(separator === ',' ? /[,\n]/ : /\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    );
  return multiline ? (
    <Textarea id={id} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={commit} className="min-h-20" />
  ) : (
    <Input id={id} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={commit} />
  );
}

export function useFieldId(prefix: string): string {
  return `${prefix}-${useId().replace(/:/g, '')}`;
}

export function Toggle({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group inline-flex items-center gap-2.5 text-sm text-ink-200"
    >
      <span className={cn('relative h-5 w-9 rounded-full ring-1 ring-inset transition-colors', checked ? 'bg-mint-500/80 ring-mint-300/40' : 'bg-white/10 ring-white/10')}>
        <span className={cn('absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4.5' : 'translate-x-0.5')} />
      </span>
      {label}
    </button>
  );
}
