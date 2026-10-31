"use client";

import { useEffect, useRef, useState } from "react";

export type ConsoleLine = { kind: "in" | "out" | "sys"; text: string };

type Props = {
  lines: ConsoleLine[];
  prompt: string;
  history: string[];
  onRun: (line: string) => void;
  /** "?" pressed: show help for the text so far without running it. */
  onHelp: (lineWithQ: string) => void;
  onComplete: (line: string) => string | null;
  onClear: () => void;
  active: boolean;
};

export function Console({ lines, prompt, history, onRun, onHelp, onComplete, onClear, active }: Props) {
  const [input, setInput] = useState("");
  const [hIdx, setHIdx] = useState(-1);
  const out = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    out.current?.scrollTo({ top: out.current.scrollHeight });
  }, [lines]);
  useEffect(() => {
    if (active) field.current?.focus();
  }, [active]);

  return (
    <div className="con" onMouseUp={() => !window.getSelection()?.toString() && field.current?.focus()}>
      <div className="con-scroll" ref={out}>
        {lines.map((l, i) => (
          <div key={i} className={`con-${l.kind}`}>
            {l.text}
          </div>
        ))}
        <form
          className="con-line"
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim().toLowerCase() === "clear" || input.trim().toLowerCase() === "cls") onClear();
            else onRun(input);
            setInput("");
            setHIdx(-1);
          }}
        >
          <span className="con-prompt">{prompt}</span>
          <input
            ref={field}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "?") {
                e.preventDefault();
                onHelp(input + "?");
              } else if (e.key === "Tab") {
                e.preventDefault();
                const c = onComplete(input);
                if (c) setInput(c);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                const n = Math.min(hIdx + 1, history.length - 1);
                if (history[n] !== undefined) {
                  setHIdx(n);
                  setInput(history[n]);
                }
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                const n = hIdx - 1;
                setHIdx(Math.max(n, -1));
                setInput(n >= 0 ? history[n] : "");
              } else if ((e.key === "z" || e.key === "Z") && e.ctrlKey) {
                e.preventDefault();
                onRun("end");
                setInput("");
              } else if ((e.key === "c" || e.key === "C") && e.ctrlKey && !window.getSelection()?.toString()) {
                e.preventDefault();
                setInput("");
              }
            }}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            aria-label="Console input"
          />
        </form>
      </div>
    </div>
  );
}
