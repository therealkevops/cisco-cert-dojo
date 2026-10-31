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
    // Warm-up ping first, then judge on a second run, as an engineer would.
    net.ping(goal.from, goal.to, 2);
    const r = net.ping(goal.from, goal.to, 3);
    const success = r.probes.some((p) => p.mark === "!");
    const marks = r.probes.map((p) => p.mark).join("") || "error";
    return { goal, ok: success === goal.expect, detail: r.error ?? `ping ${goal.to}: ${marks}` };
  });
}
