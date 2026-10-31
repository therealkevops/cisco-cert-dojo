"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { examList } from "@/data/catalog";
import { dueCount, streak, useProgress } from "@/lib/progress";
import { CommandBar } from "./CommandBar";

function Rail() {
  // 1U numbering, top to bottom, like a real 42U cabinet.
  return (
    <div className="rail" aria-hidden>
      <div className="rail-numbers">
        {Array.from({ length: 60 }, (_, i) => (
          <span key={i}>{String(i + 1).padStart(2, "0")}</span>
        ))}
      </div>
    </div>
  );
}

function useTheme() {
  const [theme, setTheme] = useState<"dark" | "light" | null>(null);
  useEffect(() => {
    const t = document.documentElement.dataset.theme as "dark" | "light" | undefined;
    setTheme(t ?? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
  }, []);
  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("cert-dojo:theme", next);
    } catch {}
    setTheme(next);
  };
  return { theme, toggle };
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const p = useProgress();
  const { theme, toggle } = useTheme();
  const [cmdOpen, setCmdOpen] = useState(false);
  const due = examList.reduce((s, e) => s + dueCount(p, e), 0);
  const days = streak(p);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;
      if (!typing && (e.key === ":" || (e.key === "k" && (e.metaKey || e.ctrlKey)))) {
        e.preventDefault();
        setCmdOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="frame">
      <Rail />
      <div className="stage">
        <header className="status">
          <Link href="/" className="brand">
            cert<b>/</b>dojo
          </Link>
          <span className="sep">│</span>
          <span className="hide-sm">{path === "/" ? "~" : `~${path}`}</span>
          <span className="spacer" />
          <span className="num" title="Consecutive training days">
            streak {days}d
          </span>
          <span className="num" title="Cards due for review across all exams">
            due <span style={{ color: due ? "var(--amber)" : undefined }}>{due}</span>
          </span>
          <Link href="/labs" className="hide-sm">
            labs
          </Link>
          <button onClick={toggle} aria-label="Toggle colour theme">
            {theme === "light" ? "◐ datasheet" : "◑ rackroom"}
          </button>
          <button onClick={() => setCmdOpen(true)} aria-label="Open command line">
            <span className="key">:</span>
          </button>
        </header>
        {children}
      </div>
      <Rail />
      {cmdOpen && <CommandBar onClose={() => setCmdOpen(false)} toggleTheme={toggle} />}
    </div>
  );
}
