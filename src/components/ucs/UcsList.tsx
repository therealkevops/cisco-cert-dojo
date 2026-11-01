"use client";

import Link from "next/link";
import { ucsScenarios } from "@/data/ucs";
import { useProgress } from "@/lib/progress";

export function UcsList() {
  const p = useProgress();
  return (
    <main className="page">
      <section className="hero">
        <div>
          <span className="silk">UCS Profile Lab · DCAI 3.2</span>
          <h1 className="display">
            Profile the <em>servers.</em>
          </h1>
          <p className="lede">
            A model of Intersight Managed Mode for GPU servers. The domain profile holds the VLAN, NTP and System QoS policies, and the server
            profile holds the vNICs, Ethernet adapter (RoCE) policies, power and storage. Every change is validated the way a deployment would be,
            and each scenario is graded on the resulting policies.
          </p>
        </div>
        <div className="readout num" style={{ maxWidth: 380 }}>
          <span>
            <b>scenarios</b> {ucsScenarios.filter((s) => p.ucs[s.id]).length}/{ucsScenarios.length} solved
          </span>
          <span>
            <b>also</b>{" "}
            <Link href="/fabric" style={{ color: "inherit" }}>
              Fabric Lab (switch side of RoCE) →
            </Link>
          </span>
        </div>
      </section>
      <div className="lab-list" style={{ marginTop: 28 }}>
        {ucsScenarios.map((s) => (
          <Link key={s.id} href={`/ucs/${s.id}`} className="lab-row">
            <span className="silk">scenario</span>
            <span className="silk">{s.objective}</span>
            <span className="title">{s.title}</span>
            <span className={`state ${p.ucs[s.id] ? "done" : ""}`}>{p.ucs[s.id] ? "solved ✓" : `${s.goals.length} checks`}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
