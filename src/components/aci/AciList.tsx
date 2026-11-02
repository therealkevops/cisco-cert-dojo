"use client";

import Link from "next/link";
import { aciScenarios } from "@/data/aci";
import { useProgress } from "@/lib/progress";

export function AciList() {
  const p = useProgress();
  return (
    <main className="page">
      <section className="hero">
        <div>
          <span className="silk">ACI Policy Lab · DCCOR 1.4 / 5.1</span>
          <h1 className="display">
            Follow the <em>policy.</em>
          </h1>
          <p className="lede">
            A model of the APIC object tree: the access policy chain from VLAN pool to leaf switch profile, and a tenant with VRFs, bridge
            domains, EPGs, filters and contracts. Faults are raised the way APIC raises them, endpoints are learned (or not) from the scenario’s
            servers, and a traffic tester tells you which policy permits or drops a flow.
          </p>
        </div>
        <div className="readout num" style={{ maxWidth: 380 }}>
          <span>
            <b>scenarios</b> {aciScenarios.filter((s) => p.aci[s.id]).length}/{aciScenarios.length} solved
          </span>
          <span>
            <b>also</b>{" "}
            <Link href="/desk/dccor-aci" style={{ color: "inherit" }}>
              ACI worksheet →
            </Link>
          </span>
        </div>
      </section>
      <div className="lab-list" style={{ marginTop: 28 }}>
        {aciScenarios.map((s) => (
          <Link key={s.id} href={`/aci/${s.id}`} className="lab-row">
            <span className="silk">scenario</span>
            <span className="silk">{s.objective}</span>
            <span className="title">{s.title}</span>
            <span className={`state ${p.aci[s.id] ? "done" : ""}`}>{p.aci[s.id] ? "solved ✓" : `${s.goals.length} checks`}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
