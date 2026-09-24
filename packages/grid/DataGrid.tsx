"use client";

import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  type CellFocusedEvent,
  type CellMouseDownEvent,
  type CellMouseOverEvent,
  type GridApi,
  type IDatasource,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { parseGridClipboard, serializeGridClipboard } from "./clipboard";
import { fillGridSeries } from "./fill";
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

export interface GridCellChange {
  rowId: string;
  field: string;
  value: string;
}

type GridPoint = { row: number; column: number };
type GridRange = { start: GridPoint; end: GridPoint };

function rangeBounds(range: GridRange) {
  return {
    top: Math.min(range.start.row, range.end.row),
    bottom: Math.max(range.start.row, range.end.row),
    left: Math.min(range.start.column, range.end.column),
    right: Math.max(range.start.column, range.end.column),
  };
}

interface SharedGridProps {
  columns: GridColumn[];
  onCellChange: (rowId: string, field: string, value: unknown) => void;
  onSelectedIdsChange: (ids: string[]) => void;
  onEditingChanged?: (editing: boolean) => void;
  commitEditingRef?: RefObject<(() => void) | null>;
  loading?: boolean;
  focusTarget?: { rowId: string; field?: string; nonce: number } | null;
  onGridMessage?: (message: string, isError: boolean) => void;
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
  onCellsChange: (changes: GridCellChange[]) => void;
  onUndo: () => void;
  onRedo: () => void;
}

export type DataGridProps<TRow extends { id: string }> =
  | BrowseGridProps<TRow>
  | BatchEditGridProps<TRow>;

export function DataGrid<TRow extends { id: string }>(
  props: DataGridProps<TRow>,
) {
  const [gridApi, setGridApi] = useState<GridApi<TRow> | null>(null);
  const selection = useRef<GridRange | null>(null);
  const selectionFrame = useRef<number | null>(null);
  const previousSelection = useRef<GridRange | null>(null);
  const rowOrder = useRef<string | null>(null);
  const dragging = useRef(false);
  const fillSeed = useRef<{ range: GridRange; values: string[][] } | null>(
    null,
  );
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
        cellClassRules: {
          "gridCell--selected": (params) => {
            if (!selection.current || params.node.rowIndex == null)
              return false;
            const bounds = rangeBounds(selection.current);
            const index = params.api
              .getAllDisplayedColumns()
              .filter((item) => item.getColDef().field)
              .findIndex(
                (item) => item.getColId() === params.column.getColId(),
              );
            return (
              params.node.rowIndex >= bounds.top &&
              params.node.rowIndex <= bounds.bottom &&
              index >= bounds.left &&
              index <= bounds.right
            );
          },
          "gridCell--rangeEnd": (params) => {
            if (
              props.mode !== "batch-edit" ||
              !selection.current ||
              params.node.rowIndex == null
            )
              return false;
            const bounds = rangeBounds(selection.current);
            const displayed = params.api
              .getAllDisplayedColumns()
              .filter((item) => item.getColDef().field);
            return (
              params.node.rowIndex === bounds.bottom &&
              displayed[bounds.right]?.getColId() === params.column.getColId()
            );
          },
        },
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

  const displayedColumns = useCallback(
    () =>
      gridApi
        ?.getAllDisplayedColumns()
        .filter((column) =>
          props.columns.some((item) => item.field === column.getColDef().field),
        ) ?? [],
    [gridApi, props.columns],
  );

  function setRange(next: GridRange | null) {
    if (!gridApi) return;
    const bounds = next && rangeBounds(next);
    if (
      bounds &&
      (bounds.bottom - bounds.top + 1) * (bounds.right - bounds.left + 1) > 1000
    )
      return;
    if (selectionFrame.current === null)
      previousSelection.current = selection.current;
    selection.current = next;
    if (selectionFrame.current !== null) return;
    selectionFrame.current = window.requestAnimationFrame(() => {
      selectionFrame.current = null;
      const rows = new Set<number>();
      for (const range of [previousSelection.current, selection.current]) {
        if (!range) continue;
        const { top, bottom } = rangeBounds(range);
        for (let index = top; index <= bottom; index++) rows.add(index);
      }
      const rowNodes = [...rows]
        .map((index) => gridApi.getDisplayedRowAtIndex(index))
        .filter((row) => row != null);
      if (rowNodes.length) gridApi.refreshCells({ rowNodes, force: true });
    });
  }

  function selectedTable(range = selection.current): string[][] {
    if (!range || !gridApi) throw new Error("복사할 셀을 선택하세요.");
    const { top, bottom, left, right } = rangeBounds(range);
    const visible = displayedColumns();
    const table: string[][] = [];
    for (let rowIndex = top; rowIndex <= bottom; rowIndex++) {
      const row = gridApi.getDisplayedRowAtIndex(rowIndex)?.data;
      if (!row) throw new Error("아직 불러오지 않은 행은 복사할 수 없습니다.");
      table.push(
        visible.slice(left, right + 1).map((column) => {
          const field = column.getColDef().field ?? "";
          const value = (row as Record<string, unknown>)[field];
          if (
            props.columns.find((item) => item.field === field)?.kind ===
            "status"
          )
            return value === "ACTIVE"
              ? "재직"
              : value === "LEAVE"
                ? "휴직"
                : String(value ?? "");
          return String(value ?? "");
        }),
      );
    }
    return table;
  }

  function applyCells(
    targets: { row: number; column: number; value: string }[],
  ) {
    if (props.mode !== "batch-edit" || props.loading)
      throw new Error("지금은 붙여넣을 수 없습니다.");
    const visible = displayedColumns();
    const changes: GridCellChange[] = targets.map(({ row, column, value }) => {
      const data = gridApi?.getDisplayedRowAtIndex(row)?.data;
      const field = visible[column]?.getColDef().field;
      if (
        !data ||
        !field ||
        !props.columns.find((item) => item.field === field)?.editable
      )
        throw new Error(
          "편집할 수 없는 셀이 포함돼 있습니다. 변경하지 않았습니다.",
        );
      return { rowId: data.id, field, value };
    });
    props.onCellsChange(changes);
    props.onGridMessage?.(
      `${changes.length}개 셀을 초안에 반영했습니다. 저장하면 확정됩니다.`,
      false,
    );
  }

  function onCopy(event: ClipboardEvent<HTMLDivElement>) {
    if (
      (event.target as HTMLElement).closest(
        "input,textarea,select,[contenteditable=true]",
      )
    )
      return;
    if (
      !(event.target as HTMLElement).closest(".ag-cell") ||
      !selection.current
    )
      return;
    try {
      const text = serializeGridClipboard(selectedTable());
      event.preventDefault();
      event.clipboardData.setData("text/plain", text);
      props.onGridMessage?.("선택한 셀을 복사했습니다.", false);
    } catch (error) {
      event.preventDefault();
      props.onGridMessage?.(
        error instanceof Error ? error.message : "복사하지 못했습니다.",
        true,
      );
    }
  }

  function onPaste(event: ClipboardEvent<HTMLDivElement>) {
    if (
      (event.target as HTMLElement).closest(
        "input,textarea,select,[contenteditable=true]",
      )
    )
      return;
    if (
      !(event.target as HTMLElement).closest(".ag-cell") ||
      !selection.current
    )
      return;
    event.preventDefault();
    try {
      const table = parseGridClipboard(
        event.clipboardData.getData("text/plain"),
      );
      const { top, bottom, left, right } = rangeBounds(selection.current);
      const height = bottom - top + 1;
      const width = right - left + 1;
      const scalar = table.length === 1 && table[0].length === 1;
      if (
        !scalar &&
        (height !== 1 || width !== 1) &&
        (table.length !== height || table[0].length !== width)
      )
        throw new Error("복사한 데이터와 선택 범위의 크기가 다릅니다.");
      const rowCount = scalar ? height : table.length;
      const columnCount = scalar ? width : table[0].length;
      if (
        top + rowCount > (gridApi?.getDisplayedRowCount() ?? 0) ||
        left + columnCount > displayedColumns().length
      )
        throw new Error("붙여넣을 범위가 현재 행이나 열을 벗어납니다.");
      const targets = Array.from({ length: rowCount }, (_, row) =>
        Array.from({ length: columnCount }, (_, column) => ({
          row: top + row,
          column: left + column,
          value: scalar ? table[0][0] : table[row][column],
        })),
      ).flat();
      applyCells(targets);
    } catch (error) {
      props.onGridMessage?.(
        error instanceof Error ? error.message : "붙여넣지 못했습니다.",
        true,
      );
    }
  }

  function onCellMouseDown(event: CellMouseDownEvent<TRow>) {
    const mouse = event.event as MouseEvent | undefined;
    if (
      !mouse ||
      mouse.button !== 0 ||
      event.rowIndex == null ||
      event.node.rowPinned
    )
      return;
    if (
      (mouse.target as HTMLElement).closest(
        "input,button,select,textarea,[contenteditable=true]",
      )
    )
      return;
    const column = displayedColumns().findIndex(
      (item) => item.getColId() === event.column.getColId(),
    );
    if (column < 0) return;
    const point = { row: event.rowIndex, column };
    const old = selection.current;
    if (props.mode === "batch-edit" && old && !props.loading) {
      const bounds = rangeBounds(old);
      const cell = (mouse.target as HTMLElement).closest(".ag-cell");
      const rect = cell?.getBoundingClientRect();
      if (
        rect &&
        point.row === bounds.bottom &&
        point.column === bounds.right &&
        mouse.clientX >= rect.right - 12 &&
        mouse.clientY >= rect.bottom - 12
      ) {
        try {
          fillSeed.current = { range: old, values: selectedTable(old) };
          dragging.current = true;
          return;
        } catch (error) {
          props.onGridMessage?.(
            error instanceof Error
              ? error.message
              : "자동 채우기를 시작하지 못했습니다.",
            true,
          );
        }
      }
    }
    setRange({ start: mouse.shiftKey && old ? old.start : point, end: point });
    dragging.current = true;
  }

  function onCellMouseOver(event: CellMouseOverEvent<TRow>) {
    const mouse = event.event as MouseEvent | undefined;
    if (
      !dragging.current ||
      mouse?.buttons !== 1 ||
      !selection.current ||
      event.rowIndex == null
    )
      return;
    const column = displayedColumns().findIndex(
      (item) => item.getColId() === event.column.getColId(),
    );
    if (column < 0) return;
    const seed = fillSeed.current;
    if (seed) {
      const { top, bottom, left, right } = rangeBounds(seed.range);
      if (event.rowIndex > bottom && column >= left && column <= right)
        setRange({
          start: { row: top, column: left },
          end: { row: event.rowIndex, column: right },
        });
      else if (
        column > right &&
        event.rowIndex >= top &&
        event.rowIndex <= bottom
      )
        setRange({
          start: { row: top, column: left },
          end: { row: bottom, column },
        });
      return;
    }
    setRange({ ...selection.current, end: { row: event.rowIndex, column } });
  }

  function onCellFocused(event: CellFocusedEvent<TRow>) {
    if (dragging.current || event.rowIndex == null) return;
    const columnId =
      typeof event.column === "string"
        ? event.column
        : event.column?.getColId();
    const column = displayedColumns().findIndex(
      (item) => item.getColId() === columnId,
    );
    if (column >= 0)
      setRange({
        start: { row: event.rowIndex, column },
        end: { row: event.rowIndex, column },
      });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (props.mode !== "batch-edit" || !(event.ctrlKey || event.metaKey))
      return;
    if (
      (event.target as HTMLElement).closest(
        "input,textarea,select,[contenteditable=true]",
      )
    )
      return;
    const key = event.key.toLowerCase();
    if (key !== "z" && key !== "y") return;
    event.preventDefault();
    if (key === "y" || event.shiftKey) props.onRedo();
    else props.onUndo();
  }

  const releaseRef = useRef<() => void>(() => {});
  releaseRef.current = () => {
    dragging.current = false;
    const seed = fillSeed.current;
    fillSeed.current = null;
    if (!seed || !selection.current) return;
    const before = rangeBounds(seed.range);
    const after = rangeBounds(selection.current);
    const visible = displayedColumns();
    const targets: { row: number; column: number; value: string }[] = [];
    try {
      if (
        after.bottom > before.bottom &&
        after.left === before.left &&
        after.right === before.right
      ) {
        for (let column = before.left; column <= before.right; column++) {
          const field = visible[column]?.getColDef().field;
          const kind = props.columns.find((item) => item.field === field)?.kind;
          if (!kind) throw new Error("자동 채우기 열을 확인할 수 없습니다.");
          const values = seed.values.map((row) => row[column - before.left]);
          for (let row = before.bottom + 1; row <= after.bottom; row++)
            targets.push({
              row,
              column,
              value: fillGridSeries(values, row - before.top, kind),
            });
        }
      } else if (
        after.right > before.right &&
        after.top === before.top &&
        after.bottom === before.bottom
      ) {
        const kinds = visible
          .slice(before.left, after.right + 1)
          .map(
            (column) =>
              props.columns.find(
                (item) => item.field === column.getColDef().field,
              )?.kind,
          );
        if (kinds.some((kind) => kind !== kinds[0]))
          throw new Error(
            "서로 다른 종류의 열은 가로로 자동 채울 수 없습니다.",
          );
        for (let row = before.top; row <= before.bottom; row++) {
          const values = seed.values[row - before.top];
          for (let column = before.right + 1; column <= after.right; column++)
            targets.push({
              row,
              column,
              value: fillGridSeries(values, column - before.left, kinds[0]!),
            });
        }
      }
      if (targets.length) applyCells(targets);
    } catch (error) {
      props.onGridMessage?.(
        error instanceof Error ? error.message : "자동 채우기에 실패했습니다.",
        true,
      );
      setRange(seed.range);
    }
  };

  useEffect(() => {
    const release = () => releaseRef.current();
    window.addEventListener("mouseup", release);
    return () => {
      window.removeEventListener("mouseup", release);
      if (selectionFrame.current !== null)
        window.cancelAnimationFrame(selectionFrame.current);
    };
  }, []);

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
    <div
      className="employeeGrid"
      aria-label="사원 목록"
      onCopyCapture={onCopy}
      onPasteCapture={onPaste}
      onKeyDownCapture={onKeyDown}
    >
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
        onCellMouseDown={onCellMouseDown}
        onCellMouseOver={onCellMouseOver}
        onCellFocused={onCellFocused}
        onSortChanged={() => setRange(null)}
        onRowDataUpdated={() => {
          if (props.mode !== "batch-edit") return;
          const ids = props.rows.map((row) => row.id).join("|");
          if (rowOrder.current !== null && rowOrder.current !== ids) {
            fillSeed.current = null;
            setRange(null);
          }
          rowOrder.current = ids;
        }}
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
