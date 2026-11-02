"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { recordAci, useProgress } from "@/lib/progress";
import { evaluate, flowText, gradeAci, reach, type AciGoalResult, type AciModel, type AciScenario, type Proto, type Verdict } from "@/lib/aci";
import { Rich } from "../Rich";

type Coll = "pools" | "domains" | "aaeps" | "policyGroups" | "intProfiles" | "switchProfiles" | "vrfs" | "bds" | "epgs" | "filters" | "contracts";
type Field = { key: string; label: string; kind: "text" | "select" | "multi" | "toggle"; options?: (m: AciModel) => string[]; placeholder?: string };
type Spec = { key: Coll; label: string; group: "access" | "tenant"; blurb: string; fields: Field[]; make: (name: string, m: AciModel) => Record<string, unknown> };

const names = (k: Coll) => (m: AciModel) => (m[k] as { name: string }[]).map((x) => x.name);

const SPECS: Spec[] = [
  { key: "pools", label: "VLAN pools", group: "access", blurb: "Encap blocks a domain may use. Static allocation for static path bindings.", fields: [{ key: "mode", label: "Allocation", kind: "select", options: () => ["static", "dynamic"] }, { key: "blocks", label: "Encap blocks", kind: "text", placeholder: "100-199, 300" }], make: (name) => ({ name, mode: "static", blocks: "" }) },
  { key: "domains", label: "Physical domains", group: "access", blurb: "Ties a VLAN pool to the EPGs and AAEPs that use it.", fields: [{ key: "pool", label: "VLAN pool", kind: "select", options: names("pools") }], make: (name, m) => ({ name, pool: m.pools[0]?.name ?? "" }) },
  { key: "aaeps", label: "AAEPs", group: "access", blurb: "Attachable access entity profiles: which domains a set of ports may carry.", fields: [{ key: "domains", label: "Domains", kind: "multi", options: names("domains") }], make: (name) => ({ name, domains: [] }) },
  { key: "policyGroups", label: "Interface policy groups", group: "access", blurb: "Leaf access port policy groups: link settings plus the AAEP.", fields: [{ key: "aaep", label: "AAEP", kind: "select", options: names("aaeps") }], make: (name) => ({ name, aaep: "" }) },
  { key: "intProfiles", label: "Interface profiles", group: "access", blurb: "Port selectors (one per profile here) mapped to a policy group.", fields: [{ key: "ports", label: "Ports", kind: "text", placeholder: "1/10-20" }, { key: "policyGroup", label: "Policy group", kind: "select", options: names("policyGroups") }], make: (name) => ({ name, ports: "", policyGroup: "" }) },
  { key: "switchProfiles", label: "Switch profiles", group: "access", blurb: "Leaf selectors: which nodes get which interface profiles.", fields: [{ key: "leaves", label: "Leaf IDs", kind: "text", placeholder: "101-102" }, { key: "intProfiles", label: "Interface profiles", kind: "multi", options: names("intProfiles") }], make: (name) => ({ name, leaves: "", intProfiles: [] }) },
  { key: "vrfs", label: "VRFs", group: "tenant", blurb: "Policy control enforcement decides whether contracts apply at all.", fields: [{ key: "enforced", label: "Enforced", kind: "toggle" }], make: (name) => ({ name, enforced: true }) },
  { key: "bds", label: "Bridge domains", group: "tenant", blurb: "Layer 2 flood domain plus the pervasive gateway subnets.", fields: [{ key: "vrf", label: "VRF", kind: "select", options: names("vrfs") }, { key: "routing", label: "Unicast routing", kind: "toggle" }, { key: "subnets", label: "Subnets (gateway)", kind: "text", placeholder: "10.1.1.1/24" }], make: (name, m) => ({ name, vrf: m.vrfs[0]?.name ?? "", subnets: "", routing: true }) },
  {
    key: "epgs",
    label: "EPGs",
    group: "tenant",
    blurb: "Endpoint groups, their domains, static ports and contracts.",
    fields: [
      { key: "ap", label: "Application profile", kind: "text" },
      { key: "bd", label: "Bridge domain", kind: "select", options: names("bds") },
      { key: "domains", label: "Domains", kind: "multi", options: names("domains") },
      { key: "paths", label: "Static ports", kind: "text", placeholder: "101 eth1/10 vlan-100, …" },
      { key: "provides", label: "Provided contracts", kind: "multi", options: names("contracts") },
      { key: "consumes", label: "Consumed contracts", kind: "multi", options: names("contracts") },
    ],
    make: (name, m) => ({ name, ap: m.epgs[0]?.ap ?? "AP", bd: "", domains: [], paths: "", provides: [], consumes: [] }),
  },
  { key: "filters", label: "Filters", group: "tenant", blurb: "Entries like tcp 443, udp 161-162, icmp, or ip (everything).", fields: [{ key: "entries", label: "Entries", kind: "text", placeholder: "tcp 443, icmp" }], make: (name) => ({ name, entries: "" }) },
  {
    key: "contracts",
    label: "Contracts",
    group: "tenant",
    blurb: "One subject per contract here: its filters and direction settings.",
    fields: [
      { key: "scope", label: "Scope", kind: "select", options: () => ["vrf", "application-profile", "tenant", "global"] },
      { key: "filters", label: "Subject filters", kind: "multi", options: names("filters") },
      { key: "both", label: "Apply both directions", kind: "toggle" },
      { key: "reverse", label: "Reverse filter ports", kind: "toggle" },
    ],
    make: (name) => ({ name, scope: "vrf", filters: [], both: true, reverse: true }),
  },
];

export function AciLab({ scenario }: { scenario: AciScenario }) {
  const p = useProgress();
  const [model, setModel] = useState<AciModel>(() => structuredClone(scenario.model));
  const [sel, setSel] = useState<Coll>("epgs");
  const [goals, setGoals] = useState<AciGoalResult[] | null>(null);
  const [hint, setHint] = useState(false);
  const [solution, setSolution] = useState(false);
  const r = useMemo(() => evaluate(model, scenario.endpoints), [model, scenario.endpoints]);
  const spec = SPECS.find((s) => s.key === sel)!;
  const list = model[sel] as Record<string, unknown>[];

  const edit = (fn: (m: AciModel) => void) => {
    setGoals(null);
    setModel((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  };
  const check = () => {
    const g = gradeAci(model, scenario.endpoints, scenario.goals);
    setGoals(g);
    if (g.every((x) => x.ok)) recordAci(scenario.id);
  };
  const faultsFor = (k: Coll) => {
    const tag = { pools: "vlanns-", domains: "phys-", aaeps: "attentp-", policyGroups: "accportgrp-", intProfiles: "accportprof-", switchProfiles: "nprof-", vrfs: "ctx-", bds: "BD-", epgs: "epg-", filters: "flt-", contracts: "brc-" }[k];
    return r.faults.filter((f) => f.dn.includes(`/${tag}`)).length;
  };

  return (
    <main className="page aci">
      <section className="fab-head">
        <div>
          <span className="silk">
            ACI Policy Lab · DCCOR {scenario.objective}
            {p.aci[scenario.id] ? " · solved ✓" : ""}
          </span>
          <h1 className="display">{scenario.title}</h1>
          <p className="lede">{scenario.brief}</p>
          <ul className="ucs-req">
            {scenario.symptoms.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
        <div className="fab-head-actions">
          <Link className="sw" href="/aci">
            All ACI labs
          </Link>
          <button className="sw" onClick={() => (setModel(structuredClone(scenario.model)), setGoals(null))}>
            Reset
          </button>
        </div>
      </section>

      <div className="aci-grid">
        <nav className="aci-tree" aria-label="Policy tree">
          {(["access", "tenant"] as const).map((g) => (
            <div key={g}>
              <span className="silk">{g === "access" ? "Fabric › Access Policies" : `Tenant ${model.tenant}`}</span>
              <ul>
                {SPECS.filter((s) => s.group === g).map((s) => {
                  const n = faultsFor(s.key);
                  return (
                    <li key={s.key}>
                      <button className={sel === s.key ? "on" : ""} aria-current={sel === s.key} onClick={() => setSel(s.key)}>
                        <span>{s.label}</span>
                        <span className="num">
                          {n ? <b className="aci-badge">{n}</b> : null}
                          {(model[s.key] as unknown[]).length}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <section className="aci-editor" aria-label={spec.label}>
          <h2 className="ucs-h">
            {spec.label} <span className="silk">{spec.blurb}</span>
          </h2>
          {list.map((obj, i) => (
            <div key={String(obj.name)} className="aci-obj">
              <div className="ucs-vnic-head">
                <b>{String(obj.name)}</b>
                <button className="sw" onClick={() => edit((m) => (m[sel] as unknown[]).splice(i, 1))} aria-label={`Delete ${String(obj.name)}`}>
                  Delete
                </button>
              </div>
              <div className="aci-fields">
                {spec.fields.map((f) => (
                  <FieldEditor key={f.key} f={f} obj={obj} model={model} label={`${String(obj.name)} ${f.label}`} set={(v) => edit((m) => ((m[sel] as Record<string, unknown>[])[i][f.key] = v))} />
                ))}
              </div>
            </div>
          ))}
          {!list.length && <p className="aci-empty">None yet.</p>}
          <AddObject existing={list.map((o) => String(o.name))} label={spec.label} add={(name) => edit((m) => (m[sel] as unknown[]).push(spec.make(name, m)))} />
        </section>

        <aside className="aci-side">
          <div className="fab-panel">
            <span className="silk">Faults · {r.faults.length}</span>
            {r.faults.length ? (
              <ul className="aci-faults">
                {r.faults.map((f, i) => (
                  <li key={i} className={f.severity}>
                    <span className="num">{f.code ?? f.severity}</span>
                    <span>
                      <code>{f.dn}</code>
                      {f.text}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ucs-ok">No faults.</p>
            )}
          </div>
          <div className="fab-panel">
            <span className="silk">Endpoints</span>
            <table className="ucs-table aci-eps">
              <thead>
                <tr>
                  <th>Endpoint</th>
                  <th>Encap</th>
                  <th>EPG</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {scenario.endpoints.map((e) => {
                  const l = r.learned.find((x) => x.ep === e.name)!;
                  return (
                    <tr key={e.name} title={l.why} className={l.epg ? "" : "off"}>
                      <td>{e.name}</td>
                      <td className="num">
                        {e.leaf} {e.port} vlan-{e.vlan}
                      </td>
                      <td>{l.epg ?? "—"}</td>
                      <td className="num">{l.ipLearned ? e.ip : l.epg ? "MAC only" : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Tester model={model} scenario={scenario} />
        </aside>
      </div>

      <section className="fab-goals san-goals">
        <span className="silk">Acceptance checks</span>
        <ul>
          {scenario.goals.map((g, i) => {
            const res = goals?.[i];
            return (
              <li key={i} className={res ? (res.ok ? "ok" : "bad") : ""}>
                <span>{res ? (res.ok ? "✓" : "✗") : "·"}</span>
                <span>
                  {g.label}
                  {res && <em>{res.detail}</em>}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="fab-goal-actions">
          <button className="sw primary" onClick={check}>
            Submit and check
          </button>
          {scenario.hint && (
            <button className="sw" onClick={() => setHint(!hint)}>
              Hint
            </button>
          )}
          <button className="sw" onClick={() => setSolution(!solution)}>
            {solution ? "Hide" : "Show"} a solution
          </button>
        </div>
        {hint && scenario.hint && (
          <p className="fab-hint">
            <Rich text={scenario.hint} />
          </p>
        )}
        {solution && (
          <ol className="aci-solution">
            {scenario.solution.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        )}
        {goals?.every((g) => g.ok) && scenario.debrief && (
          <div className="fab-debrief">
            <b>Fixed.</b> <Rich text={scenario.debrief} />
          </div>
        )}
      </section>
    </main>
  );
}

function FieldEditor({ f, obj, model, label, set }: { f: Field; obj: Record<string, unknown>; model: AciModel; label: string; set: (v: unknown) => void }) {
  const v = obj[f.key];
  let input: React.ReactNode;
  if (f.kind === "toggle")
    input = (
      <button type="button" className={`fab-toggle ${v ? "on" : ""}`} aria-pressed={!!v} aria-label={label} onClick={() => set(!v)}>
        {v ? "yes" : "no"}
      </button>
    );
  else if (f.kind === "select") {
    const opts = f.options!(model);
    input = (
      <select className="fab-select" value={String(v ?? "")} aria-label={label} onChange={(e) => set(e.target.value)}>
        {!opts.includes(String(v)) && <option value={String(v ?? "")}>{v ? `${v} (missing)` : "(none)"}</option>}
        {opts.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    );
  } else if (f.kind === "multi") {
    const cur = (v as string[]) ?? [];
    const rest = f.options!(model).filter((o) => !cur.includes(o));
    input = (
      <span className="ucs-chips">
        {cur.map((c) => (
          <span key={c} className="ucs-chip">
            {c}
            <button type="button" aria-label={`Remove ${c} from ${label}`} onClick={() => set(cur.filter((x) => x !== c))}>
              ×
            </button>
          </span>
        ))}
        {rest.length > 0 && (
          <select className="fab-select" value="" aria-label={`Add to ${label}`} onChange={(e) => e.target.value && set([...cur, e.target.value])}>
            <option value="">+ add</option>
            {rest.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        )}
      </span>
    );
  } else input = <input className="ucs-in aci-text" value={String(v ?? "")} placeholder={f.placeholder} aria-label={label} spellCheck={false} onChange={(e) => set(e.target.value)} />;
  return (
    <label className="ucs-field">
      <span>{f.label}</span>
      {input}
    </label>
  );
}

function AddObject({ existing, label, add }: { existing: string[]; label: string; add: (name: string) => void }) {
  const [name, setName] = useState("");
  const clean = name.trim();
  return (
    <form
      className="ucs-new"
      onSubmit={(e) => {
        e.preventDefault();
        if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(clean) || existing.includes(clean)) return;
        add(clean);
        setName("");
      }}
    >
      <input className="ucs-in" value={name} placeholder="name" aria-label={`New ${label} name`} onChange={(e) => setName(e.target.value)} />
      <button className="sw" type="submit">
        Create
      </button>
    </form>
  );
}

function Tester({ model, scenario }: { model: AciModel; scenario: AciScenario }) {
  const eps = scenario.endpoints.map((e) => e.name);
  const [from, setFrom] = useState(eps[0]);
  const [to, setTo] = useState(eps[1] ?? eps[0]);
  const [proto, setProto] = useState<Proto>("tcp");
  const [port, setPort] = useState("8080");
  const [out, setOut] = useState<(Verdict & { what: string }) | null>(null);
  return (
    <div className="fab-panel aci-tester">
      <span className="silk">Traffic test</span>
      <div className="aci-tester-row">
        <select className="fab-select" value={from} aria-label="Source endpoint" onChange={(e) => setFrom(e.target.value)}>
          {eps.map((e) => (
            <option key={e}>{e}</option>
          ))}
        </select>
        <span>→</span>
        <select className="fab-select" value={to} aria-label="Destination endpoint" onChange={(e) => setTo(e.target.value)}>
          {eps.map((e) => (
            <option key={e}>{e}</option>
          ))}
        </select>
        <select className="fab-select" value={proto} aria-label="Protocol" onChange={(e) => setProto(e.target.value as Proto)}>
          {["tcp", "udp", "icmp"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        {proto !== "icmp" && <input className="ucs-in aci-port" value={port} aria-label="Destination port" onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))} />}
        <button
          className="sw"
          onClick={() => {
            const f = { from, to, proto, port: proto === "icmp" ? undefined : +port || 1 };
            setOut({ ...reach(model, scenario.endpoints, f), what: `${from} → ${to} ${flowText(f)}` });
          }}
        >
          Test
        </button>
      </div>
      {out && (
        <p className={`aci-verdict ${out.ok ? "ok" : "bad"}`}>
          <b>{out.ok ? "permitted" : "dropped"}</b> <span className="num">{out.what}</span>
          <br />
          {out.why}
        </p>
      )}
    </div>
  );
}
