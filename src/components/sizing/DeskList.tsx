"use client";

import Link from "next/link";
import { deskSheets } from "@/data/worksheets";
import { useProgress } from "@/lib/progress";

const EXAMS = [
  { id: "encor", name: "ENCOR 350-401" },
  { id: "dccor", name: "DCCOR 350-601" },
  { id: "dcai", name: "DCAI 300-640" },
] as const;

export function DeskList() {
  const p = useProgress();
  return (
    <main className="page">
      <section className="hero">
        <div>
          <span className="silk">Design & Automation Desk · ENCOR, DCCOR and DCAI</span>
          <h1 className="display">
            Read it, write it, <em>call it.</em>
          </h1>
          <p className="lede">
            Worksheets for the topics that aren&apos;t about typing device config. For ENCOR: write JSON an API will accept, turn a YANG tree into
            RESTCONF calls, walk through Catalyst Center and SD-WAN Manager API sessions, predict what Python prints, and do the availability, QoS
            and overlay maths. For DCCOR: wire up ACI access policies, follow a packet across VXLAN, design UCS pools and templates, and
            pick storage protocols and automation tools. For DCAI: read benchmark results, correlate monitoring data, pick the right controller, classify workloads, and work
            out cloud vs on-prem economics. Each answer is checked as you go.
          </p>
        </div>
        <div className="readout num" style={{ maxWidth: 380 }}>
          <span>
            <b>worksheets</b> {deskSheets.filter((e) => p.sizing[e.id]).length}/{deskSheets.length} complete
          </span>
          <span>
            <b>also</b>{" "}
            <Link href="/sizing" style={{ color: "inherit" }}>
              Sizing Desk (DCAI 2.1–2.4) →
            </Link>
          </span>
        </div>
      </section>
      {EXAMS.map((x) => {
        const list = deskSheets.filter((e) => e.exam === x.id);
        return (
          <div key={x.id}>
            <div className="section-head">
              <h3 className="display">{x.name}</h3>
              <span className="silk">
                {list.filter((e) => p.sizing[e.id]).length}/{list.length} complete
              </span>
            </div>
            <div className="lab-list">
              {list.map((e) => (
                <Link key={e.id} href={`/desk/${e.id}`} className="lab-row">
                  <span className="silk">worksheet</span>
                  <span className="silk">{[e.objective, ...(e.also ?? [])].join(" ")}</span>
                  <span className="title">{e.title}</span>
                  <span className={`state ${p.sizing[e.id] ? "done" : ""}`}>{p.sizing[e.id] ? "complete ✓" : `${e.steps.length} steps`}</span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </main>
  );
}
