// VXLAN EVPN Lab: a converged-state model of a two-spine, multi-leaf NX-OS VXLAN BGP EVPN fabric
// (DCCOR 1.3). Underlay OSPF (adjacency needs matching MTU), loopbacks advertised into OSPF, iBGP
// EVPN sessions from leaves to route-reflector spines, route targets (auto = ASN:VNI), extended
// communities, NVE with host-reachability BGP, L2VNIs, an L3VNI per tenant VRF for symmetric IRB,
// and distributed anycast gateway SVIs. `evaluate` derives OSPF and BGP state, which EVPN routes
// each leaf imports, NVE peers, and host-to-host reachability with the reason for any failure.

export type EIntf = {
  /** "Ethernet1/49", "loopback0", "Vlan10", "nve1" */
  name: string;
  mtu: number;
  shutdown?: boolean;
  /** "10.0.0.11/32" */
  ip?: string;
  /** OSPF area when `ip router ospf <tag> area <a>` is configured */
  ospf?: string;
  vrf?: string;
  anycast?: boolean;
  ipForward?: boolean;
};

export type NveMember = { vni: number; l3?: boolean; ir?: boolean; suppressArp?: boolean };
export type Nve = { shutdown?: boolean; source?: string; hostReachBgp: boolean; members: NveMember[] };
/** Route targets: "auto" or explicit "ASN:NN". */
export type EvpnVni = { vni: number; imp: string[]; exp: string[] };
export type EVrf = { name: string; vni?: number; imp: string[]; exp: string[] };
export type Nbr = { ip: string; remoteAs?: number; updateSource?: string; evpn: boolean; sendExt: boolean; rrClient?: boolean };

export type ESwitch = {
  id: string;
  role: "leaf" | "spine";
  asn: number;
  features: { ospf: boolean; bgp: boolean; nvOverlay: boolean; vnSegment: boolean; interfaceVlan: boolean; fabricForwarding: boolean };
  nvOverlayEvpn: boolean;
  anycastMac?: string;
  vlans: { id: number; vni?: number }[];
  intfs: EIntf[];
  nve?: Nve;
  evpn: EvpnVni[];
  vrfs: EVrf[];
  nbrs: Nbr[];
  ospfTag: string;
};

export type EHost = { id: string; label: string; leaf: string; port: string; vlan: number; ip: string; mac: string };
export type EFabric = { switches: ESwitch[]; links: [[string, string], [string, string]][]; hosts: EHost[] };

export type OspfAdj = { a: [string, string]; b: [string, string]; state: "FULL" | "EXSTART" | "DOWN"; why?: string };
export type BgpSess = { leaf: string; spine: string; up: boolean; why?: string };
export type EvpnRoute = { type: 2 | 3; origin: string; vni: number; l3vni?: number; mac?: string; ip?: string; nh: string; rts: string[] };
export type Imported = { leaf: string; route: EvpnRoute; via: string[]; l2: boolean; l3: boolean };
export type Verdict = { ok: boolean; why: string };

export type EvpnResult = {
  adj: OspfAdj[];
  /** switch id → set of switch ids reachable in the underlay */
  reach: Record<string, string[]>;
  bgp: BgpSess[];
  routes: EvpnRoute[];
  imported: Imported[];
  /** leaf → peers (switch ids) with an NVE peering */
  nvePeers: Record<string, { peer: string; ip: string; up: boolean }[]>;
  originates: Record<string, string>;
};

export const VXLAN_OVERHEAD = 50;
const ipOnly = (cidr?: string) => cidr?.split("/")[0];
export const intf = (s: ESwitch, n: string) => s.intfs.find((i) => i.name.toLowerCase() === n.toLowerCase());
export const lo = (s: ESwitch, n: 0 | 1) => intf(s, `loopback${n}`);
export const loIp = (s: ESwitch, n: 0 | 1) => ipOnly(lo(s, n)?.ip);
const resolveRt = (s: ESwitch, rts: string[], vni: number) => rts.map((r) => (r === "auto" ? `${s.asn}:${vni}` : r));
export const vniOfVlan = (s: ESwitch, vlan: number) => s.vlans.find((v) => v.id === vlan)?.vni;
export const vlanOfVni = (s: ESwitch, vni: number) => s.vlans.find((v) => v.vni === vni)?.id;

function inSubnet(ip: string, cidr: string) {
  const [net, len] = cidr.split("/");
  const n = (x: string) => x.split(".").reduce((a, o) => a * 256 + +o, 0);
  const mask = +len === 0 ? 0 : (0xffffffff << (32 - +len)) >>> 0;
  return ((n(ip) & mask) >>> 0) === ((n(net) & mask) >>> 0);
}

/** NVE is operational and can advertise EVPN routes. */
export function nveState(s: ESwitch): { up: boolean; why: string; src?: string } {
  if (s.role !== "leaf") return { up: false, why: "not a VTEP" };
  if (!s.features.nvOverlay) return { up: false, why: "feature nv overlay is off" };
  if (!s.nve) return { up: false, why: "no interface nve1" };
  if (s.nve.shutdown) return { up: false, why: "nve1 is shut down" };
  const src = s.nve.source ? intf(s, s.nve.source) : undefined;
  if (!src?.ip) return { up: false, why: "nve1 has no source-interface with an IP address" };
  if (src.shutdown) return { up: false, why: `${src.name} (the NVE source) is shut down` };
  return { up: true, why: "up", src: ipOnly(src.ip) };
}

export function evaluate(f: EFabric): EvpnResult {
  const sw = (id: string) => f.switches.find((s) => s.id === id)!;

  // Underlay OSPF adjacencies on fabric links.
  const adj: OspfAdj[] = f.links.map(([a, b]) => {
    const sa = sw(a[0]);
    const sb = sw(b[0]);
    const ia = intf(sa, a[1])!;
    const ib = intf(sb, b[1])!;
    const r = (state: OspfAdj["state"], why?: string): OspfAdj => ({ a, b, state, why });
    if (ia.shutdown || ib.shutdown) return r("DOWN", "a link end is shut down");
    if (!sa.features.ospf || !sb.features.ospf) return r("DOWN", `feature ospf is off on ${!sa.features.ospf ? sa.id : sb.id}`);
    if (!ia.ospf || !ib.ospf) return r("DOWN", `OSPF isn't enabled on ${!ia.ospf ? `${sa.id} ${ia.name}` : `${sb.id} ${ib.name}`}`);
    if (ia.ospf !== ib.ospf) return r("DOWN", `area mismatch (${ia.ospf} vs ${ib.ospf})`);
    if (ia.mtu !== ib.mtu) return r("EXSTART", `interface MTU mismatch (${sa.id} ${ia.mtu}, ${sb.id} ${ib.mtu}): DBD packets are rejected`);
    return r("FULL");
  });

  // Underlay reachability between switches, and which loopbacks each advertises.
  const reach: Record<string, string[]> = {};
  for (const s of f.switches) {
    const seen = new Set([s.id]);
    const q = [s.id];
    while (q.length) {
      const x = q.shift()!;
      for (const l of adj) {
        if (l.state !== "FULL") continue;
        const y = l.a[0] === x ? l.b[0] : l.b[0] === x ? l.a[0] : null;
        if (y && !seen.has(y)) (seen.add(y), q.push(y));
      }
    }
    reach[s.id] = [...seen];
  }
  /** Can `from` route to `ip` (a loopback somewhere) in the underlay? */
  const canReach = (from: string, ip?: string) => {
    if (!ip) return false;
    const owner = f.switches.find((s) => s.intfs.some((i) => ipOnly(i.ip) === ip && i.name.startsWith("loopback")));
    if (!owner) return false;
    if (owner.id === from) return true;
    const l = owner.intfs.find((i) => ipOnly(i.ip) === ip)!;
    return !l.shutdown && !!l.ospf && reach[from].includes(owner.id);
  };

  // iBGP EVPN sessions leaf ↔ spine.
  const bgp: BgpSess[] = [];
  for (const leaf of f.switches.filter((s) => s.role === "leaf"))
    for (const spine of f.switches.filter((s) => s.role === "spine")) {
      const nl = leaf.nbrs.find((n) => n.ip === loIp(spine, 0));
      const ns = spine.nbrs.find((n) => n.ip === loIp(leaf, 0));
      const r = (up: boolean, why?: string) => bgp.push({ leaf: leaf.id, spine: spine.id, up, why });
      if (!nl && !ns) continue;
      if (!leaf.features.bgp || !spine.features.bgp) r(false, "feature bgp is off");
      else if (!nl || !ns) r(false, `${!nl ? leaf.id : spine.id} has no neighbor statement for the other`);
      else if (nl.remoteAs !== spine.asn || ns.remoteAs !== leaf.asn) r(false, "remote-as doesn't match the peer's AS");
      else if (!canReach(leaf.id, loIp(spine, 0)) || !canReach(spine.id, loIp(leaf, 0))) r(false, "loopback0 isn't reachable in the underlay");
      else if (nl.updateSource !== "loopback0" || ns.updateSource !== "loopback0") r(false, `update-source loopback0 is missing on ${nl.updateSource !== "loopback0" ? leaf.id : spine.id}, so it sources the session from the link address the peer doesn't expect`);
      else if (!nl.evpn || !ns.evpn) r(false, "the l2vpn evpn address family isn't activated on both sides");
      else r(true);
    }

  // EVPN route origination.
  const routes: EvpnRoute[] = [];
  const originates: Record<string, string> = {};
  for (const leaf of f.switches.filter((s) => s.role === "leaf")) {
    const st = nveState(leaf);
    if (!st.up) {
      originates[leaf.id] = `NVE down: ${st.why}`;
      continue;
    }
    if (!leaf.nve!.hostReachBgp) {
      originates[leaf.id] = "host-reachability protocol bgp isn't configured, so the VTEP runs flood-and-learn and advertises nothing in EVPN";
      continue;
    }
    if (!leaf.nvOverlayEvpn) {
      originates[leaf.id] = "nv overlay evpn isn't configured";
      continue;
    }
    originates[leaf.id] = "advertising";
    const l3vniFor = (vlan: number) => {
      const svi = intf(leaf, `Vlan${vlan}`);
      const vrf = svi?.vrf ? leaf.vrfs.find((v) => v.name === svi.vrf) : undefined;
      if (!vrf?.vni || !leaf.nve!.members.some((m) => m.vni === vrf.vni && m.l3) || !vlanOfVni(leaf, vrf.vni)) return undefined;
      return vrf;
    };
    for (const m of leaf.nve!.members.filter((x) => !x.l3)) {
      if (!vlanOfVni(leaf, m.vni)) continue;
      const ev = leaf.evpn.find((e) => e.vni === m.vni);
      const exp = ev ? resolveRt(leaf, ev.exp, m.vni) : [];
      routes.push({ type: 3, origin: leaf.id, vni: m.vni, nh: st.src!, rts: exp });
      for (const h of f.hosts.filter((x) => x.leaf === leaf.id && vniOfVlan(leaf, x.vlan) === m.vni)) {
        const vrf = l3vniFor(h.vlan);
        routes.push({ type: 2, origin: leaf.id, vni: m.vni, l3vni: vrf?.vni, mac: h.mac, ip: ipOnly(h.ip), nh: st.src!, rts: [...exp, ...(vrf ? resolveRt(leaf, vrf.exp, vrf.vni!) : [])] });
      }
    }
  }

  // Propagation through the route-reflector spines, and import.
  const imported: Imported[] = [];
  for (const leaf of f.switches.filter((s) => s.role === "leaf")) {
    for (const r of routes.filter((x) => x.origin !== leaf.id)) {
      const via: string[] = [];
      let rts: string[] = [];
      for (const spine of f.switches.filter((s) => s.role === "spine")) {
        const inS = bgp.find((b) => b.leaf === r.origin && b.spine === spine.id && b.up);
        const outS = bgp.find((b) => b.leaf === leaf.id && b.spine === spine.id && b.up);
        if (!inS || !outS) continue;
        const fromNbr = spine.nbrs.find((n) => n.ip === loIp(sw(r.origin), 0))!;
        const toNbr = spine.nbrs.find((n) => n.ip === loIp(leaf, 0))!;
        // Routes from a non-client are reflected only to clients; between clients, always.
        if (!fromNbr.rrClient && !toNbr.rrClient) continue;
        const originSendExt = sw(r.origin).nbrs.find((n) => n.ip === loIp(spine, 0))!.sendExt;
        via.push(spine.id);
        if (originSendExt && toNbr.sendExt) rts = [...new Set([...rts, ...r.rts])];
      }
      if (!via.length) continue;
      const l2vlan = vlanOfVni(leaf, r.vni);
      const member = leaf.nve?.members.find((m) => m.vni === r.vni && !m.l3);
      const ev = leaf.evpn.find((e) => e.vni === r.vni);
      const l2 = !!(l2vlan && member && ev && resolveRt(leaf, ev.imp, r.vni).some((x) => rts.includes(x)));
      let l3 = false;
      if (r.type === 2 && r.l3vni) {
        const vrf = leaf.vrfs.find((v) => v.vni === r.l3vni);
        l3 = !!(vrf && leaf.nve?.members.some((m) => m.vni === r.l3vni && m.l3) && vlanOfVni(leaf, r.l3vni) && resolveRt(leaf, vrf.imp, vrf.vni!).some((x) => rts.includes(x)));
      }
      imported.push({ leaf: leaf.id, route: { ...r, rts }, via, l2, l3 });
    }
  }

  // NVE peers: learned from imported routes whose next hop is reachable.
  const nvePeers: EvpnResult["nvePeers"] = {};
  for (const leaf of f.switches.filter((s) => s.role === "leaf")) {
    const peers = new Map<string, { peer: string; ip: string; up: boolean }>();
    for (const im of imported.filter((x) => x.leaf === leaf.id && (x.l2 || x.l3))) peers.set(im.route.origin, { peer: im.route.origin, ip: im.route.nh, up: canReach(leaf.id, im.route.nh) && nveState(leaf).up });
    nvePeers[leaf.id] = [...peers.values()].sort((a, b) => a.peer.localeCompare(b.peer));
  }
  return { adj, reach, bgp, routes, imported, nvePeers, originates };
}

/** Smallest MTU on any equal-cost leaf-spine-leaf path between two leaves (the fabric uses them all). */
function pathMtu(f: EFabric, r: EvpnResult, a: string, b: string): { mtu: number; via: string } {
  let worst = { mtu: Infinity, via: "" };
  for (const spine of f.switches.filter((s) => s.role === "spine")) {
    const la = r.adj.find((x) => x.state === "FULL" && ((x.a[0] === a && x.b[0] === spine.id) || (x.b[0] === a && x.a[0] === spine.id)));
    const lb = r.adj.find((x) => x.state === "FULL" && ((x.a[0] === b && x.b[0] === spine.id) || (x.b[0] === b && x.a[0] === spine.id)));
    if (!la || !lb) continue;
    const m = (l: OspfAdj) => Math.min(intf(f.switches.find((s) => s.id === l.a[0])!, l.a[1])!.mtu, intf(f.switches.find((s) => s.id === l.b[0])!, l.b[1])!.mtu);
    const mtu = Math.min(m(la), m(lb));
    if (mtu < worst.mtu) worst = { mtu, via: spine.id };
  }
  return worst;
}

export function ping(f: EFabric, from: string, to: string, size = 100, r: EvpnResult = evaluate(f)): Verdict {
  const A = f.hosts.find((h) => h.id === from)!;
  const B = f.hosts.find((h) => h.id === to)!;
  const la = f.switches.find((s) => s.id === A.leaf)!;
  const lb = f.switches.find((s) => s.id === B.leaf)!;
  const vniA = vniOfVlan(la, A.vlan);
  const vniB = vniOfVlan(lb, B.vlan);
  const sameSubnet = inSubnet(ipOnly(B.ip)!, A.ip);
  const gw = (s: ESwitch, h: EHost) => {
    const svi = intf(s, `Vlan${h.vlan}`);
    if (!s.features.interfaceVlan || !svi || svi.shutdown || !svi.ip || !inSubnet(ipOnly(h.ip)!, svi.ip)) return { ok: false, why: `${s.id} has no working gateway SVI (interface Vlan${h.vlan}) for ${h.label}'s subnet` };
    if (!svi.anycast) return { ok: false, why: `Vlan${h.vlan} on ${s.id} isn't a distributed anycast gateway (fabric forwarding mode anycast-gateway)` };
    return { ok: true, why: "", vrf: svi.vrf };
  };

  if (A.leaf === B.leaf) {
    if (sameSubnet) return { ok: true, why: `${A.label} and ${B.label} are on the same leaf and VLAN: bridged locally on ${A.leaf}` };
    const ga = gw(la, A);
    const gb = gw(la, B);
    if (!ga.ok) return { ok: false, why: ga.why };
    if (!gb.ok) return { ok: false, why: gb.why };
    return { ok: true, why: `routed locally on ${A.leaf} in VRF ${ga.vrf}` };
  }

  const mtu = pathMtu(f, r, A.leaf, B.leaf);
  const mtuFail = size + VXLAN_OVERHEAD > mtu.mtu ? { ok: false, why: `a ${size}-byte packet becomes ${size + VXLAN_OVERHEAD} bytes with VXLAN encapsulation, but the path through ${mtu.via} has an MTU of ${mtu.mtu}, so it's dropped (small pings still work)` } : null;
  const peer = (x: string, y: string) => r.nvePeers[x]?.find((p) => p.peer === y);

  if (sameSubnet) {
    if (!vniA || !vniB || vniA !== vniB)
      return { ok: false, why: `VLAN ${A.vlan} maps to VNI ${vniA ?? "none"} on ${A.leaf} and VLAN ${B.vlan} to VNI ${vniB ?? "none"} on ${B.leaf}; a stretched subnet needs the same L2VNI on both leaves` };
    for (const [x, y, hy] of [[A.leaf, B.leaf, B], [B.leaf, A.leaf, A]] as const) {
      const im = r.imported.find((i) => i.leaf === x && i.route.type === 2 && i.route.mac === hy.mac);
      const xs = f.switches.find((s) => s.id === x)!;
      if (!im) return { ok: false, why: `${x} never received ${hy.label}'s EVPN type-2 route: ${whyNoRoute(f, r, y, x, hy)}` };
      if (!im.l2) return { ok: false, why: `${x} received ${hy.label}'s type-2 route but didn't import it into VNI ${im.route.vni}: ${im.route.rts.length ? `the route carries ${im.route.rts.join(", ")} and ${x} imports ${(() => { const ev = xs.evpn.find((e) => e.vni === im.route.vni); return ev ? resolveRt(xs, ev.imp, im.route.vni).join(", ") : "nothing (no evpn vni entry)"; })()} for VNI ${im.route.vni}` : "it arrived with no route targets (extended communities weren't sent)"}` };
      const p = peer(x, y);
      if (!p?.up) return { ok: false, why: `${x} has no working NVE peer to ${y}: ${y}'s VTEP address ${im.route.nh} isn't reachable in the underlay` };
    }
    if (mtuFail) return mtuFail;
    return { ok: true, why: `bridged over L2VNI ${vniA} between ${A.leaf} and ${B.leaf}` };
  }

  const ga = gw(la, A);
  if (!ga.ok) return { ok: false, why: ga.why };
  const gb = gw(lb, B);
  if (!gb.ok) return { ok: false, why: gb.why };
  if (ga.vrf !== gb.vrf) return { ok: false, why: `the gateways are in different VRFs (${ga.vrf} and ${gb.vrf})` };
  for (const [x, y, hy] of [[A.leaf, B.leaf, B], [B.leaf, A.leaf, A]] as const) {
    const xs = f.switches.find((s) => s.id === x)!;
    const vrf = xs.vrfs.find((v) => v.name === ga.vrf);
    if (!vrf?.vni || !xs.nve?.members.some((m) => m.vni === vrf.vni && m.l3)) return { ok: false, why: `${x} has no L3VNI for VRF ${ga.vrf} on nve1 (member vni … associate-vrf), so it can't route to or from other leaves` };
    const im = r.imported.find((i) => i.leaf === x && i.route.type === 2 && i.route.mac === hy.mac);
    if (!im) return { ok: false, why: `${x} never received ${hy.label}'s EVPN type-2 route: ${whyNoRoute(f, r, y, x, hy)}` };
    if (!im.route.l3vni) return { ok: false, why: `${hy.label}'s type-2 route from ${y} carries no L3VNI, so ${x} can't install a host route in VRF ${ga.vrf}: ${y} has no L3VNI associated on nve1` };
    if (!im.l3) return { ok: false, why: `${x} didn't import ${hy.label}'s host route into VRF ${ga.vrf}: route targets don't match` };
    const p = peer(x, y);
    if (!p?.up) return { ok: false, why: `${x} has no working NVE peer to ${y}: ${y}'s VTEP address ${im.route.nh} isn't reachable in the underlay` };
  }
  if (mtuFail) return mtuFail;
  return { ok: true, why: `routed over L3VNI ${la.vrfs.find((v) => v.name === ga.vrf)!.vni} (symmetric IRB) in VRF ${ga.vrf}` };
}

function whyNoRoute(f: EFabric, r: EvpnResult, origin: string, to: string, h: EHost): string {
  const o = f.switches.find((s) => s.id === origin)!;
  if (r.originates[origin] !== "advertising") return `${origin} isn't advertising EVPN routes (${r.originates[origin]})`;
  if (!r.routes.some((x) => x.origin === origin && x.mac === h.mac)) return `${origin} doesn't advertise it: VLAN ${h.vlan} ${vniOfVlan(o, h.vlan) ? `maps to VNI ${vniOfVlan(o, h.vlan)}, which isn't a member of nve1` : "has no vn-segment"}`;
  const down = r.bgp.filter((b) => (b.leaf === origin || b.leaf === to) && !b.up);
  if (down.length) return `BGP EVPN sessions are down (${down.map((b) => `${b.leaf}–${b.spine}: ${b.why}`).join("; ")})`;
  return "the spines don't reflect it between these leaves (check route-reflector-client)";
}

export type EvpnGoal = { type: "ping"; from: string; to: string; size?: number; label: string } | { type: "noPing"; from: string; to: string; label: string };
export type EvpnGoalResult = { goal: EvpnGoal; ok: boolean; detail: string };

export function gradeEvpn(f: EFabric, goals: EvpnGoal[]): EvpnGoalResult[] {
  const r = evaluate(f);
  return goals.map((goal) => {
    const v = ping(f, goal.from, goal.to, goal.type === "ping" ? (goal.size ?? 100) : 100, r);
    return { goal, ok: goal.type === "ping" ? v.ok : !v.ok, detail: v.why };
  });
}

export type EvpnScenario = {
  id: string;
  title: string;
  exam: "dccor";
  objective: string;
  brief: string;
  symptoms: string[];
  hint?: string;
  debrief?: string;
  fabric: EFabric;
  goals: EvpnGoal[];
  solution: { sw: string; lines: string[] }[];
};
