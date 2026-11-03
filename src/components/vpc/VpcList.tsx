"use client";

import Link from "next/link";
import { vpcScenarios } from "@/data/vpc";
import { useProgress } from "@/lib/progress";

export function VpcList() {
  const p = useProgress();
  return (
    <main className="page">
      <section className="hero">
        <div>
          <span className="silk">vPC Lab · DCCOR 1.2</span>
          <h1 className="display">
            Two switches, <em>one port-channel.</em>
          </h1>
          <p className="lede">
            A Nexus vPC pair behind NX-OS consoles. Peer-keepalive, peer-link, roles, type-1 and type-2 consistency checks, LACP, peer-gateway
            and auto-recovery are modelled, and the show commands read the live state. Each ticket is graded on what the dual-homed devices
            actually forward.
          </p>
        </div>
        <div className="readout num" style={{ maxWidth: 380 }}>
          <span>
            <b>tickets</b> {vpcScenarios.filter((s) => p.vpc[s.id]).length}/{vpcScenarios.length} solved
          </span>
          <span>
            <b>start with</b> show vpc · show port-channel summary
          </span>
        </div>
      </section>
      <div className="lab-list" style={{ marginTop: 28 }}>
        {vpcScenarios.map((s) => (
          <Link key={s.id} href={`/vpc/${s.id}`} className="lab-row">
            <span className="silk">ticket</span>
            <span className="silk">{s.objective}</span>
            <span className="title">{s.title}</span>
            <span className={`state ${p.vpc[s.id] ? "done" : ""}`}>{p.vpc[s.id] ? "solved ✓" : `${s.goals.length} checks`}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
