"use client";

import Link from "next/link";
import { sanScenarios } from "@/data/san";
import { useProgress } from "@/lib/progress";

export function SanList() {
  const p = useProgress();
  return (
    <main className="page">
      <section className="hero">
        <div>
          <span className="silk">SAN Lab · DCCOR 3.1 / 5.3</span>
          <h1 className="display">
            Find the <em>LUN.</em>
          </h1>
          <p className="lede">
            A Fibre Channel fabric behind an MDS-style CLI. VSANs, trunks, domain IDs, NPV and NPIV, zoning, device-aliases and port security are
            all modelled, and every show command reads the live state. Each ticket is graded on whether the right hosts can see the right
            LUNs, so any correct fix passes.
          </p>
        </div>
        <div className="readout num" style={{ maxWidth: 380 }}>
          <span>
            <b>tickets</b> {sanScenarios.filter((s) => p.san[s.id]).length}/{sanScenarios.length} solved
          </span>
          <span>
            <b>start with</b> show flogi database · show zoneset active
          </span>
        </div>
      </section>
      <div className="lab-list" style={{ marginTop: 28 }}>
        {sanScenarios.map((s) => (
          <Link key={s.id} href={`/san/${s.id}`} className="lab-row">
            <span className="silk">ticket</span>
            <span className="silk">{s.objective}</span>
            <span className="title">{s.title}</span>
            <span className={`state ${p.san[s.id] ? "done" : ""}`}>{p.san[s.id] ? "solved ✓" : `${s.goals.length} checks`}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
