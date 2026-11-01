import type { L3If, Net, RouteEntry } from "./engine";
import { cidrNet, inCidr, intToIp, ipToInt, parseCidr, wildcardToLen, type Cidr } from "./ip";
import type { Device, IfOspf, Port, Svi } from "./types";

// OSPFv2 as a converged-state model. Rather than simulating hellos and LSA
// flooding over time, it applies the same rules a real router would and
// computes the end result: which interfaces run OSPF, which neighbours reach
// FULL (and why the others don't), DR/BDR on shared segments, and the SPF
// result per area including inter-area summaries.

export type OspfIf = {
  dev: string;
  name: string;
  ip: string;
  cidr: Cidr;
  area: number;
  passive: boolean;
  loopback: boolean;
  p2p: boolean;
  cost: number;
  hello: number;
  dead: number;
  priority: number;
  mtu: number;
  /** DR / BDR / DROTHER / P2P / LOOP / WAIT (no neighbours yet). */
  state: string;
  /** Neighbours formed (FULL) / seen (any state). */
  full: number;
  seen: number;
};

export type OspfNbr = {
  dev: string;
  iface: string;
  nbrDev: string;
  nbrRid: string;
  nbrIp: string;
  nbrPri: number;
  state: "FULL" | "2WAY" | "EXSTART";
  role: "DR" | "BDR" | "DROTHER" | "-";
};

export type OspfProblem = { dev: string; iface: string; text: string };

export type OspfResult = {
  rid: Map<string, string>;
  ifaces: OspfIf[];
  nbrs: OspfNbr[];
  problems: OspfProblem[];
  routes: Map<string, RouteEntry[]>;
  abr: Set<string>;
  asbr: Set<string>;
};

const DEFAULTS = { hello: 10, priority: 1, mtu: 1500 };

const isLoop = (name: string) => /^Lo\d+$/.test(name);

function ifConf(d: Device, name: string): { o?: IfOspf; mtu?: number } {
  if (name.startsWith("Vlan")) {
    const s = d.svis?.find((x) => x.vlan === +name.slice(4)) as Svi | undefined;
    return { o: s?.ospf, mtu: s?.mtu };
  }
  const p = d.ports.find((x) => x.name === name) as Port | undefined;
  return { o: p?.ospf, mtu: p?.mtu };
}

/** Which area, if any, does this interface run OSPF in? */
function areaFor(d: Device, i: L3If): number | null {
  const o = d.ospf!;
  const conf = ifConf(d, i.name).o;
  if (conf?.area !== undefined) return conf.area;
  // IOS checks network statements from the most specific wildcard down.
  const nets = o.networks
    .map((n) => ({ ...n, len: wildcardToLen(n.wildcard) ?? -1 }))
    .filter((n) => n.len >= 0)
    .sort((a, b) => b.len - a.len);
  const host = ipToInt(i.cidr.ip);
  for (const n of nets) {
    const mask = n.len === 0 ? 0 : (0xffffffff << (32 - n.len)) >>> 0;
    if (((host & mask) >>> 0) === ((ipToInt(n.ip) & mask) >>> 0)) return n.area;
  }
  return null;
}

function routerId(net: Net, d: Device): string | null {
  if (d.ospf?.routerId) return d.ospf.routerId;
  const ifs = net.l3Ifs(d.id).filter((i) => i.up);
  const loops = ifs.filter((i) => isLoop(i.name));
  const pool = loops.length ? loops : ifs;
  if (!pool.length) return null;
  return pool.map((i) => i.cidr.ip).sort((a, b) => ipToInt(b) - ipToInt(a))[0];
}

/** L3 interfaces sharing a broadcast domain with `start` (walks switches, VLANs and STP state). */
export function segmentOf(net: Net, start: L3If): L3If[] {
  const found = new Map<string, L3If>();
  const add = (dev: string, name: string) => {
    const i = net.l3Ifs(dev).find((x) => x.name === name && x.up);
    if (i) found.set(`${dev}|${name}`, i);
  };
  add(start.dev, start.name);
  const queue: [string, number][] = [];
  const seenSw = new Set<string>();
  if (start.kind === "svi") queue.push([start.dev, start.vlan!]);
  else if (!isLoop(start.name)) {
    const peer = net.peer(start.dev, start.name);
    if (!peer || !net.linkUp(start.dev, start.name)) return [...found.values()];
    const pd = net.device(peer[0]);
    const pp = net.port(peer[0], peer[1])!;
    const me = net.port(start.dev, start.name);
    // A subinterface sends tagged frames (unless it is the native VLAN); a plain router port sends untagged.
    const tag = me?.encap && !me.encap.native ? me.encap.vlan : undefined;
    if (net.isSwitch(pd) && net.portMode(pd, pp) !== "routed") {
      const mode = net.portMode(pd, pp);
      const vlan = mode === "access" ? (tag === undefined ? (pp.vlan ?? 1) : null) : (tag ?? pp.native ?? 1);
      if (vlan !== null && net.carries(pd, pp, vlan) && net.forwarding(pd.id, pp.name, vlan)) queue.push([pd.id, vlan]);
    } else {
      const rx = net.rxIfName(peer[0], peer[1], tag);
      if (rx) add(peer[0], rx);
    }
  }
  while (queue.length) {
    const [sw, vlan] = queue.shift()!;
    if (seenSw.has(sw)) continue;
    seenSw.add(sw);
    const d = net.device(sw);
    add(sw, `Vlan${vlan}`);
    for (const p of d.ports) {
      if (net.portMode(d, p) === "routed" || !net.linkUp(sw, p.name) || !net.carries(d, p, vlan) || !net.forwarding(sw, p.name, vlan)) continue;
      const peer = net.peer(sw, p.name)!;
      const pd = net.device(peer[0]);
      const pp = net.port(peer[0], peer[1])!;
      if (net.isSwitch(pd) && net.portMode(pd, pp) !== "routed") {
        if (net.carries(pd, pp, vlan) && net.forwarding(pd.id, pp.name, vlan)) queue.push([pd.id, vlan]);
      } else {
        const tagged = net.portMode(d, p) === "trunk" && vlan !== (p.native ?? 1);
        const rx = net.rxIfName(peer[0], peer[1], tagged ? vlan : undefined);
        if (rx) add(peer[0], rx);
      }
    }
  }
  return [...found.values()];
}

type Edge = { to: string; cost: number; via: string; out: string };

function dijkstra(src: string, edges: Map<string, Edge[]>, rid: Map<string, string>) {
  const dist = new Map<string, number>([[src, 0]]);
  const first = new Map<string, Edge | null>([[src, null]]);
  const done = new Set<string>();
  for (;;) {
    let u: string | null = null;
    for (const [n, d] of dist) if (!done.has(n) && (u === null || d < dist.get(u)! || (d === dist.get(u)! && (rid.get(n) ?? "") < (rid.get(u) ?? "")))) u = n;
    if (u === null) break;
    done.add(u);
    for (const e of edges.get(u) ?? []) {
      const nd = dist.get(u)! + e.cost;
      if (!dist.has(e.to) || nd < dist.get(e.to)!) {
        dist.set(e.to, nd);
        first.set(e.to, u === src ? e : first.get(u)!);
      }
    }
  }
  return { dist, first };
}

export function computeOspf(net: Net): OspfResult {
  const routers = net.devices.filter((d) => d.ospf && !d.off && (d.kind === "router" || d.kind === "l3switch"));
  const rid = new Map<string, string>();
  const ifaces: OspfIf[] = [];
  const problems: OspfProblem[] = [];
  const nbrs: OspfNbr[] = [];

  for (const d of routers) {
    const r = routerId(net, d);
    if (!r) {
      problems.push({ dev: d.id, iface: "-", text: `%OSPF-4-NORTRID: OSPF process ${d.ospf!.pid} failed to allocate unique router-id and cannot start` });
      continue;
    }
    rid.set(d.id, r);
    const o = d.ospf!;
    for (const i of net.l3Ifs(d.id)) {
      if (!i.up) continue;
      const area = areaFor(d, i);
      if (area === null) continue;
      const { o: conf, mtu } = ifConf(d, i.name);
      const hello = conf?.hello ?? DEFAULTS.hello;
      const loopback = isLoop(i.name);
      const passive = loopback || (o.passiveDefault ? !(o.noPassive ?? []).includes(i.name) : (o.passive ?? []).includes(i.name));
      ifaces.push({
        dev: d.id,
        name: i.name,
        ip: i.cidr.ip,
        cidr: i.cidr,
        area,
        passive,
        loopback,
        p2p: conf?.network === "point-to-point",
        cost: conf?.cost ?? (loopback ? 1 : Math.max(1, Math.floor((o.refBw ?? 100) / 1000))),
        hello,
        dead: conf?.dead ?? hello * 4,
        priority: conf?.priority ?? DEFAULTS.priority,
        mtu: mtu ?? DEFAULTS.mtu,
        state: loopback ? "LOOP" : "WAIT",
        full: 0,
        seen: 0,
      });
    }
  }
  const byKey = new Map(ifaces.map((i) => [`${i.dev}|${i.name}`, i]));

  // Adjacencies, one shared segment at a time.
  const edges = new Map<number, Map<string, Edge[]>>(); // area -> graph
  const addEdge = (area: number, from: string, e: Edge) => {
    const g = edges.get(area) ?? new Map<string, Edge[]>();
    edges.set(area, g);
    g.set(from, [...(g.get(from) ?? []), e]);
  };
  const done = new Set<string>();
  for (const me of ifaces) {
    if (me.passive || done.has(`${me.dev}|${me.name}`)) continue;
    const seg = segmentOf(net, net.l3Ifs(me.dev).find((x) => x.name === me.name)!)
      .map((x) => byKey.get(`${x.dev}|${x.name}`))
      .filter((x): x is OspfIf => !!x && !x.passive);
    for (const x of seg) done.add(`${x.dev}|${x.name}`);
    if (seg.length < 2) continue;

    // Pairwise hello checks. Everything that passes forms the candidate group.
    const ok = new Map<string, Set<string>>();
    const stuck = new Set<string>();
    for (let a = 0; a < seg.length; a++)
      for (let b = a + 1; b < seg.length; b++) {
        const A = seg[a];
        const B = seg[b];
        if (A.dev === B.dev) continue;
        const why: string[] = [];
        if (A.cidr.net !== B.cidr.net || A.cidr.len !== B.cidr.len) why.push(`Rcv pkt from ${B.ip} on ${A.name}: not on the same network (${cidrNet(A.cidr)} vs ${cidrNet(B.cidr)})`);
        else if (A.area !== B.area) why.push(`Rcv pkt from ${B.ip}, ${A.name}, area 0.0.0.${A.area}: mismatched area 0.0.0.${B.area} in the header`);
        else if (A.hello !== B.hello || A.dead !== B.dead) why.push(`Rcv hello from ${rid.get(B.dev)} area ${A.area} ${B.ip}: mismatched hello parameters. Dead R ${B.dead} C ${A.dead}, Hello R ${B.hello} C ${A.hello}`);
        else if (rid.get(A.dev) === rid.get(B.dev)) why.push(`%OSPF-4-DUP_RTRID_NBR: OSPF detected duplicate router-id ${rid.get(A.dev)} from ${B.ip} on interface ${A.name}`);
        if (why.length) {
          problems.push({ dev: A.dev, iface: A.name, text: why[0] });
          problems.push({ dev: B.dev, iface: B.name, text: why[0].replace(B.ip, A.ip).replace(` on ${A.name}`, ` on ${B.name}`).replace(`${A.name},`, `${B.name},`) });
          continue;
        }
        const k = (x: OspfIf) => `${x.dev}|${x.name}`;
        ok.set(k(A), (ok.get(k(A)) ?? new Set()).add(k(B)));
        ok.set(k(B), (ok.get(k(B)) ?? new Set()).add(k(A)));
        if (A.mtu !== B.mtu) {
          stuck.add(`${k(A)}~${k(B)}`);
          const [lo, hi] = A.mtu < B.mtu ? [A, B] : [B, A];
          problems.push({ dev: hi.dev, iface: hi.name, text: `Nbr ${rid.get(lo.dev)} has smaller interface MTU (${lo.mtu} < ${hi.mtu}). DBD exchange stalls: neighbour stuck in EXSTART/EXCHANGE` });
          problems.push({ dev: lo.dev, iface: lo.name, text: `Nbr ${rid.get(hi.dev)} sends DBD packets larger than my MTU (${hi.mtu} > ${lo.mtu}). Neighbour stuck in EXSTART/EXCHANGE` });
        }
      }
    const group = seg.filter((x) => ok.has(`${x.dev}|${x.name}`));
    if (group.length < 2) continue;
    const key = (x: OspfIf) => `${x.dev}|${x.name}`;
    const isStuck = (a: OspfIf, b: OspfIf) => stuck.has(`${key(a)}~${key(b)}`) || stuck.has(`${key(b)}~${key(a)}`);
    const p2p = group.length === 2 && group.every((x) => x.p2p);

    let dr: OspfIf | undefined;
    let bdr: OspfIf | undefined;
    if (!p2p) {
      const rank = (x: OspfIf) => [x.priority, ipToInt(rid.get(x.dev)!)];
      const elig = group.filter((x) => x.priority > 0).sort((a, b) => rank(b)[0] - rank(a)[0] || rank(b)[1] - rank(a)[1]);
      [dr, bdr] = elig;
      for (const x of group) x.state = x === dr ? "DR" : x === bdr ? "BDR" : "DROTHER";
    } else for (const x of group) x.state = "P2P";

    const role = (x: OspfIf): OspfNbr["role"] => (p2p ? "-" : x === dr ? "DR" : x === bdr ? "BDR" : "DROTHER");
    for (const A of group)
      for (const B of group) {
        if (A === B || A.dev === B.dev || !ok.get(key(A))?.has(key(B))) continue;
        let state: OspfNbr["state"];
        if (isStuck(A, B)) state = "EXSTART";
        else if (p2p || A === dr || A === bdr || B === dr || B === bdr) state = "FULL";
        else state = "2WAY";
        nbrs.push({ dev: A.dev, iface: A.name, nbrDev: B.dev, nbrRid: rid.get(B.dev)!, nbrIp: B.ip, nbrPri: B.priority, state, role: role(B) });
        A.seen++;
        if (state === "FULL") A.full++;
      }

    // SPF graph edges: two routers on the segment can forward to each other when both are
    // fully adjacent to the DR (or directly, on point-to-point).
    const fullWith = (a: OspfIf, b: OspfIf) => a === b || nbrs.some((n) => n.dev === a.dev && n.iface === a.name && n.nbrDev === b.dev && n.state === "FULL");
    for (const A of group)
      for (const B of group) {
        if (A === B || A.dev === B.dev || A.area !== B.area) continue;
        const usable = p2p ? fullWith(A, B) : !!dr && fullWith(A, dr) && fullWith(B, dr);
        if (usable) addEdge(A.area, A.dev, { to: B.dev, cost: A.cost, via: B.ip, out: A.name });
      }
  }

  // Prefixes each router originates, per area.
  type Pfx = { prefix: string; cidr: Cidr; owner: string; cost: number };
  const pfx = new Map<number, Pfx[]>();
  for (const i of ifaces) {
    const c = i.loopback && !i.p2p ? parseCidr(`${i.ip}/32`)! : parseCidr(cidrNet(i.cidr))!;
    pfx.set(i.area, [...(pfx.get(i.area) ?? []), { prefix: cidrNet(c), cidr: c, owner: i.dev, cost: i.cost }]);
  }
  const areasOf = (dev: string) => [...new Set(ifaces.filter((i) => i.dev === dev).map((i) => i.area))];
  const abr = new Set([...rid.keys()].filter((d) => areasOf(d).includes(0) && areasOf(d).length > 1));

  type Best = { cost: number; via?: string; out?: string; code: RouteEntry["code"]; null0?: boolean };
  const spf = new Map<string, ReturnType<typeof dijkstra>>(); // `${dev}|${area}`
  const spfOf = (dev: string, area: number) => {
    const k = `${dev}|${area}`;
    if (!spf.has(k)) spf.set(k, dijkstra(dev, edges.get(area) ?? new Map(), rid));
    return spf.get(k)!;
  };

  /** Intra-area table for a router in one area: prefix -> best. */
  const intra = (dev: string, area: number): Map<string, Best & { cidr: Cidr }> => {
    const out = new Map<string, Best & { cidr: Cidr }>();
    const { dist, first } = spfOf(dev, area);
    for (const p of pfx.get(area) ?? []) {
      if (!dist.has(p.owner)) continue;
      const cost = dist.get(p.owner)! + p.cost;
      const fe = first.get(p.owner);
      const cur = out.get(p.prefix);
      if (!cur || cost < cur.cost) out.set(p.prefix, { cost, via: fe?.via, out: fe?.out, code: "O", cidr: p.cidr });
    }
    return out;
  };

  /** What an ABR advertises out of area `from` (type 3), with `area range` summarisation. */
  const summarise = (b: string, from: number): { prefix: string; cidr: Cidr; cost: number; summary: boolean }[] => {
    const d = net.device(b);
    const ranges = (d.ospf?.ranges ?? []).filter((r) => r.area === from).map((r) => ({ ...r, cidr: parseCidr(r.prefix)! }));
    const items = [...intra(b, from).entries()].map(([prefix, v]) => ({ prefix, cidr: v.cidr, cost: v.cost }));
    const out: { prefix: string; cidr: Cidr; cost: number; summary: boolean }[] = [];
    const rangeCost = new Map<string, number>();
    for (const it of items) {
      const r = ranges.find((x) => x.cidr.len <= it.cidr.len && inCidr(intToIp(it.cidr.net), x.cidr));
      if (r) rangeCost.set(r.prefix, Math.max(rangeCost.get(r.prefix) ?? 0, it.cost));
      else out.push({ ...it, summary: false });
    }
    for (const [prefix, cost] of rangeCost) out.push({ prefix, cidr: parseCidr(prefix)!, cost, summary: true });
    return out;
  };

  const tables = new Map<string, Map<string, Best & { cidr: Cidr }>>();
  for (const dev of rid.keys()) {
    const t = new Map<string, Best & { cidr: Cidr }>();
    const mine = areasOf(dev);
    const put = (prefix: string, b: Best & { cidr: Cidr }) => {
      const cur = t.get(prefix);
      // Intra-area always beats inter-area; otherwise lowest cost.
      const rank = (x: Best) => (x.code === "O" ? 0 : 1);
      if (!cur || rank(b) < rank(cur) || (rank(b) === rank(cur) && b.cost < cur.cost)) t.set(prefix, b);
    };
    for (const a of mine) for (const [p, v] of intra(dev, a)) put(p, v);

    // Inter-area. Backbone routers learn every ABR's summaries of non-backbone areas.
    const backboneSummaries = (viewer: string) => {
      const res: { prefix: string; cidr: Cidr; cost: number; via?: string; out?: string; fromArea: number }[] = [];
      const { dist, first } = spfOf(viewer, 0);
      for (const b of abr) {
        if (b === viewer || !dist.has(b)) continue;
        for (const a of areasOf(b).filter((x) => x !== 0))
          for (const s of summarise(b, a)) res.push({ ...s, cost: dist.get(b)! + s.cost, via: first.get(b)?.via, out: first.get(b)?.out, fromArea: a });
      }
      return res;
    };
    if (mine.includes(0)) {
      for (const s of backboneSummaries(dev)) if (!mine.includes(s.fromArea)) put(s.prefix, { cost: s.cost, via: s.via, out: s.out, code: "O IA", cidr: s.cidr });
    } else {
      // Non-backbone routers learn everything outside their area from their area's ABRs.
      for (const a of mine) {
        const { dist, first } = spfOf(dev, a);
        for (const b of abr) {
          if (!areasOf(b).includes(a) || !dist.has(b)) continue;
          const adverts: { prefix: string; cidr: Cidr; cost: number }[] = [];
          for (const s of summarise(b, 0)) adverts.push(s);
          for (const other of areasOf(b).filter((x) => x !== 0 && x !== a)) adverts.push(...summarise(b, other));
          for (const s of backboneSummaries(b)) if (s.fromArea !== a) adverts.push(s);
          for (const s of adverts) put(s.prefix, { cost: dist.get(b)! + s.cost, via: first.get(b)?.via, out: first.get(b)?.out, code: "O IA", cidr: s.cidr });
        }
      }
    }
    // ABRs install a discard route for every active range.
    if (abr.has(dev))
      for (const a of mine.filter((x) => x !== 0))
        for (const s of summarise(dev, a)) if (s.summary) t.set(s.prefix, { cost: s.cost, code: "O", null0: true, cidr: s.cidr });
    tables.set(dev, t);
  }

  // default-information originate: an E2 default from the ASBR to every OSPF router.
  const asbr = new Set<string>();
  for (const dev of rid.keys()) {
    const d = net.device(dev);
    const hasDefault = (d.routes ?? []).some((r) => r.prefix === "0.0.0.0/0");
    if (d.ospf?.defaultOriginate === "always" || (d.ospf?.defaultOriginate === "yes" && hasDefault)) asbr.add(dev);
  }
  if (asbr.size) {
    // Path to the ASBR across all areas (good enough for a single-domain lab).
    const all = new Map<string, Edge[]>();
    for (const g of edges.values()) for (const [k, v] of g) all.set(k, [...(all.get(k) ?? []), ...v]);
    for (const dev of rid.keys()) {
      if (asbr.has(dev)) continue;
      const { dist, first } = dijkstra(dev, all, rid);
      const best = [...asbr].filter((a) => dist.has(a)).sort((a, b) => dist.get(a)! - dist.get(b)!)[0];
      if (!best) continue;
      tables.get(dev)!.set("0.0.0.0/0", { cost: 1, via: first.get(best)?.via, out: first.get(best)?.out, code: "O*E2", cidr: parseCidr("0.0.0.0/0")! });
    }
  }

  const routes = new Map<string, RouteEntry[]>();
  for (const [dev, t] of tables) {
    const mineIfs = ifaces.filter((i) => i.dev === dev);
    const list: RouteEntry[] = [];
    for (const [prefix, b] of t) {
      // Connected networks are never replaced by OSPF.
      if (!b.null0 && mineIfs.some((i) => cidrNet(i.cidr) === prefix || (i.loopback && `${i.ip}/32` === prefix))) continue;
      if (!b.null0 && !b.out) continue;
      list.push({ code: b.code, prefix, cidr: b.cidr, via: b.null0 ? undefined : b.via, iface: b.null0 ? "Null0" : b.out, metric: b.cost });
    }
    routes.set(dev, list);
  }

  return { rid, ifaces, nbrs, problems, routes, abr, asbr };
}
