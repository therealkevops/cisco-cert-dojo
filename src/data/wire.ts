import type { Scenario, Topology } from "@/lib/net/types";

// Wire Room scenarios. Every challenge starts from the same campus so the
// learner builds a mental map once, then hunts a different fault each time.
//
//                 SRV 192.0.2.10
//                  │
//                  R1
//                  │ 10.0.0.0/30
//                DSW1  (L3, SVIs 10/20/30, STP root)
//               ╱    ╲
//            ASW1 ─── ASW2      ← triangle: STP blocks one port
//             │       │   │
//           PC-A    PC-B  PC-C (guest)

export function campus(): Topology {
  return {
    devices: [
      {
        id: "SRV",
        kind: "server",
        x: 500,
        y: 50,
        ports: [{ name: "eth0", ip: "192.0.2.10/24" }],
        gateway: "192.0.2.1",
      },
      {
        id: "R1",
        kind: "router",
        x: 500,
        y: 185,
        ports: [
          { name: "Gi0/0", ip: "10.0.0.2/30" },
          { name: "Gi0/1", ip: "192.0.2.1/24" },
        ],
        routes: [
          { prefix: "10.10.10.0/24", via: "10.0.0.1" },
          { prefix: "10.20.20.0/24", via: "10.0.0.1" },
          { prefix: "10.30.30.0/24", via: "10.0.0.1" },
        ],
      },
      {
        id: "DSW1",
        kind: "l3switch",
        x: 500,
        y: 310,
        stpPriority: 24576,
        ports: [
          { name: "Gi1/0/1", mode: "trunk" },
          { name: "Gi1/0/2", mode: "trunk" },
          { name: "Gi1/0/24", mode: "routed", ip: "10.0.0.1/30" },
        ],
        svis: [
          { vlan: 10, ip: "10.10.10.1/24" },
          { vlan: 20, ip: "10.20.20.1/24" },
          { vlan: 30, ip: "10.30.30.1/24" },
        ],
        routes: [{ prefix: "0.0.0.0/0", via: "10.0.0.2" }],
      },
      {
        id: "ASW1",
        kind: "switch",
        x: 290,
        y: 450,
        ports: [
          { name: "Gi1/0/1", mode: "trunk" },
          { name: "Gi1/0/2", mode: "access", vlan: 10 },
          { name: "Gi1/0/3", mode: "trunk" },
        ],
      },
      {
        id: "ASW2",
        kind: "switch",
        x: 710,
        y: 450,
        ports: [
          { name: "Gi1/0/1", mode: "trunk" },
          { name: "Gi1/0/2", mode: "access", vlan: 20 },
          { name: "Gi1/0/3", mode: "trunk" },
          { name: "Gi1/0/4", mode: "access", vlan: 30 },
        ],
      },
      { id: "PC-A", kind: "pc", x: 200, y: 580, ports: [{ name: "eth0", ip: "10.10.10.11/24" }], gateway: "10.10.10.1" },
      { id: "PC-B", kind: "pc", x: 620, y: 580, ports: [{ name: "eth0", ip: "10.20.20.12/24" }], gateway: "10.20.20.1" },
      { id: "PC-C", kind: "pc", x: 820, y: 580, ports: [{ name: "eth0", ip: "10.30.30.13/24" }], gateway: "10.30.30.1" },
    ],
    links: [
      { a: ["SRV", "eth0"], b: ["R1", "Gi0/1"] },
      { a: ["R1", "Gi0/0"], b: ["DSW1", "Gi1/0/24"] },
      { a: ["DSW1", "Gi1/0/1"], b: ["ASW1", "Gi1/0/1"] },
      { a: ["DSW1", "Gi1/0/2"], b: ["ASW2", "Gi1/0/1"] },
      { a: ["ASW1", "Gi1/0/3"], b: ["ASW2", "Gi1/0/3"] },
      { a: ["ASW1", "Gi1/0/2"], b: ["PC-A", "eth0"] },
      { a: ["ASW2", "Gi1/0/2"], b: ["PC-B", "eth0"] },
      { a: ["ASW2", "Gi1/0/4"], b: ["PC-C", "eth0"] },
    ],
  };
}

function tweak(fn: (t: Topology) => void): Topology {
  const t = campus();
  fn(t);
  return t;
}
const dev = (t: Topology, id: string) => t.devices.find((d) => d.id === id)!;
const port = (t: Topology, id: string, p: string) => dev(t, id).ports.find((x) => x.name === p)!;

export const scenarios: Scenario[] = [
  {
    id: "campus",
    title: "Campus sandbox",
    exam: "encor",
    objective: "3.1.c",
    kind: "sandbox",
    brief:
      "A healthy three-tier campus: access switches, an L3 distribution switch doing inter-VLAN routing, an edge router and a server. Try these: drag PC-A onto PC-B and watch ARP and MAC learning. Switch to the L2 lens to see which port spanning tree blocks. Shut DSW1 Gi1/0/1 and watch VLAN 10 reroute through ASW2.",
    topology: campus(),
    goals: [],
  },
  {
    id: "wrong-vlan",
    title: "PC-B can't reach anything",
    exam: "encor",
    objective: "3.1.a",
    kind: "challenge",
    brief: "Ticket #5120: PC-B was moved to a new desk this morning and now cannot reach the server or PC-A. The user swears they changed nothing.",
    hint: "Ping PC-B's default gateway first. Then look at which VLAN ASW2 puts PC-B's port in.",
    debrief:
      "The access port was left in VLAN 10, so PC-B (a 10.20.20.0/24 host) was sitting in the wrong broadcast domain. Its ARP for 10.20.20.1 was flooded in VLAN 10, and nothing there answers for that address. Always check `show vlan brief` against the host's subnet.",
    topology: tweak((t) => {
      port(t, "ASW2", "Gi1/0/2").vlan = 10;
    }),
    goals: [
      { type: "reach", from: "PC-B", to: "192.0.2.10", expect: true, label: "PC-B reaches the server" },
      { type: "reach", from: "PC-B", to: "10.10.10.11", expect: true, label: "PC-B reaches PC-A" },
    ],
  },
  {
    id: "pruned-trunk",
    title: "Last night's trunk cleanup",
    exam: "encor",
    objective: "3.1.a",
    kind: "challenge",
    brief:
      "Change #5133 'tidied up' the allowed VLAN lists on ASW2's trunks. VLAN 10 and the guest VLAN still work, but every VLAN 20 user is down.",
    hint: "Compare the allowed list on each trunk with the VLANs that live on ASW2. A VLAN needs a forwarding path all the way to its gateway.",
    debrief:
      "VLAN 20 was missing from ASW2's uplink and from the ASW1–ASW2 link, which left VLAN 20 on ASW2 as an island. If you only fixed the cross-link, VLAN 20 now reaches DSW1 through ASW1. That works, but it takes the long way. Spanning tree builds its tree per VLAN, so a pruned trunk changes the topology for that VLAN only.",
    topology: tweak((t) => {
      port(t, "ASW2", "Gi1/0/1").allowed = [10, 30];
      port(t, "ASW2", "Gi1/0/3").allowed = [10, 30];
      port(t, "ASW1", "Gi1/0/3").allowed = [10, 30];
    }),
    goals: [
      { type: "reach", from: "PC-B", to: "192.0.2.10", expect: true, label: "PC-B reaches the server" },
      { type: "reach", from: "PC-A", to: "192.0.2.10", expect: true, label: "PC-A still reaches the server" },
    ],
  },
  {
    id: "return-route",
    title: "The ping goes out but never comes back",
    exam: "encor",
    objective: "4.1",
    kind: "challenge",
    brief:
      "Ticket #5141: PC-B times out to the server, while PC-A is fine. The server team says they can see the pings arriving. Find where the reply dies.",
    hint: "Run the ping and step through the packet walk. The echo request makes it. Follow the echo reply.",
    debrief:
      "R1 had routes back to VLANs 10 and 30 but not to 10.20.20.0/24, so the server's replies died at R1 with 'no route'. Routing has to work in both directions. Traceroute from the far side, or a packet walk, shows the asymmetry at once.",
    topology: tweak((t) => {
      dev(t, "R1").routes = dev(t, "R1").routes!.filter((r) => r.prefix !== "10.20.20.0/24");
    }),
    goals: [
      { type: "reach", from: "PC-B", to: "192.0.2.10", expect: true, label: "PC-B reaches the server" },
      { type: "reach", from: "PC-A", to: "192.0.2.10", expect: true, label: "PC-A still reaches the server" },
    ],
  },
  {
    id: "acl-guest",
    title: "Guest isolation went too far",
    exam: "encor",
    objective: "5.2.a",
    kind: "challenge",
    brief:
      "Security asked for the guest VLAN (10.30.30.0/24) to be blocked from the server network. After the change, staff can't reach the server either. Keep guests out and let staff back in. Do not just remove the ACL.",
    hint: "Read ACL EDGE on R1 line by line. What does line 10 actually match?",
    debrief:
      "Line 10 denied the whole 10.0.0.0/8, which includes both staff VLANs. Narrowing it to 10.30.30.0/24 keeps the intent. Extended ACLs are evaluated top-down and stop at the first match, so an over-broad deny shadows everything below it.",
    topology: tweak((t) => {
      const r1 = dev(t, "R1");
      r1.acls = {
        EDGE: [
          { action: "deny", proto: "ip", src: "10.0.0.0/8", dst: "192.0.2.0/24" },
          { action: "permit", proto: "ip", src: "any", dst: "any" },
        ],
      };
      port(t, "R1", "Gi0/0").aclIn = "EDGE";
    }),
    goals: [
      { type: "reach", from: "PC-A", to: "192.0.2.10", expect: true, label: "PC-A (staff) reaches the server" },
      { type: "reach", from: "PC-B", to: "192.0.2.10", expect: true, label: "PC-B (staff) reaches the server" },
      { type: "reach", from: "PC-C", to: "192.0.2.10", expect: false, label: "PC-C (guest) is blocked from the server" },
    ],
  },
  {
    id: "stp-root",
    title: "The root bridge moved",
    exam: "encor",
    objective: "3.1.c",
    kind: "challenge",
    brief:
      "Someone lab-tested priorities on ASW2 and left them behind. Traffic still flows, but the spanning-tree root is now an access switch and VLAN 10 takes a strange path. Put the root back on the distribution switch for VLANs 10 and 20.",
    hint: "Use the L2 lens and look at the crown icon. Bridge priority goes up in steps of 4096, and the lowest bridge ID wins.",
    debrief:
      "ASW2 had priority 4096, which beats DSW1's default. With DSW1 at 4096 or lower (or ASW2 put back to the default), DSW1 wins the election again. Pin the root deliberately with `spanning-tree vlan X root primary` and protect it with root guard on downlinks.",
    topology: tweak((t) => {
      dev(t, "ASW2").stpPriority = 4096;
      dev(t, "DSW1").stpPriority = 32768;
    }),
    goals: [
      { type: "stpRoot", vlan: 10, device: "DSW1", label: "DSW1 is root for VLAN 10" },
      { type: "stpRoot", vlan: 20, device: "DSW1", label: "DSW1 is root for VLAN 20" },
      { type: "reach", from: "PC-A", to: "192.0.2.10", expect: true, label: "PC-A reaches the server" },
    ],
  },
  {
    id: "dead-gateway",
    title: "Two faults, one symptom",
    exam: "encor",
    objective: "4.1",
    kind: "challenge",
    brief: "Ticket #5160: PC-A has no access to anything off its subnet. The previous engineer found 'the problem', fixed it, and it still doesn't work.",
    hint: "Check the host first (ipconfig), then the gateway itself. Is interface Vlan10 actually up?",
    debrief:
      "PC-A pointed at 10.10.10.254, which does not exist, and DSW1's interface Vlan10 was administratively down. Fixing only one of them changes nothing visible, which is why the bottom-up method matters: confirm each layer before you move on.",
    topology: tweak((t) => {
      dev(t, "PC-A").gateway = "10.10.10.254";
      dev(t, "DSW1").svis!.find((s) => s.vlan === 10)!.shutdown = true;
    }),
    goals: [{ type: "reach", from: "PC-A", to: "192.0.2.10", expect: true, label: "PC-A reaches the server" }],
  },
];

export const scenarioById = Object.fromEntries(scenarios.map((s) => [s.id, s]));
