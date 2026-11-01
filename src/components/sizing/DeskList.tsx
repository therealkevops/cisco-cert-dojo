"use client";

import Link from "next/link";
import { deskExercises } from "@/data/desk";
import { useProgress } from "@/lib/progress";

export function DeskList() {
  const p = useProgress();
  return (
    <main className="page">
      <section className="hero">
        <div>
          <span className="silk">Design & Automation Desk · ENCOR</span>
          <h1 className="display">
            Read it, write it, <em>call it.</em>
          </h1>
          <p className="lede">
            Worksheets for the ENCOR topics that aren&apos;t about typing device config: write JSON an API will accept, turn a YANG tree into
            RESTCONF calls, walk through Catalyst Center and SD-WAN Manager API sessions, predict what Python prints, do the availability and QoS
            maths, size overlay MTUs, and name the planes of SD-WAN and SD-Access. Each answer is checked as you go.
          </p>
        </div>
        <div className="readout num" style={{ maxWidth: 380 }}>
          <span>
            <b>worksheets</b> {deskExercises.filter((e) => p.sizing[e.id]).length}/{deskExercises.length} complete
          </span>
          <span>
            <b>covers</b> {[...new Set(deskExercises.flatMap((e) => [e.objective, ...(e.also ?? [])]))].sort().join(" · ")}
          </span>
        </div>
      </section>
      <div className="lab-list" style={{ marginTop: 28 }}>
        {deskExercises.map((e) => (
          <Link key={e.id} href={`/desk/${e.id}`} className="lab-row">
            <span className="silk">worksheet</span>
            <span className="silk">{[e.objective, ...(e.also ?? [])].join(" ")}</span>
            <span className="title">{e.title}</span>
            <span className={`state ${p.sizing[e.id] ? "done" : ""}`}>{p.sizing[e.id] ? "complete ✓" : `${e.steps.length} steps`}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
