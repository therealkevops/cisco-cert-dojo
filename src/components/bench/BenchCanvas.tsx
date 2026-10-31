"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Net, SimEvent } from "@/lib/net/engine";
import type { DeviceKind, Topology } from "@/lib/net/types";
import { DeviceIcon } from "./icons";

export type View = { x: number; y: number; k: number };
export type Tool = "select" | "cable" | "probe" | "text" | "rect";
export type Lens = "l3" | "l2";

type Props = {
  topo: Topology;
  net: Net;
  view: View;
  setView: (v: View | ((v: View) => View)) => void;
  selection: Set<string>;
  setSelection: (s: Set<string>) => void;
  tool: Tool;
  /** Cable / probe: first endpoint already chosen. */
  pendingFrom: string | null;
  onDeviceTool: (id: string) => void;
  onEmptyTool: (x: number, y: number) => void;
  onMove: (ids: Set<string>, dx: number, dy: number) => void;
  onResizeNote: (id: string, w: number, h: number) => void;
  onOpen: (id: string) => void;
  onEditNote: (id: string) => void;
  onContext: (e: React.MouseEvent, target: { type: "device" | "note" | "link" | "canvas"; id?: string; x: number; y: number }) => void;
  onDropKind: (kind: DeviceKind, x: number, y: number) => void;
  lens: Lens;
  vlan: number;
  shown: SimEvent[];
  current: SimEvent | null;
  editingNote: string | null;
};

const linkId = (i: number) => `link:${i}`;
const VLAN_COLORS = ["#e8a33d", "#4fb3c8", "#c77dba", "#86b86b", "#d9725f", "#8f9be0"];

export function BenchCanvas(p: Props) {
  const { topo, net, view, setView, selection, setSelection, tool } = p;
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ ids: Set<string>; sx: number; sy: number; dx: number; dy: number; moved: boolean } | null>(null);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [pan, setPan] = useState<{ sx: number; sy: number; vx: number; vy: number } | null>(null);
  const [resize, setResize] = useState<{ id: string; w: number; h: number; sx: number; sy: number } | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [space, setSpace] = useState(false);
  // Pointer capture swallows native dblclick on items, so double-clicks are detected here.
  const lastClick = useRef<{ id: string; t: number } | null>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => e.code === "Space" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) && setSpace(true);
    const up = (e: KeyboardEvent) => e.code === "Space" && setSpace(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Wheel: pan, or zoom around the cursor with ctrl/⌘ (also trackpad pinch).
  useEffect(() => {
    const el = svg.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        const mx = e.clientX - r.left;
        const my = e.clientY - r.top;
        setView((v) => {
          const k = Math.min(2.5, Math.max(0.25, v.k * Math.exp(-e.deltaY * 0.0022)));
          return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k };
        });
      } else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setView]);

  const toWorld = (cx: number, cy: number) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k };
  };

  const pos = (id: string) => {
    const d = topo.devices.find((x) => x.id === id)!;
    const off = drag && drag.ids.has(id) && !d.locked ? { x: drag.dx, y: drag.dy } : { x: 0, y: 0 };
    return { x: d.x + off.x, y: d.y + off.y };
  };

  const stp = p.lens === "l2" ? net.stp(p.vlan) : null;
  const allVlans = useMemo(() => net.vlans(), [net]);
  const vlanColor = VLAN_COLORS[Math.max(0, allVlans.indexOf(p.vlan)) % VLAN_COLORS.length];

  const used = useMemo(() => {
    const m = new Map<string, Set<SimEvent["dir"]>>();
    for (const e of p.shown) {
      if (e.kind !== "tx" || !e.wire) continue;
      const k = [e.wire.from.join("|"), e.wire.to.join("|")].sort().join("~");
      m.set(k, (m.get(k) ?? new Set()).add(e.dir));
    }
    return m;
  }, [p.shown]);
  const drops = useMemo(() => new Set(p.shown.filter((e) => e.kind === "drop").map((e) => e.dev)), [p.shown]);

  const startItemDrag = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const next = new Set(selection);
    if (e.shiftKey) next.has(id) ? next.delete(id) : next.add(id);
    else if (!selection.has(id)) {
      next.clear();
      next.add(id);
    }
    setSelection(next);
    const w = toWorld(e.clientX, e.clientY);
    svg.current!.setPointerCapture(e.pointerId);
    setDrag({ ids: next, sx: w.x, sy: w.y, dx: 0, dy: 0, moved: false });
  };

  const cursor = pan || space ? "grabbing" : tool === "select" ? "default" : "crosshair";

  return (
    <svg
      ref={svg}
      className="bench-svg"
      style={{ cursor }}
      onPointerDown={(e) => {
        const w = toWorld(e.clientX, e.clientY);
        if (e.button === 1 || space || (e.pointerType === "touch" && tool === "select")) {
          svg.current!.setPointerCapture(e.pointerId);
          setPan({ sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y });
          return;
        }
        if (e.button !== 0) return;
        if (tool === "text" || tool === "rect") return p.onEmptyTool(w.x, w.y);
        if (tool !== "select") return;
        svg.current!.setPointerCapture(e.pointerId);
        if (!e.shiftKey) setSelection(new Set());
        setMarquee({ x0: w.x, y0: w.y, x1: w.x, y1: w.y });
      }}
      onPointerMove={(e) => {
        const w = toWorld(e.clientX, e.clientY);
        setPointer(w);
        if (pan) setView((v) => ({ ...v, x: pan.vx + e.clientX - pan.sx, y: pan.vy + e.clientY - pan.sy }));
        else if (drag) {
          const dx = w.x - drag.sx;
          const dy = w.y - drag.sy;
          setDrag({ ...drag, dx, dy, moved: drag.moved || Math.hypot(dx, dy) * view.k > 3 });
        } else if (marquee) setMarquee({ ...marquee, x1: w.x, y1: w.y });
        else if (resize) {
          p.onResizeNote(resize.id, Math.max(80, resize.w + w.x - resize.sx), Math.max(50, resize.h + w.y - resize.sy));
        }
      }}
      onPointerUp={() => {
        if (drag) {
          if (drag.moved) p.onMove(drag.ids, drag.dx, drag.dy);
          else if (drag.ids.size === 1) {
            const id = [...drag.ids][0];
            const isDev = topo.devices.some((d) => d.id === id);
            if (tool !== "select" && isDev) p.onDeviceTool(id);
            else if (tool === "select") {
              const now = performance.now();
              if (lastClick.current?.id === id && now - lastClick.current.t < 400) {
                lastClick.current = null;
                if (isDev) p.onOpen(id);
                else p.onEditNote(id);
              } else lastClick.current = { id, t: now };
            }
          }
        }
        if (marquee) {
          const [x0, x1] = [Math.min(marquee.x0, marquee.x1), Math.max(marquee.x0, marquee.x1)];
          const [y0, y1] = [Math.min(marquee.y0, marquee.y1), Math.max(marquee.y0, marquee.y1)];
          if (x1 - x0 > 4 || y1 - y0 > 4) {
            const next = new Set(selection);
            for (const d of topo.devices) if (d.x >= x0 && d.x <= x1 && d.y >= y0 && d.y <= y1) next.add(d.id);
            for (const n of topo.notes ?? []) if (n.x >= x0 && n.y >= y0 && n.x + n.w <= x1 && n.y + n.h <= y1) next.add(n.id);
            setSelection(next);
          }
        }
        setDrag(null);
        setMarquee(null);
        setPan(null);
        setResize(null);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        const w = toWorld(e.clientX, e.clientY);
        p.onContext(e, { type: "canvas", ...w });
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const kind = e.dataTransfer.getData("application/x-wire-device") as DeviceKind;
        if (kind) {
          const w = toWorld(e.clientX, e.clientY);
          p.onDropKind(kind, w.x, w.y);
        }
      }}
    >
      <defs>
        <pattern id="bench-dots" width={24 * view.k} height={24 * view.k} patternUnits="userSpaceOnUse" x={view.x} y={view.y}>
          <circle cx={1} cy={1} r={Math.max(0.6, view.k)} fill="var(--line)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#bench-dots)" />

      <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
        {/* zones and notes below everything */}
        {(topo.notes ?? []).map((n) => {
          const sel = selection.has(n.id);
          const off = drag && drag.ids.has(n.id) ? { x: drag.dx, y: drag.dy } : { x: 0, y: 0 };
          return (
            <g
              key={n.id}
              transform={`translate(${n.x + off.x} ${n.y + off.y})`}
              onPointerDown={(e) => tool === "select" && startItemDrag(e, n.id)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                p.onEditNote(n.id);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSelection(new Set([n.id]));
                p.onContext(e, { type: "note", id: n.id, x: n.x, y: n.y });
              }}
              style={{ cursor: "move" }}
            >
              {n.kind === "rect" ? (
                <>
                  <rect width={n.w} height={n.h} rx={10} fill="var(--amber)" fillOpacity={0.05} stroke={sel ? "var(--amber)" : "var(--line)"} strokeWidth={sel ? 2 : 1.5} strokeDasharray={sel ? undefined : "6 5"} />
                  {p.editingNote !== n.id && (
                    <text x={12} y={22} fontSize={13} fill="var(--ink-2)" fontWeight={600} letterSpacing="0.06em">
                      {n.text}
                    </text>
                  )}
                  {sel && (
                    <rect
                      x={n.w - 7}
                      y={n.h - 7}
                      width={14}
                      height={14}
                      rx={3}
                      fill="var(--amber)"
                      style={{ cursor: "nwse-resize" }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        const w = toWorld(e.clientX, e.clientY);
                        svg.current!.setPointerCapture(e.pointerId);
                        setResize({ id: n.id, w: n.w, h: n.h, sx: w.x, sy: w.y });
                      }}
                    />
                  )}
                </>
              ) : (
                <>
                  {sel && <rect x={-6} y={-4} width={n.w + 12} height={n.h + 8} rx={6} fill="none" stroke="var(--amber)" strokeDasharray="4 4" />}
                  {p.editingNote !== n.id &&
                    n.text.split("\n").map((line, i) => (
                      <text key={i} x={0} y={18 + i * 20} fontSize={15} fill="var(--ink)">
                        {line}
                      </text>
                    ))}
                </>
              )}
            </g>
          );
        })}

        {/* links */}
        {topo.links.map((l, i) => {
          const a = pos(l.a[0]);
          const b = pos(l.b[0]);
          const key = [l.a.join("|"), l.b.join("|")].sort().join("~");
          const up = net.linkUp(l.a[0], l.a[1]);
          const sel = selection.has(linkId(i));
          const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const ux = (b.x - a.x) / len;
          const uy = (b.y - a.y) / len;
          const da = topo.devices.find((d) => d.id === l.a[0])!;
          const db = topo.devices.find((d) => d.id === l.b[0])!;
          const carries = (dv: typeof da, pn: string) => {
            const pt = dv.ports.find((x) => x.name === pn);
            return !!pt && net.isSwitch(dv) && net.portMode(dv, pt) !== "routed" && net.carries(dv, pt, p.vlan);
          };
          const inVlan = p.lens === "l2" && (carries(da, l.a[1]) || carries(db, l.b[1]));
          const base = !up ? "var(--red)" : p.lens === "l2" ? (inVlan ? vlanColor : "var(--line)") : "var(--ink-2)";
          const dirs = used.get(key);
          return (
            <g
              key={key}
              onPointerDown={(e) => {
                e.stopPropagation();
                setSelection(new Set(e.shiftKey ? [...selection, linkId(i)] : [linkId(i)]));
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSelection(new Set([linkId(i)]));
                p.onContext(e, { type: "link", id: linkId(i), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
              }}
            >
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={14} style={{ cursor: "pointer" }} />
              {sel && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--amber)" strokeWidth={7} strokeOpacity={0.35} />}
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={base} strokeWidth={p.lens === "l2" && inVlan ? 3 : 1.8} strokeDasharray={up ? undefined : "5 6"} pointerEvents="none" />
              {dirs?.has("ctl") && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--muted)" strokeWidth={6} strokeOpacity={0.3} pointerEvents="none" />}
              {dirs?.has("out") && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--amber)" strokeWidth={3.5} transform={`translate(${-uy * 3} ${ux * 3})`} pointerEvents="none" />}
              {dirs?.has("back") && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--green)" strokeWidth={3.5} transform={`translate(${uy * 3} ${-ux * 3})`} pointerEvents="none" />}
              {(
                [
                  [a, l.a, 1],
                  [b, l.b, -1],
                ] as const
              ).map(([pt, [dev, port], sgn]) => {
                const x = pt.x + ux * 38 * sgn;
                const y = pt.y + uy * 38 * sgn;
                const role = stp?.roles[`${dev}|${port}`];
                const led = !net.linkUp(dev, port) ? "var(--red)" : role === "alt" ? "var(--amber)" : "var(--green)";
                return (
                  <g key={port} pointerEvents="none">
                    <circle cx={x} cy={y} r={3.6} fill={led} />
                    {view.k > 0.55 && (
                      <text x={x + ux * 16 * sgn + (Math.abs(uy) > 0.5 ? 7 * sgn : 0)} y={y + uy * 16 * sgn + (Math.abs(uy) > 0.5 ? 3 : -6)} fontSize={10} fill="var(--muted)" textAnchor={Math.abs(uy) > 0.5 ? (sgn > 0 ? "start" : "end") : "middle"} className="halo">
                        {port}
                        {role === "alt" ? " · BLK" : ""}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* rubber band for cable / probe tools */}
        {p.pendingFrom && pointer && (
          <line x1={pos(p.pendingFrom).x} y1={pos(p.pendingFrom).y} x2={pointer.x} y2={pointer.y} stroke={tool === "probe" ? "var(--amber)" : "var(--ink-2)"} strokeWidth={2} strokeDasharray="6 5" pointerEvents="none" />
        )}

        {/* animated frame */}
        {p.current?.kind === "tx" && p.current.wire && (
          <circle key={p.current.id} r={7} fill={p.current.dir === "back" ? "var(--green)" : p.current.dir === "out" ? "var(--amber)" : "var(--ink-2)"} stroke="var(--bg)" strokeWidth={2} pointerEvents="none">
            <animateMotion dur="0.45s" fill="freeze" path={`M${pos(p.current.wire.from[0]).x} ${pos(p.current.wire.from[0]).y} L${pos(p.current.wire.to[0]).x} ${pos(p.current.wire.to[0]).y}`} />
          </circle>
        )}

        {/* devices */}
        {topo.devices.map((d) => {
          const { x, y } = pos(d.id);
          const sel = selection.has(d.id);
          const isRoot = p.lens === "l2" && stp?.rootOf[d.id] === d.id;
          const sub =
            p.lens === "l3"
              ? net.isHost(d)
                ? d.ports[0].ip ?? ""
                : ""
              : net.isSwitch(d) && stp?.bridgeId[d.id]
                ? `prio ${stp.bridgeId[d.id].prio}`
                : "";
          return (
            <g
              key={d.id}
              transform={`translate(${x} ${y})`}
              className="bench-dev"
              onPointerDown={(e) => startItemDrag(e, d.id)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                p.onOpen(d.id);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!selection.has(d.id)) setSelection(new Set([d.id]));
                p.onContext(e, { type: "device", id: d.id, x: d.x, y: d.y });
              }}
              style={{ cursor: d.locked ? "pointer" : "move" }}
            >
              {(sel || p.pendingFrom === d.id || p.current?.dev === d.id) && (
                <rect x={-38} y={-34} width={76} height={86} rx={10} fill="var(--amber)" fillOpacity={0.08} stroke="var(--amber)" strokeWidth={1.5} strokeDasharray={p.current?.dev === d.id && !sel ? "4 4" : undefined} />
              )}
              <rect x={-36} y={-32} width={72} height={82} fill="transparent" />
              <g opacity={d.off ? 0.45 : 1}>
                <DeviceIcon kind={d.kind} off={d.off} />
              </g>
              {isRoot && (
                <text y={-30} textAnchor="middle" fontSize={16} fill="var(--amber)">
                  ♛
                </text>
              )}
              <circle cx={-9 - d.id.length * 3.9} cy={37} r={3.5} fill={d.off ? "var(--muted)" : "var(--green)"} />
              <text y={41} textAnchor="middle" fontSize={12.5} fontWeight={600} fill="var(--ink)" className="halo">
                {d.id}
              </text>
              {sub && view.k > 0.5 && (
                <text y={55} textAnchor="middle" fontSize={10} fill="var(--muted)" className="halo">
                  {sub}
                </text>
              )}
              {d.locked && (
                <text x={30} y={-22} fontSize={11} fill="var(--muted)">
                  🔒
                </text>
              )}
              {drops.has(d.id) && (
                <g transform="translate(28 -26)">
                  <circle r={9} fill="var(--red)" />
                  <path d="M-3.5 -3.5l7 7M3.5 -3.5l-7 7" stroke="#fff" strokeWidth={1.8} />
                </g>
              )}
            </g>
          );
        })}

        {marquee && (
          <rect
            x={Math.min(marquee.x0, marquee.x1)}
            y={Math.min(marquee.y0, marquee.y1)}
            width={Math.abs(marquee.x1 - marquee.x0)}
            height={Math.abs(marquee.y1 - marquee.y0)}
            fill="var(--amber)"
            fillOpacity={0.06}
            stroke="var(--amber)"
            strokeDasharray="4 3"
          />
        )}
      </g>
    </svg>
  );
}
