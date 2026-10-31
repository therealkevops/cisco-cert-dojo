import type { Question } from "@/data/types";
import { matchAny } from "./cli-pattern";

/** A learner's answer. Choice indices always refer to the question's original order. */
export type Response =
  | { kind: "single"; pick: number | null }
  | { kind: "multi"; picks: number[] }
  | { kind: "cli"; text: string }
  | { kind: "order"; seq: number[] };

export function emptyResponse(q: Question): Response {
  switch (q.kind) {
    case "single":
      return { kind: "single", pick: null };
    case "multi":
      return { kind: "multi", picks: [] };
    case "cli":
      return { kind: "cli", text: "" };
    case "order":
      return { kind: "order", seq: [] };
  }
}

export function isAnswered(q: Question, r: Response): boolean {
  if (r.kind === "single") return r.pick !== null;
  if (r.kind === "multi") return r.picks.length > 0;
  if (r.kind === "cli") return r.text.trim().length > 0;
  return q.kind === "order" && r.seq.length === q.items.length;
}

export function grade(q: Question, r: Response): boolean {
  if (q.kind === "single" && r.kind === "single") return r.pick === q.answer;
  if (q.kind === "multi" && r.kind === "multi") {
    return r.picks.length === q.answer.length && q.answer.every((a) => r.picks.includes(a));
  }
  if (q.kind === "cli" && r.kind === "cli") return matchAny(q.accept, r.text);
  if (q.kind === "order" && r.kind === "order") return r.seq.length === q.items.length && r.seq.every((v, i) => v === i);
  return false;
}

// Small seeded PRNG so a question keeps the same shuffled order while you look at it.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function shuffled<T>(items: T[], seed: string): T[] {
  const rnd = mulberry32(hash(seed));
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Display permutation of original indices 0..n-1. */
export function permutation(n: number, seed: string): number[] {
  return shuffled(
    Array.from({ length: n }, (_, i) => i),
    seed,
  );
}
