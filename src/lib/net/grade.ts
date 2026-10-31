import { Net } from "./engine";
import { dhcpRequest, type DhcpLease } from "./dhcp";
import { inCidr, parseCidr } from "./ip";
import type { Goal, Topology } from "./types";

// Enough warm-up probes for ARP to settle on every hop, including asymmetric return paths.
const WARM = 8;

export type GoalResult = { goal: Goal; ok: boolean; detail: string };

/** Outcome-based grading: any configuration that produces the right behaviour passes. */
export function gradeGoals(topo: Topology, goals: Goal[]): GoalResult[] {
  return goals.map((goal) => {
    // Fresh network per goal, so one probe's ARP and MAC learning can't help another.
    const net = new Net(topo);
    if (goal.type === "stpRoot") {
      const root = net.stp(goal.vlan).rootOf[goal.device];
      return { goal, ok: root === goal.device, detail: root ? `root for VLAN ${goal.vlan} is ${root}` : `no STP instance for VLAN ${goal.vlan} on ${goal.device}` };
    }
    if (goal.type === "ospfFull") {
      const n = net.ospf().nbrs.find((x) => x.dev === goal.device && x.nbrDev === goal.neighbor);
      return { goal, ok: n?.state === "FULL", detail: n ? `${goal.device}↔${goal.neighbor} is ${n.state}` : `${goal.device} has no OSPF neighbour ${goal.neighbor}` };
    }
    if (goal.type === "ospfRole") {
      const i = net.ospf().ifaces.find((x) => x.dev === goal.device && x.name === goal.iface);
      return { goal, ok: i?.state === goal.role, detail: i ? `${goal.device} ${goal.iface} is ${i.state}` : `${goal.iface} on ${goal.device} isn't running OSPF` };
    }
    if (goal.type === "bundle") {
      const b = net.bundles.find((x) => x.dev === goal.device && x.po === goal.po);
      const why = b?.members.find((m) => m.why)?.why;
      return { goal, ok: !!b?.formed, detail: !b ? `${goal.device} has no ${goal.po}` : b.formed ? `${goal.po} is up` : `${goal.po} is not bundled${why ? `: ${why}` : ""}` };
    }
    if (goal.type === "route") {
      const r = net.routes(goal.device).find((x) => x.prefix === goal.prefix && (!goal.code || x.code === goal.code));
      return { goal, ok: !!r === goal.expect, detail: r ? `${goal.device} has ${r.code} ${r.prefix}` : `${goal.device} has no ${goal.code ?? ""} route for ${goal.prefix}`.replace("  ", " ") };
    }
    if (goal.type === "reachAll") {
      for (const [from, to] of goal.pairs) net.ping(from, to, WARM);
      for (const [from, to] of goal.pairs) {
        const r = net.ping(from, to, 2);
        if (!r.probes.some((p) => p.mark === "!")) return { goal, ok: false, detail: r.error ?? `${from} → ${to}: ${r.probes.map((p) => p.mark).join("")}` };
      }
      return { goal, ok: true, detail: "all pairs reachable together" };
    }
    if (goal.type === "natVia") {
      net.ping(goal.from, goal.to, WARM);
      const r = net.ping(goal.from, goal.to, 2);
      const local = net.l3Ifs(goal.from)[0]?.cidr.ip;
      const e = (net.natTables.get(goal.device) ?? []).find((x) => x.insideLocal === local);
      const ok = r.probes.some((p) => p.mark === "!") && !!e;
      return { goal, ok, detail: !e ? `${goal.device} has no NAT translation for ${goal.from}` : r.error ?? `ping ${goal.to}: ${r.probes.map((p) => p.mark).join("")}` };
    }
    if (goal.type === "dhcp") {
      const res = dhcpRequest(net, goal.host);
      if (!res.ok || !res.lease) return { goal, ok: false, detail: `${goal.host}: ${res.error ?? "no lease"}` };
      const l = res.lease;
      if (goal.within && !inCidr(l.ip, parseCidr(goal.within)!)) return { goal, ok: false, detail: `${goal.host} got ${l.ip}, outside ${goal.within}` };
      if (!goal.to) return { goal, ok: true, detail: `${goal.host} leased ${l.ip}` };
      const t = applyLease(topo, goal.host, l);
      const n2 = new Net(t, net);
      n2.ping(goal.host, goal.to, WARM);
      const r = n2.ping(goal.host, goal.to, 2);
      return { goal, ok: r.probes.some((p) => p.mark === "!"), detail: r.error ?? `${goal.host} (${l.ip}) → ${goal.to}: ${r.probes.map((p) => p.mark).join("")}` };
    }
    if (goal.type === "bgpUp") {
      const ses = net.bgp().sessions.find((x) => x.dev === goal.device && x.peerIp === goal.neighbor);
      return { goal, ok: ses?.state === "Established", detail: !ses ? `${goal.device} has no neighbor ${goal.neighbor}` : ses.state === "Established" ? "Established" : `${ses.state}: ${ses.why}` };
    }
    if (goal.type === "bgpBest") {
      const best = (net.bgp().tables.get(goal.device) ?? []).find((p) => p.prefix === goal.prefix && p.best);
      return { goal, ok: best?.nextHop === goal.nextHop, detail: best ? `best path for ${goal.prefix} is via ${best.nextHop}${best.bestBecause ? ` (${best.bestBecause})` : ""}` : `${goal.device} has no BGP path for ${goal.prefix}` };
    }
    // Warm-up ping first, then judge on a second run, as an engineer would.
    net.ping(goal.from, goal.to, WARM);
    const r = net.ping(goal.from, goal.to, 3);
    const success = r.probes.some((p) => p.mark === "!");
    const marks = r.probes.map((p) => p.mark).join("") || "error";
    return { goal, ok: success === goal.expect, detail: r.error ?? `ping ${goal.to}: ${marks}` };
  });
}

/** Write a DHCP lease into a copy of the topology (host IP and gateway). */
export function applyLease(topo: Topology, host: string, l: Pick<DhcpLease, "ip" | "len" | "gateway">): Topology {
  const t = structuredClone(topo);
  const d = t.devices.find((x) => x.id === host)!;
  d.ports[0].ip = `${l.ip}/${l.len}`;
  d.gateway = l.gateway;
  d.dhcpClient = true;
  return t;
}
