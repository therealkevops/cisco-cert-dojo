import { fabricScenarios } from "./fabric";
import { labs } from "./labs";
import { sizingExercises } from "./sizing";
import { scenarios } from "./wire";

/** A hands-on item tied to a blueprint objective: a Wire Room challenge or a console config drill. */
export type Practical = { kind: "wire" | "lab" | "fabric" | "sizing"; id: string; exam: string; objective: string; title: string; href: string };

export const practicals: Practical[] = [
  ...scenarios
    .filter((s) => s.kind === "challenge")
    .map((s) => ({ kind: "wire" as const, id: s.id, exam: s.exam, objective: s.objective, title: s.title, href: `/wire/${s.id}` })),
  ...fabricScenarios
    .filter((s) => s.kind === "challenge")
    .map((s) => ({ kind: "fabric" as const, id: s.id, exam: s.exam, objective: s.objective, title: s.title, href: `/fabric/${s.id}` })),
  ...sizingExercises.map((e) => ({ kind: "sizing" as const, id: e.id, exam: e.exam, objective: e.objective, title: e.title, href: `/sizing/${e.id}` })),
  ...labs.map((l) => ({ kind: "lab" as const, id: l.id, exam: l.exam, objective: l.objective, title: l.title, href: `/labs/${l.id}` })),
];

export function practicalsFor(exam: string, objective: string): Practical[] {
  return practicals.filter((x) => x.exam === exam && x.objective === objective);
}
