"use client";

import Link from "next/link";
import { useState } from "react";
import { checkJson, checkStep, shownAnswer, type SizingExercise, type SizingStep } from "@/data/sizing";
import { worksheets } from "@/data/worksheets";
import { recordSizing, useProgress } from "@/lib/progress";

type StepState = { value: string; tries: number; ok: boolean; reveal: boolean; problems: string[] };
const fresh = (steps: SizingStep[]): StepState[] => steps.map(() => ({ value: "", tries: 0, ok: false, reveal: false, problems: [] }));

export const AREA = {
  sizing: { name: "Sizing Desk", list: "/sizing", done: "Design signed off." },
  desk: { name: "Design & Automation Desk", list: "/desk", done: "Worksheet complete." },
} as const;

export function SizingSheet({ ex }: { ex: SizingExercise }) {
  const p = useProgress();
  const area = AREA[ex.area ?? "sizing"];
  const [st, setSt] = useState<StepState[]>(() => fresh(ex.steps));
  const done = st.every((s) => s.ok || s.reveal);
  const clean = st.every((s) => s.ok);
  const same = worksheets.filter((e) => (e.area ?? "sizing") === (ex.area ?? "sizing") && e.exam === ex.exam);
  const next = same[same.findIndex((e) => e.id === ex.id) + 1];
  const numeric = ex.steps.some((s) => !s.kind || s.kind === "number");

  const update = (i: number, patch: Partial<StepState>) => setSt((prev) => prev.map((s, k) => (k === i ? { ...s, ...patch } : s)));

  const check = (i: number, value = st[i].value) => {
    if (!value.trim()) return;
    const step = ex.steps[i];
    const ok = checkStep(step, value);
    const problems = !ok && step.kind === "json" ? checkJson(step, value) : [];
    const nextSt = st.map((x, k) => (k === i ? { ...x, value, ok, problems, tries: x.tries + 1 } : x));
    setSt(nextSt);
    if (nextSt.every((x) => x.ok)) recordSizing(ex.id);
    if (ok) setTimeout(() => document.getElementById(`step-${i + 1}`)?.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true }), 0);
  };

  return (
    <main className="page">
      <section className="hero size-hero">
        <div>
          <span className="silk">
            {area.name} · {ex.exam.toUpperCase()} {[ex.objective, ...(ex.also ?? [])].join(" · ")}
            {p.sizing[ex.id] ? " · completed ✓" : ""}
          </span>
          <h1 className="display">{ex.title}</h1>
          <p className="lede">{ex.brief}</p>
        </div>
      </section>

      <div className="size-grid">
        <aside className="size-spec" aria-label="Brief">
          <span className="silk">{ex.area === "desk" ? "Brief" : "Design request"}</span>
          <dl>
            {ex.given.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="size-note">
            {numeric
              ? "Work it out on paper or in your head, then enter the number. Round counts up (you can't buy 3.2 switches). Decimals are accepted within a small tolerance. "
              : ""}
            Text answers ignore case and extra spaces. After two misses you can reveal the answer.
          </p>
          {ex.area !== "desk" && (
            <Link className="sw" href="/sizing/builder">
              Try it in the cluster builder →
            </Link>
          )}
        </aside>

        <ol className="size-steps">
          {ex.steps.map((step, i) => {
            const s = st[i];
            const state = s.ok ? "ok" : s.tries ? "bad" : "";
            return (
              <li key={i} id={`step-${i}`} className={`size-step ${state}`}>
                <span className="size-n num">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <p className="size-q">{step.prompt}</p>
                  {step.exhibit && <pre className="size-exhibit">{step.exhibit}</pre>}
                  {step.kind === "choice" ? (
                    <div className="size-choices" role="group" aria-label={`Choices for step ${i + 1}`}>
                      {step.choices.map((c, k) => (
                        <button
                          key={k}
                          type="button"
                          className={`size-choice ${s.value === String(k) ? (s.ok ? "ok" : "bad") : ""}`}
                          disabled={s.ok}
                          onClick={() => check(i, String(k))}
                        >
                          {c}
                        </button>
                      ))}
                      <span className={`size-mark ${state}`} aria-live="polite">
                        {s.ok ? "✓" : s.tries ? "✗ not quite" : ""}
                      </span>
                    </div>
                  ) : (
                    <form
                      className={`size-a ${step.kind === "json" ? "json" : ""} ${step.kind === "text" ? "text" : ""}`}
                      onSubmit={(e) => {
                        e.preventDefault();
                        check(i);
                      }}
                    >
                      {step.kind === "json" ? (
                        <textarea
                          value={s.value}
                          disabled={s.ok}
                          spellCheck={false}
                          rows={Math.max(6, s.value.split("\n").length + 1)}
                          placeholder="{ }"
                          aria-label={`JSON for step ${i + 1}`}
                          onChange={(e) => update(i, { value: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                              e.preventDefault();
                              check(i);
                            }
                          }}
                        />
                      ) : (
                        <input
                          inputMode={step.kind === "text" ? "text" : "decimal"}
                          value={s.value}
                          disabled={s.ok}
                          spellCheck={false}
                          autoCapitalize="off"
                          aria-label={`Answer for step ${i + 1}`}
                          onChange={(e) => update(i, { value: e.target.value })}
                        />
                      )}
                      {step.kind !== "json" && step.unit && <span className="unit">{step.unit}</span>}
                      {!s.ok && (
                        <button className="sw" type="submit">
                          Check{step.kind === "json" ? " (⌘/Ctrl+Enter)" : ""}
                        </button>
                      )}
                      {!s.ok && s.tries >= 2 && !s.reveal && (
                        <button className="sw" type="button" onClick={() => update(i, { reveal: true })}>
                          Show answer
                        </button>
                      )}
                      <span className={`size-mark ${state}`} aria-live="polite">
                        {s.ok ? "✓" : s.tries ? "✗ not quite" : ""}
                      </span>
                    </form>
                  )}
                  {!s.ok && s.problems.length > 0 && (
                    <ul className="size-problems">
                      {s.problems.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  )}
                  {s.reveal && !s.ok && (step.kind === "json" ? <pre className="size-exhibit">{shownAnswer(step)}</pre> : <p className="size-work"><b>Answer: {shownAnswer(step)}</b></p>)}
                  {(s.ok || s.reveal) && <p className="size-work">{step.working}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {done && (
        <section className={`size-done ${clean ? "ok" : ""}`}>
          <b>{clean ? area.done : "Worked through."}</b> {ex.takeaway}
          {!clean && <span className="size-retry"> Get every step right without revealing to mark the worksheet complete.</span>}
          <div className="size-done-actions">
            {next ? (
              <Link className="sw primary" href={`${area.list}/${next.id}`}>
                Next: {next.title} →
              </Link>
            ) : (
              <Link className="sw primary" href={area.list}>
                All worksheets →
              </Link>
            )}
            <button className="sw" onClick={() => setSt(fresh(ex.steps))}>
              Start over
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
