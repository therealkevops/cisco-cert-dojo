"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { scenarioById } from "@/data/wire";
import { Net } from "@/lib/net/engine";
import { gradeGoals, type GoalResult } from "@/lib/net/grade";
import type { Topology } from "@/lib/net/types";
import { recordWire, useProgress } from "@/lib/progress";
import { Rich } from "../Rich";
import { PacketWalk, type Run } from "./PacketWalk";
import { WireCanvas, vlanColor, type Lens } from "./WireCanvas";
import { WireInspector } from "./WireInspector";

export function WireRoom({ scenarioId }: { scenarioId: string }) {
  const sc = scenarioById[scenarioId];
  const p = useProgress();
  const [topo, setTopo] = useState<Topology>(() => structuredClone(sc.topology));
  const [net, setNet] = useState(() => new Net(sc.topology));
  const [tick, setTick] = useState(0);
  const [lens, setLens] = useState<Lens>("l3");
  const allVlans = useMemo(() => net.vlans(), [net]);
  const [vlan, setVlan] = useState(allVlans[0] ?? 1);
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState<"ping" | "trace">("ping");
  const [src, setSrc] = useState(sc.topology.devices.find((d) => d.kind === "pc")?.id ?? sc.topology.devices[0].id);
  const [dst, setDst] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [probe, setProbe] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [grades, setGrades] = useState<GoalResult[] | null>(null);
  const [hint, setHint] = useState(false);
  const [edits, setEdits] = useState(0);

  const addresses = useMemo(() => net.addresses(), [net]);
  const nameOf = useCallback((ip: string) => addresses.find((a) => a.ip === ip)?.dev ?? "", [addresses]);

  const events = useMemo(() => {
    const evs = run?.probes[probe]?.events ?? [];
    return showAll ? evs : evs.filter((e) => e.kind !== "ignore");
  }, [run, probe, showAll]);
  const shown = useMemo(() => events.slice(0, cursor + 1), [events, cursor]);

  const mutate = useCallback(
    (fn: (t: Topology) => void) => {
      const next = structuredClone(topo);
      fn(next);
      setTopo(next);
      setNet(new Net(next));
      setRun(null);
      setGrades(null);
      setEdits((n) => n + 1);
    },
    [topo],
  );

  const reset = () => {
    setTopo(structuredClone(sc.topology));
    setNet(new Net(sc.topology));
    setRun(null);
    setGrades(null);
    setEdits(0);
  };

  const fire = useCallback(
    (from: string, toIp: string, kind: "ping" | "trace") => {
      const r = kind === "ping" ? net.ping(from, toIp, 4) : net.traceroute(from, toIp);
      setRun({ kind, src: from, dst: toIp, ...r });
      // The last probe shows the steady state (ARP warmed up); earlier ones are a click away.
      setProbe(Math.max(0, r.probes.length - 1));
      setPlaying(false);
      setTick((t) => t + 1);
      setSrc(from);
      setDst(toIp);
    },
    [net],
  );

  // Picking a destination device: prefer its address on the source's subnet, else its first address.
  const probeDevices = (from: string, to: string) => {
    const mine = net.l3Ifs(from);
    const theirs = net.l3Ifs(to).filter((i) => i.up);
    const pick = theirs.find((t) => mine.some((m) => m.cidr.net === t.cidr.net)) ?? theirs[0];
    if (!pick) {
      setRun({ kind: tool, src: from, dst: to, header: "", probes: [], error: `${to} has no IP address that is up` });
      return;
    }
    fire(from, pick.cidr.ip, tool);
  };

  // Scrubber starts at the end so the full path lights up at once.
  useEffect(() => setCursor(Math.max(0, events.length - 1)), [events]);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setCursor((c) => {
        if (c >= events.length - 1) {
          setPlaying(false);
          return c;
        }
        return c + 1;
      });
    }, 650);
    return () => clearInterval(t);
  }, [playing, events.length]);

  useEffect(() => {
    if (!allVlans.includes(vlan) && allVlans.length) setVlan(allVlans[0]);
  }, [allVlans, vlan]);

  const verify = () => {
    const g = gradeGoals(topo, sc.goals);
    setGrades(g);
    if (g.every((x) => x.ok)) recordWire(sc.id);
  };
  const solved = grades?.every((g) => g.ok);

  return (
    <main className="page wire-page">
      <section className="wire-head">
        <div>
          <span className="silk">
            <Link href="/wire">wire room</Link> / {sc.kind} · ENCOR {sc.objective} {p.wire[sc.id] ? "· solved ✓" : ""}
          </span>
          <h2 className="display" style={{ margin: "6px 0 8px" }}>
            {sc.title}
          </h2>
          <p className="lede" style={{ margin: 0 }}>
            <Rich text={sc.brief} />
          </p>
        </div>
        {sc.goals.length > 0 && (
          <div className="goals">
            <span className="silk">Acceptance checks</span>
            <ul>
              {sc.goals.map((g, i) => {
                const r = grades?.[i];
                return (
                  <li key={i} className={r ? (r.ok ? "ok" : "bad") : ""}>
                    <span className="mark">{r ? (r.ok ? "✓" : "✕") : "○"}</span>
                    <span>
                      {g.label}
                      {r && !r.ok && <small> · {r.detail}</small>}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="switches" style={{ justifyContent: "flex-start" }}>
              <button className="sw primary" onClick={verify}>
                Verify
              </button>
              {sc.hint && (
                <button className="sw" onClick={() => setHint(!hint)}>
                  {hint ? "Hide hint" : "Hint"}
                </button>
              )}
              <button className="sw" onClick={reset} disabled={!edits}>
                Reset
              </button>
            </div>
            {hint && sc.hint && <p className="goal-hint">{sc.hint}</p>}
          </div>
        )}
      </section>

      {solved && sc.debrief && (
        <div className="notice">
          <b>Ticket closed.</b> <Rich text={sc.debrief} />
        </div>
      )}

      <div className="wire-toolbar">
        <div className="radio-sw" role="radiogroup" aria-label="Lens">
          <button role="radio" aria-checked={lens === "l3"} className={lens === "l3" ? "on" : ""} onClick={() => setLens("l3")}>
            L3 lens
          </button>
          <button role="radio" aria-checked={lens === "l2"} className={lens === "l2" ? "on" : ""} onClick={() => setLens("l2")}>
            L2 lens
          </button>
        </div>
        {lens === "l2" && (
          <div className="radio-sw" role="radiogroup" aria-label="VLAN">
            {allVlans.map((v) => (
              <button key={v} role="radio" aria-checked={vlan === v} className={vlan === v ? "on" : ""} onClick={() => setVlan(v)} style={vlan === v ? { background: vlanColor(v, allVlans) } : { color: vlanColor(v, allVlans) }}>
                VLAN {v}
              </button>
            ))}
          </div>
        )}
        <span className="spacer" />
        <div className="radio-sw" role="radiogroup" aria-label="Probe">
          <button role="radio" aria-checked={tool === "ping"} className={tool === "ping" ? "on" : ""} onClick={() => setTool("ping")}>
            ping
          </button>
          <button role="radio" aria-checked={tool === "trace"} className={tool === "trace" ? "on" : ""} onClick={() => setTool("trace")}>
            traceroute
          </button>
        </div>
        <form
          className="probe-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (dst) fire(src, dst, tool);
          }}
        >
          <select className="wf" value={src} onChange={(e) => setSrc(e.target.value)} aria-label="Source">
            {net.devices
              .filter((d) => d.kind !== "switch")
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.id}
                </option>
              ))}
          </select>
          <span className="silk">→</span>
          <select className="wf" value={dst} onChange={(e) => setDst(e.target.value)} aria-label="Destination">
            <option value="">destination…</option>
            {addresses.map((a) => (
              <option key={`${a.dev}-${a.ip}`} value={a.ip}>
                {a.ip} ({a.dev} {a.iface})
              </option>
            ))}
          </select>
          <button className="sw primary" disabled={!dst}>
            Go
          </button>
        </form>
      </div>

      <div className="wire-main">
        <div className="wire-stage">
          <WireCanvas
            net={net}
            lens={lens}
            vlan={vlan}
            selected={selected}
            onSelect={setSelected}
            onProbe={probeDevices}
            shown={shown}
            current={run ? (events[cursor] ?? null) : null}
          />
          <div className="wire-legend silk">
            <span>
              <i style={{ background: "var(--amber)" }} /> request path
            </span>
            <span>
              <i style={{ background: "var(--green)" }} /> reply path
            </span>
            <span>
              <i style={{ background: "var(--muted)" }} /> ARP / flooding
            </span>
            <span>
              <i className="x" /> packet died here
            </span>
            <span>drag device → device to {tool === "ping" ? "ping" : "trace"} · click to inspect</span>
          </div>
        </div>
        {selected ? (
          <WireInspector key={selected} net={net} devId={selected} vlan={vlan} mutate={mutate} tick={tick} />
        ) : (
          <aside className="wire-inspector wire-empty">
            <span className="silk">Inspector</span>
            <p>Click a device to see its tables (routes, ARP, MAC, spanning tree) and change its config.</p>
            <p>Drag from one device onto another to send traffic. The path lights up on the map, and the packet walk below explains every decision hop by hop.</p>
          </aside>
        )}
      </div>

      {run && (
        <PacketWalk
          run={run}
          nameOf={nameOf}
          probe={probe}
          setProbe={setProbe}
          events={events}
          cursor={cursor}
          setCursor={(n) => {
            setPlaying(false);
            setCursor(n);
          }}
          playing={playing}
          setPlaying={(pl) => {
            if (pl && cursor >= events.length - 1) setCursor(0);
            setPlaying(pl);
          }}
          showAll={showAll}
          setShowAll={setShowAll}
        />
      )}
    </main>
  );
}
