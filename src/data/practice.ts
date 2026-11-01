import { fabricScenarios } from "./fabric";
import { labs } from "./labs";
import { ucsScenarios } from "./ucs";
import { worksheets } from "./worksheets";
import { scenarios } from "./wire";

/** A hands-on item tied to a blueprint objective: a Wire Room challenge or a console config drill. */
export type Practical = { kind: "wire" | "lab" | "fabric" | "sizing" | "desk" | "ucs"; id: string; exam: string; objective: string; title: string; href: string };

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
  ...labs.map((l) => ({ kind: "lab" as const, id: l.id, exam: l.exam, objective: l.objective, title: l.title, href: `/labs/${l.id}` })),
];

export function practicalsFor(exam: string, objective: string): Practical[] {
  return practicals.filter((x) => x.exam === exam && x.objective === objective);
}
