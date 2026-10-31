"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { exams, objectiveIndex } from "@/data/catalog";
import { labById } from "@/data/labs";
import { recordLab } from "@/lib/progress";
import { initialState, prompt, runLine, type Line, type TermState } from "@/lib/terminal";

export function LabTerminal({ labId }: { labId: string }) {
  const lab = labById[labId];
  const exam = exams[lab.exam];
  const obj = objectiveIndex(exam).get(lab.objective)?.objective;
  const banner: Line[] = [
    { kind: "out", text: `${lab.hostname} con0 is now available\n\nPress RETURN to get started.\n` },
    { kind: "coach", text: `Ticket loaded: ${lab.steps.length} steps. Type ? at any time for the next hint.` },
  ];
  const [st, setSt] = useState<TermState>(() => initialState(lab));
  const [lines, setLines] = useState<Line[]>(banner);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);
  const [showSolution, setShowSolution] = useState(false);
  const out = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    out.current?.scrollTo({ top: out.current.scrollHeight });
  }, [lines]);

  const exec = (raw: string) => {
    const res = runLine(lab, st, raw);
    if (res.state.done && !st.done) recordLab(lab.id, res.state.slips + (showSolution ? 1 : 0));
    setSt(res.state);
    setLines((l) => [...l, ...res.lines]);
    if (raw.trim()) setHistory((h) => [raw, ...h].slice(0, 50));
    setHIdx(-1);
    setInput("");
  };

  const reset = () => {
    setSt(initialState(lab));
    setLines(banner);
    setShowSolution(false);
    field.current?.focus();
  };

  return (
    <main className="page">
      <section className="hero" style={{ paddingTop: 36 }}>
        <div>
          <span className="silk">
            <Link href="/labs">labs</Link> / {exam.short} {lab.objective} {obj ? `· ${obj.title}` : ""}
          </span>
          <h2 className="display" style={{ marginTop: 8 }}>
            {lab.title}
          </h2>
        </div>
        <div className="switches">
          <button className="sw" onClick={reset}>
            Reset
          </button>
          <button className="sw" onClick={() => setShowSolution((s) => !s)}>
            {showSolution ? "Hide" : "Reveal"} solution
          </button>
        </div>
      </section>

      <div className="lab">
        <div>
          <span className="silk">Change ticket</span>
          <p style={{ margin: "8px 0 0", color: "var(--ink-2)" }}>{lab.brief}</p>
          <pre className="topo">{lab.topology}</pre>
          <ol className="steps">
            {lab.steps.map((s, i) => (
              <li key={i} className={i < st.step ? "done" : i === st.step && !st.done ? "cur" : "todo"}>
                <span>
                  {s.task}
                  {showSolution && (
                    <>
                      <br />
                      <code className="inline-code">{s.cmd}</code>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ol>
          {st.done && (
            <div className="notice">
              <b>Ticket closed.</b> Verify with:{" "}
              {lab.shows.map((s, i) => (
                <code key={i} className="inline-code" style={{ marginRight: 6 }}>
                  {s.match.replace(/\|/g, "").replace(/\(|\)/g, "").replace("<rest>", "ethernet 1/1")}
                </code>
              ))}
              or <code className="inline-code">show running-config</code>.
            </div>
          )}
          {showSolution && <p className="silk">Revealing the solution counts as a slip.</p>}
        </div>

        <div className="term" onClick={() => field.current?.focus()}>
          <div className="term-bar">
            <span>
              {lab.hostname} · {lab.platform} · console
            </span>
            <span className="num">
              step {Math.min(st.step + 1, lab.steps.length)}/{lab.steps.length} · slips {st.slips}
            </span>
          </div>
          <div className="term-out" ref={out} aria-live="polite">
            {lines.map((l, i) => (
              <div key={i} className={l.kind}>
                {l.prompt ? `${l.prompt}${l.text}` : l.text}
              </div>
            ))}
          </div>
          <form
            className="term-line"
            onSubmit={(e) => {
              e.preventDefault();
              exec(input);
            }}
          >
            <span>{prompt(lab, st.mode)}</span>
            <input
              ref={field}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  const n = Math.min(hIdx + 1, history.length - 1);
                  if (history[n] !== undefined) {
                    setHIdx(n);
                    setInput(history[n]);
                  }
                }
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  const n = hIdx - 1;
                  setHIdx(Math.max(n, -1));
                  setInput(n >= 0 ? history[n] : "");
                }
                if (e.key === "?" && !input.trim()) {
                  e.preventDefault();
                  exec("?");
                }
                if (e.key === "z" && e.ctrlKey) {
                  e.preventDefault();
                  exec("end");
                }
              }}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              aria-label="Console input"
            />
          </form>
        </div>
      </div>
    </main>
  );
}
