import type { L3If, Net, RouteEntry } from "./engine";
import { aclAddrMatch, inCidr, intToIp, ipToInt, maskOf, parseCidr, type Cidr } from "./ip";
import { segmentOf } from "./ospf";
import type { BgpNeighbor, Device, RouteMapEntry } from "./types";

// BGP-4 as a converged-state model. Sessions are evaluated with the same rules
// a router applies (TCP reachability both ways, matching remote-as on both
// sides, the neighbor address the other side expects, eBGP TTL/connected
// check). Then paths are exchanged until nothing changes, with AS-path loop
// prevention, route-maps, and the real best-path order.

export type BgpState = "Established" | "Active" | "Idle" | "Idle (Admin)";

export type BgpSession = {
  dev: string;
  peerIp: string;
  remoteAs: number;
  state: BgpState;
  why?: string;
  peerDev?: string;
  localIp?: string;
  ebgp: boolean;
  /** Code of the NOTIFICATION, for the console message. */
  notify?: "wrong-as";
};

export type BgpPath = {
  prefix: string;
  cidr: Cidr;
  nextHop: string;
  asPath: number[];
  origin: "i" | "?";
  med?: number;
  localPref: number;
  weight: number;
  local: boolean;
  ebgp: boolean;
  fromDev?: string;
  fromPeer?: string;
  fromRid?: string;
  valid: boolean;
  invalid?: string;
  best: boolean;
  /** For the best path: the step that beat the runner-up. */
  bestBecause?: string;
};

export type BgpResult = {
  rid: Map<string, string>;
  sessions: BgpSession[];
  tables: Map<string, BgpPath[]>;
  routes: Map<string, RouteEntry[]>;
};

const speakers = (net: Net) => net.devices.filter((d) => d.bgp && !d.off && (d.kind === "router" || d.kind === "l3switch"));

/** Longest match in the non-BGP table (what BGP uses for TCP and next-hop resolution). */
function lookup(net: Net, dev: string, dst: string): RouteEntry | null {
  let best: RouteEntry | null = null;
  for (const r of net.baseRoutes(dev)) {
    if (r.code === "L" && r.cidr.ip !== dst) continue;
    if (inCidr(dst, r.cidr) && (!best || r.cidr.len > best.cidr.len)) best = r;
  }
  return best && best.iface !== "Null0" ? best : null;
}

function egress(net: Net, dev: string, dst: string): { iface: L3If; nextHop: string } | null {
  const r = lookup(net, dev, dst);
  if (!r) return null;
  const iface = net.l3Ifs(dev).find((i) => i.name === r.iface && i.up);
  return iface ? { iface, nextHop: r.via ?? dst } : null;
}

/** Hop-by-hop walk over base routes. */
function walk(net: Net, from: string, dst: string): { ok: true; owner: string; hops: number } | { ok: false; why: string } {
  let cur = from;
  for (let hops = 0; hops < 16; hops++) {
    if (net.l3Ifs(cur).some((i) => i.up && i.cidr.ip === dst)) return { ok: true, owner: cur, hops };
    const e = egress(net, cur, dst);
    if (!e) return { ok: false, why: `${cur} has no route to ${dst}` };
    const next = segmentOf(net, e.iface).find((i) => i.cidr.ip === e.nextHop && i.dev !== cur)?.dev;
    if (!next) return { ok: false, why: `${cur}'s next hop ${e.nextHop} toward ${dst} isn't reachable` };
    cur = next;
  }
  return { ok: false, why: "routing loop" };
}

function routerId(net: Net, d: Device): string {
  if (d.bgp?.routerId) return d.bgp.routerId;
  const ifs = net.l3Ifs(d.id).filter((i) => i.up);
  const loops = ifs.filter((i) => /^Lo\d+$/.test(i.name));
  const pool = loops.length ? loops : ifs;
  return pool.map((i) => i.cidr.ip).sort((a, b) => ipToInt(b) - ipToInt(a))[0] ?? "0.0.0.0";
}

function sourceIp(net: Net, d: Device, n: BgpNeighbor): string | undefined {
  if (n.updateSource) return net.l3Ifs(d.id).find((i) => i.name === n.updateSource && i.up)?.cidr.ip;
  return egress(net, d.id, n.ip)?.iface.cidr.ip;
}

const connected = (net: Net, dev: string, ip: string) => net.l3Ifs(dev).some((i) => i.up && i.cidr.len < 32 && inCidr(ip, i.cidr));

function session(net: Net, a: Device, n: BgpNeighbor): BgpSession {
  const base = { dev: a.id, peerIp: n.ip, remoteAs: n.remoteAs, ebgp: n.remoteAs !== a.bgp!.asn };
  if (n.shutdown) return { ...base, state: "Idle (Admin)", why: "neighbor is administratively shut down" };
  const fwd = walk(net, a.id, n.ip);
  if (!fwd.ok) return { ...base, state: "Active", why: `TCP to ${n.ip}:179 can't be opened: ${fwd.why}` };
  const b = net.device(fwd.owner);
  if (!b.bgp || b.off) return { ...base, state: "Active", why: `${n.ip} belongs to ${b.id}, which isn't running BGP, so TCP 179 is refused` };
  const src = sourceIp(net, a, n);
  if (!src) return { ...base, state: "Idle", why: `update-source ${n.updateSource} has no usable IP address` };
  const back = walk(net, b.id, src);
  if (!back.ok) return { ...base, state: "Active", why: `${b.id} can't route back to my source ${src}: ${back.why}` };
  const nb = b.bgp.neighbors.find((x) => x.ip === src);
  if (!nb) {
    const other = b.bgp.neighbors.find((x) => net.l3Ifs(a.id).some((i) => i.cidr.ip === x.ip));
    return {
      ...base,
      state: "Active",
      why: other
        ? `${b.id} expects me at ${other.ip}, but my session comes from ${src}. Match the addresses (update-source)`
        : `${b.id} has no 'neighbor ${src}' statement, so it rejects the connection`,
    };
  }
  if (n.remoteAs !== b.bgp.asn) return { ...base, state: "Idle", why: `${b.id} is in AS ${b.bgp.asn}, not ${n.remoteAs}: NOTIFICATION 2/2 (peer in wrong AS)`, notify: "wrong-as" };
  if (nb.remoteAs !== a.bgp!.asn) return { ...base, state: "Idle", why: `${b.id} expects me in AS ${nb.remoteAs}, but I am AS ${a.bgp!.asn}: it sends NOTIFICATION 2/2 (peer in wrong AS)` };
  if (nb.shutdown) return { ...base, state: "Idle", why: `${b.id} has this neighbor administratively shut down` };
  if (base.ebgp) {
    if (!n.multihop && !connected(net, a.id, n.ip)) return { ...base, state: "Idle", why: `eBGP neighbor ${n.ip} is not directly connected and ebgp-multihop isn't configured (TTL 1)` };
    if (n.multihop && fwd.hops > n.multihop) return { ...base, state: "Active", why: `${n.ip} is ${fwd.hops} hops away but ebgp-multihop is ${n.multihop}` };
    if (!nb.multihop && !connected(net, b.id, src)) return { ...base, state: "Active", why: `${b.id} sees my source ${src} as not directly connected and has no ebgp-multihop` };
  }
  return { ...base, state: "Established", peerDev: b.id, localIp: src };
}

function prefixListPermits(d: Device, name: string, c: Cidr): boolean {
  for (const e of [...(d.prefixLists?.[name] ?? [])].sort((x, y) => x.seq - y.seq)) {
    const p = parseCidr(e.prefix);
    if (!p) continue;
    const covered = c.len >= p.len && ((c.net & maskOf(p.len)) >>> 0) === p.net;
    if (!covered) continue;
    const ok = e.ge === undefined && e.le === undefined ? c.len === p.len : c.len >= (e.ge ?? p.len) && c.len <= (e.le ?? 32);
    if (ok) return e.action === "permit";
  }
  return false;
}

/** Applies a route-map to a path; returns null when it is denied. */
function applyMap(d: Device, name: string | undefined, path: BgpPath): BgpPath | null {
  if (!name) return path;
  const entries: RouteMapEntry[] = [...(d.routeMaps?.[name] ?? [])].sort((x, y) => x.seq - y.seq);
  // A neighbor route-map that matches nothing (or doesn't exist) denies: route-maps end with an implicit deny.
  for (const e of entries) {
    if (e.matchPrefixList && !prefixListPermits(d, e.matchPrefixList, path.cidr)) continue;
    if (e.matchAcl) {
      const acl = d.acls?.[e.matchAcl] ?? [];
      const hit = acl.find((a) => aclAddrMatch(a.src, intToIp(path.cidr.net)));
      if (!hit || hit.action !== "permit") continue;
    }
    if (e.action === "deny") return null;
    const out = { ...path, asPath: [...path.asPath] };
    if (e.setLocalPref !== undefined) out.localPref = e.setLocalPref;
    if (e.setWeight !== undefined) out.weight = e.setWeight;
    if (e.setMed !== undefined) out.med = e.setMed;
    if (e.setPrepend) out.asPath = [...e.setPrepend, ...out.asPath];
    return out;
  }
  return null;
}

/** Cisco best-path order. Returns >0 when a is better, plus the deciding step. */
function compare(a: BgpPath, b: BgpPath): [number, string] {
  if (a.weight !== b.weight) return [a.weight - b.weight, `higher weight (${Math.max(a.weight, b.weight)})`];
  if (a.localPref !== b.localPref) return [a.localPref - b.localPref, `higher local preference (${Math.max(a.localPref, b.localPref)})`];
  if (a.local !== b.local) return [a.local ? 1 : -1, "locally originated"];
  if (a.asPath.length !== b.asPath.length) return [b.asPath.length - a.asPath.length, `shorter AS path (${Math.min(a.asPath.length, b.asPath.length)} AS${Math.min(a.asPath.length, b.asPath.length) === 1 ? "" : "es"})`];
  const o = { i: 0, "?": 2 } as const;
  if (a.origin !== b.origin) return [o[b.origin] - o[a.origin], "better origin code (i before ?)"];
  if (a.asPath[0] === b.asPath[0] && (a.med ?? 0) !== (b.med ?? 0)) return [(b.med ?? 0) - (a.med ?? 0), `lower MED (${Math.min(a.med ?? 0, b.med ?? 0)}) from the same neighbouring AS`];
  if (a.ebgp !== b.ebgp) return [a.ebgp ? 1 : -1, "eBGP preferred over iBGP"];
  const ra = ipToInt(a.fromRid ?? "0.0.0.0");
  const rb = ipToInt(b.fromRid ?? "0.0.0.0");
  if (ra !== rb) return [rb - ra, `lower neighbor router ID (${intToIp(Math.min(ra, rb) >>> 0)})`];
  return [ipToInt(b.fromPeer ?? "0.0.0.0") - ipToInt(a.fromPeer ?? "0.0.0.0"), "lower neighbor address"];
}

export function computeBgp(net: Net): BgpResult {
  const devs = speakers(net);
  const rid = new Map(devs.map((d) => [d.id, routerId(net, d)]));
  const sessions = devs.flatMap((d) => d.bgp!.neighbors.map((n) => session(net, d, n)));
  const up = (a: string, b: string) => sessions.find((s) => s.dev === a && s.peerDev === b && s.state === "Established");

  // Locally originated paths.
  const local = new Map<string, BgpPath[]>();
  for (const d of devs) {
    const base = net.baseRoutes(d.id).filter((r) => r.code !== "L");
    const list: BgpPath[] = [];
    const add = (r: RouteEntry, origin: "i" | "?") => {
      if (list.some((p) => p.prefix === r.prefix)) return;
      list.push({ prefix: r.prefix, cidr: r.cidr, nextHop: "0.0.0.0", asPath: [], origin, med: r.code === "C" ? 0 : (r.metric ?? 0), localPref: 100, weight: 32768, local: true, ebgp: false, valid: true, best: false });
    };
    for (const n of d.bgp!.networks) {
      const r = base.find((x) => x.prefix === n);
      if (r) add(r, "i");
    }
    for (const kind of d.bgp!.redistribute ?? []) {
      for (const r of base) {
        if ((kind === "connected" && r.code === "C") || (kind === "static" && r.code === "S") || (kind === "ospf" && r.code.startsWith("O"))) add(r, "?");
      }
    }
    local.set(d.id, list);
  }

  // Exchange until stable.
  let rib = new Map<string, BgpPath[]>();
  for (const d of devs) rib.set(d.id, [...local.get(d.id)!]);
  const bestOf = (paths: BgpPath[]) => {
    const by = new Map<string, BgpPath[]>();
    for (const p of paths) by.set(p.prefix, [...(by.get(p.prefix) ?? []), p]);
    const out: BgpPath[] = [];
    for (const list of by.values()) {
      const valid = list.filter((p) => p.valid);
      if (!valid.length) continue;
      out.push(valid.reduce((x, y) => (compare(y, x)[0] > 0 ? y : x)));
    }
    return out;
  };
  for (let round = 0; round < 40; round++) {
    const next = new Map<string, BgpPath[]>();
    for (const d of devs) next.set(d.id, [...local.get(d.id)!]);
    for (const a of devs) {
      for (const p of bestOf(rib.get(a.id)!)) {
        for (const n of a.bgp!.neighbors) {
          const s = sessions.find((x) => x.dev === a.id && x.peerIp === n.ip);
          if (s?.state !== "Established" || !s.peerDev || !up(s.peerDev, a.id)) continue;
          const b = net.device(s.peerDev);
          if (p.fromDev === b.id) continue;
          // iBGP split horizon: never pass an iBGP-learned path to another iBGP peer.
          if (!s.ebgp && !p.local && !p.ebgp) continue;
          let out = applyMap(a, n.routeMapOut, { ...p });
          if (!out) continue;
          // To eBGP peers: prepend our AS, set next hop to ourselves, drop local preference, and only
          // send a MED we set (route-map) or originated; a MED learned from another AS isn't passed on.
          const adv: BgpPath = s.ebgp
            ? { ...out, asPath: [a.bgp!.asn, ...out.asPath], nextHop: s.localIp!, med: out.med !== p.med || p.local ? out.med : undefined, localPref: 100, weight: 0 }
            : { ...out, nextHop: n.nextHopSelf || p.local ? s.localIp! : out.nextHop, weight: 0 };
          if (adv.asPath.includes(b.bgp!.asn)) continue; // loop prevention
          const nb = b.bgp!.neighbors.find((x) => x.ip === s.localIp)!;
          // From B's point of view the peer is A's source address, the one in B's neighbor statement.
          const recv: BgpPath = { ...adv, local: false, ebgp: s.ebgp, fromDev: a.id, fromPeer: s.localIp, fromRid: rid.get(a.id), weight: nb.weight ?? 0, best: false, valid: true, bestBecause: undefined, invalid: undefined };
          out = applyMap(b, nb.routeMapIn, recv);
          if (!out) continue;
          next.get(b.id)!.push(out);
        }
      }
    }
    // Next-hop reachability decides validity.
    for (const d of devs)
      for (const p of next.get(d.id)!) {
        if (p.local) continue;
        const e = egress(net, d.id, p.nextHop);
        p.valid = !!e;
        p.invalid = e ? undefined : `next hop ${p.nextHop} is inaccessible (no IGP route to it)`;
      }
    const key = (m: Map<string, BgpPath[]>) => JSON.stringify([...m.entries()].map(([k, v]) => [k, v.map((p) => [p.prefix, p.nextHop, p.asPath, p.fromDev, p.localPref, p.weight, p.med, p.valid])]));
    const done = key(next) === key(rib);
    rib = next;
    if (done) break;
  }

  // Mark best paths and the reason, and build RIB entries.
  const routes = new Map<string, RouteEntry[]>();
  for (const d of devs) {
    const list = rib.get(d.id)!;
    const best = bestOf(list);
    for (const b of best) {
      b.best = true;
      const rivals = list.filter((p) => p !== b && p.prefix === b.prefix && p.valid);
      if (rivals.length) {
        const runner = rivals.reduce((x, y) => (compare(y, x)[0] > 0 ? y : x));
        b.bestBecause = compare(b, runner)[1];
      }
    }
    const rs: RouteEntry[] = [];
    for (const b of best) {
      if (b.local) continue;
      const e = egress(net, d.id, b.nextHop);
      if (!e) continue;
      rs.push({ code: "B", prefix: b.prefix, cidr: parseCidr(b.prefix)!, via: e.nextHop, iface: e.iface.name, metric: b.med ?? 0, ad: b.ebgp ? 20 : 200, nh: b.nextHop });
    }
    routes.set(d.id, rs);
  }
  return { rid, sessions, tables: rib, routes };
}
