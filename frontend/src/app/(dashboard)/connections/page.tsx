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
  CONNECTION_TYPES,
  createConnection,
  deleteConnection,
  listConnections,
  testConnection,
  type ConnType,
  type Connection,
} from "@/lib/api";

const DB_TYPES = ["postgresql", "oracle", "sqlserver"];

function testTone(s: string | null): BadgeTone {
  if (s === "success") return "success";
  if (s === "error") return "danger";
  return "neutral";
}

export default function ConnectionsPage() {
  const [conns, setConns] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setConns(await listConnections());
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  const [name, setName] = useState("");
  const [type, setType] = useState<ConnType>("postgresql");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  function openNew() {
    setName("");
    setType("postgresql");
    setHost("");
    setPort("");
    setDatabase("");
    setUsername("");
    setPassword("");
    setBaseUrl("");
    setDesc("");
    setFormErr(null);
    setOpen(true);
  }

  const isDb = DB_TYPES.includes(type);
  const isRest = type === "rest_api";
  const isMqtt = type === "mqtt";

  async function save() {
    setFormErr(null);
    if (!name.trim()) {
      setFormErr("Name is required.");
      return;
    }
    const body: Record<string, unknown> = { name: name.trim(), type, description: desc.trim() || null };
    if (isDb || isMqtt) {
      body.host = host.trim();
      body.port = port ? Number(port) : null;
    }
    if (isDb) {
      body.database_name = database.trim();
      body.username = username.trim();
      if (password) body.password = password;
    }
    if (isRest) body.base_url = baseUrl.trim();
    setBusy(true);
    try {
      await createConnection(body);
      setOpen(false);
      await reload();
    } catch (e) {
      setFormErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runTest(c: Connection) {
    setTesting(c.id);
    setErr(null);
    try {
      await testConnection(c.id);
      await reload();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setTesting(null);
    }
  }
  async function remove(c: Connection) {
    try {
      await deleteConnection(c.id);
      await reload();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    }
  }

  return (
    <>
      <PageHeader
        title="Connections"
        subtitle="External systems (password encrypted, never shown). MDP /connections."
        action={<Button onClick={openNew}>New Connection</Button>}
      />
      {err && <p className="mb-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
      <Card>
        <CardHeader title="All connections" subtitle={`${conns.length} total`} />
        <CardBody>
          {loading ? (
            <p className="text-sm text-neutral-400">Loading…</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Type</TH>
                  <TH>Target</TH>
                  <TH>Status</TH>
                  <TH>Last test</TH>
                  <TH>Actions</TH>
                </TR>
              </THead>
              <TBody>
                {conns.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-medium">{c.name}</TD>
                    <TD>
                      <Badge tone="info">{c.type}</Badge>
                    </TD>
                    <TD className="font-mono text-xs">
                      {c.base_url || (c.host ? `${c.host}${c.port ? ":" + c.port : ""}${c.database_name ? "/" + c.database_name : ""}` : "—")}
                    </TD>
                    <TD>
                      <Badge tone={c.status === "active" ? "success" : "neutral"}>{c.status}</Badge>
                    </TD>
                    <TD>
                      <Badge tone={testTone(c.last_test_status)}>{c.last_test_status || "untested"}</Badge>
                      {c.last_test_message && (
                        <span className="ml-2 text-xs text-neutral-400">{c.last_test_message.slice(0, 40)}</span>
                      )}
                    </TD>
                    <TD>
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => runTest(c)} disabled={testing === c.id}>
                          {testing === c.id ? "Testing…" : "Test"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(c)}>
                          Delete
                        </Button>
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
        title="New Connection"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Create"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {formErr && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{formErr}</p>}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="jde-prod" />
            <Select label="Type" value={type} onChange={(e) => setType(e.target.value as ConnType)}>
              {CONNECTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          {(isDb || isMqtt) && (
            <div className="grid grid-cols-2 gap-3">
              <Input label="Host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="10.0.0.5" />
              <Input label="Port" value={port} onChange={(e) => setPort(e.target.value)} placeholder={isMqtt ? "1883" : "5432"} />
            </div>
          )}
          {isDb && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Database" value={database} onChange={(e) => setDatabase(e.target.value)} placeholder="prod" />
                <Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="reader" />
              </div>
              <Input
                label="Password (write-only)"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </>
          )}
          {isRest && (
            <Input label="Base URL" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com" />
          )}
          <Input label="Description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="JDE production database" />
        </div>
      </Modal>
    </>
  );
}
