"use client";

import { useRef, forwardRef, useImperativeHandle, useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, IFilterComp, IFilterParams } from "ag-grid-community";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import { useTheme } from "@/lib/useTheme";

ModuleRegistry.registerModules([AllCommunityModule]);

export type ColumnFilterModel = Record<string, { values: string[] }>;

interface DynamicTableProps {
  data: any[];
  schemaColumns: string[];
  primaryKey: string;
  tableName: string;
  connectionId: string;
  onEdit: (row: any) => void;
  onDelete: (id: string) => void;
  canEdit?: boolean;
  onFilterChanged?: (model: ColumnFilterModel | null) => void;
}

// ── Custom filter (vanilla AG Grid, works alongside React renderers) ─────────
class ColumnFilterComp implements IFilterComp {
  private eGui!: HTMLDivElement;
  private params!: IFilterParams & { connectionId: string; tableName: string; colName: string };
  private selectedValues: Set<string> = new Set();
  private allValues: string[] = [];
  private searchText = "";
  private isLoaded = false;

  init(params: IFilterParams & { connectionId: string; tableName: string; colName: string }) {
    this.params = params;
    this.eGui = document.createElement("div");
    this.render();
    this.loadValues();
  }

  private async loadValues() {
    if (this.isLoaded) return;
    try {
      const res = await fetch(
        `/api/connections/${this.params.connectionId}/tables/${this.params.tableName}/distinct?column=${this.params.colName}`
      );
      const json = await res.json();
      this.allValues = json.values || [];
      this.isLoaded = true;
      this.render();
    } catch { /* ignore */ }
  }

  private render() {
    const wasSearchFocused = document.activeElement === this.eGui.querySelector<HTMLInputElement>("#filter-search");

    const filtered = this.allValues.filter(v =>
      v.toLowerCase().includes(this.searchText.toLowerCase())
    );

    this.eGui.innerHTML = `
      <div style="padding:10px;min-width:220px;max-width:280px;background:var(--surface-raised);border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
        <div style="display:flex;align-items:center;gap:6px;background:var(--surface-solid);border:1px solid rgba(59,130,246,0.3);border-radius:6px;padding:6px 8px;margin-bottom:8px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="color:var(--text-secondary)" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input id="filter-search" type="text" placeholder="Search values..." value="${this.searchText}"
            style="background:none;border:none;outline:none;color:var(--text-primary);font-size:12px;width:100%;"/>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <button id="select-all" style="font-size:11px;color:#3b82f6;background:none;border:none;cursor:pointer;padding:0;">Select all</button>
          <button id="clear-all" style="font-size:11px;color:var(--text-secondary);background:none;border:none;cursor:pointer;padding:0;">Clear</button>
        </div>
        <div id="values-list" style="max-height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;">
          ${!this.isLoaded
            ? `<div style="color:var(--text-muted);font-size:12px;padding:8px 0;text-align:center;">Loading…</div>`
            : filtered.length === 0
            ? `<div style="color:var(--text-muted);font-size:12px;padding:8px 0;text-align:center;">No values found</div>`
            : filtered.map(v => `
              <label style="display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:4px;cursor:pointer;"
                onmouseenter="this.style.background='rgba(59,130,246,0.1)'"
                onmouseleave="this.style.background='transparent'">
                <input type="checkbox" value="${v.replace(/"/g, "&quot;")}" ${this.selectedValues.has(v) ? "checked" : ""}
                  style="accent-color:#3b82f6;cursor:pointer;" class="val-cb"/>
                <span style="color:var(--text-primary);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                  title="${v.replace(/"/g, "&quot;")}">${v.length > 30 ? v.slice(0, 30) + "…" : v}</span>
              </label>`).join("")
          }
        </div>
        ${this.selectedValues.size > 0
          ? `<div style="margin-top:6px;font-size:11px;color:var(--text-muted);">${this.selectedValues.size} selected</div>`
          : ""}
      </div>`;

    const searchInput = this.eGui.querySelector<HTMLInputElement>("#filter-search");
    if (searchInput) {
      searchInput.addEventListener("input", e => {
        this.searchText = (e.target as HTMLInputElement).value;
        this.render();
      });
      if (wasSearchFocused) {
        searchInput.focus();
        searchInput.setSelectionRange(this.searchText.length, this.searchText.length);
      }
    }

    this.eGui.querySelector("#select-all")?.addEventListener("click", () => {
      filtered.forEach(v => this.selectedValues.add(v));
      this.render();
      this.params.filterChangedCallback();
    });

    this.eGui.querySelector("#clear-all")?.addEventListener("click", () => {
      this.selectedValues.clear();
      this.render();
      this.params.filterChangedCallback();
    });

    this.eGui.querySelectorAll<HTMLInputElement>(".val-cb").forEach(cb => {
      cb.addEventListener("change", () => {
        if (cb.checked) this.selectedValues.add(cb.value);
        else this.selectedValues.delete(cb.value);
        this.render();
        this.params.filterChangedCallback();
      });
    });
  }

  getGui() { return this.eGui; }

  doesFilterPass(params: any) {
    if (this.selectedValues.size === 0) return true;
    const v = params.data[this.params.colName];
    const str = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return this.selectedValues.has(str);
  }

  isFilterActive() { return this.selectedValues.size > 0; }

  getModel() {
    return this.selectedValues.size > 0 ? { values: Array.from(this.selectedValues) } : null;
  }

  setModel(model: { values: string[] } | null) {
    this.selectedValues = new Set(model?.values ?? []);
    this.render();
  }
}

// ── React cell renderers ─────────────────────────────────────────────────────
function cellText(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "string" && value.length > 20 && !isNaN(Date.parse(value)))
    return new Date(value).toLocaleString();
  return String(value);
}

function DataCell({ value }: { value: any }) {
  const isNull = value === null || value === undefined;
  const isObj  = !isNull && typeof value === "object";
  const text   = isNull ? "null" : cellText(value);

  return (
    <span
      title={text}
      style={{
        display: "block",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        color: isNull ? "#475569" : isObj ? "#94a3b8" : "inherit",
        fontFamily: isObj ? "monospace" : "inherit",
        fontSize: isObj ? "11px" : "inherit",
      }}
    >
      {text}
    </span>
  );
}

function EditSvg() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" strokeWidth="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
}

function DeleteSvg() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--danger-color)" strokeWidth="2">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
    </svg>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export interface DynamicTableHandle {
  clearFilters: () => void;
}

const DynamicTable = forwardRef<DynamicTableHandle, DynamicTableProps>(function DynamicTable({
  data,
  schemaColumns,
  primaryKey,
  tableName,
  connectionId,
  onEdit,
  onDelete,
  canEdit = true,
  onFilterChanged,
}, ref) {
  const theme = useTheme();
  const gridRef = useRef<AgGridReact>(null);
  const onEditRef = useRef(onEdit);
  onEditRef.current = onEdit;
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;
  const onFilterChangedRef = useRef(onFilterChanged);
  onFilterChangedRef.current = onFilterChanged;

  useImperativeHandle(ref, () => ({
    clearFilters: () => {
      gridRef.current?.api?.setFilterModel(null);
      // AG Grid doesn't reliably fire onFilterChanged for setFilterModel()
      // with this custom filter component, so notify the parent directly
      // rather than depending on that event.
      onFilterChangedRef.current?.(null);
    },
  }));

  if (!schemaColumns || schemaColumns.length === 0) {
    return <div className="empty-state"><p>Could not load table schema.</p></div>;
  }

  const columnDefs = useMemo<ColDef[]>(() => [
    ...schemaColumns.map(col => ({
      field: col,
      headerName: col.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      resizable: true,
      sortable: true,
      filter: ColumnFilterComp,
      filterParams: { connectionId, tableName, colName: col },
      minWidth: 120,
      flex: 1,
      cellRenderer: (params: any) => <DataCell value={params.value} />,
    })),
    ...(!canEdit ? [] : [{
      headerName: "Actions",
      field: "__actions",
      pinned: "right" as const,
      lockPinned: true,
      suppressMovable: true,
      filter: false,
      sortable: false,
      resizable: false,
      width: 100,
      cellRenderer: (params: any) => (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px", height: "100%" }}>
          <button
            className="btn btn-icon btn-outline"
            title="Edit"
            onClick={() => onEditRef.current(params.data)}
          >
            <EditSvg />
          </button>
          <button
            className="btn btn-icon btn-outline"
            title="Delete"
            style={{ borderColor: "rgba(239,68,68,0.3)" }}
            onClick={() => onDeleteRef.current(params.data[primaryKey])}
          >
            <DeleteSvg />
          </button>
        </div>
      ),
    }]),
  ], [schemaColumns, tableName, connectionId, primaryKey, canEdit]);

  const defaultColDef: ColDef = {
    resizable: true,
    sortable: true,
    suppressHeaderMenuButton: false,
    menuTabs: ["filterMenuTab"],
    cellStyle: { overflow: "hidden", display: "flex", alignItems: "center", padding: "0 12px" },
  };

  return (
    <div
      className={`${theme === "light" ? "ag-theme-alpine" : "ag-theme-alpine-dark"} dbx-grid`}
      style={{ width: "100%", height: "calc(100vh - 280px)", minHeight: 400 }}
    >
      <AgGridReact
        ref={gridRef}
        rowData={data}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        theme="legacy"
        rowHeight={44}
        headerHeight={44}
        animateRows={true}
        suppressColumnVirtualisation={false}
        enableCellTextSelection={true}
        tooltipShowDelay={300}
        onFilterChanged={() => {
          const model = gridRef.current?.api?.getFilterModel() as ColumnFilterModel | undefined;
          onFilterChanged?.(model && Object.keys(model).length > 0 ? model : null);
        }}
      />
    </div>
  );
});

export default DynamicTable;
