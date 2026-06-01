"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import {
  ApiError,
  apiPath,
  createMigrationJob,
  createMigrationRun,
  deleteMigrationJob,
  listMigrationJobs,
  listMigrationRuns,
  MIGRATION_LOAD_MODES,
  MIGRATION_RUN_STATUSES,
  MIGRATION_SOURCE_TYPES,
  MIGRATION_TOOLS,
  validateMigrationTarget,
  type MigrationJob,
  type MigrationRun,
  type TargetValidationResult,
} from "@/lib/api";

function badgeTone(value?: string | null): BadgeTone {
  if (value === "success" || value === "active" || value === "pass") return "success";
  if (value === "failed" || value === "fail" || value === "inactive") return "danger";
  if (value === "running" || value === "warning") return "warning";
  return "neutral";
}

function titleize(value?: string | null): string {
  return value ? value.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()) : "-";
}

function parseList(value: string): string[] | null {
  const items = value.split(",").map((item) => item.trim()).filter(Boolean);
  return items.length ? items : null;
}

export default function MigrationJobsPage() {
  const [jobs, setJobs] = useState<MigrationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [runJob, setRunJob] = useState<MigrationJob | null>(null);
  const [historyJob, setHistoryJob] = useState<MigrationJob | null>(null);
  const [runs, setRuns] = useState<MigrationRun[]>([]);
  const [validation, setValidation] = useState<TargetValidationResult | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [sourceSystem, setSourceSystem] = useState("JDE Oracle");
  const [sourceType, setSourceType] = useState("oracle");
  const [migrationTool, setMigrationTool] = useState("ora2pg");
  const [sourceSchema, setSourceSchema] = useState("PRODDTA");
  const [sourceTable, setSourceTable] = useState("");
  const [targetSchema, setTargetSchema] = useState("mdp_staging");
  const [targetTable, setTargetTable] = useState("");
  const [estimatedRows, setEstimatedRows] = useState("");
  const [estimatedSizeGb, setEstimatedSizeGb] = useState("");
  const [primaryKeys, setPrimaryKeys] = useState("");
  const [loadMode, setLoadMode] = useState("external_bulk");
  const [description, setDescription] = useState("");

  const [runStatus, setRunStatus] = useState("success");
  const [sourceRowCount, setSourceRowCount] = useState("");
  const [targetRowCount, setTargetRowCount] = useState("");
  const [rowsLoaded, setRowsLoaded] = useState("");
  const [durationSeconds, setDurationSeconds] = useState("");
  const [logText, setLogText] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setJobs(await listMigrationJobs());
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  function openNew() {
    setName("");
    setSourceSystem("JDE Oracle");
    setSourceType("oracle");
    setMigrationTool("ora2pg");
    setSourceSchema("PRODDTA");
    setSourceTable("");
    setTargetSchema("mdp_staging");
    setTargetTable("");
    setEstimatedRows("");
    setEstimatedSizeGb("");
    setPrimaryKeys("");
    setLoadMode("external_bulk");
    setDescription("");
    setOpen(true);
  }

  async function saveJob() {
    setBusy(true);
    setErr(null);
    try {
      await createMigrationJob({
        name,
        description: description || null,
        source_system: sourceSystem || "JDE Oracle",
        source_type: sourceType,
        migration_tool: migrationTool,
        source_schema: sourceSchema || null,
        source_table: sourceTable || null,
        target_schema: targetSchema || "mdp_staging",
        target_table: targetTable,
        estimated_rows: estimatedRows ? Number(estimatedRows) : null,
        estimated_size_gb: estimatedSizeGb ? Number(estimatedSizeGb) : null,
        primary_key_columns: parseList(primaryKeys),
        load_mode: loadMode,
        config: {
          strategy: "External bulk load. Run ora2pg outside FastAPI; record run output here.",
        },
      });
      setOpen(false);
      setNotice("Migration job created.");
      await reload();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function openRun(job: MigrationJob) {
    setRunJob(job);
    setRunStatus("success");
    setSourceRowCount("");
    setTargetRowCount(job.latest_target_row_count ? String(job.latest_target_row_count) : "");
    setRowsLoaded("");
    setDurationSeconds("");
    setLogText("");
  }

  async function saveRun() {
    if (!runJob) return;
    setBusy(true);
    setErr(null);
    try {
      await createMigrationRun(runJob.id, {
        run_type: "external_bulk",
        trigger_type: "external",
        status: runStatus,
        source_row_count: sourceRowCount ? Number(sourceRowCount) : null,
        target_row_count: targetRowCount ? Number(targetRowCount) : null,
        rows_loaded: rowsLoaded ? Number(rowsLoaded) : null,
        duration_seconds: durationSeconds ? Number(durationSeconds) : null,
        log_text: logText || null,
      });
      setRunJob(null);
      setNotice("External migration run recorded.");
      await reload();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function openHistory(job: MigrationJob) {
    setHistoryJob(job);
    setValidation(null);
    setRuns(await listMigrationRuns(job.id));
  }

  async function validateLatest(job: MigrationJob) {
    setBusy(true);
    setErr(null);
    try {
      let jobRuns = await listMigrationRuns(job.id);
      if (jobRuns.length === 0) {
        const created = await createMigrationRun(job.id, {
          run_type: "validation_only",
          trigger_type: "manual",
          status: "success",
        });
        jobRuns = [created];
      }
      const result = await validateMigrationTarget(jobRuns[0].id);
      setValidation(result);
      setHistoryJob(job);
      setRuns(await listMigrationRuns(job.id));
      setNotice(`Target validation ${result.status}.`);
      await reload();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(job: MigrationJob) {
    if (!confirm("Deactivate this migration job?")) return;
    await deleteMigrationJob(job.id);
    await reload();
  }

  return (
    <>
      <PageHeader
        title="Migration Jobs"
        subtitle={`Public API: ${apiPath("/migration-jobs")} · Tracks external ora2pg/bulk loads and validates PostgreSQL staging targets.`}
        action={<Button onClick={openNew}>New Migration Job</Button>}
      />
      <Card className="mb-4">
        <CardBody>
          <p className="text-sm text-neutral-600">
            MDP does not run large JDE full loads inside FastAPI. Use ora2pg or another external bulk loader for
            large tables, then record the run and validate the target table here.
          </p>
        </CardBody>
      </Card>
      {err && <p className="mb-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
      {notice && <p className="mb-4 rounded-md bg-success/10 px-3 py-2 text-sm text-success">{notice}</p>}
      <Card>
        <CardHeader title="Migration jobs" subtitle={`${jobs.length} total`} />
        <CardBody>
          {loading ? (
            <p className="text-sm text-neutral-400">Loading...</p>
          ) : (
            <Table className="table-fixed text-[13px]">
              <colgroup>
                <col className="w-[180px]" />
                <col className="w-[130px]" />
                <col className="w-[190px]" />
                <col className="w-[190px]" />
                <col className="w-[110px]" />
                <col className="w-[110px]" />
                <col className="w-[110px]" />
                <col className="w-[150px]" />
                <col className="w-[260px]" />
              </colgroup>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Source</TH>
                  <TH>Source Table</TH>
                  <TH>Target Table</TH>
                  <TH>Tool</TH>
                  <TH>Load Mode</TH>
                  <TH>Status</TH>
                  <TH>Latest Run</TH>
                  <TH>Actions</TH>
                </TR>
              </THead>
              <TBody>
                {jobs.map((job) => (
                  <TR key={job.id}>
                    <TD className="truncate font-medium" title={job.name}>{job.name}</TD>
                    <TD>{job.source_system || job.source_type}</TD>
                    <TD className="truncate font-mono text-xs" title={`${job.source_schema || ""}.${job.source_table || ""}`}>
                      {job.source_schema || "-"}{job.source_table ? `.${job.source_table}` : ""}
                    </TD>
                    <TD className="truncate font-mono text-xs" title={`${job.target_schema}.${job.target_table}`}>
                      {job.target_schema}.{job.target_table}
                    </TD>
                    <TD><Badge tone="info">{job.migration_tool}</Badge></TD>
                    <TD>{titleize(job.load_mode)}</TD>
                    <TD><Badge tone={badgeTone(job.status)}>{job.status}</Badge></TD>
                    <TD>
                      <Badge tone={badgeTone(job.latest_run_status)}>{job.latest_run_status || "none"}</Badge>
                      {job.latest_target_row_count != null && (
                        <span className="ml-2 text-xs text-neutral-500">{job.latest_target_row_count} rows</span>
                      )}
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => openRun(job)}>Record Run</Button>
                        <Button size="sm" variant="secondary" onClick={() => validateLatest(job)} disabled={busy}>Validate</Button>
                        <Button size="sm" variant="ghost" onClick={() => openHistory(job)}>History</Button>
                        <Button size="sm" variant="ghost" onClick={() => deactivate(job)}>Deactivate</Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New Migration Job"
        className="data-model-dialog"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={saveJob} disabled={busy}>{busy ? "Saving..." : "Create Job"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
            Native migration is for small datasets only. Use ora2pg or another external bulk loader for large JDE tables.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="jde_supplier_ora2pg" />
            <Input label="Source system" value={sourceSystem} onChange={(e) => setSourceSystem(e.target.value)} />
            <Select label="Source type" value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
              {MIGRATION_SOURCE_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
            <Select label="Migration tool" value={migrationTool} onChange={(e) => setMigrationTool(e.target.value)}>
              {MIGRATION_TOOLS.map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
            <Input label="Source schema" value={sourceSchema} onChange={(e) => setSourceSchema(e.target.value)} />
            <Input label="Source table" value={sourceTable} onChange={(e) => setSourceTable(e.target.value)} placeholder="F0101" />
            <Input label="Target schema" value={targetSchema} onChange={(e) => setTargetSchema(e.target.value)} />
            <Input label="Target table" value={targetTable} onChange={(e) => setTargetTable(e.target.value)} placeholder="stg_jde_supplier" />
            <Input label="Estimated rows" value={estimatedRows} onChange={(e) => setEstimatedRows(e.target.value)} placeholder="30000000" />
            <Input label="Estimated size GB" value={estimatedSizeGb} onChange={(e) => setEstimatedSizeGb(e.target.value)} placeholder="30" />
            <Input label="Primary key columns" value={primaryKeys} onChange={(e) => setPrimaryKeys(e.target.value)} placeholder="supplier_code" />
            <Select label="Load mode" value={loadMode} onChange={(e) => setLoadMode(e.target.value)}>
              {MIGRATION_LOAD_MODES.map((item) => <option key={item} value={item}>{titleize(item)}</option>)}
            </Select>
          </div>
          <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </Modal>

      <Modal
        open={runJob !== null}
        onClose={() => setRunJob(null)}
        title="Record External Migration Run"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRunJob(null)}>Cancel</Button>
            <Button onClick={saveRun} disabled={busy}>{busy ? "Saving..." : "Record Run"}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-neutral-600">
            Paste the row counts and notes from ora2pg or your external loader. MDP stores the run result; it does not execute the bulk load here.
          </p>
          <Select label="Status" value={runStatus} onChange={(e) => setRunStatus(e.target.value)}>
            {MIGRATION_RUN_STATUSES.map((item) => <option key={item} value={item}>{titleize(item)}</option>)}
          </Select>
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Source row count" value={sourceRowCount} onChange={(e) => setSourceRowCount(e.target.value)} />
            <Input label="Target row count" value={targetRowCount} onChange={(e) => setTargetRowCount(e.target.value)} />
            <Input label="Rows loaded" value={rowsLoaded} onChange={(e) => setRowsLoaded(e.target.value)} />
            <Input label="Duration seconds" value={durationSeconds} onChange={(e) => setDurationSeconds(e.target.value)} />
          </div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-neutral-700">Log text</span>
            <textarea
              value={logText}
              onChange={(e) => setLogText(e.target.value)}
              className="min-h-28 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
      </Modal>

      <Modal open={historyJob !== null} onClose={() => setHistoryJob(null)} title="Migration Run History" className="data-model-dialog">
        <div className="space-y-4">
          {validation && (
            <Card>
              <CardHeader title="Latest target validation" subtitle={`${validation.target_schema}.${validation.target_table}`} />
              <CardBody>
                <p className="mb-3 text-sm">Status: <Badge tone={badgeTone(validation.status)}>{validation.status}</Badge></p>
                <Table className="text-xs">
                  <THead><TR><TH>Check</TH><TH>Status</TH><TH>Target Value</TH><TH>Message</TH></TR></THead>
                  <TBody>
                    {validation.validations.map((item) => (
                      <TR key={item.id}>
                        <TD>{item.check_name}</TD>
                        <TD><Badge tone={badgeTone(item.status)}>{item.status}</Badge></TD>
                        <TD>{item.target_value || "-"}</TD>
                        <TD>{item.message || "-"}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardBody>
            </Card>
          )}
          <Table>
            <THead><TR><TH>Status</TH><TH>Run Type</TH><TH>Source Rows</TH><TH>Target Rows</TH><TH>Rows Loaded</TH><TH>Log</TH></TR></THead>
            <TBody>
              {runs.map((run) => (
                <TR key={run.id}>
                  <TD><Badge tone={badgeTone(run.status)}>{run.status}</Badge></TD>
                  <TD>{titleize(run.run_type)}</TD>
                  <TD>{run.source_row_count ?? "-"}</TD>
                  <TD>{run.target_row_count ?? "-"}</TD>
                  <TD>{run.rows_loaded ?? "-"}</TD>
                  <TD className="max-w-sm truncate" title={run.log_text || ""}>{run.log_text || run.error_message || "-"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      </Modal>
    </>
  );
}
