import { fabricScenarios } from "./fabric";
import { labs } from "./labs";
import { ucsScenarios } from "./ucs";
import { sanScenarios } from "./san";
import { aciScenarios } from "./aci";
import { vpcScenarios } from "./vpc";
import { evpnScenarios } from "./evpn";
import { worksheets } from "./worksheets";
import { scenarios } from "./wire";

/** A hands-on item tied to a blueprint objective: a Wire Room challenge or a console config drill. */
export type Practical = { kind: "wire" | "lab" | "fabric" | "sizing" | "desk" | "ucs" | "san" | "aci" | "vpc" | "evpn"; id: string; exam: string; objective: string; title: string; href: string };

export const practicals: Practical[] = [
  ...scenarios
    .filter((s) => s.kind === "challenge")
    .map((s) => ({ kind: "wire" as const, id: s.id, exam: s.exam, objective: s.objective, title: s.title, href: `/wire/${s.id}` })),
  ...fabricScenarios
    .filter((s) => s.kind === "challenge")
    .map((s) => ({ kind: "fabric" as const, id: s.id, exam: s.exam, objective: s.objective, title: s.title, href: `/fabric/${s.id}` })),
  // A worksheet can practise several objectives; it is listed (and counts) under each of them.
  ...worksheets.flatMap((e) =>
    [e.objective, ...(e.also ?? [])].map((objective) => ({
      kind: (e.area ?? "sizing") as "sizing" | "desk",
      id: e.id,
      exam: e.exam,
      objective,
      title: e.title,
      href: `/${e.area ?? "sizing"}/${e.id}`,
    })),
  ),
  ...ucsScenarios.map((s) => ({ kind: "ucs" as const, id: s.id, exam: s.exam, objective: s.objective, title: s.title, href: `/ucs/${s.id}` })),
  ...sanScenarios.map((s) => ({ kind: "san" as const, id: s.id, exam: s.exam, objective: s.objective, title: s.title, href: `/san/${s.id}` })),
  ...aciScenarios.map((s) => ({ kind: "aci" as const, id: s.id, exam: s.exam, objective: s.objective, title: s.title, href: `/aci/${s.id}` })),
  ...vpcScenarios.map((s) => ({ kind: "vpc" as const, id: s.id, exam: s.exam, objective: s.objective, title: s.title, href: `/vpc/${s.id}` })),
  ...evpnScenarios.map((s) => ({ kind: "evpn" as const, id: s.id, exam: s.exam, objective: s.objective, title: s.title, href: `/evpn/${s.id}` })),
  ...labs.map((l) => ({ kind: "lab" as const, id: l.id, exam: l.exam, objective: l.objective, title: l.title, href: `/labs/${l.id}` })),
];

/**
 * Practice built for one exam that also exercises another exam's objective (same hands-on, different
 * blueprint). Keyed by `${kind}:${id}`; each entry adds the item under that exam and objective too.
 */
const CROSS: Record<string, [exam: string, objective: string][]> = {
  // Wire Room: routing and switching protocols that DCCOR expects on NX-OS.
  ...Object.fromEntries(["ospf-area", "ospf-dr", "ospf-mtu", "ospf-passive", "ospf-summary"].map((id) => [`wire:${id}`, [["dccor", "1.1.a"]]])),
  ...Object.fromEntries(["bgp-inbound", "bgp-network", "bgp-outbound", "bgp-remote-as"].map((id) => [`wire:${id}`, [["dccor", "1.1.b"]]])),
  ...Object.fromEntries(["hsrp-track", "hsrp-vip"].map((id) => [`wire:${id}`, [["dccor", "1.1.d"]]])),
  ...Object.fromEntries(["lacp-on", "lacp-passive", "po-access", "stp-root"].map((id) => [`wire:${id}`, [["dccor", "1.2"]]])),
  // Packet-walk troubleshooting of unicast, broadcast (ARP) and flooding.
  ...Object.fromEntries(["wrong-vlan", "pruned-trunk", "roas-trunk", "dead-gateway", "return-route"].map((id) => [`wire:${id}`, [["dccor", "1.5"]]])),
  // DCAI labs that cover DCCOR's AI-networking and compute objectives.
  ...Object.fromEntries(["fab-dscp", "fab-ecn", "fab-ecn-thresholds", "fab-dcqcn", "fab-mtu", "fab-hash", "fab-storm", "fab-optic"].map((id) => [`fabric:${id}`, [["dccor", "4.3"]]])),
  ...Object.fromEntries(["ucs-roce", "ucs-fix", "ucs-power"].map((id) => [`ucs:${id}`, [["dccor", "2.3"]]])),
  "lab:fabric-telemetry": [["dccor", "1.10"]],
  "lab:pfc-watchdog": [["dccor", "4.3"]],
};

/** Every practical including its cross-exam listings. */
export const allPracticals: Practical[] = [
  ...practicals,
  ...practicals.flatMap((x) => (CROSS[`${x.kind}:${x.id}`] ?? []).map(([exam, objective]) => ({ ...x, exam, objective }))),
];

export function practicalsFor(exam: string, objective: string): Practical[] {
  return allPracticals.filter((x) => x.exam === exam && x.objective === objective);
}
