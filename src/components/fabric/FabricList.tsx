"use client";

import Link from "next/link";
import { fabricScenarios } from "@/data/fabric";
import { useProgress } from "@/lib/progress";

export function FabricList() {
  const p = useProgress();
  const challenges = fabricScenarios.filter((s) => s.kind === "challenge");
  return (
    <main className="page">
      <section className="hero">
        <div>
          <span className="silk">Fabric Lab · DCAI 300-640</span>
          <h1 className="display">
            Keep the GPUs <em>fed.</em>
          </h1>
          <p className="lede">
            A 16-GPU RoCEv2 pod (four leaves, two spines, 400G NICs, 800G uplinks) simulated microsecond by microsecond. Change PFC, ECN thresholds,
            DSCP classification, MTU, ECMP hashing, flowlet load balancing, the PFC watchdog and the NICs&apos; DCQCN, then watch pause frames spread,
            queues fill and jobs finish (or not). Challenges are graded on job completion time, drops and pause time, so any valid fix passes.
          </p>
          <Link className="sw primary" href="/fabric/fabric" style={{ marginTop: 16 }}>
            Open the sandbox →
          </Link>
        </div>
        <div className="readout num" style={{ maxWidth: 380 }}>
          <span>
            <b>challenges</b> {challenges.filter((c) => p.fabric[c.id]).length}/{challenges.length} solved
          </span>
          <span>
            <b>models</b> PFC · ECN/WRED · DCQCN · ETS · DSCP classes · MTU · ECMP · flowlet DLB · PFC watchdog · go-back-N · CRC
          </span>
        </div>
      </section>
      <div className="lab-list" style={{ marginTop: 28 }}>
        {fabricScenarios.map((s) => (
          <Link key={s.id} href={`/fabric/${s.id}`} className="lab-row">
            <span className="silk">{s.kind}</span>
            <span className="silk">{s.objective}</span>
            <span className="title">{s.title}</span>
            <span className={`state ${p.fabric[s.id] ? "done" : ""}`}>{s.kind === "sandbox" ? "sandbox" : p.fabric[s.id] ? "solved ✓" : `${s.goals.length} check${s.goals.length === 1 ? "" : "s"}`}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
