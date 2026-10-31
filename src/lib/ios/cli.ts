import { Net, type ProbeResult } from "../net/engine";
import { intToIp, ipToInt, isIp, maskOf, maskToLen, parseCidr, wildcardToLen } from "../net/ip";
import { renameDevice } from "../net/ops";
import {
  ipconfig,
  longIf,
  showAcls,
  showArp,
  debugOspfAdj,
  showIpProtocols,
  showOspf,
  showOspfIntBrief,
  showOspfNbr,
  showCdp,
  showIntStatus,
  showIntTrunk,
  showIpIntBrief,
  showIpRoute,
  showMacTable,
  showRun,
  showSpanningTree,
  showVersion,
  showVlanBrief,
} from "../net/show";
import type { Ace, Device, Topology } from "../net/types";

// An IOS-style CLI over the Wire Room topology. Commands are a tree of
// keywords and typed arguments; the walker gives IOS behaviour for free:
// unique-prefix abbreviations, "?" help, tab completion, and the familiar
// "% Invalid input", "% Ambiguous command" and "% Incomplete command" errors.

export type Mode =
  | { m: "exec" }
  | { m: "config" }
  | { m: "if"; ifs: string[] }
  | { m: "vlan"; vlan: number }
  | { m: "acl"; name: string }
  | { m: "line" }
  | { m: "router" };

export type Session = { dev: string; priv: boolean; mode: Mode };

export type ProbeRun = { kind: "ping" | "trace"; src: string; dst: string; header: string; probes: ProbeResult[]; error?: string };

export type CliResult = {
  out: string;
  session: Session;
  /** Present when the command changed the topology. */
  topo?: Topology;
  /** Present when the command sent traffic, for the packet walk. */
  probe?: ProbeRun;
  /** hostname changed: consoles keyed by device id must follow. */
  renamed?: { from: string; to: string };
};

export function newSession(dev: string, kind: Device["kind"]): Session {
  return { dev, priv: kind === "pc" || kind === "server", mode: { m: "exec" } };
}

export function prompt(s: Session, isHost: boolean): string {
  if (isHost) return `${s.dev}> `;
  const sfx: Record<Mode["m"], string> = {
    exec: "",
    config: "(config)",
    if: s.mode.m === "if" && s.mode.ifs.length > 1 ? "(config-if-range)" : "(config-if)",
    vlan: "(config-vlan)",
    acl: "(config-ext-nacl)",
    line: "(config-line)",
    router: "(config-router)",
  };
  return `${s.dev}${sfx[s.mode.m]}${s.priv ? "#" : ">"}`;
}

// --- command tree -----------------------------------------------------------------

type ArgKind = "num" | "ip" | "mask" | "word" | "line" | "iface" | "vlans";

type Node = {
  kw?: string;
  arg?: ArgKind;
  name?: string;
  label?: string; // "<1-4094>" style hint for ?
  range?: [number, number];
  help: string;
  sub?: Node[];
  run?: (c: Ctx) => void;
  when?: (c: Ctx) => boolean;
};

type Ctx = {
  s: Session;
  dev: Device;
  topo: Topology;
  net: Net;
  a: Record<string, string>;
  lines: string[];
  changed: boolean;
  probe?: ProbeRun;
  renamed?: { from: string; to: string };
};

const say = (c: Ctx, text: string) => c.lines.push(text);

/** Clone-on-write edit of the current device. */
function edit(c: Ctx, fn: (d: Device) => void) {
  if (!c.changed) {
    c.topo = structuredClone(c.topo);
    c.changed = true;
  }
  const d = c.topo.devices.find((x) => x.id === c.s.dev)!;
  fn(d);
  c.dev = d;
}

const isSwitch = (c: Ctx) => c.dev.kind === "switch" || c.dev.kind === "l3switch";
const isL3 = (c: Ctx) => c.dev.kind !== "switch";

const kw = (k: string, help: string, rest: Partial<Node> = {}): Node => ({ kw: k, help, ...rest });
const arg = (kind: ArgKind, name: string, label: string, help: string, rest: Partial<Node> = {}): Node => ({ arg: kind, name, label, help, ...rest });

// IOS interface type names and the shortest prefix IOS accepts.
const IF_TYPES: { full: string; short: string; min: number }[] = [
  { full: "gigabitethernet", short: "Gi", min: 1 },
  { full: "fastethernet", short: "Fa", min: 1 },
  { full: "vlan", short: "Vlan", min: 1 },
  { full: "loopback", short: "Lo", min: 2 },
];

function canonIf(raw: string): string | null {
  const m = raw.toLowerCase().match(/^([a-z-]+)\s*([\d/.]+)$/);
  if (!m) return null;
  const t = IF_TYPES.find((x) => m[1].length >= x.min && x.full.startsWith(m[1]));
  return t ? `${t.short}${m[2]}` : null;
}

function parseVlans(s: string): number[] | null {
  const out: number[] = [];
  for (const part of s.split(",")) {
    const r = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!r) return null;
    const a = +r[1];
    const b = r[2] ? +r[2] : a;
    if (a < 1 || b > 4094 || b < a || b - a > 4094) return null;
    for (let v = a; v <= b; v++) out.push(v);
  }
  return [...new Set(out)].sort((x, y) => x - y);
}

/** Try to read an argument starting at tokens[i]. */
function readArg(n: Node, tokens: string[], i: number, c: Ctx): { consumed: number; value: string } | null {
  const t = tokens[i];
  switch (n.arg) {
    case "num": {
      if (!/^\d+$/.test(t)) return null;
      if (n.range && (+t < n.range[0] || +t > n.range[1])) return null;
      return { consumed: 1, value: t };
    }
    case "ip":
      return isIp(t) ? { consumed: 1, value: t } : null;
    case "mask":
      return isIp(t) ? { consumed: 1, value: t } : null;
    case "word":
      return { consumed: 1, value: t };
    case "line":
      return { consumed: tokens.length - i, value: tokens.slice(i).join(" ") };
    case "vlans":
      return parseVlans(t) ? { consumed: 1, value: t } : null;
    case "iface": {
      const ok = (name: string | null) => {
        if (!name) return false;
        if (name.startsWith("Vlan")) return /^Vlan\d+$/.test(name) && +name.slice(4) >= 1 && +name.slice(4) <= 4094 && isSwitch(c);
        if (name.startsWith("Lo")) return /^Lo\d+$/.test(name) && +name.slice(2) <= 2147483647 && isL3(c);
        return c.dev.ports.some((p) => p.name.toLowerCase() === name.toLowerCase());
      };
      const fix = (name: string) => (name.startsWith("Vlan") || name.startsWith("Lo") ? name : c.dev.ports.find((p) => p.name.toLowerCase() === name.toLowerCase())!.name);
      const one = canonIf(t);
      if (ok(one)) return { consumed: 1, value: fix(one!) };
      if (i + 1 < tokens.length) {
        const two = canonIf(t + tokens[i + 1]);
        if (ok(two)) return { consumed: 2, value: fix(two!) };
      }
      return null;
    }
  }
  return null;
}

// --- shared show / exec commands ------------------------------------------------------

function pingOut(c: Ctx, dst: string) {
  const r = c.net.ping(c.s.dev, dst, 5);
  c.probe = { kind: "ping", src: c.s.dev, dst, ...r };
  if (r.error) return say(c, `% ${r.error}`);
  const ok = r.probes.filter((p) => p.mark === "!").length;
  say(
    c,
    [
      "Type escape sequence to abort.",
      `Sending 5, 100-byte ICMP Echos to ${dst}, timeout is 2 seconds:`,
      r.probes.map((p) => p.mark).join(""),
      `Success rate is ${ok * 20} percent (${ok}/5)${ok ? ", round-trip min/avg/max = 1/1/2 ms" : ""}`,
    ].join("\n"),
  );
}

function traceOut(c: Ctx, dst: string) {
  const r = c.net.traceroute(c.s.dev, dst);
  c.probe = { kind: "trace", src: c.s.dev, dst, ...r };
  if (r.error) return say(c, `% ${r.error}`);
  const lines = ["Type escape sequence to abort.", `Tracing the route to ${dst}`, ""];
  for (const p of r.probes) {
    if (p.mark === ".") lines.push(`  ${p.seq} *  *  *`);
    else if (p.mark === "U") lines.push(`  ${p.seq} ${p.from} !H  !H  !H`);
    else lines.push(`  ${p.seq} ${p.from} 1 msec 1 msec 1 msec`);
  }
  say(c, lines.join("\n"));
}

function showTree(): Node[] {
  return [
    kw("running-config", "Current operating configuration", { run: (c) => say(c, showRun(c.net, c.s.dev)), when: (c) => c.s.priv }),
    kw("version", "System hardware and software status", { run: (c) => say(c, showVersion(c.net, c.s.dev)) }),
    kw("ip", "IP information", {
      sub: [
        kw("interface", "IP interface status and configuration", { sub: [kw("brief", "Brief summary of IP status and configuration", { run: (c) => say(c, showIpIntBrief(c.net, c.s.dev)) })] }),
        kw("route", "IP routing table", { when: isL3, run: (c) => say(c, showIpRoute(c.net, c.s.dev)) }),
        kw("arp", "IP ARP table", { run: (c) => say(c, showArp(c.net, c.s.dev)) }),
        kw("ospf", "OSPF information", {
          when: isL3,
          run: (c) => say(c, showOspf(c.net, c.s.dev)),
          sub: [
            kw("neighbor", "Neighbor list", { run: (c) => say(c, showOspfNbr(c.net, c.s.dev)) }),
            kw("interface", "Interface information", { run: (c) => say(c, showOspfIntBrief(c.net, c.s.dev)), sub: [kw("brief", "Brief summary of interface information", { run: (c) => say(c, showOspfIntBrief(c.net, c.s.dev)) })] }),
          ],
        }),
        kw("protocols", "IP routing protocol process parameters and statistics", { when: isL3, run: (c) => say(c, showIpProtocols(c.net, c.s.dev)) }),
      ],
    }),
    kw("interfaces", "Interface status and configuration", {
      sub: [
        kw("trunk", "Show interface trunk information", { when: isSwitch, run: (c) => say(c, showIntTrunk(c.net, c.s.dev)) }),
        kw("status", "Show interface line status", { when: isSwitch, run: (c) => say(c, showIntStatus(c.net, c.s.dev)) }),
      ],
    }),
    kw("vlan", "VTP VLAN status", { when: isSwitch, sub: [kw("brief", "VTP all VLAN status in brief", { run: (c) => say(c, showVlanBrief(c.net, c.s.dev)) })] }),
    kw("mac", "MAC configuration", { when: isSwitch, sub: [kw("address-table", "MAC forwarding table", { run: (c) => say(c, showMacTable(c.net, c.s.dev)) })] }),
    kw("spanning-tree", "Spanning tree topology", {
      when: isSwitch,
      run: (c) => say(c, c.net.vlans().map((v) => showSpanningTree(c.net, c.s.dev, v)).join("\n\n")),
      sub: [kw("vlan", "VLAN Switch Spanning Tree", { sub: [arg("num", "vlan", "<1-4094>", "VLAN number", { range: [1, 4094], run: (c) => say(c, showSpanningTree(c.net, c.s.dev, +c.a.vlan)) })] })],
    }),
    kw("access-lists", "List access lists", { run: (c) => say(c, showAcls(c.net, c.s.dev)) }),
    kw("cdp", "CDP information", { sub: [kw("neighbors", "CDP neighbor entries", { run: (c) => say(c, showCdp(c.net, c.s.dev)) })] }),
  ];
}

function execTree(): Node[] {
  return [
    kw("enable", "Turn on privileged commands", { when: (c) => !c.s.priv, run: (c) => (c.s.priv = true) }),
    kw("disable", "Turn off privileged commands", { when: (c) => c.s.priv, run: (c) => (c.s.priv = false) }),
    kw("configure", "Enter configuration mode", {
      when: (c) => c.s.priv,
      run: (c) => {
        say(c, "Enter configuration commands, one per line.  End with CNTL/Z.");
        c.s.mode = { m: "config" };
      },
      sub: [
        kw("terminal", "Configure from the terminal", {
          run: (c) => {
            say(c, "Enter configuration commands, one per line.  End with CNTL/Z.");
            c.s.mode = { m: "config" };
          },
        }),
      ],
    }),
    kw("show", "Show running system information", { sub: showTree() }),
    kw("ping", "Send echo messages", { sub: [arg("ip", "dst", "WORD", "Ping destination address", { run: (c) => pingOut(c, c.a.dst) })] }),
    kw("traceroute", "Trace route to destination", { sub: [arg("ip", "dst", "WORD", "Trace route to destination address", { run: (c) => traceOut(c, c.a.dst) })] }),
    kw("debug", "Debugging functions", {
      when: (c) => c.s.priv,
      sub: [kw("ip", "IP information", { sub: [kw("ospf", "OSPF information", { sub: [kw("adj", "OSPF adjacency events", { run: (c) => say(c, debugOspfAdj(c.net, c.s.dev)) })] })] })],
    }),
    kw("undebug", "Disable debugging functions", { when: (c) => c.s.priv, sub: [kw("all", "Disable all debugging", { run: (c) => say(c, "All possible debugging has been turned off") })] }),
    kw("clear", "Reset functions", {
      when: (c) => c.s.priv,
      sub: [
        kw("ip", "IP", { sub: [kw("ospf", "OSPF", { sub: [kw("process", "Reset OSPF process", { run: (c) => say(c, "Reset ALL OSPF processes? [no]: yes\n(Wire Room recomputes OSPF after every change, so this is instant.)") })] })] }),
        kw("mac", "MAC forwarding table", { when: isSwitch, sub: [kw("address-table", "MAC forwarding table", { run: (c) => c.net.macTables.delete(c.s.dev), sub: [kw("dynamic", "dynamic entries", { run: (c) => c.net.macTables.delete(c.s.dev) })] })] }),
        kw("arp-cache", "Clear the entire ARP cache", { run: (c) => c.net.arpTables.delete(c.s.dev) }),
      ],
    }),
    kw("write", "Write running configuration to memory", { when: (c) => c.s.priv, run: (c) => say(c, "Building configuration...\n[OK]"), sub: [kw("memory", "Write to NV memory", { run: (c) => say(c, "Building configuration...\n[OK]") })] }),
    kw("copy", "Copy from one file to another", {
      when: (c) => c.s.priv,
      sub: [kw("running-config", "Copy from current system configuration", { sub: [kw("startup-config", "Copy to startup configuration", { run: (c) => say(c, "Destination filename [startup-config]?\nBuilding configuration...\n[OK]") })] })],
    }),
    kw("exit", "Exit from the EXEC", {
      run: (c) => {
        c.s.priv = false;
        say(c, `\n${c.s.dev} con0 is now available\n\nPress RETURN to get started.`);
      },
    }),
  ];
}

// --- configuration ---------------------------------------------------------------------

function linkMsgs(c: Ctx, before: Net, ifs: string[]) {
  const after = new Net(c.topo);
  for (const i of ifs) {
    if (i.startsWith("Vlan")) continue;
    const p = c.dev.ports.find((x) => x.name === i)!;
    const was = before.linkUp(c.s.dev, i);
    const now = after.linkUp(c.s.dev, i);
    if (p.shutdown) say(c, `%LINK-5-CHANGED: Interface ${longIf(i)}, changed state to administratively down`);
    else if (now && !was) say(c, `%LINK-3-UPDOWN: Interface ${longIf(i)}, changed state to up\n%LINEPROTO-5-UPDOWN: Line protocol on Interface ${longIf(i)}, changed state to up`);
    else if (!now && !p.shutdown && !after.peer(c.s.dev, i)) say(c, `%LINK-3-UPDOWN: Interface ${longIf(i)}, changed state to down (no cable attached)`);
  }
}

/** Apply fn to every interface in the current interface (or range) mode. */
function eachIf(c: Ctx, fn: (p: Device["ports"][number] | NonNullable<Device["svis"]>[number], isSvi: boolean, d: Device) => string | void) {
  if (c.s.mode.m !== "if") return;
  for (const name of c.s.mode.ifs) {
    edit(c, (d) => {
      const svi = name.startsWith("Vlan") ? d.svis?.find((s) => s.vlan === +name.slice(4)) : undefined;
      const p = svi ?? d.ports.find((x) => x.name === name)!;
      const msg = fn(p, !!svi, d);
      if (msg) say(c, msg);
    });
  }
}

function portOnly(c: Ctx, msg: string, fn: (p: Device["ports"][number], d: Device) => void) {
  eachIf(c, (p, isSvi, d) => {
    if (isSvi) return msg;
    fn(p as Device["ports"][number], d);
  });
}

function switchportOnly(c: Ctx, fn: (p: Device["ports"][number]) => void) {
  if (!isSwitch(c)) return say(c, "% Invalid input detected: this is a router port. Switchport commands need a switch.");
  portOnly(c, "% Switchport commands don't apply to an SVI.", (p, d) => {
    if (d.kind === "l3switch" && p.mode === "routed") {
      say(c, `% ${p.name} is a routed port (no switchport). Enter 'switchport' first.`);
      return;
    }
    fn(p);
  });
}

function setIp(c: Ctx, ip: string, mask: string) {
  const len = maskToLen(mask);
  const loops = c.s.mode.m === "if" && c.s.mode.ifs.every((n) => n.startsWith("Lo"));
  if (len === null || len === 0 || (len === 32 && !loops)) return say(c, `% Bad mask ${mask} for address ${ip}`);
  const host = ipToInt(ip);
  const net = (host & maskOf(len)) >>> 0;
  const bcast = (net | ~maskOf(len)) >>> 0;
  if (len < 31 && (host === net || host === bcast)) return say(c, `% ${ip} is the ${host === net ? "network" : "broadcast"} address of ${intToIp(net)}/${len}`);
  eachIf(c, (p, isSvi, d) => {
    if (!isSvi && d.kind === "switch") return "% Layer 2 switch ports can't have an IP address. Use 'interface vlan N' (management) or an L3 switch.";
    if (!isSvi && d.kind === "l3switch" && (p as Device["ports"][number]).mode !== "routed") return "% This is a switchport. Use 'no switchport' first, or configure an SVI.";
    p.ip = `${ip}/${len}`;
  });
}

function aclAddr(tokens: string[], i: number): { spec: string; used: number } | null {
  const t = tokens[i]?.toLowerCase();
  if (!t) return null;
  if (t === "any") return { spec: "any", used: 1 };
  if (t === "host" && isIp(tokens[i + 1] ?? "")) return { spec: `host ${tokens[i + 1]}`, used: 2 };
  if (isIp(t)) {
    const w = tokens[i + 1];
    if (w && isIp(w)) {
      const len = wildcardToLen(w);
      if (len === null) return null;
      const c = parseCidr(`${t}/${len}`)!;
      return { spec: len === 32 ? `host ${t}` : `${intToIp(c.net)}/${len}`, used: 2 };
    }
    return { spec: `host ${t}`, used: 1 };
  }
  return null;
}

/** "[seq] permit|deny proto src dst [eq x] [log]" → Ace. */
function parseAce(text: string, standard = false): Ace | string {
  const tk = text.trim().split(/\s+/);
  let i = 0;
  let seq: number | undefined;
  if (/^\d+$/.test(tk[0])) seq = +tk[i++];
  const action = tk[i++]?.toLowerCase();
  if (action !== "permit" && action !== "deny") return "% Expected permit or deny";
  let proto: Ace["proto"] = "ip";
  if (!standard) {
    const p = tk[i++]?.toLowerCase();
    if (p !== "ip" && p !== "icmp" && p !== "tcp" && p !== "udp") return "% Protocol must be ip, icmp, tcp or udp";
    proto = p;
  }
  const src = aclAddr(tk, i);
  if (!src) return "% Invalid source (use any, host A.B.C.D, or A.B.C.D wildcard)";
  i += src.used;
  let dst: { spec: string; used: number } | null = { spec: "any", used: 0 };
  if (!standard) {
    dst = aclAddr(tk, i);
    if (!dst) return "% Invalid destination (use any, host A.B.C.D, or A.B.C.D wildcard)";
  }
  return { seq, action, proto, src: src.spec, dst: dst.spec };
}

function addAce(c: Ctx, name: string, text: string, standard = false) {
  const ace = parseAce(text, standard);
  if (typeof ace === "string") return say(c, ace);
  edit(c, (d) => {
    d.acls = d.acls ?? {};
    const list = (d.acls[name] = d.acls[name] ?? []).map((a, i) => ({ ...a, seq: a.seq ?? (i + 1) * 10 }));
    const seq = ace.seq ?? (list.length ? Math.max(...list.map((a) => a.seq!)) + 10 : 10);
    if (list.some((a) => a.seq === seq)) {
      say(c, `% Duplicate sequence number ${seq}`);
      d.acls[name] = list;
      return;
    }
    list.push({ ...ace, seq });
    d.acls[name] = list.sort((a, b) => a.seq! - b.seq!);
  });
}

function stpPrio(c: Ctx, vlans: string, prio: number) {
  if (prio % 4096 !== 0 || prio > 61440) return say(c, "% Bridge Priority must be in increments of 4096.\n% Allowed values are:\n  0     4096  8192  12288 16384 20480 24576 28672\n  32768 36864 40960 45056 49152 53248 57344 61440");
  edit(c, (d) => {
    d.stpVlanPriority = d.stpVlanPriority ?? {};
    for (const v of parseVlans(vlans)!) d.stpVlanPriority[v] = prio;
  });
}

/** IOS: 24576, or 4096 below the current root if that root is already lower. */
function rootPrimary(c: Ctx) {
  for (const v of parseVlans(c.a.vlans)!) {
    const view = c.net.stp(v);
    const root = view.rootOf[c.s.dev];
    const rootPrio = root && root !== c.s.dev ? view.bridgeId[root].prio - v : 32768;
    stpPrio(c, String(v), rootPrio <= 24576 ? Math.max(0, rootPrio - 4096) : 24576);
  }
}

function enterIfs(c: Ctx, ifs: string[]) {
  for (const name of ifs) {
    if (name.startsWith("Vlan")) {
      const vlan = +name.slice(4);
      if (!c.dev.svis?.some((s) => s.vlan === vlan)) edit(c, (d) => (d.svis = [...(d.svis ?? []), { vlan, ip: "" }]));
    }
    if (name.startsWith("Lo") && !c.dev.ports.some((p) => p.name === name)) {
      edit(c, (d) => d.ports.push(d.kind === "l3switch" ? { name, mode: "routed" } : { name }));
      say(c, `%LINEPROTO-5-UPDOWN: Line protocol on Interface ${longIf(name)}, changed state to up`);
    }
  }
  c.s.mode = { m: "if", ifs };
}

/** "gi1/0/1 - 4, gi1/0/10" → port names. */
function parseRange(c: Ctx, text: string): string[] | string {
  const out: string[] = [];
  for (const part of text.split(",").map((x) => x.trim()).filter(Boolean)) {
    const m = part.replace(/\s+/g, "").match(/^([a-zA-Z-]+[\d/]*?)(\d+)(?:-(\d+))?$/);
    if (!m) return `% Invalid range "${part}"`;
    const base = canonIf(m[1].replace(/\/$/, "/") + m[2]);
    if (!base) return `% Invalid interface "${part}"`;
    const prefix = base.slice(0, base.length - m[2].length);
    const from = +m[2];
    const to = m[3] ? +m[3] : from;
    for (let n = from; n <= to; n++) {
      const name = c.dev.ports.find((p) => p.name.toLowerCase() === `${prefix}${n}`.toLowerCase())?.name;
      if (!name) return `% Interface ${prefix}${n} does not exist`;
      out.push(name);
    }
  }
  return out.length ? out : "% Incomplete range";
}

const notSimulated = (what: string) => (c: Ctx) => say(c, `% ${what} isn't simulated in Wire Room yet. The command was not applied.`);
const accepted = (c: Ctx) => void c; // harmless commands we accept silently

function configTree(): Node[] {
  return [
    kw("hostname", "Set system's network name", {
      sub: [
        arg("word", "name", "WORD", "This system's network name", {
          run: (c) => {
            const r = renameDevice(c.topo, c.s.dev, c.a.name);
            if (typeof r === "string") return say(c, `% ${r}`);
            c.renamed = { from: c.s.dev, to: c.a.name };
            c.topo = r;
            c.changed = true;
            c.s.dev = c.a.name;
            c.dev = r.devices.find((d) => d.id === c.a.name)!;
          },
        }),
      ],
    }),
    kw("interface", "Select an interface to configure", {
      sub: [
        kw("range", "interface range command", { sub: [arg("line", "range", "LINE", "e.g. gi1/0/1 - 4, gi1/0/10", { run: (c) => { const r = parseRange(c, c.a.range); if (typeof r === "string") say(c, r); else enterIfs(c, r); } })] }),
        arg("iface", "if", "<interface>", "e.g. GigabitEthernet0/0, vlan 10", { run: (c) => enterIfs(c, [c.a.if]) }),
      ],
    }),
    kw("vlan", "VLAN commands", { when: isSwitch, sub: [arg("vlans", "vlan", "<1-4094>", "VLAN ID(s)", { run: (c) => (c.s.mode = { m: "vlan", vlan: parseVlans(c.a.vlan)![0] }) })] }),
    kw("ip", "Global IP configuration subcommands", {
      sub: [
        kw("route", "Establish static routes", {
          when: isL3,
          sub: [
            arg("ip", "net", "A.B.C.D", "Destination prefix", {
              sub: [
                arg("mask", "mask", "A.B.C.D", "Destination prefix mask", {
                  sub: [
                    arg("ip", "via", "A.B.C.D", "Forwarding router's address", {
                      run: (c) => {
                        const len = maskToLen(c.a.mask);
                        if (len === null) return say(c, "% Inconsistent address and mask");
                        const canon = `${intToIp(parseCidr(`${c.a.net}/${len}`)!.net)}/${len}`;
                        if (canon !== `${c.a.net}/${len}`) return say(c, "% Inconsistent address and mask");
                        edit(c, (d) => {
                          d.routes = d.routes ?? [];
                          if (!d.routes.some((r) => r.prefix === canon && r.via === c.a.via)) d.routes.push({ prefix: canon, via: c.a.via });
                        });
                      },
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
        kw("routing", "Enable IP routing", { when: (c) => c.dev.kind !== "pc" && c.dev.kind !== "server", run: (c) => { if (c.dev.kind === "switch") say(c, "% This is a Layer 2 switch model. Use an L3 switch for 'ip routing'."); } }),
        kw("access-list", "Named access list", {
          sub: [
            kw("extended", "Extended Access List", { sub: [arg("word", "name", "WORD", "Access-list name", { run: (c) => { edit(c, (d) => { d.acls = d.acls ?? {}; d.acls[c.a.name] = d.acls[c.a.name] ?? []; }); c.s.mode = { m: "acl", name: c.a.name }; } })] }),
            kw("standard", "Standard Access List", { run: notSimulated("Named standard ACLs (use extended)"), sub: [arg("line", "x", "WORD", "Access-list name", { run: notSimulated("Named standard ACLs (use extended)") })] }),
          ],
        }),
        kw("domain-name", "Define the default domain name", { sub: [arg("word", "x", "WORD", "Default domain name", { run: accepted })] }),
        kw("domain", "IP DNS Resolver", { sub: [kw("name", "Define the default domain name", { sub: [arg("word", "x", "WORD", "Default domain name", { run: accepted })] }), kw("lookup", "Enable IP Domain Name System hostname translation", { run: accepted })] }),
        kw("default-gateway", "Specify default gateway (if not routing IP)", { when: (c) => c.dev.kind === "switch", sub: [arg("ip", "gw", "A.B.C.D", "IP address of default gateway", { run: (c) => edit(c, (d) => (d.gateway = c.a.gw)) })] }),
      ],
    }),
    kw("access-list", "Add an access list entry", {
      sub: [
        arg("num", "n", "<1-199>", "IP access list number", {
          range: [1, 199],
          sub: [
            arg("line", "rule", "LINE", "permit|deny ...", {
              run: (c) => addAce(c, c.a.n, c.a.rule, +c.a.n < 100),
            }),
          ],
        }),
      ],
    }),
    kw("spanning-tree", "Spanning Tree Subsystem", {
      when: isSwitch,
      sub: [
        kw("mode", "Spanning tree operating mode", { sub: [kw("rapid-pvst", "Per-Vlan rapid spanning tree mode", { run: accepted }), kw("pvst", "Per-Vlan spanning tree mode", { run: (c) => say(c, "% Note: Wire Room computes the converged RSTP result for both modes.") }), kw("mst", "Multiple spanning tree mode", { run: notSimulated("MST") })] }),
        kw("vlan", "VLAN Switch Spanning Tree", {
          sub: [
            arg("vlans", "vlans", "WORD", "vlan range, example: 1,3-5,7,9-11", {
              sub: [
                kw("priority", "Set the bridge priority for the spanning tree", { sub: [arg("num", "prio", "<0-61440>", "bridge priority in increments of 4096", { range: [0, 61440], run: (c) => stpPrio(c, c.a.vlans, +c.a.prio) })] }),
                kw("root", "Configure switch as root", {
                  sub: [
                    kw("primary", "Configure this switch as primary root for this spanning tree", { run: (c) => rootPrimary(c) }),
                    kw("secondary", "Configure switch as secondary root", { run: (c) => stpPrio(c, c.a.vlans, 28672) }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
    kw("router", "Enable a routing process", {
      when: isL3,
      sub: [
        kw("ospf", "Open Shortest Path First (OSPF)", {
          sub: [
            arg("num", "pid", "<1-65535>", "Process ID", {
              range: [1, 65535],
              run: (c) => {
                if (c.dev.ospf && c.dev.ospf.pid !== +c.a.pid) return say(c, `% Wire Room simulates one OSPF process per device (ospf ${c.dev.ospf.pid} already runs here).`);
                if (!c.dev.ospf) edit(c, (d) => (d.ospf = { pid: +c.a.pid, networks: [] }));
                c.s.mode = { m: "router" };
              },
            }),
          ],
        }),
        kw("eigrp", "Enhanced Interior Gateway Routing Protocol (EIGRP)", { run: notSimulated("EIGRP"), sub: [arg("line", "x", "WORD", "AS number", { run: notSimulated("EIGRP") })] }),
        kw("bgp", "Border Gateway Protocol (BGP)", { run: notSimulated("BGP"), sub: [arg("line", "x", "WORD", "AS number", { run: notSimulated("BGP") })] }),
        kw("rip", "Routing Information Protocol (RIP)", { run: notSimulated("RIP") }),
      ],
    }),
    kw("line", "Configure a terminal line", { sub: [arg("line", "x", "LINE", "con 0 | vty 0 15", { run: (c) => (c.s.mode = { m: "line" }) })] }),
    kw("enable", "Modify enable password parameters", { sub: [arg("line", "x", "LINE", "secret / password", { run: accepted })] }),
    kw("username", "Establish User Name Authentication", { sub: [arg("line", "x", "LINE", "User name and options", { run: accepted })] }),
    kw("service", "Modify use of network based services", { sub: [arg("line", "x", "LINE", "e.g. password-encryption", { run: accepted })] }),
    kw("banner", "Define a login banner", { sub: [arg("line", "x", "LINE", "c banner-text c", { run: accepted })] }),
    kw("cdp", "Global CDP configuration subcommands", { sub: [kw("run", "Enable CDP", { run: accepted })] }),
    kw("no", "Negate a command or set its defaults", {
      sub: [
        kw("ip", "Global IP configuration subcommands", {
          sub: [
            kw("route", "Establish static routes", {
              when: isL3,
              sub: [
                arg("ip", "net", "A.B.C.D", "Destination prefix", {
                  sub: [
                    arg("mask", "mask", "A.B.C.D", "Destination prefix mask", {
                      run: (c) => removeRoute(c),
                      sub: [arg("ip", "via", "A.B.C.D", "Forwarding router's address", { run: (c) => removeRoute(c) })],
                    }),
                  ],
                }),
              ],
            }),
            kw("access-list", "Named access list", { sub: [kw("extended", "Extended Access List", { sub: [arg("word", "name", "WORD", "Access-list name", { run: (c) => edit(c, (d) => { if (d.acls) delete d.acls[c.a.name]; }) })] })] }),
            kw("domain-lookup", "Disable DNS lookup", { run: accepted }),
            kw("domain", "IP DNS Resolver", { sub: [kw("lookup", "Disable DNS lookup", { run: accepted })] }),
            kw("routing", "Disable IP routing", { run: notSimulated("Turning routing off on an L3 switch") }),
          ],
        }),
        kw("router", "Disable a routing process", {
          sub: [kw("ospf", "Open Shortest Path First (OSPF)", { sub: [arg("num", "pid", "<1-65535>", "Process ID", { range: [1, 65535], run: (c) => edit(c, (d) => { if (d.ospf?.pid === +c.a.pid) delete d.ospf; else say(c, "% OSPF process not found"); }) })] })],
        }),
        kw("access-list", "Remove an access list", { sub: [arg("num", "n", "<1-199>", "IP access list number", { run: (c) => edit(c, (d) => { if (d.acls) delete d.acls[c.a.n]; }) })] }),
        kw("interface", "Delete a logical interface", {
          sub: [arg("iface", "if", "<interface>", "Vlan interface", {
            run: (c) =>
              c.a.if.startsWith("Vlan")
                ? edit(c, (d) => (d.svis = (d.svis ?? []).filter((s) => s.vlan !== +c.a.if.slice(4))))
                : c.a.if.startsWith("Lo")
                  ? edit(c, (d) => (d.ports = d.ports.filter((p) => p.name !== c.a.if)))
                  : say(c, "% Physical interfaces can't be removed"),
          })],
        }),
        kw("spanning-tree", "Spanning Tree Subsystem", {
          when: isSwitch,
          sub: [kw("vlan", "VLAN Switch Spanning Tree", { sub: [arg("vlans", "vlans", "WORD", "vlan range", { run: (c) => edit(c, (d) => { for (const v of parseVlans(c.a.vlans)!) delete d.stpVlanPriority?.[v]; }), sub: [kw("priority", "Reset bridge priority", { run: (c) => edit(c, (d) => { for (const v of parseVlans(c.a.vlans)!) delete d.stpVlanPriority?.[v]; }) })] })] })],
        }),
        kw("vlan", "VLAN commands", { when: isSwitch, sub: [arg("vlans", "x", "<1-4094>", "VLAN ID", { run: accepted })] }),
        kw("hostname", "Reset the hostname", { run: (c) => say(c, "% Keep a hostname: rename with 'hostname NAME'.") }),
        kw("cdp", "CDP", { sub: [kw("run", "Disable CDP", { run: accepted })] }),
      ],
    }),
    kw("do", "To run exec commands in config mode", { sub: [arg("line", "cmd", "LINE", "Exec Command", { run: (c) => runDo(c) })] }),
    kw("end", "Exit from configure mode", { run: (c) => (c.s.mode = { m: "exec" }) }),
    kw("exit", "Exit from configure mode", { run: (c) => (c.s.mode = { m: "exec" }) }),
  ];
}

function removeRoute(c: Ctx) {
  const len = maskToLen(c.a.mask);
  if (len === null) return say(c, "% Inconsistent address and mask");
  const prefix = `${c.a.net}/${len}`;
  edit(c, (d) => {
    const before = d.routes?.length ?? 0;
    d.routes = (d.routes ?? []).filter((r) => !(r.prefix === prefix && (!c.a.via || r.via === c.a.via)));
    if (d.routes.length === before) say(c, "%No matching route to delete");
  });
}

function ifTree(): Node[] {
  return [
    kw("ip", "Interface Internet Protocol config commands", {
      sub: [
        kw("address", "Set the IP address of an interface", { sub: [arg("ip", "ip", "A.B.C.D", "IP address", { sub: [arg("mask", "mask", "A.B.C.D", "IP subnet mask", { run: (c) => setIp(c, c.a.ip, c.a.mask) })] }), kw("dhcp", "IP Address negotiated via DHCP", { run: notSimulated("DHCP") })] }),
        kw("ospf", "OSPF interface commands", { when: isL3, sub: ifOspfTree(false) }),
        kw("mtu", "Set IP Maximum Transmission Unit", { sub: [arg("num", "mtu", "<68-9216>", "MTU (bytes)", { range: [68, 9216], run: (c) => eachIf(c, (p) => { p.mtu = +c.a.mtu === 1500 ? undefined : +c.a.mtu; }) })] }),
        kw("access-group", "Specify access control for packets", {
          sub: [
            arg("word", "acl", "WORD", "Access-list name or number", {
              sub: [
                kw("in", "inbound packets", { run: (c) => eachIf(c, (p) => { p.aclIn = c.a.acl; }) }),
                kw("out", "outbound packets", { run: (c) => eachIf(c, (p) => { p.aclOut = c.a.acl; }) }),
              ],
            }),
          ],
        }),
      ],
    }),
    kw("shutdown", "Shutdown the selected interface", {
      run: (c) => {
        const before = new Net(c.topo);
        eachIf(c, (p) => { p.shutdown = true; });
        if (c.s.mode.m === "if") linkMsgs(c, before, c.s.mode.ifs);
      },
    }),
    kw("switchport", "Set switching mode characteristics", {
      when: isSwitch,
      run: (c) => portOnly(c, "% Not applicable to an SVI", (p) => { if (p.mode === "routed") { p.mode = "access"; p.vlan = 1; delete p.ip; } }),
      sub: [
        kw("mode", "Set trunking mode of the interface", {
          sub: [
            kw("access", "Set trunking mode to ACCESS unconditionally", { run: (c) => switchportOnly(c, (p) => { p.mode = "access"; }) }),
            kw("trunk", "Set trunking mode to TRUNK unconditionally", { run: (c) => switchportOnly(c, (p) => { p.mode = "trunk"; }) }),
            kw("dynamic", "Set trunking mode to dynamically negotiate", { sub: [arg("line", "x", "auto|desirable", "DTP mode", { run: notSimulated("DTP negotiation (hardcode access or trunk)") })] }),
          ],
        }),
        kw("access", "Set access mode characteristics", { sub: [kw("vlan", "Set VLAN when interface is in access mode", { sub: [arg("num", "vlan", "<1-4094>", "VLAN ID of the VLAN", { range: [1, 4094], run: (c) => switchportOnly(c, (p) => { p.vlan = +c.a.vlan; }) })] })] }),
        kw("trunk", "Set trunking characteristics of the interface", {
          sub: [
            kw("allowed", "Set allowed VLAN characteristics", {
              sub: [
                kw("vlan", "Set allowed VLANs when interface is in trunking mode", {
                  sub: [
                    kw("all", "all VLANs", { run: (c) => switchportOnly(c, (p) => { delete p.allowed; }) }),
                    kw("none", "no VLANs", { run: (c) => switchportOnly(c, (p) => { p.allowed = []; }) }),
                    kw("add", "add VLANs to the current list", { sub: [arg("vlans", "v", "WORD", "VLAN IDs of the allowed VLANs", { run: (c) => switchportOnly(c, (p) => { if (p.allowed) p.allowed = [...new Set([...p.allowed, ...parseVlans(c.a.v)!])].sort((a, b) => a - b); }) })] }),
                    kw("remove", "remove VLANs from the current list", { sub: [arg("vlans", "v", "WORD", "VLAN IDs", { run: (c) => switchportOnly(c, (p) => { const rm = parseVlans(c.a.v)!; const cur = p.allowed ?? Array.from({ length: 4094 }, (_, i) => i + 1); p.allowed = cur.filter((v) => !rm.includes(v)); }) })] }),
                    arg("vlans", "v", "WORD", "VLAN IDs of the allowed VLANs when this port is in trunking mode", { run: (c) => switchportOnly(c, (p) => { p.allowed = parseVlans(c.a.v)!; }) }),
                  ],
                }),
              ],
            }),
            kw("native", "Set trunking native characteristics", { sub: [kw("vlan", "Set native VLAN when interface is in trunking mode", { sub: [arg("num", "v", "<1-4094>", "VLAN ID of the native VLAN", { range: [1, 4094], run: (c) => switchportOnly(c, (p) => { p.native = +c.a.v; }) })] })] }),
            kw("encapsulation", "Set trunking encapsulation", { sub: [kw("dot1q", "Interface uses only 802.1q trunking encapsulation", { run: accepted })] }),
          ],
        }),
        kw("nonegotiate", "Device will not engage in negotiation protocol", { run: accepted }),
      ],
    }),
    kw("description", "Interface specific description", { sub: [arg("line", "d", "LINE", "Up to 240 characters", { run: (c) => portOnly(c, "% Descriptions on SVIs aren't stored", (p) => { p.description = c.a.d; }) })] }),
    kw("spanning-tree", "Spanning Tree Subsystem", { when: isSwitch, sub: [arg("line", "x", "LINE", "portfast | bpduguard enable | ...", { run: accepted })] }),
    kw("duplex", "Configure duplex operation", { sub: [arg("line", "x", "LINE", "auto | full | half", { run: accepted })] }),
    kw("speed", "Configure speed operation", { sub: [arg("line", "x", "LINE", "auto | 10 | 100 | 1000", { run: accepted })] }),
    kw("channel-group", "Etherchannel/port bundling configuration", { sub: [arg("line", "x", "LINE", "group mode", { run: notSimulated("EtherChannel") })] }),
    kw("encapsulation", "Set encapsulation type for an interface", { sub: [arg("line", "x", "LINE", "dot1Q vlan", { run: notSimulated("Subinterfaces (router-on-a-stick); use an L3 switch SVI instead") })] }),
    kw("no", "Negate a command or set its defaults", {
      sub: [
        kw("shutdown", "Shutdown the selected interface", {
          run: (c) => {
            const before = new Net(c.topo);
            eachIf(c, (p) => { p.shutdown = false; });
            if (c.s.mode.m === "if") linkMsgs(c, before, c.s.mode.ifs);
          },
        }),
        kw("ip", "Interface Internet Protocol config commands", {
          sub: [
            kw("address", "Set the IP address of an interface", { run: (c) => eachIf(c, (p, isSvi) => { if (isSvi) (p as { ip: string }).ip = ""; else delete (p as Device["ports"][number]).ip; }) }),
            kw("ospf", "OSPF interface commands", { when: isL3, sub: ifOspfTree(true) }),
            kw("mtu", "Reset the IP MTU", { run: (c) => eachIf(c, (p) => { delete p.mtu; }) }),
            kw("access-group", "Specify access control for packets", {
              sub: [arg("word", "acl", "WORD", "Access-list name", { sub: [kw("in", "inbound packets", { run: (c) => eachIf(c, (p) => { delete p.aclIn; }) }), kw("out", "outbound packets", { run: (c) => eachIf(c, (p) => { delete p.aclOut; }) })] })],
            }),
          ],
        }),
        kw("switchport", "Make this a routed port", {
          when: (c) => c.dev.kind === "l3switch",
          run: (c) => portOnly(c, "% Not applicable to an SVI", (p) => { p.mode = "routed"; delete p.vlan; delete p.allowed; }),
          sub: [
            kw("trunk", "Trunking characteristics", { sub: [kw("allowed", "Allowed VLANs", { sub: [kw("vlan", "Reset to all VLANs", { run: (c) => switchportOnly(c, (p) => { delete p.allowed; }) })] }), kw("native", "Native VLAN", { sub: [kw("vlan", "Reset to VLAN 1", { run: (c) => switchportOnly(c, (p) => { delete p.native; }) })] })] }),
            kw("access", "Access mode", { sub: [kw("vlan", "Reset to VLAN 1", { run: (c) => switchportOnly(c, (p) => { p.vlan = 1; }) })] }),
          ],
        }),
        kw("description", "Remove description", { run: (c) => portOnly(c, "", (p) => { delete p.description; }) }),
        kw("spanning-tree", "Spanning Tree Subsystem", { sub: [arg("line", "x", "LINE", "feature", { run: accepted })] }),
      ],
    }),
    kw("interface", "Select an interface to configure", {
      sub: [
        kw("range", "interface range command", { sub: [arg("line", "range", "LINE", "e.g. gi1/0/1 - 4", { run: (c) => { const r = parseRange(c, c.a.range); if (typeof r === "string") say(c, r); else enterIfs(c, r); } })] }),
        arg("iface", "if", "<interface>", "Interface to configure", { run: (c) => enterIfs(c, [c.a.if]) }),
      ],
    }),
    kw("do", "To run exec commands in config mode", { sub: [arg("line", "cmd", "LINE", "Exec Command", { run: (c) => runDo(c) })] }),
    kw("exit", "Exit from interface configuration mode", { run: (c) => (c.s.mode = { m: "config" }) }),
    kw("end", "Exit to privileged EXEC", { run: (c) => (c.s.mode = { m: "exec" }) }),
  ];
}

function aclTree(): Node[] {
  const rule = (action: "permit" | "deny"): Node =>
    kw(action, `Specify packets to ${action === "permit" ? "forward" : "reject"}`, {
      sub: [arg("line", "rule", "LINE", "ip|icmp|tcp|udp  any | host A.B.C.D | A.B.C.D wildcard  (src, then dst)", { run: (c) => c.s.mode.m === "acl" && addAce(c, c.s.mode.name, `${action} ${c.a.rule}`) })],
    });
  return [
    rule("permit"),
    rule("deny"),
    arg("num", "seq", "<1-2147483647>", "Sequence Number", {
      sub: [
        kw("permit", "Specify packets to forward", { sub: [arg("line", "rule", "LINE", "proto src dst", { run: (c) => c.s.mode.m === "acl" && addAce(c, c.s.mode.name, `${c.a.seq} permit ${c.a.rule}`) })] }),
        kw("deny", "Specify packets to reject", { sub: [arg("line", "rule", "LINE", "proto src dst", { run: (c) => c.s.mode.m === "acl" && addAce(c, c.s.mode.name, `${c.a.seq} deny ${c.a.rule}`) })] }),
      ],
    }),
    kw("no", "Negate a command or set its defaults", {
      sub: [
        arg("num", "seq", "<1-2147483647>", "Sequence number to delete", {
          run: (c) => {
            if (c.s.mode.m !== "acl") return;
            const name = c.s.mode.name;
            edit(c, (d) => {
              const list = (d.acls?.[name] ?? []).map((a, i) => ({ ...a, seq: a.seq ?? (i + 1) * 10 }));
              const kept = list.filter((a) => a.seq !== +c.a.seq);
              if (kept.length === list.length) say(c, `% Sequence number ${c.a.seq} not found`);
              d.acls![name] = kept;
            });
          },
        }),
      ],
    }),
    kw("do", "To run exec commands in config mode", { sub: [arg("line", "cmd", "LINE", "Exec Command", { run: (c) => runDo(c) })] }),
    kw("exit", "Exit from access-list configuration mode", { run: (c) => (c.s.mode = { m: "config" }) }),
    kw("end", "Exit to privileged EXEC", { run: (c) => (c.s.mode = { m: "exec" }) }),
  ];
}

function simpleSubTree(exitTo: Mode["m"]): Node[] {
  return [
    kw("name", "Ascii name of the VLAN", { sub: [arg("word", "x", "WORD", "The ascii name for the VLAN", { run: accepted })] }),
    kw("login", "Enable password checking", { run: accepted, sub: [arg("line", "x", "LINE", "local", { run: accepted })] }),
    kw("password", "Set a password", { sub: [arg("line", "x", "LINE", "The password", { run: accepted })] }),
    kw("transport", "Define transport protocols for line", { sub: [arg("line", "x", "LINE", "input ssh", { run: accepted })] }),
    kw("exec-timeout", "Set the EXEC timeout", { sub: [arg("line", "x", "LINE", "minutes seconds", { run: accepted })] }),
    kw("logging", "Modify message logging facilities", { sub: [arg("line", "x", "LINE", "synchronous", { run: accepted })] }),
    kw("do", "To run exec commands in config mode", { sub: [arg("line", "cmd", "LINE", "Exec Command", { run: (c) => runDo(c) })] }),
    kw("exit", "Exit from this mode", { run: (c) => (c.s.mode = { m: exitTo === "exec" ? "exec" : "config" } as Mode) }),
    kw("end", "Exit to privileged EXEC", { run: (c) => (c.s.mode = { m: "exec" }) }),
  ];
}

/** `ip ospf ...` under an interface; `neg` builds the `no ip ospf ...` variants. */
function ifOspfTree(neg: boolean): Node[] {
  const setO = (c: Ctx, fn: (o: NonNullable<Device["ports"][number]["ospf"]>) => void) =>
    eachIf(c, (p) => {
      p.ospf = p.ospf ?? {};
      fn(p.ospf);
      if (!Object.values(p.ospf).some((v) => v !== undefined)) delete p.ospf;
    });
  if (neg)
    return [
      arg("num", "pid", "<1-65535>", "Process ID", { run: (c) => setO(c, (o) => delete o.area), sub: [kw("area", "Remove the interface from its area", { run: (c) => setO(c, (o) => delete o.area), sub: [arg("word", "x", "<area>", "area", { run: (c) => setO(c, (o) => delete o.area) })] })] }),
      kw("cost", "Reset interface cost", { run: (c) => setO(c, (o) => delete o.cost) }),
      kw("hello-interval", "Reset hello interval", { run: (c) => setO(c, (o) => delete o.hello) }),
      kw("dead-interval", "Reset dead interval", { run: (c) => setO(c, (o) => delete o.dead) }),
      kw("priority", "Reset router priority", { run: (c) => setO(c, (o) => delete o.priority) }),
      kw("network", "Reset network type", { run: (c) => setO(c, (o) => delete o.network) }),
    ];
  return [
    arg("num", "pid", "<1-65535>", "Process ID", {
      range: [1, 65535],
      sub: [
        kw("area", "Set the OSPF area ID", {
          sub: [
            arg("num", "area", "<0-4294967295>", "OSPF area ID as a decimal value", {
              run: (c) => {
                if (c.dev.ospf && c.dev.ospf.pid !== +c.a.pid) return say(c, `% OSPF process ${c.a.pid} does not exist here (this device runs ospf ${c.dev.ospf.pid})`);
                if (!c.dev.ospf) edit(c, (d) => (d.ospf = { pid: +c.a.pid, networks: [] }));
                setO(c, (o) => (o.area = +c.a.area));
              },
            }),
          ],
        }),
      ],
    }),
    kw("cost", "Interface cost", { sub: [arg("num", "v", "<1-65535>", "Cost", { range: [1, 65535], run: (c) => setO(c, (o) => (o.cost = +c.a.v)) })] }),
    kw("hello-interval", "Time between HELLO packets", { sub: [arg("num", "v", "<1-65535>", "Seconds", { range: [1, 65535], run: (c) => setO(c, (o) => (o.hello = +c.a.v)) })] }),
    kw("dead-interval", "Interval after which a neighbor is declared dead", { sub: [arg("num", "v", "<1-65535>", "Seconds", { range: [1, 65535], run: (c) => setO(c, (o) => (o.dead = +c.a.v)) })] }),
    kw("priority", "Router priority", { sub: [arg("num", "v", "<0-255>", "Priority (0 = never DR)", { range: [0, 255], run: (c) => setO(c, (o) => (o.priority = +c.a.v)) })] }),
    kw("network", "Network type", {
      sub: [
        kw("point-to-point", "Specify OSPF point-to-point network", { run: (c) => setO(c, (o) => (o.network = "point-to-point")) }),
        kw("broadcast", "Specify OSPF broadcast multi-access network", { run: (c) => setO(c, (o) => (o.network = "broadcast")) }),
      ],
    }),
  ];
}

/** Commands under `router ospf <pid>`. */
function ospfTree(): Node[] {
  const o = (c: Ctx, fn: (x: NonNullable<Device["ospf"]>) => void) => edit(c, (d) => d.ospf && fn(d.ospf));
  const wildArea = (neg: boolean) =>
    arg("ip", "ip", "A.B.C.D", "Network number", {
      sub: [
        arg("mask", "wc", "A.B.C.D", "OSPF wild card bits", {
          sub: [
            kw("area", "Set the OSPF area ID", {
              sub: [
                arg("num", "area", "<0-4294967295>", "OSPF area ID as a decimal value", {
                  run: (c) => {
                    if (wildcardToLen(c.a.wc) === null) return say(c, "% OSPF: Invalid wildcard mask (must be contiguous, e.g. 0.0.0.255)");
                    o(c, (x) => {
                      const same = (n: { ip: string; wildcard: string }) => n.ip === c.a.ip && n.wildcard === c.a.wc;
                      if (neg) {
                        if (!x.networks.some(same)) say(c, "% OSPF: Network statement not found");
                        x.networks = x.networks.filter((n) => !same(n));
                      } else {
                        const ex = x.networks.find(same);
                        if (ex && ex.area !== +c.a.area) say(c, `% OSPF: "network ${c.a.ip} ${c.a.wc} area ${ex.area}" is already configured. Remove it before moving it to another area.`);
                        else if (!ex) x.networks.push({ ip: c.a.ip, wildcard: c.a.wc, area: +c.a.area });
                      }
                    });
                  },
                }),
              ],
            }),
          ],
        }),
      ],
    });
  const passive = (neg: boolean) =>
    kw("passive-interface", "Suppress routing updates on an interface", {
      sub: [
        kw("default", "Suppress routing updates on all interfaces", { run: (c) => o(c, (x) => { x.passiveDefault = !neg || undefined; x.passive = []; x.noPassive = []; }) }),
        arg("iface", "if", "<interface>", "Interface", {
          run: (c) =>
            o(c, (x) => {
              const name = c.a.if;
              const without = (l?: string[]) => (l ?? []).filter((n) => n !== name);
              if (x.passiveDefault) x.noPassive = neg ? [...without(x.noPassive), name] : without(x.noPassive);
              else x.passive = neg ? without(x.passive) : [...without(x.passive), name];
            }),
        }),
      ],
    });
  const range = (neg: boolean) =>
    kw("area", "OSPF area parameters", {
      sub: [
        arg("num", "area", "<0-4294967295>", "OSPF area ID as a decimal value", {
          sub: [
            kw("range", "Summarize routes matching address/mask (border routers only)", {
              sub: [
                arg("ip", "ip", "A.B.C.D", "IP address to match", {
                  sub: [
                    arg("mask", "mask", "A.B.C.D", "IP mask for address", {
                      run: (c) => {
                        const len = maskToLen(c.a.mask);
                        if (len === null) return say(c, "% Invalid mask");
                        const prefix = `${intToIp(parseCidr(`${c.a.ip}/${len}`)!.net)}/${len}`;
                        o(c, (x) => {
                          const rest = (x.ranges ?? []).filter((r) => !(r.area === +c.a.area && r.prefix === prefix));
                          x.ranges = neg ? rest : [...rest, { area: +c.a.area, prefix }];
                        });
                      },
                    }),
                  ],
                }),
              ],
            }),
            kw("stub", "Specify a stub area", { run: notSimulated("Stub area types") }),
            kw("nssa", "Specify a NSSA area", { run: notSimulated("NSSA") }),
          ],
        }),
      ],
    });
  return [
    kw("router-id", "router-id for this OSPF process", {
      sub: [
        arg("ip", "rid", "A.B.C.D", "OSPF router-id in IP address format", {
          run: (c) => {
            o(c, (x) => (x.routerId = c.a.rid));
            say(c, "% OSPF: Reload or use \"clear ip ospf process\" command, for this to take effect");
          },
        }),
      ],
    }),
    kw("network", "Enable routing on an IP network", { sub: [wildArea(false)] }),
    passive(false),
    range(false),
    kw("auto-cost", "Calculate OSPF interface cost according to bandwidth", {
      sub: [kw("reference-bandwidth", "Use reference bandwidth method to assign OSPF cost", { sub: [arg("num", "bw", "<1-4294967>", "The reference bandwidth in terms of Mbits per second", { range: [1, 4294967], run: (c) => o(c, (x) => (x.refBw = +c.a.bw === 100 ? undefined : +c.a.bw)) })] })],
    }),
    kw("default-information", "Control distribution of default information", {
      sub: [kw("originate", "Distribute a default route", { run: (c) => o(c, (x) => (x.defaultOriginate = "yes")), sub: [kw("always", "Always advertise default route", { run: (c) => o(c, (x) => (x.defaultOriginate = "always")) })] })],
    }),
    kw("no", "Negate a command or set its defaults", {
      sub: [
        kw("router-id", "Remove the router-id", { run: (c) => o(c, (x) => delete x.routerId) }),
        kw("network", "Disable routing on an IP network", { sub: [wildArea(true)] }),
        passive(true),
        range(true),
        kw("auto-cost", "Reset reference bandwidth", { run: (c) => o(c, (x) => delete x.refBw), sub: [kw("reference-bandwidth", "Reset reference bandwidth", { run: (c) => o(c, (x) => delete x.refBw) })] }),
        kw("default-information", "Stop distributing a default route", { sub: [kw("originate", "Distribute a default route", { run: (c) => o(c, (x) => delete x.defaultOriginate) })] }),
      ],
    }),
    kw("do", "To run exec commands in config mode", { sub: [arg("line", "cmd", "LINE", "Exec Command", { run: (c) => runDo(c) })] }),
    kw("exit", "Exit from routing protocol configuration mode", { run: (c) => (c.s.mode = { m: "config" }) }),
    kw("end", "Exit to privileged EXEC", { run: (c) => (c.s.mode = { m: "exec" }) }),
  ];
}

const TREES: Record<Mode["m"], Node[]> = {
  exec: execTree(),
  config: configTree(),
  if: ifTree(),
  acl: aclTree(),
  vlan: simpleSubTree("config"),
  line: simpleSubTree("config"),
  router: ospfTree(),
};

function runDo(c: Ctx) {
  const saved = c.s.mode;
  const savedPriv = c.s.priv;
  c.s.mode = { m: "exec" };
  dispatch(c, TREES.exec, c.a.cmd);
  c.s.mode = saved;
  c.s.priv = savedPriv;
}

// --- walker -------------------------------------------------------------------------

type Walk =
  | { ok: true; node: Node | null; level: Node[]; args: Record<string, string> }
  | { ok: false; kind: "invalid" | "ambiguous"; at: number; level: Node[] };

function tokenize(line: string): { tokens: string[]; starts: number[] } {
  const tokens: string[] = [];
  const starts: number[] = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(line))) {
    tokens.push(m[0]);
    starts.push(m.index);
  }
  return { tokens, starts };
}

function walk(root: Node[], tokens: string[], c: Ctx): Walk {
  let level = root;
  let node: Node | null = null;
  const args: Record<string, string> = {};
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i].toLowerCase();
    const cands = level.filter((n) => !n.when || n.when({ ...c, a: args }));
    let chosen: Node | undefined = cands.find((n) => n.kw === tok);
    let used = 1;
    if (!chosen) {
      const pre = cands.filter((n) => n.kw?.startsWith(tok));
      if (pre.length > 1) return { ok: false, kind: "ambiguous", at: i, level };
      if (pre.length === 1) chosen = pre[0];
    }
    if (!chosen) {
      for (const n of cands.filter((x) => x.arg)) {
        const r = readArg(n, tokens, i, c);
        if (r) {
          chosen = n;
          used = r.consumed;
          args[n.name!] = r.value;
          break;
        }
      }
    }
    if (!chosen) return { ok: false, kind: "invalid", at: i, level };
    node = chosen;
    i += used;
    level = chosen.sub ?? [];
  }
  return { ok: true, node, level, args };
}

function dispatch(c: Ctx, root: Node[], line: string) {
  const { tokens, starts } = tokenize(line);
  if (!tokens.length) return;
  let w = walk(root, tokens, c);
  // Like IOS, a global command typed in a config sub-mode drops back to global config and runs there.
  if (!w.ok && w.at === 0 && root !== TREES.config && root !== TREES.exec && c.s.mode.m !== "exec") {
    const g = walk(TREES.config, tokens, c);
    if (g.ok && g.node?.run) {
      c.s.mode = { m: "config" };
      w = g;
    }
  }
  if (!w.ok) {
    if (w.kind === "ambiguous") return say(c, `% Ambiguous command:  "${line.trim()}"`);
    const pad = prompt(c.s, false).length + starts[w.at];
    return say(c, `${" ".repeat(pad)}^\n% Invalid input detected at '^' marker.`);
  }
  if (!w.node?.run) return say(c, "% Incomplete command.");
  c.a = w.args;
  w.node.run(c);
}

function listHelp(level: Node[], c: Ctx, runnable: boolean, prefix = ""): string {
  const rows = level
    .filter((n) => (!n.when || n.when(c)) && (!prefix || n.kw?.startsWith(prefix.toLowerCase())))
    .map((n) => `  ${(n.kw ?? n.label ?? "").padEnd(18)}${n.help}`);
  if (runnable && !prefix) rows.push("  <cr>");
  return rows.length ? rows.join("\n") : "% Unrecognized command";
}

// --- public API -----------------------------------------------------------------------

function ctxFor(line: string, s: Session, topo: Topology, net: Net): Ctx {
  void line;
  return { s: structuredClone(s), dev: topo.devices.find((d) => d.id === s.dev)!, topo, net, a: {}, lines: [], changed: false };
}

/** Run one line of input. `?` anywhere at the end shows context help instead of executing. */
export function runCli(line: string, s: Session, topo: Topology, net: Net): CliResult {
  const dev = topo.devices.find((d) => d.id === s.dev);
  if (!dev) return { out: "% This device no longer exists.", session: s };
  if (dev.off) return { out: "% Device is powered off. Power it on from the canvas.", session: s };
  if (dev.kind === "pc" || dev.kind === "server") return runHost(line, s, topo, net);

  const c = ctxFor(line, s, topo, net);
  const root = TREES[c.s.mode.m];
  if (line.trim().endsWith("?")) {
    const body = line.replace(/\?\s*$/, "");
    const partial = !/\s$/.test(body) && body.length > 0;
    const { tokens } = tokenize(body);
    const head = partial ? tokens.slice(0, -1) : tokens;
    const w = walk(root, head, c);
    if (!w.ok) return { out: "% Unrecognized command", session: s };
    return { out: listHelp(head.length ? w.level : root, c, !!w.node?.run && !partial, partial ? tokens[tokens.length - 1] : ""), session: s };
  }
  dispatch(c, root, line);
  if (c.changed) c.lines.push(...adjChanges(net, new Net(c.topo), c.s.dev));
  return { out: c.lines.join("\n"), session: c.s, topo: c.changed ? c.topo : undefined, probe: c.probe, renamed: c.renamed };
}

/** %OSPF-5-ADJCHG lines for this device after a config change. */
function adjChanges(before: Net, after: Net, dev: string): string[] {
  const key = (n: { iface: string; nbrRid: string }) => `${n.iface}|${n.nbrRid}`;
  const was = new Map(before.ospf().nbrs.filter((n) => n.dev === dev).map((n) => [key(n), n.state]));
  const now = new Map(after.ospf().nbrs.filter((n) => n.dev === dev).map((n) => [key(n), n.state]));
  const pid = after.device(dev)?.ospf?.pid ?? before.device(dev)?.ospf?.pid ?? 1;
  const out: string[] = [];
  for (const [k, st] of now) {
    if (was.get(k) === st) continue;
    const [iface, rid] = k.split("|");
    if (st === "FULL") out.push(`%OSPF-5-ADJCHG: Process ${pid}, Nbr ${rid} on ${longIf(iface)} from LOADING to FULL, Loading Done`);
    else if (st === "EXSTART") out.push(`%OSPF-5-ADJCHG: Process ${pid}, Nbr ${rid} on ${longIf(iface)} from INIT to EXSTART (stuck: check interface MTU)`);
  }
  for (const [k, st] of was) {
    if (now.has(k) || st !== "FULL") continue;
    const [iface, rid] = k.split("|");
    out.push(`%OSPF-5-ADJCHG: Process ${pid}, Nbr ${rid} on ${longIf(iface)} from FULL to DOWN, Neighbor Down: ${after.ospf().problems.some((p) => p.dev === dev && p.iface === iface) ? "Dead timer expired" : "Interface down or detached"}`);
  }
  return out;
}

/** Tab completion: returns the completed line, or null if nothing unique matches. */
export function complete(line: string, s: Session, topo: Topology, net: Net): string | null {
  const dev = topo.devices.find((d) => d.id === s.dev);
  if (!dev || dev.kind === "pc" || dev.kind === "server") return null;
  const c = ctxFor(line, s, topo, net);
  const { tokens } = tokenize(line);
  if (!tokens.length || /\s$/.test(line)) return null;
  const w = walk(TREES[c.s.mode.m], tokens.slice(0, -1), c);
  if (!w.ok) return null;
  const last = tokens[tokens.length - 1].toLowerCase();
  const level = tokens.length === 1 ? TREES[c.s.mode.m] : w.level;
  const hits = level.filter((n) => n.kw?.startsWith(last) && (!n.when || n.when(c)));
  if (hits.length !== 1) return null;
  return line.slice(0, line.length - tokens[tokens.length - 1].length) + hits[0].kw + " ";
}

// --- PC / server shell ----------------------------------------------------------------------

const HOST_HELP = `Available commands:
  ip ADDRESS/LEN [GATEWAY]     set the address, e.g. ip 10.0.0.10/24 10.0.0.1
  ip ADDRESS MASK [GATEWAY]    same, with a dotted mask
  ipconfig                     show the IP configuration
  ping ADDRESS                 send 4 ICMP echo requests
  tracert ADDRESS              trace the route
  arp -a                       show the ARP cache
  clear                        clear the screen`;

function runHost(line: string, s: Session, topo: Topology, net: Net): CliResult {
  const tk = line.trim().split(/\s+/).filter(Boolean);
  const cmd = (tk[0] ?? "").toLowerCase();
  const out = (text: string, extra: Partial<CliResult> = {}): CliResult => ({ out: text, session: s, ...extra });
  if (!cmd) return out("");
  if (cmd === "?" || cmd === "help") return out(HOST_HELP);
  if (cmd === "ipconfig" || (cmd === "show" && tk[1] === "ip")) return out(ipconfig(net, s.dev));
  if (cmd === "arp") return out(showArp(net, s.dev));
  if (cmd === "ip") {
    let ip: string;
    let len: number | null;
    let gw: string | undefined;
    if (tk[1]?.includes("/")) {
      const c = parseCidr(tk[1]);
      if (!c) return out("Invalid address. Example: ip 10.0.0.10/24 10.0.0.1");
      [ip, len, gw] = [c.ip, c.len, tk[2]];
    } else {
      [ip, len, gw] = [tk[1], maskToLen(tk[2] ?? ""), tk[3]];
      if (!isIp(ip ?? "") || len === null) return out("Invalid address or mask. Example: ip 10.0.0.10 255.255.255.0 10.0.0.1");
    }
    if (gw && !isIp(gw)) return out("Invalid gateway address.");
    const next = structuredClone(topo);
    const d = next.devices.find((x) => x.id === s.dev)!;
    d.ports[0].ip = `${ip}/${len}`;
    d.gateway = gw;
    return out(`${s.dev} : ${ip}/${len}${gw ? ` gateway ${gw}` : ""}`, { topo: next });
  }
  if (cmd === "ping") {
    const dst = tk[1];
    if (!dst || !isIp(dst)) return out("Usage: ping ADDRESS");
    const r = net.ping(s.dev, dst, 4);
    const probe: ProbeRun = { kind: "ping", src: s.dev, dst, ...r };
    if (r.error) return out(`Ping request could not find host ${dst}: ${r.error}`, { probe });
    const lines = [`Pinging ${dst} with 32 bytes of data:`, ""];
    for (const p of r.probes) {
      if (p.mark === "!") {
        const ttl = [...p.events].reverse().find((e) => e.kind === "deliver" && e.dev === s.dev && e.frame.ip?.icmp.type === "echo-reply")?.frame.ip?.ttl ?? 64;
        lines.push(`Reply from ${dst}: bytes=32 time<1ms TTL=${ttl}`);
      } else if (p.mark === "U") lines.push(`Reply from ${p.from}: Destination host unreachable.`);
      else lines.push("Request timed out.");
    }
    const ok = r.probes.filter((p) => p.mark === "!").length;
    lines.push("", `Ping statistics for ${dst}:`, `    Packets: Sent = 4, Received = ${ok}, Lost = ${4 - ok} (${(4 - ok) * 25}% loss),`);
    return out(lines.join("\n"), { probe });
  }
  if (cmd === "tracert" || cmd === "traceroute" || cmd === "trace") {
    const dst = tk[1];
    if (!dst || !isIp(dst)) return out("Usage: tracert ADDRESS");
    const r = net.traceroute(s.dev, dst);
    const probe: ProbeRun = { kind: "trace", src: s.dev, dst, ...r };
    if (r.error) return out(`Unable to resolve route: ${r.error}`, { probe });
    const lines = [`Tracing route to ${dst} over a maximum of 12 hops:`, ""];
    for (const p of r.probes) lines.push(`  ${String(p.seq).padStart(2)}   ${p.mark === "." ? "*        *        *     Request timed out." : `<1 ms    <1 ms    <1 ms    ${p.from}${p.mark === "U" ? "  reports: Destination host unreachable." : ""}`}`);
    lines.push("", "Trace complete.");
    return out(lines.join("\n"), { probe });
  }
  return out(`'${tk[0]}' is not recognized. Type ? for the list of commands.`);
}
