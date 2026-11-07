import type { Role, UserDTO } from '@arbiter/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { ErrorState } from '../components/ui/ErrorState';
import { SplashScreen } from '../components/layout/SplashScreen';
import { api, setDemoUser } from '../lib/api';

const STORAGE_KEY = 'arbiter.demoUserId';

interface Session {
  user: UserDTO;
  users: UserDTO[];
  role: Role;
  switchUser: (id: string) => void;
  switchRole: (role: Role) => void;
}

const SessionContext = createContext<Session | null>(null);

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function store(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Storage may be unavailable (private mode); the session still works in memory.
  }
}

/** Demo session: which seeded persona (buyer / contractor / admin) the UI is acting as. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const usersQ = useQuery({ queryKey: ['users'], queryFn: api.users, staleTime: 60_000 });
  const [selectedId, setSelectedId] = useState<string | null>(readStored);

  const users = useMemo(() => usersQ.data ?? [], [usersQ.data]);
  const user = users.find((u) => u.id === selectedId) ?? users.find((u) => u.role === 'buyer') ?? users[0] ?? null;
  // Set synchronously so every child query sends the right x-demo-user header.
  setDemoUser(user?.id ?? null);

  const switchUser = useCallback(
    (id: string) => {
      setSelectedId(id);
      store(id);
      setDemoUser(id);
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'users' && q.queryKey[0] !== 'config' });
    },
    [qc],
  );

  const switchRole = useCallback(
    (role: Role) => {
      const target = users.find((u) => u.role === role);
      if (target) switchUser(target.id);
    },
    [users, switchUser],
  );

  if (usersQ.isError) {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl items-center px-4">
        <ErrorState
          title="ArbiterAI API is unreachable"
          message={(usersQ.error as Error).message}
          onRetry={() => void usersQ.refetch()}
        />
      </div>
    );
  }
  if (!user) return <SplashScreen />;

  return (
    <SessionContext.Provider value={{ user, users, role: user.role, switchUser, switchRole }}>{children}</SessionContext.Provider>
  );
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession must be used inside SessionProvider');
  return s;
}
