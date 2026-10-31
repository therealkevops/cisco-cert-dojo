"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { exams, objectiveIndex } from "@/data/catalog";
import type { Exam, Question } from "@/data/types";
import { recordAnswer, recordMock, scaledScore, useProgress, type MockResult } from "@/lib/progress";
import { emptyResponse, grade, isAnswered, shuffled, type Response } from "@/lib/quiz";
import { QuestionCard } from "./QuestionCard";
import { Rich } from "./Rich";

/** Commonly reported cut score. Cisco does not publish one, and it varies by exam form. */
const TARGET = 825;

/** Draw questions in proportion to the blueprint weights. */
function draw(exam: Exam, count: number, seed: string): Question[] {
  const index = objectiveIndex(exam);
  const picked: Question[] = [];
  for (const d of exam.domains) {
    const pool = shuffled(
      exam.questions.filter((q) => index.get(q.objective)?.domain.id === d.id),
      seed + d.id,
    );
    picked.push(...pool.slice(0, Math.round((count * d.weight) / 100)));
  }
  const left = shuffled(
    exam.questions.filter((q) => !picked.includes(q)),
    seed,
  );
  while (picked.length < count && left.length) picked.push(left.pop()!);
  return shuffled(picked.slice(0, count), seed + "order");
}

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

type Run = { qs: Question[]; answers: Response[]; flags: boolean[]; deadline: number; strict: boolean; seed: string };

export function Mock({ examId }: { examId: string }) {
  const exam = exams[examId];
  const p = useProgress();
  const index = useMemo(() => objectiveIndex(exam), [exam]);
  const sizes = useMemo(() => {
    const n = exam.questions.length;
    return [...new Set([Math.min(20, n), Math.min(Math.round(n / 2), n), n])];
  }, [exam]);
  const [size, setSize] = useState(sizes[1] ?? sizes[0]);
  const [strict, setStrict] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [cur, setCur] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [result, setResult] = useState<(MockResult & { qs: Question[]; answers: Response[] }) | null>(null);

  const secsPerQ = (exam.minutes * 60) / exam.approxItems;

  const begin = () => {
    const seed = Math.random().toString(36).slice(2);
    const qs = draw(exam, size, seed);
    setRun({ qs, answers: qs.map(emptyResponse), flags: qs.map(() => false), deadline: Date.now() + qs.length * secsPerQ * 1000, strict, seed });
    setCur(0);
    setResult(null);
  };

  const finish = useCallback(() => {
    if (!run) return;
    const marks = run.qs.map((q, i) => grade(q, run.answers[i]));
    run.qs.forEach((q, i) => {
      if (isAnswered(q, run.answers[i])) recordAnswer(q.id, marks[i]);
    });
    const byDomain: Record<string, number> = {};
    for (const d of exam.domains) {
      const idx = run.qs.map((q, i) => (index.get(q.objective)?.domain.id === d.id ? i : -1)).filter((i) => i >= 0);
      if (idx.length) byDomain[d.id] = idx.filter((i) => marks[i]).length / idx.length;
    }
    // Weight the score by the blueprint so it is not skewed by the draw.
    const covered = exam.domains.filter((d) => byDomain[d.id] !== undefined);
    const wsum = covered.reduce((s, d) => s + d.weight, 0);
    const pct = covered.reduce((s, d) => s + d.weight * byDomain[d.id], 0) / (wsum || 1);
    const res: MockResult = { exam: exam.id, at: Date.now(), scaled: scaledScore(pct), pct, total: run.qs.length, byDomain };
    recordMock(res);
    setResult({ ...res, qs: run.qs, answers: run.answers });
    setRun(null);
  }, [run, exam, index]);

  useEffect(() => {
    if (!run) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [run]);

  useEffect(() => {
    if (run && now >= run.deadline) finish();
  }, [now, run, finish]);

  // ---- results --------------------------------------------------------------
  if (result) {
    const pass = result.scaled >= TARGET;
    const misses = result.qs.map((q, i) => ({ q, r: result.answers[i], ok: grade(q, result.answers[i]) })).filter((x) => !x.ok);
    return (
      <main className="page">
        <section className="hero">
          <div>
            <span className="silk">
              {exam.short} mock · {result.total} items · scaled 300–1000
            </span>
            <div className="score-big num" style={{ color: pass ? "var(--green)" : "var(--red)" }}>
              {result.scaled}
              <small>/1000</small>
            </div>
            <p className="lede">
              {pass ? "Above" : "Below"} the ~{TARGET} line people commonly report. Cisco does not publish cut scores, so treat this as a
              rough guide and not a promise.
            </p>
          </div>
          <div className="switches">
            <button className="sw primary" onClick={() => setResult(null)}>
              New mock
            </button>
            <Link className="sw" href={`/exam/${exam.id}/kata`}>
              Drill misses (kata)
            </Link>
          </div>
        </section>

        <div className="section-head">
          <h3 className="display">By domain</h3>
          <span className="silk">line = {Math.round(((TARGET - 300) / 700) * 100)}% target</span>
        </div>
        <div className="bars">
          {exam.domains.map((d) => {
            const v = result.byDomain[d.id];
            return (
              <div className="bar-row" key={d.id}>
                <span>
                  {d.id} {d.name} <span className="silk">· {d.weight}%</span>
                </span>
                <div className="bar">
                  {v !== undefined && <i className={v >= (TARGET - 300) / 700 ? "g" : "r"} style={{ width: `${v * 100}%` }} />}
                  <span className="target" style={{ left: `${((TARGET - 300) / 700) * 100}%` }} />
                </div>
                <span className="num">{v === undefined ? "–" : `${Math.round(v * 100)}%`}</span>
              </div>
            );
          })}
        </div>

        <div className="section-head">
          <h3 className="display">Review · {misses.length} missed</h3>
        </div>
        {misses.length === 0 && <p className="empty">Clean sheet. Well done.</p>}
        {misses.map(({ q, r }) => (
          <div className="ticket" key={q.id} style={{ marginBottom: 12 }}>
            <div className="ticket-head">
              <span>{q.id}</span>
              <Link href={`/exam/${exam.id}?o=${q.objective}`}>
                {q.objective} {index.get(q.objective)?.objective.title}
              </Link>
            </div>
            <div className="ticket-body">
              <QuestionCard q={q} r={r} onChange={() => {}} revealed seed={q.id} />
            </div>
            <div className="verdict">
              <Rich text={q.explain} />
            </div>
          </div>
        ))}
      </main>
    );
  }

  // ---- in progress ----------------------------------------------------------
  if (run) {
    const q = run.qs[cur];
    const left = run.deadline - now;
    const set = (r: Response) => setRun({ ...run, answers: run.answers.map((a, i) => (i === cur ? r : a)) });
    const answered = run.answers.filter((a, i) => isAnswered(run.qs[i], a)).length;
    const last = cur === run.qs.length - 1;
    return (
      <main className="page">
        <div className="kata" style={{ maxWidth: 900 }}>
          <div className="kata-top">
            <span className="silk">
              {exam.short} mock · {answered}/{run.qs.length} answered{run.strict ? " · strict" : ""}
            </span>
            <span className={`seg7 ${left < 5 * 60_000 ? "low" : ""}`} aria-label="Time remaining">
              {fmt(left)}
            </span>
          </div>

          {!run.strict && (
            <div className="qnav" aria-label="Question navigator">
              {run.qs.map((qq, i) => (
                <button
                  key={qq.id}
                  className={`${i === cur ? "cur" : ""} ${isAnswered(qq, run.answers[i]) ? "ans" : ""} ${run.flags[i] ? "flag" : ""}`}
                  onClick={() => setCur(i)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}

          <div className="ticket">
            <div className="ticket-head">
              <span>
                Item {cur + 1} of {run.qs.length}
              </span>
              {!run.strict && (
                <button
                  className="sw"
                  style={{ padding: "1px 8px" }}
                  onClick={() => setRun({ ...run, flags: run.flags.map((f, i) => (i === cur ? !f : f)) })}
                >
                  {run.flags[cur] ? "⚑ flagged" : "⚐ flag"}
                </button>
              )}
            </div>
            <div className="ticket-body">
              <QuestionCard key={q.id} q={q} r={run.answers[cur]} onChange={set} revealed={false} seed={run.seed} />
            </div>
            <div className="ticket-foot">
              {!run.strict ? (
                <button className="sw" onClick={() => setCur(Math.max(0, cur - 1))} disabled={cur === 0}>
                  ← Prev
                </button>
              ) : (
                <span className="silk">strict: no going back</span>
              )}
              <div className="switches">
                <button
                  className="sw"
                  onClick={() => {
                    if (confirm(`End the exam now? ${run.qs.length - answered} unanswered.`)) finish();
                  }}
                >
                  End exam
                </button>
                {last ? (
                  <button className="sw primary" onClick={finish}>
                    Finish
                  </button>
                ) : (
                  <button className="sw primary" onClick={() => setCur(cur + 1)} disabled={run.strict && !isAnswered(q, run.answers[cur])}>
                    Next →
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ---- setup ------------------------------------------------------------------
  const history = p.mocks.filter((m) => m.exam === exam.id).slice(-8);
  return (
    <main className="page">
      <section className="hero">
        <div>
          <span className="silk">
            {exam.code} · mock exam
          </span>
          <h1 className="display" style={{ fontSize: "clamp(44px, 7vw, 88px)" }}>
            Sit the <em>{exam.short}</em>.
          </h1>
          <p className="lede">
            Questions are drawn in proportion to the blueprint weights and timed at the real exam&apos;s pace (~{Math.round(secsPerQ)}s per item).
            You get no feedback until the end. Strict mode copies Cisco&apos;s rule that you cannot go back.
          </p>
        </div>
      </section>

      <div className="form-row">
        <span className="silk">Items</span>
        <div className="radio-sw" role="radiogroup">
          {sizes.map((n) => (
            <button key={n} role="radio" aria-checked={size === n} className={size === n ? "on" : ""} onClick={() => setSize(n)}>
              {n}
              {n === exam.questions.length ? " (full bank)" : ""}
            </button>
          ))}
        </div>
        <span className="silk num">≈ {Math.round((size * secsPerQ) / 60)} min</span>
      </div>
      <div className="form-row">
        <span className="silk">Mode</span>
        <div className="radio-sw" role="radiogroup">
          <button role="radio" aria-checked={!strict} className={!strict ? "on" : ""} onClick={() => setStrict(false)}>
            Practice (navigate + flag)
          </button>
          <button role="radio" aria-checked={strict} className={strict ? "on" : ""} onClick={() => setStrict(true)}>
            Strict (Cisco rules)
          </button>
        </div>
      </div>
      <div className="form-row">
        <button className="sw primary" onClick={begin} style={{ padding: "10px 18px", fontSize: 13 }}>
          Start exam ▸
        </button>
      </div>

      <div className="section-head">
        <h3 className="display">Previous attempts</h3>
      </div>
      {history.length === 0 ? (
        <p className="empty">No attempts yet.</p>
      ) : (
        <div className="bars">
          {history
            .slice()
            .reverse()
            .map((m) => (
              <div className="bar-row" key={m.at}>
                <span className="num">
                  {new Date(m.at).toLocaleDateString()} · {m.total} items
                </span>
                <div className="bar">
                  <i className={m.scaled >= TARGET ? "g" : "r"} style={{ width: `${((m.scaled - 300) / 700) * 100}%` }} />
                  <span className="target" style={{ left: `${((TARGET - 300) / 700) * 100}%` }} />
                </div>
                <span className="num">{m.scaled}</span>
              </div>
            ))}
        </div>
      )}
    </main>
  );
}
