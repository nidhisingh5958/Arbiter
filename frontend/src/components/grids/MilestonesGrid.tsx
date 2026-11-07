import { isEscrowed, type MilestoneDTO, type MilestoneStatus } from '@arbiter/shared';
import type { ColDef, ICellRendererParams, IRowNode, IsFullWidthRowParams, PostSortRowsParams, RowHeightParams } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { motion } from 'framer-motion';
import { ChevronRight, Download, Layers, ListTree } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { money, shortDate } from '../../lib/format';
import { cn } from '../../lib/cn';
import { Button } from '../ui/Button';
import { arbiterGridTheme, defaultColDef } from './gridSetup';
import { FilterPill, GridFrame, SearchBox } from './GridFrame';
import {
  ConfidenceCell,
  InjectionCell,
  MilestoneLinkCell,
  MilestoneStatusCell,
  MoneyCell,
  RelativeTimeCell,
  VerdictCell,
  VerificationCell,
} from './renderers';

interface GroupInfo {
  contractTitle: string;
  count: number;
  totalCents: number;
  paidCents: number;
  escrowedCents: number;
  statuses: MilestoneStatus[];
}

/** One flat row type so column `field`s stay type-safe; group header rows carry `group`. */
type Row = Partial<MilestoneDTO> & { __kind: 'group' | 'row'; id: string; contractId: string; group?: GroupInfo };

type StatusFilter = 'all' | 'active' | 'attention' | 'settled';
const FILTERS: Record<StatusFilter, MilestoneStatus[] | null> = {
  all: null,
  active: ['FUNDING_REQUIRED', 'FUNDED', 'SUBMITTED', 'VERIFYING', 'APPROVED'],
  attention: ['ESCALATED', 'DISPUTED', 'REJECTED'],
  settled: ['PAID', 'REFUNDED', 'EXPIRED'],
};

const GroupCtx = createContext<{ collapsed: Set<string>; toggle: (id: string) => void }>({ collapsed: new Set(), toggle: () => undefined });

const STATUS_BAR: Partial<Record<MilestoneStatus, string>> = {
  PAID: 'bg-mint-400',
  APPROVED: 'bg-mint-300/70',
  ESCALATED: 'bg-amber-300',
  DISPUTED: 'bg-amber-400',
  REJECTED: 'bg-rose-400',
  VERIFYING: 'bg-iris-400',
  SUBMITTED: 'bg-iris-300',
  FUNDED: 'bg-sky-300',
  FUNDING_REQUIRED: 'bg-sky-400/50',
};

/** Full-width contract header row with aggregated amounts — Community-edition row grouping. */
function GroupRowRenderer(p: ICellRendererParams<Row>) {
  const { collapsed, toggle } = useContext(GroupCtx);
  const d = p.data;
  if (!d?.group) return null;
  const open = !collapsed.has(d.contractId);
  const g = d.group;
  const currency = d.currency ?? 'USD';
  return (
    <button
      onClick={() => toggle(d.contractId)}
      aria-expanded={open}
      className="flex h-full w-full items-center gap-3 bg-gradient-to-r from-iris-500/[0.09] via-white/[0.02] to-transparent px-4 text-left"
    >
      <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}>
        <ChevronRight className="size-4 text-iris-300" aria-hidden />
      </motion.span>
      <span className="truncate font-display text-[15px] font-semibold text-white">{g.contractTitle}</span>
      <span className="rounded-md bg-white/5 px-1.5 text-[11px] text-ink-300">{g.count} milestones</span>
      <div className="ml-2 hidden h-1.5 w-40 overflow-hidden rounded-full bg-white/5 md:flex">
        {g.statuses.map((s, i) => (
          <span key={i} className={cn('h-full flex-1 border-r border-ink-900 last:border-0', STATUS_BAR[s] ?? 'bg-white/10')} />
        ))}
      </div>
      <span className="ml-auto flex items-center gap-5 text-xs tabular-nums">
        <span className="text-ink-300">
          Total <b className="font-semibold text-white">{money(g.totalCents, currency)}</b>
        </span>
        <span className="hidden text-ink-300 sm:inline">
          Escrowed <b className="font-semibold text-sky-200">{money(g.escrowedCents, currency)}</b>
        </span>
        <span className="text-ink-300">
          Paid <b className="font-semibold text-mint-300">{money(g.paidCents, currency)}</b>
        </span>
      </span>
    </button>
  );
}

export function MilestonesGrid({ milestones }: { milestones: MilestoneDTO[] }) {
  const gridRef = useRef<AgGridReact<Row>>(null);
  const [grouped, setGrouped] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const matches = useCallback(
    (m: Partial<MilestoneDTO>) => {
      const allowed = FILTERS[filter];
      if (allowed && (!m.status || !allowed.includes(m.status))) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return [m.title, m.contractTitle, m.status, m.verification?.type].some((v) => v?.toLowerCase().includes(q));
    },
    [filter, search],
  );

  const rows = useMemo<Row[]>(() => {
    const data: Row[] = milestones.map((m) => ({ ...m, __kind: 'row' }));
    if (!grouped) return data;
    const byContract = new Map<string, Row[]>();
    for (const r of data) byContract.set(r.contractId, [...(byContract.get(r.contractId) ?? []), r]);
    const out: Row[] = [];
    for (const [contractId, list] of byContract) {
      const sum = (pred: (r: Row) => boolean) => list.filter(pred).reduce((s, r) => s + (r.amountCents ?? 0), 0);
      out.push({
        __kind: 'group',
        id: `grp_${contractId}`,
        contractId,
        currency: list[0]?.currency,
        group: {
          contractTitle: list[0]?.contractTitle ?? 'Contract',
          count: list.length,
          totalCents: sum(() => true),
          paidCents: sum((r) => r.status === 'PAID'),
          escrowedCents: sum((r) => Boolean(r.status && isEscrowed(r.status))),
          statuses: list.map((r) => r.status!).filter(Boolean),
        },
      });
      out.push(...list);
    }
    return out;
  }, [milestones, grouped]);

  const pinnedBottom = useMemo<Row[]>(() => {
    const visible = milestones.filter(matches);
    return [
      {
        __kind: 'row',
        id: '__total',
        contractId: '__total',
        title: `Total · ${visible.length} milestones`,
        amountCents: visible.reduce((s, m) => s + m.amountCents, 0),
        currency: 'USD',
      },
    ];
  }, [milestones, matches]);

  const doesExternalFilterPass = useCallback(
    (node: IRowNode<Row>) => {
      const d = node.data;
      if (!d) return true;
      if (d.__kind === 'group') return milestones.some((m) => m.contractId === d.contractId && matches(m));
      if (!matches(d)) return false;
      return !grouped || !collapsed.has(d.contractId);
    },
    [milestones, matches, grouped, collapsed],
  );

  useEffect(() => {
    gridRef.current?.api?.onFilterChanged();
  }, [doesExternalFilterPass]);

  const postSortRows = useCallback(
    (params: PostSortRowsParams<Row>) => {
      if (!grouped) return;
      const order: string[] = [];
      const headers = new Map<string, IRowNode<Row>>();
      const children = new Map<string, IRowNode<Row>[]>();
      for (const n of params.nodes) {
        const d = n.data;
        if (!d) continue;
        if (!order.includes(d.contractId)) order.push(d.contractId);
        if (d.__kind === 'group') headers.set(d.contractId, n);
        else children.set(d.contractId, [...(children.get(d.contractId) ?? []), n]);
      }
      const result: IRowNode<Row>[] = [];
      for (const key of order) {
        const h = headers.get(key);
        if (h) result.push(h);
        result.push(...(children.get(key) ?? []));
      }
      params.nodes.splice(0, params.nodes.length, ...result);
    },
    [grouped],
  );

  const columnDefs = useMemo<ColDef<Row>[]>(
    () => [
      { headerName: '#', field: 'seq', width: 72, valueFormatter: (p) => (p.value ? `M${p.value}` : '') },
      { headerName: 'Milestone', field: 'title', flex: 1.4, minWidth: 220, cellRenderer: MilestoneLinkCell },
      { headerName: 'Contract', field: 'contractTitle', flex: 1, minWidth: 170, hide: grouped },
      { headerName: 'Status', field: 'status', width: 160, cellRenderer: MilestoneStatusCell, enableCellChangeFlash: true },
      { headerName: 'Amount', field: 'amountCents', width: 130, cellRenderer: MoneyCell, enableCellChangeFlash: true, type: 'rightAligned' },
      { headerName: 'Verification', field: 'verification', width: 150, cellRenderer: VerificationCell, sortable: false },
      { headerName: 'Verdict', field: 'decisionVerdict', width: 120, cellRenderer: VerdictCell, enableCellChangeFlash: true },
      { headerName: 'Confidence', field: 'decisionConfidence', width: 150, cellRenderer: ConfidenceCell, enableCellChangeFlash: true },
      { headerName: 'Injection', field: 'injectionFlag', width: 115, cellRenderer: InjectionCell },
      { headerName: 'Deadline', field: 'deadline', width: 130, valueFormatter: (p) => (p.value ? shortDate(p.value as string) : '') },
      { headerName: 'Updated', field: 'updatedAt', width: 130, cellRenderer: RelativeTimeCell },
    ],
    [grouped],
  );

  const ctx = useMemo(() => ({ collapsed, toggle }), [collapsed, toggle]);
  const contractIds = useMemo(() => [...new Set(milestones.map((m) => m.contractId))], [milestones]);

  return (
    <GroupCtx.Provider value={ctx}>
      <GridFrame
        toolbar={
          <>
            {(Object.keys(FILTERS) as StatusFilter[]).map((f) => (
              <FilterPill key={f} active={filter === f} onClick={() => setFilter(f)}>
                {f === 'attention' ? 'Needs attention' : f.charAt(0).toUpperCase() + f.slice(1)}
              </FilterPill>
            ))}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <SearchBox value={search} onChange={setSearch} placeholder="Search milestones…" />
              <Button size="sm" variant="ghost" icon={grouped ? <ListTree className="size-3.5" /> : <Layers className="size-3.5" />} onClick={() => setGrouped((g) => !g)}>
                {grouped ? 'Ungroup' : 'Group by contract'}
              </Button>
              {grouped ? (
                <Button size="sm" variant="ghost" onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(contractIds))}>
                  {collapsed.size ? 'Expand all' : 'Collapse all'}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                icon={<Download className="size-3.5" />}
                onClick={() =>
                  gridRef.current?.api.exportDataAsCsv({
                    fileName: 'arbiterai-milestones.csv',
                    shouldRowBeSkipped: (p) => p.node.data?.__kind === 'group',
                  })
                }
              >
                CSV
              </Button>
            </div>
          </>
        }
      >
        <AgGridReact<Row>
          ref={gridRef}
          theme={arbiterGridTheme}
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={{ ...defaultColDef, cellDataType: false }}
          getRowId={(p) => p.data.id}
          isFullWidthRow={(p: IsFullWidthRowParams<Row>) => p.rowNode.data?.__kind === 'group'}
          fullWidthCellRenderer={GroupRowRenderer}
          getRowHeight={(p: RowHeightParams<Row>) => (p.data?.__kind === 'group' ? 54 : 46)}
          isExternalFilterPresent={() => true}
          doesExternalFilterPass={doesExternalFilterPass}
          postSortRows={postSortRows}
          pinnedBottomRowData={pinnedBottom}
          cellFlashDuration={900}
          cellFadeDuration={1200}
          animateRows
          suppressCellFocus
          overlayNoRowsTemplate='<span style="color:#9aa3ba">No milestones yet — create a contract or run the demo scenario.</span>'
        />
      </GridFrame>
    </GroupCtx.Provider>
  );
}
