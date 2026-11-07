import type { InspectionCategory, InspectionDTO } from '@arbiter/shared';
import type { ColDef, ICellRendererParams, IRowNode, PostSortRowsParams } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { motion } from 'framer-motion';
import { ChevronRight, ShieldAlert } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { titleCase } from '../../lib/format';
import { Chip, type Tone } from '../ui/StatusChip';
import { arbiterGridTheme, defaultColDef } from './gridSetup';
import { FilterPill, GridFrame, SearchBox } from './GridFrame';
import { CheckStatusCell, InjectionCell, MilestoneLinkCell, RelativeTimeCell, SeverityCell } from './renderers';
import { EvidenceView } from './EvidenceView';

type Row = Partial<InspectionDTO> & { __kind: 'row' | 'detail'; id: string; parent?: InspectionDTO };

const ExpandCtx = createContext<{ expanded: Set<string>; toggle: (id: string) => void }>({ expanded: new Set(), toggle: () => undefined });

const CATEGORY_TONE: Record<InspectionCategory, Tone> = { deterministic: 'info', injection: 'danger', llm: 'agent', policy: 'warning' };

function ExpandCell(p: ICellRendererParams<Row>) {
  const { expanded, toggle } = useContext(ExpandCtx);
  if (!p.data || p.data.__kind !== 'row') return null;
  const open = expanded.has(p.data.id);
  return (
    <button onClick={() => toggle(p.data!.id)} aria-expanded={open} aria-label={open ? 'Hide evidence' : 'Show evidence'} className="grid h-full w-full place-items-center">
      <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}>
        <ChevronRight className="size-4 text-ink-300" />
      </motion.span>
    </button>
  );
}

function CategoryCell(p: ICellRendererParams<Row, InspectionCategory>) {
  return p.value ? (
    <Chip tone={CATEGORY_TONE[p.value]} size="sm">
      {p.value === 'llm' ? 'LLM judge' : titleCase(p.value)}
    </Chip>
  ) : null;
}

/** Expanded evidence row — Community-edition master/detail via a full-width row. */
function DetailRow(p: ICellRendererParams<Row>) {
  const parent = p.data?.parent;
  if (!parent) return null;
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="h-full p-3">
      <div data-lenis-prevent className="scrollbar-thin h-full overflow-auto rounded-2xl bg-ink-950/60 p-4 ring-1 ring-white/[0.06]">
        <EvidenceView inspection={parent} />
      </div>
    </motion.div>
  );
}

export function InspectionsGrid({ inspections }: { inspections: InspectionDTO[] }) {
  const gridRef = useRef<AgGridReact<Row>>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState<InspectionCategory | 'all'>('all');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [search, setSearch] = useState('');

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const i of inspections) {
      out.push({ ...i, __kind: 'row' });
      if (expanded.has(i.id)) out.push({ __kind: 'detail', id: `${i.id}::detail`, parent: i });
    }
    return out;
  }, [inspections, expanded]);

  const matches = useCallback(
    (i: Partial<InspectionDTO>) => {
      if (category !== 'all' && i.category !== category) return false;
      if (flaggedOnly && !i.injectionFlag) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return [i.checkName, i.message, i.milestoneTitle, i.contractTitle].some((v) => v?.toLowerCase().includes(q));
    },
    [category, flaggedOnly, search],
  );

  const doesExternalFilterPass = useCallback((node: IRowNode<Row>) => {
    const d = node.data;
    if (!d) return true;
    return d.__kind === 'detail' ? Boolean(d.parent && matches(d.parent)) : matches(d);
  }, [matches]);

  useEffect(() => {
    gridRef.current?.api?.onFilterChanged();
  }, [doesExternalFilterPass]);

  const postSortRows = useCallback((params: PostSortRowsParams<Row>) => {
    const details = new Map<string, IRowNode<Row>>();
    const mains: IRowNode<Row>[] = [];
    for (const n of params.nodes) {
      if (n.data?.__kind === 'detail' && n.data.parent) details.set(n.data.parent.id, n);
      else mains.push(n);
    }
    const result: IRowNode<Row>[] = [];
    for (const n of mains) {
      result.push(n);
      const det = n.data ? details.get(n.data.id) : undefined;
      if (det) result.push(det);
    }
    params.nodes.splice(0, params.nodes.length, ...result);
  }, []);

  const columnDefs = useMemo<ColDef<Row>[]>(
    () => [
      { headerName: '', colId: 'expand', width: 52, minWidth: 52, sortable: false, resizable: false, cellRenderer: ExpandCell },
      { headerName: 'When', field: 'createdAt', width: 120, cellRenderer: RelativeTimeCell, sort: 'desc' },
      { headerName: 'Milestone', field: 'milestoneTitle', flex: 1, minWidth: 170, cellRenderer: MilestoneLinkCell },
      { headerName: 'Layer', field: 'category', width: 140, cellRenderer: CategoryCell },
      {
        headerName: 'Check',
        field: 'checkName',
        width: 210,
        cellRenderer: (p: ICellRendererParams<Row, string>) => <span className="font-mono text-[12px] text-ink-200">{p.value}</span>,
      },
      { headerName: 'Result', field: 'status', width: 110, cellRenderer: CheckStatusCell, enableCellChangeFlash: true },
      { headerName: 'Severity', field: 'severity', width: 115, cellRenderer: SeverityCell },
      { headerName: 'Injection', field: 'injectionFlag', width: 115, cellRenderer: InjectionCell },
      { headerName: 'Finding', field: 'message', flex: 2, minWidth: 260, tooltipField: 'message' },
    ],
    [],
  );

  const ctx = useMemo(() => ({ expanded, toggle }), [expanded, toggle]);
  const flaggedCount = inspections.filter((i) => i.injectionFlag).length;

  return (
    <ExpandCtx.Provider value={ctx}>
      <GridFrame
        toolbar={
          <>
            {(['all', 'deterministic', 'injection', 'llm', 'policy'] as const).map((c) => (
              <FilterPill key={c} active={category === c} onClick={() => setCategory(c)}>
                {c === 'all' ? 'All layers' : c === 'llm' ? 'LLM judge' : titleCase(c)}
              </FilterPill>
            ))}
            <FilterPill active={flaggedOnly} onClick={() => setFlaggedOnly((v) => !v)}>
              <span className="inline-flex items-center gap-1">
                <ShieldAlert className="size-3" /> Injection flags ({flaggedCount})
              </span>
            </FilterPill>
            <div className="ml-auto">
              <SearchBox value={search} onChange={setSearch} placeholder="Search checks and findings…" />
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
          isFullWidthRow={(p) => p.rowNode.data?.__kind === 'detail'}
          fullWidthCellRenderer={DetailRow}
          getRowHeight={(p) => (p.data?.__kind === 'detail' ? 260 : 46)}
          isExternalFilterPresent={() => true}
          doesExternalFilterPass={doesExternalFilterPass}
          postSortRows={postSortRows}
          getRowClass={(p) => (p.data?.injectionFlag ? 'bg-rose-500/[0.05]' : undefined)}
          cellFlashDuration={900}
          animateRows
          suppressCellFocus
          tooltipShowDelay={400}
          overlayNoRowsTemplate='<span style="color:#9aa3ba">No inspections yet — submit a deliverable to see the agent at work.</span>'
        />
      </GridFrame>
    </ExpandCtx.Provider>
  );
}
