import type { PaymentDTO } from '@arbiter/shared';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { Download } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { CopyText } from '../ui/CopyText';
import { Chip, type Tone } from '../ui/StatusChip';
import { arbiterGridTheme, defaultColDef } from './gridSetup';
import { FilterPill, GridFrame, SearchBox } from './GridFrame';
import { KindCell, MilestoneLinkCell, MoneyCell, PaymentStatusCell, RelativeTimeCell } from './renderers';

const SOURCE_TONE: Record<string, Tone> = { WEBHOOK: 'agent', POLL: 'info', API: 'neutral', MOCK: 'muted' };

function IdCell(p: ICellRendererParams<PaymentDTO, string | null>) {
  return <CopyText value={p.value} />;
}

function SourceCell(p: ICellRendererParams<PaymentDTO, string>) {
  return p.value ? (
    <Chip tone={SOURCE_TONE[p.value] ?? 'neutral'} size="sm">
      {p.value === 'WEBHOOK' ? 'Webhook' : p.value === 'POLL' ? 'Status poll' : p.value === 'MOCK' ? 'Simulator' : 'API'}
    </Chip>
  ) : null;
}

export function TransactionsGrid({ payments }: { payments: PaymentDTO[] }) {
  const gridRef = useRef<AgGridReact<PaymentDTO>>(null);
  const [kind, setKind] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const rows = useMemo(() => (kind === 'ALL' ? payments : payments.filter((p) => p.kind === kind)), [payments, kind]);

  const columnDefs = useMemo<ColDef<PaymentDTO>[]>(
    () => [
      { headerName: 'When', field: 'createdAt', width: 120, cellRenderer: RelativeTimeCell, sort: 'desc' },
      { headerName: 'Milestone', field: 'milestoneTitle', flex: 1, minWidth: 170, cellRenderer: MilestoneLinkCell },
      { headerName: 'Contract', field: 'contractTitle', width: 190 },
      { headerName: 'Type', field: 'kind', width: 130, cellRenderer: KindCell },
      { headerName: 'Status', field: 'status', width: 140, cellRenderer: PaymentStatusCell, enableCellChangeFlash: true },
      { headerName: 'Amount', field: 'amountCents', width: 120, cellRenderer: MoneyCell, type: 'rightAligned' },
      { headerName: 'Fee', field: 'feeCents', width: 100, cellRenderer: MoneyCell, enableCellChangeFlash: true, type: 'rightAligned' },
      {
        headerName: 'Net',
        colId: 'net',
        width: 120,
        type: 'rightAligned',
        valueGetter: (p) => (p.data && p.data.kind === 'CAPTURE' && p.data.feeCents !== null ? p.data.amountCents - p.data.feeCents : null),
        cellRenderer: MoneyCell,
      },
      { headerName: 'PayPal order', field: 'paypalOrderId', width: 190, cellRenderer: IdCell },
      { headerName: 'Capture / auth', colId: 'capture', width: 190, valueGetter: (p) => p.data?.paypalCaptureId ?? p.data?.paypalAuthorizationId ?? null, cellRenderer: IdCell },
      { headerName: 'Payout batch', field: 'payoutBatchId', width: 190, cellRenderer: IdCell, enableCellChangeFlash: true },
      { headerName: 'Payout item', field: 'payoutItemId', width: 180, cellRenderer: IdCell, enableCellChangeFlash: true },
      { headerName: 'Refund', field: 'refundId', width: 170, cellRenderer: IdCell },
      { headerName: 'Source', field: 'source', width: 130, cellRenderer: SourceCell, enableCellChangeFlash: true },
      { headerName: 'Last webhook event', field: 'lastEventId', width: 210, cellRenderer: IdCell },
      { headerName: 'Updated', field: 'updatedAt', width: 120, cellRenderer: RelativeTimeCell },
    ],
    [],
  );

  return (
    <GridFrame
      toolbar={
        <>
          {['ALL', 'ORDER', 'CAPTURE', 'AUTHORIZATION', 'PAYOUT', 'REFUND'].map((k) => (
            <FilterPill key={k} active={kind === k} onClick={() => setKind(k)}>
              {k === 'ALL' ? 'All' : k.charAt(0) + k.slice(1).toLowerCase()}
            </FilterPill>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <SearchBox value={search} onChange={setSearch} placeholder="Search ids, milestones…" />
            <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={() => gridRef.current?.api.exportDataAsCsv({ fileName: 'arbiterai-transactions.csv' })}>
              CSV
            </Button>
          </div>
        </>
      }
    >
      <AgGridReact<PaymentDTO>
        ref={gridRef}
        theme={arbiterGridTheme}
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={{ ...defaultColDef, cellDataType: false }}
        getRowId={(p) => p.data.id}
        quickFilterText={search}
        cellFlashDuration={900}
        animateRows
        suppressCellFocus
        overlayNoRowsTemplate='<span style="color:#9aa3ba">No PayPal transactions yet — fund a milestone to create the first order.</span>'
      />
    </GridFrame>
  );
}
