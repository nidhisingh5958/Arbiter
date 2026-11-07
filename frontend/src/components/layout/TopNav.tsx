import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'framer-motion';
import { LayoutDashboard, FileText, Menu, PlusCircle, Home, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { DemoButton } from './DemoButton';
import { Logo } from './Logo';
import { RoleSwitcher } from './RoleSwitcher';
import { LiveIndicator, ModeBadges } from './StatusBadges';

const LINKS = [
  { to: '/', label: 'Overview', icon: Home, end: true },
  { to: '/contracts', label: 'Contracts', icon: FileText, end: false },
  { to: '/contracts/new', label: 'New contract', icon: PlusCircle, end: true },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
];

export function TopNav() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 12));

  return (
    <header className="sticky top-0 z-40">
      <motion.div
        className={cn('border-b transition-colors duration-300', scrolled ? 'glass-strong border-white/[0.06]' : 'border-transparent bg-transparent')}
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <nav className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-4 sm:px-6" aria-label="Primary">
          <NavLink to="/" className="flex items-center gap-2.5" aria-label="ArbiterAI home">
            <Logo />
            <span className="font-display text-lg font-semibold tracking-tight text-white">
              Arbiter<span className="text-iris-300">AI</span>
            </span>
          </NavLink>

          <div className="ml-4 hidden items-center gap-1 lg:flex">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  cn('relative rounded-xl px-3 py-2 text-sm font-medium transition-colors', isActive ? 'text-white' : 'text-ink-300 hover:text-white')
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive ? (
                      <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-white/[0.06]" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
                    ) : null}
                    <span className="relative">{l.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <ModeBadges />
            <LiveIndicator />
            <div className="hidden md:block">
              <RoleSwitcher compact />
            </div>
            <div className="hidden sm:block">
              <DemoButton />
            </div>
            <button
              className="rounded-xl p-2 text-ink-200 hover:bg-white/5 lg:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={open ? 'Close menu' : 'Open menu'}
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </nav>
      </motion.div>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="glass-strong mx-3 mt-2 rounded-3xl p-3 lg:hidden"
          >
            <div className="flex flex-col gap-1">
              {LINKS.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) => cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm', isActive ? 'bg-white/[0.07] text-white' : 'text-ink-200')}
                >
                  <l.icon className="size-4" aria-hidden />
                  {l.label}
                </NavLink>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
              <RoleSwitcher />
              <DemoButton />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
