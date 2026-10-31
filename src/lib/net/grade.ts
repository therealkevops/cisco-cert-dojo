import { Net } from "./engine";
import type { Goal, Topology } from "./types";

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
    // Warm-up ping first, then judge on a second run, as an engineer would.
    net.ping(goal.from, goal.to, 2);
    const r = net.ping(goal.from, goal.to, 3);
    const success = r.probes.some((p) => p.mark === "!");
    const marks = r.probes.map((p) => p.mark).join("") || "error";
    return { goal, ok: success === goal.expect, detail: r.error ?? `ping ${goal.to}: ${marks}` };
  });
}
