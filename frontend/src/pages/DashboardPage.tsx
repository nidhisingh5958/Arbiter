import { useQuery } from '@tanstack/react-query';
import { Activity, FileSearch, Landmark, ScrollText, Webhook } from 'lucide-react';
import { useState } from 'react';
import { DemoButton } from '../components/layout/DemoButton';
import { LiveFeed } from '../components/dashboard/LiveFeed';
import { SummaryTiles } from '../components/dashboard/SummaryTiles';
import { DecisionLogGrid } from '../components/grids/DecisionLogGrid';
import { InspectionsGrid } from '../components/grids/InspectionsGrid';
import { MilestonesGrid } from '../components/grids/MilestonesGrid';
import { TransactionsGrid } from '../components/grids/TransactionsGrid';
import { WebhooksGrid } from '../components/grids/WebhooksGrid';
import { ErrorState } from '../components/ui/ErrorState';
import { PageHeader } from '../components/ui/PageHeader';
import { Bones } from '../components/ui/Skeletons';
import { Tabs } from '../components/ui/Tabs';
import { api } from '../lib/api';
import { useSession } from '../providers/SessionProvider';

type TabKey = 'milestones' | 'inspections' | 'transactions' | 'decisions' | 'webhooks';

export function DashboardPage() {
  const { user } = useSession();
  const [tab, setTab] = useState<TabKey>('milestones');
  const summary = useQuery({ queryKey: ['dashboard', 'summary', user.id], queryFn: api.summary });
  const milestones = useQuery({ queryKey: ['dashboard', 'milestones', user.id], queryFn: api.dashMilestones });
  const inspections = useQuery({ queryKey: ['dashboard', 'inspections', user.id], queryFn: api.dashInspections });
  const transactions = useQuery({ queryKey: ['dashboard', 'transactions', user.id], queryFn: api.dashTransactions });
  const decisions = useQuery({ queryKey: ['dashboard', 'decisions', user.id], queryFn: api.dashDecisions });
  const webhooks = useQuery({ queryKey: ['dashboard', 'webhooks', user.id], queryFn: api.dashWebhooks });

  const active = { milestones, inspections, transactions, decisions, webhooks }[tab];
  const firstError = [summary, active].find((q) => q.isError)?.error as Error | undefined;

  return (
    <div>
      <PageHeader
        eyebrow="Telemetry"
        title="Escrow control room"
        description={
          user.role === 'admin'
            ? 'Every milestone, inspection, PayPal transaction and agent decision across the platform — updated live from webhooks and agent events.'
            : `Live view of the contracts you are party to, as ${user.name}.`
        }
        actions={<DemoButton size="md" label="Run demo scenario" />}
      />

      <Bones kind="tiles" loading={summary.isLoading}>
        {summary.data ? <SummaryTiles s={summary.data} /> : <div className="h-28" />}
      </Bones>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <Tabs<TabKey>
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'milestones', label: 'Milestones', icon: <Activity className="size-4" />, count: milestones.data?.length },
            { key: 'inspections', label: 'Inspection log', icon: <FileSearch className="size-4" />, count: inspections.data?.length },
            { key: 'transactions', label: 'Transactions', icon: <Landmark className="size-4" />, count: transactions.data?.length },
            { key: 'decisions', label: 'Decision log', icon: <ScrollText className="size-4" />, count: decisions.data?.length },
            { key: 'webhooks', label: 'Webhooks', icon: <Webhook className="size-4" />, count: webhooks.data?.length },
          ]}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {firstError ? (
            <ErrorState title="Could not load telemetry" message={firstError.message} onRetry={() => void active.refetch()} />
          ) : (
            <Bones kind="grid" loading={active.isLoading}>
              {tab === 'milestones' && milestones.data ? <MilestonesGrid milestones={milestones.data} /> : null}
              {tab === 'inspections' && inspections.data ? <InspectionsGrid inspections={inspections.data} /> : null}
              {tab === 'transactions' && transactions.data ? <TransactionsGrid payments={transactions.data} /> : null}
              {tab === 'decisions' && decisions.data ? <DecisionLogGrid decisions={decisions.data} /> : null}
              {tab === 'webhooks' && webhooks.data ? <WebhooksGrid events={webhooks.data} /> : null}
            </Bones>
          )}
        </div>
        <LiveFeed className="h-[420px] xl:h-[617px]" />
      </div>
    </div>
  );
}
