"use client";

import Link from "next/link";
import { exams } from "@/data/catalog";
import { labs } from "@/data/labs";
import { useProgress } from "@/lib/progress";

export function LabList() {
  const p = useProgress();
  return (
    <main className="page">
      <section className="hero">
        <div>
          <span className="silk">Console labs</span>
          <h1 className="display">
            Patch <em>tickets.</em>
          </h1>
          <p className="lede">
            Each lab is a change ticket on a simulated IOS XE or NX-OS console. Type the configuration the way you would on a real box
            (abbreviations work). The sensei flags wrong-mode commands and steps taken out of order. Type <span className="inline-code">?</span>{" "}
            whenever you are stuck.
          </p>
        </div>
      </section>
      {Object.values(exams).map((exam) => {
        const list = labs.filter((l) => l.exam === exam.id);
        if (!list.length) return null;
        return (
          <div key={exam.id}>
            <div className="section-head">
              <h3 className="display">
                {exam.short} <span className="silk">{exam.code}</span>
              </h3>
              <span className="silk">
                {list.filter((l) => p.labs[l.id]).length}/{list.length} closed
              </span>
            </div>
            <div className="lab-list">
              {list.map((l) => {
                const done = p.labs[l.id];
                return (
                  <Link key={l.id} href={`/labs/${l.id}`} className="lab-row">
                    <span className="silk">{l.platform}</span>
                    <span className="silk">{l.objective}</span>
                    <span className="title">{l.title}</span>
                    <span className={`state ${done ? "done" : ""}`}>
                      {done ? `closed ✓ ${done.slips === 0 ? "clean" : `${done.slips} slips`}` : `${l.steps.length} steps`}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </main>
  );
}
