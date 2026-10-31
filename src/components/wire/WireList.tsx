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
          <span className="silk">Topology simulator</span>
          <h1 className="display">
            The wire <em>room.</em>
          </h1>
          <p className="lede">
            A live campus network in your browser. Drag one device onto another to ping it, and the path lights up instantly: request in amber,
            reply in green, a red ✕ where a packet died. Step through every frame to see the ARP, the MAC learning, the spanning-tree blocking
            and the routing decision, each explained in plain language.
          </p>
        </div>
        <div className="readout num">
          <span>
            <b>challenges</b> {challenges.filter((c) => p.wire[c.id]).length}/{challenges.length} solved
          </span>
          <span>
            <b>models</b> VLANs · 802.1Q · RSTP · ARP · IPv4 · static routes · ACLs · ICMP
          </span>
        </div>
      </section>
      <div className="lab-list" style={{ marginTop: 28 }}>
        {scenarios.map((s) => (
          <Link key={s.id} href={`/wire/${s.id}`} className="lab-row">
            <span className="silk">{s.kind}</span>
            <span className="silk">{s.objective}</span>
            <span className="title">{s.title}</span>
            <span className={`state ${p.wire[s.id] ? "done" : ""}`}>{s.kind === "sandbox" ? "explore" : p.wire[s.id] ? "solved ✓" : `${s.goals.length} checks`}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
