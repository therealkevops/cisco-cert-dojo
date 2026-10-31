import type { Device, DeviceKind, Link, Note, Topology } from "./types";

// Pure topology edits used by the canvas and the CLI. Each returns a new
// Topology so undo/redo can keep snapshots.

export const KIND_META: Record<DeviceKind, { label: string; prefix: string }> = {
  router: { label: "Router", prefix: "R" },
  switch: { label: "Switch", prefix: "SW" },
  l3switch: { label: "L3 switch", prefix: "MLS" },
  pc: { label: "PC", prefix: "PC" },
  server: { label: "Server", prefix: "SRV" },
};

/** Fresh device with factory defaults that mirror real gear: router ports start shut down. */
export function newDevice(kind: DeviceKind, id: string, x: number, y: number): Device {
  switch (kind) {
    case "router":
      return { id, kind, x, y, ports: [0, 1, 2, 3].map((i) => ({ name: `Gi0/${i}`, shutdown: true })) };
    case "switch":
      return { id, kind, x, y, ports: Array.from({ length: 24 }, (_, i) => ({ name: `Gi1/0/${i + 1}`, mode: "access" as const, vlan: 1 })) };
    case "l3switch":
      return { id, kind, x, y, ports: Array.from({ length: 24 }, (_, i) => ({ name: `Gi1/0/${i + 1}`, mode: "access" as const, vlan: 1 })), svis: [] };
    default:
      return { id, kind, x, y, ports: [{ name: "eth0" }] };
  }
}

export function nextName(topo: Topology, kind: DeviceKind): string {
  const prefix = KIND_META[kind].prefix;
  const taken = new Set(topo.devices.map((d) => d.id.toUpperCase()));
  for (let i = 1; ; i++) if (!taken.has(`${prefix}${i}`)) return `${prefix}${i}`;
}

const clone = (t: Topology): Topology => structuredClone(t);

export function addDevice(t: Topology, kind: DeviceKind, x: number, y: number): { topo: Topology; id: string } {
  const next = clone(t);
  const id = nextName(next, kind);
  next.devices.push(newDevice(kind, id, Math.round(x), Math.round(y)));
  return { topo: next, id };
}

export function portInUse(t: Topology, dev: string, port: string): Link | undefined {
  return t.links.find((l) => (l.a[0] === dev && l.a[1] === port) || (l.b[0] === dev && l.b[1] === port));
}

export function addLink(t: Topology, a: [string, string], b: [string, string]): Topology | string {
  if (a[0] === b[0]) return "A device can't be cabled to itself.";
  if (portInUse(t, ...a)) return `${a[0]} ${a[1]} is already connected.`;
  if (portInUse(t, ...b)) return `${b[0]} ${b[1]} is already connected.`;
  const next = clone(t);
  next.links.push({ a, b });
  return next;
}

export function removeLinks(t: Topology, idx: number[]): Topology {
  const next = clone(t);
  next.links = next.links.filter((_, i) => !idx.includes(i));
  return next;
}

export function removeItems(t: Topology, ids: string[]): Topology {
  const next = clone(t);
  const gone = new Set(ids);
  next.devices = next.devices.filter((d) => !gone.has(d.id));
  next.links = next.links.filter((l) => !gone.has(l.a[0]) && !gone.has(l.b[0]));
  next.notes = (next.notes ?? []).filter((n) => !gone.has(n.id));
  return next;
}

export function moveItems(t: Topology, ids: Set<string>, dx: number, dy: number): Topology {
  const next = clone(t);
  for (const d of next.devices) if (ids.has(d.id) && !d.locked) ((d.x = Math.round(d.x + dx)), (d.y = Math.round(d.y + dy)));
  for (const n of next.notes ?? []) if (ids.has(n.id)) ((n.x = Math.round(n.x + dx)), (n.y = Math.round(n.y + dy)));
  return next;
}

export const validHostname = (s: string) => /^[A-Za-z][A-Za-z0-9_-]{0,30}$/.test(s);

/** Rename a device everywhere it is referenced. Returns an error string on failure. */
export function renameDevice(t: Topology, from: string, to: string): Topology | string {
  if (from === to) return t;
  if (!validHostname(to)) return "Names start with a letter and use letters, digits, - or _ (max 31).";
  if (t.devices.some((d) => d.id.toLowerCase() === to.toLowerCase() && d.id !== from)) return `${to} already exists.`;
  const next = clone(t);
  for (const d of next.devices) if (d.id === from) d.id = to;
  for (const l of next.links) {
    if (l.a[0] === from) l.a = [to, l.a[1]];
    if (l.b[0] === from) l.b = [to, l.b[1]];
  }
  return next;
}

/** Copies devices (config included, cables excluded) and notes, offset on the canvas. */
export function duplicate(t: Topology, ids: string[], dx = 40, dy = 40): { topo: Topology; ids: string[] } {
  const next = clone(t);
  const made: string[] = [];
  for (const id of ids) {
    const d = t.devices.find((x) => x.id === id);
    if (d) {
      const copy: Device = { ...structuredClone(d), id: nextName(next, d.kind), x: d.x + dx, y: d.y + dy, locked: false };
      next.devices.push(copy);
      made.push(copy.id);
    }
    const n = (t.notes ?? []).find((x) => x.id === id);
    if (n) {
      const copy: Note = { ...n, id: newNoteId(), x: n.x + dx, y: n.y + dy };
      next.notes = [...(next.notes ?? []), copy];
      made.push(copy.id);
    }
  }
  return { topo: next, ids: made };
}

export function newNoteId() {
  return `note-${Math.random().toString(36).slice(2, 8)}`;
}

export function updateDevice(t: Topology, id: string, fn: (d: Device) => void): Topology {
  const next = clone(t);
  const d = next.devices.find((x) => x.id === id);
  if (d) fn(d);
  return next;
}

export function updateNote(t: Topology, id: string, fn: (n: Note) => void): Topology {
  const next = clone(t);
  const n = (next.notes ?? []).find((x) => x.id === id);
  if (n) fn(n);
  return next;
}

export function addNote(t: Topology, kind: Note["kind"], x: number, y: number): { topo: Topology; id: string } {
  const next = clone(t);
  const id = newNoteId();
  const note: Note = kind === "rect" ? { id, kind, x, y, w: 280, h: 180, text: "Zone" } : { id, kind, x, y, w: 200, h: 40, text: "Note" };
  next.notes = [...(next.notes ?? []), note];
  return { topo: next, id };
}
