import type { Ace, ChannelMode, Device, Port, Topology } from "./types";
import { aclAddrMatch, cidrNet, inCidr, intToIp, ipToInt, parseCidr, type Cidr } from "./ip";
import { computeOspf, type OspfResult } from "./ospf";
import type { DhcpBinding } from "./dhcp";

// Wire Room engine: a deterministic, event-recording model of Ethernet
// switching (VLANs, 802.1Q trunks, per-VLAN spanning tree, MAC learning),
// ARP, IPv4 forwarding with static routes, ACLs and ICMP.
//
// It is not a timing-accurate emulator. Each probe runs to completion and
// every decision a device makes is written to the event log, so the UI can
// replay it hop by hop and explain *why*.

export const BCAST = "ffff.ffff.ffff";
const STP_COST = 4; // 1 Gb/s short-mode cost

export type Arp = { op: "request" | "reply"; senderIp: string; senderMac: string; targetIp: string; targetMac?: string };
export type IcmpType = "echo-request" | "echo-reply" | "time-exceeded" | "unreachable";
/** ICMP `id` is the query identifier that PAT rewrites like a port number. */
export type Pkt = { src: string; dst: string; ttl: number; icmp: { type: IcmpType; seq: number; id?: number } };

export type NatEntry = {
  kind: "static" | "dynamic" | "pat";
  insideLocal: string;
  insideGlobal: string;
  localId?: number;
  globalId?: number;
  outside?: string;
  hits: number;
};
export type DhcpMsg = {
  op: "DISCOVER" | "OFFER" | "REQUEST" | "ACK" | "NAK";
  srcIp: string;
  dstIp: string;
  xid: number;
  chaddr: string;
  yiaddr?: string;
  giaddr?: string;
  server?: string;
  relayed?: boolean;
};
export type Frame = { src: string; dst: string; arp?: Arp; ip?: Pkt; dhcp?: DhcpMsg };

export type SimEvent = {
  id: number;
  probe: number;
  dev: string;
  /** drop = something went wrong; filter = a normal, expected discard (STP blocking, same-port). */
  kind: "tx" | "proc" | "drop" | "deliver" | "ignore" | "filter";
  /** For tx: the wire it travels on, oriented from sender to receiver. */
  wire?: { from: [string, string]; to: [string, string] };
  frame: Frame;
  /** 802.1Q tag on the wire, if any. */
  tag?: number;
  note: string;
  /** Which way this packet is flowing relative to the probe, for colouring. */
  dir: "out" | "back" | "ctl";
};

export type L3If = {
  dev: string;
  name: string;
  cidr: Cidr;
  mac: string;
  kind: "port" | "svi";
  vlan?: number;
  up: boolean;
  aclIn?: string;
  aclOut?: string;
};

export type RouteEntry = { code: "C" | "L" | "S" | "O" | "O IA" | "O*E2"; prefix: string; cidr: Cidr; via?: string; iface?: string; metric?: number };

export type StpRole = "root" | "desig" | "alt";
export type StpView = {
  vlan: number;
  /** Root bridge for each switch's component. */
  rootOf: Record<string, string>;
  cost: Record<string, number>;
  roles: Record<string, StpRole>; // `${dev}|${port}`
  bridgeId: Record<string, { prio: number; mac: string }>;
};

export type Bundle = {
  dev: string;
  po: string;
  protocol: "LACP" | "PAgP" | "-";
  formed: boolean;
  peer?: [string, string];
  /** Member port -> P bundled, I stand-alone, s suspended, D down. */
  members: { port: string; flag: "P" | "I" | "s" | "D"; peer?: [string, string]; why?: string }[];
};

const PROTO: Record<ChannelMode, Bundle["protocol"]> = { active: "LACP", passive: "LACP", desirable: "PAgP", auto: "PAgP", on: "-" };

/** Does this pair of channel modes negotiate a bundle? Returns a reason when it doesn't. */
export function channelPair(a: ChannelMode, b: ChannelMode): string | null {
  if (PROTO[a] !== PROTO[b]) return `${a} (${PROTO[a] === "-" ? "static" : PROTO[a]}) can't bundle with ${b} (${PROTO[b] === "-" ? "static" : PROTO[b]})`;
  if (a === "passive" && b === "passive") return "both ends are LACP passive, so neither starts the negotiation";
  if (a === "auto" && b === "auto") return "both ends are PAgP auto, so neither starts the negotiation";
  return null;
}

export type ProbeResult = { seq: number; mark: "!" | "." | "U"; from?: string; events: SimEvent[]; note?: string };

const hex2 = (n: number) => n.toString(16).padStart(2, "0");

export class Net {
  readonly topo: Topology;
  private devs = new Map<string, Device>();
  private devIdx = new Map<string, number>();
  private peers = new Map<string, [string, string]>();
  /** Cabling as drawn, before EtherChannel bundling. */
  private physPeers = new Map<string, [string, string]>();
  /** member `${dev}|${port}` -> Po name, for ports bundled (or suspended) in a channel. */
  private memberOf = new Map<string, string>();
  bundles: Bundle[] = [];
  private stpCache = new Map<number, StpView>();
  private ospfCache?: OspfResult;
  macTables = new Map<string, Map<string, { port: string; vlan: number; mac: string }>>();
  arpTables = new Map<string, Map<string, { mac: string; iface: string }>>();
  natTables = new Map<string, NatEntry[]>();
  natStats = new Map<string, { hits: number; misses: number }>();
  /** DHCP server state: bindings and ping-check conflicts per server device. */
  dhcpBindings = new Map<string, DhcpBinding[]>();
  dhcpConflicts = new Map<string, string[]>();
  private pending = new Map<string, { nextHop: string; pkt: Pkt; iface: string }[]>();

  // Per-probe run state.
  private queue: { dev: string; port: string; frame: Frame; tag?: number }[] = [];
  private events: SimEvent[] = [];
  private eventId = 0;
  private probe = 0;
  private probeSrc = "";
  private probeHit: { mark: "!" | "U"; from: string; icmp: IcmpType } | null = null;

  /** Pass the previous Net to keep learned MAC/ARP entries that are still valid after an edit. */
  constructor(topo: Topology, prev?: Net) {
    this.topo = structuredClone(topo);
    this.topo.devices.forEach((d, i) => {
      this.devs.set(d.id, d);
      this.devIdx.set(d.id, i);
    });
    for (const l of this.topo.links) {
      this.peers.set(l.a.join("|"), l.b);
      this.peers.set(l.b.join("|"), l.a);
      this.physPeers.set(l.a.join("|"), l.b);
      this.physPeers.set(l.b.join("|"), l.a);
    }
    this.bundle();
    if (prev) this.inherit(prev);
  }

  /** Physical cabling state, ignoring bundling (what the port LED shows). */
  physUp(dev: string, port: string): boolean {
    const p = this.port(dev, port);
    if (p && /^Lo\d+$/.test(port)) return !p.shutdown && !this.devs.get(dev)?.off;
    const peer = this.physPeers.get(`${dev}|${port}`);
    if (!p || !peer || p.shutdown || this.devs.get(dev)?.off || this.devs.get(peer[0])?.off) return false;
    const pp = this.port(peer[0], peer[1]);
    return !!pp && !pp.shutdown;
  }
  physPeer(dev: string, port: string) {
    return this.physPeers.get(`${dev}|${port}`);
  }
  bundleOf(dev: string, port: string) {
    return this.memberOf.get(`${dev}|${port}`);
  }

  /**
   * EtherChannel: work out which channel-groups negotiate, then present each formed
   * bundle to the rest of the engine as one logical Po link. Members that don't
   * bundle keep working as ordinary ports (stand-alone), like LACP's individual mode.
   */
  private bundle() {
    for (const d of this.topo.devices) {
      if (!this.isSwitch(d)) continue;
      const groups = new Map<number, Port[]>();
      for (const p of d.ports) if (p.channel) groups.set(p.channel.group, [...(groups.get(p.channel.group) ?? []), p]);
      if (!groups.size) continue;
      d.portChannels = d.portChannels ?? [];
      for (const g of groups.keys()) if (!d.portChannels.some((x) => x.name === `Po${g}`)) d.portChannels.push({ name: `Po${g}`, mode: "access", vlan: 1 });
    }
    // Decide every member first, then wire up the logical links.
    const pending: Bundle[] = [];
    for (const d of this.topo.devices) {
      if (!this.isSwitch(d)) continue;
      const groups = new Map<number, Port[]>();
      for (const p of d.ports) if (p.channel) groups.set(p.channel.group, [...(groups.get(p.channel.group) ?? []), p]);
      for (const [g, members] of groups) {
        const b: Bundle = { dev: d.id, po: `Po${g}`, protocol: PROTO[members[0].channel!.mode], formed: false, members: [] };
        const votes = new Map<string, number>();
        for (const m of members) {
          const peer = this.physPeers.get(`${d.id}|${m.name}`);
          if (!this.physUp(d.id, m.name) || !peer) {
            b.members.push({ port: m.name, flag: "D", why: "link down" });
            continue;
          }
          const pp = this.port(peer[0], peer[1])!;
          if (!pp.channel) {
            b.members.push({ port: m.name, flag: "I", peer, why: `${peer[0]} ${peer[1]} is not in a channel-group` });
            continue;
          }
          const why = channelPair(m.channel!.mode, pp.channel.mode);
          if (why) {
            b.members.push({ port: m.name, flag: "I", peer, why });
            continue;
          }
          const key = `${peer[0]}|Po${pp.channel.group}`;
          votes.set(key, (votes.get(key) ?? 0) + 1);
          b.members.push({ port: m.name, flag: "P", peer });
        }
        // All bundled members must lead to the same neighbour bundle; extras are suspended.
        const winner = [...votes.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
        for (const m of b.members) {
          if (m.flag !== "P") continue;
          const pp = this.port(m.peer![0], m.peer![1])!;
          if (`${m.peer![0]}|Po${pp.channel!.group}` !== winner) Object.assign(m, { flag: "s", why: "member leads to a different neighbour than the rest of the bundle" });
        }
        const po = d.portChannels!.find((x) => x.name === b.po)!;
        b.formed = !!winner && !po.shutdown;
        if (winner) b.peer = winner.split("|") as [string, string];
        pending.push(b);
      }
    }
    for (const b of pending) {
      const d = this.devs.get(b.dev)!;
      d.ports.push(...d.portChannels!.filter((x) => x.name === b.po && !d.ports.some((p) => p.name === x.name)));
      if (!b.formed) continue;
      const other = pending.find((x) => x.dev === b.peer![0] && x.po === b.peer![1]);
      if (!other?.formed) {
        b.formed = false;
        continue;
      }
      this.peers.set(`${b.dev}|${b.po}`, b.peer!);
      for (const m of b.members) {
        if (m.flag === "I" || m.flag === "D") continue;
        this.peers.delete(`${b.dev}|${m.port}`);
        this.memberOf.set(`${b.dev}|${m.port}`, b.po);
      }
    }
    this.bundles = pending;
  }

  /** The member cable a bundle uses for this frame (a simple src/dst MAC hash). */
  private pickMember(dev: string, po: string, frame: Frame): [string, string] | null {
    const b = this.bundles.find((x) => x.dev === dev && x.po === po);
    const up = b?.members.filter((m) => m.flag === "P" && this.physUp(dev, m.port)) ?? [];
    if (!up.length) return null;
    const h = [...(frame.src + frame.dst)].reduce((a, ch) => a + ch.charCodeAt(0), 0);
    const m = up[h % up.length];
    return [m.port, m.peer![1]];
  }

  private inherit(prev: Net) {
    // MACs are derived from device/port position, so only carry entries whose
    // devices kept their place and whose ports are still up in the same VLAN.
    for (const [dev, table] of prev.macTables) {
      const d = this.devs.get(dev);
      if (!d || prev.devIdx.get(dev) !== this.devIdx.get(dev)) continue;
      const keep = new Map<string, { port: string; vlan: number; mac: string }>();
      for (const [k, e] of table) {
        const p = d.ports.find((x) => x.name === e.port);
        if (p && this.linkUp(dev, e.port) && this.carries(d, p, e.vlan)) keep.set(k, e);
      }
      this.macTables.set(dev, keep);
    }
    const allMacs = new Set(this.topo.devices.flatMap((d) => [...d.ports.map((p) => this.macOf(d.id, p.name)), this.sviMac(d.id)]));
    for (const [dev, table] of prev.arpTables) {
      if (!this.devs.has(dev)) continue;
      const ifs = this.l3Ifs(dev);
      const keep = new Map<string, { mac: string; iface: string }>();
      for (const [ip, e] of table) {
        const ifc = ifs.find((i) => i.name === e.iface);
        if (ifc && ifc.up && inCidr(ip, ifc.cidr) && allMacs.has(e.mac)) keep.set(ip, e);
      }
      this.arpTables.set(dev, keep);
    }
    // Dynamic NAT state survives edits as long as the device still does NAT.
    for (const [dev, list] of prev.natTables) if (this.devs.get(dev)?.nat) this.natTables.set(dev, list.map((e) => ({ ...e })));
    for (const [dev, list] of prev.dhcpBindings) if (this.devs.get(dev)?.dhcp) this.dhcpBindings.set(dev, list.filter((b) => this.devs.has(b.client)).map((b) => ({ ...b })));
    for (const [dev, list] of prev.dhcpConflicts) if (this.devs.get(dev)?.dhcp) this.dhcpConflicts.set(dev, [...list]);
  }

  // --- lookups ---------------------------------------------------------------

  device(id: string) {
    return this.devs.get(id)!;
  }
  get devices() {
    return this.topo.devices;
  }
  peer(dev: string, port: string) {
    return this.peers.get(`${dev}|${port}`);
  }
  port(dev: string, name: string): Port | undefined {
    return this.devs.get(dev)?.ports.find((p) => p.name === name);
  }
  isSwitch(d: Device) {
    return d.kind === "switch" || d.kind === "l3switch";
  }
  isHost(d: Device) {
    return d.kind === "pc" || d.kind === "server";
  }
  portMode(d: Device, p: Port): "access" | "trunk" | "routed" {
    if (!this.isSwitch(d)) return "routed";
    return p.mode ?? "access";
  }

  macOf(dev: string, port: string): string {
    const d = this.devs.get(dev)!;
    const di = this.devIdx.get(dev)!;
    const pi = d.ports.findIndex((p) => p.name === port);
    return `0c${hex2(di)}.${hex2(pi + 1)}00.0001`;
  }
  sviMac(dev: string) {
    return `0c${hex2(this.devIdx.get(dev)!)}.ff00.0001`;
  }
  bridgeMac(dev: string) {
    return `0c${hex2(this.devIdx.get(dev)!)}.0000.0001`;
  }

  /**
   * Usable link state for forwarding: both ends enabled and cabled. Loopbacks are up
   * unless shut; a Port-channel is up while any bundled member is; bundled members
   * themselves are not used directly.
   */
  linkUp(dev: string, port: string): boolean {
    const p = this.port(dev, port);
    if (p && /^Lo\d+$/.test(port)) return !p.shutdown && !this.devs.get(dev)?.off;
    if (/^Po\d+$/.test(port)) {
      const b = this.bundles.find((x) => x.dev === dev && x.po === port);
      return !!b?.formed && !p?.shutdown && b.members.some((m) => m.flag === "P" && this.physUp(dev, m.port));
    }
    if (this.memberOf.has(`${dev}|${port}`)) return false;
    const peer = this.peer(dev, port);
    if (!p || !peer || p.shutdown || this.devs.get(dev)?.off || this.devs.get(peer[0])?.off) return false;
    const pp = this.port(peer[0], peer[1]);
    return !!pp && !pp.shutdown;
  }

  carries(d: Device, p: Port, vlan: number): boolean {
    const mode = this.portMode(d, p);
    if (mode === "access") return (p.vlan ?? 1) === vlan;
    if (mode === "trunk") return !p.allowed || p.allowed.includes(vlan);
    return false;
  }

  sviUp(d: Device, vlan: number): boolean {
    const svi = d.svis?.find((s) => s.vlan === vlan);
    if (!svi || svi.shutdown) return false;
    // Autostate: an SVI is up only while some up port carries its VLAN.
    return d.ports.some((p) => this.portMode(d, p) !== "routed" && this.linkUp(d.id, p.name) && this.carries(d, p, vlan));
  }

  l3Ifs(devId: string): L3If[] {
    const d = this.devs.get(devId)!;
    const out: L3If[] = [];
    for (const p of d.ports) {
      if (!p.ip || this.portMode(d, p) !== "routed") continue;
      const cidr = parseCidr(p.ip);
      if (!cidr) continue;
      out.push({ dev: devId, name: p.name, cidr, mac: this.macOf(devId, p.name), kind: "port", up: this.linkUp(devId, p.name), aclIn: p.aclIn, aclOut: p.aclOut });
    }
    // L3 switches route between SVIs; an L2 switch's SVI is just its management address.
    if (this.isSwitch(d)) {
      for (const s of d.svis ?? []) {
        const cidr = parseCidr(s.ip);
        if (!cidr) continue;
        out.push({ dev: devId, name: `Vlan${s.vlan}`, cidr, mac: this.sviMac(devId), kind: "svi", vlan: s.vlan, up: this.sviUp(d, s.vlan), aclIn: s.aclIn, aclOut: s.aclOut });
      }
    }
    return out;
  }

  routes(devId: string): RouteEntry[] {
    const d = this.devs.get(devId)!;
    const ifs = this.l3Ifs(devId).filter((i) => i.up);
    const out: RouteEntry[] = [];
    for (const i of ifs) {
      out.push({ code: "C", prefix: cidrNet(i.cidr), cidr: { ...i.cidr, ip: cidrNet(i.cidr).split("/")[0] }, iface: i.name });
      if (i.cidr.len < 32) out.push({ code: "L", prefix: `${i.cidr.ip}/32`, cidr: parseCidr(`${i.cidr.ip}/32`)!, iface: i.name });
    }
    if (!this.isHost(d)) {
      for (const r of d.routes ?? []) {
        const c = parseCidr(r.prefix);
        // A static route is installed only if its next hop is reachable via a connected network.
        const egress = ifs.find((i) => inCidr(r.via, i.cidr));
        // A connected route (AD 0) beats a static (AD 1) for the same prefix.
        const shadowed = c && out.some((x) => x.code === "C" && x.cidr.net === c.net && x.cidr.len === c.len);
        if (c && egress && !shadowed) out.push({ code: "S", prefix: cidrNet(c), cidr: c, via: r.via, iface: egress.name });
      }
      // OSPF (AD 110) only fills prefixes that connected and static routes don't already own.
      for (const r of this.ospf().routes.get(devId) ?? []) {
        if (!out.some((x) => x.code !== "L" && x.prefix === r.prefix)) out.push(r);
      }
    }
    return out;
  }

  ospf(): OspfResult {
    if (!this.ospfCache) this.ospfCache = computeOspf(this);
    return this.ospfCache;
  }

  /** Where would this device send a packet for `dst`? */
  resolve(devId: string, dst: string): { iface: L3If; nextHop: string; why: string } | { error: string } {
    const d = this.devs.get(devId)!;
    if (d.off) return { error: `${devId} is powered off` };
    const ifs = this.l3Ifs(devId).filter((i) => i.up);
    if (d.kind === "switch") {
      const local = ifs.find((i) => inCidr(dst, i.cidr));
      if (local) return { iface: local, nextHop: dst, why: `${dst} is on my management subnet ${cidrNet(local.cidr)}` };
      const viaIf = d.gateway ? ifs.find((i) => inCidr(d.gateway!, i.cidr)) : undefined;
      if (!viaIf) return { error: ifs.length ? `${dst} is off-subnet and no usable 'ip default-gateway' is set` : "no management SVI is up" };
      return { iface: viaIf, nextHop: d.gateway!, why: `${dst} is off-subnet, so I use my ip default-gateway ${d.gateway}` };
    }
    if (this.isHost(d)) {
      const nic = ifs[0];
      if (!nic) return { error: "NIC is down or has no IP address" };
      if (inCidr(dst, nic.cidr)) return { iface: nic, nextHop: dst, why: `${dst} is on my subnet ${cidrNet(nic.cidr)}, so I deliver it directly` };
      if (!d.gateway) return { error: `${dst} is off-subnet and no default gateway is set` };
      if (!inCidr(d.gateway, nic.cidr)) return { error: `default gateway ${d.gateway} is not on my subnet ${cidrNet(nic.cidr)}` };
      return { iface: nic, nextHop: d.gateway, why: `${dst} is off-subnet, so I send it to my default gateway ${d.gateway}` };
    }
    let best: RouteEntry | null = null;
    for (const r of this.routes(devId)) {
      if (r.code === "L" && r.cidr.ip !== dst) continue;
      if (inCidr(dst, r.cidr) && (!best || r.cidr.len > best.cidr.len)) best = r;
    }
    if (!best) return { error: `no route to ${dst} in the routing table` };
    if (best.iface === "Null0") return { error: `the longest match is OSPF summary ${best.prefix} pointing to Null0 (the discard route an ABR installs for an area range), so the packet is discarded` };
    const iface = ifs.find((i) => i.name === best!.iface)!;
    const nextHop = best.via ?? dst;
    const label =
      best.code === "S"
        ? `static route ${best.prefix} via ${best.via}`
        : best.code === "C"
          ? `connected network ${best.prefix}`
          : `OSPF route ${best.code} ${best.prefix} [110/${best.metric}] via ${best.via}`;
    return { iface, nextHop, why: `longest match is ${label}, out ${iface.name}` };
  }

  // --- spanning tree ---------------------------------------------------------

  stp(vlan: number): StpView {
    const hit = this.stpCache.get(vlan);
    if (hit) return hit;
    const sws = this.topo.devices.filter((d) => this.isSwitch(d));
    const bridgeId: StpView["bridgeId"] = {};
    for (const s of sws) bridgeId[s.id] = { prio: (s.stpVlanPriority?.[vlan] ?? s.stpPriority ?? 32768) + vlan, mac: this.bridgeMac(s.id) };
    const cmpBid = (a: string, b: string) => bridgeId[a].prio - bridgeId[b].prio || bridgeId[a].mac.localeCompare(bridgeId[b].mac);
    const pIdx = (dev: string, port: string) => this.devs.get(dev)!.ports.findIndex((p) => p.name === port);

    // Switch-to-switch adjacencies that carry this VLAN.
    type Edge = { a: string; pa: string; b: string; pb: string };
    const edges: Edge[] = [];
    const vlanPorts: [string, string][] = [];
    for (const s of sws) {
      for (const p of s.ports) {
        if (this.portMode(s, p) === "routed" || !this.linkUp(s.id, p.name) || !this.carries(s, p, vlan)) continue;
        vlanPorts.push([s.id, p.name]);
        const peer = this.peer(s.id, p.name)!;
        const pd = this.devs.get(peer[0])!;
        const pp = this.port(peer[0], peer[1])!;
        if (this.isSwitch(pd) && this.portMode(pd, pp) !== "routed" && this.carries(pd, pp, vlan) && s.id < pd.id) {
          edges.push({ a: s.id, pa: p.name, b: pd.id, pb: peer[1] });
        }
      }
    }
    const adj = new Map<string, Edge[]>();
    for (const e of edges) {
      adj.set(e.a, [...(adj.get(e.a) ?? []), e]);
      adj.set(e.b, [...(adj.get(e.b) ?? []), e]);
    }

    // Components → root bridge → path cost (unit costs, so BFS is shortest path).
    const rootOf: Record<string, string> = {};
    const cost: Record<string, number> = {};
    for (const s of sws) {
      if (rootOf[s.id]) continue;
      const comp: string[] = [];
      const stack = [s.id];
      const seen = new Set(stack);
      while (stack.length) {
        const x = stack.pop()!;
        comp.push(x);
        for (const e of adj.get(x) ?? []) {
          const y = e.a === x ? e.b : e.a;
          if (!seen.has(y)) {
            seen.add(y);
            stack.push(y);
          }
        }
      }
      const root = comp.slice().sort(cmpBid)[0];
      for (const x of comp) rootOf[x] = root;
      cost[root] = 0;
      const q = [root];
      while (q.length) {
        const x = q.shift()!;
        for (const e of adj.get(x) ?? []) {
          const y = e.a === x ? e.b : e.a;
          if (cost[y] === undefined) {
            cost[y] = cost[x] + STP_COST;
            q.push(y);
          }
        }
      }
    }

    const roles: Record<string, StpRole> = {};
    for (const [d, p] of vlanPorts) roles[`${d}|${p}`] = "desig"; // edge ports and default
    // Root port: best (root cost via neighbour, neighbour BID, neighbour port, own port).
    for (const s of sws) {
      if (rootOf[s.id] === s.id || !adj.get(s.id)) continue;
      let best: { port: string; key: [number, string, number, number] } | null = null;
      for (const e of adj.get(s.id)!) {
        const [me, mp, nb, np] = e.a === s.id ? [e.a, e.pa, e.b, e.pb] : [e.b, e.pb, e.a, e.pa];
        const key: [number, string, number, number] = [cost[nb] + STP_COST, `${String(bridgeId[nb].prio).padStart(6, "0")}${bridgeId[nb].mac}`, pIdx(nb, np), pIdx(me, mp)];
        const better =
          !best ||
          key[0] < best.key[0] ||
          (key[0] === best.key[0] && (key[1] < best.key[1] || (key[1] === best.key[1] && (key[2] < best.key[2] || (key[2] === best.key[2] && key[3] < best.key[3])))));
        if (better) best = { port: mp, key };
      }
      if (best) roles[`${s.id}|${best.port}`] = "root";
    }
    // Designated port per segment; the loser is alternate unless it is a root port.
    for (const e of edges) {
      const ka = [cost[e.a], bridgeId[e.a].prio, bridgeId[e.a].mac, pIdx(e.a, e.pa)] as const;
      const kb = [cost[e.b], bridgeId[e.b].prio, bridgeId[e.b].mac, pIdx(e.b, e.pb)] as const;
      const aWins = ka[0] !== kb[0] ? ka[0] < kb[0] : ka[1] !== kb[1] ? ka[1] < kb[1] : ka[2] !== kb[2] ? ka[2] < kb[2] : ka[3] < kb[3];
      const [wd, wp, ld, lp] = aWins ? [e.a, e.pa, e.b, e.pb] : [e.b, e.pb, e.a, e.pa];
      roles[`${wd}|${wp}`] = "desig";
      if (roles[`${ld}|${lp}`] !== "root") roles[`${ld}|${lp}`] = "alt";
    }

    const view: StpView = { vlan, rootOf, cost, roles, bridgeId };
    this.stpCache.set(vlan, view);
    return view;
  }

  forwarding(dev: string, port: string, vlan: number) {
    return this.stp(vlan).roles[`${dev}|${port}`] !== "alt";
  }

  /** All VLANs present anywhere in the topology. */
  vlans(): number[] {
    const s = new Set<number>();
    for (const d of this.topo.devices) {
      if (!this.isSwitch(d)) continue;
      for (const p of d.ports) {
        if (this.portMode(d, p) === "access") s.add(p.vlan ?? 1);
        if (this.portMode(d, p) === "trunk") (p.allowed ?? []).forEach((v) => s.add(v));
      }
      for (const v of d.svis ?? []) s.add(v.vlan);
    }
    return [...s].sort((a, b) => a - b);
  }

  // --- event plumbing ---------------------------------------------------------

  private dir(frame: Frame): SimEvent["dir"] {
    if (frame.arp) return "ctl";
    if (!frame.ip) return "ctl";
    return frame.ip.icmp.type === "echo-request" ? "out" : "back";
  }

  private log(e: Omit<SimEvent, "id" | "probe" | "dir" | "frame"> & { frame: Frame }) {
    // Sentences are assembled from fragments; capitalise each one for reading.
    const note = e.note.replace(/(^|\. )([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
    this.events.push({ ...e, note, frame: structuredClone(e.frame), id: this.eventId++, probe: this.probe, dir: this.dir(e.frame) });
  }

  private transmit(dev: string, port: string, frame: Frame, tag?: number) {
    const peer = this.peer(dev, port);
    if (!peer || !this.linkUp(dev, port)) {
      this.log({ dev, kind: "drop", frame, note: `${port} is down, so the frame cannot leave` });
      return;
    }
    if (/^Po\d+$/.test(port)) {
      const m = this.pickMember(dev, port, frame)!;
      this.log({ dev, kind: "tx", wire: { from: [dev, m[0]], to: [peer[0], m[1]] }, frame, tag, note: `${dev} ${port} (member ${m[0]}, chosen by the src/dst MAC hash) → ${peer[0]} ${peer[1]}${tag ? ` (802.1Q tag ${tag})` : ""}` });
      this.queue.push({ dev: peer[0], port: peer[1], frame, tag });
      return;
    }
    this.log({ dev, kind: "tx", wire: { from: [dev, port], to: peer }, frame, tag, note: `${dev} ${port} → ${peer[0]} ${peer[1]}${tag ? ` (802.1Q tag ${tag})` : ""}` });
    this.queue.push({ dev: peer[0], port: peer[1], frame, tag });
  }

  // --- layer 2 ---------------------------------------------------------------

  private rxSwitchPort(d: Device, port: Port, frame: Frame, tag?: number) {
    const mode = this.portMode(d, port);
    let vlan: number;
    if (mode === "access") {
      if (tag !== undefined) {
        this.log({ dev: d.id, kind: "drop", frame, note: `a frame tagged for VLAN ${tag} arrived on access port ${port.name}. The two ends disagree on trunk vs access, so the frame is dropped` });
        return;
      }
      vlan = port.vlan ?? 1;
    } else {
      vlan = tag ?? port.native ?? 1;
      if (!this.carries(d, port, vlan)) {
        this.log({ dev: d.id, kind: "drop", frame, note: `VLAN ${vlan} is not in the allowed list on trunk ${port.name}, so the frame is dropped` });
        return;
      }
    }
    if (!this.forwarding(d.id, port.name, vlan)) {
      this.log({ dev: d.id, kind: "filter", frame, note: `${port.name} is an STP alternate port (blocking) for VLAN ${vlan}. This is how spanning tree breaks the loop` });
      return;
    }
    const table = this.macTables.get(d.id) ?? new Map();
    this.macTables.set(d.id, table);
    const known = table.get(`${vlan}|${frame.src}`);
    table.set(`${vlan}|${frame.src}`, { port: port.name, vlan, mac: frame.src });
    this.l2Switch(d, vlan, frame, port.name, known ? null : `learned ${frame.src} on ${port.name} in VLAN ${vlan}`);
  }

  private l2Switch(d: Device, vlan: number, frame: Frame, inPort: string | null, learned: string | null) {
    const pre = learned ? `${learned}. ` : "";
    const sviMac = d.svis?.length ? this.sviMac(d.id) : null;
    const svi = d.svis?.find((s) => s.vlan === vlan) && this.sviUp(d, vlan) ? this.l3Ifs(d.id).find((i) => i.name === `Vlan${vlan}`) : undefined;

    if (inPort && sviMac && frame.dst === sviMac) {
      if (!svi) {
        this.log({ dev: d.id, kind: "drop", frame, note: `${pre}the frame is for interface Vlan${vlan}, but that SVI is down or missing` });
        return;
      }
      this.log({ dev: d.id, kind: "proc", frame, note: `${pre}the destination MAC is my own SVI (Vlan${vlan}), so it goes up to the routing engine` });
      this.rxL3(d, svi, frame);
      return;
    }

    const table = this.macTables.get(d.id) ?? new Map();
    const hit = frame.dst !== BCAST ? table.get(`${vlan}|${frame.dst}`) : undefined;
    const ok = (p: Port) => p.name !== inPort && this.portMode(d, p) !== "routed" && this.linkUp(d.id, p.name) && this.carries(d, p, vlan) && this.forwarding(d.id, p.name, vlan);
    const tagFor = (p: Port) => (this.portMode(d, p) === "trunk" && vlan !== (p.native ?? 1) ? vlan : undefined);

    if (hit) {
      if (hit.port === inPort) {
        this.log({ dev: d.id, kind: "filter", frame, note: `${pre}${frame.dst} is on the port the frame came in on, so it is filtered` });
        return;
      }
      const p = d.ports.find((x) => x.name === hit.port)!;
      this.log({ dev: d.id, kind: "proc", frame, note: `${pre}the MAC table says ${frame.dst} is on ${hit.port} (VLAN ${vlan}), so the frame is forwarded only there` });
      this.transmit(d.id, p.name, frame, tagFor(p));
      return;
    }

    const outs = d.ports.filter(ok);
    const why = frame.dst === BCAST ? "a broadcast" : `${frame.dst} is unknown (not in the MAC table)`;
    this.log({
      dev: d.id,
      kind: "proc",
      frame,
      note: `${pre}${why}, so the frame is flooded out every forwarding port in VLAN ${vlan}${outs.length ? `: ${outs.map((p) => p.name).join(", ")}` : " (there are none)"}${svi && frame.dst === BCAST ? `, and also to my own Vlan${vlan}` : ""}`,
    });
    if (svi && inPort && frame.dst === BCAST) this.rxL3(d, svi, frame);
    for (const p of outs) this.transmit(d.id, p.name, frame, tagFor(p));
  }

  // --- layer 3 ---------------------------------------------------------------

  private rxL3(d: Device, ifc: L3If, frame: Frame) {
    if (frame.dst !== ifc.mac && frame.dst !== BCAST) {
      this.log({ dev: d.id, kind: "ignore", frame, note: `the destination MAC ${frame.dst} is not mine, so the frame is ignored` });
      return;
    }
    if (frame.arp) {
      const a = frame.arp;
      const natProxy = a.targetIp !== ifc.cidr.ip && this.natRole(d, ifc.name) === "outside" && inCidr(a.targetIp, ifc.cidr) && this.natGlobals(d).has(a.targetIp);
      if (a.targetIp !== ifc.cidr.ip && !natProxy) {
        this.log({ dev: d.id, kind: "ignore", frame, note: `the ARP is for ${a.targetIp}, which is not my address, so I ignore it` });
        return;
      }
      if (natProxy && a.op === "request") {
        this.learnArp(d.id, a.senderIp, a.senderMac, ifc.name);
        this.log({ dev: d.id, kind: "proc", frame, note: `"who has ${a.targetIp}?" That is a NAT global address I translate for, so I answer with my own MAC ${ifc.mac} on ${ifc.name}` });
        this.emit(d, ifc, { src: ifc.mac, dst: a.senderMac, arp: { op: "reply", senderIp: a.targetIp, senderMac: ifc.mac, targetIp: a.senderIp, targetMac: a.senderMac } });
        return;
      }
      this.learnArp(d.id, a.senderIp, a.senderMac, ifc.name);
      if (a.op === "request") {
        this.log({ dev: d.id, kind: "proc", frame, note: `"who has ${a.targetIp}?" That is me. I cache ${a.senderIp} → ${a.senderMac} and reply with my MAC ${ifc.mac}` });
        const reply: Frame = { src: ifc.mac, dst: a.senderMac, arp: { op: "reply", senderIp: ifc.cidr.ip, senderMac: ifc.mac, targetIp: a.senderIp, targetMac: a.senderMac } };
        this.emit(d, ifc, reply);
      } else {
        this.log({ dev: d.id, kind: "deliver", frame, note: `ARP reply: ${a.senderIp} is at ${a.senderMac}. Cached` });
        this.flushPending(d, a.senderIp);
      }
      return;
    }
    if (!frame.ip) return;
    let pkt = frame.ip;
    if (ifc.aclIn && !this.aclPermits(d, ifc.aclIn, pkt, `inbound on ${ifc.name}`, frame)) return;
    // Outside → inside: NAT happens before routing.
    if (d.nat && this.natRole(d, ifc.name) === "outside") pkt = this.natIn(d, pkt, frame);

    const mine = this.l3Ifs(d.id).some((i) => i.up && i.cidr.ip === pkt.dst);
    if (mine) {
      this.deliver(d, pkt, frame);
      return;
    }
    if (this.isHost(d) || d.kind === "switch") {
      this.log({ dev: d.id, kind: "drop", frame, note: `the packet is for ${pkt.dst}, not me, and ${d.kind === "switch" ? "a Layer 2 switch" : "a host"} does not route, so it is dropped` });
      return;
    }
    if (pkt.ttl <= 1) {
      this.log({ dev: d.id, kind: "drop", frame, note: `TTL expired (${pkt.ttl}). I drop it and send ICMP time-exceeded back to ${pkt.src}. This is what traceroute relies on` });
      this.icmpError(d, pkt, "time-exceeded", ifc.cidr.ip);
      return;
    }
    const r = this.resolve(d.id, pkt.dst);
    if ("error" in r) {
      this.log({ dev: d.id, kind: "drop", frame, note: `${r.error}. Dropped, and ICMP unreachable is sent to ${pkt.src}` });
      this.icmpError(d, pkt, "unreachable", ifc.cidr.ip);
      return;
    }
    let fwd: Pkt = { ...pkt, ttl: pkt.ttl - 1 };
    this.log({ dev: d.id, kind: "proc", frame, note: `routing ${pkt.src} → ${pkt.dst}: ${r.why}. TTL ${pkt.ttl} → ${fwd.ttl}, and the frame gets new MAC addresses` });
    // Inside → outside: NAT happens after routing, before the outbound ACL.
    if (d.nat && this.natRole(d, ifc.name) === "inside" && this.natRole(d, r.iface.name) === "outside") {
      const t = this.natOut(d, fwd, frame);
      if (!t) return;
      fwd = t;
    }
    if (r.iface.aclOut && !this.aclPermits(d, r.iface.aclOut, fwd, `outbound on ${r.iface.name}`, frame)) return;
    this.sendVia(d, r.iface, r.nextHop, fwd);
  }

  // --- NAT -----------------------------------------------------------------------

  natRole(d: Device, ifName: string): "inside" | "outside" | undefined {
    if (ifName.startsWith("Vlan")) return d.svis?.find((s) => `Vlan${s.vlan}` === ifName)?.nat;
    return d.ports.find((p) => p.name === ifName)?.nat;
  }

  /** Addresses this device owns as NAT globals: static globals and pool addresses. */
  natGlobals(d: Device): Set<string> {
    const out = new Set<string>();
    for (const r of d.nat?.rules ?? []) if (r.kind === "static") out.add(r.global);
    for (const p of d.nat?.pools ?? []) for (let n = ipToInt(p.start); n <= ipToInt(p.end) && n - ipToInt(p.start) < 1024; n++) out.add(intToIp(n));
    return out;
  }

  /** Silent ACL check (NAT uses ACLs to select traffic, not to filter it). */
  aclMatch(d: Device, name: string, pkt: Pkt): boolean {
    for (const ace of d.acls?.[name] ?? []) {
      if ((ace.proto === "ip" || ace.proto === "icmp") && aclAddrMatch(ace.src, pkt.src) && aclAddrMatch(ace.dst, pkt.dst)) return ace.action === "permit";
    }
    return false;
  }

  private stat(dev: string, hit: boolean) {
    const s = this.natStats.get(dev) ?? { hits: 0, misses: 0 };
    if (hit) s.hits++;
    else s.misses++;
    this.natStats.set(dev, s);
  }

  /** Outside → inside: rewrite the destination from inside global back to inside local. */
  private natIn(d: Device, pkt: Pkt, frame: Frame): Pkt {
    const table = this.natTables.get(d.id) ?? [];
    let e = table.find((x) => x.insideGlobal === pkt.dst && (x.kind !== "pat" || x.globalId === pkt.icmp.id));
    if (!e) {
      const st = d.nat!.rules.find((r) => r.kind === "static" && r.global === pkt.dst);
      if (st && st.kind === "static") {
        e = { kind: "static", insideLocal: st.local, insideGlobal: st.global, hits: 0 };
        this.natTables.set(d.id, [...table, e]);
      }
    }
    if (!e) return pkt;
    e.hits++;
    this.stat(d.id, true);
    const out: Pkt = { ...pkt, dst: e.insideLocal, icmp: { ...pkt.icmp, id: e.kind === "pat" ? e.localId : pkt.icmp.id } };
    this.log({
      dev: d.id,
      kind: "proc",
      frame: { ...frame, ip: out },
      note: `NAT outside→inside, before routing: destination ${pkt.dst}${e.kind === "pat" ? `:${e.globalId}` : ""} (inside global) becomes ${e.insideLocal}${e.kind === "pat" ? `:${e.localId}` : ""} (inside local)`,
    });
    return out;
  }

  /** Inside → outside: find or create a translation and rewrite the source. Returns null when the packet must be dropped. */
  private natOut(d: Device, pkt: Pkt, frame: Frame): Pkt | null {
    const table = this.natTables.get(d.id) ?? [];
    this.natTables.set(d.id, table);
    const say = (e: NatEntry, how: string): Pkt => {
      e.hits++;
      e.outside = pkt.dst;
      this.stat(d.id, true);
      const out: Pkt = { ...pkt, src: e.insideGlobal, icmp: { ...pkt.icmp, id: e.kind === "pat" ? e.globalId : pkt.icmp.id } };
      this.log({
        dev: d.id,
        kind: "proc",
        frame: { ...frame, ip: out },
        note: `NAT inside→outside, after routing: source ${pkt.src}${e.kind === "pat" ? `:${pkt.icmp.id}` : ""} (inside local) becomes ${e.insideGlobal}${e.kind === "pat" ? `:${e.globalId}` : ""} (inside global), ${how}`,
      });
      return out;
    };
    // A static mapping always wins over dynamic translations for the same host.
    const st = d.nat!.rules.find((r) => r.kind === "static" && r.local === pkt.src);
    if (st && st.kind === "static") {
      let e = table.find((x) => x.kind === "static" && x.insideLocal === st.local);
      if (!e) table.push((e = { kind: "static", insideLocal: st.local, insideGlobal: st.global, hits: 0 }));
      return say(e, "from a static mapping");
    }
    const existing = table.find((x) => x.kind !== "static" && x.insideLocal === pkt.src && (x.kind !== "pat" || x.localId === pkt.icmp.id));
    if (existing) return say(existing, `using the existing ${existing.kind === "pat" ? "PAT" : existing.kind} translation`);

    for (const r of d.nat!.rules) {
      if (r.kind === "static") continue;
      if (!this.aclMatch(d, r.acl, pkt)) continue;
      let global: string | undefined;
      if (r.iface) {
        global = this.l3Ifs(d.id).find((i) => i.name === r.iface && i.up)?.cidr.ip;
        if (!global) {
          this.log({ dev: d.id, kind: "drop", frame, note: `NAT rule for ACL ${r.acl} overloads ${r.iface}, but that interface has no usable IP address. Translation failed, packet dropped` });
          this.stat(d.id, false);
          return null;
        }
      } else {
        const pool = d.nat!.pools.find((p) => p.name === r.pool);
        if (!pool) {
          this.log({ dev: d.id, kind: "drop", frame, note: `NAT rule for ACL ${r.acl} refers to pool ${r.pool}, which doesn't exist. Translation failed, packet dropped` });
          this.stat(d.id, false);
          return null;
        }
        const addrs: string[] = [];
        for (let n = ipToInt(pool.start); n <= ipToInt(pool.end) && addrs.length < 1024; n++) addrs.push(intToIp(n));
        if (r.overload) global = addrs[0];
        else {
          global = addrs.find((a) => !table.some((x) => x.insideGlobal === a));
          if (!global) {
            this.log({ dev: d.id, kind: "drop", frame, note: `NAT pool ${pool.name} is exhausted: all ${addrs.length} address${addrs.length > 1 ? "es are" : " is"} in use and the rule has no 'overload'. ${pkt.src} gets no translation, so the packet is dropped` });
            this.stat(d.id, false);
            return null;
          }
          const e: NatEntry = { kind: "dynamic", insideLocal: pkt.src, insideGlobal: global, hits: 0 };
          table.push(e);
          return say(e, `with a new one-to-one translation from pool ${pool.name}`);
        }
      }
      // PAT: keep the original identifier if it's free on this global address, else pick from 1024 up.
      const used = new Set(table.filter((x) => x.insideGlobal === global && x.kind === "pat").map((x) => x.globalId));
      let gid = pkt.icmp.id ?? 1;
      if (used.has(gid)) for (gid = 1024; used.has(gid); gid++);
      const e: NatEntry = { kind: "pat", insideLocal: pkt.src, insideGlobal: global!, localId: pkt.icmp.id, globalId: gid, hits: 0 };
      table.push(e);
      return say(e, `with a new PAT (overload) translation matched by ACL ${r.acl}`);
    }
    this.stat(d.id, false);
    this.log({ dev: d.id, kind: "proc", frame, note: `no NAT rule matches ${pkt.src}, so it leaves untranslated. A private source address usually means the reply can't come back` });
    return pkt;
  }

  private aclPermits(d: Device, name: string, pkt: Pkt, where: string, frame: Frame): boolean {
    const acl: Ace[] = d.acls?.[name] ?? [];
    for (let i = 0; i < acl.length; i++) {
      const ace = acl[i];
      if ((ace.proto === "ip" || ace.proto === "icmp") && aclAddrMatch(ace.src, pkt.src) && aclAddrMatch(ace.dst, pkt.dst)) {
        if (ace.action === "permit") return true;
        this.log({ dev: d.id, kind: "drop", frame, note: `ACL ${name} ${where}: line ${ace.seq ?? (i + 1) * 10} "${ace.action} ${ace.proto} ${ace.src} ${ace.dst}" matched. Denied` });
        return false;
      }
    }
    this.log({ dev: d.id, kind: "drop", frame, note: `ACL ${name} ${where}: nothing matched, so the implicit "deny any" at the end dropped it` });
    return false;
  }

  private deliver(d: Device, pkt: Pkt, frame: Frame) {
    if (pkt.icmp.type === "echo-request") {
      this.log({ dev: d.id, kind: "deliver", frame, note: `echo request #${pkt.icmp.seq} from ${pkt.src} reached me. Sending an echo reply` });
      this.originate(d, { src: pkt.dst, dst: pkt.src, ttl: 255, icmp: { type: "echo-reply", seq: pkt.icmp.seq, id: pkt.icmp.id } });
      return;
    }
    const msg =
      pkt.icmp.type === "echo-reply"
        ? `echo reply #${pkt.icmp.seq} from ${pkt.src}. Success (!)`
        : pkt.icmp.type === "time-exceeded"
          ? `time-exceeded from ${pkt.src}. A router on the path`
          : `destination unreachable from ${pkt.src} (U)`;
    this.log({ dev: d.id, kind: "deliver", frame, note: msg });
    if (d.id === this.probeSrc) this.probeHit = { mark: pkt.icmp.type === "unreachable" ? "U" : "!", from: pkt.src, icmp: pkt.icmp.type };
  }

  private icmpError(d: Device, about: Pkt, type: "time-exceeded" | "unreachable", srcIp: string) {
    if (about.icmp.type !== "echo-request") return; // never ICMP about ICMP errors/replies
    this.originate(d, { src: srcIp, dst: about.src, ttl: 255, icmp: { type, seq: about.icmp.seq } });
  }

  /** Locally generated packet: route it, then ARP + send. */
  private originate(d: Device, pkt: Pkt) {
    const frame: Frame = { src: "", dst: "", ip: pkt };
    // Traffic to one of my own addresses never touches the wire.
    if (this.l3Ifs(d.id).some((i) => i.up && i.cidr.ip === pkt.dst)) {
      this.log({ dev: d.id, kind: "proc", frame, note: `${pkt.dst} is my own address, so the packet is handled locally` });
      this.deliver(d, pkt, frame);
      return;
    }
    const r = this.resolve(d.id, pkt.dst);
    if ("error" in r) {
      this.log({ dev: d.id, kind: "drop", frame, note: `cannot send to ${pkt.dst}: ${r.error}` });
      return;
    }
    if (r.iface.aclOut && !this.aclPermits(d, r.iface.aclOut, pkt, `outbound on ${r.iface.name}`, frame)) return;
    this.log({ dev: d.id, kind: "proc", frame, note: r.why });
    this.sendVia(d, r.iface, r.nextHop, pkt);
  }

  private sendVia(d: Device, ifc: L3If, nextHop: string, pkt: Pkt) {
    const entry = this.arpTables.get(d.id)?.get(nextHop);
    if (entry) {
      this.emit(d, ifc, { src: ifc.mac, dst: entry.mac, ip: pkt });
      return;
    }
    const req: Frame = { src: ifc.mac, dst: BCAST, arp: { op: "request", senderIp: ifc.cidr.ip, senderMac: ifc.mac, targetIp: nextHop } };
    if (this.isHost(d)) {
      this.pending.set(d.id, [...(this.pending.get(d.id) ?? []), { nextHop, pkt, iface: ifc.name }]);
      this.log({ dev: d.id, kind: "proc", frame: req, note: `I have no ARP entry for ${nextHop}. The packet waits while I broadcast "who has ${nextHop}?"` });
    } else {
      this.log({
        dev: d.id,
        kind: "drop",
        frame: { src: ifc.mac, dst: "?", ip: pkt },
        note: `no ARP entry for next hop ${nextHop}. IOS drops this packet while it ARPs, which is why a router's first ping often shows "."`,
      });
    }
    this.emit(d, ifc, req);
  }

  private flushPending(d: Device, ip: string) {
    const list = this.pending.get(d.id) ?? [];
    const ready = list.filter((x) => x.nextHop === ip);
    this.pending.set(
      d.id,
      list.filter((x) => x.nextHop !== ip),
    );
    for (const x of ready) {
      const ifc = this.l3Ifs(d.id).find((i) => i.name === x.iface)!;
      this.log({ dev: d.id, kind: "proc", frame: { src: ifc.mac, dst: this.arpTables.get(d.id)!.get(ip)!.mac, ip: x.pkt }, note: `ARP resolved, so the queued packet goes now` });
      this.sendVia(d, ifc, ip, x.pkt);
    }
  }

  private learnArp(dev: string, ip: string, mac: string, iface: string) {
    const t = this.arpTables.get(dev) ?? new Map();
    t.set(ip, { mac, iface });
    this.arpTables.set(dev, t);
  }

  private emit(d: Device, ifc: L3If, frame: Frame) {
    if (ifc.kind === "port") this.transmit(d.id, ifc.name, frame);
    else this.l2Switch(d, ifc.vlan!, frame, null, null);
  }

  private run() {
    let guard = 0;
    while (this.queue.length) {
      if (++guard > 3000) {
        this.log({ dev: this.probeSrc, kind: "drop", frame: { src: "", dst: "" }, note: "simulation halted: too many frames. Is there a Layer 2 loop?" });
        this.queue = [];
        return;
      }
      const { dev, port, frame, tag } = this.queue.shift()!;
      const d = this.devs.get(dev)!;
      const p = d.ports.find((x) => x.name === port)!;
      if (this.isSwitch(d) && this.portMode(d, p) !== "routed") {
        this.rxSwitchPort(d, p, frame, tag);
      } else {
        const ifc = this.l3Ifs(dev).find((i) => i.name === port);
        if (!ifc) {
          this.log({ dev, kind: "drop", frame, note: `${port} has no IP address, so there is nothing to process the frame` });
          continue;
        }
        if (tag !== undefined) {
          this.log({ dev, kind: "drop", frame, note: `an 802.1Q-tagged frame arrived on a routed port. Missing subinterface or trunk mismatch` });
          continue;
        }
        this.rxL3(d, ifc, frame);
      }
    }
    // Hosts give up on packets whose ARP never resolved.
    for (const [dev, list] of this.pending) {
      for (const x of list) this.log({ dev, kind: "drop", frame: { src: "", dst: "", ip: x.pkt }, note: `ARP for ${x.nextHop} got no answer. The packet times out` });
      this.pending.set(dev, []);
    }
  }

  // --- public probes --------------------------------------------------------------

  private source(devId: string, dst: string): string | { error: string } {
    const r = this.resolve(devId, dst);
    if ("error" in r) return r;
    return r.iface.cidr.ip;
  }

  ping(src: string, dst: string, count = 4): { header: string; probes: ProbeResult[]; error?: string } {
    const s = this.source(src, dst);
    if (typeof s !== "string") return { header: `${src}: ${s.error}`, probes: [], error: s.error };
    const probes: ProbeResult[] = [];
    for (let seq = 1; seq <= count; seq++) {
      this.startProbe(src);
      this.originate(this.devs.get(src)!, { src: s, dst, ttl: 64, icmp: { type: "echo-request", seq, id: 1 } });
      this.run();
      probes.push({ seq, mark: this.probeHit?.icmp === "echo-reply" ? "!" : this.probeHit?.mark === "U" ? "U" : ".", from: this.probeHit?.from, events: this.events });
    }
    return { header: `ping ${dst} from ${src} (${s})`, probes };
  }

  traceroute(src: string, dst: string, maxHops = 12): { header: string; probes: ProbeResult[]; error?: string } {
    const s = this.source(src, dst);
    if (typeof s !== "string") return { header: `${src}: ${s.error}`, probes: [], error: s.error };
    const probes: ProbeResult[] = [];
    for (let ttl = 1; ttl <= maxHops; ttl++) {
      // Retry once, so a first-packet ARP drop does not show up as a missing hop.
      let hit: typeof this.probeHit = null;
      let evs: SimEvent[] = [];
      for (let attempt = 0; attempt < 2 && !hit; attempt++) {
        this.startProbe(src);
        this.originate(this.devs.get(src)!, { src: s, dst, ttl, icmp: { type: "echo-request", seq: ttl } });
        this.run();
        hit = this.probeHit;
        evs = [...evs, ...this.events];
      }
      probes.push({ seq: ttl, mark: hit ? (hit.mark === "U" ? "U" : "!") : ".", from: hit?.from, events: evs });
      if (!hit || hit.icmp !== "time-exceeded") break;
    }
    return { header: `traceroute ${dst} from ${src} (${s})`, probes };
  }

  private startProbe(src: string) {
    this.probe++;
    this.events = [];
    this.queue = [];
    this.probeSrc = src;
    this.probeHit = null;
  }

  /** Every IPv4 address in the topology, for destination pickers. */
  addresses(): { dev: string; ip: string; iface: string }[] {
    return this.topo.devices.flatMap((d) => this.l3Ifs(d.id).map((i) => ({ dev: d.id, ip: i.cidr.ip, iface: i.name })));
  }
}
