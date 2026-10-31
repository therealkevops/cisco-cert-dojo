"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Question } from "@/data/types";
import { permutation, type Response } from "@/lib/quiz";
import { Rich } from "./Rich";

const LETTERS = "ABCDEFGH";

type Props = {
  q: Question;
  r: Response;
  onChange: (r: Response) => void;
  /** Show right/wrong marking. */
  revealed: boolean;
  /** Seed for the display order, so it stays stable for a session. */
  seed: string;
  /** Enter inside the CLI field. */
  onSubmit?: () => void;
};

export function QuestionCard({ q, r, onChange, revealed, seed, onSubmit }: Props) {
  const order = useMemo(() => {
    if (q.kind === "single" || q.kind === "multi") return permutation(q.choices.length, seed + q.id);
    if (q.kind === "order") return permutation(q.items.length, seed + q.id);
    return [];
  }, [q, seed]);
  const cliRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (q.kind === "cli" && !revealed) cliRef.current?.focus();
  }, [q, revealed]);

  // Number keys pick choices in display order.
  useEffect(() => {
    if (revealed || (q.kind !== "single" && q.kind !== "multi")) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      const letter = LETTERS.indexOf(e.key.toUpperCase());
      const pos = n >= 1 && n <= order.length ? n - 1 : letter >= 0 && letter < order.length ? letter : -1;
      if (pos < 0) return;
      const idx = order[pos];
      if (r.kind === "single") onChange({ kind: "single", pick: idx });
      if (r.kind === "multi") onChange({ kind: "multi", picks: r.picks.includes(idx) ? r.picks.filter((x) => x !== idx) : [...r.picks, idx] });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [q, r, order, revealed, onChange]);

  return (
    <div>
      <p className="q-prompt">
        <Rich text={q.prompt} />
      </p>
      {q.exhibit && (
        <figure className="exhibit">
          <figcaption className="silk">Exhibit</figcaption>
          <pre className="cli">{q.exhibit}</pre>
        </figure>
      )}

      {(q.kind === "single" || q.kind === "multi") && (
        <>
          {q.kind === "multi" && <p className="q-hint">Choose {q.answer.length}.</p>}
          {order.map((idx, pos) => {
            const picked = r.kind === "single" ? r.pick === idx : r.kind === "multi" && r.picks.includes(idx);
            const correct = q.kind === "single" ? q.answer === idx : q.answer.includes(idx);
            const cls = revealed ? (correct ? "right" : picked ? "wrong" : "") : picked ? "sel" : "";
            return (
              <button
                key={idx}
                className={`choice ${cls}`}
                disabled={revealed}
                aria-pressed={picked}
                onClick={() => {
                  if (r.kind === "single") onChange({ kind: "single", pick: idx });
                  if (r.kind === "multi")
                    onChange({ kind: "multi", picks: r.picks.includes(idx) ? r.picks.filter((x) => x !== idx) : [...r.picks, idx] });
                }}
              >
                <span className="k">{q.kind === "multi" ? (picked ? "[x]" : "[ ]") : `${LETTERS[pos]}.`}</span>
                <span>
                  <Rich text={q.choices[idx]} />
                </span>
              </button>
            );
          })}
        </>
      )}

      {q.kind === "cli" && r.kind === "cli" && (
        <>
          <label className="cli-input">
            <span>{q.context}</span>
            <input
              ref={cliRef}
              value={r.text}
              disabled={revealed}
              onChange={(e) => onChange({ kind: "cli", text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSubmit?.();
                }
              }}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              aria-label="Command"
            />
          </label>
          <p className="q-hint" style={{ marginTop: 8 }}>
            Abbreviations are accepted, as on a real device.
          </p>
          {revealed && (
            <pre className="cli" style={{ marginTop: 10 }}>
              {q.context} {q.canonical}
            </pre>
          )}
        </>
      )}

      {q.kind === "order" && r.kind === "order" && (
        <>
          <p className="q-hint">Tap the items in order. Tap a placed item to take it back.</p>
          <div className="order-picked" aria-label="Your order">
            {r.seq.map((idx, i) => (
              <button
                key={idx}
                className="chip"
                disabled={revealed}
                style={revealed ? { borderColor: idx === i ? "var(--green)" : "var(--red)" } : undefined}
                onClick={() => onChange({ kind: "order", seq: r.seq.filter((x) => x !== idx) })}
              >
                {q.items[idx]}
              </button>
            ))}
          </div>
          <div className="order-pool">
            {order
              .filter((idx) => !r.seq.includes(idx))
              .map((idx) => (
                <button key={idx} className="chip" disabled={revealed} onClick={() => onChange({ kind: "order", seq: [...r.seq, idx] })}>
                  {q.items[idx]}
                </button>
              ))}
          </div>
          {revealed && (
            <ol style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 12 }}>
              {q.items.map((it) => (
                <li key={it}>{it}</li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
