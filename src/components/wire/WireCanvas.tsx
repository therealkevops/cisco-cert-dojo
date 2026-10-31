"use client";

import { useMemo, useRef, useState } from "react";
import type { Net, SimEvent } from "@/lib/net/engine";
import type { Device } from "@/lib/net/types";

export type Lens = "l3" | "l2";

type Props = {
  net: Net;
  lens: Lens;
  vlan: number;
  selected: string | null;
  onSelect: (id: string) => void;
  /** Drag from one device onto another. */
  onProbe: (from: string, to: string) => void;
  /** Events of the probe being shown, up to the scrubber position. */
  shown: SimEvent[];
  current: SimEvent | null;
};

const W = 1000;
const H = 650;

// One colour per VLAN for the L2 lens. Picked to stay legible on both themes.
const VLAN_COLORS = ["#e8a33d", "#5ab4c5", "#c77dba", "#86b86b", "#d9725f", "#8f9be0"];
export const vlanColor = (vlan: number, all: number[]) => VLAN_COLORS[Math.max(0, all.indexOf(vlan)) % VLAN_COLORS.length];

function Glyph({ d, on }: { d: Device; on: boolean }) {
  const stroke = on ? "var(--amber)" : "var(--ink-2)";
  const common = { fill: "var(--panel-hi)", stroke, strokeWidth: on ? 2 : 1.3 };
  switch (d.kind) {
    case "router":
      return (
        <g>
          <circle r={24} {...common} />
          <path d="M-12 0H12M0 -12V12M7 -5l5 5-5 5M-7 -5l-5 5 5 5" fill="none" stroke={stroke} strokeWidth={1.4} />
        </g>
      );
    case "l3switch":
      return (
        <g>
          <rect x={-34} y={-19} width={68} height={38} rx={3} {...common} />
          <path d="M-22 -6h44M-22 6h44" stroke={stroke} strokeWidth={1.2} />
          <circle r={7} fill="var(--panel-hi)" stroke={stroke} strokeWidth={1.2} />
          <text y={3.5} textAnchor="middle" fontSize={8} fill={stroke}>
            L3
          </text>
        </g>
      );
    case "switch":
      return (
        <g>
          <rect x={-32} y={-15} width={64} height={30} rx={2} {...common} />
          {[-22, -12, -2, 8, 18].map((x) => (
            <rect key={x} x={x} y={2} width={6} height={6} fill="none" stroke={stroke} strokeWidth={1} />
          ))}
          <path d="M-22 -6h44" stroke={stroke} strokeWidth={1} strokeDasharray="2 3" />
        </g>
      );
    case "server":
      return (
        <g>
          <rect x={-15} y={-24} width={30} height={48} rx={2} {...common} />
          {[-14, -4, 6].map((y) => (
            <path key={y} d={`M-9 ${y}h18`} stroke={stroke} strokeWidth={1.2} />
          ))}
          <circle cx={7} cy={16} r={1.6} fill="var(--green)" />
        </g>
      );
    default:
      return (
        <g>
          <rect x={-20} y={-18} width={40} height={27} rx={2} {...common} />
          <path d="M-8 15h16M0 9v6" stroke={stroke} strokeWidth={1.4} />
        </g>
      );
  }
}

export function WireCanvas({ net, lens, vlan, selected, onSelect, onProbe, shown, current }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ from: string; x: number; y: number } | null>(null);
  const pos = useMemo(() => new Map(net.devices.map((d) => [d.id, d])), [net]);
  const allVlans = useMemo(() => net.vlans(), [net]);
  const stp = lens === "l2" ? net.stp(vlan) : null;

  const toSvg = (e: React.PointerEvent) => {
    const m = svg.current!.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: p.x, y: p.y };
  };
  const hit = (x: number, y: number) => net.devices.find((d) => Math.hypot(d.x - x, d.y - y) < 42)?.id;

  // Wires used by the probe so far, keyed by link, with the strongest direction seen.
  const used = useMemo(() => {
    const m = new Map<string, Set<SimEvent["dir"]>>();
    for (const e of shown) {
      if (e.kind !== "tx" || !e.wire) continue;
      const k = [e.wire.from.join("|"), e.wire.to.join("|")].sort().join("~");
      m.set(k, (m.get(k) ?? new Set()).add(e.dir));
    }
    return m;
  }, [shown]);
  const drops = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of shown) if (e.kind === "drop") m.set(e.dev, (m.get(e.dev) ?? 0) + 1);
    return m;
  }, [shown]);

  return (
    <svg
      ref={svg}
      className="wire-canvas"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Network topology. Drag from one device onto another to send a ping."
      onPointerMove={(e) => drag && setDrag({ ...drag, ...toSvg(e) })}
      onPointerUp={(e) => {
        if (!drag) return;
        const p = toSvg(e);
        const target = hit(p.x, p.y);
        if (target && target !== drag.from) onProbe(drag.from, target);
        else if (target === drag.from) onSelect(drag.from);
        setDrag(null);
      }}
      onPointerLeave={() => setDrag(null)}
    >
      <defs>
        <pattern id="wire-grid" width="25" height="25" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.8" fill="var(--line-soft)" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#wire-grid)" />

      {/* links */}
      {net.topo.links.map((l) => {
        const a = pos.get(l.a[0])!;
        const b = pos.get(l.b[0])!;
        const key = [l.a.join("|"), l.b.join("|")].sort().join("~");
        const up = net.linkUp(l.a[0], l.a[1]);
        const dirs = used.get(key);
        const ap = net.port(a.id, l.a[1])!;
        const bp = net.port(b.id, l.b[1])!;
        const carriesVlan = (d: Device, p: typeof ap) => net.isSwitch(d) && net.portMode(d, p) !== "routed" && net.carries(d, p, vlan);
        const inVlan = lens === "l2" && (carriesVlan(a, ap) || carriesVlan(b, bp));
        let stroke = "var(--line)";
        let dash: string | undefined;
        if (!up) {
          stroke = "var(--red)";
          dash = "4 6";
        } else if (lens === "l2") stroke = inVlan ? vlanColor(vlan, allVlans) : "var(--line-soft)";
        const ends: [Device, string, number][] = [
          [a, l.a[1], 1],
          [b, l.b[1], -1],
        ];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const ux = (b.x - a.x) / len;
        const uy = (b.y - a.y) / len;
        return (
          <g key={key}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={lens === "l2" && inVlan ? 3 : 2} strokeDasharray={dash} />
            {dirs && (
              <>
                {dirs.has("ctl") && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--muted)" strokeWidth={6} strokeOpacity={0.35} />}
                {dirs.has("out") && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--amber)" strokeWidth={4} transform={`translate(${-uy * 3} ${ux * 3})`} />}
                {dirs.has("back") && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--green)" strokeWidth={4} transform={`translate(${uy * 3} ${-ux * 3})`} />}
              </>
            )}
            {ends.map(([d, pn, sgn]) => {
              const dist = d.kind === "pc" ? 34 : d.kind === "server" ? 40 : 48;
              const x = d.x + ux * dist * sgn;
              const y = d.y + uy * dist * sgn;
              const role = stp?.roles[`${d.id}|${pn}`];
              const p = net.port(d.id, pn)!;
              const led = !net.linkUp(d.id, pn) ? "var(--red)" : role === "alt" ? "var(--amber)" : role ? "var(--green)" : lens === "l2" && net.isSwitch(d) ? "var(--led-off)" : "var(--green)";
              const label = lens === "l2" && net.isSwitch(d) && net.portMode(d, p) === "access" ? `${pn} · v${p.vlan ?? 1}` : pn;
              return (
                <g key={pn}>
                  <circle cx={x} cy={y} r={4} fill={led} stroke="var(--bg)" strokeWidth={1.5} />
                  {role === "alt" && (
                    <text x={x} y={y + 15} textAnchor="middle" fontSize={9} fill="var(--amber)" fontWeight={600}>
                      BLK
                    </text>
                  )}
                  {/* Label sits a little further along the wire, nudged to one side of it. */}
                  <text
                    x={x + ux * 22 * sgn + (Math.abs(uy) > 0.5 ? 8 * sgn : 0)}
                    y={y + uy * 22 * sgn + (Math.abs(uy) > 0.5 ? 3 : -7)}
                    fontSize={10}
                    fill="var(--muted)"
                    textAnchor={Math.abs(uy) > 0.5 ? (sgn > 0 ? "start" : "end") : "middle"}
                  >
                    {label}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}

      {/* animated frame on the current wire */}
      {current?.kind === "tx" && current.wire && (
        <circle key={current.id} r={7} fill={current.dir === "back" ? "var(--green)" : current.dir === "out" ? "var(--amber)" : "var(--ink-2)"} stroke="var(--bg)" strokeWidth={2}>
          <animateMotion
            dur="0.45s"
            fill="freeze"
            path={`M${pos.get(current.wire.from[0])!.x} ${pos.get(current.wire.from[0])!.y} L${pos.get(current.wire.to[0])!.x} ${pos.get(current.wire.to[0])!.y}`}
          />
        </circle>
      )}

      {/* drag-to-ping rubber band */}
      {drag && (
        <line x1={pos.get(drag.from)!.x} y1={pos.get(drag.from)!.y} x2={drag.x} y2={drag.y} stroke="var(--amber)" strokeWidth={2} strokeDasharray="6 5" />
      )}

      {/* devices */}
      {net.devices.map((d) => {
        const on = selected === d.id || current?.dev === d.id;
        const ifs = net.l3Ifs(d.id);
        const sub =
          lens === "l3"
            ? d.kind === "l3switch"
              ? ifs.filter((i) => i.kind === "svi").map((i) => `v${i.vlan} .${i.cidr.ip.split(".")[3]}`).join("  ")
              : net.isHost(d)
                ? `${ifs[0]?.cidr.ip ?? "no ip"}/${ifs[0]?.cidr.len ?? ""}`
                : ""
            : net.isSwitch(d) && stp?.bridgeId[d.id]
              ? `prio ${stp.bridgeId[d.id].prio}`
              : "";
        const isRoot = lens === "l2" && stp?.rootOf[d.id] === d.id;
        const dropN = drops.get(d.id);
        return (
          <g
            key={d.id}
            transform={`translate(${d.x} ${d.y})`}
            className="wire-dev"
            tabIndex={0}
            role="button"
            aria-label={`${d.id} (${d.kind})`}
            onPointerDown={(e) => {
              (e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId);
              setDrag({ from: d.id, ...toSvg(e) });
            }}
            onKeyDown={(e) => e.key === "Enter" && onSelect(d.id)}
          >
            {current?.dev === d.id && <circle r={44} fill="none" stroke="var(--amber)" strokeOpacity={0.5} strokeDasharray="3 4" />}
            <Glyph d={d} on={on} />
            {isRoot && (
              <text y={-30} textAnchor="middle" fontSize={16} fill="var(--amber)">
                ♛
              </text>
            )}
            {/* Servers sit at the top with their link below, so their label goes to the side. */}
            <text x={d.kind === "server" ? 26 : 0} y={d.kind === "server" ? -4 : 38} textAnchor={d.kind === "server" ? "start" : "middle"} fontSize={13} fill="var(--ink)" fontWeight={500}>
              {d.id}
            </text>
            {sub && (
              <text
                x={d.kind === "server" ? 26 : net.isHost(d) ? 0 : d.x < 450 ? -40 : 40}
                y={d.kind === "server" ? 10 : net.isHost(d) ? 52 : -22}
                textAnchor={net.isHost(d) && d.kind !== "server" ? "middle" : !net.isHost(d) && d.x < 450 ? "end" : "start"}
                fontSize={10}
                fill="var(--muted)"
              >
                {sub}
              </text>
            )}
            {dropN && (
              <g transform="translate(26 -24)">
                <circle r={9} fill="var(--red)" />
                <path d="M-3.5 -3.5l7 7M3.5 -3.5l-7 7" stroke="#fff" strokeWidth={1.8} />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
