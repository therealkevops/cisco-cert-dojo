"use client";

import { useEffect, useRef } from "react";
import type { ProbeResult, SimEvent } from "@/lib/net/engine";

export type Run = { kind: "ping" | "trace"; src: string; dst: string; header: string; probes: ProbeResult[]; error?: string };

type Props = {
  run: Run;
  nameOf: (ip: string) => string;
  probe: number;
  setProbe: (n: number) => void;
  events: SimEvent[];
  cursor: number;
  setCursor: (n: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  showAll: boolean;
  setShowAll: (b: boolean) => void;
};

const KIND_LABEL: Record<SimEvent["kind"], string> = { tx: "WIRE", proc: "DECIDE", drop: "DROP", deliver: "DELIVER", ignore: "IGNORE", filter: "FILTER" };

function consoleText(run: Run, nameOf: (ip: string) => string) {
  if (run.error) return `${run.src}> ${run.kind === "ping" ? "ping" : "tracert"} ${run.dst}\n% ${run.error}`;
  if (run.kind === "ping") {
    const ok = run.probes.filter((p) => p.mark === "!").length;
    return [
      `${run.src}> ping ${run.dst}`,
      `Sending ${run.probes.length} ICMP echos to ${run.dst} (${nameOf(run.dst)}):`,
      run.probes.map((p) => p.mark).join(""),
      `Success rate is ${Math.round((ok / run.probes.length) * 100)} percent (${ok}/${run.probes.length})`,
    ].join("\n");
  }
  const lines = [`${run.src}> tracert ${run.dst}`, `Tracing route to ${run.dst} (${nameOf(run.dst)}) over a maximum of 12 hops`, ""];
  for (const p of run.probes) {
    lines.push(`  ${String(p.seq).padStart(2)}   ${p.mark === "." ? "*        Request timed out." : `${(p.from ?? "").padEnd(15)} ${nameOf(p.from ?? "")}${p.mark === "U" ? "  !U (unreachable)" : ""}`}`);
  }
  const last = run.probes[run.probes.length - 1];
  lines.push("", last?.from === run.dst ? "Trace complete." : "Trace did not reach the destination.");
  return lines.join("\n");
}

function Pdu({ e }: { e: SimEvent }) {
  const f = e.frame;
  return (
    <div className="pdu">
      {f.src && (
        <div className="pdu-layer">
          <span className="silk">L2 · Ethernet II</span>
          <span>
            dst <b>{f.dst}</b> src <b>{f.src}</b>
          </span>
          {e.tag !== undefined && (
            <span>
              802.1Q tag <b>VLAN {e.tag}</b>
            </span>
          )}
          <span>type {f.arp ? "0x0806 ARP" : "0x0800 IPv4"}</span>
        </div>
      )}
      {f.arp && (
        <div className="pdu-layer">
          <span className="silk">L2.5 · ARP {f.arp.op}</span>
          <span>
            {f.arp.op === "request" ? (
              <>
                who has <b>{f.arp.targetIp}</b>? tell {f.arp.senderIp} ({f.arp.senderMac})
              </>
            ) : (
              <>
                <b>{f.arp.senderIp}</b> is at <b>{f.arp.senderMac}</b>
              </>
            )}
          </span>
        </div>
      )}
      {f.ip && (
        <>
          <div className="pdu-layer">
            <span className="silk">L3 · IPv4</span>
            <span>
              src <b>{f.ip.src}</b> dst <b>{f.ip.dst}</b> ttl <b>{f.ip.ttl}</b> proto 1 (ICMP)
            </span>
          </div>
          <div className="pdu-layer">
            <span className="silk">L4 · ICMP</span>
            <span>
              {f.ip.icmp.type} · seq {f.ip.icmp.seq}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export function PacketWalk({ run, nameOf, probe, setProbe, events, cursor, setCursor, playing, setPlaying, showAll, setShowAll }: Props) {
  const e = events[cursor];
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    // Scroll only the list itself; scrollIntoView would also move the page.
    const box = list.current;
    const el = box?.querySelector<HTMLElement>(".cur");
    if (!box || !el) return;
    if (el.offsetTop < box.scrollTop) box.scrollTop = el.offsetTop;
    else if (el.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = el.offsetTop + el.offsetHeight - box.clientHeight;
  }, [cursor]);

  return (
    <section className="walk" aria-label="Packet walk">
      <pre className="cli walk-console">{consoleText(run, nameOf)}</pre>

      {run.probes.length > 0 && (
        <>
          <div className="walk-bar">
            <div className="radio-sw" role="tablist" aria-label={run.kind === "ping" ? "Echo" : "Hop"}>
              {run.probes.map((p, i) => (
                <button key={i} role="tab" aria-selected={i === probe} className={i === probe ? "on" : ""} onClick={() => setProbe(i)} title={`${run.kind === "ping" ? "echo" : "hop"} ${p.seq}`}>
                  {p.mark === "!" ? "!" : p.mark === "U" ? "U" : "."} {p.seq}
                </button>
              ))}
            </div>
            <div className="walk-ctl">
              <button className="sw" onClick={() => setCursor(0)} aria-label="First event">
                ⏮
              </button>
              <button className="sw" onClick={() => setCursor(Math.max(0, cursor - 1))} aria-label="Previous event">
                ◀
              </button>
              <button className="sw primary" onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause" : "Play"}>
                {playing ? "❚❚" : "▶ play"}
              </button>
              <button className="sw" onClick={() => setCursor(Math.min(events.length - 1, cursor + 1))} aria-label="Next event">
                ▶
              </button>
              <button className="sw" onClick={() => setCursor(events.length - 1)} aria-label="Last event">
                ⏭
              </button>
            </div>
            <label className="silk walk-all">
              <input type="checkbox" checked={showAll} onChange={(ev) => setShowAll(ev.target.checked)} /> show ignored copies
            </label>
          </div>

          <input
            className="scrub"
            type="range"
            min={0}
            max={Math.max(0, events.length - 1)}
            value={cursor}
            onChange={(ev) => {
              setPlaying(false);
              setCursor(Number(ev.target.value));
            }}
            aria-label="Event scrubber"
          />

          {e && (
            <div className="walk-now">
              <div className="walk-now-head">
                <span className={`kind k-${e.kind}`}>{KIND_LABEL[e.kind]}</span>
                <b>{e.dev}</b>
                <span className="silk num">
                  event {cursor + 1}/{events.length}
                </span>
              </div>
              <p className="walk-note">{e.note}</p>
              <Pdu e={e} />
            </div>
          )}

          <ol className="walk-list" ref={list}>
            {events.map((ev, i) => (
              <li key={ev.id} className={`${i === cursor ? "cur" : ""} ${i > cursor ? "future" : ""}`} onClick={() => setCursor(i)}>
                <span className={`kind k-${ev.kind}`}>{KIND_LABEL[ev.kind]}</span>
                <span className="dev">{ev.dev}</span>
                <span className="txt">{ev.kind === "tx" ? ev.note : ev.note.split(". ")[0]}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
