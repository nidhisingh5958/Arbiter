import type { WebhookEventDTO } from '@arbiter/shared';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { useMemo } from 'react';
import { Chip } from '../ui/StatusChip';
import { arbiterGridTheme, defaultColDef } from './gridSetup';
import { GridFrame } from './GridFrame';
import { MonoCell, RelativeTimeCell } from './renderers';

export function WebhooksGrid({ events }: { events: WebhookEventDTO[] }) {
  const columnDefs = useMemo<ColDef<WebhookEventDTO>[]>(
    () => [
      { headerName: 'Received', field: 'receivedAt', width: 130, cellRenderer: RelativeTimeCell, sort: 'desc' },
      { headerName: 'Event type', field: 'eventType', flex: 1, minWidth: 250, cellRenderer: MonoCell },
      { headerName: 'Event id', field: 'id', width: 220, cellRenderer: MonoCell },
      { headerName: 'Resource', field: 'resourceId', width: 200, cellRenderer: MonoCell },
      {
        headerName: 'Signature',
        field: 'verified',
        width: 130,
        cellRenderer: (p: ICellRendererParams<WebhookEventDTO, boolean>) => (
          <Chip tone={p.value ? 'success' : 'danger'} size="sm">
            {p.value ? 'Verified' : 'Rejected'}
          </Chip>
        ),
      },
      {
        headerName: 'Processed',
        field: 'processed',
        width: 125,
        enableCellChangeFlash: true,
        cellRenderer: (p: ICellRendererParams<WebhookEventDTO, boolean>) => (
          <Chip tone={p.value ? 'success' : p.data?.error ? 'danger' : 'muted'} size="sm">
            {p.value ? 'Processed' : p.data?.error ? 'Failed' : 'Pending'}
          </Chip>
        ),
      },
      { headerName: 'Duplicates ignored', field: 'duplicateCount', width: 160, type: 'rightAligned', enableCellChangeFlash: true },
      { headerName: 'Error', field: 'error', flex: 1, minWidth: 200, tooltipField: 'error' },
    ],
    [],
  );
  return (
    <GridFrame
      toolbar={
        <span className="text-xs text-ink-300">
          Every PayPal webhook is signature-verified before processing and de-duplicated by event id (idempotent handlers).
        </span>
      }
    >
      <AgGridReact<WebhookEventDTO>
        theme={arbiterGridTheme}
        rowData={events}
        columnDefs={columnDefs}
        defaultColDef={{ ...defaultColDef, cellDataType: false }}
        getRowId={(p) => p.data.id}
        cellFlashDuration={900}
        animateRows
        suppressCellFocus
        overlayNoRowsTemplate='<span style="color:#9aa3ba">No webhook events yet.</span>'
      />
    </GridFrame>
  );
}
