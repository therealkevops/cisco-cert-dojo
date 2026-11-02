"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { recordSan, useProgress } from "@/lib/progress";
import { evaluate, gradeSan, type SanFabric, type SanGoalResult, type SanScenario } from "@/lib/san";
import { runSanCli, sanComplete, sanHelp, sanPrompt, type SanSession } from "@/lib/san-cli";
import { Console, type ConsoleLine } from "../bench/Console";
import { Rich } from "../Rich";

type Term = { session: SanSession; lines: ConsoleLine[]; history: string[] };

const X = (v: number) => 46 + v * 5.5;
const Y = (v: number) => 30 + v * 2.6;

export function SanLab({ scenario }: { scenario: SanScenario }) {
  const p = useProgress();
  const [fabric, setFabric] = useState<SanFabric>(() => structuredClone(scenario.fabric));
  const switches = scenario.fabric.switches.map((s) => s.id);
  const fresh = (): Record<string, Term> =>
    Object.fromEntries(switches.map((id) => [id, { session: { sw: id, mode: { m: "exec" } }, lines: [{ kind: "sys", text: `${id} console. Type ? for help, Tab to complete.` }], history: [] }]));
  const [terms, setTerms] = useState<Record<string, Term>>(fresh);
  const [cur, setCur] = useState(switches[0]);
  const [goals, setGoals] = useState<SanGoalResult[] | null>(null);
  const [hint, setHint] = useState(false);
  const [solution, setSolution] = useState(false);
  const r = useMemo(() => evaluate(fabric), [fabric]);
  const t = terms[cur];

  const push = (id: string, fn: (t: Term) => Term) => setTerms((prev) => ({ ...prev, [id]: fn(prev[id]) }));
  const run = (line: string) => {
    const res = runSanCli(line, t.session, fabric);
    if (res.fabric) {
      setFabric(res.fabric);
      setGoals(null);
    }
    push(cur, (x) => ({
      session: res.session,
      history: line.trim() ? [line, ...x.history].slice(0, 100) : x.history,
      lines: [...x.lines, { kind: "in" as const, text: `${sanPrompt(x.session)}${line}` }, ...(res.out ? [{ kind: "out" as const, text: res.out }] : [])].slice(-400),
    }));
  };
  const check = () => {
    const g = gradeSan(fabric, scenario.goals);
    setGoals(g);
    if (g.every((x) => x.ok)) recordSan(scenario.id);
  };
  const reset = () => {
    setFabric(structuredClone(scenario.fabric));
    setTerms(fresh());
    setGoals(null);
  };

  const devLogin = (id: string) => r.logins.find((l) => l.dev === id);

  return (
    <main className="page san">
      <section className="fab-head">
        <div>
          <span className="silk">
            SAN Lab · DCCOR {scenario.objective}
            {p.san[scenario.id] ? " · solved ✓" : ""}
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
          <Link className="sw" href="/san">
            All SAN labs
          </Link>
          <button className="sw" onClick={reset}>
            Reset
          </button>
        </div>
      </section>

      <div className="san-grid">
        <section className="san-map" aria-label="Fabric diagram">
          <svg viewBox="0 0 640 320" role="img" aria-label="SAN topology">
            {fabric.links.map(([a, b], i) => {
              const isl = r.isls.find((x) => x.a[0] === a[0] && x.a[1] === a[1] && x.b[0] === b[0]);
              const np = !isl && r.logins.some((l) => l.ok && l.via?.startsWith(`${a[0]} ${a[1]}`));
              const up = isl ? isl.up && !isl.isolated.length : np;
              const [ax, ay] = scenario.pos[a[0]];
              const [bx, by] = scenario.pos[b[0]];
              const off = (i - (fabric.links.length - 1) / 2) * 30;
              return (
                <g key={i} className={`san-link ${up ? "up" : "down"}`}>
                  <line x1={X(ax)} y1={Y(ay) + off} x2={X(bx)} y2={Y(by) + off} />
                  <text x={X(ax) + (X(bx) > X(ax) ? 60 : -60)} y={Y(ay) + off - 5} textAnchor={X(bx) > X(ax) ? "start" : "end"}>
                    {a[1]}
                  </text>
                  <text x={X(bx) + (X(ax) > X(bx) ? 60 : -60)} y={Y(by) + off - 5} textAnchor={X(ax) > X(bx) ? "start" : "end"}>
                    {b[1]}
                  </text>
                  <text x={(X(ax) + X(bx)) / 2} y={(Y(ay) + Y(by)) / 2 + off - 5} textAnchor="middle" className="san-link-kind">
                    {isl ? (fabric.switches.find((s) => s.id === a[0])!.ports.find((x) => x.name === a[1])!.trunk ? "TE" : "E") : "NP → F"}
                  </text>
                </g>
              );
            })}
            {fabric.devices.map((d) => {
              const [sx, sy] = scenario.pos[d.at[0]];
              const [dx, dy] = scenario.pos[d.id];
              const ok = devLogin(d.id)?.ok;
              return (
                <g key={d.id} className={`san-link ${ok ? "up" : "down"}`}>
                  <line x1={X(dx)} y1={Y(dy)} x2={X(sx)} y2={Y(sy)} />
                  <text x={X(sx) + (X(dx) - X(sx)) * 0.3} y={Y(sy) + (Y(dy) - Y(sy)) * 0.3 - 6} textAnchor="middle">
                    {d.at[1]}
                  </text>
                </g>
              );
            })}
            {fabric.switches.map((s) => {
              const [x, y] = scenario.pos[s.id];
              return (
                <g key={s.id} className={`san-sw ${cur === s.id ? "on" : ""}`} onClick={() => setCur(s.id)} role="button" aria-label={`Console on ${s.id}`}>
                  <rect x={X(x) - 56} y={Y(y) - 24} width={112} height={48} rx={4} />
                  <text x={X(x)} y={Y(y) - 3} textAnchor="middle" className="san-sw-name">
                    {s.id}
                  </text>
                  <text x={X(x)} y={Y(y) + 13} textAnchor="middle" className="san-sw-sub">
                    {s.npv ? "NPV mode" : `domain ${s.domain}`}
                  </text>
                </g>
              );
            })}
            {fabric.devices.map((d) => {
              const [x, y] = scenario.pos[d.id];
              const ok = devLogin(d.id)?.ok;
              return (
                <g key={d.id} className={`san-dev ${d.kind}`}>
                  <rect x={X(x) - 48} y={Y(y) - 15} width={96} height={30} rx={d.kind === "hba" ? 20 : 3} />
                  <circle cx={X(x) - 36} cy={Y(y)} r={5} className={ok ? "led ok" : "led"} />
                  <text x={X(x) + 5} y={Y(y) + 4} textAnchor="middle">
                    {d.label}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="san-legend silk">
            Green link: logged in / ISL up · red: down or isolated · click a switch to open its console
          </p>
        </section>

        <section className="san-term" aria-label="Switch console">
          <div className="san-tabs" role="tablist">
            {switches.map((id) => (
              <button key={id} role="tab" aria-selected={cur === id} className={cur === id ? "on" : ""} onClick={() => setCur(id)}>
                {id}
              </button>
            ))}
          </div>
          <div className="san-con">
            <Console
              key={cur}
              lines={t.lines}
              prompt={sanPrompt(t.session)}
              history={t.history}
              onRun={run}
              onHelp={(l) => push(cur, (x) => ({ ...x, lines: [...x.lines, { kind: "in", text: `${sanPrompt(x.session)}${l}` }, { kind: "out", text: sanHelp(l, x.session) }] }))}
              onComplete={(l) => sanComplete(l, t.session)}
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
