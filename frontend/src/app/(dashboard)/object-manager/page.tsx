"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import {
  ApiError,
  apiPath,
  ATTR_TYPES,
  createDataModel,
  deleteDataModel,
  listColumns,
  listDataModels,
  listSchemas,
  listTables,
  normalizePgType,
  type AttrType,
  type DataModel,
  type DataModelAttribute,
  type DbColumn,
} from "@/lib/api";

const SYSTEM_COLS = new Set(["id", "raw_payload", "created_at", "updated_at"]);
// MDP forbids attribute names that collide with system columns -> rename, keep source_column.
const attrName = (col: string) => (SYSTEM_COLS.has(col) ? `source_${col}` : col);

type RowA = { name: string; data_type: AttrType; key: boolean };

export default function DataModelsPage() {
  const [models, setModels] = useState<DataModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState<DataModel | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setModels(await listDataModels());
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  // Create form state
  const [kind, setKind] = useState<"A" | "B">("B");
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [rowsA, setRowsA] = useState<RowA[]>([{ name: "", data_type: "text", key: true }]);
  // Type B
  const [schemas, setSchemas] = useState<string[]>([]);
  const [bSchema, setBSchema] = useState("");
  const [tables, setTables] = useState<string[]>([]);
  const [bTable, setBTable] = useState("");
  const [cols, setCols] = useState<DbColumn[]>([]);
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [pkCol, setPkCol] = useState("");
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  function openNew() {
    setKind("B");
    setName("");
    setDisplayName("");
    setRowsA([{ name: "", data_type: "text", key: true }]);
    setBSchema("");
    setBTable("");
    setTables([]);
    setCols([]);
    setIncluded({});
    setPkCol("");
    setFormErr(null);
    setOpen(true);
    if (schemas.length === 0)
      listSchemas()
        .then((s) => {
          setSchemas(s);
          const first = s.includes("mdp_staging") ? "mdp_staging" : s[0] || "";
          setBSchema(first);
        })
        .catch((e) => setFormErr(e instanceof ApiError ? e.message : String(e)));
    else setBSchema(schemas.includes("mdp_staging") ? "mdp_staging" : schemas[0] || "");
  }

  // load tables when schema changes (Type B)
  useEffect(() => {
    if (!open || kind !== "B" || !bSchema) return;
    setTables([]);
    setBTable("");
    setCols([]);
    setIncluded({});
    setPkCol("");
    listTables(bSchema)
      .then((t) => setTables(t.map((x) => x.table_name)))
      .catch((e) => setFormErr(e instanceof ApiError ? e.message : String(e)));
  }, [open, kind, bSchema]);

  // load columns when table chosen (Type B) -> default-include all, PK = first
  useEffect(() => {
    if (!open || kind !== "B" || !bSchema || !bTable) return;
    listColumns(bSchema, bTable)
      .then((c) => {
        setCols(c);
        const inc: Record<string, boolean> = {};
        c.forEach((col) => (inc[col.column_name] = true));
        setIncluded(inc);
        setPkCol(c[0]?.column_name || "");
      })
      .catch((e) => setFormErr(e instanceof ApiError ? e.message : String(e)));
  }, [open, kind, bSchema, bTable]);

  function setRowA(i: number, patch: Partial<RowA>) {
    setRowsA((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  function setKeyA(i: number) {
    setRowsA((rs) => rs.map((r, j) => ({ ...r, key: j === i })));
  }

  async function save() {
    setFormErr(null);
    const slug = name.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]*$/.test(slug)) {
      setFormErr("Name must be snake_case (start with a letter; [a-z0-9_]).");
      return;
    }
    let attributes: DataModelAttribute[];
    let primary_key: string;
    if (kind === "A") {
      const rs = rowsA.filter((r) => r.name.trim());
      if (rs.length === 0) {
        setFormErr("Add at least one attribute.");
        return;
      }
      const keyRow = rs.find((r) => r.key) || rs[0];
      attributes = rs.map((r) => ({
        name: r.name.trim(),
        data_type: r.data_type,
        is_primary_key: r === keyRow,
      }));
      primary_key = keyRow.name.trim();
    } else {
      const chosen = cols.filter((c) => included[c.column_name]);
      if (!bSchema || !bTable || chosen.length === 0) {
        setFormErr("Pick a source table and at least one column.");
        return;
      }
      if (!pkCol || !included[pkCol]) {
        setFormErr("Choose a primary-key column (and keep it included).");
        return;
      }
      attributes = chosen.map((c) => ({
        name: attrName(c.column_name),
        data_type: normalizePgType(c.data_type),
        source_schema: bSchema,
        source_table: bTable,
        source_column: c.column_name,
        is_primary_key: c.column_name === pkCol,
      }));
      primary_key = attrName(pkCol);
    }

    setBusy(true);
    try {
      await createDataModel({
        name: slug,
        display_name: displayName.trim() || slug,
        type: kind,
        primary_key,
        attributes,
      });
      setOpen(false);
      await reload();
    } catch (e) {
      setFormErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!del) return;
    setBusy(true);
    try {
      await deleteDataModel(del.id);
      setDel(null);
      await reload();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Data Models"
        subtitle={`Public API: ${apiPath("/data-models")} · Backend route: /data-models.`}
        action={<Button onClick={openNew}>New Data Model</Button>}
      />
      {err && <p className="mb-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
      <Card>
        <CardHeader title="All data models" subtitle={`${models.length} total`} />
        <CardBody>
          {loading ? (
            <p className="text-sm text-neutral-400">Loading...</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Display</TH>
                  <TH>Type</TH>
                  <TH>Source / Table</TH>
                  <TH>Attrs</TH>
                  <TH>Status</TH>
                  <TH>Actions</TH>
                </TR>
              </THead>
              <TBody>
                {models.map((m) => (
                  <TR key={m.id}>
                    <TD className="font-mono text-xs">{m.name}</TD>
                    <TD>{m.display_name || "-"}</TD>
                    <TD>
                      <Badge tone={m.type === "A" ? "success" : "info"}>
                        {m.type === "A" ? "Type A" : "Type B"}
                      </Badge>
                    </TD>
                    <TD className="font-mono text-xs">
                      {m.type === "A"
                        ? m.generated_table || "-"
                        : m.source_schema && m.source_table
                          ? `${m.source_schema}.${m.source_table}`
                          : "-"}
                    </TD>
                    <TD className="tabular-nums">{m.attributes?.length ?? 0}</TD>
                    <TD>
                      <Badge tone={m.status === "active" ? "success" : "neutral"}>{m.status}</Badge>
                    </TD>
                    <TD>
                      <Button size="sm" variant="ghost" onClick={() => setDel(m)}>
                        Delete
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Create modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New Data Model"
        className="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? "Saving..." : "Create"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formErr && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{formErr}</p>}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Name (snake_case)" value={name} onChange={(e) => setName(e.target.value)} placeholder="demo_supplier" />
            <Input label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Demo Supplier" />
          </div>

          {/* Data source toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setKind("B")}
              className={`flex-1 rounded-md border px-3 py-2 text-sm ${kind === "B" ? "border-brand bg-brand/10 text-brand" : "border-neutral-300 text-neutral-600"}`}
            >
              Type B - map a source table
            </button>
            <button
              type="button"
              onClick={() => setKind("A")}
              className={`flex-1 rounded-md border px-3 py-2 text-sm ${kind === "A" ? "border-brand bg-brand/10 text-brand" : "border-neutral-300 text-neutral-600"}`}
            >
              Type A - generated table
            </button>
          </div>

          {kind === "A" ? (
            <div className="space-y-2">
              <p className="text-xs text-neutral-500">Attributes (one must be the key):</p>
              {rowsA.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder="attribute_name"
                    value={r.name}
                    onChange={(e) => setRowA(i, { name: e.target.value })}
                  />
                  <Select value={r.data_type} onChange={(e) => setRowA(i, { data_type: e.target.value as AttrType })}>
                    {ATTR_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                  <label className="flex items-center gap-1 whitespace-nowrap text-xs text-neutral-600">
                    <input type="radio" name="pkA" checked={r.key} onChange={() => setKeyA(i)} /> key
                  </label>
                  <button
                    type="button"
                    className="px-2 text-neutral-400 hover:text-danger"
                    onClick={() => setRowsA((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs))}
                  >
                    x
                  </button>
                </div>
              ))}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setRowsA((rs) => [...rs, { name: "", data_type: "text", key: false }])}
              >
                + Add attribute
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Select label="Source schema" value={bSchema} onChange={(e) => setBSchema(e.target.value)}>
                  <option value="">- schema -</option>
                  {schemas.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
                <Select label="Source table" value={bTable} onChange={(e) => setBTable(e.target.value)}>
                  <option value="">- table -</option>
                  {tables.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </div>
              {cols.length > 0 && (
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-neutral-200 p-2">
                  <p className="px-1 text-xs text-neutral-500">Columns (include / primary key):</p>
                  {cols.map((c) => (
                    <div key={c.column_name} className="flex items-center gap-2 px-1 text-sm">
                      <input
                        type="checkbox"
                        checked={!!included[c.column_name]}
                        onChange={(e) => setIncluded((p) => ({ ...p, [c.column_name]: e.target.checked }))}
                      />
                      <input
                        type="radio"
                        name="pkB"
                        checked={pkCol === c.column_name}
                        onChange={() => setPkCol(c.column_name)}
                      />
                      <span className="flex-1 truncate font-mono text-xs">{c.column_name}</span>
                      <Badge tone="neutral">{normalizePgType(c.data_type)}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Delete modal */}
      <Modal
        open={del !== null}
        onClose={() => setDel(null)}
        title="Delete data model"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDel(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={doDelete} disabled={busy}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-600">
          Deactivate <span className="font-semibold">{del?.name}</span> (status changes to inactive)?
          {del?.type === "A" ? " The generated table is kept." : ""}
        </p>
      </Modal>
    </>
  );
}
