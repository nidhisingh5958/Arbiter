import { motion, type HTMLMotionProps } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { forwardRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'agent' | 'warning';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-b from-mint-400 to-mint-500 text-ink-950 shadow-[0_8px_30px_-8px_rgb(79_232_176/0.55)] hover:from-mint-300 hover:to-mint-400',
  secondary: 'glass text-ink-100 hover:bg-white/[0.07] hover:border-white/15',
  ghost: 'text-ink-200 hover:bg-white/5 hover:text-white',
  danger: 'bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-400/30 hover:bg-rose-500/25',
  warning: 'bg-amber-400/15 text-amber-200 ring-1 ring-inset ring-amber-300/30 hover:bg-amber-400/25',
  agent:
    'bg-gradient-to-b from-iris-400 to-iris-600 text-white shadow-[0_8px_30px_-8px_rgb(139_123_255/0.6)] hover:from-iris-300 hover:to-iris-500',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-[15px] gap-2.5 rounded-2xl',
};

export function buttonClasses(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', className?: string): string {
  return cn(
    'relative inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-colors duration-200',
    'disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, icon, children, className, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </motion.button>
  );
});
