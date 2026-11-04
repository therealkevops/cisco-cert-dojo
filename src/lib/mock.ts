// Mock exam logic: drawing items, saving an exam in progress, and turning results and mastery into a
// readiness estimate and a study plan.

import { objectiveIndex } from "@/data/catalog";
import { practicalsFor, type Practical } from "@/data/practice";
import type { Exam, Question } from "@/data/types";
import { objectiveMastery, practicalDone, scaledScore, type MockResult, type Progress } from "./progress";
import { shuffled, type Response } from "./quiz";

/** Commonly reported cut score. Cisco does not publish one, and it varies by exam form. */
export const TARGET = 825;
export const TARGET_PCT = (TARGET - 300) / 700;

/**
 * Blueprint-weighted draw: each domain gets items in proportion to its weight, and within a domain the
 * items are dealt round-robin across its objectives so one objective can't dominate.
 */
export function drawBlueprint(exam: Exam, count: number, seed: string): Question[] {
  const index = objectiveIndex(exam);
  const picked: Question[] = [];
  const quotas = exam.domains.map((d) => ({ d, n: Math.round((count * d.weight) / 100) }));
  for (const { d, n } of quotas) picked.push(...roundRobin(d.objectives.map((o) => o.id), exam, n, seed + d.id, picked));
  // Rounding can leave the total off by one or two: top up (or trim) from the whole bank.
  const left = shuffled(exam.questions.filter((q) => !picked.includes(q) && index.has(q.objective)), seed + "fill");
  while (picked.length < count && left.length) picked.push(left.pop()!);
  return shuffled(picked.slice(0, count), seed + "order");
}

/** Weak-spot draw: objectives are weighted by how far their mastery is from complete. */
export function drawWeak(exam: Exam, p: Progress, count: number, seed: string): Question[] {
  const objs = exam.domains.flatMap((d) => d.objectives.map((o) => o.id));
  const gaps = objs.map((id) => ({ id, gap: 1 - objectiveMastery(p, exam, id) + 0.05 }));
  const total = gaps.reduce((s, g) => s + g.gap, 0);
  const picked: Question[] = [];
  for (const g of gaps.sort((a, b) => b.gap - a.gap)) {
    const n = Math.round((count * g.gap) / total);
    // Prefer items not yet in the top box.
    const pool = shuffled(
      exam.questions.filter((q) => q.objective === g.id),
      seed + g.id,
    ).sort((a, b) => (p.cards[a.id]?.box ?? 0) - (p.cards[b.id]?.box ?? 0));
    picked.push(...pool.slice(0, n));
  }
  const left = shuffled(exam.questions.filter((q) => !picked.includes(q)), seed + "fill");
  while (picked.length < count && left.length) picked.push(left.pop()!);
  return shuffled(picked.slice(0, count), seed + "order");
}

function roundRobin(objIds: string[], exam: Exam, n: number, seed: string, taken: Question[]): Question[] {
  const pools = shuffled(objIds, seed).map((id) => shuffled(exam.questions.filter((q) => q.objective === id && !taken.includes(q)), seed + id));
  const out: Question[] = [];
  for (let round = 0; out.length < n && pools.some((pl) => pl.length > round); round++) for (const pl of pools) if (out.length < n && pl[round]) out.push(pl[round]);
  return out;
}

// ---------------------------------------------------------------------------- saved run

export type SavedRun = { examId: string; kind: "full" | "weak"; ids: string[]; answers: Response[]; flags: boolean[]; deadline: number; started: number; strict: boolean; seed: string; spent: number[]; cur: number };
const runKey = (examId: string) => `cert-dojo:mock-run:${examId}`;

export function saveRun(r: SavedRun) {
  try {
    localStorage.setItem(runKey(r.examId), JSON.stringify(r));
  } catch {
    /* storage full or blocked: the exam still runs, it just won't survive a reload */
  }
}
export function loadRun(examId: string): SavedRun | null {
  try {
    const raw = localStorage.getItem(runKey(examId));
    return raw ? (JSON.parse(raw) as SavedRun) : null;
  } catch {
    return null;
  }
}
export function clearRun(examId: string) {
  try {
    localStorage.removeItem(runKey(examId));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------- readiness and plan

export type DomainReadiness = { id: string; name: string; weight: number; mastery: number; mock?: number; blended: number };

/** Mean of the last few full mocks for one domain, most recent weighted highest. */
function recentMock(p: Progress, examId: string, domainId: string): number | undefined {
  const ms = p.mocks.filter((m) => m.exam === examId && m.kind !== "weak" && m.byDomain[domainId] !== undefined).slice(-3);
  if (!ms.length) return undefined;
  const w = ms.map((_, i) => i + 1);
  return ms.reduce((s, m, i) => s + m.byDomain[domainId] * w[i], 0) / w.reduce((a, b) => a + b, 0);
}

/** Per-domain readiness: mastery (cards and hands-on) blended 50/50 with recent mock results when there are any. */
export function domainReadiness(p: Progress, exam: Exam): DomainReadiness[] {
  return exam.domains.map((d) => {
    const mastery = d.objectives.reduce((s, o) => s + objectiveMastery(p, exam, o.id), 0) / d.objectives.length;
    const mock = recentMock(p, exam.id, d.id);
    return { id: d.id, name: d.name, weight: d.weight, mastery, mock, blended: mock === undefined ? mastery : (mastery + mock) / 2 };
  });
}

export function predictedScaled(rows: DomainReadiness[]) {
  return scaledScore(rows.reduce((s, r) => s + (r.weight / 100) * r.blended, 0));
}

export type PlanItem = { objective: string; title: string; domain: string; weight: number; score: number; reason: string; practicals: Practical[] };

/**
 * Rank objectives to study next. The score is the expected exam points at stake: the domain's weight
 * spread over its objectives, times how far the objective is from mastered, nudged up by misses in the
 * latest mock.
 */
export function studyPlan(p: Progress, exam: Exam, latest?: { byObjective?: Record<string, [number, number]> }, limit = 6): PlanItem[] {
  const items: PlanItem[] = [];
  for (const d of exam.domains)
    for (const o of d.objectives) {
      const m = objectiveMastery(p, exam, o.id);
      const mk = latest?.byObjective?.[o.id];
      const missRate = mk && mk[1] ? 1 - mk[0] / mk[1] : undefined;
      const gap = missRate === undefined ? 1 - m : (1 - m + missRate) / 2;
      const ps = practicalsFor(exam.id, o.id).filter((x) => !practicalDone(p, x));
      const reason = [missRate !== undefined ? `${mk![0]}/${mk![1]} right in this mock` : "", `${Math.round(m * 100)}% mastered`, ps.length ? `${ps.length} hands-on item${ps.length === 1 ? "" : "s"} not done` : ""].filter(Boolean).join(" · ");
      items.push({ objective: o.id, title: o.title, domain: d.id, weight: d.weight, score: (d.weight / d.objectives.length) * gap, reason, practicals: ps.slice(0, 3) });
    }
  return items.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function byObjective(qs: Question[], marks: boolean[]): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  qs.forEach((q, i) => {
    const cur = out[q.objective] ?? [0, 0];
    out[q.objective] = [cur[0] + (marks[i] ? 1 : 0), cur[1] + 1];
  });
  return out;
}

export type { MockResult };
