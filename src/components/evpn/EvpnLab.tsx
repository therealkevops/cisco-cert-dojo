"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { recordEvpn, useProgress } from "@/lib/progress";
import { evaluate, gradeEvpn, ping, type EFabric, type EvpnGoalResult, type EvpnScenario, type Verdict } from "@/lib/evpn";
import { evpnComplete, evpnHelp, evpnPrompt, runEvpnCli, type ESession } from "@/lib/evpn-cli";
import { Console, type ConsoleLine } from "../bench/Console";
import { Rich } from "../Rich";

type Term = { session: ESession; lines: ConsoleLine[]; history: string[] };

const ROW = { spine: 52, leaf: 175, host: 285 };

export function EvpnLab({ scenario }: { scenario: EvpnScenario }) {
  const p = useProgress();
  const [fabric, setFabric] = useState<EFabric>(() => structuredClone(scenario.fabric));
  const ids = scenario.fabric.switches.map((s) => s.id);
  const fresh = (): Record<string, Term> => Object.fromEntries(ids.map((id) => [id, { session: { sw: id, mode: { m: "exec" } }, lines: [{ kind: "sys", text: `${id} console. Type ? for help, Tab to complete.` }], history: [] }]));
  const [terms, setTerms] = useState<Record<string, Term>>(fresh);
  const [cur, setCur] = useState(ids.find((x) => x.startsWith("LEAF")) ?? ids[0]);
  const [goals, setGoals] = useState<EvpnGoalResult[] | null>(null);
  const [hint, setHint] = useState(false);
  const [solution, setSolution] = useState(false);
  const r = useMemo(() => evaluate(fabric), [fabric]);
  const t = terms[cur];

  const push = (id: string, fn: (t: Term) => Term) => setTerms((prev) => ({ ...prev, [id]: fn(prev[id]) }));
  const run = (line: string) => {
    const res = runEvpnCli(line, t.session, fabric);
    if (res.fabric) {
      setFabric(res.fabric);
      setGoals(null);
    }
    push(cur, (x) => ({
      session: res.session,
      history: line.trim() ? [line, ...x.history].slice(0, 100) : x.history,
      lines: [...x.lines, { kind: "in" as const, text: `${evpnPrompt(x.session)}${line}` }, ...(res.out ? [{ kind: "out" as const, text: res.out }] : [])].slice(-400),
    }));
  };
  const check = () => {
    const g = gradeEvpn(fabric, scenario.goals);
    setGoals(g);
    if (g.every((x) => x.ok)) recordEvpn(scenario.id);
  };
  const reset = () => {
    setFabric(structuredClone(scenario.fabric));
    setTerms(fresh());
    setGoals(null);
  };

  const spines = fabric.switches.filter((s) => s.role === "spine");
  const leaves = fabric.switches.filter((s) => s.role === "leaf");
  const xOf = (list: { id: string }[], id: string, span = 520, left = 60) => left + ((list.findIndex((x) => x.id === id) + 0.5) * span) / list.length;
  const swPos = (id: string): [number, number] => (id.startsWith("SPINE") ? [xOf(spines, id, 360, 140), ROW.spine] : [xOf(leaves, id), ROW.leaf]);
  const hostX = (h: (typeof fabric.hosts)[number]) => {
    const same = fabric.hosts.filter((x) => x.leaf === h.leaf);
    const k = same.indexOf(h);
    return swPos(h.leaf)[0] + (k - (same.length - 1) / 2) * 92;
  };

  return (
    <main className="page san">
      <section className="fab-head">
        <div>
          <span className="silk">
            VXLAN EVPN Lab · DCCOR {scenario.objective}
            {p.evpn[scenario.id] ? " · solved ✓" : ""}
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
          <Link className="sw" href="/evpn">
            All EVPN labs
          </Link>
          <button className="sw" onClick={reset}>
            Reset
          </button>
        </div>
      </section>

      <div className="san-grid">
        <section className="san-map" aria-label="Fabric diagram">
          <svg viewBox="0 0 640 320" role="img" aria-label="Spine-leaf topology">
            {r.adj.map((a, k) => {
              const [x1, y1] = swPos(a.a[0]);
              const [x2, y2] = swPos(a.b[0]);
              return (
                <g key={k} className={`san-link ${a.state === "FULL" ? "up" : "down"}`}>
                  <line x1={x1} y1={y1 - 18} x2={x2} y2={y2 + 18} />
                  {a.state === "EXSTART" && (
                    <text x={(x1 + x2) / 2} y={(y1 + y2) / 2} textAnchor="middle" className="san-link-kind">
                      EXSTART
                    </text>
                  )}
                </g>
              );
            })}
            {fabric.hosts.map((h) => {
              const [lx, ly] = swPos(h.leaf);
              return (
                <g key={h.id} className="san-link up">
                  <line x1={hostX(h)} y1={ROW.host - 14} x2={lx} y2={ly + 18} />
                </g>
              );
            })}
            {fabric.switches.map((s) => {
              const [x, y] = swPos(s.id);
              const peers = r.nvePeers[s.id] ?? [];
              return (
                <g key={s.id} className={`san-sw ${cur === s.id ? "on" : ""}`} onClick={() => setCur(s.id)} role="button" aria-label={`Console on ${s.id}`}>
                  <rect x={x - 52} y={y - 18} width={104} height={36} rx={4} />
                  <text x={x} y={y - 2} textAnchor="middle" className="san-sw-name">
                    {s.id}
                  </text>
                  <text x={x} y={y + 12} textAnchor="middle" className="san-sw-sub">
                    {s.role === "spine" ? "route reflector" : `NVE peers ${peers.filter((q) => q.up).length}/${leaves.length - 1}`}
                  </text>
                </g>
              );
            })}
            {fabric.hosts.map((h) => (
              <g key={h.id} className="san-dev hba">
                <rect x={hostX(h) - 42} y={ROW.host - 14} width={84} height={28} rx={14} />
                <text x={hostX(h)} y={ROW.host - 1} textAnchor="middle">
                  {h.label} · VLAN {h.vlan}
                </text>
                <text x={hostX(h)} y={ROW.host + 9} textAnchor="middle" className="evpn-ip">
                  {h.ip.split("/")[0]}
                </text>
              </g>
            ))}
          </svg>
          <p className="san-legend silk">Lines: underlay OSPF (green FULL, red down/EXSTART) · click a switch to open its console</p>
          <PingTester fabric={fabric} />
        </section>

        <section className="san-term" aria-label="Switch console">
          <div className="san-tabs" role="tablist">
            {ids.map((id) => (
              <button key={id} role="tab" aria-selected={cur === id} className={cur === id ? "on" : ""} onClick={() => setCur(id)}>
                {id}
              </button>
            ))}
          </div>
          <div className="san-con">
            <Console
              key={cur}
              lines={t.lines}
              prompt={evpnPrompt(t.session)}
              history={t.history}
              onRun={run}
              onHelp={(l) => push(cur, (x) => ({ ...x, lines: [...x.lines, { kind: "in", text: `${evpnPrompt(x.session)}${l}` }, { kind: "out", text: evpnHelp(l, x.session) }] }))}
              onComplete={(l) => evpnComplete(l, t.session)}
              onClear={() => push(cur, (x) => ({ ...x, lines: [] }))}
              active
            />
          </div>
        </section>
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
            Check the fabric
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
          <div className="san-solution">
            {scenario.solution.map((s) => (
              <pre key={s.sw}>
                <b>{s.sw}</b>
                {"\n"}
                {s.lines.join("\n")}
              </pre>
            ))}
          </div>
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

function PingTester({ fabric }: { fabric: EFabric }) {
  const hosts = fabric.hosts.map((h) => h.id);
  const [from, setFrom] = useState(hosts[0]);
  const [to, setTo] = useState(hosts[1]);
  const [size, setSize] = useState("100");
  const [out, setOut] = useState<(Verdict & { what: string }) | null>(null);
  return (
    <div className="aci-tester evpn-tester">
      <span className="silk">Host ping</span>
      <div className="aci-tester-row">
        <select className="fab-select" value={from} aria-label="From host" onChange={(e) => setFrom(e.target.value)}>
          {hosts.map((h) => (
            <option key={h}>{h}</option>
          ))}
        </select>
        <span>→</span>
        <select className="fab-select" value={to} aria-label="To host" onChange={(e) => setTo(e.target.value)}>
          {hosts.map((h) => (
            <option key={h}>{h}</option>
          ))}
        </select>
        <select className="fab-select" value={size} aria-label="Packet size" onChange={(e) => setSize(e.target.value)}>
          <option value="100">100 bytes</option>
          <option value="1500">1500 bytes</option>
        </select>
        <button className="sw" onClick={() => setOut({ ...ping(fabric, from, to, +size), what: `${from} → ${to}, ${size} bytes` })}>
          Ping
        </button>
      </div>
      {out && (
        <p className={`aci-verdict ${out.ok ? "ok" : "bad"}`}>
          <b>{out.ok ? "reply" : "no reply"}</b> <span className="num">{out.what}</span>
          <br />
          {out.why}
        </p>
      )}
    </div>
  );
}
