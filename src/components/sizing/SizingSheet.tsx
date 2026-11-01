"use client";

import Link from "next/link";
import { useState } from "react";
import { checkStep, sizingExercises, type SizingExercise } from "@/data/sizing";
import { recordSizing, useProgress } from "@/lib/progress";

type StepState = { value: string; tries: number; ok: boolean; reveal: boolean };

export function SizingSheet({ ex }: { ex: SizingExercise }) {
  const p = useProgress();
  const [st, setSt] = useState<StepState[]>(() => ex.steps.map(() => ({ value: "", tries: 0, ok: false, reveal: false })));
  const done = st.every((s) => s.ok || s.reveal);
  const clean = st.every((s) => s.ok);
  const idx = sizingExercises.findIndex((e) => e.id === ex.id);
  const next = sizingExercises[idx + 1];

  const update = (i: number, patch: Partial<StepState>) => setSt((prev) => prev.map((s, k) => (k === i ? { ...s, ...patch } : s)));

  const check = (i: number) => {
    const s = st[i];
    if (!s.value.trim()) return;
    const ok = checkStep(ex.steps[i], s.value);
    const nextSt = st.map((x, k) => (k === i ? { ...x, ok, tries: x.tries + 1 } : x));
    setSt(nextSt);
    if (nextSt.every((x) => x.ok)) recordSizing(ex.id);
    if (ok) setTimeout(() => document.getElementById(`step-${i + 1}`)?.querySelector("input")?.focus({ preventScroll: true }), 0);
  };

  return (
    <main className="page">
      <section className="hero size-hero">
        <div>
          <span className="silk">
            Sizing Desk · DCAI {ex.objective}
            {p.sizing[ex.id] ? " · completed ✓" : ""}
          </span>
          <h1 className="display">{ex.title}</h1>
          <p className="lede">{ex.brief}</p>
        </div>
      </section>

      <div className="size-grid">
        <aside className="size-spec" aria-label="Design request">
          <span className="silk">Design request</span>
          <dl>
            {ex.given.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="size-note">
            Work it out on paper or in your head, then enter the number. Round counts up (you can&apos;t buy 3.2 switches). Decimals are accepted within
            a small tolerance.
          </p>
          <Link className="sw" href="/sizing/builder">
            Try it in the cluster builder →
          </Link>
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
                  <form
                    className="size-a"
                    onSubmit={(e) => {
                      e.preventDefault();
                      check(i);
                    }}
                  >
                    <input
                      inputMode="decimal"
                      value={s.value}
                      disabled={s.ok}
                      aria-label={`Answer for step ${i + 1}`}
                      onChange={(e) => update(i, { value: e.target.value })}
                    />
                    <span className="unit">{step.unit}</span>
                    {!s.ok && (
                      <button className="sw" type="submit">
                        Check
                      </button>
                    )}
                    {!s.ok && s.tries >= 2 && !s.reveal && (
                      <button className="sw" type="button" onClick={() => update(i, { reveal: true })}>
                        Show working
                      </button>
                    )}
                    <span className={`size-mark ${state}`} aria-live="polite">
                      {s.ok ? "✓" : s.tries ? "✗ not quite" : ""}
                    </span>
                  </form>
                  {(s.ok || s.reveal) && (
                    <p className="size-work">
                      {s.reveal && !s.ok && (
                        <b>
                          Answer: {Number.isInteger(step.answer) ? step.answer.toLocaleString("en-US") : step.answer.toFixed(2)} {step.unit}.{" "}
                        </b>
                      )}
                      {step.working}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {done && (
        <section className={`size-done ${clean ? "ok" : ""}`}>
          <b>{clean ? "Design signed off." : "Worked through."}</b> {ex.takeaway}
          {!clean && <span className="size-retry"> Get every step right without revealing to mark the worksheet complete.</span>}
          <div className="size-done-actions">
            {next ? (
              <Link className="sw primary" href={`/sizing/${next.id}`}>
                Next: {next.title} →
              </Link>
            ) : (
              <Link className="sw primary" href="/sizing">
                All worksheets →
              </Link>
            )}
            <button className="sw" onClick={() => setSt(ex.steps.map(() => ({ value: "", tries: 0, ok: false, reveal: false })))}>
              Start over
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
