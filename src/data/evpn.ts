import type { EFabric, EIntf, ESwitch, EvpnScenario } from "@/lib/evpn";

// VXLAN EVPN Lab scenarios (DCCOR 1.3). The base fabric is two spines (OSPF underlay, BGP EVPN route
// reflectors) and three leaves (VTEPs) with VLAN 10 → VNI 10010, VLAN 20 → VNI 10020 and tenant VRF
// TENANT1 on L3VNI 50001 (VLAN 2501). Each scenario breaks it; the validator replays `solution`.

const ASN = 65000;
const i = (name: string, extra: Partial<EIntf> = {}): EIntf => ({ name, mtu: 1500, ...extra });

function leaf(n: number): ESwitch {
  return {
    id: `LEAF${n}`,
    role: "leaf",
    asn: ASN,
    features: { ospf: true, bgp: true, nvOverlay: true, vnSegment: true, interfaceVlan: true, fabricForwarding: true },
    nvOverlayEvpn: true,
    anycastMac: "2020.0000.00aa",
    vlans: [
      { id: 10, vni: 10010 },
      { id: 20, vni: 10020 },
      { id: 2501, vni: 50001 },
    ],
    intfs: [
      i("loopback0", { ip: `10.0.0.1${n}/32`, ospf: "0.0.0.0" }),
      i("loopback1", { ip: `10.0.1.1${n}/32`, ospf: "0.0.0.0" }),
      i("Ethernet1/49", { mtu: 9216, ospf: "0.0.0.0" }),
      i("Ethernet1/50", { mtu: 9216, ospf: "0.0.0.0" }),
      i("Ethernet1/10", { mtu: 9216 }),
      i("Ethernet1/11", { mtu: 9216 }),
      i("Vlan10", { vrf: "TENANT1", ip: "192.168.10.1/24", anycast: true }),
      i("Vlan20", { vrf: "TENANT1", ip: "192.168.20.1/24", anycast: true }),
      i("Vlan2501", { vrf: "TENANT1", ipForward: true, mtu: 9216 }),
    ],
    nve: {
      source: "loopback1",
      hostReachBgp: true,
      members: [
        { vni: 10010, ir: true, suppressArp: true },
        { vni: 10020, ir: true, suppressArp: true },
        { vni: 50001, l3: true },
      ],
    },
    evpn: [
      { vni: 10010, imp: ["auto"], exp: ["auto"] },
      { vni: 10020, imp: ["auto"], exp: ["auto"] },
    ],
    vrfs: [{ name: "TENANT1", vni: 50001, imp: ["auto"], exp: ["auto"] }],
    nbrs: [1, 2].map((s) => ({ ip: `10.0.0.${s}`, remoteAs: ASN, updateSource: "loopback0", evpn: true, sendExt: true })),
    ospfTag: "UNDERLAY",
  };
}

function spine(n: number): ESwitch {
  return {
    id: `SPINE${n}`,
    role: "spine",
    asn: ASN,
    features: { ospf: true, bgp: true, nvOverlay: false, vnSegment: false, interfaceVlan: false, fabricForwarding: false },
    nvOverlayEvpn: false,
    vlans: [],
    intfs: [i("loopback0", { ip: `10.0.0.${n}/32`, ospf: "0.0.0.0" }), ...[1, 2, 3].map((p) => i(`Ethernet1/${p}`, { mtu: 9216, ospf: "0.0.0.0" }))],
    evpn: [],
    vrfs: [],
    nbrs: [1, 2, 3].map((l) => ({ ip: `10.0.0.1${l}`, remoteAs: ASN, updateSource: "loopback0", evpn: true, sendExt: true, rrClient: true })),
    ospfTag: "UNDERLAY",
  };
}

export function baseFabric(): EFabric {
  return {
    switches: [spine(1), spine(2), leaf(1), leaf(2), leaf(3)],
    links: [1, 2, 3].flatMap((l) => [
      [[`LEAF${l}`, "Ethernet1/49"], ["SPINE1", `Ethernet1/${l}`]],
      [[`LEAF${l}`, "Ethernet1/50"], ["SPINE2", `Ethernet1/${l}`]],
    ]) as EFabric["links"],
    hosts: [
      { id: "h1", label: "h1", leaf: "LEAF1", port: "Ethernet1/10", vlan: 10, ip: "192.168.10.11/24", mac: "0050.56aa.0011" },
      { id: "h2", label: "h2", leaf: "LEAF2", port: "Ethernet1/10", vlan: 10, ip: "192.168.10.12/24", mac: "0050.56aa.0012" },
      { id: "h4", label: "h4", leaf: "LEAF2", port: "Ethernet1/11", vlan: 20, ip: "192.168.20.12/24", mac: "0050.56aa.0022" },
      { id: "h3", label: "h3", leaf: "LEAF3", port: "Ethernet1/10", vlan: 20, ip: "192.168.20.13/24", mac: "0050.56aa.0023" },
    ],
  };
}

const tweak = (fn: (f: EFabric, sw: (id: string) => ESwitch) => void) => {
  const f = baseFabric();
  fn(f, (id) => f.switches.find((s) => s.id === id)!);
  return f;
};
const intf = (s: ESwitch, n: string) => s.intfs.find((x) => x.name === n)!;

export const evpnScenarios: EvpnScenario[] = [
  {
    id: "evpn-vni",
    title: "Routed traffic works, the stretched VLAN doesn't",
    exam: "dccor",
    objective: "1.3",
    brief: "LEAF3 was rebuilt from a template last night. h1 (VLAN 10 on LEAF1) still reaches h3 (VLAN 20 on LEAF3), but h4, in the same VLAN 20 subnet on LEAF2, can't reach h3 at all.",
    symptoms: ["h4 → h3 (same subnet): no response", "h1 → h3 (routed through TENANT1): works", "show nve peers on LEAF2 lists LEAF3 as Up"],
    hint: "Compare `show vxlan` and `show nve vni` on LEAF2 and LEAF3. A stretched subnet needs the same L2VNI everywhere.",
    debrief:
      "VLAN numbers are local to each leaf; the **VNI** is what identifies the segment across the fabric. LEAF3 mapped VLAN 20 to 10021, so its hosts were in a different L2 segment from LEAF2's VLAN 20. Routed traffic still worked because it rides the L3VNI and the VRF route targets, which were right. Fix the vn-segment, the NVE member and the EVPN VNI entry together.",
    fabric: tweak((_, sw) => {
      const l3 = sw("LEAF3");
      l3.vlans.find((v) => v.id === 20)!.vni = 10021;
      l3.nve!.members.find((m) => m.vni === 10020)!.vni = 10021;
      l3.evpn.find((e) => e.vni === 10020)!.vni = 10021;
    }),
    goals: [
      { type: "ping", from: "h4", to: "h3", label: "h4 reaches h3 (same subnet, bridged over VXLAN)" },
      { type: "ping", from: "h1", to: "h3", label: "h1 still reaches h3 (routed)" },
    ],
    solution: [
      {
        sw: "LEAF3",
        lines: ["configure terminal", "vlan 20", "vn-segment 10020", "interface nve1", "no member vni 10021", "member vni 10020", "ingress-replication protocol bgp", "suppress-arp", "evpn", "no vni 10021 l2", "vni 10020 l2", "rd auto", "route-target import auto", "route-target export auto"],
      },
    ],
  },
  {
    id: "evpn-rt",
    title: "One-way MAC learning in VNI 10010",
    exam: "dccor",
    objective: "1.3",
    brief: "h1 (LEAF1) and h2 (LEAF2) share VLAN 10. Since a change on LEAF2, they can't talk. LEAF1 has h2's MAC; LEAF2 doesn't have h1's.",
    symptoms: ["show l2route evpn mac all on LEAF2: no entry for h1", "BGP EVPN sessions are all up", "show bgp l2vpn evpn on LEAF2 shows h1's route, not imported"],
    hint: "Look at the route targets on h1's route in `show bgp l2vpn evpn`, then at what LEAF2 imports for VNI 10010 (`show running-config evpn`).",
    debrief:
      "A leaf only imports an EVPN route into a VNI when one of the route's route targets matches that VNI's import list. With `route-target import auto` NX-OS uses ASN:VNI (65000:10010), so every leaf agrees without typing them. A hand-typed import RT of 65000:10011 meant LEAF2 received h1's route and ignored it.",
    fabric: tweak((_, sw) => {
      sw("LEAF2").evpn.find((e) => e.vni === 10010)!.imp = ["65000:10011"];
    }),
    goals: [
      { type: "ping", from: "h2", to: "h1", label: "h2 reaches h1" },
      { type: "ping", from: "h4", to: "h3", label: "h4 still reaches h3" },
    ],
    solution: [{ sw: "LEAF2", lines: ["configure terminal", "evpn", "vni 10010 l2", "no route-target import 65000:10011", "route-target import auto"] }],
  },
  {
    id: "evpn-l3vni",
    title: "LEAF3's hosts can't leave their subnet",
    exam: "dccor",
    objective: "1.3",
    brief: "Inter-subnet traffic to and from h3 on LEAF3 fails. h4, in the same subnet as h3, reaches it fine. LEAF1 and LEAF2 route between each other normally.",
    symptoms: ["h1 → h3 and h2 → h3: no response", "h4 → h3: works", "show nve vni on LEAF3 lists only L2 VNIs"],
    hint: "Symmetric IRB routes between leaves over the tenant's L3VNI. Is it on LEAF3's NVE interface?",
    debrief:
      "With symmetric IRB every leaf routes into and out of the shared **L3VNI** (50001 for TENANT1). The VRF had `vni 50001` and the L3VNI SVI existed, but without `member vni 50001 associate-vrf` on nve1, LEAF3's type-2 routes carried no L3VNI and other leaves couldn't install h3's host route. Bridged traffic in VNI 10020 didn't need it.",
    fabric: tweak((_, sw) => {
      sw("LEAF3").nve!.members = sw("LEAF3").nve!.members.filter((m) => !m.l3);
    }),
    goals: [
      { type: "ping", from: "h1", to: "h3", label: "h1 reaches h3 (routed)" },
      { type: "ping", from: "h2", to: "h3", label: "h2 reaches h3 (routed)" },
      { type: "ping", from: "h4", to: "h3", label: "h4 still reaches h3 (bridged)" },
    ],
    solution: [{ sw: "LEAF3", lines: ["configure terminal", "interface nve1", "member vni 50001 associate-vrf"] }],
  },
  {
    id: "evpn-loopback",
    title: "BGP is up, but nobody can reach LEAF2's hosts",
    exam: "dccor",
    objective: "1.3",
    brief: "After an underlay cleanup on LEAF2, its hosts are cut off from the other leaves. The BGP EVPN sessions never dropped, and LEAF2's routes are in everyone's BGP table.",
    symptoms: ["show nve peers on LEAF1: 10.0.1.12 Down", "show bgp l2vpn evpn summary: all sessions Established", "show ip route on LEAF1 has 10.0.0.12 but not 10.0.1.12"],
    hint: "BGP peers between loopback0 addresses, but VXLAN tunnels go to the NVE source loopback. Both must be in the underlay.",
    debrief:
      "Many fabrics use loopback0 for BGP and a separate loopback1 as the VTEP source. Both must be advertised in the underlay. LEAF2's loopback1 had lost `ip router ospf UNDERLAY area 0.0.0.0`, so its EVPN routes arrived with a next hop (10.0.1.12) nobody could reach, and the NVE peer stayed down while BGP looked perfect.",
    fabric: tweak((_, sw) => {
      delete intf(sw("LEAF2"), "loopback1").ospf;
    }),
    goals: [
      { type: "ping", from: "h1", to: "h2", label: "h1 reaches h2" },
      { type: "ping", from: "h3", to: "h4", label: "h3 reaches h4" },
    ],
    solution: [{ sw: "LEAF2", lines: ["configure terminal", "interface loopback1", "ip router ospf UNDERLAY area 0.0.0.0"] }],
  },
  {
    id: "evpn-mtu",
    title: "Pings work, file transfers hang",
    exam: "dccor",
    objective: "1.3",
    brief: "LEAF1 was added with uplinks copied from an old access-layer template. h1 can ping everyone, but large transfers to other leaves stall. The OSPF adjacencies are fine.",
    symptoms: ["Small pings from h1 succeed", "1500-byte packets from h1 to other leaves are lost", "Both ends of LEAF1's uplinks agree on MTU, so OSPF is FULL"],
    hint: "VXLAN adds 50 bytes to every frame. Check `show interface` on LEAF1's uplinks and the spine ports facing LEAF1.",
    debrief:
      "VXLAN encapsulation adds about 50 bytes (outer Ethernet, IP, UDP and VXLAN headers), so a 1500-byte host packet needs at least 1550 bytes in the underlay. Fabrics simply run 9216 on every fabric link. The MTU matched at both ends, so OSPF formed (a mismatch would have left it stuck in EXSTART) and only large packets failed, which is why this one hides from basic checks.",
    fabric: tweak((_, sw) => {
      intf(sw("LEAF1"), "Ethernet1/49").mtu = 1500;
      intf(sw("LEAF1"), "Ethernet1/50").mtu = 1500;
      intf(sw("SPINE1"), "Ethernet1/1").mtu = 1500;
      intf(sw("SPINE2"), "Ethernet1/1").mtu = 1500;
    }),
    goals: [
      { type: "ping", from: "h1", to: "h2", size: 1500, label: "1500-byte packets from h1 reach h2" },
      { type: "ping", from: "h1", to: "h3", size: 1500, label: "1500-byte packets from h1 reach h3" },
    ],
    solution: [
      { sw: "LEAF1", lines: ["configure terminal", "interface ethernet1/49", "mtu 9216", "interface ethernet1/50", "mtu 9216"] },
      { sw: "SPINE1", lines: ["configure terminal", "interface ethernet1/1", "mtu 9216"] },
      { sw: "SPINE2", lines: ["configure terminal", "interface ethernet1/1", "mtu 9216"] },
    ],
  },
  {
    id: "evpn-extcomm",
    title: "LEAF3 receives every route and imports none",
    exam: "dccor",
    objective: "1.3",
    brief: "The spines' neighbor configuration for LEAF3 was typed by hand when it was added. LEAF3's hosts can't reach anything on other leaves, yet LEAF3 receives all the EVPN routes.",
    symptoms: ["show bgp l2vpn evpn on LEAF3: routes present, Extcommunity (none)", "Other leaves import LEAF3's routes normally", "show nve peers on LEAF3: empty"],
    hint: "Route targets are BGP extended communities. Which neighbour setting decides whether they're sent?",
    debrief:
      "Route targets travel as **extended communities**, which NX-OS only sends to a neighbour with `send-community extended` under its l2vpn evpn address family. The spines reflected routes to LEAF3 stripped of their RTs, so LEAF3 had nothing to match its import lists against. Routes from LEAF3 were fine because LEAF3 itself sent extended communities. Fix it on both route reflectors.",
    fabric: tweak((_, sw) => {
      for (const s of ["SPINE1", "SPINE2"]) sw(s).nbrs.find((n) => n.ip === "10.0.0.13")!.sendExt = false;
    }),
    goals: [
      { type: "ping", from: "h3", to: "h4", label: "h3 reaches h4 (bridged)" },
      { type: "ping", from: "h3", to: "h1", label: "h3 reaches h1 (routed)" },
    ],
    solution: ["SPINE1", "SPINE2"].map((sw) => ({ sw, lines: ["configure terminal", "router bgp 65000", "neighbor 10.0.0.13", "address-family l2vpn evpn", "send-community extended"] })),
  },
];

export const evpnById: Record<string, EvpnScenario> = Object.fromEntries(evpnScenarios.map((s) => [s.id, s]));
