"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Eye,
  History,
  Pencil,
  PlayCircle,
  Power,
  RotateCcw,
  ShieldCheck,
  SquarePen,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  ApiError,
  apiPath,
  createMigrationJob,
  createMigrationRun,
  deleteMigrationJob,
  getMigrationJob,
  getMigrationRun,
  listMigrationJobs,
  listMigrationRuns,
  MIGRATION_LOAD_MODES,
  MIGRATION_RUN_STATUSES,
  MIGRATION_SOURCE_TYPES,
  MIGRATION_TOOLS,
  updateMigrationJob,
  updateMigrationRun,
  validateMigrationTarget,
  type MigrationJob,
  type MigrationRun,
  type TargetValidationResult,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const RUN_TYPES = ["full_load", "incremental", "validation_only", "external_bulk"];
const TRIGGER_TYPES = ["manual", "external", "scheduled"];
const JOB_STATUSES = ["active", "inactive"];

type JobMode = "create" | "edit";
type RunMode = "create" | "edit" | "view";

type JobForm = {
  name: string;
  description: string;
  source_system: string;
  source_connection_id: string;
  source_type: string;
  migration_tool: string;
  source_schema: string;
  source_table: string;
  target_schema: string;
  target_table: string;
  estimated_rows: string;
  estimated_size_gb: string;
  primary_key_columns: string;
  load_mode: string;
  status: string;
  config_json: string;
};

type RunForm = {
  run_type: string;
  trigger_type: string;
  status: string;
  started_at: string;
  finished_at: string;
  source_row_count: string;
  target_row_count: string;
  rows_loaded: string;
  duration_seconds: string;
  log_text: string;
  error_message: string;
};

function badgeTone(value?: string | null): BadgeTone {
  if (value === "success" || value === "active" || value === "pass") return "success";
  if (value === "failed" || value === "fail" || value === "inactive" || value === "cancelled") return "danger";
  if (value === "running" || value === "warning" || value === "pending") return "warning";
  if (value === "ora2pg" || value === "external_bulk") return "info";
  return "neutral";
}

function titleize(value?: string | null): string {
  return value ? value.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()) : "-";
}

function cellText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function toDateTimeInput(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromDateTimeInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function parseNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : null;
}

function parseStringList(value: string): string[] | null {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : null;
}

function prettyJson(value: unknown): string {
  if (!value) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

function emptyJobForm(): JobForm {
  return {
    name: "",
    description: "",
    source_system: "JDE Oracle",
    source_connection_id: "",
    source_type: "oracle",
    migration_tool: "ora2pg",
    source_schema: "PRODDTA",
    source_table: "",
    target_schema: "mdp_staging",
    target_table: "",
    estimated_rows: "",
    estimated_size_gb: "",
    primary_key_columns: "",
    load_mode: "external_bulk",
    status: "active",
    config_json: '{\n  "ora2pg_project": ""\n}',
  };
}

function jobFormFromJob(job: MigrationJob): JobForm {
  return {
    name: job.name,
    description: job.description || "",
    source_system: job.source_system || "",
    source_connection_id: job.source_connection_id || "",
    source_type: job.source_type,
    migration_tool: job.migration_tool,
    source_schema: job.source_schema || "",
    source_table: job.source_table || "",
    target_schema: job.target_schema,
    target_table: job.target_table,
    estimated_rows: job.estimated_rows == null ? "" : String(job.estimated_rows),
    estimated_size_gb: job.estimated_size_gb == null ? "" : String(job.estimated_size_gb),
    primary_key_columns: job.primary_key_columns?.join(", ") || "",
    load_mode: job.load_mode,
    status: job.status,
    config_json: prettyJson(job.config),
  };
}

function emptyRunForm(): RunForm {
  return {
    run_type: "external_bulk",
    trigger_type: "external",
    status: "success",
    started_at: "",
    finished_at: "",
    source_row_count: "",
    target_row_count: "",
    rows_loaded: "",
    duration_seconds: "",
    log_text: "",
    error_message: "",
  };
}

function runFormFromRun(run: MigrationRun): RunForm {
  return {
    run_type: run.run_type,
    trigger_type: run.trigger_type,
    status: run.status,
    started_at: toDateTimeInput(run.started_at),
    finished_at: toDateTimeInput(run.finished_at),
    source_row_count: run.source_row_count == null ? "" : String(run.source_row_count),
    target_row_count: run.target_row_count == null ? "" : String(run.target_row_count),
    rows_loaded: run.rows_loaded == null ? "" : String(run.rows_loaded),
    duration_seconds: run.duration_seconds == null ? "" : String(run.duration_seconds),
    log_text: run.log_text || "",
    error_message: run.error_message || "",
  };
}

function sourceLabel(job: MigrationJob): string {
  if (job.source_schema && job.source_table) return `${job.source_schema}.${job.source_table}`;
  return job.source_table || job.source_schema || "-";
}

function targetLabel(job: MigrationJob): string {
  return `${job.target_schema}.${job.target_table}`;
}

function ActionIcon({
  title,
  onClick,
  children,
  danger,
  disabled,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md border text-neutral-600 transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-40",
        danger
          ? "border-danger/20 text-danger hover:bg-danger/10"
          : "border-neutral-200 hover:border-brand/30 hover:bg-brand/10 hover:text-brand",
      )}
    >
      {children}
    </button>
  );
}

function DetailGrid({ items }: { items: Array<[string, unknown]> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0 rounded-md border border-neutral-100 bg-neutral-50 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</div>
          <div className="mt-1 truncate text-sm text-neutral-900" title={cellText(value)}>
            {cellText(value)}
          </div>
        </div>
      ))}
    </div>
  );
}

function Section({
  title,
  children,
  subtitle,
}: {
  title: string;
  children: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function TextArea({
  label,
  value,
  onChange,
  rows = 4,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-neutral-700">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        disabled={disabled}
        className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:cursor-not-allowed disabled:bg-neutral-50"
      />
    </label>
  );
}

export default function MigrationJobsPage() {
  const [jobs, setJobs] = useState<MigrationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [jobMode, setJobMode] = useState<JobMode | null>(null);
  const [jobForm, setJobForm] = useState<JobForm>(emptyJobForm);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);

  const [viewJob, setViewJob] = useState<MigrationJob | null>(null);
  const [viewRuns, setViewRuns] = useState<MigrationRun[]>([]);
  const [runsJob, setRunsJob] = useState<MigrationJob | null>(null);
  const [runs, setRuns] = useState<MigrationRun[]>([]);

  const [runMode, setRunMode] = useState<RunMode | null>(null);
  const [runForm, setRunForm] = useState<RunForm>(emptyRunForm);
  const [editingRunId, setEditingRunId] = useState<string | null>(null);
  const [runParentJobId, setRunParentJobId] = useState<string | null>(null);

  const [validation, setValidation] = useState<TargetValidationResult | null>(null);

  const reloadJobs = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      setJobs(await listMigrationJobs());
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadJobs();
  }, [reloadJobs]);

  function setFormValue<K extends keyof JobForm>(key: K, value: JobForm[K]) {
    setJobForm((current) => ({ ...current, [key]: value }));
  }

  function setRunValue<K extends keyof RunForm>(key: K, value: RunForm[K]) {
    setRunForm((current) => ({ ...current, [key]: value }));
  }

  function openCreateJob() {
    setModalError(null);
    setEditingJobId(null);
    setJobForm(emptyJobForm());
    setJobMode("create");
  }

  async function openViewJob(job: MigrationJob) {
    setBusy(true);
    setModalError(null);
    try {
      const detail = await getMigrationJob(job.id);
      const jobRuns = await listMigrationRuns(job.id);
      setViewJob(detail);
      setViewRuns(jobRuns.slice(0, 3));
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function openEditJob(job: MigrationJob) {
    setBusy(true);
    setModalError(null);
    try {
      const detail = await getMigrationJob(job.id);
      setEditingJobId(detail.id);
      setJobForm(jobFormFromJob(detail));
      setJobMode("edit");
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function jobPayload(): Record<string, unknown> {
    let config: Record<string, unknown> | null = null;
    if (jobForm.config_json.trim()) {
      const parsed = JSON.parse(jobForm.config_json);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Config must be a JSON object.");
      }
      config = parsed as Record<string, unknown>;
    }
    return {
      name: jobForm.name.trim(),
      description: jobForm.description.trim() || null,
      source_system: jobForm.source_system.trim() || "JDE Oracle",
      source_connection_id: jobForm.source_connection_id.trim() || null,
      source_type: jobForm.source_type,
      migration_tool: jobForm.migration_tool,
      source_schema: jobForm.source_schema.trim() || null,
      source_table: jobForm.source_table.trim() || null,
      target_schema: jobForm.target_schema.trim() || "mdp_staging",
      target_table: jobForm.target_table.trim(),
      estimated_rows: parseNullableNumber(jobForm.estimated_rows),
      estimated_size_gb: parseNullableNumber(jobForm.estimated_size_gb),
      primary_key_columns: parseStringList(jobForm.primary_key_columns),
      load_mode: jobForm.load_mode,
      status: jobForm.status,
      config,
    };
  }

  async function saveJob() {
    setBusy(true);
    setModalError(null);
    try {
      const payload = jobPayload();
      if (jobMode === "edit" && editingJobId) {
        await updateMigrationJob(editingJobId, payload);
        setNotice("Migration job updated.");
      } else {
        await createMigrationJob(payload);
        setNotice("Migration job created.");
      }
      setJobMode(null);
      setEditingJobId(null);
      await reloadJobs();
    } catch (error) {
      setModalError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function deactivateJob(job: MigrationJob) {
    if (!confirm("Deactivate this migration job? Existing run history and validation results will be kept.")) return;
    setBusy(true);
    setPageError(null);
    try {
      await deleteMigrationJob(job.id);
      setNotice("Migration job deactivated.");
      await reloadJobs();
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function activateJob(job: MigrationJob) {
    setBusy(true);
    setPageError(null);
    try {
      await updateMigrationJob(job.id, { status: "active" });
      setNotice("Migration job activated.");
      await reloadJobs();
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function openRuns(job: MigrationJob) {
    setBusy(true);
    setModalError(null);
    setValidation(null);
    try {
      setRunsJob(job);
      setRunParentJobId(job.id);
      setRuns(await listMigrationRuns(job.id));
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function reloadRuns(jobId?: string) {
    const id = jobId || runsJob?.id;
    if (!id) return;
    setRuns(await listMigrationRuns(id));
  }

  function openCreateRun() {
    setModalError(null);
    setEditingRunId(null);
    setRunParentJobId(runsJob?.id || null);
    setRunForm(emptyRunForm());
    setRunMode("create");
  }

  async function openViewRun(run: MigrationRun) {
    setBusy(true);
    setModalError(null);
    try {
      const detail = await getMigrationRun(run.id);
      setEditingRunId(detail.id);
      setRunParentJobId(detail.migration_job_id);
      setRunForm(runFormFromRun(detail));
      setRunMode("view");
    } catch (error) {
      setModalError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function openEditRun(run: MigrationRun) {
    setBusy(true);
    setModalError(null);
    try {
      const detail = await getMigrationRun(run.id);
      setEditingRunId(detail.id);
      setRunParentJobId(detail.migration_job_id);
      setRunForm(runFormFromRun(detail));
      setRunMode("edit");
    } catch (error) {
      setModalError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function runPayload(): Record<string, unknown> {
    return {
      run_type: runForm.run_type,
      trigger_type: runForm.trigger_type,
      started_at: fromDateTimeInput(runForm.started_at),
      finished_at: fromDateTimeInput(runForm.finished_at),
      status: runForm.status,
      source_row_count: parseNullableNumber(runForm.source_row_count),
      target_row_count: parseNullableNumber(runForm.target_row_count),
      rows_loaded: parseNullableNumber(runForm.rows_loaded),
      duration_seconds: parseNullableNumber(runForm.duration_seconds),
      log_text: runForm.log_text.trim() || null,
      error_message: runForm.error_message.trim() || null,
    };
  }

  async function saveRun() {
    if (!runsJob && runMode === "create") return;
    setBusy(true);
    setModalError(null);
    try {
      if (runMode === "edit" && editingRunId) {
        await updateMigrationRun(editingRunId, runPayload());
        setNotice("Migration run updated.");
      } else if (runMode === "create" && runsJob) {
        await createMigrationRun(runsJob.id, runPayload());
        setNotice("Migration run recorded.");
      }
      setRunMode(null);
      setEditingRunId(null);
      if (runParentJobId) {
        const refreshedRuns = await listMigrationRuns(runParentJobId);
        if (runsJob?.id === runParentJobId) setRuns(refreshedRuns);
        if (viewJob?.id === runParentJobId) setViewRuns(refreshedRuns.slice(0, 3));
      } else {
        await reloadRuns();
      }
      await reloadJobs();
    } catch (error) {
      setModalError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function validateRun(run: MigrationRun) {
    setBusy(true);
    setModalError(null);
    try {
      const result = await validateMigrationTarget(run.id);
      setValidation(result);
      setNotice(`Target validation ${result.status}.`);
      const parentJob = jobs.find((job) => job.id === run.migration_job_id) || runsJob || viewJob;
      if (parentJob) setRunsJob(parentJob);
      await reloadRuns(run.migration_job_id);
      await reloadJobs();
    } catch (error) {
      setModalError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function validateLatest(job: MigrationJob) {
    setBusy(true);
    setPageError(null);
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
      setRunsJob(job);
      setRuns(await listMigrationRuns(job.id));
      setNotice(`Target validation ${result.status}.`);
      await reloadJobs();
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function renderJobForm(readOnly = false) {
    return (
      <div className="space-y-4">
        <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
          MDP does not run large JDE full loads inside FastAPI. Use ora2pg or another external bulk loader, then record and validate the result here.
        </p>
        <Section title="Overview">
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Name" value={jobForm.name} onChange={(e) => setFormValue("name", e.target.value)} disabled={readOnly} />
            <Input label="Source System" value={jobForm.source_system} onChange={(e) => setFormValue("source_system", e.target.value)} disabled={readOnly} />
            <Select label="Migration Tool" value={jobForm.migration_tool} onChange={(e) => setFormValue("migration_tool", e.target.value)} disabled={readOnly}>
              {MIGRATION_TOOLS.map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
            <Select label="Load Mode" value={jobForm.load_mode} onChange={(e) => setFormValue("load_mode", e.target.value)} disabled={readOnly}>
              {MIGRATION_LOAD_MODES.map((item) => <option key={item} value={item}>{titleize(item)}</option>)}
            </Select>
            <Select label="Status" value={jobForm.status} onChange={(e) => setFormValue("status", e.target.value)} disabled={readOnly}>
              {JOB_STATUSES.map((item) => <option key={item} value={item}>{titleize(item)}</option>)}
            </Select>
            <Input label="Source Connection ID" value={jobForm.source_connection_id} onChange={(e) => setFormValue("source_connection_id", e.target.value)} disabled={readOnly} />
          </div>
          <div className="mt-3">
            <TextArea label="Description" value={jobForm.description} onChange={(value) => setFormValue("description", value)} rows={3} disabled={readOnly} />
          </div>
        </Section>
        <Section title="Source and Target">
          <div className="grid gap-3 md:grid-cols-2">
            <Select label="Source Type" value={jobForm.source_type} onChange={(e) => setFormValue("source_type", e.target.value)} disabled={readOnly}>
              {MIGRATION_SOURCE_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
            <Input label="Source Schema" value={jobForm.source_schema} onChange={(e) => setFormValue("source_schema", e.target.value)} disabled={readOnly} />
            <Input label="Source Table" value={jobForm.source_table} onChange={(e) => setFormValue("source_table", e.target.value)} disabled={readOnly} />
            <Input label="Target Schema" value={jobForm.target_schema} onChange={(e) => setFormValue("target_schema", e.target.value)} disabled={readOnly} />
            <Input label="Target Table" value={jobForm.target_table} onChange={(e) => setFormValue("target_table", e.target.value)} disabled={readOnly} />
            <Input label="Primary Key Columns" value={jobForm.primary_key_columns} onChange={(e) => setFormValue("primary_key_columns", e.target.value)} placeholder="supplier_code, company_code" disabled={readOnly} />
            <Input label="Estimated Rows" value={jobForm.estimated_rows} onChange={(e) => setFormValue("estimated_rows", e.target.value)} disabled={readOnly} />
            <Input label="Estimated Size GB" value={jobForm.estimated_size_gb} onChange={(e) => setFormValue("estimated_size_gb", e.target.value)} disabled={readOnly} />
          </div>
        </Section>
        <Section title="Config" subtitle="Optional JSON object for external tool metadata, ora2pg project names, or command notes.">
          <TextArea label="Config JSON" value={jobForm.config_json} onChange={(value) => setFormValue("config_json", value)} rows={8} disabled={readOnly} />
        </Section>
      </div>
    );
  }

  function renderRunForm(readOnly = false) {
    return (
      <div className="space-y-4">
        <Section title="Run Details">
          <div className="grid gap-3 md:grid-cols-2">
            <Select label="Run Type" value={runForm.run_type} onChange={(e) => setRunValue("run_type", e.target.value)} disabled={readOnly}>
              {RUN_TYPES.map((item) => <option key={item} value={item}>{titleize(item)}</option>)}
            </Select>
            <Select label="Trigger Type" value={runForm.trigger_type} onChange={(e) => setRunValue("trigger_type", e.target.value)} disabled={readOnly}>
              {TRIGGER_TYPES.map((item) => <option key={item} value={item}>{titleize(item)}</option>)}
            </Select>
            <Select label="Status" value={runForm.status} onChange={(e) => setRunValue("status", e.target.value)} disabled={readOnly}>
              {MIGRATION_RUN_STATUSES.map((item) => <option key={item} value={item}>{titleize(item)}</option>)}
            </Select>
            <Input label="Started At" type="datetime-local" value={runForm.started_at} onChange={(e) => setRunValue("started_at", e.target.value)} disabled={readOnly} />
            <Input label="Finished At" type="datetime-local" value={runForm.finished_at} onChange={(e) => setRunValue("finished_at", e.target.value)} disabled={readOnly} />
            <Input label="Duration Seconds" value={runForm.duration_seconds} onChange={(e) => setRunValue("duration_seconds", e.target.value)} disabled={readOnly} />
            <Input label="Source Row Count" value={runForm.source_row_count} onChange={(e) => setRunValue("source_row_count", e.target.value)} disabled={readOnly} />
            <Input label="Target Row Count" value={runForm.target_row_count} onChange={(e) => setRunValue("target_row_count", e.target.value)} disabled={readOnly} />
            <Input label="Rows Loaded" value={runForm.rows_loaded} onChange={(e) => setRunValue("rows_loaded", e.target.value)} disabled={readOnly} />
          </div>
        </Section>
        <Section title="Logs">
          <div className="grid gap-3 md:grid-cols-2">
            <TextArea label="Log Text" value={runForm.log_text} onChange={(value) => setRunValue("log_text", value)} rows={7} disabled={readOnly} />
            <TextArea label="Error Message" value={runForm.error_message} onChange={(value) => setRunValue("error_message", value)} rows={7} disabled={readOnly} />
          </div>
        </Section>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Migration Jobs"
        subtitle={`Public API: ${apiPath("/migration-jobs")} - tracks external ora2pg/bulk loads and validates PostgreSQL staging targets.`}
        action={<Button onClick={openCreateJob}>New Migration Job</Button>}
      />
      <Card className="mb-4">
        <CardBody>
          <p className="text-sm text-neutral-600">
            MDP does not run large JDE full loads inside FastAPI. Use ora2pg or another external bulk loader for large tables, then record the run and validate the target table here.
          </p>
        </CardBody>
      </Card>
      {pageError && <p className="mb-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{pageError}</p>}
      {notice && <p className="mb-4 rounded-md bg-success/10 px-3 py-2 text-sm text-success">{notice}</p>}
      <Card>
        <CardHeader title="Migration Jobs" subtitle={`${jobs.length} total`} />
        <CardBody>
          {loading ? (
            <p className="text-sm text-neutral-400">Loading...</p>
          ) : (
            <Table className="table-fixed text-[13px]">
              <colgroup>
                <col className="w-[180px]" />
                <col className="w-[210px]" />
                <col className="w-[140px]" />
                <col className="w-[180px]" />
                <col className="w-[180px]" />
                <col className="w-[95px]" />
                <col className="w-[120px]" />
                <col className="w-[95px]" />
                <col className="w-[110px]" />
                <col className="w-[110px]" />
              </colgroup>
              <THead>
                <TR>
                  <TH className="text-center">Actions</TH>
                  <TH>Name</TH>
                  <TH>Source System</TH>
                  <TH>Source Table</TH>
                  <TH>Target Table</TH>
                  <TH>Tool</TH>
                  <TH>Load Mode</TH>
                  <TH>Status</TH>
                  <TH>Latest Run</TH>
                  <TH>Target Rows</TH>
                </TR>
              </THead>
              <TBody>
                {jobs.map((job) => (
                  <TR key={job.id}>
                    <TD>
                      <div className="flex items-center justify-center gap-1">
                        <ActionIcon title={`View ${job.name}`} onClick={() => openViewJob(job)} disabled={busy}>
                          <Eye size={15} />
                        </ActionIcon>
                        <ActionIcon title={`Edit ${job.name}`} onClick={() => openEditJob(job)} disabled={busy}>
                          <Pencil size={15} />
                        </ActionIcon>
                        <ActionIcon title={`Runs for ${job.name}`} onClick={() => openRuns(job)} disabled={busy}>
                          <History size={15} />
                        </ActionIcon>
                        <ActionIcon title={`Validate target for ${job.name}`} onClick={() => validateLatest(job)} disabled={busy}>
                          <ShieldCheck size={15} />
                        </ActionIcon>
                        {job.status === "inactive" ? (
                          <ActionIcon title={`Activate ${job.name}`} onClick={() => activateJob(job)} disabled={busy}>
                            <RotateCcw size={15} />
                          </ActionIcon>
                        ) : (
                          <ActionIcon title={`Deactivate ${job.name}`} onClick={() => deactivateJob(job)} disabled={busy} danger>
                            <Power size={15} />
                          </ActionIcon>
                        )}
                      </div>
                    </TD>
                    <TD className="truncate font-medium" title={job.name}>{job.name}</TD>
                    <TD className="truncate" title={job.source_system || job.source_type}>{job.source_system || job.source_type}</TD>
                    <TD className="truncate font-mono text-xs" title={sourceLabel(job)}>{sourceLabel(job)}</TD>
                    <TD className="truncate font-mono text-xs" title={targetLabel(job)}>{targetLabel(job)}</TD>
                    <TD><Badge tone={badgeTone(job.migration_tool)}>{job.migration_tool}</Badge></TD>
                    <TD>{titleize(job.load_mode)}</TD>
                    <TD><Badge tone={badgeTone(job.status)}>{job.status}</Badge></TD>
                    <TD><Badge tone={badgeTone(job.latest_run_status)}>{job.latest_run_status || "none"}</Badge></TD>
                    <TD>{job.latest_target_row_count ?? "-"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Modal
        open={jobMode !== null}
        onClose={() => setJobMode(null)}
        title={jobMode === "edit" ? "Edit Migration Job" : "New Migration Job"}
        className="data-model-dialog overflow-hidden"
        footer={
          <>
            <Button variant="ghost" onClick={() => setJobMode(null)}>Cancel</Button>
            <Button onClick={saveJob} disabled={busy}>{busy ? "Saving..." : jobMode === "edit" ? "Save Changes" : "Create Job"}</Button>
          </>
        }
      >
        {modalError && <p className="mb-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{modalError}</p>}
        {renderJobForm(false)}
      </Modal>

      <Modal
        open={viewJob !== null}
        onClose={() => setViewJob(null)}
        title="View Migration Job"
        className="data-model-dialog overflow-hidden"
        footer={
          <>
            <Button variant="ghost" onClick={() => setViewJob(null)}>Close</Button>
            {viewJob && <Button onClick={() => { const job = viewJob; setViewJob(null); openEditJob(job); }}>Edit Job</Button>}
          </>
        }
      >
        {viewJob && (
          <div className="space-y-4">
            <Section title="Overview">
              <DetailGrid items={[
                ["Name", viewJob.name],
                ["Description", viewJob.description],
                ["Status", viewJob.status],
                ["Source System", viewJob.source_system],
                ["Migration Tool", viewJob.migration_tool],
                ["Load Mode", titleize(viewJob.load_mode)],
              ]} />
            </Section>
            <Section title="Source">
              <DetailGrid items={[
                ["Source Type", viewJob.source_type],
                ["Source Connection", viewJob.source_connection_id],
                ["Source Schema", viewJob.source_schema],
                ["Source Table", viewJob.source_table],
              ]} />
            </Section>
            <Section title="Target">
              <DetailGrid items={[
                ["Target Schema", viewJob.target_schema],
                ["Target Table", viewJob.target_table],
                ["Primary Key Columns", viewJob.primary_key_columns],
                ["Estimated Rows", viewJob.estimated_rows],
                ["Estimated Size GB", viewJob.estimated_size_gb],
              ]} />
            </Section>
            <Section title="Config">
              <pre className="max-h-72 overflow-auto rounded-md bg-neutral-950 p-3 text-xs text-neutral-50">
                {prettyJson(viewJob.config) || "-"}
              </pre>
            </Section>
            <Section title="Latest Runs" subtitle="Latest 3 run records">
              {viewRuns.length === 0 ? (
                <p className="text-sm text-neutral-500">No runs recorded yet.</p>
              ) : (
                <RunTable runs={viewRuns} onView={openViewRun} onEdit={openEditRun} onValidate={validateRun} busy={busy} />
              )}
            </Section>
          </div>
        )}
      </Modal>

      <Modal
        open={runsJob !== null}
        onClose={() => setRunsJob(null)}
        title={runsJob ? `Run History - ${runsJob.name}` : "Run History"}
        className="data-model-dialog overflow-hidden"
      >
        {modalError && <p className="mb-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{modalError}</p>}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-neutral-600">
              Record ora2pg or external-loader output here. MDP keeps the history and validates the PostgreSQL target.
            </p>
            <Button size="sm" onClick={openCreateRun}>
              <PlayCircle size={15} />
              New Run Record
            </Button>
          </div>
          {validation && <ValidationPanel validation={validation} />}
          {runs.length === 0 ? (
            <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-4 text-sm text-neutral-500">
              No migration runs have been recorded.
            </p>
          ) : (
            <RunTable runs={runs} onView={openViewRun} onEdit={openEditRun} onValidate={validateRun} busy={busy} />
          )}
        </div>
      </Modal>

      <Modal
        open={runMode !== null}
        onClose={() => setRunMode(null)}
        title={runMode === "view" ? "View Migration Run" : runMode === "edit" ? "Edit Migration Run" : "New Migration Run"}
        className="data-model-dialog overflow-hidden"
        footer={
          runMode === "view" ? (
            <>
              <Button variant="ghost" onClick={() => setRunMode(null)}>Close</Button>
              {editingRunId && <Button onClick={() => setRunMode("edit")}>Edit Run</Button>}
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setRunMode(null)}>Cancel</Button>
              <Button onClick={saveRun} disabled={busy}>{busy ? "Saving..." : runMode === "edit" ? "Save Changes" : "Create Run"}</Button>
            </>
          )
        }
      >
        {modalError && <p className="mb-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{modalError}</p>}
        {renderRunForm(runMode === "view")}
      </Modal>
    </>
  );
}

function RunTable({
  runs,
  onView,
  onEdit,
  onValidate,
  busy,
}: {
  runs: MigrationRun[];
  onView: (run: MigrationRun) => void;
  onEdit: (run: MigrationRun) => void;
  onValidate: (run: MigrationRun) => void;
  busy: boolean;
}) {
  return (
    <Table className="table-fixed text-xs">
      <colgroup>
        <col className="w-[120px]" />
        <col className="w-[100px]" />
        <col className="w-[120px]" />
        <col className="w-[120px]" />
        <col className="w-[145px]" />
        <col className="w-[145px]" />
        <col className="w-[120px]" />
        <col className="w-[120px]" />
        <col className="w-[115px]" />
        <col className="w-[100px]" />
      </colgroup>
      <THead>
        <TR>
          <TH className="text-center">Actions</TH>
          <TH>Status</TH>
          <TH>Run Type</TH>
          <TH>Trigger</TH>
          <TH>Started At</TH>
          <TH>Finished At</TH>
          <TH>Source Rows</TH>
          <TH>Target Rows</TH>
          <TH>Rows Loaded</TH>
          <TH>Duration</TH>
        </TR>
      </THead>
      <TBody>
        {runs.map((run) => (
          <TR key={run.id}>
            <TD>
              <div className="flex items-center justify-center gap-1">
                <ActionIcon title="View run" onClick={() => onView(run)} disabled={busy}>
                  <Eye size={14} />
                </ActionIcon>
                <ActionIcon title="Edit run" onClick={() => onEdit(run)} disabled={busy}>
                  <SquarePen size={14} />
                </ActionIcon>
                <ActionIcon title="Validate target" onClick={() => onValidate(run)} disabled={busy}>
                  <ShieldCheck size={14} />
                </ActionIcon>
              </div>
            </TD>
            <TD><Badge tone={badgeTone(run.status)}>{run.status}</Badge></TD>
            <TD>{titleize(run.run_type)}</TD>
            <TD>{titleize(run.trigger_type)}</TD>
            <TD className="truncate" title={formatDate(run.started_at)}>{formatDate(run.started_at)}</TD>
            <TD className="truncate" title={formatDate(run.finished_at)}>{formatDate(run.finished_at)}</TD>
            <TD>{run.source_row_count ?? "-"}</TD>
            <TD>{run.target_row_count ?? "-"}</TD>
            <TD>{run.rows_loaded ?? "-"}</TD>
            <TD>{run.duration_seconds == null ? "-" : `${run.duration_seconds}s`}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

function ValidationPanel({ validation }: { validation: TargetValidationResult }) {
  return (
    <Section
      title="Target Validation"
      subtitle={`${validation.target_schema}.${validation.target_table} - ${validation.target_row_count ?? "-"} rows`}
    >
      <div className="mb-3 flex items-center gap-2 text-sm">
        <span className="text-neutral-600">Overall status</span>
        <Badge tone={badgeTone(validation.status)}>{validation.status}</Badge>
      </div>
      <Table className="table-fixed text-xs">
        <colgroup>
          <col className="w-[230px]" />
          <col className="w-[90px]" />
          <col className="w-[130px]" />
          <col className="w-[130px]" />
          <col className="w-[300px]" />
        </colgroup>
        <THead>
          <TR>
            <TH>Check</TH>
            <TH>Status</TH>
            <TH>Source Value</TH>
            <TH>Target Value</TH>
            <TH>Message</TH>
          </TR>
        </THead>
        <TBody>
          {validation.validations.map((item) => (
            <TR key={item.id}>
              <TD className="truncate font-mono" title={item.check_name}>{item.check_name}</TD>
              <TD><Badge tone={badgeTone(item.status)}>{item.status}</Badge></TD>
              <TD className="truncate" title={item.source_value || "-"}>{item.source_value || "-"}</TD>
              <TD className="truncate" title={item.target_value || "-"}>{item.target_value || "-"}</TD>
              <TD className="truncate" title={item.message || "-"}>{item.message || "-"}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Section>
  );
}
