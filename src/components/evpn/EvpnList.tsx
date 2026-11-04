"use client";

import Link from "next/link";
import { evpnScenarios } from "@/data/evpn";
import { useProgress } from "@/lib/progress";

export function EvpnList() {
  const p = useProgress();
  return (
    <main className="page">
      <section className="hero">
        <div>
          <span className="silk">VXLAN EVPN Lab · DCCOR 1.3</span>
          <h1 className="display">
            Follow the <em>route targets.</em>
          </h1>
          <p className="lede">
            A two-spine, three-leaf VXLAN BGP EVPN fabric behind NX-OS consoles. The OSPF underlay, iBGP route reflection, route targets,
            extended communities, L2VNIs, the tenant L3VNI and anycast gateways are all modelled, and every show command reads the live state.
            Tickets are graded on whether the hosts can actually ping each other.
          </p>
        </div>
        <div className="readout num" style={{ maxWidth: 380 }}>
          <span>
            <b>tickets</b> {evpnScenarios.filter((s) => p.evpn[s.id]).length}/{evpnScenarios.length} solved
          </span>
          <span>
            <b>start with</b> show nve peers · show bgp l2vpn evpn
          </span>
        </div>
      </section>
      <div className="lab-list" style={{ marginTop: 28 }}>
        {evpnScenarios.map((s) => (
          <Link key={s.id} href={`/evpn/${s.id}`} className="lab-row">
            <span className="silk">ticket</span>
            <span className="silk">{s.objective}</span>
            <span className="title">{s.title}</span>
            <span className={`state ${p.evpn[s.id] ? "done" : ""}`}>{p.evpn[s.id] ? "solved ✓" : `${s.goals.length} checks`}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
