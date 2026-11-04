"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { exams, objectiveIndex } from "@/data/catalog";
import type { Question } from "@/data/types";
import { byObjective, clearRun, domainReadiness, drawBlueprint, drawWeak, loadRun, predictedScaled, saveRun, studyPlan, TARGET, TARGET_PCT, type PlanItem, type SavedRun } from "@/lib/mock";
import { recordAnswer, recordMock, scaledScore, useProgress, type MockResult } from "@/lib/progress";
import { emptyResponse, grade, isAnswered, type Response } from "@/lib/quiz";
import { QuestionCard } from "./QuestionCard";
import { Rich } from "./Rich";

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  return `${h ? `${h}:` : ""}${mm}:${String(s % 60).padStart(2, "0")}`;
}

type Run = SavedRun & { qs: Question[] };
type Result = MockResult & { qs: Question[]; answers: Response[]; flags: boolean[]; spent: number[] };

export function Mock({ examId }: { examId: string }) {
  const exam = exams[examId];
  const p = useProgress();
  const index = useMemo(() => objectiveIndex(exam), [exam]);
  const byId = useMemo(() => new Map(exam.questions.map((q) => [q.id, q])), [exam]);
  const sizes = useMemo(() => {
    const n = exam.questions.length;
    return [...new Set([Math.min(20, n), Math.min(Math.round(exam.approxItems / 2), n), Math.min(exam.approxItems, n)])];
  }, [exam]);
  const [size, setSize] = useState(sizes[1] ?? sizes[0]);
  const [strict, setStrict] = useState(false);
  const [kind, setKind] = useState<"full" | "weak">("full");
  const [run, setRun] = useState<Run | null>(null);
  const [saved, setSaved] = useState<SavedRun | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [result, setResult] = useState<Result | null>(null);
  const entered = useRef(Date.now());

  const secsPerQ = (exam.minutes * 60) / exam.approxItems;

  useEffect(() => {
    const s = loadRun(exam.id);
    if (s && s.ids.every((id) => byId.has(id))) setSaved(s);
    else if (s) clearRun(exam.id);
  }, [exam.id, byId]);

  const begin = () => {
    const seed = Math.random().toString(36).slice(2);
    const qs = kind === "weak" ? drawWeak(exam, p, size, seed) : drawBlueprint(exam, size, seed);
    const r: Run = { examId: exam.id, kind, ids: qs.map((q) => q.id), qs, answers: qs.map(emptyResponse), flags: qs.map(() => false), started: Date.now(), deadline: Date.now() + qs.length * secsPerQ * 1000, strict, seed, spent: qs.map(() => 0), cur: 0 };
    entered.current = Date.now();
    setRun(r);
    setSaved(null);
    setResult(null);
  };

  const resume = (s: SavedRun) => {
    entered.current = Date.now();
    setRun({ ...s, qs: s.ids.map((id) => byId.get(id)!) });
    setSaved(null);
  };

  /** Add the time spent on the current item since it was shown. */
  const charge = useCallback((r: Run): Run => {
    const t = Date.now();
    const spent = r.spent.map((x, i) => (i === r.cur ? x + Math.max(0, Math.min(t, r.deadline) - entered.current) : x));
    entered.current = t;
    return { ...r, spent };
  }, []);

  const finish = useCallback(
    (from?: Run) => {
      const base = from ?? run;
      if (!base) return;
      const r = from ? base : charge(base);
      const marks = r.qs.map((q, i) => grade(q, r.answers[i]));
      r.qs.forEach((q, i) => {
        if (isAnswered(q, r.answers[i])) recordAnswer(q.id, marks[i]);
      });
      const byDomain: Record<string, number> = {};
      for (const d of exam.domains) {
        const idx = r.qs.map((q, i) => (index.get(q.objective)?.domain.id === d.id ? i : -1)).filter((i) => i >= 0);
        if (idx.length) byDomain[d.id] = idx.filter((i) => marks[i]).length / idx.length;
      }
      // Weight the score by the blueprint so a lucky draw doesn't skew it.
      const covered = exam.domains.filter((d) => byDomain[d.id] !== undefined);
      const wsum = covered.reduce((s, d) => s + d.weight, 0);
      const pct = covered.reduce((s, d) => s + d.weight * byDomain[d.id], 0) / (wsum || 1);
      const res: MockResult = {
        exam: exam.id,
        at: Date.now(),
        scaled: scaledScore(pct),
        pct,
        total: r.qs.length,
        byDomain,
        kind: r.kind,
        byObjective: byObjective(r.qs, marks),
        timeUsed: Math.min(Date.now(), r.deadline) - r.started,
        unanswered: r.qs.filter((q, i) => !isAnswered(q, r.answers[i])).length,
      };
      recordMock(res);
      clearRun(exam.id);
      setResult({ ...res, qs: r.qs, answers: r.answers, flags: r.flags, spent: r.spent });
      setRun(null);
    },
    [run, exam, index, charge],
  );

  useEffect(() => {
    if (!run) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [run]);

  useEffect(() => {
    if (run && now >= run.deadline) finish();
  }, [now, run, finish]);

  // Keep the sitting in storage so a reload or a closed tab can resume it (the clock keeps running).
  useEffect(() => {
    if (run) {
      const { qs: _qs, ...rest } = run;
      void _qs;
      saveRun(rest);
    }
  }, [run]);

  // ---- results --------------------------------------------------------------
  if (result) return <Results exam={exam} result={result} plan={studyPlan(p, exam, result)} onNew={() => setResult(null)} />;

  // ---- in progress ----------------------------------------------------------
  if (run) {
    const q = run.qs[run.cur];
    const left = run.deadline - now;
    const set = (r: Response) => setRun({ ...run, answers: run.answers.map((a, i) => (i === run.cur ? r : a)) });
    const go = (i: number) => setRun({ ...charge(run), cur: i });
    const answered = run.answers.filter((a, i) => isAnswered(run.qs[i], a)).length;
    const last = run.cur === run.qs.length - 1;
    const paceLeft = (run.qs.length - run.cur) * secsPerQ * 1000;
    return (
      <main className="page">
        <div className="kata" style={{ maxWidth: 900 }}>
          <div className="kata-top">
            <span className="silk">
              {exam.short} {run.kind === "weak" ? "weak-spot drill" : "mock"} · {answered}/{run.qs.length} answered{run.strict ? " · strict" : ""}
            </span>
            <span className="mock-clock">
              <span className={`silk ${left < paceLeft * 0.9 ? "mock-behind" : ""}`}>{left < paceLeft * 0.9 ? "behind pace" : "on pace"}</span>
              <span className={`seg7 ${left < 5 * 60_000 ? "low" : ""}`} aria-label="Time remaining">
                {fmt(left)}
              </span>
            </span>
          </div>

          {!run.strict && (
            <div className="qnav" aria-label="Question navigator">
              {run.qs.map((qq, i) => (
                <button key={qq.id} className={`${i === run.cur ? "cur" : ""} ${isAnswered(qq, run.answers[i]) ? "ans" : ""} ${run.flags[i] ? "flag" : ""}`} onClick={() => go(i)}>
                  {i + 1}
                </button>
              ))}
            </div>
          )}

          <div className="ticket">
            <div className="ticket-head">
              <span>
                Item {run.cur + 1} of {run.qs.length}
              </span>
              {!run.strict && (
                <button className="sw" style={{ padding: "1px 8px" }} onClick={() => setRun({ ...run, flags: run.flags.map((f, i) => (i === run.cur ? !f : f)) })}>
                  {run.flags[run.cur] ? "⚑ flagged" : "⚐ flag"}
                </button>
              )}
            </div>
            <div className="ticket-body">
              <QuestionCard key={q.id} q={q} r={run.answers[run.cur]} onChange={set} revealed={false} seed={run.seed} />
            </div>
            <div className="ticket-foot">
              {!run.strict ? (
                <button className="sw" onClick={() => go(Math.max(0, run.cur - 1))} disabled={run.cur === 0}>
                  ← Prev
                </button>
              ) : (
                <span className="silk">strict: no going back</span>
              )}
              <div className="switches">
                <button
                  className="sw"
                  onClick={() => {
                    const flagged = run.flags.filter(Boolean).length;
                    if (confirm(`End the exam now? ${run.qs.length - answered} unanswered${flagged ? `, ${flagged} flagged` : ""}.`)) finish();
                  }}
                >
                  End exam
                </button>
                {last ? (
                  <button className="sw primary" onClick={() => finish()}>
                    Finish
                  </button>
                ) : (
                  <button className="sw primary" onClick={() => go(run.cur + 1)} disabled={run.strict && !isAnswered(q, run.answers[run.cur])}>
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
  const rows = domainReadiness(p, exam);
  const predicted = predictedScaled(rows);
  const plan = studyPlan(p, exam, p.mocks.filter((m) => m.exam === exam.id && m.kind !== "weak").at(-1), 4);
  const history = p.mocks.filter((m) => m.exam === exam.id).slice(-8);
  const expired = saved && saved.deadline <= Date.now();
  return (
    <main className="page">
      <section className="hero">
        <div>
          <span className="silk">{exam.code} · mock exam</span>
          <h1 className="display" style={{ fontSize: "clamp(44px, 7vw, 88px)" }}>
            Sit the <em>{exam.short}</em>.
          </h1>
          <p className="lede">
            Items are drawn in proportion to the blueprint weights, spread across every objective in each domain, and timed at the real exam&apos;s
            pace (~{Math.round(secsPerQ)}s per item). No feedback until the end. Strict mode copies Cisco&apos;s rule that you can&apos;t go back.
          </p>
        </div>
        <div className="readout num" style={{ maxWidth: 360 }}>
          <span>
            <b>predicted</b> <span style={{ color: predicted >= TARGET ? "var(--green)" : undefined }}>{predicted}</span> / 1000
          </span>
          <span>
            <b>target</b> ~{TARGET} (commonly reported; Cisco doesn&apos;t publish cut scores)
          </span>
        </div>
      </section>

      {saved && (
        <div className="mock-resume">
          <span>
            {expired ? "Your unfinished sitting ran out of time while you were away." : `Unfinished ${saved.kind === "weak" ? "weak-spot drill" : "mock"}: ${saved.answers.filter((a, i) => isAnswered(byId.get(saved.ids[i])!, a)).length}/${saved.ids.length} answered, ${fmt(saved.deadline - Date.now())} left.`}
          </span>
          <div className="switches">
            {expired ? (
              <button className="sw primary" onClick={() => finish({ ...saved, qs: saved.ids.map((id) => byId.get(id)!) })}>
                Score it
              </button>
            ) : (
              <button className="sw primary" onClick={() => resume(saved)}>
                Resume
              </button>
            )}
            <button
              className="sw"
              onClick={() => {
                clearRun(exam.id);
                setSaved(null);
              }}
            >
              Discard
            </button>
          </div>
        </div>
      )}

      <div className="section-head">
        <h3 className="display">Readiness by domain</h3>
        <span className="silk">mastery (cards + hands-on), blended with your last mocks · line = {Math.round(TARGET_PCT * 100)}%</span>
      </div>
      <div className="bars">
        {rows.map((r) => (
          <div className="bar-row" key={r.id}>
            <span>
              {r.id} {r.name} <span className="silk">· {r.weight}%</span>
            </span>
            <div className="bar">
              <i className={r.blended >= TARGET_PCT ? "g" : "r"} style={{ width: `${r.blended * 100}%` }} />
              <span className="target" style={{ left: `${TARGET_PCT * 100}%` }} />
            </div>
            <span className="num" title={`mastery ${Math.round(r.mastery * 100)}%${r.mock !== undefined ? `, mocks ${Math.round(r.mock * 100)}%` : ""}`}>
              {Math.round(r.blended * 100)}%
            </span>
          </div>
        ))}
      </div>

      <div className="section-head">
        <h3 className="display">Study next</h3>
        <span className="silk">ranked by exam weight × what you haven&apos;t mastered</span>
      </div>
      <Plan exam={exam.id} plan={plan} />

      <div className="section-head">
        <h3 className="display">Start a sitting</h3>
      </div>
      <div className="form-row">
        <span className="silk">Draw</span>
        <div className="radio-sw" role="radiogroup">
          <button role="radio" aria-checked={kind === "full"} className={kind === "full" ? "on" : ""} onClick={() => setKind("full")}>
            Blueprint (scored mock)
          </button>
          <button role="radio" aria-checked={kind === "weak"} className={kind === "weak" ? "on" : ""} onClick={() => setKind("weak")}>
            Weak spots (practice)
          </button>
        </div>
      </div>
      <div className="form-row">
        <span className="silk">Items</span>
        <div className="radio-sw" role="radiogroup">
          {sizes.map((n) => (
            <button key={n} role="radio" aria-checked={size === n} className={size === n ? "on" : ""} onClick={() => setSize(n)}>
              {n}
              {n === Math.min(exam.approxItems, exam.questions.length) ? " (full length)" : ""}
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
          Start {kind === "weak" ? "drill" : "exam"} ▸
        </button>
        {saved && !expired && <span className="silk">starting a new sitting discards the unfinished one</span>}
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
                  {new Date(m.at).toLocaleDateString()} · {m.total} items{m.kind === "weak" ? " · weak spots" : ""}
                </span>
                <div className="bar">
                  <i className={m.scaled >= TARGET ? "g" : "r"} style={{ width: `${((m.scaled - 300) / 700) * 100}%` }} />
                  <span className="target" style={{ left: `${TARGET_PCT * 100}%` }} />
                </div>
                <span className="num">{m.scaled}</span>
              </div>
            ))}
        </div>
      )}
    </main>
  );
}

function Plan({ exam, plan }: { exam: string; plan: PlanItem[] }) {
  if (!plan.length) return <p className="empty">Nothing left to study. Sit a full mock to confirm.</p>;
  return (
    <ol className="mock-plan">
      {plan.map((x) => (
        <li key={x.objective}>
          <div>
            <b>
              {x.objective} {x.title}
            </b>
            <span className="silk">{x.reason}</span>
          </div>
          <div className="mock-plan-links">
            <Link href={`/exam/${exam}?o=${x.objective}`}>field notes</Link>
            <Link href={`/exam/${exam}/kata?o=${x.objective}`}>kata</Link>
            {x.practicals.map((pr) => (
              <Link key={`${pr.kind}:${pr.id}`} href={pr.href}>
                {pr.title}
              </Link>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Results({ exam, result, plan, onNew }: { exam: (typeof exams)[string]; result: Result; plan: PlanItem[]; onNew: () => void }) {
  const index = useMemo(() => objectiveIndex(exam), [exam]);
  const [filter, setFilter] = useState<"missed" | "flagged" | "all">("missed");
  const pass = result.scaled >= TARGET;
  const rows = result.qs.map((q, i) => ({ q, r: result.answers[i], ok: grade(q, result.answers[i]), flag: result.flags[i], spent: result.spent[i], i }));
  const shown = rows.filter((x) => (filter === "missed" ? !x.ok : filter === "flagged" ? x.flag : true));
  const used = result.timeUsed ?? 0;
  const slow = rows
    .slice()
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 3);
  return (
    <main className="page">
      <section className="hero">
        <div>
          <span className="silk">
            {exam.short} {result.kind === "weak" ? "weak-spot drill" : "mock"} · {result.total} items · scaled 300–1000
          </span>
          <div className="score-big num" style={{ color: pass ? "var(--green)" : "var(--red)" }}>
            {result.scaled}
            <small>/1000</small>
          </div>
          <p className="lede">
            {pass ? "Above" : "Below"} the ~{TARGET} line people commonly report. Cisco doesn&apos;t publish cut scores, so treat this as a rough guide.
            {result.kind === "weak" ? " This was a weak-spot drill, so expect it to read lower than a blueprint mock." : ""}
          </p>
        </div>
        <div className="readout num" style={{ maxWidth: 340 }}>
          <span>
            <b>time used</b> {fmt(used)} ({Math.round(used / 1000 / result.total)}s per item)
          </span>
          <span>
            <b>unanswered</b> {result.unanswered ?? 0} · <b>flagged</b> {result.flags.filter(Boolean).length}
          </span>
          <div className="switches" style={{ marginTop: 8 }}>
            <button className="sw primary" onClick={onNew}>
              New sitting
            </button>
          </div>
        </div>
      </section>

      <div className="section-head">
        <h3 className="display">By domain</h3>
        <span className="silk">line = {Math.round(TARGET_PCT * 100)}% target</span>
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
                {v !== undefined && <i className={v >= TARGET_PCT ? "g" : "r"} style={{ width: `${v * 100}%` }} />}
                <span className="target" style={{ left: `${TARGET_PCT * 100}%` }} />
              </div>
              <span className="num">{v === undefined ? "–" : `${Math.round(v * 100)}%`}</span>
            </div>
          );
        })}
      </div>

      <div className="section-head">
        <h3 className="display">Study next</h3>
        <span className="silk">this sitting&apos;s misses combined with your overall mastery</span>
      </div>
      <Plan exam={exam.id} plan={plan} />

      {slow.length > 0 && slow[0].spent > 0 && (
        <>
          <div className="section-head">
            <h3 className="display">Where the time went</h3>
          </div>
          <ul className="mock-slow">
            {slow.map((x) => (
              <li key={x.q.id}>
                <span className="num">{fmt(x.spent)}</span> item {x.i + 1} · {x.q.objective} {index.get(x.q.objective)?.objective.title} {x.ok ? "✓" : "✗"}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="section-head">
        <h3 className="display">Review</h3>
        <div className="radio-sw" role="radiogroup">
          {(["missed", "flagged", "all"] as const).map((f) => (
            <button key={f} role="radio" aria-checked={filter === f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
              {f} ({rows.filter((x) => (f === "missed" ? !x.ok : f === "flagged" ? x.flag : true)).length})
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 && <p className="empty">{filter === "missed" ? "Clean sheet. Well done." : "Nothing here."}</p>}
      {shown.map(({ q, r, ok, flag, i }) => (
        <div className="ticket" key={q.id} style={{ marginBottom: 12 }}>
          <div className="ticket-head">
            <span>
              Item {i + 1} {ok ? "✓" : "✗"}
              {flag ? " ⚑" : ""}
            </span>
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
