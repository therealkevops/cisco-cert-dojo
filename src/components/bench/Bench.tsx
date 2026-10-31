"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { campus, scenarios } from "@/data/wire";
import { complete, newSession, prompt as cliPrompt, runCli, type ProbeRun, type Session } from "@/lib/ios/cli";
import { Net } from "@/lib/net/engine";
import { gradeGoals, type GoalResult } from "@/lib/net/grade";
import { addDevice, addLink, addNote, duplicate, KIND_META, moveItems, nextName, portInUse, removeItems, removeLinks, renameDevice, updateDevice, updateNote } from "@/lib/net/ops";
import type { DeviceKind, Scenario, Topology } from "@/lib/net/types";
import { recordWire, useProgress } from "@/lib/progress";
import { Rich } from "../Rich";
import { PacketWalk } from "../wire/PacketWalk";
import { BenchCanvas, type Lens, type Tool, type View } from "./BenchCanvas";
import { Console, type ConsoleLine } from "./Console";
import { ToolIcon } from "./icons";

const SAVE_KEY = "cert-dojo:wire:sandbox";
const KINDS: DeviceKind[] = ["router", "switch", "l3switch", "pc", "server"];
type Doc = { title: string; topo: Topology };
type Con = { lines: ConsoleLine[]; session: Session; history: string[] };
type Menu = { x: number; y: number; type: "device" | "note" | "link" | "canvas"; id?: string; wx: number; wy: number } | null;

const EMPTY: Topology = { devices: [], links: [], notes: [] };

function loadSaved(): Doc | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as Doc) : null;
  } catch {
    return null;
  }
}

export function Bench({ scenario }: { scenario?: Scenario }) {
  const challenge = scenario?.kind === "challenge" ? scenario : undefined;
  const progress = useProgress();
  const [doc, setDoc] = useState<Doc>(() => ({ title: scenario?.title ?? "Untitled lab", topo: structuredClone(scenario?.topology ?? EMPTY) }));
  const [net, setNet] = useState(() => new Net(doc.topo));
  const [past, setPast] = useState<Topology[]>([]);
  const [future, setFuture] = useState<Topology[]>([]);
  const [view, setView] = useState<View>({ x: 40, y: 80, k: 1 });
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [tool, setTool] = useState<Tool>("select");
  const [pending, setPending] = useState<{ dev: string; port?: string } | null>(null);
  const [picker, setPicker] = useState<{ dev: string; q: string } | null>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [consoles, setConsoles] = useState<Record<string, Con>>({});
  const [tabs, setTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [dockH, setDockH] = useState(300);
  const [run, setRun] = useState<ProbeRun | null>(null);
  const [probeIdx, setProbeIdx] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [lens, setLens] = useState<Lens>("l3");
  const [vlan, setVlan] = useState(1);
  const [fileOpen, setFileOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [grades, setGrades] = useState<GoalResult[] | null>(null);
  const [hint, setHint] = useState(false);
  const clip = useRef<Topology | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const topo = doc.topo;

  // Sandbox restores from and autosaves to this browser.
  useEffect(() => {
    if (scenario) return;
    const saved = loadSaved();
    if (saved) {
      setDoc(saved);
      setNet(new Net(saved.topo));
    }
  }, [scenario]);
  useEffect(() => {
    if (scenario) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(doc));
      } catch {}
    }, 400);
    return () => clearTimeout(t);
  }, [doc, scenario]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2600);
  };

  /** Every topology change goes through here: history, net rebuild, grading reset. */
  const commit = useCallback(
    (next: Topology) => {
      setPast((p) => [...p.slice(-99), doc.topo]);
      setFuture([]);
      setDoc((d) => ({ ...d, topo: next }));
      setNet((n) => new Net(next, n));
      setGrades(null);
    },
    [doc.topo],
  );

  const undo = () => {
    if (!past.length) return;
    const prev = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture([doc.topo, ...future]);
    setDoc((d) => ({ ...d, topo: prev }));
    setNet((n) => new Net(prev, n));
  };
  const redo = () => {
    if (!future.length) return;
    const next = future[0];
    setFuture(future.slice(1));
    setPast([...past, doc.topo]);
    setDoc((d) => ({ ...d, topo: next }));
    setNet((n) => new Net(next, n));
  };

  const vlans = useMemo(() => net.vlans(), [net]);
  useEffect(() => {
    if (vlans.length && !vlans.includes(vlan)) setVlan(vlans[0]);
  }, [vlans, vlan]);

  const centerWorld = () => {
    const r = stage.current?.getBoundingClientRect();
    const w = r?.width ?? 1000;
    const h = (r?.height ?? 700) - (tabs.length || run ? dockH : 0);
    return { x: (w / 2 - view.x) / view.k, y: (h / 2 - view.y) / view.k };
  };

  const add = (kind: DeviceKind, at?: { x: number; y: number }) => {
    const c = at ?? centerWorld();
    // Nudge so repeated clicks don't stack devices on top of each other.
    let { x, y } = c;
    if (!at) while (topo.devices.some((d) => Math.hypot(d.x - x, d.y - y) < 60)) ((x += 90), (y += 20));
    const r = addDevice(topo, kind, x, y);
    commit(r.topo);
    setSelection(new Set([r.id]));
  };

  const openConsole = (id: string) => {
    const d = topo.devices.find((x) => x.id === id);
    if (!d) return;
    setConsoles((cs) => {
      if (cs[id]) return cs;
      const host = d.kind === "pc" || d.kind === "server";
      const banner: ConsoleLine[] = host
        ? [{ kind: "sys", text: `${id} shell. Type ? for commands.` }]
        : [{ kind: "sys", text: `${id} con0 is now available\nType ? at any point for help. Tab completes, ↑ recalls.` }];
      return { ...cs, [id]: { lines: banner, session: newSession(id, d.kind), history: [] } };
    });
    setTabs((t) => (t.includes(id) ? t : [...t, id]));
    setActiveTab(id);
  };

  const closeTab = (id: string) => {
    setTabs((t) => {
      const next = t.filter((x) => x !== id);
      if (activeTab === id) setActiveTab(next[next.length - 1] ?? (run ? "walk" : null));
      return next;
    });
  };

  const showProbe = (r: ProbeRun) => {
    setRun(r);
    setProbeIdx(Math.max(0, r.probes.length - 1));
    setPlaying(false);
  };

  const runLine = (dev: string, line: string, helpOnly = false) => {
    const con = consoles[dev];
    if (!con) return;
    const d = topo.devices.find((x) => x.id === dev);
    const pr = cliPrompt(con.session, d?.kind === "pc" || d?.kind === "server");
    const r = runCli(line, con.session, topo, net);
    const lines: ConsoleLine[] = [...con.lines, { kind: "in", text: pr + line }];
    if (r.out) lines.push({ kind: "out", text: r.out });
    const history = helpOnly || !line.trim() ? con.history : [line, ...con.history].slice(0, 100);
    const updated: Con = { lines: lines.slice(-600), session: r.session, history };
    if (r.renamed) {
      const { from, to } = r.renamed;
      setConsoles((cs) => {
        const { [from]: _, ...rest } = cs;
        void _;
        return { ...rest, [to]: updated };
      });
      setTabs((t) => t.map((x) => (x === from ? to : x)));
      setActiveTab(to);
      setSelection(new Set([to]));
    } else setConsoles((cs) => ({ ...cs, [dev]: updated }));
    if (r.topo) commit(r.topo);
    if (r.probe) showProbe(r.probe);
  };

  const probe = (from: string, to: string) => {
    const mine = net.l3Ifs(from);
    const theirs = net.l3Ifs(to).filter((i) => i.up);
    const pick = theirs.find((t) => mine.some((m) => m.cidr.net === t.cidr.net)) ?? theirs[0];
    if (!pick) return flash(`${to} has no IP address that is up yet. Configure it in its console.`);
    const r = net.ping(from, pick.cidr.ip, 4);
    showProbe({ kind: "ping", src: from, dst: pick.cidr.ip, ...r });
    setActiveTab("walk");
  };

  const onDeviceTool = (id: string) => {
    if (tool === "cable") {
      if (pending?.dev === id) return;
      setPicker({ dev: id, q: "" });
    } else if (tool === "probe") {
      if (!pending) setPending({ dev: id });
      else if (pending.dev !== id) {
        probe(pending.dev, id);
        setPending(null);
      }
    }
  };

  const pickPort = (dev: string, port: string) => {
    setPicker(null);
    if (!pending?.port) {
      setPending({ dev, port });
      return;
    }
    const r = addLink(topo, [pending.dev, pending.port], [dev, port]);
    if (typeof r === "string") flash(r);
    else {
      commit(r);
      flash(`Cabled ${pending.dev} ${pending.port} ↔ ${dev} ${port}`);
    }
    setPending(null);
  };

  const deleteSelection = () => {
    const linkIdx = [...selection].filter((s) => s.startsWith("link:")).map((s) => +s.slice(5));
    const ids = [...selection].filter((s) => !s.startsWith("link:"));
    if (!linkIdx.length && !ids.length) return;
    let next = linkIdx.length ? removeLinks(topo, linkIdx) : topo;
    if (ids.length) next = removeItems(next, ids);
    commit(next);
    setSelection(new Set());
    for (const id of ids) if (consoles[id]) closeTab(id);
  };

  const copySel = () => {
    const ids = new Set([...selection].filter((s) => !s.startsWith("link:")));
    if (!ids.size) return;
    clip.current = {
      devices: topo.devices.filter((d) => ids.has(d.id)),
      links: topo.links.filter((l) => ids.has(l.a[0]) && ids.has(l.b[0])),
      notes: (topo.notes ?? []).filter((n) => ids.has(n.id)),
    };
    flash(`Copied ${ids.size} item${ids.size > 1 ? "s" : ""}`);
  };
  const paste = (src: Topology | null = clip.current) => {
    if (!src) return;
    const next = structuredClone(topo);
    const map = new Map<string, string>();
    const made: string[] = [];
    for (const d of src.devices) {
      const id = nextName(next, d.kind);
      map.set(d.id, id);
      next.devices.push({ ...structuredClone(d), id, x: d.x + 50, y: d.y + 50, locked: false });
      made.push(id);
    }
    for (const l of src.links) next.links.push({ a: [map.get(l.a[0])!, l.a[1]], b: [map.get(l.b[0])!, l.b[1]] });
    for (const n of src.notes ?? []) {
      const id = `note-${Math.random().toString(36).slice(2, 8)}`;
      next.notes = [...(next.notes ?? []), { ...n, id, x: n.x + 50, y: n.y + 50 }];
      made.push(id);
    }
    commit(next);
    setSelection(new Set(made));
  };

  const fit = useCallback((t: Topology = topo) => {
    const items = [...t.devices.map((d) => ({ x: d.x, y: d.y, w: 0, h: 0 })), ...(t.notes ?? [])];
    const r = stage.current?.getBoundingClientRect();
    if (!items.length || !r) return setView({ x: 40, y: 80, k: 1 });
    const x0 = Math.min(...items.map((i) => i.x)) - 80;
    const y0 = Math.min(...items.map((i) => i.y)) - 70;
    const x1 = Math.max(...items.map((i) => i.x + i.w)) + 80;
    const y1 = Math.max(...items.map((i) => i.y + i.h)) + 90;
    const h = r.height - (tabs.length || run ? dockH : 0) - 70;
    const k = Math.min(1.4, Math.max(0.3, Math.min(r.width / (x1 - x0), h / (y1 - y0))));
    setView({ k, x: (r.width - (x1 - x0) * k) / 2 - x0 * k, y: 70 + (h - (y1 - y0) * k) / 2 - y0 * k });
  }, [topo, tabs.length, run, dockH]);

  // Fit challenge topologies on first paint.
  useEffect(() => {
    if (scenario) requestAnimationFrame(() => fit());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts on the canvas (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.closest(".cmdbar")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) (e.preventDefault(), undo());
      else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) (e.preventDefault(), redo());
      else if (mod && e.key.toLowerCase() === "c") copySel();
      else if (mod && e.key.toLowerCase() === "v") paste();
      else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        const ids = [...selection].filter((s) => !s.startsWith("link:"));
        if (ids.length) {
          const r = duplicate(topo, ids);
          commit(r.topo);
          setSelection(new Set(r.ids));
        }
      } else if (e.key === "Delete" || e.key === "Backspace") deleteSelection();
      else if (e.key === "Escape") {
        setTool("select");
        setPending(null);
        setPicker(null);
        setMenu(null);
        setFileOpen(false);
        setHelp(false);
      } else if (!mod && /^[1-5]$/.test(e.key)) add(KINDS[+e.key - 1]);
      else if (!mod && e.key.toLowerCase() === "c") setTool("cable");
      else if (!mod && e.key.toLowerCase() === "p") setTool("probe");
      else if (!mod && e.key.toLowerCase() === "t") setTool("text");
      else if (!mod && e.key.toLowerCase() === "b") setTool("rect");
      else if (!mod && e.key === "Enter" && selection.size === 1) {
        const id = [...selection][0];
        if (topo.devices.some((d) => d.id === id)) openConsole(id);
        else if (topo.notes?.some((n) => n.id === id)) setEditingNote(id);
      } else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Packet walk playback.
  const walkEvents = useMemo(() => {
    const evs = run?.probes[probeIdx]?.events ?? [];
    return showAll ? evs : evs.filter((e) => e.kind !== "ignore");
  }, [run, probeIdx, showAll]);
  useEffect(() => setCursor(Math.max(0, walkEvents.length - 1)), [walkEvents]);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setCursor((c) => (c >= walkEvents.length - 1 ? (setPlaying(false), c) : c + 1)), 650);
    return () => clearInterval(t);
  }, [playing, walkEvents.length]);
  const shown = useMemo(() => walkEvents.slice(0, cursor + 1), [walkEvents, cursor]);
  const nameOf = (ip: string) => net.addresses().find((a) => a.ip === ip)?.dev ?? "";

  const toScreen = (x: number, y: number) => ({ left: x * view.k + view.x, top: y * view.k + view.y });
  const single = selection.size === 1 ? [...selection][0] : null;
  const selDev = single ? topo.devices.find((d) => d.id === single) : undefined;
  const selNote = single ? topo.notes?.find((n) => n.id === single) : undefined;
  const dockOpen = tabs.length > 0 || !!run;
  const running = topo.devices.filter((d) => !d.off).length;
  const solved = grades?.every((g) => g.ok);

  const verify = () => {
    if (!challenge) return;
    const g = gradeGoals(topo, challenge.goals);
    setGrades(g);
    if (g.every((x) => x.ok)) recordWire(challenge.id);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${doc.title.replace(/[^\w-]+/g, "-").toLowerCase() || "lab"}.wire.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const loadTopo = (t: Topology, title: string) => {
    commit(structuredClone(t));
    setDoc((d) => ({ ...d, title }));
    setConsoles({});
    setTabs([]);
    setRun(null);
    setSelection(new Set());
    requestAnimationFrame(() => fit(t));
  };

  const hint1 =
    tool === "cable"
      ? !pending
        ? "Cable: click the first device"
        : `Cable from ${pending.dev} ${pending.port ?? ""}: click the second device`
      : tool === "probe"
        ? !pending
          ? "Send a packet: click the source device"
          : `From ${pending.dev}: click the destination device`
        : tool === "text"
          ? "Click to place a note"
          : tool === "rect"
            ? "Click to place a zone"
            : null;

  return (
    <div className="bench" ref={stage}>
      <BenchCanvas
        topo={topo}
        net={net}
        view={view}
        setView={setView}
        selection={selection}
        setSelection={(s) => {
          setSelection(s);
          setMenu(null);
        }}
        tool={tool}
        pendingFrom={pending?.dev ?? null}
        onDeviceTool={onDeviceTool}
        onEmptyTool={(x, y) => {
          const r = addNote(topo, tool === "rect" ? "rect" : "text", x, y);
          commit(r.topo);
          setSelection(new Set([r.id]));
          setEditingNote(r.id);
          setTool("select");
        }}
        onMove={(ids, dx, dy) => commit(moveItems(topo, ids, dx, dy))}
        onResizeNote={(id, w, h) => setDoc((d) => ({ ...d, topo: updateNote(d.topo, id, (n) => ((n.w = Math.round(w)), (n.h = Math.round(h)))) }))}
        onOpen={(id) => {
          const d = topo.devices.find((x) => x.id === id);
          if (d?.off) flash(`${id} is powered off. Turn it on first.`);
          else openConsole(id);
        }}
        onEditNote={setEditingNote}
        onContext={(e, t) => {
          const r = stage.current!.getBoundingClientRect();
          setMenu({ x: e.clientX - r.left, y: e.clientY - r.top, type: t.type, id: t.id, wx: t.x, wy: t.y });
        }}
        onDropKind={(k, x, y) => add(k, { x, y })}
        lens={lens}
        vlan={vlan}
        shown={activeTab === "walk" || !dockOpen ? shown : run ? (run.probes[probeIdx]?.events ?? []) : []}
        current={activeTab === "walk" ? (walkEvents[cursor] ?? null) : null}
        editingNote={editingNote}
      />

      {!topo.devices.length && !(topo.notes ?? []).length && (
        <div className="bench-empty">
          <p>Add a device from the toolbar, or drag one onto the canvas.</p>
          <p className="silk">Then cable it up (C), double-click a device for its console, and send a packet (P).</p>
          <div className="switches" style={{ justifyContent: "center", marginTop: 14 }}>
            <button className="sw" onClick={() => loadTopo(campus(), "Campus example")}>
              Load the campus example
            </button>
            <Link className="sw" href="/wire/challenges">
              Troubleshooting challenges
            </Link>
          </div>
        </div>
      )}

      {/* top-left: identity + file */}
      <div className="fpanel bench-file">
        <Link href="/" className="bench-brand" title="Back to the dojo">
          cert<b>/</b>dojo
        </Link>
        <span className="bench-sep" />
        <input className="bench-title" value={doc.title} onChange={(e) => setDoc((d) => ({ ...d, title: e.target.value }))} aria-label="Lab title" disabled={!!challenge} />
        <div className="bench-menuwrap">
          <button className="fbtn" onClick={() => setFileOpen(!fileOpen)} aria-expanded={fileOpen}>
            File ▾
          </button>
          {fileOpen && (
            <div className="fmenu" onMouseLeave={() => setFileOpen(false)}>
              <Link href="/wire" onClick={() => setFileOpen(false)}>
                {scenario ? "Open my sandbox" : "Sandbox"}
              </Link>
              {!scenario && (
                <button
                  onClick={() => {
                    if (confirm("Clear the canvas? (Undo still works.)")) loadTopo(EMPTY, "Untitled lab");
                    setFileOpen(false);
                  }}
                >
                  New (clear canvas)
                </button>
              )}
              {!scenario && (
                <button onClick={() => (loadTopo(campus(), "Campus example"), setFileOpen(false))}>Load campus example</button>
              )}
              <button onClick={() => (exportJson(), setFileOpen(false))}>Export lab (.json)</button>
              {!scenario && <button onClick={() => (file.current?.click(), setFileOpen(false))}>Import lab…</button>}
              <hr />
              <span className="silk">Challenges</span>
              {scenarios
                .filter((s) => s.kind === "challenge")
                .map((s) => (
                  <Link key={s.id} href={`/wire/${s.id}`} onClick={() => setFileOpen(false)}>
                    {progress.wire[s.id] ? "✓ " : ""}
                    {s.title}
                  </Link>
                ))}
            </div>
          )}
        </div>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              const d = JSON.parse(await f.text()) as Doc;
              if (!Array.isArray(d.topo?.devices) || !Array.isArray(d.topo?.links)) throw new Error("not a Wire Room lab");
              loadTopo(d.topo, d.title ?? f.name);
            } catch (err) {
              flash(`Import failed: ${String(err)}`);
            }
            e.target.value = "";
          }}
        />
      </div>

      {/* top-centre: palette and tools */}
      <div className="fpanel bench-tools" role="toolbar" aria-label="Tools">
        {KINDS.map((k, i) => (
          <button
            key={k}
            className="tbtn"
            title={`${KIND_META[k].label} (${i + 1}). Click to add, or drag onto the canvas.`}
            draggable
            onDragStart={(e) => e.dataTransfer.setData("application/x-wire-device", k)}
            onClick={() => add(k)}
          >
            <ToolIcon kind={k} />
          </button>
        ))}
        <span className="tsep" />
        <button className={`tbtn ${tool === "cable" ? "on" : ""}`} title="Cable (C)" onClick={() => (setTool(tool === "cable" ? "select" : "cable"), setPending(null))}>
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M5 4v6a4 4 0 0 0 4 4h6a4 4 0 0 1 4 4v2" />
            <rect x={2.5} y={2} width={5} height={4} rx={1} />
            <rect x={16.5} y={18} width={5} height={4} rx={1} />
          </svg>
        </button>
        <button className={`tbtn ${tool === "probe" ? "on" : ""}`} title="Send a packet: ping from one device to another (P)" onClick={() => (setTool(tool === "probe" ? "select" : "probe"), setPending(null))}>
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
            <rect x={3} y={6} width={18} height={12} rx={2} />
            <path d="M3 7l9 6 9-6" />
          </svg>
        </button>
        <span className="tsep" />
        <button className={`tbtn ${tool === "text" ? "on" : ""}`} title="Note (T)" onClick={() => setTool(tool === "text" ? "select" : "text")}>
          <span className="tglyph">T</span>
        </button>
        <button className={`tbtn ${tool === "rect" ? "on" : ""}`} title="Zone (B)" onClick={() => setTool(tool === "rect" ? "select" : "rect")}>
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <rect x={3} y={5} width={18} height={14} rx={3} />
          </svg>
        </button>
      </div>

      <div className="fpanel bench-undo">
        <button className="tbtn" title="Undo (Ctrl+Z)" onClick={undo} disabled={!past.length}>
          ↶
        </button>
        <button className="tbtn" title="Redo (Ctrl+Y)" onClick={redo} disabled={!future.length}>
          ↷
        </button>
      </div>

      {hint1 && <div className="bench-hint">{hint1} · Esc to cancel</div>}

      {/* challenge brief */}
      {challenge && (
        <div className="fpanel bench-goals">
          <span className="silk">
            Challenge · ENCOR {challenge.objective} {progress.wire[challenge.id] ? "· solved ✓" : ""}
          </span>
          <p className="bench-brief">
            <Rich text={challenge.brief} />
          </p>
          <ul>
            {challenge.goals.map((g, i) => {
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
            {challenge.hint && (
              <button className="sw" onClick={() => setHint(!hint)}>
                Hint
              </button>
            )}
            <button className="sw" onClick={() => loadTopo(challenge.topology, challenge.title)}>
              Reset
            </button>
          </div>
          {hint && challenge.hint && <p className="goal-hint">{challenge.hint}</p>}
          {solved && challenge.debrief && (
            <p className="goal-hint" style={{ borderColor: "var(--green)" }}>
              <b style={{ color: "var(--green)" }}>Ticket closed.</b> <Rich text={challenge.debrief} />
            </p>
          )}
        </div>
      )}

      {/* node action bar */}
      {selDev && tool === "select" && renaming !== selDev.id && (
        <div className="fpanel nodebar" style={{ ...toScreen(selDev.x, selDev.y - 38), transform: "translate(-50%, -100%)" }}>
          <button
            className="tbtn"
            title={selDev.off ? "Power on" : "Power off"}
            onClick={() => commit(updateDevice(topo, selDev.id, (d) => (d.off = !d.off)))}
            style={{ color: selDev.off ? "var(--green)" : "var(--red)" }}
          >
            {selDev.off ? "▶" : "■"}
          </button>
          <button className="tbtn" title="Console (Enter or double-click)" disabled={!!selDev.off} onClick={() => openConsole(selDev.id)}>
            <span className="tglyph" style={{ fontSize: 13 }}>
              &gt;_
            </span>
          </button>
          <button className="tbtn" title="Connect a cable from here" onClick={() => (setTool("cable"), setPending(null), setPicker({ dev: selDev.id, q: "" }))}>
            ⤡
          </button>
          <button className="tbtn" title="Rename" onClick={() => setRenaming(selDev.id)}>
            ✎
          </button>
          <button className="tbtn" title={selDev.locked ? "Unlock position" : "Lock position"} onClick={() => commit(updateDevice(topo, selDev.id, (d) => (d.locked = !d.locked)))}>
            {selDev.locked ? "🔒" : "🔓"}
          </button>
          <button
            className="tbtn"
            title="Duplicate (Ctrl+D)"
            onClick={() => {
              const r = duplicate(topo, [selDev.id]);
              commit(r.topo);
              setSelection(new Set(r.ids));
            }}
          >
            ⧉
          </button>
          <button className="tbtn" title="Delete (Del)" onClick={deleteSelection}>
            🗑
          </button>
        </div>
      )}
      {selNote && tool === "select" && editingNote !== selNote.id && (
        <div className="fpanel nodebar" style={{ ...toScreen(selNote.x, selNote.y - 10), transform: "translate(0, -100%)" }}>
          <button className="tbtn" title="Edit text" onClick={() => setEditingNote(selNote.id)}>
            ✎
          </button>
          <button className="tbtn" title="Duplicate" onClick={() => { const r = duplicate(topo, [selNote.id]); commit(r.topo); setSelection(new Set(r.ids)); }}>
            ⧉
          </button>
          <button className="tbtn" title="Delete" onClick={deleteSelection}>
            🗑
          </button>
        </div>
      )}

      {/* inline rename */}
      {renaming && topo.devices.find((d) => d.id === renaming) && (
        <RenameBox
          style={toScreen(topo.devices.find((d) => d.id === renaming)!.x, topo.devices.find((d) => d.id === renaming)!.y + 32)}
          value={renaming}
          onDone={(v) => {
            setRenaming(null);
            if (!v || v === renaming) return;
            const r = renameDevice(topo, renaming, v);
            if (typeof r === "string") return flash(r);
            commit(r);
            setSelection(new Set([v]));
            if (consoles[renaming]) {
              setConsoles((cs) => {
                const { [renaming]: c, ...rest } = cs;
                return { ...rest, [v]: { ...c, session: { ...c.session, dev: v } } };
              });
              setTabs((t) => t.map((x) => (x === renaming ? v : x)));
              if (activeTab === renaming) setActiveTab(v);
            }
          }}
        />
      )}

      {/* note editor */}
      {editingNote && topo.notes?.find((n) => n.id === editingNote) && (
        <NoteEditor
          note={topo.notes.find((n) => n.id === editingNote)!}
          style={toScreen(topo.notes.find((n) => n.id === editingNote)!.x, topo.notes.find((n) => n.id === editingNote)!.y)}
          k={view.k}
          onDone={(text) => {
            const id = editingNote;
            setEditingNote(null);
            const n = topo.notes!.find((x) => x.id === id)!;
            if (text !== n.text)
              commit(
                updateNote(topo, id, (x) => {
                  x.text = text;
                  if (x.kind === "text") {
                    const lines = text.split("\n");
                    x.w = Math.max(60, Math.max(...lines.map((l) => l.length)) * 8.6);
                    x.h = lines.length * 20 + 6;
                  }
                }),
              );
          }}
        />
      )}

      {/* port picker */}
      {picker && topo.devices.find((d) => d.id === picker.dev) && (
        <PortPicker
          dev={topo.devices.find((d) => d.id === picker.dev)!}
          topo={topo}
          q={picker.q}
          setQ={(q) => setPicker({ ...picker, q })}
          from={pending?.port ? `${pending.dev} ${pending.port}` : null}
          style={toScreen(topo.devices.find((d) => d.id === picker.dev)!.x + 44, topo.devices.find((d) => d.id === picker.dev)!.y - 30)}
          onPick={(p) => pickPort(picker.dev, p)}
          onClose={() => setPicker(null)}
        />
      )}

      {/* context menu */}
      {menu && (
        <div className="fpanel fmenu ctx" style={{ left: menu.x, top: menu.y }} onMouseLeave={() => setMenu(null)}>
          {menu.type === "device" && menu.id && (
            <>
              <button onClick={() => (openConsole(menu.id!), setMenu(null))}>Open console</button>
              <button onClick={() => (setTool("cable"), setPending(null), setPicker({ dev: menu.id!, q: "" }), setMenu(null))}>Connect cable…</button>
              <button onClick={() => (setTool("probe"), setPending({ dev: menu.id! }), setMenu(null))}>Send packet from here…</button>
              <button onClick={() => (setRenaming(menu.id!), setMenu(null))}>Rename</button>
              <button onClick={() => (commit(updateDevice(topo, menu.id!, (d) => (d.off = !d.off))), setMenu(null))}>
                {topo.devices.find((d) => d.id === menu.id)?.off ? "Power on" : "Power off"}
              </button>
              <button onClick={() => (copySel(), setMenu(null))}>Copy</button>
              <hr />
              <button className="danger" onClick={() => (deleteSelection(), setMenu(null))}>
                Delete
              </button>
            </>
          )}
          {menu.type === "note" && (
            <>
              <button onClick={() => (setEditingNote(menu.id!), setMenu(null))}>Edit text</button>
              <button className="danger" onClick={() => (deleteSelection(), setMenu(null))}>
                Delete
              </button>
            </>
          )}
          {menu.type === "link" && (
            <button className="danger" onClick={() => (deleteSelection(), setMenu(null))}>
              Delete cable
            </button>
          )}
          {menu.type === "canvas" && (
            <>
              {KINDS.map((k) => (
                <button key={k} onClick={() => (add(k, { x: menu.wx, y: menu.wy }), setMenu(null))}>
                  Add {KIND_META[k].label.toLowerCase()}
                </button>
              ))}
              <hr />
              <button disabled={!clip.current} onClick={() => (paste(), setMenu(null))}>
                Paste
              </button>
              <button onClick={() => (fit(), setMenu(null))}>Fit to screen</button>
            </>
          )}
        </div>
      )}

      {/* bottom-left status */}
      <div className="bench-status" style={{ bottom: dockOpen ? dockH + 12 : 14 }}>
        <b>{topo.devices.length}</b> devices · <b>{topo.links.length}</b> cables · <b>{running}</b> running
        {selection.size > 0 && (
          <>
            {" "}
            · <b>{selection.size}</b> selected
          </>
        )}
        {!scenario && <span className="silk"> · autosaved in this browser</span>}
      </div>

      {/* bottom-right view controls */}
      <div className="fpanel bench-view" style={{ bottom: dockOpen ? dockH + 10 : 12 }}>
        <div className="lens">
          <button className={lens === "l3" ? "on" : ""} onClick={() => setLens("l3")} title="Layer 3 view: addresses">
            L3
          </button>
          <button className={lens === "l2" ? "on" : ""} onClick={() => setLens("l2")} title="Layer 2 view: VLANs and spanning tree">
            L2
          </button>
          {lens === "l2" && (
            <select value={vlan} onChange={(e) => setVlan(+e.target.value)} aria-label="VLAN">
              {(vlans.length ? vlans : [1]).map((v) => (
                <option key={v} value={v}>
                  VLAN {v}
                </option>
              ))}
            </select>
          )}
        </div>
        <span className="tsep" />
        <button className="tbtn" title="Fit to screen" onClick={() => fit()}>
          ⤢
        </button>
        <button className="tbtn" title="Zoom out" onClick={() => setView((v) => ({ ...v, k: Math.max(0.25, v.k / 1.2) }))}>
          −
        </button>
        <span className="zoom num">{Math.round(view.k * 100)}%</span>
        <button className="tbtn" title="Zoom in" onClick={() => setView((v) => ({ ...v, k: Math.min(2.5, v.k * 1.2) }))}>
          +
        </button>
        <button className="tbtn" title="Shortcuts" onClick={() => setHelp(true)}>
          ?
        </button>
      </div>

      {toast && <div className="bench-toast">{toast}</div>}

      {/* dock: consoles + packet walk */}
      {dockOpen && (
        <div className="dock" style={{ height: dockH }}>
          <div
            className="dock-grip"
            onPointerDown={(e) => {
              const startY = e.clientY;
              const startH = dockH;
              const move = (ev: PointerEvent) => setDockH(Math.min(window.innerHeight - 140, Math.max(140, startH + startY - ev.clientY)));
              const up = () => {
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
              };
              window.addEventListener("pointermove", move);
              window.addEventListener("pointerup", up);
            }}
            aria-label="Resize console"
          />
          <div className="dock-tabs" role="tablist">
            {tabs.map((t) => (
              <div key={t} className={`dock-tab ${activeTab === t ? "on" : ""}`} role="tab" aria-selected={activeTab === t} onClick={() => setActiveTab(t)}>
                <span className="dot" style={{ background: topo.devices.find((d) => d.id === t)?.off ? "var(--muted)" : "var(--green)" }} />
                {t}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(t);
                  }}
                  aria-label={`Close ${t}`}
                >
                  ×
                </button>
              </div>
            ))}
            {run && (
              <div className={`dock-tab walk ${activeTab === "walk" ? "on" : ""}`} role="tab" aria-selected={activeTab === "walk"} onClick={() => setActiveTab("walk")}>
                ✉ Packet walk
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setRun(null);
                    if (activeTab === "walk") setActiveTab(tabs[tabs.length - 1] ?? null);
                  }}
                  aria-label="Close packet walk"
                >
                  ×
                </button>
              </div>
            )}
            <span style={{ flex: 1 }} />
            {activeTab && activeTab !== "walk" && consoles[activeTab] && (
              <button className="dock-act" onClick={() => navigator.clipboard?.writeText(consoles[activeTab].lines.map((l) => l.text).join("\n"))}>
                Copy
              </button>
            )}
            <button
              className="dock-act"
              onClick={() => {
                setTabs([]);
                setRun(null);
                setActiveTab(null);
              }}
              aria-label="Close dock"
            >
              ×
            </button>
          </div>
          <div className="dock-body">
            {activeTab === "walk" && run ? (
              <div className="dock-walk">
                <PacketWalk
                  run={run}
                  nameOf={nameOf}
                  probe={probeIdx}
                  setProbe={setProbeIdx}
                  events={walkEvents}
                  cursor={cursor}
                  setCursor={(n) => (setPlaying(false), setCursor(n))}
                  playing={playing}
                  setPlaying={(pl) => {
                    if (pl && cursor >= walkEvents.length - 1) setCursor(0);
                    setPlaying(pl);
                  }}
                  showAll={showAll}
                  setShowAll={setShowAll}
                />
              </div>
            ) : activeTab && consoles[activeTab] ? (
              <Console
                key={activeTab}
                lines={consoles[activeTab].lines}
                prompt={cliPrompt(consoles[activeTab].session, ["pc", "server"].includes(topo.devices.find((d) => d.id === activeTab)?.kind ?? ""))}
                history={consoles[activeTab].history}
                onRun={(l) => runLine(activeTab, l)}
                onHelp={(l) => runLine(activeTab, l, true)}
                onComplete={(l) => complete(l, consoles[activeTab].session, topo, net)}
                onClear={() => setConsoles((cs) => ({ ...cs, [activeTab]: { ...cs[activeTab], lines: [] } }))}
                active
              />
            ) : null}
            {run && activeTab !== "walk" && (
              <button className="walk-peek" onClick={() => setActiveTab("walk")}>
                ✉ last {run.kind === "ping" ? "ping" : "trace"}: {run.probes.map((p) => p.mark).join("")} · open packet walk
              </button>
            )}
          </div>
        </div>
      )}

      {help && <HelpModal onClose={() => setHelp(false)} />}
    </div>
  );
}

function RenameBox({ value, onDone, style }: { value: string; onDone: (v: string) => void; style: React.CSSProperties }) {
  const [v, setV] = useState(value);
  return (
    <input
      className="rename"
      style={{ ...style, transform: "translate(-50%, 0)" }}
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onDone(v.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") onDone(v.trim());
        if (e.key === "Escape") onDone(value);
      }}
      onFocus={(e) => e.target.select()}
      aria-label="Device name"
    />
  );
}

function NoteEditor({ note, style, k, onDone }: { note: NonNullable<Topology["notes"]>[number]; style: React.CSSProperties; k: number; onDone: (text: string) => void }) {
  const [v, setV] = useState(note.text);
  return (
    <textarea
      className="note-edit"
      style={{ ...style, width: Math.max(160, note.kind === "rect" ? note.w * k - 20 : 240), fontSize: (note.kind === "rect" ? 13 : 15) * k, marginLeft: note.kind === "rect" ? 8 * k : 0, marginTop: note.kind === "rect" ? 6 * k : 0 }}
      autoFocus
      rows={note.kind === "rect" ? 1 : Math.max(2, v.split("\n").length + 1)}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onDone(v)}
      onKeyDown={(e) => {
        if (e.key === "Escape") onDone(note.text);
        if (e.key === "Enter" && (note.kind === "rect" || e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          onDone(v);
        }
      }}
      onFocus={(e) => e.target.select()}
    />
  );
}

function PortPicker(props: {
  dev: Topology["devices"][number];
  topo: Topology;
  q: string;
  setQ: (q: string) => void;
  from: string | null;
  style: React.CSSProperties;
  onPick: (port: string) => void;
  onClose: () => void;
}) {
  const { dev, topo, q } = props;
  const ports = dev.ports.filter((p) => !/^Lo\d+$/.test(p.name)).filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase().replace(/^g(i(g(a(b(i(t(e(t(h(e(r(n(e(t)?)?)?)?)?)?)?)?)?)?)?)?)?)?/, "gi")));
  const groups = new Map<string, typeof ports>();
  for (const p of ports) {
    const g = p.name.startsWith("Gi") ? "GigabitEthernet" : p.name.startsWith("eth") ? "Ethernet" : "Ports";
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }
  const free = ports.filter((p) => !portInUse(topo, dev.id, p.name));
  return (
    <div className="fpanel picker" style={props.style} onPointerDown={(e) => e.stopPropagation()}>
      <div className="picker-head">
        <span className="silk">{props.from ? `${props.from} → ${dev.id}` : `From ${dev.id}`}</span>
        <button className="tbtn" onClick={props.onClose} aria-label="Close">
          ×
        </button>
      </div>
      <input
        className="wf"
        autoFocus
        placeholder="Search Gi0/1, 1/0/12…"
        value={q}
        onChange={(e) => props.setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && free[0]) props.onPick(free[0].name);
          if (e.key === "Escape") props.onClose();
        }}
      />
      <div className="picker-list">
        {[...groups.entries()].map(([g, list]) => (
          <div key={g}>
            <span className="silk">{g}</span>
            {list.map((p) => {
              const link = portInUse(topo, dev.id, p.name);
              const peer = link ? (link.a[0] === dev.id && link.a[1] === p.name ? link.b : link.a) : null;
              return (
                <button key={p.name} disabled={!!link} onClick={() => props.onPick(p.name)}>
                  <span>{p.name}</span>
                  <span className="silk">{peer ? `→ ${peer[0]} ${peer[1]}` : p.ip ? p.ip : p.mode === "trunk" ? "trunk" : p.vlan && p.vlan !== 1 ? `vlan ${p.vlan}` : ""}</span>
                </button>
              );
            })}
          </div>
        ))}
        {!ports.length && <p className="silk">No match.</p>}
      </div>
    </div>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ["Add a device", "Click it in the toolbar · drag it onto the canvas · keys 1–5"],
    ["Cable", "C, then click a device and pick a port, twice"],
    ["Send a packet", "P, click source, click destination"],
    ["Open a console", "Double-click a device · Enter"],
    ["Select several", "Drag on empty canvas · Shift-click"],
    ["Move around", "Scroll · Space + drag · middle-drag"],
    ["Zoom", "Ctrl/⌘ + scroll · pinch"],
    ["Undo / redo", "Ctrl+Z / Ctrl+Y"],
    ["Copy / paste / duplicate", "Ctrl+C / Ctrl+V / Ctrl+D"],
    ["Delete", "Del"],
    ["Note / zone", "T / B, then click · double-click to edit"],
    ["Console: help, complete, recall", "? · Tab · ↑↓ · Ctrl+Z ends config mode"],
    ["Cancel", "Esc"],
  ];
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="fpanel modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Shortcuts">
        <div className="picker-head">
          <h3 className="display" style={{ margin: 0 }}>
            Shortcuts
          </h3>
          <button className="tbtn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <table className="wt">
          <tbody>
            {rows.map(([a, b]) => (
              <tr key={a}>
                <th>{a}</th>
                <td>{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="silk" style={{ marginTop: 10 }}>
          Simulated: VLANs, trunks, RSTP, ARP, static routing, ACLs, ICMP. Not yet: OSPF/EIGRP, EtherChannel, NAT, subinterfaces.
        </p>
      </div>
    </div>
  );
}
