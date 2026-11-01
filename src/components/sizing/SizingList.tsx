"use client";

import Link from "next/link";
import { sizingExercises } from "@/data/sizing";
import { useProgress } from "@/lib/progress";

export function SizingList() {
  const p = useProgress();
  return (
    <main className="page">
      <section className="hero">
        <div>
          <span className="silk">Sizing Desk · DCAI 2.1–2.4</span>
          <h1 className="display">
            Do the <em>maths.</em>
          </h1>
          <p className="lede">
            Design requests you size by hand, the way the exam and real projects ask for it: leaves, spines and optics for a rail-optimised
            fabric; GPUs per model replica; checkpoint and data-loading throughput; racks, kilowatts and PUE. Check each step, see the
            working, then play with the same formulas in the cluster builder.
          </p>
          <Link className="sw primary" href="/sizing/builder" style={{ marginTop: 16 }}>
            Open the cluster builder →
          </Link>
        </div>
        <div className="readout num" style={{ maxWidth: 380 }}>
          <span>
            <b>worksheets</b> {sizingExercises.filter((e) => p.sizing[e.id]).length}/{sizingExercises.length} signed off
          </span>
          <span>
            <b>covers</b> network 2.1 · compute 2.2 · storage 2.3 · power 2.4
          </span>
        </div>
      </section>
      <div className="lab-list" style={{ marginTop: 28 }}>
        {sizingExercises.map((e) => (
          <Link key={e.id} href={`/sizing/${e.id}`} className="lab-row">
            <span className="silk">worksheet</span>
            <span className="silk">{e.objective}</span>
            <span className="title">{e.title}</span>
            <span className={`state ${p.sizing[e.id] ? "done" : ""}`}>{p.sizing[e.id] ? "signed off ✓" : `${e.steps.length} steps`}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
