"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { trafficPresets } from "@/data/fabric";
import { gradeFabric, hostsOf, leafOf, linkKey, linksOf, simulate, switchesOf, type FabricGoalResult, type SimResult } from "@/lib/fabric/sim";
import type { Fabric, FabricScenario, HostCfg, SwitchCfg } from "@/lib/fabric/types";
import { recordFabric, useProgress } from "@/lib/progress";
import { Rich } from "../Rich";

type Sel = { kind: "switch" | "host"; id: string } | { kind: "link"; a: string; b: string } | null;

const W = 980;
const H = 430;
const SPINE_Y = 60;
const LEAF_Y = 200;
const HOST_Y = 350;

function layout(f: Fabric) {
  const pos: Record<string, { x: number; y: number }> = {};
  const hosts = hostsOf(f);
  const colW = W / f.leaves;
  for (let l = 1; l <= f.leaves; l++) pos[`L${l}`] = { x: colW * (l - 0.5), y: LEAF_Y };
  for (let s = 1; s <= f.spines; s++) pos[`S${s}`] = { x: (W / (f.spines + 1)) * s, y: SPINE_Y };
  hosts.forEach((h, i) => {
    const l = Math.floor(i / f.hostsPerLeaf);
    const k = i % f.hostsPerLeaf;
    const span = colW * 0.78;
    pos[h] = { x: colW * l + (colW - span) / 2 + (span / (f.hostsPerLeaf - 1)) * k, y: HOST_Y };
  });
  return pos;
}

const utilColor = (u: number) => (u > 0.95 ? "var(--amber)" : u > 0.5 ? "color-mix(in srgb, var(--amber) 65%, var(--line))" : u > 0.05 ? "color-mix(in srgb, var(--amber) 35%, var(--line))" : "var(--line)");

export function FabricLab({ scenario }: { scenario: FabricScenario }) {
  const p = useProgress();
  const [fabric, setFabric] = useState<Fabric>(() => structuredClone(scenario.fabric));
  const [result, setResult] = useState<SimResult | null>(null);
  const [running, setRunning] = useState(false);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [sel, setSel] = useState<Sel>({ kind: "switch", id: "L1" });
  const [goals, setGoals] = useState<FabricGoalResult[] | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [preset, setPreset] = useState("incast");
  const pos = useMemo(() => layout(fabric), [fabric]);
  const raf = useRef<number | null>(null);

  // Re-simulate shortly after every change. A run takes well under a second.
  useEffect(() => {
    setRunning(true);
    setGoals(null);
    const t = setTimeout(() => {
      const r = simulate(fabric);
      setResult(r);
      setFrame(0);
      setPlaying(true);
      setRunning(false);
    }, 120);
    return () => clearTimeout(t);
  }, [fabric]);

  // Playback: the whole run in about five seconds.
  useEffect(() => {
    if (!playing || !result) return;
    let last = performance.now();
    const per = 5000 / Math.max(1, result.frames.length);
    const step = (now: number) => {
      if (now - last >= per) {
        const n = Math.floor((now - last) / per);
        last += n * per;
        setFrame((f) => {
          const next = f + n;
          if (next >= result.frames.length - 1) {
            setPlaying(false);
            return result.frames.length - 1;
          }
          return next;
        });
      }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, result]);

  const edit = (fn: (f: Fabric) => void) =>
    setFabric((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });

  const fr = result?.frames[Math.min(frame, (result?.frames.length ?? 1) - 1)];
  const paused = new Set(fr?.paused ?? []);
  const shut = new Set(fr?.shut ?? []);
  const solved = scenario.kind === "challenge" && !!p.fabric[scenario.id];

  const verify = () => {
    if (!result) return;
    const g = gradeFabric(result, scenario.goals);
    setGoals(g);
    if (g.every((x) => x.ok)) recordFabric(scenario.id);
  };

  return (
    <main className="page fab">
      <section className="fab-head">
        <div>
          <span className="silk">
            Fabric Lab · {scenario.kind === "challenge" ? "challenge" : "sandbox"} · DCAI {scenario.objective}
            {solved ? " · solved ✓" : ""}
          </span>
          <h1 className="display">{scenario.title}</h1>
          <p className="lede">
            <Rich text={scenario.brief} />
          </p>
        </div>
        <div className="fab-head-actions">
          <Link className="sw" href="/fabric">
            All fabric labs
          </Link>
          {scenario.kind === "sandbox" && (
            <select
              className="fab-select"
              value={preset}
              aria-label="Traffic pattern"
              onChange={(e) => {
                setPreset(e.target.value);
                const pr = trafficPresets.find((x) => x.id === e.target.value)!;
                edit((f) => (f.jobs = pr.jobs()));
              }}
            >
              {trafficPresets.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          )}
          <button className="sw" onClick={() => setFabric(structuredClone(scenario.fabric))}>
            Reset
          </button>
        </div>
      </section>

      <div className="fab-grid">
        <section className="fab-stage" aria-label="Fabric map">
          <svg viewBox={`0 0 ${W} ${H}`} className="fab-svg" role="img" aria-label="Spine-leaf fabric with link utilisation and PFC pauses">
            {linksOf(fabric).map(([a, b]) => {
              const k = linkKey(a, b);
              const st = fabric.links[k] ?? {};
              const down = st.down || (a.startsWith("H") && !fabric.hosts[a].up);
              const u = Math.max(fr?.util[`${a}>${b}`] ?? 0, fr?.util[`${b}>${a}`] ?? 0);
              const pa = paused.has(`${a}>${b}`);
              const pb = paused.has(`${b}>${a}`);
              const A = pos[a];
              const B = pos[b];
              const on = sel?.kind === "link" && linkKey(sel.a, sel.b) === k;
              return (
                <g key={k} className="fab-link" onClick={() => setSel({ kind: "link", a, b })}>
                  <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} className="hit" />
                  <line
                    x1={A.x}
                    y1={A.y}
                    x2={B.x}
                    y2={B.y}
                    stroke={down ? "var(--muted)" : pa || pb ? "var(--red)" : utilColor(u)}
                    strokeWidth={down ? 1.5 : 1.5 + u * 4 + (on ? 1.5 : 0)}
                    strokeDasharray={down ? "4 5" : undefined}
                    opacity={on ? 1 : 0.9}
                  />
                  {(pa || pb) && <PauseMark A={pa ? A : B} B={pa ? B : A} />}
                  {st.crc ? (
                    <text x={(A.x + B.x) / 2 + 6} y={(A.y + B.y) / 2} className="fab-tag bad">
                      CRC
                    </text>
                  ) : null}
                </g>
              );
            })}
            {switchesOf(fabric).map((id) => {
              const P = pos[id];
              const qmax = Math.max(0, ...Object.entries(fr?.q ?? {}).filter(([dl]) => dl.startsWith(`${id}>`)).map(([, v]) => v));
              const anyShut = [...shut].some((dl) => dl.startsWith(`${id}>`));
              const on = sel?.kind === "switch" && sel.id === id;
              return (
                <g key={id} className={`fab-node sw-node ${on ? "on" : ""}`} transform={`translate(${P.x},${P.y})`} onClick={() => setSel({ kind: "switch", id })}>
                  <rect x={-44} y={-17} width={88} height={34} rx={5} />
                  <text y={4} textAnchor="middle" className="fab-label">
                    {id.startsWith("S") ? `SPINE${id.slice(1)}` : `LEAF${id.slice(1)}`}
                  </text>
                  <rect x={-44} y={20} width={88} height={4} className="qtrack" />
                  <rect x={-44} y={20} width={88 * Math.min(1, qmax / fabric.buffer)} height={4} className="qfill" />
                  {anyShut && (
                    <text x={50} y={-8} className="fab-tag bad">
                      WD
                    </text>
                  )}
                </g>
              );
            })}
            {hostsOf(fabric).map((id) => {
              const P = pos[id];
              const h = fabric.hosts[id];
              const stuck = fabric.stuck.includes(id);
              const on = sel?.kind === "host" && sel.id === id;
              const busy = fr?.util[`${id}>${leafOf(fabric, id)}`] ?? 0;
              return (
                <g key={id} className={`fab-node gpu ${on ? "on" : ""} ${stuck ? "stuck" : ""} ${h.up ? "" : "down"}`} transform={`translate(${P.x},${P.y})`} onClick={() => setSel({ kind: "host", id })}>
                  <rect x={-20} y={-16} width={40} height={32} rx={4} />
                  <rect x={-20} y={13} width={40 * busy} height={3} className="qfill" />
                  <text y={4} textAnchor="middle" className="fab-label small">
                    {id}
                  </text>
                  {stuck && (
                    <text y={32} textAnchor="middle" className="fab-tag bad">
                      hung NIC
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          <div className="fab-play">
            <button className="sw" onClick={() => (frame >= (result?.frames.length ?? 1) - 1 ? (setFrame(0), setPlaying(true)) : setPlaying(!playing))} disabled={!result}>
              {playing ? "❚❚" : "▶"}
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(0, (result?.frames.length ?? 1) - 1)}
              value={frame}
              onChange={(e) => {
                setPlaying(false);
                setFrame(+e.target.value);
              }}
              aria-label="Time"
            />
            <span className="num">{running ? "simulating…" : `${fr?.t ?? 0} µs / ${result?.endT ?? 0} µs`}</span>
          </div>
          <div className="fab-legend silk">
            <span>
              <i className="lg util" /> link load
            </span>
            <span>
              <i className="lg pause" /> PFC paused (‖ at the paused sender)
            </span>
            <span>
              <i className="lg q" /> deepest egress queue
            </span>
            <span>WD = watchdog shut a queue</span>
          </div>
          <Jobs result={result} frame={fr?.progress} />
        </section>

        <aside className="fab-side">
          {sel?.kind === "switch" && <SwitchPanel id={sel.id} cfg={fabric.switches[sel.id]} result={result} edit={edit} />}
          {sel?.kind === "host" && <HostPanel id={sel.id} fabric={fabric} result={result} edit={edit} />}
          {sel?.kind === "link" && <LinkPanel a={sel.a} b={sel.b} fabric={fabric} result={result} edit={edit} />}

          {scenario.kind === "challenge" && (
            <div className="fab-goals">
              <span className="silk">Goals</span>
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
                <button className="sw primary" onClick={verify} disabled={!result || running}>
                  Verify
                </button>
                {scenario.hint && (
                  <button className="sw" onClick={() => setShowHint(!showHint)}>
                    Hint
                  </button>
                )}
              </div>
              {showHint && scenario.hint && (
                <p className="fab-hint">
                  <Rich text={scenario.hint} />
                </p>
              )}
              {goals?.every((g) => g.ok) && scenario.debrief && (
                <div className="fab-debrief">
                  <b>Ticket closed.</b> <Rich text={scenario.debrief} />
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

function PauseMark({ A, B }: { A: { x: number; y: number }; B: { x: number; y: number } }) {
  // Drawn near the paused sender, a fifth of the way along the link.
  const x = A.x + (B.x - A.x) * 0.2;
  const y = A.y + (B.y - A.y) * 0.2;
  return (
    <g transform={`translate(${x},${y})`} className="fab-pause">
      <circle r={8} />
      <rect x={-3.5} y={-4} width={2.4} height={8} />
      <rect x={1.1} y={-4} width={2.4} height={8} />
    </g>
  );
}

function Jobs({ result, frame }: { result: SimResult | null; frame?: Record<string, number> }) {
  if (!result) return null;
  return (
    <table className="fab-jobs">
      <thead>
        <tr>
          <th>Job</th>
          <th>Progress</th>
          <th className="num">Completion</th>
          <th className="num">Drops</th>
        </tr>
      </thead>
      <tbody>
        {result.jobs.map((j) => (
          <tr key={j.id}>
            <td>{j.name}</td>
            <td>
              <span className="fab-bar">
                <i style={{ width: `${Math.round((frame?.[j.id] ?? 0) * 100)}%` }} />
              </span>
            </td>
            <td className={`num ${j.done ? "" : "hot"}`}>{j.done ? `${j.jctUs} µs` : "did not finish"}</td>
            <td className={`num ${j.dropKb >= 1 ? "hot" : ""}`}>{j.dropKb >= 1 ? `${fmtKb(j.dropKb)}` : "0"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const fmtKb = (kb: number) => (kb >= 1000 ? `${(kb / 1000).toFixed(1)} MB` : `${Math.round(kb)} KB`);

function Toggle({ label, on, set, cli }: { label: string; on: boolean; set: (v: boolean) => void; cli?: string }) {
  return (
    <label className="fab-field">
      <span>{label}</span>
      <button type="button" className={`fab-toggle ${on ? "on" : ""}`} aria-pressed={on} onClick={() => set(!on)}>
        {on ? "on" : "off"}
      </button>
      {cli && <code>{cli}</code>}
    </label>
  );
}

function Num({ label, value, set, unit, cli, step = 50 }: { label: string; value: number; set: (v: number) => void; unit: string; cli?: string; step?: number }) {
  return (
    <label className="fab-field">
      <span>{label}</span>
      <span className="fab-num">
        <input type="number" value={value} step={step} min={0} onChange={(e) => set(Math.max(0, +e.target.value))} />
        <small>{unit}</small>
      </span>
      {cli && <code>{cli}</code>}
    </label>
  );
}

function Choice<T extends string | number>({ label, value, options, set, cli }: { label: string; value: T; options: [T, string][]; set: (v: T) => void; cli?: string }) {
  return (
    <label className="fab-field">
      <span>{label}</span>
      <select className="fab-select" value={String(value)} onChange={(e) => set(options.find(([v]) => String(v) === e.target.value)![0])}>
        {options.map(([v, l]) => (
          <option key={String(v)} value={String(v)}>
            {l}
          </option>
        ))}
      </select>
      {cli && <code>{cli}</code>}
    </label>
  );
}

function SwitchPanel({ id, cfg, result, edit }: { id: string; cfg: SwitchCfg; result: SimResult | null; edit: (fn: (f: Fabric) => void) => void }) {
  const set = (fn: (s: SwitchCfg) => void) => edit((f) => fn(f.switches[id]));
  const name = id.startsWith("S") ? `SPINE${id.slice(1)}` : `LEAF${id.slice(1)}`;
  const rows = result ? Object.entries(result.links).filter(([dl]) => dl.startsWith(`${id}>`)) : [];
  const ingress = result ? Object.entries(result.links).filter(([dl]) => dl.endsWith(`>${id}`)) : [];
  const mtuDrops = ingress.reduce((s, [, v]) => s + v.mtuKb, 0);
  return (
    <div className="fab-panel">
      <div className="fab-panel-head">
        <span className="silk">Switch</span>
        <h3 className="display">{name}</h3>
      </div>
      <fieldset>
        <legend className="silk">No-drop class (RoCE, qos-group 3)</legend>
        <label className="fab-field">
          <span>Classified DSCP</span>
          <span className="fab-chips">
            {[24, 26, 46].map((d) => (
              <button
                key={d}
                type="button"
                className={`fab-chip ${cfg.noDropDscp.includes(d) ? "on" : ""}`}
                onClick={() => set((s) => (s.noDropDscp = s.noDropDscp.includes(d) ? s.noDropDscp.filter((x) => x !== d) : [...s.noDropDscp, d].sort()))}
              >
                {d}
              </button>
            ))}
          </span>
          <code>{cfg.noDropDscp.length ? `match dscp ${cfg.noDropDscp.join(",")}` : "! nothing classified as RoCE"}</code>
        </label>
        <Toggle label="PFC" on={cfg.pfc} set={(v) => set((s) => (s.pfc = v))} cli={cfg.pfc ? "pause pfc-cos 3 · priority-flow-control mode on" : "no pause pfc-cos 3"} />
        <Num label="PFC pause threshold (xOFF)" value={cfg.xoff} unit="KB" set={(v) => set((s) => (s.xoff = v))} />
        <Choice label="MTU" value={cfg.mtu} options={[[1500, "1500"], [9216, "9216"]]} set={(v) => set((s) => (s.mtu = v))} cli={`mtu ${cfg.mtu}`} />
      </fieldset>
      <fieldset>
        <legend className="silk">ECN (WRED marking on queue 3)</legend>
        <Toggle label="ECN marking" on={cfg.ecn} set={(v) => set((s) => (s.ecn = v))} />
        <Num label="Minimum threshold" value={cfg.kmin} unit="KB" set={(v) => set((s) => (s.kmin = v))} />
        <Num label="Maximum threshold" value={cfg.kmax} unit="KB" set={(v) => set((s) => (s.kmax = v))} />
        <code className="fab-cli">
          {cfg.ecn ? `random-detect minimum-threshold ${cfg.kmin} kbytes maximum-threshold ${cfg.kmax} kbytes drop-probability 7 weight 0 ecn` : "! no random-detect … ecn on queue 3"}
        </code>
      </fieldset>
      <fieldset>
        <legend className="silk">Load balancing and protection</legend>
        <Choice
          label="ECMP hash"
          value={cfg.hash}
          options={[
            ["l3", "IP addresses only"],
            ["l3l4", "IP addresses + L4 ports"],
          ]}
          set={(v) => set((s) => (s.hash = v))}
          cli={cfg.hash === "l3l4" ? "ip load-sharing address source-destination port source-destination" : "ip load-sharing address source-destination"}
        />
        <Toggle label="Dynamic load balancing (flowlet)" on={cfg.dlb} set={(v) => set((s) => (s.dlb = v))} />
        <Toggle label="PFC watchdog" on={cfg.watchdog} set={(v) => set((s) => (s.watchdog = v))} cli={cfg.watchdog ? "priority-flow-control watch-dog-interval on" : "priority-flow-control watch-dog-interval off"} />
      </fieldset>
      <button className="sw fab-all" onClick={() => edit((f) => Object.keys(f.switches).forEach((k) => (f.switches[k] = structuredClone(cfg))))}>
        Apply these settings to every switch
      </button>
      {result && (
        <div className="fab-counters">
          <span className="silk">Counters (this run, per egress port)</span>
          <table>
            <thead>
              <tr>
                <th>Port →</th>
                <th className="num">Tx</th>
                <th className="num" title="Time this port was held by PFC pause frames from the neighbour">Paused</th>
                <th className="num">ECN</th>
                <th className="num">Drops</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([dl, v]) => (
                <tr key={dl}>
                  <td>{dl.split(">")[1]}</td>
                  <td className="num">{fmtKb(v.kb)}</td>
                  <td className={`num ${v.pausedUs ? "hot" : ""}`}>{v.pausedUs} µs</td>
                  <td className="num">{fmtKb(v.ecnKb)}</td>
                  <td className={`num ${v.dropKb + v.stompKb >= 1 ? "hot" : ""}`}>
                    {fmtKb(v.dropKb + v.stompKb)}
                    {v.wdEvents ? " (WD)" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {mtuDrops >= 1 && <p className="fab-warn">Oversized frames discarded on arrival: {fmtKb(mtuDrops)}</p>}
        </div>
      )}
    </div>
  );
}

function HostPanel({ id, fabric, result, edit }: { id: string; fabric: Fabric; result: SimResult | null; edit: (fn: (f: Fabric) => void) => void }) {
  const cfg = fabric.hosts[id];
  const set = (fn: (h: HostCfg) => void) => edit((f) => fn(f.hosts[id]));
  const leaf = leafOf(fabric, id);
  const out = result?.links[`${id}>${leaf}`];
  const inn = result?.links[`${leaf}>${id}`];
  const myFlows = result?.flows.filter((f) => f.src === id) ?? [];
  const minRate = myFlows.length ? Math.min(...myFlows.map((f) => f.minRateGbps)) : null;
  const stuck = fabric.stuck.includes(id);
  return (
    <div className="fab-panel">
      <div className="fab-panel-head">
        <span className="silk">GPU NIC · on LEAF{leaf.slice(1)}</span>
        <h3 className="display">{id}</h3>
      </div>
      {stuck && <p className="fab-warn">This NIC is hung: it receives nothing and sends PFC pause frames non-stop.</p>}
      <fieldset>
        <legend className="silk">RoCEv2 settings</legend>
        <Choice
          label="DSCP marking"
          value={cfg.dscp}
          options={[
            [26, "26"],
            [24, "24"],
            [0, "0 (default)"],
          ]}
          set={(v) => set((h) => (h.dscp = v))}
        />
        <Toggle label="PFC on priority 3" on={cfg.pfc} set={(v) => set((h) => (h.pfc = v))} />
        <Toggle label="DCQCN (react to ECN)" on={cfg.dcqcn} set={(v) => set((h) => (h.dcqcn = v))} />
        <Choice
          label="RoCE MTU"
          value={cfg.mtu}
          options={[
            [1024, "1024"],
            [2048, "2048"],
            [4096, "4096"],
          ]}
          set={(v) => set((h) => (h.mtu = v))}
        />
        <Choice
          label="QPs per connection"
          value={cfg.qps}
          options={[
            [1, "1"],
            [2, "2"],
            [4, "4"],
            [8, "8"],
          ]}
          set={(v) => set((h) => (h.qps = v))}
        />
        <Toggle label="Switch port enabled" on={cfg.up} set={(v) => set((h) => (h.up = v))} cli={cfg.up ? "no shutdown" : "shutdown"} />
        <Toggle label="Simulate a hung NIC" on={stuck} set={(v) => edit((f) => (f.stuck = v ? [...f.stuck, id] : f.stuck.filter((x) => x !== id)))} />
      </fieldset>
      <button className="sw fab-all" onClick={() => edit((f) => Object.keys(f.hosts).forEach((k) => (f.hosts[k] = { ...structuredClone(cfg) })))}>
        Apply these settings to every NIC
      </button>
      {result && out && inn && (
        <div className="fab-counters">
          <span className="silk">Counters (this run)</span>
          <dl>
            <dt>Sent</dt>
            <dd>{fmtKb(out.kb)}</dd>
            <dt>Paused by the leaf</dt>
            <dd className={out.pausedUs ? "hot" : ""}>{out.pausedUs} µs</dd>
            <dt>Received</dt>
            <dd>{fmtKb(inn.kb)}</dd>
            <dt>CRC errors (both ways)</dt>
            <dd className={out.crcKb + inn.crcKb >= 1 ? "hot" : ""}>{fmtKb(out.crcKb + inn.crcKb)}</dd>
            {minRate !== null && (
              <>
                <dt>Lowest DCQCN rate</dt>
                <dd>{minRate.toFixed(0)} Gb/s</dd>
              </>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}

function LinkPanel({ a, b, fabric, result, edit }: { a: string; b: string; fabric: Fabric; result: SimResult | null; edit: (fn: (f: Fabric) => void) => void }) {
  const k = linkKey(a, b);
  const st = fabric.links[k] ?? {};
  const ab = result?.links[`${a}>${b}`];
  const ba = result?.links[`${b}>${a}`];
  const setLink = (fn: (l: { down?: boolean; crc?: number }) => void) =>
    edit((f) => {
      const l = (f.links[k] ??= {});
      fn(l);
    });
  return (
    <div className="fab-panel">
      <div className="fab-panel-head">
        <span className="silk">Link</span>
        <h3 className="display">
          {a} ⇄ {b}
        </h3>
      </div>
      <fieldset>
        <legend className="silk">State</legend>
        <Toggle label="Link up" on={!st.down} set={(v) => setLink((l) => (l.down = !v))} cli={st.down ? "shutdown" : "no shutdown"} />
        {st.crc ? (
          <button className="sw" onClick={() => setLink((l) => delete l.crc)}>
            Replace the optic
          </button>
        ) : (
          <button className="sw" onClick={() => setLink((l) => (l.crc = 0.02))}>
            Inject a bad optic (2% CRC)
          </button>
        )}
      </fieldset>
      {ab && ba && (
        <div className="fab-counters">
          <span className="silk">Counters (this run)</span>
          <table>
            <thead>
              <tr>
                <th>Direction</th>
                <th className="num">Tx</th>
                <th className="num">Paused</th>
                <th className="num">CRC</th>
                <th className="num">Drops</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  [`${a} → ${b}`, ab],
                  [`${b} → ${a}`, ba],
                ] as const
              ).map(([n, v]) => (
                <tr key={n}>
                  <td>{n}</td>
                  <td className="num">{fmtKb(v.kb)}</td>
                  <td className={`num ${v.pausedUs ? "hot" : ""}`}>{v.pausedUs} µs</td>
                  <td className={`num ${v.crcKb >= 1 ? "hot" : ""}`}>{fmtKb(v.crcKb)}</td>
                  <td className={`num ${v.dropKb >= 1 ? "hot" : ""}`}>{fmtKb(v.dropKb)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
