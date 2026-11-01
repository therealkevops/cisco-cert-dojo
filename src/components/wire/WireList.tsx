"use client";

import Link from "next/link";
import { scenarios } from "@/data/wire";
import { useProgress } from "@/lib/progress";

export function WireList() {
  const p = useProgress();
  const challenges = scenarios.filter((s) => s.kind === "challenge");
  return (
    <main className="page">
      <section className="hero">
        <div>
          <span className="silk">Wire Room · troubleshooting challenges</span>
          <h1 className="display">
            Fix the <em>network.</em>
          </h1>
          <p className="lede">
            Each challenge opens a broken campus on the canvas. Use the device consoles (real IOS-style commands) and the packet tool to find the
            fault, fix it, then press Verify. Grading checks the outcome, so any valid fix passes.
          </p>
          <Link className="sw primary" href="/wire" style={{ marginTop: 16 }}>
            Open the blank sandbox →
          </Link>
        </div>
        <div className="readout num">
          <span>
            <b>challenges</b> {challenges.filter((c) => p.wire[c.id]).length}/{challenges.length} solved
          </span>
          <span>
            <b>models</b> VLANs · 802.1Q · RSTP · EtherChannel · ARP · static routes · OSPF · eBGP · ACLs · NAT/PAT · DHCP · ICMP · IOS-style CLI
          </span>
        </div>
      </section>
      <div className="lab-list" style={{ marginTop: 28 }}>
        {scenarios.map((s) => (
          <Link key={s.id} href={`/wire/${s.id}`} className="lab-row">
            <span className="silk">{s.kind}</span>
            <span className="silk">{s.objective}</span>
            <span className="title">{s.title}</span>
            <span className={`state ${p.wire[s.id] ? "done" : ""}`}>{s.kind === "sandbox" ? "example" : p.wire[s.id] ? "solved ✓" : `${s.goals.length} check${s.goals.length === 1 ? "" : "s"}`}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
