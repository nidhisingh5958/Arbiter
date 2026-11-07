import type { AgentDecisionDTO, ChainVerificationDTO, DecisionAction } from '@arbiter/shared';
import { useMutation } from '@tanstack/react-query';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { Link2, ShieldCheck, ShieldX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { clock, shortHash, titleCase } from '../../lib/format';
import { Button } from '../ui/Button';
import { CopyText } from '../ui/CopyText';
import { Modal } from '../ui/Modal';
import { Chip, type Tone } from '../ui/StatusChip';
import { JsonBlock } from './EvidenceView';
import { arbiterGridTheme, defaultColDef } from './gridSetup';
import { GridFrame, SearchBox } from './GridFrame';
import { ConfidenceCell, MilestoneLinkCell, MonoCell, VerdictCell } from './renderers';

const ACTION_TONE: Record<DecisionAction, Tone> = {
  EXTRACTION: 'info',
  DETERMINISTIC_CHECKS: 'neutral',
  INJECTION_SCAN: 'danger',
  LLM_VERDICT: 'agent',
  POLICY_GATE: 'warning',
  FINAL_DECISION: 'success',
  TOOL_CALL: 'agent',
  HUMAN_OVERRIDE: 'warning',
  DISPUTE: 'danger',
  WEBHOOK: 'info',
};

function ActionCell(p: ICellRendererParams<AgentDecisionDTO, DecisionAction>) {
  if (!p.value) return null;
  const tool = p.value === 'TOOL_CALL' ? (p.data?.outputs as { tool?: string } | null)?.tool : null;
  return (
    <Chip tone={ACTION_TONE[p.value]} size="sm">
      {tool ? `Tool · ${tool}` : titleCase(p.value)}
    </Chip>
  );
}

export function DecisionLogGrid({ decisions }: { decisions: AgentDecisionDTO[] }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AgentDecisionDTO | null>(null);
  const verify = useMutation<ChainVerificationDTO, Error>({ mutationFn: api.verifyChain });

  const columnDefs = useMemo<ColDef<AgentDecisionDTO>[]>(
    () => [
      { headerName: 'Seq', field: 'seq', width: 85, sort: 'desc' },
      { headerName: 'Time', field: 'createdAt', width: 110, valueFormatter: (p) => (p.value ? clock(p.value as string) : '') },
      { headerName: 'Action', field: 'action', width: 210, cellRenderer: ActionCell },
      { headerName: 'Actor', field: 'actor', width: 200, cellRenderer: MonoCell },
      { headerName: 'Milestone', field: 'milestoneTitle', flex: 1, minWidth: 170, cellRenderer: MilestoneLinkCell },
      { headerName: 'Verdict', field: 'verdict', width: 120, cellRenderer: VerdictCell },
      { headerName: 'Confidence', field: 'confidence', width: 145, cellRenderer: ConfidenceCell },
      { headerName: 'Model', field: 'model', width: 200, cellRenderer: MonoCell },
      {
        headerName: 'Tokens',
        colId: 'tokens',
        width: 105,
        type: 'rightAligned',
        valueGetter: (p) => (p.data?.promptTokens === null && p.data?.completionTokens === null ? null : (p.data?.promptTokens ?? 0) + (p.data?.completionTokens ?? 0)),
        valueFormatter: (p) => (p.value === null || p.value === undefined ? '—' : String(p.value)),
      },
      { headerName: 'Latency', field: 'latencyMs', width: 105, type: 'rightAligned', valueFormatter: (p) => (p.value === null || p.value === undefined ? '—' : `${p.value} ms`) },
      {
        headerName: 'Hash',
        field: 'hash',
        width: 150,
        cellRenderer: (p: ICellRendererParams<AgentDecisionDTO, string>) => <CopyText value={p.value} display={shortHash(p.value)} />,
      },
      {
        headerName: 'Prev hash',
        field: 'prevHash',
        width: 150,
        cellRenderer: (p: ICellRendererParams<AgentDecisionDTO, string>) => <CopyText value={p.value} display={shortHash(p.value)} />,
      },
    ],
    [],
  );

  return (
    <>
      <GridFrame
        toolbar={
          <>
            <span className="flex items-center gap-2 text-xs text-ink-300">
              <Link2 className="size-3.5 text-iris-300" /> Append-only, SHA-256 hash-chained. Click a row for full inputs/outputs.
            </span>
            <div className="ml-auto flex items-center gap-2">
              {verify.data ? (
                verify.data.valid ? (
                  <Chip tone="success" size="sm">
                    <ShieldCheck className="size-3" /> Chain intact · {verify.data.length} records
                  </Chip>
                ) : (
                  <Chip tone="danger" size="sm">
                    <ShieldX className="size-3" /> Broken at seq {verify.data.brokenAtSeq}
                  </Chip>
                )
              ) : null}
              {verify.error ? <span className="text-xs text-rose-300">{verify.error.message}</span> : null}
              <SearchBox value={search} onChange={setSearch} placeholder="Search actions, actors…" />
              <Button size="sm" variant="secondary" loading={verify.isPending} icon={<ShieldCheck className="size-3.5" />} onClick={() => verify.mutate()}>
                Verify chain
              </Button>
            </div>
          </>
        }
      >
        <AgGridReact<AgentDecisionDTO>
          theme={arbiterGridTheme}
          rowData={decisions}
          columnDefs={columnDefs}
          defaultColDef={{ ...defaultColDef, cellDataType: false }}
          getRowId={(p) => p.data.id}
          quickFilterText={search}
          onRowClicked={(e) => e.data && setSelected(e.data)}
          rowClass="cursor-pointer"
          animateRows
          suppressCellFocus
          overlayNoRowsTemplate='<span style="color:#9aa3ba">The decision log is empty — every agent action will appear here.</span>'
        />
      </GridFrame>
      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `#${selected.seq} · ${titleCase(selected.action)}` : ''}
        description={selected ? `${selected.actor} · ${new Date(selected.createdAt).toLocaleString()}` : undefined}
      >
        {selected ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl bg-white/[0.03] p-2.5">
                <div className="text-ink-400">Inputs hash</div>
                <CopyText value={selected.inputsHash} display={shortHash(selected.inputsHash, 18)} />
              </div>
              <div className="rounded-xl bg-white/[0.03] p-2.5">
                <div className="text-ink-400">Record hash</div>
                <CopyText value={selected.hash} display={shortHash(selected.hash, 18)} />
              </div>
            </div>
            <JsonBlock value={selected.outputs} />
          </div>
        ) : null}
      </Modal>
    </>
  );
}
