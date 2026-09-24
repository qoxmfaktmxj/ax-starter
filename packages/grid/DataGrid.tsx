"use client";

import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  type GridApi,
  type IDatasource,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type RefObject,
} from "react";
import { employeeGridTheme } from "./theme";
import "./grid.css";

ModuleRegistry.registerModules([AllCommunityModule]);

export type GridColumnKind = "text" | "date" | "status" | "decimal";

export interface GridColumn {
  field: string;
  label: string;
  kind: GridColumnKind;
  editable: boolean;
}

export interface GridSort {
  field: string;
  direction: "asc" | "desc";
}

interface SharedGridProps {
  columns: GridColumn[];
  onCellChange: (rowId: string, field: string, value: unknown) => void;
  onSelectedIdsChange: (ids: string[]) => void;
  onEditingChanged?: (editing: boolean) => void;
  commitEditingRef?: RefObject<(() => void) | null>;
  loading?: boolean;
  focusTarget?: { rowId: string; field?: string; nonce: number } | null;
}

export interface BrowseGridProps<
  TRow extends { id: string },
> extends SharedGridProps {
  mode: "browse";
  loadRows: (
    startRow: number,
    endRow: number,
    sort: GridSort[],
  ) => Promise<{ rows: TRow[]; total: number }>;
  rows?: never;
}

export interface BatchEditGridProps<
  TRow extends { id: string },
> extends SharedGridProps {
  mode: "batch-edit";
  rows: TRow[];
  loadRows?: never;
}

export type DataGridProps<TRow extends { id: string }> =
  | BrowseGridProps<TRow>
  | BatchEditGridProps<TRow>;

export function DataGrid<TRow extends { id: string }>(
  props: DataGridProps<TRow>,
) {
  const [gridApi, setGridApi] = useState<GridApi<TRow> | null>(null);
  const columns = useMemo<ColDef<TRow>[]>(
    () =>
      props.columns.map((column) => ({
        field: column.field as ColDef<TRow>["field"],
        colId: String(column.field),
        headerName: column.label,
        editable: props.mode === "batch-edit" && column.editable,
        sortable: props.mode === "browse",
        valueFormatter:
          column.kind === "status"
            ? ({ value }) =>
                value === "ACTIVE"
                  ? "재직"
                  : value === "LEAVE"
                    ? "휴직"
                    : String(value ?? "")
            : undefined,
        cellEditor: column.kind === "status" ? "agSelectCellEditor" : undefined,
        cellEditorParams:
          column.kind === "status"
            ? { values: ["ACTIVE", "LEAVE"] }
            : undefined,
        cellClass: `gridCell gridCell--${column.kind}`,
        minWidth:
          column.field === "monthlySalary"
            ? 190
            : column.field === "email"
              ? 220
              : column.field === "orgName"
                ? 180
                : column.kind === "date"
                  ? 120
                  : column.kind === "status"
                    ? 90
                    : 110,
        tooltipField: column.field as ColDef<TRow>["field"],
        flex: 1,
      })),
    [props.columns, props.mode],
  );
  const defaultColDef = useMemo<ColDef<TRow>>(
    () => ({ resizable: true, sortable: props.mode === "browse" }),
    [props.mode],
  );
  const rowSelection = useMemo(
    () => ({
      mode: "multiRow" as const,
      checkboxes: true,
      headerCheckbox: false,
      enableClickSelection: false,
    }),
    [],
  );
  const loadRows = props.mode === "browse" ? props.loadRows : undefined;

  const onSelectionChanged = useCallback(() => {
    props.onSelectedIdsChange(
      gridApi?.getSelectedRows().map((row) => row.id) ?? [],
    );
  }, [gridApi, props.onSelectedIdsChange]);

  const onCellEditRequest = useCallback(
    (event: { data?: TRow; colDef: { field?: string }; newValue: unknown }) => {
      const field = event.colDef.field;
      if (event.data && field)
        props.onCellChange(event.data.id, field, event.newValue);
    },
    [props.onCellChange],
  );

  useEffect(() => {
    if (!loadRows || !gridApi) return;

    const datasource: IDatasource = {
      getRows: (request) => {
        const sort = request.sortModel.map(({ colId, sort }) => ({
          field: colId,
          direction: sort,
        }));
        void loadRows(request.startRow, request.endRow, sort)
          .then(({ rows, total }) => request.successCallback(rows, total))
          .catch(() => request.failCallback());
      },
    };
    gridApi.setGridOption("datasource", datasource);
  }, [gridApi, loadRows]);

  useEffect(() => {
    if (!gridApi || !props.focusTarget) return;
    const node = gridApi.getRowNode(props.focusTarget.rowId);
    if (node?.rowIndex == null) return;
    gridApi.ensureNodeVisible(node);
    gridApi.setFocusedCell(
      node.rowIndex,
      props.focusTarget.field ?? "employeeNo",
    );
  }, [gridApi, props.focusTarget]);

  useEffect(() => {
    const ref = props.commitEditingRef;
    if (!ref) return;
    ref.current = () => gridApi?.stopEditing();
    return () => {
      ref.current = null;
    };
  }, [gridApi, props.commitEditingRef]);

  const rowData =
    props.mode === "batch-edit" ? props.rows.slice(0, 100) : undefined;

  return (
    <div className="employeeGrid" aria-label="사원 목록">
      <AgGridReact<TRow>
        key={props.mode}
        theme={employeeGridTheme}
        columnDefs={columns}
        defaultColDef={defaultColDef}
        rowModelType={props.mode === "browse" ? "infinite" : "clientSide"}
        rowData={rowData}
        cacheBlockSize={100}
        maxBlocksInCache={5}
        infiniteInitialRowCount={1}
        getRowId={({ data }) => data.id}
        rowSelection={rowSelection}
        onGridReady={({ api }) => setGridApi(api)}
        onSelectionChanged={onSelectionChanged}
        onCellEditRequest={onCellEditRequest}
        onCellEditingStarted={() => props.onEditingChanged?.(true)}
        onCellEditingStopped={() => props.onEditingChanged?.(false)}
        readOnlyEdit
        singleClickEdit={false}
        cellSelection={false}
        suppressClipboardPaste
        loading={props.loading}
        overlayNoRowsTemplate="<span>표시할 사원이 없습니다.</span>"
      />
    </div>
  );
}
