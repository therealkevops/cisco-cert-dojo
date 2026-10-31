import { BCAST, type L3If, type Net, type SimEvent } from "./engine";
import { cidrNet, inCidr, intToIp, ipToInt, maskOf, parseCidr } from "./ip";
import { segmentOf } from "./ospf";
import type { Device, DhcpPool } from "./types";

// DHCP as a decision model. The client's DISCOVER broadcast reaches whatever
// shares its broadcast domain; a router there either serves it from a local
// pool or relays it (ip helper-address) as unicast to a server, which picks
// the pool from the relay's giaddr. Every decision becomes a packet-walk event.

export type DhcpLease = { ip: string; len: number; gateway?: string; dns?: string; server: string; serverDev: string; pool: string; relay?: string };
export type DhcpResult = { ok: boolean; lease?: DhcpLease; events: SimEvent[]; error?: string };

export type DhcpBinding = { ip: string; mac: string; client: string; pool: string; iface: string };

let eid = 1_000_000;

function poolFor(d: Device, addr: string): DhcpPool | undefined {
  return d.dhcp?.pools.find((p) => p.network && inCidr(addr, parseCidr(p.network)!));
}

/** Follow routing hop by hop from a device to an IP. ACLs are not applied to relayed DHCP here. */
export function pathTo(net: Net, from: string, dst: string): { ok: true; owner: string } | { ok: false; at: string; why: string } {
  let cur = from;
  for (let hop = 0; hop < 16; hop++) {
    if (net.l3Ifs(cur).some((i) => i.up && i.cidr.ip === dst)) return { ok: true, owner: cur };
    const r = net.resolve(cur, dst);
    if ("error" in r) return { ok: false, at: cur, why: r.error };
    const nextDev = segmentOf(net, r.iface).find((i) => i.cidr.ip === r.nextHop && i.dev !== cur)?.dev;
    if (!nextDev) return { ok: false, at: cur, why: `next hop ${r.nextHop} isn't reachable on ${r.iface.name}` };
    cur = nextDev;
  }
  return { ok: false, at: cur, why: "routing loop" };
}

/** Runs DISCOVER/OFFER/REQUEST/ACK for a host's NIC and records the binding on the server. */
export function dhcpRequest(net: Net, host: string): DhcpResult {
  const events: SimEvent[] = [];
  const mac = net.macOf(host, net.device(host).ports[0].name);
  const xid = parseInt(mac.replace(/\./g, "").slice(-6), 16);
  const ev = (dev: string, kind: SimEvent["kind"], note: string, msg: NonNullable<SimEvent["frame"]["dhcp"]>, dir: SimEvent["dir"] = "out") =>
    events.push({ id: eid++, probe: 0, dev, kind, note, dir, frame: { src: dir === "out" ? mac : "", dst: msg.dstIp === "255.255.255.255" ? BCAST : "", dhcp: msg } });

  const nic = net.device(host).ports[0];
  if (!net.linkUp(host, nic.name)) {
    ev(host, "drop", `my NIC ${nic.name} is down, so the DISCOVER never leaves`, { op: "DISCOVER", srcIp: "0.0.0.0", dstIp: "255.255.255.255", xid, chaddr: mac });
    return { ok: false, events, error: "media disconnected" };
  }
  ev(host, "tx", `I have no address yet, so I broadcast DHCPDISCOVER from 0.0.0.0 to 255.255.255.255 (UDP 68 → 67), asking any server to offer one`, {
    op: "DISCOVER",
    srcIp: "0.0.0.0",
    dstIp: "255.255.255.255",
    xid,
    chaddr: mac,
  });

  // Who hears the broadcast? Every L3 interface in this broadcast domain.
  const start = { dev: host, name: nic.name, kind: "port", up: true, mac, cidr: parseCidr("0.0.0.0/32")! } as L3If;
  const heard = segmentOf(net, start).filter((i) => i.dev !== host && !net.isHost(net.device(i.dev)));
  if (!heard.length) {
    ev(host, "drop", `the broadcast reached no router or L3 switch in my VLAN, so nobody can answer or relay it`, { op: "DISCOVER", srcIp: "0.0.0.0", dstIp: "255.255.255.255", xid, chaddr: mac });
    return { ok: false, events, error: "no DHCPOFFER received" };
  }

  type Offer = { server: L3If & { dev: string }; serverDev: Device; pool: DhcpPool; giaddr?: string; relay?: L3If };
  const offers: Offer[] = [];
  for (const i of heard) {
    const d = net.device(i.dev);
    // A local server answers when a pool covers the receiving interface's subnet.
    const local = d.kind !== "switch" ? poolFor(d, i.cidr.ip) : undefined;
    if (local) {
      ev(i.dev, "proc", `${i.name} receives the DISCOVER. My pool ${local.name} (${local.network}) covers this interface's subnet, so I can serve it directly`, {
        op: "DISCOVER",
        srcIp: "0.0.0.0",
        dstIp: "255.255.255.255",
        xid,
        chaddr: mac,
      });
      offers.push({ server: i, serverDev: d, pool: local });
      continue;
    }
    const port = i.name.startsWith("Vlan") ? d.svis?.find((s) => `Vlan${s.vlan}` === i.name) : d.ports.find((p) => p.name === i.name);
    const helpers = port?.helpers ?? [];
    if (!helpers.length) {
      ev(i.dev, "ignore", `${i.name} hears the DISCOVER but has no DHCP pool for ${cidrNet(i.cidr)} and no ip helper-address, so the broadcast stops here (routers don't forward broadcasts)`, {
        op: "DISCOVER",
        srcIp: "0.0.0.0",
        dstIp: "255.255.255.255",
        xid,
        chaddr: mac,
      });
      continue;
    }
    for (const h of helpers) {
      ev(i.dev, "proc", `${i.name} has ip helper-address ${h}: I relay the DISCOVER as unicast from ${i.cidr.ip} to ${h}, setting giaddr = ${i.cidr.ip} so the server knows which subnet the client is on`, {
        op: "DISCOVER",
        srcIp: i.cidr.ip,
        dstIp: h,
        xid,
        chaddr: mac,
        giaddr: i.cidr.ip,
        relayed: true,
      });
      const there = pathTo(net, i.dev, h);
      if (!there.ok) {
        ev(there.at, "drop", `the relayed DISCOVER toward ${h} dies here: ${there.why}`, { op: "DISCOVER", srcIp: i.cidr.ip, dstIp: h, xid, chaddr: mac, giaddr: i.cidr.ip, relayed: true });
        continue;
      }
      const sd = net.device(there.owner);
      if (!sd.dhcp?.pools.length) {
        ev(there.owner, "drop", `${h} is ${there.owner}, which isn't running a DHCP server, so the relayed DISCOVER is ignored`, { op: "DISCOVER", srcIp: i.cidr.ip, dstIp: h, xid, chaddr: mac, giaddr: i.cidr.ip, relayed: true });
        continue;
      }
      const pool = poolFor(sd, i.cidr.ip);
      if (!pool) {
        ev(there.owner, "drop", `DHCPD: there is no pool for ${i.cidr.ip} (the giaddr). None of my pools' networks contains the relay's subnet, so no offer is made`, {
          op: "DISCOVER",
          srcIp: i.cidr.ip,
          dstIp: h,
          xid,
          chaddr: mac,
          giaddr: i.cidr.ip,
          relayed: true,
        });
        continue;
      }
      const back = pathTo(net, there.owner, i.cidr.ip);
      if (!back.ok) {
        ev(back.at, "drop", `the server picked pool ${pool.name}, but its OFFER can't get back to the relay ${i.cidr.ip}: ${back.why}`, { op: "OFFER", srcIp: h, dstIp: i.cidr.ip, xid, chaddr: mac, giaddr: i.cidr.ip }, "back");
        continue;
      }
      const srv = net.l3Ifs(there.owner).find((x) => x.cidr.ip === h)!;
      offers.push({ server: srv, serverDev: sd, pool, giaddr: i.cidr.ip, relay: i });
    }
  }

  for (const o of offers) {
    const lease = allocate(net, o.serverDev, o.pool, host, mac, events, o.server.name);
    if (!lease) continue;
    const giaddr = o.giaddr;
    const via = giaddr ? ` via relay ${o.relay!.dev} (${giaddr})` : "";
    ev(o.serverDev.id, "tx", `DHCPOFFER ${lease.ip}/${lease.len} from pool ${o.pool.name}${via}${o.pool.gateway ? `, default-router ${o.pool.gateway}` : ", with NO default-router option"}`, {
      op: "OFFER",
      srcIp: o.server.cidr.ip,
      dstIp: giaddr ?? "255.255.255.255",
      xid,
      chaddr: mac,
      yiaddr: lease.ip,
      giaddr,
      server: o.server.cidr.ip,
    }, "back");
    ev(host, "tx", `I accept the first offer and broadcast DHCPREQUEST for ${lease.ip}, naming server ${o.server.cidr.ip} (other servers withdraw their offers)`, {
      op: "REQUEST",
      srcIp: "0.0.0.0",
      dstIp: "255.255.255.255",
      xid,
      chaddr: mac,
      yiaddr: lease.ip,
      server: o.server.cidr.ip,
    });
    ev(o.serverDev.id, "tx", `DHCPACK: ${lease.ip} is bound to ${mac}`, { op: "ACK", srcIp: o.server.cidr.ip, dstIp: giaddr ?? "255.255.255.255", xid, chaddr: mac, yiaddr: lease.ip, giaddr, server: o.server.cidr.ip }, "back");
    ev(host, "deliver", `Lease received: ${lease.ip}/${lease.len}${lease.gateway ? `, gateway ${lease.gateway}` : ", no default gateway (I can only reach my own subnet)"}${lease.dns ? `, DNS ${lease.dns}` : ""}`, {
      op: "ACK",
      srcIp: o.server.cidr.ip,
      dstIp: "255.255.255.255",
      xid,
      chaddr: mac,
      yiaddr: lease.ip,
    }, "back");
    return { ok: true, events, lease: { ...lease, server: o.server.cidr.ip, serverDev: o.serverDev.id, pool: o.pool.name, relay: giaddr } };
  }
  ev(host, "drop", `no DHCPOFFER arrived. Windows-style clients fall back to an APIPA address (169.254.x.x), which is a sure sign DHCP failed`, { op: "DISCOVER", srcIp: "0.0.0.0", dstIp: "255.255.255.255", xid, chaddr: mac });
  return { ok: false, events, error: "no DHCPOFFER received" };
}

function allocate(net: Net, sd: Device, pool: DhcpPool, host: string, mac: string, events: SimEvent[], iface: string): Omit<DhcpLease, "server" | "serverDev" | "pool"> | null {
  const c = parseCidr(pool.network!)!;
  const bindings = net.dhcpBindings.get(sd.id) ?? [];
  net.dhcpBindings.set(sd.id, bindings);
  const mine = bindings.find((b) => b.mac === mac && b.pool === pool.name);
  const opts = { len: c.len, gateway: pool.gateway, dns: pool.dns };
  if (mine) return { ip: mine.ip, ...opts };

  const excluded = (n: number) => (sd.dhcp?.excluded ?? []).some((e) => n >= ipToInt(e.start) && n <= ipToInt(e.end));
  // Addresses configured statically anywhere (what a real server's ping check would find).
  const inUse = new Map<string, string>();
  for (const d of net.devices) for (const i of net.l3Ifs(d.id)) if (d.id !== host) inUse.set(i.cidr.ip, d.id);
  const conflicts = net.dhcpConflicts.get(sd.id) ?? [];
  net.dhcpConflicts.set(sd.id, conflicts);
  const first = (c.net + 1) >>> 0;
  const last = ((c.net | ~maskOf(c.len)) - 1) >>> 0;
  for (let n = first; n <= last; n++) {
    const ip = intToIp(n);
    if (excluded(n) || bindings.some((b) => b.ip === ip) || conflicts.includes(ip)) continue;
    const owner = inUse.get(ip);
    if (owner) {
      if (owner !== sd.id) {
        conflicts.push(ip);
        events.push({
          id: eid++,
          probe: 0,
          dev: sd.id,
          kind: "proc",
          dir: "ctl",
          note: `ping check: ${ip} answered (it's configured on ${owner}), so it's recorded as a conflict and skipped. Exclude statically assigned addresses from the pool`,
          frame: { src: "", dst: "" },
        });
      }
      continue;
    }
    bindings.push({ ip, mac, client: host, pool: pool.name, iface });
    return { ip, ...opts };
  }
  events.push({ id: eid++, probe: 0, dev: sd.id, kind: "drop", dir: "ctl", note: `pool ${pool.name} has no free addresses left`, frame: { src: "", dst: "" } });
  return null;
}

/** DHCPRELEASE: the server forgets the client's binding. */
export function dhcpRelease(net: Net, host: string) {
  const mac = net.macOf(host, net.device(host).ports[0].name);
  for (const [dev, list] of net.dhcpBindings) net.dhcpBindings.set(dev, list.filter((b) => b.mac !== mac));
}

export function apipa(net: Net, host: string): string {
  const mac = net.macOf(host, net.device(host).ports[0].name).replace(/\./g, "");
  return `169.254.${parseInt(mac.slice(2, 4), 16) || 1}.${(parseInt(mac.slice(-2), 16) % 253) + 1}`;
}
