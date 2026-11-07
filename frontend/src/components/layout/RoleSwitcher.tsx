import type { Role } from '@arbiter/shared';
import { motion } from 'framer-motion';
import { Briefcase, Code2, Scale } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/cn';
import { useSession } from '../../providers/SessionProvider';

const ROLES: { role: Role; label: string; icon: typeof Briefcase }[] = [
  { role: 'buyer', label: 'Buyer', icon: Briefcase },
  { role: 'contractor', label: 'Contractor', icon: Code2 },
  { role: 'admin', label: 'Admin', icon: Scale },
];

/** One-click persona switch for the demo (buyer ↔ contractor ↔ neutral admin). */
export function RoleSwitcher({ compact }: { compact?: boolean }) {
  const { role, users, switchRole, user } = useSession();
  return (
    <div className="glass flex items-center gap-0.5 rounded-2xl p-1" role="radiogroup" aria-label="Act as">
      {ROLES.map(({ role: r, label, icon: Icon }) => {
        const active = r === role;
        const person = users.find((u) => u.role === r);
        return (
          <button
            key={r}
            role="radio"
            aria-checked={active}
            title={person ? `${person.name} (${label.toLowerCase()})` : label}
            onClick={() => {
              if (active) return;
              switchRole(r);
              if (person) toast.message(`Now acting as ${person.name}`, { description: `${label} view` });
            }}
            className={cn('relative flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors', active ? 'text-white' : 'text-ink-300 hover:text-white')}
          >
            {active ? (
              <motion.span
                layoutId="role-pill"
                className={cn(
                  'absolute inset-0 rounded-xl ring-1 ring-inset',
                  r === 'buyer' && 'bg-sky-400/15 ring-sky-300/30',
                  r === 'contractor' && 'bg-mint-400/15 ring-mint-300/30',
                  r === 'admin' && 'bg-iris-500/20 ring-iris-300/30',
                )}
                transition={{ type: 'spring', stiffness: 460, damping: 34 }}
              />
            ) : null}
            <Icon className="relative size-3.5" aria-hidden />
            {!compact || active ? <span className="relative">{label}</span> : null}
          </button>
        );
      })}
      <span className="sr-only">Signed in as {user.name}</span>
    </div>
  );
}
