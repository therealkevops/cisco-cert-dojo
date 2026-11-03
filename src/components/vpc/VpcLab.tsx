"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { recordVpc, useProgress } from "@/lib/progress";
import { evaluate, gradeVpc, type VpcGoalResult, type VpcLab as Lab, type VpcScenario } from "@/lib/vpc";
import { runVpcCli, vpcComplete, vpcHelp, vpcPrompt, type VpcSession } from "@/lib/vpc-cli";
import { Console, type ConsoleLine } from "../bench/Console";
import { Rich } from "../Rich";

type Term = { session: VpcSession; lines: ConsoleLine[]; history: string[] };

const SW_X = [190, 450];
const SW_Y = 110;
const DEV_Y = 270;

export function VpcLab({ scenario }: { scenario: VpcScenario }) {
  const p = useProgress();
  const [lab, setLab] = useState<Lab>(() => structuredClone(scenario.lab));
  const ids = scenario.lab.switches.map((s) => s.id);
  const fresh = (): Record<string, Term> =>
    Object.fromEntries(
      scenario.lab.switches.map((s) => [s.id, { session: { sw: s.id, mode: { m: "exec" } }, lines: [{ kind: "sys", text: s.offline ? `${s.id} is powered off.` : `${s.id} console. Type ? for help, Tab to complete.` }], history: [] }]),
    );
  const [terms, setTerms] = useState<Record<string, Term>>(fresh);
  const [cur, setCur] = useState(scenario.lab.switches.find((s) => !s.offline)?.id ?? ids[0]);
  const [goals, setGoals] = useState<VpcGoalResult[] | null>(null);
  const [hint, setHint] = useState(false);
  const [solution, setSolution] = useState(false);
  const r = useMemo(() => evaluate(lab), [lab]);
  const t = terms[cur];

  const push = (id: string, fn: (t: Term) => Term) => setTerms((prev) => ({ ...prev, [id]: fn(prev[id]) }));
  const run = (line: string) => {
    const res = runVpcCli(line, t.session, lab);
    if (res.lab) {
      setLab(res.lab);
      setGoals(null);
    }
    push(cur, (x) => ({
      session: res.session,
      history: line.trim() ? [line, ...x.history].slice(0, 100) : x.history,
      lines: [...x.lines, { kind: "in" as const, text: `${vpcPrompt(x.session)}${line}` }, ...(res.out ? [{ kind: "out" as const, text: res.out }] : [])].slice(-400),
    }));
  };
  const check = () => {
    const g = gradeVpc(lab, scenario.goals);
    setGoals(g);
    if (g.every((x) => x.ok)) recordVpc(scenario.id);
  };
  const reset = () => {
    setLab(structuredClone(scenario.lab));
    setTerms(fresh());
    setGoals(null);
  };

  const devs = lab.devices;
  const devX = (i: number) => (devs.length === 1 ? 320 : 110 + (i * 420) / (devs.length - 1));
  const swX = (id: string) => SW_X[ids.indexOf(id)];

  return (
    <main className="page san">
      <section className="fab-head">
        <div>
          <span className="silk">
            vPC Lab · DCCOR {scenario.objective}
            {p.vpc[scenario.id] ? " · solved ✓" : ""}
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
          <Link className="sw" href="/vpc">
            All vPC labs
          </Link>
          <button className="sw" onClick={reset}>
            Reset
          </button>
        </div>
      </section>

      <div className="san-grid">
        <section className="san-map" aria-label="vPC diagram">
          <svg viewBox="0 0 640 320" role="img" aria-label="vPC topology">
            <g className={`san-link vpc-ka ${r.keepalive.up ? "up" : "down"}`}>
              <path d={`M ${SW_X[0]} ${SW_Y - 26} C ${SW_X[0]} 30, ${SW_X[1]} 30, ${SW_X[1]} ${SW_Y - 26}`} fill="none" />
              <text x={320} y={40} textAnchor="middle">
                peer-keepalive · mgmt0 · {r.keepalive.up ? "alive" : "not reachable"}
              </text>
            </g>
            <g className={`san-link vpc-pl ${r.peerLink.up ? "up" : "down"}`}>
              <line x1={SW_X[0] + 60} y1={SW_Y - 6} x2={SW_X[1] - 60} y2={SW_Y - 6} />
              <line x1={SW_X[0] + 60} y1={SW_Y + 6} x2={SW_X[1] - 60} y2={SW_Y + 6} />
              <text x={320} y={SW_Y - 14} textAnchor="middle">
                Po1 peer-link
              </text>
              <text x={320} y={SW_Y + 24} textAnchor="middle" className="san-link-kind">
                {r.adjacency.ok ? "ADJACENCY OK" : "NO ADJACENCY"}
              </text>
            </g>
            {devs.map((d, i) =>
              d.links.map(([sw, port]) => {
                const leg = r.legs.find((l) => l.dev === d.id && l.sw === sw && l.port === port);
                const up = !!leg?.forwards.length;
                const x1 = devX(i);
                const x2 = swX(sw);
                return (
                  <g key={`${d.id}-${sw}`} className={`san-link ${up ? "up" : "down"}`}>
                    <line x1={x1} y1={DEV_Y - 15} x2={x2 + (x1 - x2) * 0.12} y2={SW_Y + 24} />
                    <text x={x1 + (x2 - x1) * 0.14 + (x2 > x1 ? 6 : -6)} y={DEV_Y - 15 - (DEV_Y - SW_Y - 39) * 0.14} textAnchor={x2 > x1 ? "start" : "end"}>
                      {port.replace("Ethernet", "e")}
                    </text>
                  </g>
                );
              }),
            )}
            {lab.switches.map((s, i) => (
              <g key={s.id} className={`san-sw ${cur === s.id ? "on" : ""} ${s.offline ? "off" : ""}`} onClick={() => setCur(s.id)} role="button" aria-label={`Console on ${s.id}`}>
                <rect x={SW_X[i] - 60} y={SW_Y - 24} width={120} height={48} rx={4} />
                <text x={SW_X[i]} y={SW_Y - 3} textAnchor="middle" className="san-sw-name">
                  {s.id}
                </text>
                <text x={SW_X[i]} y={SW_Y + 13} textAnchor="middle" className="san-sw-sub">
                  {s.offline ? "powered off" : (r.role[s.id] ?? "no role")}
                </text>
              </g>
            ))}
            {devs.map((d, i) => {
              const ok = r.legs.filter((l) => l.dev === d.id).every((l) => l.forwards.length);
              return (
                <g key={d.id} className="san-dev hba">
                  <rect x={devX(i) - 50} y={DEV_Y - 15} width={100} height={30} rx={d.kind === "switch" ? 3 : 15} />
                  <circle cx={devX(i) - 38} cy={DEV_Y} r={5} className={ok ? "led ok" : "led"} />
                  <text x={devX(i) + 5} y={DEV_Y + 4} textAnchor="middle">
                    {d.label}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="san-legend silk">Green: forwarding · red: down or suspended · click a switch to open its console</p>
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
              prompt={vpcPrompt(t.session)}
              history={t.history}
              onRun={run}
              onHelp={(l) => push(cur, (x) => ({ ...x, lines: [...x.lines, { kind: "in", text: `${vpcPrompt(x.session)}${l}` }, { kind: "out", text: vpcHelp(l, x.session) }] }))}
              onComplete={(l) => vpcComplete(l, t.session)}
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
            Check the pair
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
