"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { exams, objectiveIndex } from "@/data/catalog";
import type { Exam, Question } from "@/data/types";
import { getProgress, recordAnswer, type Progress } from "@/lib/progress";
import { emptyResponse, grade, isAnswered, shuffled, type Response } from "@/lib/quiz";
import { QuestionCard } from "./QuestionCard";
import { Rich } from "./Rich";

const SESSION = 15;

/** Due cards first (oldest first), then unseen cards spread across domains, then the weakest. */
function buildQueue(exam: Exam, p: Progress, objective: string | null, seed: string): Question[] {
  const now = Date.now();
  const pool = objective ? exam.questions.filter((q) => q.objective === objective) : exam.questions;
  const due = pool.filter((q) => p.cards[q.id] && p.cards[q.id].due <= now).sort((a, b) => p.cards[a.id].due - p.cards[b.id].due);
  const fresh = shuffled(
    pool.filter((q) => !p.cards[q.id]),
    seed,
  );
  const rest = pool
    .filter((q) => p.cards[q.id] && p.cards[q.id].due > now)
    .sort((a, b) => p.cards[a.id].box - p.cards[b.id].box || p.cards[a.id].last - p.cards[b.id].last);
  const limit = objective ? pool.length : SESSION;
  return [...due, ...fresh, ...rest].slice(0, limit);
}

export function Kata({ examId }: { examId: string }) {
  const exam = exams[examId];
  const params = useSearchParams();
  const objective = params.get("o");
  const index = useMemo(() => objectiveIndex(exam), [exam]);
  const [seed] = useState(() => Math.random().toString(36).slice(2));
  const [queue, setQueue] = useState<Question[] | null>(null);
  const [i, setI] = useState(0);
  const [r, setR] = useState<Response | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<boolean[]>([]);

  const start = useCallback(() => {
    const q = buildQueue(exam, getProgress(), objective, seed + Date.now());
    setQueue(q);
    setI(0);
    setResults([]);
    setRevealed(false);
    setR(q[0] ? emptyResponse(q[0]) : null);
  }, [exam, objective, seed]);

  useEffect(start, [start]);

  const q = queue?.[i];
  const finished = queue && i >= queue.length;

  const submit = useCallback(() => {
    if (!q || !r || revealed || !isAnswered(q, r)) return;
    const ok = grade(q, r);
    recordAnswer(q.id, ok);
    setResults((x) => [...x, ok]);
    setRevealed(true);
  }, [q, r, revealed]);

  const next = useCallback(() => {
    if (!queue) return;
    const n = i + 1;
    setI(n);
    setRevealed(false);
    setR(queue[n] ? emptyResponse(queue[n]) : null);
  }, [i, queue]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.defaultPrevented) return;
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.closest(".cmdbar")) return;
      if (t.tagName === "A") return;
      e.preventDefault();
      if (revealed) next();
      else submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, next, submit]);

  if (!queue) return <main className="page kata empty">Loading the dojo…</main>;

  const title = objective && index.get(objective) ? `${objective} ${index.get(objective)!.objective.title}` : `${exam.short} kata`;

  if (finished || !q || !r) {
    const right = results.filter(Boolean).length;
    return (
      <main className="page">
        <div className="kata">
          <span className="silk">{title}</span>
          <h2 className="display" style={{ margin: "10px 0 18px" }}>
            {queue.length === 0 ? (
              <>Nothing in the queue.</>
            ) : (
              <>
                Session closed: <em>{right}</em>/{results.length}
              </>
            )}
          </h2>
          <div className="pips" style={{ marginBottom: 22 }}>
            {results.map((ok, k) => (
              <i key={k} className={ok ? "ok" : "bad"} />
            ))}
          </div>
          <p className="lede">
            Correct answers move a card up a Leitner box (next review in 1, 3, 7, 16 then 35 days). A miss sends it back to box 0, and it
            comes round again in about ten minutes.
          </p>
          <div className="switches" style={{ justifyContent: "flex-start", marginTop: 18 }}>
            <button className="sw primary" onClick={start}>
              Another round
            </button>
            <Link className="sw" href={`/exam/${exam.id}${objective ? `?o=${objective}` : ""}`}>
              Back to blueprint
            </Link>
            <Link className="sw" href="/">
              Rack
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const meta = index.get(q.objective)!;
  const ok = revealed ? results[results.length - 1] : null;

  return (
    <main className="page">
      <div className="kata">
        <div className="kata-top">
          <span className="silk">{title}</span>
          <div className="pips" aria-label={`Question ${i + 1} of ${queue.length}`}>
            {queue.map((_, k) => (
              <i key={k} className={k < results.length ? (results[k] ? "ok" : "bad") : k === i ? "cur" : ""} />
            ))}
          </div>
        </div>

        <div className="ticket">
          <div className="ticket-head">
            <span>
              Q{String(i + 1).padStart(2, "0")} · {q.kind === "cli" ? "CLI" : q.kind === "order" ? "ORDER" : q.kind === "multi" ? "MULTI" : "SINGLE"}
            </span>
            <Link href={`/exam/${exam.id}?o=${q.objective}`}>
              {q.objective} {meta.objective.title}
            </Link>
          </div>
          <div className="ticket-body">
            <QuestionCard q={q} r={r} onChange={setR} revealed={revealed} seed={seed} onSubmit={revealed ? next : submit} />
          </div>
          {revealed && (
            <div className="verdict" aria-live="polite">
              <span className={`tag ${ok ? "ok" : "bad"}`}>{ok ? "CORRECT" : "MISS"}</span>
              <Rich text={q.explain} />
            </div>
          )}
          <div className="ticket-foot">
            <span className="silk">{revealed ? "enter → next" : "1–4 / A–D to pick · enter to submit"}</span>
            {revealed ? (
              <button className="sw primary" onClick={next}>
                Next →
              </button>
            ) : (
              <button className="sw primary" onClick={submit} disabled={!isAnswered(q, r)}>
                Submit
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
