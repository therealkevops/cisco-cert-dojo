"use client";

import { useSyncExternalStore } from "react";
import type { Exam } from "@/data/types";

// All progress lives in localStorage under one key. No accounts, no server:
// the app deploys as static pages on Vercel and your data stays in your browser.

export type Card = {
  box: number; // Leitner box 0..5
  due: number; // epoch ms
  seen: number;
  right: number;
  last: number;
};

export type MockResult = {
  exam: string;
  at: number;
  scaled: number; // 300..1000
  pct: number;
  total: number;
  byDomain: Record<string, number>; // domain id -> pct
};

export type Progress = {
  v: 1;
  cards: Record<string, Card>;
  labs: Record<string, { at: number; slips: number }>;
  mocks: MockResult[];
  read: Record<string, number>; // `${exam}:${objective}` -> epoch ms
  wire: Record<string, { at: number }>; // solved Wire Room challenges
  days: string[]; // YYYY-MM-DD with any activity
};

const KEY = "cert-dojo:v1";
const EMPTY: Progress = { v: 1, cards: {}, labs: {}, mocks: [], read: {}, wire: {}, days: [] };

const DAY = 86_400_000;
/** Review interval per Leitner box. Box 0 = "again soon". */
export const BOX_INTERVALS = [10 * 60_000, 1 * DAY, 3 * DAY, 7 * DAY, 16 * DAY, 35 * DAY];

let cache: Progress | null = null;
const listeners = new Set<() => void>();

function load(): Progress {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...EMPTY, ...(JSON.parse(raw) as Progress) } : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function save(next: Progress) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode or quota: progress lives for this tab only.
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Current snapshot outside React (e.g. to build a session queue once). */
export const getProgress = (): Progress => load();

export function useProgress(): Progress {
  return useSyncExternalStore(subscribe, load, () => EMPTY);
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function touchDay(p: Progress): string[] {
  const t = today();
  return p.days.includes(t) ? p.days : [...p.days.slice(-400), t];
}

// --- mutations --------------------------------------------------------------

export function recordAnswer(questionId: string, correct: boolean) {
  const p = load();
  const prev = p.cards[questionId] ?? { box: 0, due: 0, seen: 0, right: 0, last: 0 };
  const box = correct ? Math.min(5, prev.box + 1) : 0;
  const now = Date.now();
  const card: Card = { box, due: now + BOX_INTERVALS[box], seen: prev.seen + 1, right: prev.right + (correct ? 1 : 0), last: now };
  save({ ...p, cards: { ...p.cards, [questionId]: card }, days: touchDay(p) });
}

export function recordLab(labId: string, slips: number) {
  const p = load();
  const prev = p.labs[labId];
  const best = prev ? Math.min(prev.slips, slips) : slips;
  save({ ...p, labs: { ...p.labs, [labId]: { at: Date.now(), slips: best } }, days: touchDay(p) });
}

export function recordWire(scenarioId: string) {
  const p = load();
  if (p.wire[scenarioId]) return;
  save({ ...p, wire: { ...p.wire, [scenarioId]: { at: Date.now() } }, days: touchDay(p) });
}

export function recordMock(result: MockResult) {
  const p = load();
  save({ ...p, mocks: [...p.mocks, result].slice(-50), days: touchDay(p) });
}

export function markRead(examId: string, objectiveId: string) {
  const p = load();
  const k = `${examId}:${objectiveId}`;
  if (p.read[k]) return;
  save({ ...p, read: { ...p.read, [k]: Date.now() }, days: touchDay(p) });
}

export function exportProgress(): string {
  return JSON.stringify(load(), null, 2);
}

export function importProgress(json: string) {
  const parsed = JSON.parse(json) as Progress;
  if (parsed?.v !== 1 || typeof parsed.cards !== "object") throw new Error("Not a Cert Dojo backup");
  save({ ...EMPTY, ...parsed });
}

export function resetProgress() {
  save(EMPTY);
}

// --- derived ----------------------------------------------------------------

/** 0..1 mastery for one objective: mean Leitner box of its questions. Unseen counts as 0. */
export function objectiveMastery(p: Progress, exam: Exam, objectiveId: string): number {
  const qs = exam.questions.filter((q) => q.objective === objectiveId);
  if (!qs.length) return 0;
  return qs.reduce((s, q) => s + (p.cards[q.id]?.box ?? 0), 0) / (qs.length * 5);
}

export function domainMastery(p: Progress, exam: Exam, domainId: string): number {
  const d = exam.domains.find((x) => x.id === domainId);
  if (!d) return 0;
  return d.objectives.reduce((s, o) => s + objectiveMastery(p, exam, o.id), 0) / d.objectives.length;
}

/** Blueprint-weighted readiness, 0..1. */
export function readiness(p: Progress, exam: Exam): number {
  return exam.domains.reduce((s, d) => s + (d.weight / 100) * domainMastery(p, exam, d.id), 0);
}

export function dueCount(p: Progress, exam: Exam, now = Date.now()): number {
  return exam.questions.filter((q) => {
    const c = p.cards[q.id];
    return c && c.due <= now;
  }).length;
}

export function isObjectiveDue(p: Progress, exam: Exam, objectiveId: string, now = Date.now()) {
  return exam.questions.some((q) => q.objective === objectiveId && p.cards[q.id] && p.cards[q.id].due <= now);
}

export function streak(p: Progress): number {
  const set = new Set(p.days);
  let n = 0;
  const d = new Date();
  // A streak survives until the end of today even if you have not trained yet.
  if (!set.has(today())) d.setDate(d.getDate() - 1);
  for (;;) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!set.has(k)) return n;
    n++;
    d.setDate(d.getDate() - 1);
  }
}

export const BELTS = [
  { at: 0, name: "White", color: "#e9e4d8" },
  { at: 0.15, name: "Yellow", color: "#f2c94c" },
  { at: 0.3, name: "Orange", color: "#f2994a" },
  { at: 0.45, name: "Green", color: "#5fb85f" },
  { at: 0.6, name: "Blue", color: "#4a90d9" },
  { at: 0.75, name: "Brown", color: "#8b5a2b" },
  { at: 0.9, name: "Black", color: "#0b0b0b" },
] as const;

export function belt(r: number) {
  let b: (typeof BELTS)[number] = BELTS[0];
  for (const x of BELTS) if (r >= x.at) b = x;
  return b;
}

/** Cisco reports results on a 300–1000 scale. The real cut score is unpublished. */
export function scaledScore(pct: number) {
  return Math.round(300 + 700 * pct);
}
