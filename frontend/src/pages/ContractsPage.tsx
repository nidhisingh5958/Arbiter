import { useQuery } from '@tanstack/react-query';
import { FileStack, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ContractCard } from '../components/contracts/ContractCard';
import { DemoButton } from '../components/layout/DemoButton';
import { buttonClasses } from '../components/ui/Button';
import { ErrorState } from '../components/ui/ErrorState';
import { PageHeader } from '../components/ui/PageHeader';
import { Bones } from '../components/ui/Skeletons';
import { EmptyState } from '../components/ui/States';
import { api } from '../lib/api';
import { useSession } from '../providers/SessionProvider';

export function ContractsPage() {
  const { user } = useSession();
  const q = useQuery({ queryKey: ['contracts', user.id], queryFn: api.contracts });

  return (
    <div>
      <PageHeader
        eyebrow={user.role === 'contractor' ? 'Your engagements' : user.role === 'admin' ? 'All contracts' : 'Your contracts'}
        title="Contracts"
        description="Each contract is split into funded milestones. The agent verifies every deliverable before money moves."
        actions={
          user.role === 'buyer' ? (
            <Link to="/contracts/new" className={buttonClasses('primary', 'md')}>
              <Plus className="size-4" /> New contract
            </Link>
          ) : null
        }
      />
      {q.isError ? (
        <ErrorState title="Could not load contracts" message={(q.error as Error).message} onRetry={() => void q.refetch()} />
      ) : (
        <Bones kind="cards" loading={q.isLoading}>
          {q.data && q.data.length === 0 ? (
            <EmptyState
              icon={<FileStack className="size-6" />}
              title="No contracts yet"
              message={
                user.role === 'contractor'
                  ? 'When a buyer creates a contract with you, it shows up here with its milestones.'
                  : 'Paste a statement of work and the agent will turn it into verifiable, funded milestones — or seed the three demo stories.'
              }
              action={
                <>
                  {user.role === 'buyer' ? (
                    <Link to="/contracts/new" className={buttonClasses('primary', 'md')}>
                      <Plus className="size-4" /> Draft a contract
                    </Link>
                  ) : null}
                  <DemoButton size="md" label="Run demo scenario" />
                </>
              }
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {q.data?.map((c, i) => (
                <ContractCard key={c.id} c={c} index={i} />
              ))}
            </div>
          )}
        </Bones>
      )}
    </div>
  );
}
