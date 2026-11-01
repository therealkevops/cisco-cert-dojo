"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { recordUcs, useProgress } from "@/lib/progress";
import { className, gradeUcs, QOS_CLASSES, validate, type AdapterPolicy, type QosClassId, type UcsConfig, type UcsGoalResult, type UcsScenario } from "@/lib/ucs";
import { Rich } from "../Rich";

export function UcsLab({ scenario }: { scenario: UcsScenario }) {
  const p = useProgress();
  const [cfg, setCfg] = useState<UcsConfig>(() => structuredClone(scenario.config));
  const [goals, setGoals] = useState<UcsGoalResult[] | null>(null);
  const [hint, setHint] = useState(false);
  const findings = useMemo(() => validate(cfg), [cfg]);
  const edit = (fn: (c: UcsConfig) => void) => {
    setGoals(null);
    setCfg((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  };
  const deploy = () => {
    const g = gradeUcs(cfg, scenario.goals);
    setGoals(g);
    if (g.every((x) => x.ok)) recordUcs(scenario.id);
  };
  const errors = findings.filter((f) => f.level === "error");
  const warnings = findings.filter((f) => f.level === "warning");

  return (
    <main className="page ucs">
      <section className="fab-head">
        <div>
          <span className="silk">
            UCS Profile Lab · DCAI {scenario.objective}
            {p.ucs[scenario.id] ? " · solved ✓" : ""}
          </span>
          <h1 className="display">{scenario.title}</h1>
          <p className="lede">{scenario.brief}</p>
          <ul className="ucs-req">
            {scenario.requirements.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
        <div className="fab-head-actions">
          <Link className="sw" href="/ucs">
            All UCS labs
          </Link>
          <button className="sw" onClick={() => (setCfg(structuredClone(scenario.config)), setGoals(null))}>
            Reset
          </button>
        </div>
      </section>

      <div className="ucs-grid">
        <section className="ucs-col" aria-label="Domain profile">
          <h2 className="ucs-h">
            Domain profile <span className="silk">fabric interconnect pair</span>
          </h2>

          <Card title="VLAN policy">
            <Chips
              values={cfg.domain.vlans}
              render={(v) => `VLAN ${v}`}
              onRemove={(v) => edit((c) => (c.domain.vlans = c.domain.vlans.filter((x) => x !== v)))}
              onAdd={(raw) => {
                const v = +raw;
                if (!Number.isInteger(v) || v < 1 || v > 4093) return "VLAN 1–4093";
                edit((c) => (c.domain.vlans = [...new Set([...c.domain.vlans, v])].sort((a, b) => a - b)));
              }}
              placeholder="add VLAN"
            />
          </Card>

          <Card title="NTP policy">
            <Chips
              values={cfg.domain.ntp}
              render={(v) => v}
              onRemove={(v) => edit((c) => (c.domain.ntp = c.domain.ntp.filter((x) => x !== v)))}
              onAdd={(raw) => {
                if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(raw.trim()) && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(raw.trim())) return "IP address or hostname";
                edit((c) => (c.domain.ntp = [...new Set([...c.domain.ntp, raw.trim()])]));
              }}
              placeholder="add NTP server"
            />
          </Card>

          <Card title="System QoS policy">
            <table className="ucs-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Enabled</th>
                  <th>CoS</th>
                  <th>No-drop</th>
                  <th>MTU</th>
                </tr>
              </thead>
              <tbody>
                {QOS_CLASSES.map(({ id, name }) => {
                  const k = cfg.domain.qos[id];
                  const fixed = id === "besteffort" || id === "fc";
                  return (
                    <tr key={id} className={k.enabled ? "" : "off"}>
                      <td>{name}</td>
                      <td>
                        <Toggle on={k.enabled} disabled={fixed} set={(v) => edit((c) => (c.domain.qos[id].enabled = v))} />
                      </td>
                      <td>
                        {id === "besteffort" ? (
                          "any"
                        ) : (
                          <select className="fab-select" value={k.cos} disabled={id === "fc"} onChange={(e) => edit((c) => (c.domain.qos[id].cos = +e.target.value))} aria-label={`${name} CoS`}>
                            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td>
                        <Toggle on={k.noDrop} disabled={fixed} set={(v) => edit((c) => (c.domain.qos[id].noDrop = v))} />
                      </td>
                      <td>
                        <select className="fab-select" value={k.mtu} disabled={id === "fc"} onChange={(e) => edit((c) => (c.domain.qos[id].mtu = +e.target.value as 1500 | 9216))} aria-label={`${name} MTU`}>
                          <option value={1500}>normal (1500)</option>
                          <option value={9216}>9216</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </section>

        <section className="ucs-col" aria-label="Server profile">
          <h2 className="ucs-h">
            Server profile <span className="silk">GPU server template</span>
          </h2>

          <Card title="LAN connectivity policy (vNICs)">
            {cfg.server.vnics.map((v, i) => (
              <div key={v.name} className="ucs-vnic">
                <div className="ucs-vnic-head">
                  <b>{v.name}</b> <span className="silk">{v.purpose}</span>
                </div>
                <div className="ucs-fields">
                  <Field label="Fabric">
                    <select className="fab-select" value={v.fabric} onChange={(e) => edit((c) => (c.server.vnics[i].fabric = e.target.value as "A" | "B"))}>
                      <option>A</option>
                      <option>B</option>
                    </select>
                  </Field>
                  <Field label="VLANs">
                    <input key={v.vlans.join(",")} className="ucs-in" defaultValue={v.vlans.join(",")} aria-label={`VLANs on ${v.name}`} onBlur={(e) => edit((c) => (c.server.vnics[i].vlans = e.target.value.split(/[ ,]+/).map(Number).filter((n) => n >= 1 && n <= 4093)))} />
                  </Field>
                  <Field label="MTU">
                    <select className="fab-select" value={v.mtu} onChange={(e) => edit((c) => (c.server.vnics[i].mtu = +e.target.value))}>
                      {[1500, 9000].map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Ethernet QoS (class)">
                    <select className="fab-select" value={v.qos} onChange={(e) => edit((c) => (c.server.vnics[i].qos = e.target.value as QosClassId))}>
                      {QOS_CLASSES.filter((k) => k.id !== "fc").map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Ethernet adapter policy">
                    <select className="fab-select" value={v.adapter} onChange={(e) => edit((c) => (c.server.vnics[i].adapter = e.target.value))}>
                      {cfg.server.adapters.map((a) => (
                        <option key={a.name}>{a.name}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>
            ))}
          </Card>

          <Card title="Ethernet adapter policies">
            {cfg.server.adapters.map((a, i) => (
              <AdapterRow key={a.name} a={a} readOnly={a.name === "default"} set={(fn) => edit((c) => fn(c.server.adapters[i]))} remove={() => edit((c) => (c.server.adapters = c.server.adapters.filter((x) => x.name !== a.name)))} />
            ))}
            <NewAdapter existing={cfg.server.adapters.map((a) => a.name)} add={(name) => edit((c) => c.server.adapters.push({ name, roce: false, roceVersion: 2, queuePairs: 0, memoryRegions: 0, resourceGroups: 0, cos: 0 }))} />
          </Card>

          <div className="ucs-two">
            <Card title="Power policy">
              <Field label="Power priority">
                <Seg value={cfg.server.power.priority} options={["low", "medium", "high"]} set={(v) => edit((c) => (c.server.power.priority = v))} />
              </Field>
              <Field label="Power restore">
                <Seg value={cfg.server.power.restore} options={["always-off", "always-on", "last-state"]} set={(v) => edit((c) => (c.server.power.restore = v))} />
              </Field>
              <Field label="Power redundancy">
                <Seg value={cfg.server.power.redundancy} options={["not-redundant", "n+1", "grid"]} set={(v) => edit((c) => (c.server.power.redundancy = v))} />
              </Field>
            </Card>
            <Card title="Storage policy">
              <Field label="M.2 boot drives">
                <Seg value={cfg.server.storage.m2} options={["none", "raid1"]} set={(v) => edit((c) => (c.server.storage.m2 = v))} />
              </Field>
              <Field label="Data drives">
                <Seg value={cfg.server.storage.data} options={["jbod", "raid0", "raid5", "raid10"]} set={(v) => edit((c) => (c.server.storage.data = v))} />
              </Field>
            </Card>
          </div>
        </section>
      </div>

      <section className="ucs-deploy">
        <div className="ucs-findings">
          <span className="silk">
            Deploy validation · {errors.length} error{errors.length === 1 ? "" : "s"} · {warnings.length} warning{warnings.length === 1 ? "" : "s"}
          </span>
          {findings.length === 0 ? (
            <p className="ucs-ok">No issues found. The profiles would deploy cleanly.</p>
          ) : (
            <ul>
              {findings.map((f, i) => (
                <li key={i} className={f.level}>
                  <b>{f.level === "error" ? "Error" : "Warning"}</b> <span className="silk">{f.where}</span> {f.text}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="fab-goals">
          <span className="silk">Acceptance checks</span>
          <ul>
            {scenario.goals.map((g, i) => {
              const r = goals?.[i];
              return (
                <li key={i} className={r ? (r.ok ? "ok" : "bad") : ""}>
                  <span>{r ? (r.ok ? "✓" : "✗") : "·"}</span>
                  <span>
                    {g.label}
                    {r && <em>{r.detail}</em>}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="fab-goal-actions">
            <button className="sw primary" onClick={deploy}>
              Deploy and check
            </button>
            {scenario.hint && (
              <button className="sw" onClick={() => setHint(!hint)}>
                Hint
              </button>
            )}
          </div>
          {hint && scenario.hint && <p className="fab-hint">{scenario.hint}</p>}
          {goals?.every((g) => g.ok) && scenario.debrief && (
            <div className="fab-debrief">
              <b>Deployed.</b> <Rich text={scenario.debrief} />
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="ucs-card">
      <span className="silk">{title}</span>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="ucs-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Toggle({ on, set, disabled }: { on: boolean; set: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" className={`fab-toggle ${on ? "on" : ""}`} aria-pressed={on} disabled={disabled} onClick={() => set(!on)}>
      {on ? "yes" : "no"}
    </button>
  );
}

function Seg<T extends string>({ value, options, set }: { value: T; options: T[]; set: (v: T) => void }) {
  return (
    <span className="build-seg">
      {options.map((o) => (
        <button key={o} type="button" className={o === value ? "on" : ""} aria-pressed={o === value} onClick={() => set(o)}>
          {o}
        </button>
      ))}
    </span>
  );
}

function Chips<T extends string | number>({ values, render, onRemove, onAdd, placeholder }: { values: T[]; render: (v: T) => string; onRemove: (v: T) => void; onAdd: (raw: string) => string | void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState("");
  return (
    <div className="ucs-chips">
      {values.map((v) => (
        <span key={String(v)} className="ucs-chip">
          {render(v)}
          <button type="button" aria-label={`Remove ${render(v)}`} onClick={() => onRemove(v)}>
            ×
          </button>
        </span>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          const msg = onAdd(draft.trim());
          if (msg) setErr(msg);
          else {
            setDraft("");
            setErr("");
          }
        }}
      >
        <input className="ucs-in" value={draft} placeholder={placeholder} aria-label={placeholder} onChange={(e) => setDraft(e.target.value)} />
        <button className="sw" type="submit">
          Add
        </button>
        {err && <small className="ucs-err">{err}</small>}
      </form>
    </div>
  );
}

function AdapterRow({ a, set, remove, readOnly }: { a: AdapterPolicy; set: (fn: (a: AdapterPolicy) => void) => void; remove: () => void; readOnly: boolean }) {
  return (
    <div className="ucs-adapter">
      <div className="ucs-vnic-head">
        <b>{a.name}</b>
        {readOnly ? <span className="silk">built-in, read-only</span> : <button className="sw" onClick={remove}>Delete</button>}
      </div>
      <div className="ucs-fields">
        <Field label="RDMA over Converged Ethernet">
          <Toggle on={a.roce} disabled={readOnly} set={(v) => set((x) => { x.roce = v; if (v && !x.queuePairs) Object.assign(x, { queuePairs: 1024, memoryRegions: 131072, resourceGroups: 8 }); })} />
        </Field>
        {a.roce && (
          <>
            <Field label="RoCE version">
              <Seg value={String(a.roceVersion)} options={["1", "2"]} set={(v) => set((x) => (x.roceVersion = +v as 1 | 2))} />
            </Field>
            <Field label="Class of service">
              <select className="fab-select" value={a.cos} onChange={(e) => set((x) => (x.cos = +e.target.value))}>
                {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Queue pairs / memory regions / resource groups">
              <span className="num ucs-small">
                {a.queuePairs} / {a.memoryRegions} / {a.resourceGroups}
              </span>
            </Field>
          </>
        )}
      </div>
    </div>
  );
}

function NewAdapter({ existing, add }: { existing: string[]; add: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <form
      className="ucs-new"
      onSubmit={(e) => {
        e.preventDefault();
        const n = name.trim();
        if (!n || existing.includes(n)) return;
        add(n);
        setName("");
      }}
    >
      <input className="ucs-in" value={name} placeholder="new policy name, e.g. RoCE-v2" aria-label="New adapter policy name" onChange={(e) => setName(e.target.value)} />
      <button className="sw" type="submit">
        Create policy
      </button>
    </form>
  );
}

