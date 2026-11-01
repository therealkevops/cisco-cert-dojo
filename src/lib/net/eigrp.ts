import type { L3If, Net, RouteEntry } from "./engine";
import { cidrNet, inCidr, intToIp, ipToInt, parseCidr } from "./ip";
import { segmentOf } from "./ospf";
import type { Device } from "./types";

// EIGRP as a converged-state model: neighbours form between routers whose enabled, non-passive
// interfaces share a segment and an AS number (and subnet). Routes are computed distance-vector
// style with the classic composite metric 256 × (10^7 / min bandwidth + total delay / 10), with
// split horizon. DUAL's view is kept per prefix: feasible distance, successor, reported distances
// and feasible successors (RD < FD), plus which paths variance would also use.

export type EigrpNbr = { dev: string; iface: string; peerDev: string; peerIp: string; peerIface: string };

export type TopoPath = { nbrIp: string; nbrDev: string; iface: string; /** metric through this neighbour */ fd: number; /** neighbour's reported distance */ rd: number };

export type TopoEntry = {
  prefix: string;
  ext: boolean;
  /** Feasible distance (best metric); 0 paths and connected = local. */
  fd: number;
  connected?: string;
  paths: TopoPath[];
  successors: TopoPath[];
  feasible: TopoPath[];
  /** Successors plus feasible successors within variance × FD. */
  installed: TopoPath[];
};

export type EigrpResult = {
  nbrs: EigrpNbr[];
  problems: { dev: string; text: string }[];
  /** dev → enabled interfaces */
  enabled: Map<string, { iface: string; passive: boolean; bw: number; delayUs: number }[]>;
  topo: Map<string, TopoEntry[]>;
  routes: Map<string, RouteEntry[]>;
  rid: Map<string, string>;
};

/** Interface bandwidth (kb/s) and delay (µs) defaults by type, as IOS shows in `show interface`. */
export function bwDelay(net: Net, dev: string, iface: string): { bw: number; delayUs: number } {
  const conf = net.ifObj(dev, iface);
  const base = iface.split(".")[0];
  const def = /^Lo/.test(base)
    ? { bw: 8_000_000, delayUs: 5000 }
    : /^Te/.test(base)
      ? { bw: 10_000_000, delayUs: 10 }
      : /^Fa/.test(base)
        ? { bw: 100_000, delayUs: 100 }
        : /^Tu/.test(base)
          ? { bw: 100, delayUs: 50000 }
          : { bw: 1_000_000, delayUs: 10 };
  return { bw: conf?.bandwidth ?? def.bw, delayUs: conf?.delay !== undefined ? conf.delay * 10 : def.delayUs };
}

export const eigrpMetric = (bw: number, delayUs: number) => 256 * (Math.floor(10_000_000 / Math.max(1, bw)) + Math.floor(delayUs / 10));

function classful(ip: string): string {
  const a = +ip.split(".")[0];
  return a < 128 ? "255.0.0.0" : a < 192 ? "255.255.0.0" : "255.255.255.0";
}

/** Does `network A [wildcard]` cover this interface address? */
export function eigrpCovers(n: { ip: string; wildcard?: string }, ip: string): boolean {
  const wild = n.wildcard ?? intToIp(~ipToInt(classful(n.ip)) >>> 0);
  const care = ~ipToInt(wild) >>> 0;
  return ((ipToInt(ip) & care) >>> 0) === ((ipToInt(n.ip) & care) >>> 0);
}

function isPassive(d: Device, iface: string): boolean {
  const e = d.eigrp!;
  return e.passiveDefault ? !(e.noPassive ?? []).includes(iface) : (e.passive ?? []).includes(iface);
}

export function routerIdOf(net: Net, d: Device): string {
  if (d.eigrp?.routerId) return d.eigrp.routerId;
  const ifs = net.l3Ifs(d.id).filter((i) => i.up);
  const lo = ifs.filter((i) => /^Lo/.test(i.name));
  const pick = (lo.length ? lo : ifs).map((i) => i.cidr.ip).sort((a, b) => ipToInt(b) - ipToInt(a))[0];
  return pick ?? "0.0.0.0";
}

type Best = { bw: number; delayUs: number; ext: boolean; via?: { nbrDev: string; nbrIp: string; iface: string } };

export function computeEigrp(net: Net): EigrpResult {
  const nbrs: EigrpNbr[] = [];
  const problems: EigrpResult["problems"] = [];
  const enabled: EigrpResult["enabled"] = new Map();
  const topo: EigrpResult["topo"] = new Map();
  const routes: EigrpResult["routes"] = new Map();
  const rid = new Map<string, string>();
  const routers = net.devices.filter((d) => d.eigrp && !d.off && !net.isHost(d) && d.kind !== "switch");

  const on = (d: Device, i: L3If) => i.up && d.eigrp!.networks.some((n) => eigrpCovers(n, i.cidr.ip));
  for (const d of routers) {
    rid.set(d.id, routerIdOf(net, d));
    enabled.set(
      d.id,
      net
        .l3Ifs(d.id)
        .filter((i) => on(d, i))
        .map((i) => ({ iface: i.name, passive: isPassive(d, i.name), ...bwDelay(net, d.id, i.name) })),
    );
  }

  // Neighbours.
  const seen = new Set<string>();
  for (const d of routers) {
    for (const e of enabled.get(d.id)!) {
      if (e.passive || /^Lo/.test(e.iface)) continue;
      const me = net.l3Ifs(d.id).find((i) => i.name === e.iface)!;
      for (const x of segmentOf(net, me)) {
        if (x.dev === d.id) continue;
        const pd = net.device(x.dev);
        if (!pd.eigrp || pd.eigrp.asn !== d.eigrp!.asn) continue;
        const pe = enabled.get(x.dev)?.find((y) => y.iface === x.name);
        if (!pe || pe.passive) continue;
        if (me.cidr.net !== x.cidr.net || me.cidr.len !== x.cidr.len) {
          const k = `${d.id}|${x.dev}|subnet`;
          if (!seen.has(k)) {
            seen.add(k);
            problems.push({ dev: d.id, text: `%DUAL-6-NBRINFO: EIGRP-IPv4 ${d.eigrp!.asn}: Neighbor ${x.cidr.ip} (${e.iface}) is blocked: not on common subnet (${me.cidr.ip}/${me.cidr.len})` });
          }
          continue;
        }
        nbrs.push({ dev: d.id, iface: e.iface, peerDev: x.dev, peerIp: x.cidr.ip, peerIface: x.name });
      }
    }
  }

  // Origins: EIGRP-enabled connected networks are internal; redistributed connected/static are external.
  const best = new Map<string, Map<string, Best>>();
  for (const d of routers) {
    const m = new Map<string, Best>();
    for (const e of enabled.get(d.id)!) {
      const i = net.l3Ifs(d.id).find((x) => x.name === e.iface)!;
      m.set(cidrNet(i.cidr), { bw: e.bw, delayUs: e.delayUs, ext: false });
    }
    const redist = d.eigrp!.redistribute ?? [];
    const ifs = net.l3Ifs(d.id).filter((i) => i.up);
    if (redist.includes("connected"))
      for (const i of ifs) if (!m.has(cidrNet(i.cidr))) m.set(cidrNet(i.cidr), { ...bwDelay(net, d.id, i.name), ext: true });
    if (redist.includes("static"))
      for (const r of d.routes ?? []) {
        const c = parseCidr(r.prefix);
        const eg = ifs.find((i) => inCidr(r.via, i.cidr));
        if (c && eg && !m.has(cidrNet(c))) m.set(cidrNet(c), { ...bwDelay(net, d.id, eg.name), ext: true });
      }
    best.set(d.id, m);
  }
  const local = new Map([...best].map(([k, v]) => [k, new Set(v.keys())]));

  // Distance-vector convergence with split horizon.
  const adj = nbrs;
  const metricOf = (b: Best) => eigrpMetric(b.bw, b.delayUs);
  for (let round = 0; round < 50; round++) {
    let changed = false;
    for (const a of adj) {
      const mine = best.get(a.dev)!;
      const theirs = best.get(a.peerDev)!;
      const link = bwDelay(net, a.dev, a.iface);
      for (const [p, nb] of theirs) {
        if (local.get(a.dev)!.has(p)) continue;
        if (nb.via && nb.via.nbrDev === a.dev && nb.via.iface === a.peerIface) continue;
        const cand: Best = { bw: Math.min(nb.bw, link.bw), delayUs: nb.delayUs + link.delayUs, ext: nb.ext, via: { nbrDev: a.peerDev, nbrIp: a.peerIp, iface: a.iface } };
        const cur = mine.get(p);
        if (!cur || metricOf(cand) < metricOf(cur) || (cur.via?.nbrDev === a.peerDev && cur.via.iface === a.iface && metricOf(cand) !== metricOf(cur))) {
          mine.set(p, cand);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  // DUAL view and routing table entries.
  for (const d of routers) {
    const entries: TopoEntry[] = [];
    const rib: RouteEntry[] = [];
    const prefixes = new Set<string>();
    for (const a of adj.filter((x) => x.dev === d.id)) for (const p of best.get(a.peerDev)!.keys()) prefixes.add(p);
    for (const p of local.get(d.id)!) prefixes.add(p);
    for (const p of [...prefixes].sort((x, y) => ipToInt(x.split("/")[0]) - ipToInt(y.split("/")[0]))) {
      const own = best.get(d.id)!.get(p);
      if (local.get(d.id)!.has(p)) {
        const e = enabled.get(d.id)!.find((x) => cidrNet(net.l3Ifs(d.id).find((i) => i.name === x.iface)!.cidr) === p);
        entries.push({ prefix: p, ext: !!own?.ext, fd: own ? metricOf(own) : 0, connected: e?.iface ?? "Redistributed", paths: [], successors: [], feasible: [], installed: [] });
        continue;
      }
      const paths: TopoPath[] = [];
      for (const a of adj.filter((x) => x.dev === d.id)) {
        const nb = best.get(a.peerDev)!.get(p);
        if (!nb) continue;
        if (nb.via && nb.via.nbrDev === d.id && nb.via.iface === a.peerIface) continue; // split horizon
        const link = bwDelay(net, d.id, a.iface);
        paths.push({ nbrIp: a.peerIp, nbrDev: a.peerDev, iface: a.iface, fd: eigrpMetric(Math.min(nb.bw, link.bw), nb.delayUs + link.delayUs), rd: metricOf(nb) });
      }
      if (!paths.length) continue;
      paths.sort((x, y) => x.fd - y.fd || ipToInt(x.nbrIp) - ipToInt(y.nbrIp));
      const fd = paths[0].fd;
      const successors = paths.filter((x) => x.fd === fd);
      const feasible = paths.filter((x) => x.fd !== fd && x.rd < fd);
      const variance = d.eigrp!.variance ?? 1;
      const installed = [...successors, ...feasible.filter((x) => x.fd <= variance * fd)];
      const ext = !!own?.ext;
      entries.push({ prefix: p, ext, fd, paths, successors, feasible, installed });
      const s = successors[0];
      const c = parseCidr(p)!;
      rib.push({ code: ext ? "D EX" : "D", prefix: p, cidr: c, via: s.nbrIp, iface: s.iface, metric: fd, ad: ext ? 170 : 90 });
    }
    topo.set(d.id, entries);
    routes.set(d.id, rib);
  }
  return { nbrs, problems, enabled, topo, routes, rid };
}
