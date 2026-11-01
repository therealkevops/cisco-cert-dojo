import { Net, parentOf, type ProbeResult } from "../net/engine";
import { intToIp, ipToInt, isIp, maskOf, maskToLen, parseCidr, wildcardToLen } from "../net/ip";
import { renameDevice } from "../net/ops";
import { apipa, dhcpRelease, dhcpRequest } from "../net/dhcp";
import {
  ipconfig,
  longIf,
  showAcls,
  showArp,
  showBgpNeighbors,
  showBgpSummary,
  showBgpTable,
  showEigrpInterfaces,
  showEigrpNeighbors,
  showEigrpTopology,
  showFhrpBrief,
  showStandby,
  showDhcpBinding,
  showDhcpConflict,
  showDhcpPool,
  showNatStatistics,
  showNatTranslations,
  showEtherchannel,
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
import type { Ace, Device, FhrpGroup, Topology } from "../net/types";

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
  | { m: "router" }
  | { m: "dhcp"; pool: string }
  | { m: "bgp"; af?: boolean }
  | { m: "rmap"; name: string; seq: number }
  /** EIGRP: classic (`router eigrp 100`) or named mode with its nested address-family sections. */
  | { m: "eigrp"; named?: boolean; sub?: "af" | "afif" | "topo"; afIf?: string };

export type Session = { dev: string; priv: boolean; mode: Mode };

export type ProbeRun = { kind: "ping" | "trace" | "dhcp"; src: string; dst: string; header: string; probes: ProbeResult[]; error?: string };

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
    dhcp: "(dhcp-config)",
    bgp: s.mode.m === "bgp" && s.mode.af ? "(config-router-af)" : "(config-router)",
    rmap: "(config-route-map)",
    eigrp:
      s.mode.m === "eigrp" && s.mode.sub
        ? { af: "(config-router-af)", afif: "(config-router-af-interface)", topo: "(config-router-af-topology)" }[s.mode.sub]
        : "(config-router)",
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
  { full: "port-channel", short: "Po", min: 2 },
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
        const sub = /^(.+)\.(\d+)$/.exec(name);
        if (sub) return c.dev.kind === "router" && +sub[2] >= 1 && c.dev.ports.some((p) => !parentOf(p.name) && p.name.toLowerCase() === sub[1].toLowerCase());
        if (name.startsWith("Vlan")) return /^Vlan\d+$/.test(name) && +name.slice(4) >= 1 && +name.slice(4) <= 4094 && isSwitch(c);
        if (name.startsWith("Lo")) return /^Lo\d+$/.test(name) && +name.slice(2) <= 2147483647 && isL3(c);
        if (name.startsWith("Po")) return /^Po\d+$/.test(name) && +name.slice(2) >= 1 && +name.slice(2) <= 48 && isSwitch(c);
        return c.dev.ports.some((p) => p.name.toLowerCase() === name.toLowerCase());
      };
      const fix = (name: string) => {
        if (name.startsWith("Vlan") || name.startsWith("Lo") || name.startsWith("Po")) return name;
        const sub = /^(.+)\.(\d+)$/.exec(name);
        if (sub) return `${c.dev.ports.find((p) => p.name.toLowerCase() === sub[1].toLowerCase())!.name}.${+sub[2]}`;
        return c.dev.ports.find((p) => p.name.toLowerCase() === name.toLowerCase())!.name;
      };
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
        kw("route", "IP routing table", {
          when: isL3,
          run: (c) => say(c, showIpRoute(c.net, c.s.dev)),
          sub: (["bgp", "eigrp", "ospf", "static", "connected"] as const).map((k) => kw(k, `${k} routes only`, { run: (c) => say(c, showIpRoute(c.net, c.s.dev, k)) })),
        }),
        kw("bgp", "BGP information", {
          when: isL3,
          run: (c) => say(c, showBgpTable(c.net, c.s.dev)),
          sub: [
            kw("summary", "Summary of BGP neighbor status", { run: (c) => say(c, showBgpSummary(c.net, c.s.dev)) }),
            kw("neighbors", "Detailed information on TCP and BGP neighbor connections", {
              run: (c) => say(c, showBgpNeighbors(c.net, c.s.dev)),
              sub: [arg("ip", "nip", "A.B.C.D", "Neighbor to display information about", { run: (c) => say(c, showBgpNeighbors(c.net, c.s.dev, c.a.nip)) })],
            }),
          ],
        }),
        kw("arp", "IP ARP table", { run: (c) => say(c, showArp(c.net, c.s.dev)) }),
        kw("eigrp", "IP-EIGRP show commands", {
          when: isL3,
          sub: [
            kw("neighbors", "IP-EIGRP neighbors", { run: (c) => say(c, showEigrpNeighbors(c.net, c.s.dev)) }),
            kw("topology", "IP-EIGRP topology", { run: (c) => say(c, showEigrpTopology(c.net, c.s.dev)), sub: [kw("all-links", "Show all links in topology table", { run: (c) => say(c, showEigrpTopology(c.net, c.s.dev, true)) })] }),
            kw("interfaces", "IP-EIGRP interfaces", { run: (c) => say(c, showEigrpInterfaces(c.net, c.s.dev)) }),
          ],
        }),
        kw("ospf", "OSPF information", {
          when: isL3,
          run: (c) => say(c, showOspf(c.net, c.s.dev)),
          sub: [
            kw("neighbor", "Neighbor list", { run: (c) => say(c, showOspfNbr(c.net, c.s.dev)) }),
            kw("interface", "Interface information", { run: (c) => say(c, showOspfIntBrief(c.net, c.s.dev)), sub: [kw("brief", "Brief summary of interface information", { run: (c) => say(c, showOspfIntBrief(c.net, c.s.dev)) })] }),
          ],
        }),
        kw("nat", "IP NAT information", {
          when: isL3,
          sub: [
            kw("translations", "Translation entries", { run: (c) => say(c, showNatTranslations(c.net, c.s.dev)), sub: [kw("verbose", "Show extra information", { run: (c) => say(c, showNatTranslations(c.net, c.s.dev)) })] }),
            kw("statistics", "Translation statistics", { run: (c) => say(c, showNatStatistics(c.net, c.s.dev)) }),
          ],
        }),
        kw("dhcp", "Show items in the DHCP database", {
          when: isL3,
          sub: [
            kw("binding", "DHCP address bindings", { run: (c) => say(c, showDhcpBinding(c.net, c.s.dev)) }),
            kw("pool", "DHCP pools information", { run: (c) => say(c, showDhcpPool(c.net, c.s.dev)) }),
            kw("conflict", "DHCP address conflicts", { run: (c) => say(c, showDhcpConflict(c.net, c.s.dev)) }),
          ],
        }),
        kw("protocols", "IP routing protocol process parameters and statistics", { when: isL3, run: (c) => say(c, showIpProtocols(c.net, c.s.dev)) }),
      ],
    }),
    kw("standby", "Hot standby protocol information", { when: isL3, run: (c) => say(c, showStandby(c.net, c.s.dev)), sub: [kw("brief", "Brief output", { run: (c) => say(c, showFhrpBrief(c.net, c.s.dev, "hsrp")) })] }),
    kw("vrrp", "VRRP information", { when: isL3, run: (c) => say(c, showFhrpBrief(c.net, c.s.dev, "vrrp")), sub: [kw("brief", "Brief output", { run: (c) => say(c, showFhrpBrief(c.net, c.s.dev, "vrrp")) })] }),
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
    kw("etherchannel", "EtherChannel information", { when: isSwitch, sub: [kw("summary", "One-line summary per channel-group", { run: (c) => say(c, showEtherchannel(c.net, c.s.dev)) })] }),
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
        kw("ip", "IP", {
          when: isL3,
          sub: [
            kw("bgp", "Clear BGP connections", { sub: [kw("*", "Clear all peers", { run: (c) => say(c, "(Wire Room recomputes BGP after every change, so sessions and policies are already current.)") })] }),
            kw("ospf", "OSPF", { sub: [kw("process", "Reset OSPF process", { run: (c) => say(c, "Reset ALL OSPF processes? [no]: yes\n(Wire Room recomputes OSPF after every change, so this is instant.)") })] }),
            kw("nat", "Clear NAT", { sub: [kw("translation", "Clear dynamic translations", { sub: [kw("*", "Delete all dynamic translations", { run: (c) => c.net.natTables.set(c.s.dev, (c.net.natTables.get(c.s.dev) ?? []).filter((e) => e.kind === "static")) })] })] }),
            kw("dhcp", "Clear DHCP", {
              sub: [
                kw("binding", "Clear bindings", { sub: [kw("*", "All bindings", { run: (c) => c.net.dhcpBindings.delete(c.s.dev) })] }),
                kw("conflict", "Clear conflicts", { sub: [kw("*", "All conflicts", { run: (c) => c.net.dhcpConflicts.delete(c.s.dev) })] }),
              ],
            }),
          ],
        }),
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
      const p = svi ?? d.ports.find((x) => x.name === name) ?? d.portChannels!.find((x) => x.name === name)!;
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
    if (!isSvi && parentOf((p as Device["ports"][number]).name) && !(p as Device["ports"][number]).encap)
      return "% Configuring IP routing on a LAN subinterface is only allowed if that subinterface is already configured as part of an IEEE 802.10, IEEE 802.1Q, or ISL vLAN.";
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

/** `channel-group N mode X`: joins the bundle, creating Port-channelN from this port's config if needed. */
function channelGroup(c: Ctx, g: number, mode: NonNullable<Device["ports"][number]["channel"]>["mode"]) {
  if (c.s.mode.m !== "if") return;
  if (c.s.mode.ifs.some((n) => !/^Gi/.test(n))) return say(c, "% Only physical switch ports can join a channel group");
  const first = c.dev.ports.find((p) => p.name === (c.s.mode as { ifs: string[] }).ifs[0])!;
  const proto = (m: string) => (m === "active" || m === "passive" ? "LACP" : m === "on" ? "on" : "PAgP");
  const clash = c.dev.ports.find((p) => p.channel?.group === g && proto(p.channel.mode) !== proto(mode) && !(c.s.mode as { ifs: string[] }).ifs.includes(p.name));
  if (clash) return say(c, `% Command rejected (Port-channel${g}, ${first.name}): channel ${g} already uses ${proto(clash.channel!.mode)} on ${clash.name}`);
  if (!c.dev.portChannels?.some((p) => p.name === `Po${g}`)) {
    edit(c, (d) => (d.portChannels = [...(d.portChannels ?? []), { name: `Po${g}`, mode: first.mode === "routed" ? "access" : (first.mode ?? "access"), vlan: first.vlan, allowed: first.allowed, native: first.native }]));
    say(c, `Creating a port-channel interface Port-channel ${g}`);
  }
  portOnly(c, "% Not applicable to an SVI", (p) => {
    p.channel = { group: g, mode };
  });
}

function enterIfs(c: Ctx, ifs: string[]) {
  for (const name of ifs) {
    if (name.startsWith("Vlan")) {
      const vlan = +name.slice(4);
      if (!c.dev.svis?.some((s) => s.vlan === vlan)) edit(c, (d) => (d.svis = [...(d.svis ?? []), { vlan, ip: "" }]));
    }
    if (name.startsWith("Po") && !c.dev.portChannels?.some((p) => p.name === name)) edit(c, (d) => (d.portChannels = [...(d.portChannels ?? []), { name, mode: "access", vlan: 1 }]));
    if (parentOf(name) && !c.dev.ports.some((p) => p.name === name)) edit(c, (d) => d.ports.push({ name }));
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
        kw("nat", "NAT configuration commands", { when: isL3, sub: natGlobalTree(false) }),
        kw("prefix-list", "Build a prefix list", { when: isL3, sub: [arg("word", "name", "WORD", "Name of a prefix list", { sub: [arg("line", "rule", "LINE", "[seq N] permit|deny A.B.C.D/nn [ge N] [le N]", { run: (c) => prefixList(c) })] })] }),
        kw("dhcp", "Configure DHCP server and relay parameters", {
          when: isL3,
          sub: [
            kw("pool", "Configure DHCP address pools", {
              sub: [
                arg("word", "name", "WORD", "Pool name", {
                  run: (c) => {
                    edit(c, (d) => {
                      d.dhcp = d.dhcp ?? { pools: [], excluded: [] };
                      if (!d.dhcp.pools.some((p) => p.name === c.a.name)) d.dhcp.pools.push({ name: c.a.name });
                    });
                    c.s.mode = { m: "dhcp", pool: c.a.name };
                  },
                }),
              ],
            }),
            kw("excluded-address", "Prevent DHCP from assigning certain addresses", {
              sub: [
                arg("ip", "lo", "A.B.C.D", "Low IP address", {
                  run: (c) => excluded(c, c.a.lo, c.a.lo, false),
                  sub: [arg("ip", "hi", "A.B.C.D", "High IP address", { run: (c) => excluded(c, c.a.lo, c.a.hi, false) })],
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
        kw("eigrp", "Enhanced Interior Gateway Routing Protocol (EIGRP)", {
          sub: [
            arg("word", "as", "<1-65535> | WORD", "Autonomous System number, or a name for named mode", {
              run: (c) => {
                const classic = /^\d+$/.test(c.a.as);
                if (classic && (+c.a.as < 1 || +c.a.as > 65535)) return say(c, "% Invalid AS number");
                const e = c.dev.eigrp;
                if (e && (classic ? e.name || e.asn !== +c.a.as : e.name !== c.a.as)) return say(c, `% Wire Room simulates one EIGRP process per device (eigrp ${e.name ?? e.asn} already runs here).`);
                if (!e) edit(c, (d) => (d.eigrp = classic ? { asn: +c.a.as, networks: [] } : { asn: 0, name: c.a.as, networks: [] }));
                c.s.mode = classic ? { m: "eigrp" } : { m: "eigrp", named: true };
              },
            }),
          ],
        }),
        kw("bgp", "Border Gateway Protocol (BGP)", {
          sub: [
            arg("num", "asn", "<1-4294967295>", "Autonomous system number", {
              range: [1, 4294967295],
              run: (c) => {
                if (c.dev.bgp && c.dev.bgp.asn !== +c.a.asn) return say(c, `% BGP is already running; AS is ${c.dev.bgp.asn}`);
                if (!c.dev.bgp) edit(c, (d) => (d.bgp = { asn: +c.a.asn, neighbors: [], networks: [] }));
                c.s.mode = { m: "bgp" };
              },
            }),
          ],
        }),
        kw("rip", "Routing Information Protocol (RIP)", { run: notSimulated("RIP") }),
      ],
    }),
    kw("track", "Object tracking configuration commands", {
      when: isL3,
      sub: [
        arg("num", "obj", "<1-1000>", "Tracked object", {
          range: [1, 1000],
          sub: [
            kw("interface", "Select an interface to track", {
              sub: [
                arg("iface", "tif", "<interface>", "Interface", {
                  sub: [kw("line-protocol", "Track interface line-protocol", { run: (c) => edit(c, (d) => (d.tracks = { ...(d.tracks ?? {}), [c.a.obj]: { iface: c.a.tif } })) })],
                }),
              ],
            }),
            kw("ip", "IP protocol", { sub: [kw("sla", "IP Service Level Agreement", { run: notSimulated("IP SLA tracking"), sub: [arg("line", "x", "LINE", "operation", { run: notSimulated("IP SLA tracking") })] })] }),
          ],
        }),
      ],
    }),
    kw("route-map", "Create route-map or enter route-map command mode", {
      when: isL3,
      sub: [
        arg("word", "name", "WORD", "Route map tag", {
          run: (c) => routeMapEnter(c, "permit", 10),
          sub: [
            ...(["permit", "deny"] as const).map((a) =>
              kw(a, `Route map ${a}s set operations`, {
                run: (c) => routeMapEnter(c, a, 10),
                sub: [arg("num", "seq", "<0-65535>", "Sequence to insert to/delete from existing route-map entry", { range: [0, 65535], run: (c) => routeMapEnter(c, a, +c.a.seq) })],
              }),
            ),
          ],
        }),
      ],
    }),
    kw("line", "Configure a terminal line", { sub: [arg("line", "x", "LINE", "con 0 | vty 0 15", { run: (c) => (c.s.mode = { m: "line" }) })] }),
    kw("enable", "Modify enable password parameters", { sub: [arg("line", "x", "LINE", "secret / password", { run: accepted })] }),
    kw("username", "Establish User Name Authentication", { sub: [arg("line", "x", "LINE", "User name and options", { run: accepted })] }),
    kw("service", "Modify use of network based services", { sub: [kw("dhcp", "Enable the DHCP server and relay agent", { run: accepted }), arg("line", "x", "LINE", "e.g. password-encryption", { run: accepted })] }),
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
            kw("nat", "NAT configuration commands", { when: isL3, sub: natGlobalTree(true) }),
            kw("prefix-list", "Remove a prefix list", { sub: [arg("word", "name", "WORD", "Name of a prefix list", { run: (c) => edit(c, (d) => { if (d.prefixLists) delete d.prefixLists[c.a.name]; }) })] }),
            kw("dhcp", "DHCP", {
              when: isL3,
              sub: [
                kw("pool", "Delete a DHCP pool", { sub: [arg("word", "name", "WORD", "Pool name", { run: (c) => edit(c, (d) => { if (d.dhcp) d.dhcp.pools = d.dhcp.pools.filter((p) => p.name !== c.a.name); }) })] }),
                kw("excluded-address", "Remove an exclusion", {
                  sub: [arg("ip", "lo", "A.B.C.D", "Low IP address", { run: (c) => excluded(c, c.a.lo, c.a.lo, true), sub: [arg("ip", "hi", "A.B.C.D", "High IP address", { run: (c) => excluded(c, c.a.lo, c.a.hi, true) })] })],
                }),
              ],
            }),
            kw("domain", "IP DNS Resolver", { sub: [kw("lookup", "Disable DNS lookup", { run: accepted })] }),
            kw("routing", "Disable IP routing", { run: notSimulated("Turning routing off on an L3 switch") }),
          ],
        }),
        kw("router", "Disable a routing process", {
          sub: [
            kw("bgp", "Border Gateway Protocol (BGP)", { sub: [arg("num", "asn", "<1-4294967295>", "AS number", { run: (c) => edit(c, (d) => { if (d.bgp?.asn === +c.a.asn) delete d.bgp; else say(c, "% BGP not running with that AS"); }) })] }),
            kw("ospf", "Open Shortest Path First (OSPF)", { sub: [arg("num", "pid", "<1-65535>", "Process ID", { range: [1, 65535], run: (c) => edit(c, (d) => { if (d.ospf?.pid === +c.a.pid) delete d.ospf; else say(c, "% OSPF process not found"); }) })] }),
            kw("eigrp", "Enhanced Interior Gateway Routing Protocol (EIGRP)", { sub: [arg("word", "as", "<1-65535> | WORD", "AS number or name", { run: (c) => edit(c, (d) => { if (d.eigrp && (String(d.eigrp.asn) === c.a.as || d.eigrp.name === c.a.as)) delete d.eigrp; else say(c, "% EIGRP process not found"); }) })] }),
          ],
        }),
        kw("track", "Remove a tracked object", { sub: [arg("num", "obj", "<1-1000>", "Tracked object", { run: (c) => edit(c, (d) => { if (d.tracks) delete d.tracks[c.a.obj]; }) })] }),
        kw("route-map", "Delete a route-map", {
          sub: [
            arg("word", "name", "WORD", "Route map tag", {
              run: (c) => edit(c, (d) => { if (d.routeMaps) delete d.routeMaps[c.a.name]; }),
              sub: [...(["permit", "deny"] as const).map((a) => kw(a, "entry", { sub: [arg("num", "seq", "<0-65535>", "Sequence", { run: (c) => edit(c, (d) => { if (d.routeMaps?.[c.a.name]) d.routeMaps[c.a.name] = d.routeMaps[c.a.name].filter((e) => e.seq !== +c.a.seq); }) })] }))],
            }),
          ],
        }),
        kw("access-list", "Remove an access list", { sub: [arg("num", "n", "<1-199>", "IP access list number", { run: (c) => edit(c, (d) => { if (d.acls) delete d.acls[c.a.n]; }) })] }),
        kw("interface", "Delete a logical interface", {
          sub: [arg("iface", "if", "<interface>", "Vlan interface", {
            run: (c) =>
              c.a.if.startsWith("Vlan")
                ? edit(c, (d) => (d.svis = (d.svis ?? []).filter((s) => s.vlan !== +c.a.if.slice(4))))
                : c.a.if.startsWith("Po")
                  ? edit(c, (d) => {
                      d.portChannels = (d.portChannels ?? []).filter((p) => p.name !== c.a.if);
                      for (const p of d.ports) if (p.channel?.group === +c.a.if.slice(2)) delete p.channel;
                    })
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

/** Find or create the HSRP/VRRP group being configured on each selected interface. */
function fhrpEdit(c: Ctx, proto: "hsrp" | "vrrp", fn: (g: FhrpGroup) => void) {
  const group = c.a.grp !== undefined ? +c.a.grp : 0;
  eachIf(c, (p) => {
    p.fhrp = p.fhrp ?? [];
    let g = p.fhrp.find((x) => x.proto === proto && x.group === group);
    if (!g) {
      const v = p.hsrpVersion;
      g = { proto, group, ...(proto === "hsrp" && v === 2 ? { version: 2 as const } : {}) };
      p.fhrp.push(g);
    }
    fn(g);
  });
}

function dropFhrp(c: Ctx, proto: "hsrp" | "vrrp") {
  const group = c.a.grp !== undefined ? +c.a.grp : 0;
  eachIf(c, (p) => {
    p.fhrp = (p.fhrp ?? []).filter((x) => !(x.proto === proto && x.group === group));
    if (!p.fhrp.length) delete p.fhrp;
  });
}

function fhrpCmds(proto: "hsrp" | "vrrp", neg: boolean): Node[] {
  const tr = (c: Ctx, dec: number) =>
    fhrpEdit(c, proto, (g) => {
      const isObj = /^\d+$/.test(c.a.trk);
      const t = isObj ? { object: +c.a.trk, decrement: dec } : { iface: canonIf(c.a.trk) ?? c.a.trk, decrement: dec };
      const same = (x: { object?: number; iface?: string }) => (isObj ? x.object === +c.a.trk : x.iface === t.iface);
      g.track = [...(g.track ?? []).filter((x) => !same(x)), ...(neg ? [] : [t])];
      if (!g.track.length) delete g.track;
    });
  return [
    kw("ip", "Enable group and set virtual IP address", {
      run: neg ? (c) => fhrpEdit(c, proto, (g) => delete g.ip) : undefined,
      sub: neg ? [] : [arg("ip", "vip", "A.B.C.D", "Virtual IP address", { run: (c) => fhrpEdit(c, proto, (g) => (g.ip = c.a.vip)) })],
    }),
    kw("priority", "Priority level", {
      run: neg ? (c) => fhrpEdit(c, proto, (g) => delete g.priority) : undefined,
      sub: neg ? [] : [arg("num", "prio", proto === "hsrp" ? "<0-255>" : "<1-254>", "Priority value", { range: proto === "hsrp" ? [0, 255] : [1, 254], run: (c) => fhrpEdit(c, proto, (g) => (g.priority = +c.a.prio === 100 ? undefined : +c.a.prio)) })],
    }),
    kw("preempt", "Overthrow lower priority designated routers", { run: (c) => fhrpEdit(c, proto, (g) => (proto === "hsrp" ? (neg ? delete g.preempt : (g.preempt = true)) : neg ? (g.preempt = false) : delete g.preempt)) }),
    kw("track", "Priority tracking", {
      sub: [
        arg("word", "trk", "<1-1000> | interface", "Tracked object number or interface", {
          run: (c) => tr(c, 10),
          sub: [
            kw("decrement", "Priority decrement", { sub: [arg("num", "dec", "<1-255>", "Decrement value", { range: [1, 255], run: (c) => tr(c, +c.a.dec) })] }),
            arg("num", "dec", "<1-255>", "Decrement value (older syntax)", { range: [1, 255], run: (c) => tr(c, +c.a.dec) }),
          ],
        }),
      ],
    }),
  ];
}

function ifTree(): Node[] {
  return [
    kw("ip", "Interface Internet Protocol config commands", {
      sub: [
        kw("address", "Set the IP address of an interface", { sub: [arg("ip", "ip", "A.B.C.D", "IP address", { sub: [arg("mask", "mask", "A.B.C.D", "IP subnet mask", { run: (c) => setIp(c, c.a.ip, c.a.mask) })] }), kw("dhcp", "IP Address negotiated via DHCP", { run: notSimulated("DHCP") })] }),
        kw("ospf", "OSPF interface commands", { when: isL3, sub: ifOspfTree(false) }),
        kw("nat", "NAT interface commands", {
          when: isL3,
          sub: [
            kw("inside", "Inside interface for address translation", { run: (c) => eachIf(c, (p) => { p.nat = "inside"; }) }),
            kw("outside", "Outside interface for address translation", { run: (c) => eachIf(c, (p) => { p.nat = "outside"; }) }),
          ],
        }),
        kw("helper-address", "Specify a destination address for UDP broadcasts (DHCP relay)", {
          when: isL3,
          sub: [arg("ip", "h", "A.B.C.D", "IP destination address", { run: (c) => eachIf(c, (p) => { p.helpers = [...new Set([...(p.helpers ?? []), c.a.h])]; }) })],
        }),
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
    kw("encapsulation", "Set encapsulation type for an interface", {
      when: (c) => c.s.mode.m === "if" && c.s.mode.ifs.every((n) => !!parentOf(n)),
      sub: [
        kw("dot1q", "IEEE 802.1Q Virtual LAN", {
          sub: [
            arg("num", "vlan", "<1-4094>", "IEEE 802.1Q VLAN ID", {
              range: [1, 4094],
              run: (c) => portOnly(c, "", (p) => { p.encap = { vlan: +c.a.vlan }; }),
              sub: [kw("native", "Make this as native vlan", { run: (c) => portOnly(c, "", (p) => { p.encap = { vlan: +c.a.vlan, native: true }; }) })],
            }),
          ],
        }),
      ],
    }),
    kw("bandwidth", "Set bandwidth informational parameter", { when: isL3, sub: [arg("num", "bw", "<1-100000000>", "Bandwidth in kilobits", { range: [1, 100000000], run: (c) => eachIf(c, (p) => { p.bandwidth = +c.a.bw; }) })] }),
    kw("delay", "Specify interface throughput delay", { when: isL3, sub: [arg("num", "dly", "<1-16777215>", "Throughput delay (tens of microseconds)", { range: [1, 16777215], run: (c) => eachIf(c, (p) => { p.delay = +c.a.dly; }) })] }),
    kw("standby", "HSRP interface configuration commands", { when: isL3, sub: [kw("version", "HSRP version", { sub: [arg("num", "v", "<1-2>", "Version", { range: [1, 2], run: (c) => eachIf(c, (p) => { for (const g of (p.fhrp ?? []).filter((x) => x.proto === "hsrp")) { if (+c.a.v === 2) g.version = 2; else delete g.version; } if (+c.a.v === 2) p.hsrpVersion = 2; else delete p.hsrpVersion; }) })] }), arg("num", "grp", "<0-4095>", "group number", { range: [0, 4095], sub: fhrpCmds("hsrp", false) }), ...fhrpCmds("hsrp", false)] }),
    kw("vrrp", "VRRP Interface configuration commands", { when: isL3, sub: [arg("num", "grp", "<1-255>", "Group number", { range: [1, 255], sub: fhrpCmds("vrrp", false) })] }),
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
    kw("channel-group", "Etherchannel/port bundling configuration", {
      when: isSwitch,
      sub: [
        arg("num", "g", "<1-48>", "Channel group number", {
          range: [1, 48],
          sub: [
            kw("mode", "Etherchannel Mode of the interface", {
              sub: (
                [
                  ["active", "Enable LACP unconditionally"],
                  ["passive", "Enable LACP only if a LACP device is detected"],
                  ["desirable", "Enable PAgP unconditionally"],
                  ["auto", "Enable PAgP only if a PAgP device is detected"],
                  ["on", "Enable Etherchannel only"],
                ] as const
              ).map(([mode, help]) => kw(mode, help, { run: (c) => channelGroup(c, +c.a.g, mode) })),
            }),
          ],
        }),
      ],
    }),
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
            kw("nat", "Remove the NAT role", {
              sub: [
                kw("inside", "Inside interface", { run: (c) => eachIf(c, (p) => { if (p.nat === "inside") delete p.nat; }) }),
                kw("outside", "Outside interface", { run: (c) => eachIf(c, (p) => { if (p.nat === "outside") delete p.nat; }) }),
              ],
            }),
            kw("helper-address", "Remove helper addresses", {
              run: (c) => eachIf(c, (p) => { delete p.helpers; }),
              sub: [arg("ip", "h", "A.B.C.D", "Helper to remove", { run: (c) => eachIf(c, (p) => { p.helpers = (p.helpers ?? []).filter((x) => x !== c.a.h); if (!p.helpers.length) delete p.helpers; }) })],
            }),
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
        kw("channel-group", "Remove the port from its channel group", { run: (c) => portOnly(c, "% Not applicable", (p) => { delete p.channel; }) }),
        kw("encapsulation", "Remove the encapsulation", { sub: [kw("dot1q", "IEEE 802.1Q", { run: (c) => portOnly(c, "", (p) => { delete p.encap; }), sub: [arg("line", "x", "LINE", "VLAN", { run: (c) => portOnly(c, "", (p) => { delete p.encap; }) })] })] }),
        kw("bandwidth", "Reset bandwidth", { run: (c) => eachIf(c, (p) => { delete p.bandwidth; }), sub: [arg("line", "x", "LINE", "value", { run: (c) => eachIf(c, (p) => { delete p.bandwidth; }) })] }),
        kw("delay", "Reset delay", { run: (c) => eachIf(c, (p) => { delete p.delay; }), sub: [arg("line", "x", "LINE", "value", { run: (c) => eachIf(c, (p) => { delete p.delay; }) })] }),
        kw("standby", "HSRP interface configuration commands", { sub: [arg("num", "grp", "<0-4095>", "group number", { range: [0, 4095], run: (c) => dropFhrp(c, "hsrp"), sub: fhrpCmds("hsrp", true) }), ...fhrpCmds("hsrp", true)] }),
        kw("vrrp", "VRRP Interface configuration commands", { sub: [arg("num", "grp", "<1-255>", "Group number", { range: [1, 255], run: (c) => dropFhrp(c, "vrrp"), sub: fhrpCmds("vrrp", true) })] }),
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

function routeMapEnter(c: Ctx, action: "permit" | "deny", seq: number) {
  edit(c, (d) => {
    d.routeMaps = d.routeMaps ?? {};
    const list = (d.routeMaps[c.a.name] = d.routeMaps[c.a.name] ?? []);
    const e = list.find((x) => x.seq === seq);
    if (e) e.action = action;
    else list.push({ seq, action });
    list.sort((a, b) => a.seq - b.seq);
  });
  c.s.mode = { m: "rmap", name: c.a.name, seq };
}

/** `ip prefix-list NAME [seq N] permit|deny A.B.C.D/nn [ge N] [le N]` */
function prefixList(c: Ctx) {
  const t = c.a.rule.trim().split(/\s+/);
  let i = 0;
  let seq: number | undefined;
  if (t[0] === "seq") ((seq = +t[1]), (i = 2));
  const word = t[i++];
  if (word !== "permit" && word !== "deny") return say(c, "% Expected permit or deny");
  const action: "permit" | "deny" = word;
  const p = parseCidr(t[i++] ?? "");
  if (!p) return say(c, "% Invalid prefix (use A.B.C.D/nn)");
  const prefix = `${intToIp(p.net)}/${p.len}`;
  let ge: number | undefined;
  let le: number | undefined;
  while (i < t.length) {
    const k = t[i++];
    const v = +t[i++];
    if (k === "ge") ge = v;
    else if (k === "le") le = v;
    else return say(c, `% Unexpected "${k}"`);
  }
  if ((ge !== undefined && (ge <= p.len || ge > 32)) || (le !== undefined && (le < (ge ?? p.len) || le > 32))) return say(c, "% Invalid prefix range: need len < ge <= le <= 32");
  edit(c, (d) => {
    d.prefixLists = d.prefixLists ?? {};
    const list = (d.prefixLists[c.a.name] = d.prefixLists[c.a.name] ?? []);
    const s = seq ?? (list.length ? Math.max(...list.map((e) => e.seq)) + 5 : 5);
    d.prefixLists[c.a.name] = [...list.filter((e) => e.seq !== s), { seq: s, action, prefix, ge, le }].sort((a, b) => a.seq - b.seq);
  });
}

/** Commands under `router bgp <asn>` (and its ipv4 address family). */
function bgpTree(): Node[] {
  const b = (c: Ctx, fn: (x: NonNullable<Device["bgp"]>) => void) => edit(c, (d) => d.bgp && fn(d.bgp));
  const nbr = (c: Ctx, fn: (n: NonNullable<Device["bgp"]>["neighbors"][number]) => void) => {
    if (!c.dev.bgp?.neighbors.some((n) => n.ip === c.a.nip)) return say(c, `% Specify remote-as or peer-group commands first`);
    b(c, (x) => fn(x.neighbors.find((n) => n.ip === c.a.nip)!));
  };
  const classful = (ip: string) => {
    const first = +ip.split(".")[0];
    return first < 128 ? 8 : first < 192 ? 16 : 24;
  };
  const network = (neg: boolean) =>
    arg("ip", "net", "A.B.C.D", "Network number", {
      run: (c) => setNetwork(c, classful(c.a.net), neg),
      sub: [kw("mask", "Network mask", { sub: [arg("mask", "mask", "A.B.C.D", "Network mask", { run: (c) => setNetwork(c, maskToLen(c.a.mask), neg) })] })],
    });
  const setNetwork = (c: Ctx, len: number | null, neg: boolean) => {
    if (len === null) return say(c, "% Invalid mask");
    const pfx = `${intToIp((ipToInt(c.a.net) & maskOf(len)) >>> 0)}/${len}`;
    b(c, (x) => {
      x.networks = x.networks.filter((n) => n !== pfx);
      if (!neg) x.networks.push(pfx);
    });
  };
  const nbrCmds = (neg: boolean): Node[] => [
    kw("remote-as", "Specify a BGP neighbor", {
      run: neg ? (c) => b(c, (x) => (x.neighbors = x.neighbors.filter((n) => n.ip !== c.a.nip))) : undefined,
      sub: neg
        ? []
        : [
            arg("num", "as", "<1-4294967295>", "AS of remote neighbor", {
              range: [1, 4294967295],
              run: (c) =>
                b(c, (x) => {
                  const n = x.neighbors.find((y) => y.ip === c.a.nip);
                  if (n) n.remoteAs = +c.a.as;
                  else x.neighbors.push({ ip: c.a.nip, remoteAs: +c.a.as });
                }),
            }),
          ],
    }),
    kw("shutdown", "Administratively shut down this neighbor", { run: (c) => nbr(c, (n) => (neg ? delete n.shutdown : (n.shutdown = true))) }),
    kw("update-source", "Source of routing updates", {
      run: neg ? (c) => nbr(c, (n) => delete n.updateSource) : undefined,
      sub: [arg("iface", "if", "<interface>", "Interface", { run: (c) => nbr(c, (n) => (neg ? delete n.updateSource : (n.updateSource = c.a.if))) })],
    }),
    kw("ebgp-multihop", "Allow EBGP neighbors not on directly connected networks", {
      run: (c) => nbr(c, (n) => (neg ? delete n.multihop : (n.multihop = 255))),
      sub: [arg("num", "ttl", "<1-255>", "maximum hop count", { range: [1, 255], run: (c) => nbr(c, (n) => (neg ? delete n.multihop : (n.multihop = +c.a.ttl))) })],
    }),
    kw("next-hop-self", "Disable the next hop calculation for this neighbor", { run: (c) => nbr(c, (n) => (neg ? delete n.nextHopSelf : (n.nextHopSelf = true))) }),
    kw("weight", "Set default weight for routes from this neighbor", {
      run: neg ? (c) => nbr(c, (n) => delete n.weight) : undefined,
      sub: [arg("num", "w", "<0-65535>", "default weight", { range: [0, 65535], run: (c) => nbr(c, (n) => (neg ? delete n.weight : (n.weight = +c.a.w))) })],
    }),
    kw("route-map", "Apply route map to neighbor", {
      sub: [
        arg("word", "rm", "WORD", "Name of route map", {
          sub: [
            kw("in", "Apply map to incoming routes", { run: (c) => nbr(c, (n) => (neg ? delete n.routeMapIn : (n.routeMapIn = c.a.rm))) }),
            kw("out", "Apply map to outbound routes", { run: (c) => nbr(c, (n) => (neg ? delete n.routeMapOut : (n.routeMapOut = c.a.rm))) }),
          ],
        }),
      ],
    }),
    kw("activate", "Enable the Address Family for this Neighbor", { run: accepted }),
    kw("description", "Neighbor specific description", { sub: [arg("line", "x", "LINE", "Up to 80 characters", { run: accepted })] }),
    kw("password", "Set a password", { sub: [arg("line", "x", "LINE", "password", { run: notSimulated("BGP MD5 authentication") })] }),
  ];
  const redist = (neg: boolean) =>
    kw("redistribute", "Redistribute information from another routing protocol", {
      sub: (["connected", "static", "ospf"] as const).map((k) =>
        kw(k, k === "ospf" ? "Open Shortest Path First (OSPF)" : k === "static" ? "Static routes" : "Connected", {
          run: (c) => b(c, (x) => (x.redistribute = neg ? (x.redistribute ?? []).filter((r) => r !== k) : [...new Set([...(x.redistribute ?? []), k])])),
          sub: k === "ospf" ? [arg("num", "pid", "<1-65535>", "Process ID", { run: (c) => b(c, (x) => (x.redistribute = neg ? (x.redistribute ?? []).filter((r) => r !== k) : [...new Set([...(x.redistribute ?? []), k])])) })] : [],
        }),
      ),
    });
  return [
    kw("bgp", "BGP specific commands", {
      sub: [
        kw("router-id", "Override configured router identifier", { sub: [arg("ip", "rid", "A.B.C.D", "Manually configured router identifier", { run: (c) => b(c, (x) => (x.routerId = c.a.rid)) })] }),
        kw("log-neighbor-changes", "Log neighbor up/down and reset reason", { run: accepted }),
      ],
    }),
    kw("neighbor", "Specify a neighbor router", { sub: [arg("ip", "nip", "A.B.C.D", "Neighbor address", { sub: nbrCmds(false) })] }),
    kw("network", "Specify a network to announce via BGP", { sub: [network(false)] }),
    redist(false),
    kw("address-family", "Enter Address Family command mode", {
      sub: [kw("ipv4", "Address family", { run: (c) => (c.s.mode = { m: "bgp", af: true }), sub: [kw("unicast", "Address Family modifier", { run: (c) => (c.s.mode = { m: "bgp", af: true }) })] })],
    }),
    kw("exit-address-family", "Exit from Address Family configuration mode", { run: (c) => (c.s.mode = { m: "bgp" }) }),
    kw("no", "Negate a command or set its defaults", {
      sub: [
        kw("neighbor", "Specify a neighbor router", {
          sub: [arg("ip", "nip", "A.B.C.D", "Neighbor address", { run: (c) => b(c, (x) => (x.neighbors = x.neighbors.filter((n) => n.ip !== c.a.nip))), sub: nbrCmds(true) })],
        }),
        kw("network", "Stop announcing a network", { sub: [network(true)] }),
        redist(true),
        kw("bgp", "BGP specific commands", { sub: [kw("router-id", "Remove the router ID", { run: (c) => b(c, (x) => delete x.routerId) })] }),
      ],
    }),
    kw("do", "To run exec commands in config mode", { sub: [arg("line", "cmd", "LINE", "Exec Command", { run: (c) => runDo(c) })] }),
    kw("exit", "Exit from routing protocol configuration mode", { run: (c) => (c.s.mode = c.s.mode.m === "bgp" && c.s.mode.af ? { m: "bgp" } : { m: "config" }) }),
    kw("end", "Exit to privileged EXEC", { run: (c) => (c.s.mode = { m: "exec" }) }),
  ];
}

/** Commands under `route-map NAME permit|deny SEQ`. */
function rmapTree(): Node[] {
  const e = (c: Ctx, fn: (x: NonNullable<Device["routeMaps"]>[string][number]) => void) =>
    edit(c, (d) => {
      if (c.s.mode.m !== "rmap") return;
      const { name, seq } = c.s.mode;
      const x = d.routeMaps?.[name]?.find((y) => y.seq === seq);
      if (x) fn(x);
    });
  const sets = (neg: boolean) => [
    kw("local-preference", "BGP local preference path attribute", {
      run: neg ? (c) => e(c, (x) => delete x.setLocalPref) : undefined,
      sub: [arg("num", "v", "<0-4294967295>", "Preference value", { run: (c) => e(c, (x) => (neg ? delete x.setLocalPref : (x.setLocalPref = +c.a.v))) })],
    }),
    kw("weight", "BGP weight for routing table", {
      run: neg ? (c) => e(c, (x) => delete x.setWeight) : undefined,
      sub: [arg("num", "v", "<0-65535>", "Weight value", { run: (c) => e(c, (x) => (neg ? delete x.setWeight : (x.setWeight = +c.a.v))) })],
    }),
    kw("metric", "Metric value for destination routing protocol (MED)", {
      run: neg ? (c) => e(c, (x) => delete x.setMed) : undefined,
      sub: [arg("num", "v", "<0-4294967295>", "Metric value", { run: (c) => e(c, (x) => (neg ? delete x.setMed : (x.setMed = +c.a.v))) })],
    }),
    kw("as-path", "Prepend string for a BGP AS-path attribute", {
      sub: [
        kw("prepend", "Prepend to the as-path", {
          run: neg ? (c) => e(c, (x) => delete x.setPrepend) : undefined,
          sub: [
            arg("line", "list", "<1-4294967295>", "AS number(s)", {
              run: (c) => {
                const list = c.a.list.split(/\s+/).map(Number);
                if (list.some((n) => !Number.isInteger(n) || n < 1)) return say(c, "% Invalid AS number");
                e(c, (x) => (neg ? delete x.setPrepend : (x.setPrepend = list)));
              },
            }),
          ],
        }),
      ],
    }),
  ];
  const match = (neg: boolean) =>
    kw("ip", "IP specific information", {
      sub: [
        kw("address", "Match address of route or match packet", {
          sub: [
            kw("prefix-list", "Match entries of prefix-lists", { sub: [arg("word", "pl", "WORD", "IP prefix-list name", { run: (c) => e(c, (x) => (neg ? delete x.matchPrefixList : (x.matchPrefixList = c.a.pl))) })] }),
            arg("word", "acl", "WORD", "IP access-list number or name", { run: (c) => e(c, (x) => (neg ? delete x.matchAcl : (x.matchAcl = c.a.acl))) }),
          ],
        }),
      ],
    });
  return [
    kw("match", "Match values from routing table", { sub: [match(false)] }),
    kw("set", "Set values in destination routing protocol", { sub: sets(false) }),
    kw("no", "Negate a command or set its defaults", {
      sub: [kw("match", "Match values from routing table", { sub: [match(true)] }), kw("set", "Set values in destination routing protocol", { sub: sets(true) })],
    }),
    kw("do", "To run exec commands in config mode", { sub: [arg("line", "cmd", "LINE", "Exec Command", { run: (c) => runDo(c) })] }),
    kw("exit", "Exit from route-map configuration mode", { run: (c) => (c.s.mode = { m: "config" }) }),
    kw("end", "Exit to privileged EXEC", { run: (c) => (c.s.mode = { m: "exec" }) }),
  ];
}

/** `ip nat ...` in global config. */
function natGlobalTree(neg: boolean): Node[] {
  const nat = (c: Ctx, fn: (n: NonNullable<Device["nat"]>) => void) =>
    edit(c, (d) => {
      d.nat = d.nat ?? { rules: [], pools: [] };
      fn(d.nat);
      if (!d.nat.rules.length && !d.nat.pools.length) delete d.nat;
    });
  const dyn = (c: Ctx, target: { iface?: string; pool?: string }, overload: boolean) =>
    nat(c, (n) => {
      const rest = n.rules.filter((r) => !(r.kind === "dynamic" && r.acl === c.a.acl));
      n.rules = neg ? rest : [...rest, { kind: "dynamic", acl: c.a.acl, ...target, overload }];
      if (!neg && !c.dev.acls?.[c.a.acl]) say(c, `% Note: access-list ${c.a.acl} doesn't exist yet. Until it does, nothing matches this rule.`);
    });
  return [
    kw("inside", "Inside address translation", {
      sub: [
        kw("source", "Source address translation", {
          sub: [
            kw("list", "Specify access list describing local addresses", {
              sub: [
                arg("word", "acl", "WORD", "Access list name or number", {
                  run: neg ? (c) => dyn(c, {}, false) : undefined,
                  sub: [
                    kw("interface", "Specify interface for global address", {
                      sub: [
                        arg("iface", "if", "<interface>", "Interface", {
                          run: (c) => (neg ? dyn(c, {}, false) : say(c, "% Add 'overload': interface NAT always translates many hosts to one address")),
                          sub: [kw("overload", "Overload an address translation", { run: (c) => dyn(c, { iface: c.a.if }, true) })],
                        }),
                      ],
                    }),
                    kw("pool", "Name pool of global addresses", {
                      sub: [
                        arg("word", "pool", "WORD", "Pool name", {
                          run: (c) => dyn(c, { pool: c.a.pool }, false),
                          sub: [kw("overload", "Overload an address translation", { run: (c) => dyn(c, { pool: c.a.pool }, true) })],
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
            kw("static", "Specify static local->global mapping", {
              sub: [
                arg("ip", "local", "A.B.C.D", "Inside local IP address", {
                  sub: [
                    arg("ip", "global", "A.B.C.D", "Inside global IP address", {
                      run: (c) =>
                        nat(c, (n) => {
                          const rest = n.rules.filter((r) => !(r.kind === "static" && (r.local === c.a.local || r.global === c.a.global)));
                          n.rules = neg ? rest : [...rest, { kind: "static", local: c.a.local, global: c.a.global }];
                        }),
                    }),
                  ],
                }),
                kw("tcp", "Transmission Control Protocol", { run: notSimulated("Static PAT for TCP (only ICMP traffic is simulated)"), sub: [arg("line", "x", "LINE", "local port global port", { run: notSimulated("Static PAT for TCP (only ICMP traffic is simulated)") })] }),
                kw("udp", "User Datagram Protocol", { run: notSimulated("Static PAT for UDP (only ICMP traffic is simulated)"), sub: [arg("line", "x", "LINE", "local port global port", { run: notSimulated("Static PAT for UDP (only ICMP traffic is simulated)") })] }),
              ],
            }),
          ],
        }),
      ],
    }),
    kw("pool", "Define pool of addresses", {
      sub: [
        arg("word", "name", "WORD", "Pool name", {
          run: neg ? (c) => nat(c, (n) => (n.pools = n.pools.filter((p) => p.name !== c.a.name))) : undefined,
          sub: [
            arg("ip", "start", "A.B.C.D", "Start IP address", {
              sub: [
                arg("ip", "end", "A.B.C.D", "End IP address", {
                  sub: [
                    kw("netmask", "Specify the network mask", {
                      sub: [arg("mask", "mask", "A.B.C.D", "Network mask", { run: (c) => natPool(c, nat, maskToLen(c.a.mask), neg) })],
                    }),
                    kw("prefix-length", "Specify the prefix length", {
                      sub: [arg("num", "len", "<1-32>", "Prefix length", { range: [1, 32], run: (c) => natPool(c, nat, +c.a.len, neg) })],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  ];
}

function natPool(c: Ctx, nat: (c: Ctx, fn: (n: NonNullable<Device["nat"]>) => void) => void, len: number | null, neg: boolean) {
  if (len === null) return say(c, "% Invalid netmask");
  if (ipToInt(c.a.end) < ipToInt(c.a.start)) return say(c, "% End address less than start address");
  const net = (ipToInt(c.a.start) & maskOf(len)) >>> 0;
  if (((ipToInt(c.a.end) & maskOf(len)) >>> 0) !== net) return say(c, "% Start and end addresses are on different subnets");
  nat(c, (n) => {
    const rest = n.pools.filter((p) => p.name !== c.a.name);
    n.pools = neg ? rest : [...rest, { name: c.a.name, start: c.a.start, end: c.a.end, len }];
  });
}

function excluded(c: Ctx, lo: string, hi: string, neg: boolean) {
  if (ipToInt(hi) < ipToInt(lo)) return say(c, "% High address is lower than low address");
  edit(c, (d) => {
    d.dhcp = d.dhcp ?? { pools: [], excluded: [] };
    const rest = d.dhcp.excluded.filter((e) => !(e.start === lo && e.end === hi));
    if (neg && rest.length === d.dhcp.excluded.length) say(c, "% Range not found");
    d.dhcp.excluded = neg ? rest : [...rest, { start: lo, end: hi }];
  });
}

/** Commands under `ip dhcp pool NAME`. */
function dhcpTree(): Node[] {
  const pool = (c: Ctx, fn: (p: NonNullable<Device["dhcp"]>["pools"][number]) => void) =>
    edit(c, (d) => {
      const p = d.dhcp?.pools.find((x) => c.s.mode.m === "dhcp" && x.name === c.s.mode.pool);
      if (p) fn(p);
    });
  const setNet = (c: Ctx, len: number | null) => {
    if (len === null) return say(c, "% Invalid mask");
    const net = `${intToIp((ipToInt(c.a.ip) & maskOf(len)) >>> 0)}/${len}`;
    if (!net.startsWith(`${c.a.ip}/`)) return say(c, `% ${c.a.ip} is not the network address of ${net}`);
    pool(c, (p) => (p.network = net));
  };
  return [
    kw("network", "Network number and mask", {
      sub: [
        arg("ip", "ip", "A.B.C.D", "Network number in dotted-decimal notation", {
          sub: [
            arg("mask", "mask", "A.B.C.D", "Network mask", { run: (c) => setNet(c, maskToLen(c.a.mask)) }),
            arg("word", "plen", "/nn", "Prefix length, e.g. /24", { run: (c) => setNet(c, /^\/\d{1,2}$/.test(c.a.plen) ? +c.a.plen.slice(1) : null) }),
          ],
        }),
      ],
    }),
    kw("default-router", "Default routers", { sub: [arg("ip", "gw", "A.B.C.D", "Router's IP address", { run: (c) => pool(c, (p) => (p.gateway = c.a.gw)) })] }),
    kw("dns-server", "DNS servers", { sub: [arg("ip", "dns", "A.B.C.D", "Server's IP address", { run: (c) => pool(c, (p) => (p.dns = c.a.dns)) })] }),
    kw("domain-name", "Domain name", { sub: [arg("word", "dn", "WORD", "Domain name", { run: (c) => pool(c, (p) => (p.domain = c.a.dn)) })] }),
    kw("lease", "Address lease time", { sub: [arg("line", "x", "LINE", "days hours minutes | infinite", { run: accepted })] }),
    kw("no", "Negate a command or set its defaults", {
      sub: [
        kw("network", "Remove the network", { run: (c) => pool(c, (p) => delete p.network), sub: [arg("line", "x", "LINE", "network mask", { run: (c) => pool(c, (p) => delete p.network) })] }),
        kw("default-router", "Remove default routers", { run: (c) => pool(c, (p) => delete p.gateway), sub: [arg("line", "x", "LINE", "address", { run: (c) => pool(c, (p) => delete p.gateway) })] }),
        kw("dns-server", "Remove DNS servers", { run: (c) => pool(c, (p) => delete p.dns), sub: [arg("line", "x", "LINE", "address", { run: (c) => pool(c, (p) => delete p.dns) })] }),
      ],
    }),
    kw("do", "To run exec commands in config mode", { sub: [arg("line", "cmd", "LINE", "Exec Command", { run: (c) => runDo(c) })] }),
    kw("exit", "Exit from DHCP pool configuration mode", { run: (c) => (c.s.mode = { m: "config" }) }),
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

function eigrpTree(): Node[] {
  const ei = (c: Ctx, fn: (e: NonNullable<Device["eigrp"]>) => void) => edit(c, (d) => d.eigrp && fn(d.eigrp));
  const mode = (c: Ctx) => c.s.mode as Extract<Mode, { m: "eigrp" }>;
  const classic = (c: Ctx) => !mode(c).named;
  const top = (c: Ctx) => !!mode(c).named && !mode(c).sub;
  const af = (c: Ctx) => mode(c).sub === "af";
  const afif = (c: Ctx) => mode(c).sub === "afif";
  const topo = (c: Ctx) => mode(c).sub === "topo";
  const either = (c: Ctx) => classic(c) || af(c);
  const network = (neg: boolean) =>
    arg("ip", "ip", "A.B.C.D", "Network number", {
      run: (c) => netStmt(c, neg),
      sub: [arg("mask", "wc", "A.B.C.D", "EIGRP wild card bits", { run: (c) => netStmt(c, neg) })],
    });
  const netStmt = (c: Ctx, neg: boolean) => {
    if (c.a.wc && wildcardToLen(c.a.wc) === null) return say(c, "% Invalid wildcard mask");
    ei(c, (e) => {
      const same = (n: { ip: string; wildcard?: string }) => n.ip === c.a.ip && (n.wildcard ?? "") === (c.a.wc ?? "");
      if (neg) {
        if (!e.networks.some(same)) say(c, "% EIGRP: Network statement not found");
        e.networks = e.networks.filter((n) => !same(n));
      } else if (!e.networks.some(same)) e.networks.push(c.a.wc ? { ip: c.a.ip, wildcard: c.a.wc } : { ip: c.a.ip });
    });
  };
  const setPassive = (c: Ctx, name: string | "default", neg: boolean) =>
    ei(c, (e) => {
      if (name === "default") {
        e.passiveDefault = !neg || undefined;
        e.passive = [];
        e.noPassive = [];
        return;
      }
      const without = (l?: string[]) => (l ?? []).filter((n) => n !== name);
      if (e.passiveDefault) e.noPassive = neg ? [...without(e.noPassive), name] : without(e.noPassive);
      else e.passive = neg ? without(e.passive) : [...without(e.passive), name];
    });
  const passiveClassic = (neg: boolean) =>
    kw("passive-interface", "Suppress routing updates on an interface", {
      when: classic,
      sub: [kw("default", "Suppress routing updates on all interfaces", { run: (c) => setPassive(c, "default", neg) }), arg("iface", "if", "<interface>", "Interface", { run: (c) => setPassive(c, c.a.if, neg) })],
    });
  const afIfName = (c: Ctx) => mode(c).afIf ?? "default";
  const redist = (neg: boolean) =>
    kw("redistribute", "Redistribute IPv4 routes from another routing protocol", {
      when: (c) => classic(c) || topo(c),
      sub: (["static", "connected"] as const).map((k) =>
        kw(k, `${k === "static" ? "Static" : "Connected"} routes`, { run: (c) => ei(c, (e) => { e.redistribute = [...(e.redistribute ?? []).filter((x) => x !== k), ...(neg ? [] : [k])]; if (!e.redistribute.length) delete e.redistribute; }) }),
      ),
    });
  const variance = kw("variance", "Control load balancing variance", {
    when: (c) => classic(c) || topo(c),
    sub: [arg("num", "v", "<1-128>", "Metric variance multiplier", { range: [1, 128], run: (c) => ei(c, (e) => (e.variance = +c.a.v === 1 ? undefined : +c.a.v)) })],
  });
  return [
    kw("network", "Enable routing on an IP network", { when: either, sub: [network(false)] }),
    passiveClassic(false),
    variance,
    redist(false),
    kw("eigrp", "EIGRP specific commands", { when: either, sub: [kw("router-id", "router id for this EIGRP process", { sub: [arg("ip", "rid", "A.B.C.D", "EIGRP Router-ID in IP address format", { run: (c) => ei(c, (e) => (e.routerId = c.a.rid)) })] })] }),
    kw("auto-summary", "Enable automatic network number summarization", { when: classic, run: notSimulated("EIGRP auto-summary") }),
    kw("address-family", "Enter Address Family command mode", {
      when: top,
      sub: [
        kw("ipv4", "Address family", {
          sub: [
            kw("unicast", "Address Family modifier", { sub: [kw("autonomous-system", "Specify Address-Family Autonomous System Number", { sub: [arg("num", "asn", "<1-65535>", "Autonomous System Number", { range: [1, 65535], run: (c) => afEnter(c) })] })] }),
            kw("autonomous-system", "Specify Address-Family Autonomous System Number", { sub: [arg("num", "asn", "<1-65535>", "Autonomous System Number", { range: [1, 65535], run: (c) => afEnter(c) })] }),
          ],
        }),
      ],
    }),
    kw("af-interface", "Enter Address Family interface configuration", {
      when: af,
      sub: [kw("default", "Address family default interface configuration", { run: (c) => (c.s.mode = { m: "eigrp", named: true, sub: "afif" }) }), arg("iface", "if", "<interface>", "Interface name", { run: (c) => (c.s.mode = { m: "eigrp", named: true, sub: "afif", afIf: c.a.if }) })],
    }),
    kw("passive-interface", "Suppress address updates on an interface", { when: afif, run: (c) => setPassive(c, afIfName(c), false) }),
    kw("exit-af-interface", "Exit from Address Family Interface configuration mode", { when: afif, run: (c) => (c.s.mode = { m: "eigrp", named: true, sub: "af" }) }),
    kw("topology", "Topology configuration mode", { when: af, sub: [kw("base", "Base topology", { run: (c) => (c.s.mode = { m: "eigrp", named: true, sub: "topo" }) })] }),
    kw("exit-af-topology", "Exit from Address Family Topology configuration mode", { when: topo, run: (c) => (c.s.mode = { m: "eigrp", named: true, sub: "af" }) }),
    kw("exit-address-family", "Exit Address Family configuration mode", { when: af, run: (c) => (c.s.mode = { m: "eigrp", named: true }) }),
    kw("no", "Negate a command or set its defaults", {
      sub: [
        kw("network", "Disable routing on an IP network", { when: either, sub: [network(true)] }),
        passiveClassic(true),
        kw("passive-interface", "Allow updates on this interface", { when: afif, run: (c) => setPassive(c, afIfName(c), true) }),
        kw("variance", "Reset variance", { when: (c) => classic(c) || topo(c), run: (c) => ei(c, (e) => delete e.variance), sub: [arg("line", "x", "LINE", "value", { run: (c) => ei(c, (e) => delete e.variance) })] }),
        redist(true),
        kw("eigrp", "EIGRP specific commands", { when: either, sub: [kw("router-id", "Remove the router id", { run: (c) => ei(c, (e) => delete e.routerId) })] }),
        kw("auto-summary", "Disable automatic summarization (the default)", { run: accepted }),
      ],
    }),
    kw("do", "To run exec commands in config mode", { sub: [arg("line", "cmd", "LINE", "Exec Command", { run: (c) => runDo(c) })] }),
    kw("exit", "Exit from this configuration mode", {
      run: (c) => {
        const m = mode(c);
        c.s.mode = !m.named || !m.sub ? { m: "config" } : m.sub === "af" ? { m: "eigrp", named: true } : { m: "eigrp", named: true, sub: "af" };
      },
    }),
    kw("end", "Exit to privileged EXEC", { run: (c) => (c.s.mode = { m: "exec" }) }),
  ];
}

function afEnter(c: Ctx) {
  const e = c.dev.eigrp;
  if (e?.asn && e.asn !== +c.a.asn) return say(c, `% Wire Room simulates one address family per EIGRP instance (AS ${e.asn}).`);
  edit(c, (d) => d.eigrp && (d.eigrp.asn = +c.a.asn));
  c.s.mode = { m: "eigrp", named: true, sub: "af" };
}

const TREES: Record<Mode["m"], Node[]> = {
  exec: execTree(),
  config: configTree(),
  if: ifTree(),
  acl: aclTree(),
  vlan: simpleSubTree("config"),
  line: simpleSubTree("config"),
  router: ospfTree(),
  dhcp: dhcpTree(),
  bgp: bgpTree(),
  rmap: rmapTree(),
  eigrp: eigrpTree(),
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
    .map((n) => `  ${(n.kw ?? n.label ?? "").padEnd(17)} ${n.help}`);
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

  const pipe = /^(.*?\S)\s*\|\s*(include|inc|i|exclude|exc|e|begin|beg|b|section|sec|s)\s+(.+)$/i.exec(line);
  if (pipe && !line.trim().endsWith("?")) {
    const r = runCli(pipe[1], s, topo, net);
    let re: RegExp;
    try {
      re = new RegExp(pipe[3].trim(), "i");
    } catch {
      return { ...r, out: "% Invalid regular expression" };
    }
    return { ...r, out: filterOutput(r.out, pipe[2].toLowerCase()[0], re) };
  }
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
  if (c.changed) c.lines.push(...adjChanges(net, new Net(c.topo, net), c.s.dev));
  return { out: c.lines.join("\n"), session: c.s, topo: c.changed ? c.topo : undefined, probe: c.probe, renamed: c.renamed };
}

/** IOS output modifiers: `| include`, `| exclude`, `| begin`, `| section`. */
function filterOutput(out: string, kind: string, re: RegExp): string {
  const lines = out.split("\n");
  if (kind === "i") return lines.filter((l) => re.test(l)).join("\n");
  if (kind === "e") return lines.filter((l) => !re.test(l)).join("\n");
  if (kind === "b") {
    const i = lines.findIndex((l) => re.test(l));
    return i < 0 ? "" : lines.slice(i).join("\n");
  }
  // section: a matching line plus the indented lines beneath it
  const keep: string[] = [];
  let inSec = false;
  for (const l of lines) {
    if (/^\S/.test(l)) inSec = re.test(l);
    else if (!inSec && re.test(l)) {
      keep.push(l);
      continue;
    }
    if (inSec) keep.push(l);
  }
  return keep.join("\n");
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
  // EIGRP neighbour changes.
  const asn = after.device(dev)?.eigrp?.asn ?? before.device(dev)?.eigrp?.asn;
  const ek = (n: { iface: string; peerIp: string }) => `${n.iface}|${n.peerIp}`;
  const ewas = new Set(before.device(dev)?.eigrp ? before.eigrp().nbrs.filter((n) => n.dev === dev).map(ek) : []);
  const enow = new Set(after.device(dev)?.eigrp ? after.eigrp().nbrs.filter((n) => n.dev === dev).map(ek) : []);
  for (const k of enow) if (!ewas.has(k)) out.push(`%DUAL-5-NBRCHANGE: EIGRP-IPv4 ${asn}: Neighbor ${k.split("|")[1]} (${longIf(k.split("|")[0])}) is up: new adjacency`);
  for (const k of ewas) {
    if (enow.has(k)) continue;
    const iface = k.split("|")[0];
    const passive = after.device(dev)?.eigrp ? after.eigrp().enabled.get(dev)?.find((x) => x.iface === iface)?.passive : false;
    const why = !after.device(dev)?.eigrp ? "process terminated" : passive ? "interface passive" : "interface down";
    out.push(`%DUAL-5-NBRCHANGE: EIGRP-IPv4 ${asn}: Neighbor ${k.split("|")[1]} (${longIf(iface)}) is down: ${why}`);
  }
  if (after.device(dev)?.eigrp) {
    const old = new Set(before.device(dev)?.eigrp ? before.eigrp().problems.filter((p) => p.dev === dev).map((p) => p.text) : []);
    for (const p of after.eigrp().problems.filter((x) => x.dev === dev)) if (!old.has(p.text)) out.push(p.text);
  }
  // HSRP / VRRP state changes on this device.
  const st = (n: Net) => {
    const m = new Map<string, string>();
    for (const g of n.fhrp().groups)
      for (const x of g.members.filter((y) => y.dev === dev)) {
        const s = !g.vip ? "Init" : g.active === x ? (g.proto === "hsrp" ? "Active" : "Master") : g.proto === "hsrp" ? (g.standby === x ? "Standby" : "Listen") : "Backup";
        m.set(`${g.proto}|${x.iface}|${g.group}`, s);
      }
    return m;
  };
  const fwas = st(before);
  for (const [k, s] of st(after)) {
    const [proto, iface, grp] = k.split("|");
    const w = fwas.get(k) ?? (proto === "hsrp" ? "Speak" : "Init");
    if (w !== s) out.push(proto === "hsrp" ? `%HSRP-5-STATECHANGE: ${iface} Grp ${grp} state ${w} -> ${s}` : `%VRRP-6-STATECHANGE: ${iface} Grp ${grp} state ${w} -> ${s}`);
  }
  // BGP session changes.
  const bk = (x: { peerIp: string }) => x.peerIp;
  const bwas = new Map(before.bgp().sessions.filter((x) => x.dev === dev).map((x) => [bk(x), x]));
  for (const x of after.bgp().sessions.filter((y) => y.dev === dev)) {
    const w = bwas.get(bk(x));
    if (x.state === "Established" && w?.state !== "Established") out.push(`%BGP-5-ADJCHANGE: neighbor ${x.peerIp} Up`);
    if (x.state !== "Established" && w?.state === "Established") out.push(`%BGP-5-ADJCHANGE: neighbor ${x.peerIp} Down${x.state === "Idle (Admin)" ? " Admin. shutdown" : ""}`);
    if (x.notify === "wrong-as" && w?.notify !== "wrong-as") out.push(`%BGP-3-NOTIFICATION: sent to neighbor ${x.peerIp} passive 2/2 (peer in wrong AS) 2 bytes ${x.remoteAs.toString(16).toUpperCase().padStart(4, "0")}`);
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
  ip dhcp                      get an address from a DHCP server (also: dhcp, ipconfig /renew)
  ipconfig /release            give the DHCP lease back
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
  const renew = (cmd === "ip" && tk[1]?.toLowerCase() === "dhcp") || cmd === "dhcp" || (cmd === "ipconfig" && tk[1]?.toLowerCase() === "/renew");
  if (renew) {
    const r = dhcpRequest(net, s.dev);
    const probe: ProbeRun = { kind: "dhcp", src: s.dev, dst: "255.255.255.255", header: `DHCP for ${s.dev}`, probes: [{ seq: 1, mark: r.ok ? "!" : ".", events: r.events }] };
    const next = structuredClone(topo);
    const d = next.devices.find((x) => x.id === s.dev)!;
    d.dhcpClient = true;
    if (!r.ok || !r.lease) {
      const ip = apipa(net, s.dev);
      d.ports[0].ip = `${ip}/16`;
      delete d.gateway;
      return out(`DORA: DISCOVER ... no DHCPOFFER received.\n${s.dev} : ${r.error ?? "DHCP failed"}\nAutoconfiguration IPv4 address: ${ip}/16 (APIPA). Open the packet walk to see where the DISCOVER went.`, { topo: next, probe });
    }
    const l = r.lease;
    d.ports[0].ip = `${l.ip}/${l.len}`;
    if (l.gateway) d.gateway = l.gateway;
    else delete d.gateway;
    return out(
      [
        `DORA: DISCOVER → OFFER → REQUEST → ACK`,
        `   IPv4 Address. . . . . . . . . : ${l.ip}`,
        `   Subnet Mask . . . . . . . . . : ${intToIp(maskOf(l.len))}`,
        `   Default Gateway . . . . . . . : ${l.gateway ?? ""}`,
        `   DHCP Server . . . . . . . . . : ${l.server}${l.relay ? ` (relayed by ${l.relay})` : ""}`,
        ...(l.dns ? [`   DNS Servers . . . . . . . . . : ${l.dns}`] : []),
      ].join("\n"),
      { topo: next, probe },
    );
  }
  if (cmd === "ipconfig" && tk[1]?.toLowerCase() === "/release") {
    dhcpRelease(net, s.dev);
    const next = structuredClone(topo);
    const d = next.devices.find((x) => x.id === s.dev)!;
    delete d.ports[0].ip;
    delete d.gateway;
    return out(`DHCPRELEASE sent. ${s.dev} has no IPv4 address.`, { topo: next });
  }
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
    delete d.dhcpClient;
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
        lines.push(`Reply from ${p.from ?? dst}: bytes=32 time<1ms TTL=${ttl}`);
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
