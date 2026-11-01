import type { ChannelMode, Device, Ospf, Port, Scenario, Topology } from "@/lib/net/types";

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


// --- OSPF ---------------------------------------------------------------------------
//
//   PC4 ── R4 ─┐                         area 1 (point-to-point)
//              │ 10.0.0.0/24 (SW0)    ┌────────────────────┐
//   PC1 ── R1 ─┴──────── SW0 ──────── R2 (ABR) ─────────── R3 ── PC3 (10.3.0.0/24)
//              area 0, DR election                               └── SRV (10.3.1.0/24)

const rtr = (id: string, x: number, y: number, ports: Port[], ospf: Ospf): Device => ({ id, kind: "router", x, y, ports, ospf });
const host = (id: string, kind: "pc" | "server", x: number, y: number, ip: string, gateway: string): Device => ({ id, kind, x, y, ports: [{ name: "eth0", ip }], gateway });

export function ospfLab(): Topology {
  return {
    devices: [
      rtr("R4", 380, 90, [{ name: "Gi0/0", ip: "10.0.0.4/24" }, { name: "Gi0/1", ip: "10.4.4.1/24" }, { name: "Gi0/2", shutdown: true }, { name: "Gi0/3", shutdown: true }, { name: "Lo0", ip: "4.4.4.4/32" }], {
        pid: 1,
        networks: [
          { ip: "10.0.0.0", wildcard: "0.0.0.255", area: 0 },
          { ip: "10.4.4.0", wildcard: "0.0.0.255", area: 0 },
          { ip: "4.4.4.4", wildcard: "0.0.0.0", area: 0 },
        ],
        passive: ["Gi0/1"],
      }),
      rtr("R1", 180, 270, [{ name: "Gi0/0", ip: "10.0.0.1/24" }, { name: "Gi0/1", ip: "10.1.1.1/24" }, { name: "Gi0/2", shutdown: true }, { name: "Gi0/3", shutdown: true }, { name: "Lo0", ip: "1.1.1.1/32" }], {
        pid: 1,
        networks: [
          { ip: "10.0.0.0", wildcard: "0.0.0.255", area: 0 },
          { ip: "10.1.1.0", wildcard: "0.0.0.255", area: 0 },
          { ip: "1.1.1.1", wildcard: "0.0.0.0", area: 0 },
        ],
        passive: ["Gi0/1"],
      }),
      { id: "SW0", kind: "switch", x: 380, y: 270, ports: Array.from({ length: 8 }, (_, i) => ({ name: `Gi1/0/${i + 1}`, mode: "access" as const, vlan: 1 })) },
      rtr(
        "R2",
        590,
        270,
        [
          { name: "Gi0/0", ip: "10.0.0.2/24" },
          { name: "Gi0/1", ip: "10.0.23.1/30", ospf: { network: "point-to-point" } },
          { name: "Gi0/2", shutdown: true },
          { name: "Gi0/3", shutdown: true },
          { name: "Lo0", ip: "2.2.2.2/32" },
        ],
        {
          pid: 1,
          networks: [
            { ip: "10.0.0.0", wildcard: "0.0.0.255", area: 0 },
            { ip: "2.2.2.2", wildcard: "0.0.0.0", area: 0 },
            { ip: "10.0.23.0", wildcard: "0.0.0.3", area: 1 },
          ],
        },
      ),
      rtr(
        "R3",
        800,
        270,
        [
          { name: "Gi0/0", ip: "10.0.23.2/30", ospf: { network: "point-to-point" } },
          { name: "Gi0/1", ip: "10.3.0.1/24" },
          { name: "Gi0/2", ip: "10.3.1.1/24" },
          { name: "Gi0/3", shutdown: true },
          { name: "Lo0", ip: "3.3.3.3/32" },
        ],
        {
          pid: 1,
          networks: [
            { ip: "10.0.0.0", wildcard: "0.255.255.255", area: 1 },
            { ip: "3.3.3.3", wildcard: "0.0.0.0", area: 1 },
          ],
          passive: ["Gi0/1", "Gi0/2"],
        },
      ),
      host("PC4", "pc", 180, 90, "10.4.4.10/24", "10.4.4.1"),
      host("PC1", "pc", 180, 440, "10.1.1.10/24", "10.1.1.1"),
      host("PC3", "pc", 800, 440, "10.3.0.10/24", "10.3.0.1"),
      host("SRV", "server", 990, 270, "10.3.1.10/24", "10.3.1.1"),
    ],
    links: [
      { a: ["R1", "Gi0/0"], b: ["SW0", "Gi1/0/1"] },
      { a: ["R2", "Gi0/0"], b: ["SW0", "Gi1/0/2"] },
      { a: ["R4", "Gi0/0"], b: ["SW0", "Gi1/0/3"] },
      { a: ["R2", "Gi0/1"], b: ["R3", "Gi0/0"] },
      { a: ["R1", "Gi0/1"], b: ["PC1", "eth0"] },
      { a: ["R4", "Gi0/1"], b: ["PC4", "eth0"] },
      { a: ["R3", "Gi0/1"], b: ["PC3", "eth0"] },
      { a: ["R3", "Gi0/2"], b: ["SRV", "eth0"] },
    ],
    notes: [
      { id: "note-a0", kind: "rect", x: 120, y: 40, w: 520, h: 450, text: "Area 0" },
      { id: "note-a1", kind: "rect", x: 660, y: 200, w: 390, h: 300, text: "Area 1" },
    ],
  };
}

function ospfTweak(fn: (t: Topology) => void): Topology {
  const t = ospfLab();
  fn(t);
  return t;
}

const reachAll: Scenario["goals"] = [
  { type: "reach", from: "PC1", to: "10.3.1.10", expect: true, label: "PC1 reaches SRV (area 0 → area 1)" },
  { type: "reach", from: "PC4", to: "10.3.0.10", expect: true, label: "PC4 reaches PC3" },
];

scenarios.push(
  {
    id: "ospf",
    title: "OSPF multi-area example",
    exam: "encor",
    objective: "3.2.b",
    kind: "sandbox",
    brief:
      "A working two-area OSPF network. R1, R2 and R4 share a broadcast segment in area 0 (watch the DR/BDR election), and R2 is the ABR to area 1 over a point-to-point link. Try `show ip ospf neighbor`, `show ip route ospf`, then break something and use `debug ip ospf adj`.",
    topology: ospfLab(),
    goals: [],
  },
  {
    id: "ospf-mtu",
    title: "OSPF stuck in EXSTART",
    exam: "encor",
    objective: "3.2.b",
    kind: "challenge",
    brief: "Ticket #6011: after last night's WAN hardware swap on R2, nothing in area 1 is reachable. R2 and R3 can still ping each other across the link.",
    hint: "On R2, run `show ip ospf neighbor`. A neighbour that is seen but never reaches FULL points to the database exchange. Compare the interface settings on both ends of the link.",
    debrief:
      "R2 Gi0/1 had `ip mtu 1400` while R3 used 1500. Hellos still match, so the neighbour appears, but database description packets from the bigger side are dropped and the adjacency sits in EXSTART/EXCHANGE. Match the MTU on both ends (or, as a last resort, `ip ospf mtu-ignore`).",
    topology: ospfTweak((t) => {
      dev(t, "R2").ports.find((p) => p.name === "Gi0/1")!.mtu = 1400;
    }),
    goals: [{ type: "ospfFull", device: "R2", neighbor: "R3", label: "R2 ↔ R3 adjacency is FULL" }, ...reachAll],
  },
  {
    id: "ospf-area",
    title: "Wrong area on the far side",
    exam: "encor",
    objective: "3.2.b",
    kind: "challenge",
    brief: "Ticket #6018: R3 was rebuilt from a template. Its interfaces are up and addressed, but R2 never forms an OSPF neighbour with it.",
    hint: "`debug ip ospf adj` on R2 shows why hellos from R3 are rejected. Compare `show ip ospf interface brief` on both routers.",
    debrief:
      "R3's network statement put its interfaces in area 0 while R2's end of the link is in area 1. The area ID is in every hello and must match on a link. Moving R3 back to area 1 (or moving the link and R3 into area 0) fixes it.",
    topology: ospfTweak((t) => {
      dev(t, "R3").ospf!.networks[0].area = 0;
      dev(t, "R3").ospf!.networks[1].area = 0;
    }),
    goals: [{ type: "ospfFull", device: "R2", neighbor: "R3", label: "R2 ↔ R3 adjacency is FULL" }, ...reachAll],
  },
  {
    id: "ospf-passive",
    title: "Hardened a little too hard",
    exam: "encor",
    objective: "3.2.b",
    kind: "challenge",
    brief: "Ticket #6025: security asked for OSPF to stop sending hellos toward user LANs. After R2 was changed, it has no OSPF neighbours at all, and area 1 is cut off from everything else.",
    hint: "`show ip protocols` lists passive interfaces. With `passive-interface default`, every interface is passive until you say otherwise.",
    debrief:
      "R2 had `passive-interface default` with no exceptions, so it sent no hellos on its transit links either. Keep the default and add `no passive-interface` for Gi0/0 and Gi0/1. Passive interfaces still advertise their subnets; they just never form neighbours.",
    topology: ospfTweak((t) => {
      dev(t, "R2").ospf!.passiveDefault = true;
    }),
    goals: [
      { type: "ospfFull", device: "R2", neighbor: "R3", label: "R2 ↔ R3 adjacency is FULL" },
      { type: "ospfFull", device: "R2", neighbor: "R4", label: "R2 ↔ R4 adjacency is FULL" },
      ...reachAll,
    ],
  },
  {
    id: "ospf-summary",
    title: "Summarise area 1",
    exam: "encor",
    objective: "3.2.b",
    kind: "challenge",
    brief: "Design change #6031: area 0 should see area 1's 10.3.x.x LANs as one /16 summary rather than individual /24s. Everything must stay reachable.",
    hint: "Inter-area summarisation happens on the ABR, under `router ospf`, for the area the routes come from.",
    debrief:
      "`area 1 range 10.3.0.0 255.255.0.0` on R2 replaces the /24 type-3 LSAs with one summary. R2 also installs `10.3.0.0/16 is a summary, Null0`, a discard route that stops loops for addresses inside the range that don't exist. Summaries can only be made where the area boundary is, on an ABR.",
    topology: ospfLab(),
    goals: [
      { type: "route", device: "R1", prefix: "10.3.0.0/16", code: "O IA", expect: true, label: "R1 has O IA 10.3.0.0/16" },
      { type: "route", device: "R1", prefix: "10.3.0.0/24", expect: false, label: "R1 no longer has 10.3.0.0/24" },
      ...reachAll,
    ],
  },
  {
    id: "ospf-dr",
    title: "Pick the DR on purpose",
    exam: "encor",
    objective: "3.2.b",
    kind: "challenge",
    brief:
      "Design change #6040: on the shared 10.0.0.0/24 segment, R2 (the ABR) must be the DR, and R1 (a small branch router) must never become DR or BDR. Today the election is left to router IDs.",
    hint: "The election compares interface priority first, then router ID. Priority 0 means never DR or BDR.",
    debrief:
      "`ip ospf priority 255` on R2 Gi0/0 and `ip ospf priority 0` on R1 Gi0/0 decide the election. Real OSPF does not pre-empt: a running DR keeps its role until it fails, so in production you would also clear the process (or wait for a failover). Wire Room shows the converged result.",
    topology: ospfLab(),
    goals: [
      { type: "ospfRole", device: "R2", iface: "Gi0/0", role: "DR", label: "R2 is the DR on 10.0.0.0/24" },
      { type: "ospfRole", device: "R1", iface: "Gi0/0", role: "DROTHER", label: "R1 is DROTHER (never DR/BDR)" },
      ...reachAll,
    ],
  },
);

// --- EtherChannel -------------------------------------------------------------------
//
//   PC1 (v10) ─┐                         ┌─ PC2 (v10)
//              SW1 ══ Gi1/0/23-24 / Po1 ══ SW2
//   PC3 (v20) ─┘        802.1Q trunk     └─ SRV (v20)

function lagSwitch(id: string, x: number, mode: ChannelMode): Device {
  const ports: Port[] = Array.from({ length: 24 }, (_, i) => ({ name: `Gi1/0/${i + 1}`, mode: "access" as const, vlan: 1 }));
  ports[0].vlan = 10;
  ports[1].vlan = 20;
  // Members carry the same config as the Port-channel, as IOS requires.
  for (const i of [22, 23]) ports[i] = { name: `Gi1/0/${i + 1}`, mode: "trunk", channel: { group: 1, mode } };
  return { id, kind: "switch", x, y: 250, ports, portChannels: [{ name: "Po1", mode: "trunk" }] };
}

export function lagLab(): Topology {
  return {
    devices: [
      lagSwitch("SW1", 320, "active"),
      lagSwitch("SW2", 700, "passive"),
      host("PC1", "pc", 160, 130, "10.10.0.11/24", "10.10.0.1"),
      host("PC3", "pc", 160, 390, "10.20.0.13/24", "10.20.0.1"),
      host("PC2", "pc", 860, 130, "10.10.0.12/24", "10.10.0.1"),
      host("SRV", "server", 860, 390, "10.20.0.10/24", "10.20.0.1"),
    ],
    links: [
      { a: ["SW1", "Gi1/0/23"], b: ["SW2", "Gi1/0/23"] },
      { a: ["SW1", "Gi1/0/24"], b: ["SW2", "Gi1/0/24"] },
      { a: ["SW1", "Gi1/0/1"], b: ["PC1", "eth0"] },
      { a: ["SW1", "Gi1/0/2"], b: ["PC3", "eth0"] },
      { a: ["SW2", "Gi1/0/1"], b: ["PC2", "eth0"] },
      { a: ["SW2", "Gi1/0/2"], b: ["SRV", "eth0"] },
    ],
  };
}

function lagTweak(fn: (t: Topology) => void): Topology {
  const t = lagLab();
  fn(t);
  return t;
}
const members = (t: Topology, id: string) => dev(t, id).ports.filter((p) => p.channel);
const lagReach: Scenario["goals"] = [
  { type: "reach", from: "PC1", to: "10.10.0.12", expect: true, label: "PC1 reaches PC2 (VLAN 10)" },
  { type: "reach", from: "PC3", to: "10.20.0.10", expect: true, label: "PC3 reaches SRV (VLAN 20)" },
];

scenarios.push(
  {
    id: "lag",
    title: "EtherChannel example",
    exam: "encor",
    objective: "3.1.b",
    kind: "sandbox",
    brief:
      "Two switches joined by a two-link LACP bundle (Po1) carrying VLANs 10 and 20. Try `show etherchannel summary`, then shut one member and ping again: the bundle stays up. Switch to the L2 lens to see that spanning tree treats Po1 as a single link.",
    topology: lagLab(),
    goals: [],
  },
  {
    id: "lacp-passive",
    title: "The bundle that never formed",
    exam: "encor",
    objective: "3.1.b",
    kind: "challenge",
    brief:
      "Ticket #7002: the two uplinks between SW1 and SW2 were meant to be one 2 Gb/s bundle. Pings work, but monitoring shows one link idle and spanning tree blocking it.",
    hint: "`show etherchannel summary` on both switches. What do the member flags say, and which LACP mode is each side in?",
    debrief:
      "Both ends were LACP passive. Passive answers LACPDUs but never sends them, so nothing negotiates and the members run stand-alone (I), with STP blocking one. At least one side must be active. The traffic still flowing is why this goes unnoticed in real networks.",
    topology: lagTweak((t) => members(t, "SW1").forEach((p) => (p.channel!.mode = "passive"))),
    goals: [{ type: "bundle", device: "SW1", po: "Po1", label: "Po1 is bundled (SU) on SW1" }, ...lagReach],
  },
  {
    id: "lacp-on",
    title: "Static meets LACP",
    exam: "encor",
    objective: "3.1.b",
    kind: "challenge",
    brief: "Ticket #7009: SW1 was configured from an old template that hard-codes the bundle. SW2 runs LACP. The Port-channel is down on both sides.",
    hint: "Mode `on` sends no negotiation protocol at all. Which mode combinations can form a bundle?",
    debrief:
      "`mode on` never speaks LACP, so an LACP-active peer gets no partner and the bundle stays down. Use LACP on both ends (active/active or active/passive), or `on` on both. Mixing static and LACP is a classic way to cause loops or blackholes.",
    topology: lagTweak((t) => members(t, "SW1").forEach((p) => (p.channel!.mode = "on"))),
    goals: [{ type: "bundle", device: "SW1", po: "Po1", label: "Po1 is bundled (SU) on SW1" }, ...lagReach],
  },
  {
    id: "po-access",
    title: "Bundle up, VLANs down",
    exam: "encor",
    objective: "3.1.b",
    kind: "challenge",
    brief: "Ticket #7015: SW2 was replaced. `show etherchannel summary` says Po1 is SU on both switches, yet no host on SW1 can reach anything on SW2.",
    hint: "Configuration that matters lives on the Port-channel interface, not the members. Compare `show interfaces trunk` on both switches.",
    debrief:
      "SW2's Port-channel1 was an access port while SW1's was a trunk. SW1 tags VLAN 10 and 20 frames, and an access port drops tagged frames. Configure trunking on interface Port-channel1 itself; the members follow it.",
    topology: lagTweak((t) => (dev(t, "SW2").portChannels![0] = { name: "Po1", mode: "access", vlan: 1 })),
    goals: lagReach,
  },
);

// --- NAT ------------------------------------------------------------------------------
//
//   PC1 ─┐
//   PC2 ─┼─ SW1 ── R1 (Gi0/1 inside 10.0.0.1 | Gi0/0 outside 203.0.113.2) ── ISP ── WEB 198.51.100.10
//   SRV ─┘                                                                 (no route to 10/8)

const router = (id: string, x: number, y: number, ports: Port[], extra: Partial<Device> = {}): Device => ({ id, kind: "router", x, y, ports, ...extra });
const down = (...names: string[]): Port[] => names.map((name) => ({ name, shutdown: true }));
const sw = (id: string, x: number, y: number, n = 24): Device => ({ id, kind: "switch", x, y, ports: Array.from({ length: n }, (_, i) => ({ name: `Gi1/0/${i + 1}`, mode: "access" as const, vlan: 1 })) });

export function natLab(): Topology {
  return {
    devices: [
      host("PC1", "pc", 140, 130, "10.0.0.11/24", "10.0.0.1"),
      host("PC2", "pc", 140, 290, "10.0.0.12/24", "10.0.0.1"),
      host("SRV", "server", 140, 450, "10.0.0.50/24", "10.0.0.1"),
      sw("SW1", 330, 290, 8),
      router(
        "R1",
        530,
        290,
        [{ name: "Gi0/0", ip: "203.0.113.2/24", nat: "outside" }, { name: "Gi0/1", ip: "10.0.0.1/24", nat: "inside" }, ...down("Gi0/2", "Gi0/3")],
        {
          routes: [{ prefix: "0.0.0.0/0", via: "203.0.113.1" }],
          acls: { "1": [{ action: "permit", proto: "ip", src: "10.0.0.0/24", dst: "any" }] },
          nat: { rules: [{ kind: "dynamic", acl: "1", iface: "Gi0/0", overload: true }], pools: [] },
        },
      ),
      router("ISP", 740, 290, [{ name: "Gi0/0", ip: "203.0.113.1/24" }, { name: "Gi0/1", ip: "198.51.100.1/24" }, ...down("Gi0/2", "Gi0/3")]),
      host("WEB", "server", 940, 290, "198.51.100.10/24", "198.51.100.1"),
    ],
    links: [
      { a: ["PC1", "eth0"], b: ["SW1", "Gi1/0/1"] },
      { a: ["PC2", "eth0"], b: ["SW1", "Gi1/0/2"] },
      { a: ["SRV", "eth0"], b: ["SW1", "Gi1/0/3"] },
      { a: ["SW1", "Gi1/0/8"], b: ["R1", "Gi0/1"] },
      { a: ["R1", "Gi0/0"], b: ["ISP", "Gi0/0"] },
      { a: ["ISP", "Gi0/1"], b: ["WEB", "eth0"] },
    ],
    notes: [
      { id: "note-in", kind: "rect", x: 70, y: 50, w: 560, h: 470, text: "Inside · private 10.0.0.0/24" },
      { id: "note-out", kind: "rect", x: 650, y: 190, w: 390, h: 200, text: "Outside · Internet" },
    ],
  };
}

function natTweak(fn: (t: Topology) => void): Topology {
  const t = natLab();
  fn(t);
  return t;
}
const natGoals: Scenario["goals"] = [
  { type: "natVia", from: "PC1", to: "198.51.100.10", device: "R1", label: "PC1 reaches WEB, translated by R1" },
  { type: "natVia", from: "PC2", to: "198.51.100.10", device: "R1", label: "PC2 reaches WEB, translated by R1" },
];

scenarios.push(
  {
    id: "nat",
    title: "NAT/PAT example",
    exam: "encor",
    objective: "3.3.b",
    kind: "sandbox",
    brief:
      "An edge router translating a private LAN to its single public address (PAT). The ISP has no route back to 10.0.0.0/8, just like the real Internet. Ping WEB from PC1 and PC2, then run `show ip nat translations` on R1 and step through the packet walk to see when the translation happens.",
    topology: natLab(),
    goals: [],
  },
  {
    id: "nat-outside",
    title: "Nobody can reach the Internet",
    exam: "encor",
    objective: "3.3.b",
    kind: "challenge",
    brief: "Ticket #8004: R1 was replaced last night and the config restored from a backup. Inside users reach R1 but nothing beyond it.",
    hint: "Follow a ping in the packet walk: does R1 translate the source? `show ip nat statistics` lists inside and outside interfaces.",
    debrief:
      "Gi0/0 was missing `ip nat outside`. NAT only translates traffic that moves from an inside interface to an outside one, so packets left with private source addresses and the ISP dropped the replies (it has no route to 10.0.0.0/8).",
    topology: natTweak((t) => delete dev(t, "R1").ports.find((p) => p.name === "Gi0/0")!.nat),
    goals: natGoals,
  },
  {
    id: "nat-acl",
    title: "The ACL that matches nothing",
    exam: "encor",
    objective: "3.3.b",
    kind: "challenge",
    brief: "Ticket #8011: after the LAN was renumbered, Internet access stopped. The NAT rule and interfaces look right.",
    hint: "NAT uses an ACL to choose which inside sources to translate. What does access-list 1 match today?",
    debrief:
      "access-list 1 still permitted the old subnet 10.0.1.0/24, so no inside host matched the NAT rule and traffic left untranslated. Packets that don't match a NAT ACL aren't dropped, they just aren't translated, which is why this fails silently.",
    topology: natTweak((t) => (dev(t, "R1").acls!["1"] = [{ action: "permit", proto: "ip", src: "10.0.1.0/24", dst: "any" }])),
    goals: natGoals,
  },
  {
    id: "nat-static",
    title: "Publish the inside server",
    exam: "encor",
    objective: "3.3.b",
    kind: "challenge",
    brief: "Change #8020: partners on the Internet (WEB) must reach the inside server SRV (10.0.0.50) at public address 203.0.113.50. Users' Internet access must keep working.",
    hint: "PAT only creates translations for traffic started from the inside. For traffic started from the outside you need a permanent one-to-one mapping.",
    debrief:
      "`ip nat inside source static 10.0.0.50 203.0.113.50` creates a permanent mapping, so outside hosts can start connections to 203.0.113.50. R1 also answers ARP for 203.0.113.50 on its outside interface, which is why the ISP can deliver packets to an address no interface is configured with.",
    topology: natLab(),
    goals: [{ type: "reach", from: "WEB", to: "203.0.113.50", expect: true, label: "WEB reaches SRV at 203.0.113.50" }, natGoals[0]],
  },
  {
    id: "nat-pool",
    title: "Second user, no Internet",
    exam: "encor",
    objective: "3.3.b",
    kind: "challenge",
    brief: "Ticket #8027: whichever inside user goes online first works fine. Everyone after that gets nothing. The ISP gave us only one public address for user traffic, 203.0.113.10.",
    hint: "`show ip nat statistics` shows the pool usage and misses. How many inside hosts can a one-address pool serve without port translation?",
    debrief:
      "Dynamic NAT without `overload` maps one inside host to one global address. With a one-address pool, the second host can't be translated and its packets are dropped. Adding `overload` turns it into PAT, so many hosts share the address using different identifiers.",
    topology: natTweak((t) => {
      dev(t, "R1").nat = { rules: [{ kind: "dynamic", acl: "1", pool: "PUBLIC", overload: false }], pools: [{ name: "PUBLIC", start: "203.0.113.10", end: "203.0.113.10", len: 24 }] };
    }),
    goals: [
      {
        type: "reachAll",
        pairs: [
          ["PC1", "198.51.100.10"],
          ["PC2", "198.51.100.10"],
        ],
        label: "PC1 and PC2 reach WEB at the same time",
      },
    ],
  },
);

// --- DHCP -----------------------------------------------------------------------------
//
//   PCA1 ─┐                                                      ┌─ PCB1
//   PCA2 ─┼─ SWA ── HQ (DHCP server) ── 10.0.0.0/30 ── BR (relay) ── SWB ─┴─ PCB2
//   SRVA ─┘  10.10.0.0/24                                    10.20.0.0/24

const client = (id: string, x: number, y: number): Device => ({ id, kind: "pc", x, y, ports: [{ name: "eth0" }], dhcpClient: true });

export function dhcpLab(): Topology {
  return {
    devices: [
      client("PCA1", 110, 110),
      client("PCA2", 110, 290),
      host("SRVA", "server", 300, 380, "10.10.0.11/24", "10.10.0.1"),
      sw("SWA", 300, 200, 8),
      router("HQ", 510, 200, [{ name: "Gi0/0", ip: "10.0.0.1/30" }, { name: "Gi0/1", ip: "10.10.0.1/24" }, ...down("Gi0/2", "Gi0/3")], {
        routes: [{ prefix: "10.20.0.0/24", via: "10.0.0.2" }],
        dhcp: {
          excluded: [
            { start: "10.10.0.1", end: "10.10.0.10" },
            { start: "10.20.0.1", end: "10.20.0.10" },
          ],
          pools: [
            { name: "LAN-A", network: "10.10.0.0/24", gateway: "10.10.0.1", dns: "10.10.0.11" },
            { name: "LAN-B", network: "10.20.0.0/24", gateway: "10.20.0.1", dns: "10.10.0.11" },
          ],
        },
      }),
      router("BR", 720, 200, [{ name: "Gi0/0", ip: "10.0.0.2/30" }, { name: "Gi0/1", ip: "10.20.0.1/24", helpers: ["10.0.0.1"] }, ...down("Gi0/2", "Gi0/3")], {
        routes: [{ prefix: "0.0.0.0/0", via: "10.0.0.1" }],
      }),
      sw("SWB", 900, 200, 8),
      client("PCB1", 1080, 110),
      client("PCB2", 1080, 290),
    ],
    links: [
      { a: ["PCA1", "eth0"], b: ["SWA", "Gi1/0/1"] },
      { a: ["PCA2", "eth0"], b: ["SWA", "Gi1/0/2"] },
      { a: ["SRVA", "eth0"], b: ["SWA", "Gi1/0/3"] },
      { a: ["SWA", "Gi1/0/8"], b: ["HQ", "Gi0/1"] },
      { a: ["HQ", "Gi0/0"], b: ["BR", "Gi0/0"] },
      { a: ["BR", "Gi0/1"], b: ["SWB", "Gi1/0/8"] },
      { a: ["PCB1", "eth0"], b: ["SWB", "Gi1/0/1"] },
      { a: ["PCB2", "eth0"], b: ["SWB", "Gi1/0/2"] },
    ],
  };
}

function dhcpTweak(fn: (t: Topology) => void): Topology {
  const t = dhcpLab();
  fn(t);
  return t;
}
const pool = (t: Topology, name: string) => dev(t, "HQ").dhcp!.pools.find((p) => p.name === name)!;

scenarios.push(
  {
    id: "dhcp",
    title: "DHCP server and relay example",
    exam: "encor",
    objective: "4.1",
    kind: "sandbox",
    brief:
      "HQ runs the DHCP server for both LANs; BR relays the branch's broadcasts with `ip helper-address`. Open a PC's console and type `ip dhcp`, then step through the packet walk: DISCOVER, relay with giaddr, OFFER, REQUEST, ACK. SRVA's static 10.10.0.11 sits inside LAN-A's pool, so watch the server's ping check skip it.",
    topology: dhcpLab(),
    goals: [],
  },
  {
    id: "dhcp-relay",
    title: "Branch users get 169.254 addresses",
    exam: "encor",
    objective: "4.1",
    kind: "challenge",
    brief: "Ticket #9003: every PC at the branch shows a 169.254.x.x address after BR was replaced. HQ users are fine.",
    hint: "Run `ip dhcp` on a branch PC and follow the packet walk. Routers don't forward broadcasts unless told to.",
    debrief:
      "BR's LAN interface had no `ip helper-address`, so the DISCOVER broadcast stopped at the router. With the helper, BR relays it as unicast to HQ and sets giaddr to 10.20.0.1, which is how HQ knows to use pool LAN-B.",
    topology: dhcpTweak((t) => delete dev(t, "BR").ports.find((p) => p.name === "Gi0/1")!.helpers),
    goals: [{ type: "dhcp", host: "PCB1", within: "10.20.0.0/24", to: "10.10.0.11", label: "PCB1 gets a 10.20.0.0/24 lease and reaches SRVA" }],
  },
  {
    id: "dhcp-gateway",
    title: "Address yes, Internet no",
    exam: "encor",
    objective: "4.1",
    kind: "challenge",
    brief: "Ticket #9010: HQ PCs get an address by DHCP and can reach the local server, but nothing outside their subnet, including the branch.",
    hint: "Compare `ipconfig` on an HQ PC with `show ip dhcp pool` on HQ. Which option tells a client where to send off-subnet traffic?",
    debrief:
      "Pool LAN-A had no `default-router`, so clients got an IP and mask but no gateway. They could only reach their own subnet. DHCP options are as important as the address itself.",
    topology: dhcpTweak((t) => delete pool(t, "LAN-A").gateway),
    goals: [{ type: "dhcp", host: "PCA1", within: "10.10.0.0/24", to: "10.20.0.1", label: "PCA1 gets a lease with a gateway and reaches the branch" }],
  },
  {
    id: "dhcp-pool",
    title: "The relay works, the server says no",
    exam: "encor",
    objective: "4.1",
    kind: "challenge",
    brief: "Ticket #9018: branch PCs still don't get addresses. BR does have its helper-address, and HQ is reachable from BR.",
    hint: "When a request is relayed, the server picks a pool by matching giaddr. Does any pool on HQ contain 10.20.0.1?",
    debrief:
      "Pool LAN-B had `network 10.2.0.0 255.255.255.0`, a typo. The relayed DISCOVER arrived with giaddr 10.20.0.1, no pool matched, and HQ stayed silent (`DHCPD: there is no pool for 10.20.0.1`).",
    topology: dhcpTweak((t) => (pool(t, "LAN-B").network = "10.2.0.0/24")),
    goals: [{ type: "dhcp", host: "PCB1", within: "10.20.0.0/24", to: "10.10.0.11", label: "PCB1 gets a 10.20.0.0/24 lease and reaches SRVA" }],
  },
);

// --- BGP ------------------------------------------------------------------------------
//
//                    ┌── ISPA (AS 65010) ──┐
//   PC1 ── R1 (AS 65001)                    INET (AS 65100) ── WEB 198.51.100.10
//   203.0.113.0/24   └── ISPB (AS 65020) ──┘

export function bgpLab(): Topology {
  return {
    devices: [
      host("PC1", "pc", 110, 230, "203.0.113.10/24", "203.0.113.1"),
      router(
        "R1",
        300,
        230,
        [{ name: "Gi0/0", ip: "192.0.2.1/30" }, { name: "Gi0/1", ip: "192.0.2.5/30" }, { name: "Gi0/2", ip: "203.0.113.1/24" }, ...down("Gi0/3")],
        {
          bgp: {
            asn: 65001,
            neighbors: [
              { ip: "192.0.2.2", remoteAs: 65010 },
              { ip: "192.0.2.6", remoteAs: 65020 },
            ],
            networks: ["203.0.113.0/24"],
          },
        },
      ),
      router("ISPA", 540, 150, [{ name: "Gi0/0", ip: "192.0.2.2/30" }, { name: "Gi0/1", ip: "100.64.1.1/30" }, ...down("Gi0/2", "Gi0/3")], {
        bgp: { asn: 65010, neighbors: [{ ip: "192.0.2.1", remoteAs: 65001 }, { ip: "100.64.1.2", remoteAs: 65100 }], networks: [] },
      }),
      router("ISPB", 540, 310, [{ name: "Gi0/0", ip: "192.0.2.6/30" }, { name: "Gi0/1", ip: "100.64.2.1/30" }, ...down("Gi0/2", "Gi0/3")], {
        bgp: { asn: 65020, neighbors: [{ ip: "192.0.2.5", remoteAs: 65001 }, { ip: "100.64.2.2", remoteAs: 65100 }], networks: [] },
      }),
      router("INET", 780, 230, [{ name: "Gi0/0", ip: "100.64.1.2/30" }, { name: "Gi0/1", ip: "100.64.2.2/30" }, { name: "Gi0/2", ip: "198.51.100.1/24" }, ...down("Gi0/3")], {
        bgp: { asn: 65100, neighbors: [{ ip: "100.64.1.1", remoteAs: 65010 }, { ip: "100.64.2.1", remoteAs: 65020 }], networks: ["198.51.100.0/24"] },
      }),
      host("WEB", "server", 990, 230, "198.51.100.10/24", "198.51.100.1"),
    ],
    links: [
      { a: ["PC1", "eth0"], b: ["R1", "Gi0/2"] },
      { a: ["R1", "Gi0/0"], b: ["ISPA", "Gi0/0"] },
      { a: ["R1", "Gi0/1"], b: ["ISPB", "Gi0/0"] },
      { a: ["ISPA", "Gi0/1"], b: ["INET", "Gi0/0"] },
      { a: ["ISPB", "Gi0/1"], b: ["INET", "Gi0/1"] },
      { a: ["INET", "Gi0/2"], b: ["WEB", "eth0"] },
    ],
    notes: [{ id: "note-ent", kind: "rect", x: 50, y: 160, w: 330, h: 150, text: "Enterprise · AS 65001" }],
  };
}

function bgpTweak(fn: (t: Topology) => void): Topology {
  const t = bgpLab();
  fn(t);
  return t;
}
const webReach: Scenario["goals"][number] = { type: "reach", from: "PC1", to: "198.51.100.10", expect: true, label: "PC1 reaches WEB across the Internet" };

scenarios.push(
  {
    id: "bgp",
    title: "Dual-homed eBGP example",
    exam: "encor",
    objective: "3.2.c",
    kind: "sandbox",
    brief:
      "An enterprise in AS 65001 dual-homed to two ISPs, which both peer with an 'Internet' AS that hosts WEB. Try `show ip bgp summary` and `show ip bgp` on R1: two paths to 198.51.100.0/24, and the output says which best-path step chose the winner. Then shut one ISP link and ping again.",
    topology: bgpLab(),
    goals: [],
  },
  {
    id: "bgp-remote-as",
    title: "One ISP session never comes up",
    exam: "encor",
    objective: "3.2.c",
    kind: "challenge",
    brief: "Ticket #10002: monitoring says the BGP session from R1 to ISP-A has been down since the circuit was handed over. ISP-B works, so users haven't noticed yet.",
    hint: "`show ip bgp summary` shows the state. `show ip bgp neighbors` and the console log say why a session is reset.",
    debrief:
      "R1 had `neighbor 192.0.2.2 remote-as 65011` but ISP-A is AS 65010. When the OPEN message arrives with a different AS, BGP sends NOTIFICATION 2/2 (peer in wrong AS) and the session drops back to Idle/Active. remote-as must be the neighbour's AS, and both sides must agree.",
    topology: bgpTweak((t) => (dev(t, "R1").bgp!.neighbors[0].remoteAs = 65011)),
    goals: [{ type: "bgpUp", device: "R1", neighbor: "192.0.2.2", label: "R1 ↔ ISP-A session is Established" }, webReach],
  },
  {
    id: "bgp-network",
    title: "We can reach out, nobody can reach in",
    exam: "encor",
    objective: "3.2.c",
    kind: "challenge",
    brief: "Ticket #10009: after a 'cleanup' of R1's BGP config, our users can't load anything on the Internet. Both BGP sessions are Established.",
    hint: "Check whether R1 is actually advertising our prefix: `show ip bgp` on R1, then on INET. What does `network … mask …` require?",
    debrief:
      "R1 had `network 203.0.113.0 mask 255.255.0.0`, a /16. BGP only originates a network when that exact prefix and mask are in the routing table, and R1 only has 203.0.113.0/24. Nothing was advertised, so WEB's replies had no route back.",
    topology: bgpTweak((t) => (dev(t, "R1").bgp!.networks = ["203.0.0.0/16"])),
    goals: [{ type: "route", device: "INET", prefix: "203.0.113.0/24", code: "B", expect: true, label: "INET has a BGP route to 203.0.113.0/24" }, webReach],
  },
  {
    id: "bgp-outbound",
    title: "Send our traffic via ISP-B",
    exam: "encor",
    objective: "3.2.c",
    kind: "challenge",
    brief: "Change #10015: ISP-A charges per gigabyte. All outbound Internet traffic from AS 65001 should leave through ISP-B, keeping ISP-A as backup.",
    hint: "Outbound path selection is decided by R1's own best-path choice. Which attributes does R1 evaluate before AS-path length? (Weight is local to one router; local preference covers the whole AS.)",
    debrief:
      "A route-map on routes from ISP-B with `set local-preference 200` (or a higher `neighbor … weight` on R1) makes R1 prefer ISP-B, since those attributes come before AS-path length in best-path selection. Local preference is the standard choice because it is shared with every router in the AS.",
    topology: bgpLab(),
    goals: [{ type: "bgpBest", device: "R1", prefix: "198.51.100.0/24", nextHop: "192.0.2.6", label: "R1's best path to 198.51.100.0/24 is via ISP-B (192.0.2.6)" }, webReach],
  },
  {
    id: "bgp-inbound",
    title: "Make the Internet come in via ISP-B",
    exam: "encor",
    objective: "3.2.c",
    kind: "challenge",
    brief: "Change #10021: return traffic to 203.0.113.0/24 should also arrive through ISP-B. We don't control INET, but we control what we advertise.",
    hint: "Local preference and weight only change your own decisions. To influence other ASes, make the path through ISP-A look worse to them.",
    debrief:
      "AS-path prepending on the advertisement to ISP-A (`set as-path prepend 65001 65001` in a route-map applied `out` to 192.0.2.2) makes that path longer, so INET prefers the path through ISP-B. It's a request, not a command: other ASes can override it with their own local preference.",
    topology: bgpLab(),
    goals: [{ type: "bgpBest", device: "INET", prefix: "203.0.113.0/24", nextHop: "100.64.2.1", label: "INET reaches 203.0.113.0/24 via ISP-B (100.64.2.1)" }, webReach],
  },
);

// --- Router-on-a-stick (802.1Q subinterfaces) --------------------------------------------

export function roasLab(): Topology {
  const s1 = sw("SW1", 400, 230, 24);
  s1.ports[0].vlan = 10;
  s1.ports[1].vlan = 20;
  Object.assign(s1.ports[23], { mode: "trunk" as const, allowed: [10, 20] });
  return {
    devices: [
      router("R1", 400, 110, [{ name: "Gi0/0" }, { name: "Gi0/0.10", encap: { vlan: 10 }, ip: "10.10.10.1/24" }, { name: "Gi0/0.20", encap: { vlan: 20 }, ip: "10.20.20.1/24" }, ...down("Gi0/1")]),
      s1,
      host("PC10", "pc", 120, 330, "10.10.10.10/24", "10.10.10.1"),
      host("PC20", "pc", 680, 330, "10.20.20.20/24", "10.20.20.1"),
    ],
    links: [
      { a: ["R1", "Gi0/0"], b: ["SW1", "Gi1/0/24"] },
      { a: ["PC10", "eth0"], b: ["SW1", "Gi1/0/1"] },
      { a: ["PC20", "eth0"], b: ["SW1", "Gi1/0/2"] },
    ],
    notes: [{ id: "n-roas", kind: "text", x: 470, y: 170, w: 240, h: 40, text: "one trunk, two VLANs, one router port" }],
  };
}
const roasTweak = (fn: (t: Topology) => void): Topology => {
  const t = roasLab();
  fn(t);
  return t;
};
const roasReach: Scenario["goals"] = [{ type: "reachAll", pairs: [["PC10", "10.20.20.20"], ["PC20", "10.10.10.10"]], label: "PC10 and PC20 reach each other through R1" }];

scenarios.push(
  {
    id: "roas",
    title: "Router-on-a-stick example",
    exam: "encor",
    objective: "3.1.a",
    kind: "sandbox",
    brief: "One router port, one 802.1Q trunk, two VLANs. R1 routes between VLAN 10 and 20 with subinterfaces Gi0/0.10 and Gi0/0.20. Ping PC20 from PC10 and follow the packet walk: the frame leaves SW1 tagged 10 and comes back tagged 20. Try `show ip interface brief` and `show running-config` on R1.",
    topology: roasLab(),
    goals: [],
  },
  {
    id: "roas-encap",
    title: "VLAN 20 lost its gateway",
    exam: "encor",
    objective: "3.1.a",
    kind: "challenge",
    brief: "Ticket #11002: since R1's config was 'tidied up', users in VLAN 20 can't reach anything, not even their default gateway. VLAN 10 is fine.",
    hint: "The switch delivers VLAN 20 to R1 with an 802.1Q tag. Which subinterface accepts that tag? Look for the dropped frame in the packet walk.",
    debrief: "Gi0/0.20 had `encapsulation dot1Q 30`, so frames tagged 20 matched no subinterface and R1 dropped them. The subinterface number is just a label; the encapsulation VLAN is what must match the switch's VLAN.",
    topology: roasTweak((t) => (port(t, "R1", "Gi0/0.20").encap = { vlan: 30 })),
    goals: roasReach,
  },
  {
    id: "roas-trunk",
    title: "The router sees no one",
    exam: "encor",
    objective: "3.1.a",
    kind: "challenge",
    brief: "Ticket #11007: a new switch was installed under R1. R1's subinterfaces are configured and up, but neither VLAN can reach its gateway.",
    hint: "R1 sends and expects 802.1Q-tagged frames. What does SW1's port toward R1 do with a tagged frame?",
    debrief: "SW1 Gi1/0/24 was still an access port in VLAN 1 (the default). Tagged frames from R1 were dropped, and hosts' frames left untagged. The link to a router-on-a-stick must be a trunk carrying both VLANs.",
    topology: roasTweak((t) => Object.assign(port(t, "SW1", "Gi1/0/24"), { mode: "access", vlan: 1, allowed: undefined })),
    goals: roasReach,
  },
);

// --- HSRP --------------------------------------------------------------------------------

/** OSPF area 0 on every interface, with the LAN side passive. */
const ospfAll = (...passive: string[]): Ospf => ({ pid: 1, networks: [{ ip: "0.0.0.0", wildcard: "255.255.255.255", area: 0 }], passive });

export function hsrpLab(): Topology {
  const s1 = sw("SW1", 300, 260, 8);
  const g = (prio: number, track = false): Port["fhrp"] => [{ proto: "hsrp", group: 10, ip: "10.1.1.1", priority: prio === 100 ? undefined : prio, preempt: true, version: 2, ...(track ? { track: [{ iface: "Gi0/1", decrement: 20 }] } : {}) }];
  return {
    devices: [
      host("PC1", "pc", 120, 260, "10.1.1.10/24", "10.1.1.1"),
      s1,
      router("R1", 520, 150, [{ name: "Gi0/0", ip: "10.1.1.2/24", fhrp: g(110, true), hsrpVersion: 2 }, { name: "Gi0/1", ip: "10.0.1.1/30" }, ...down("Gi0/2")], { ospf: ospfAll("Gi0/0") }),
      router("R2", 520, 360, [{ name: "Gi0/0", ip: "10.1.1.3/24", fhrp: g(100), hsrpVersion: 2 }, { name: "Gi0/1", ip: "10.0.2.1/30" }, ...down("Gi0/2")], { ospf: ospfAll("Gi0/0") }),
      router("CORE", 760, 260, [{ name: "Gi0/0", ip: "10.0.1.2/30" }, { name: "Gi0/1", ip: "10.0.2.2/30" }, { name: "Gi0/2", ip: "172.16.0.1/24" }], { ospf: ospfAll("Gi0/2") }),
      host("SRV", "server", 960, 260, "172.16.0.10/24", "172.16.0.1"),
    ],
    links: [
      { a: ["PC1", "eth0"], b: ["SW1", "Gi1/0/1"] },
      { a: ["R1", "Gi0/0"], b: ["SW1", "Gi1/0/7"] },
      { a: ["R2", "Gi0/0"], b: ["SW1", "Gi1/0/8"] },
      { a: ["R1", "Gi0/1"], b: ["CORE", "Gi0/0"] },
      { a: ["R2", "Gi0/1"], b: ["CORE", "Gi0/1"] },
      { a: ["CORE", "Gi0/2"], b: ["SRV", "eth0"] },
    ],
    notes: [{ id: "n-vip", kind: "text", x: 60, y: 140, w: 220, h: 40, text: "gateway 10.1.1.1 = HSRP group 10" }],
  };
}
const hsrpTweak = (fn: (t: Topology) => void): Topology => {
  const t = hsrpLab();
  fn(t);
  return t;
};
const fh = (t: Topology, id: string) => port(t, id, "Gi0/0").fhrp![0];
const srvReach: Scenario["goals"][number] = { type: "reach", from: "PC1", to: "172.16.0.10", expect: true, label: "PC1 reaches SRV through the virtual gateway" };

scenarios.push(
  {
    id: "hsrp",
    title: "HSRP gateway pair example",
    exam: "encor",
    objective: "3.3.c",
    kind: "sandbox",
    brief: "R1 and R2 share the virtual gateway 10.1.1.1 (HSRPv2 group 10). R1 has priority 110 and drops by 20 if its uplink Gi0/1 fails, and both preempt. Try `show standby brief` on each router, then shut R1's Gi0/1 and watch R2 take over, while PC1 keeps the same gateway MAC. Add `vrrp 1 ip 10.1.1.254` on both to compare VRRP.",
    topology: hsrpLab(),
    goals: [],
  },
  {
    id: "hsrp-track",
    title: "The gateway stays on the router that lost its uplink",
    exam: "encor",
    objective: "3.3.c",
    kind: "challenge",
    brief: "Ticket #11013: R1's WAN circuit (Gi0/1) has been down since this morning. R2 and its uplink are healthy, yet users behind the 10.1.1.1 gateway can't reach the data centre.",
    hint: "HSRP only knows about the LAN side. How can R1 learn its uplink is down, and will R2 take the active role if it doesn't preempt?",
    debrief:
      "R1 stayed active (priority 110) with no way out. `standby 10 track Gi0/1 decrement 20` drops it to 90 when the uplink fails, but R2 also needs `standby 10 preempt` to take over from a live active router. Tracking and preemption work as a pair.",
    topology: hsrpTweak((t) => {
      delete fh(t, "R1").track;
      delete fh(t, "R2").preempt;
      port(t, "CORE", "Gi0/0").shutdown = true;
    }),
    goals: [srvReach, { type: "fhrpActive", device: "R2", group: 10, label: "R2 is the active router for group 10" }],
  },
  {
    id: "hsrp-vip",
    title: "Failover works, but to the wrong address",
    exam: "encor",
    objective: "3.3.c",
    kind: "challenge",
    brief: "Ticket #11021: R1 is down for a planned IOS upgrade (its LAN port is shut). R2 became active as designed, yet every PC lost its gateway.",
    hint: "Compare the virtual IP R2 serves with the default gateway on the PCs. `show standby brief` on R2.",
    debrief: "R2 was configured with `standby 10 ip 10.1.1.254`. While R1 was active, R2 learned the real VIP from R1's hellos, so nothing looked wrong. Alone, it served .254. Configure the same virtual IP on every member, or omit it on the backups so they learn it.",
    topology: hsrpTweak((t) => {
      fh(t, "R2").ip = "10.1.1.254";
      port(t, "R1", "Gi0/0").shutdown = true;
    }),
    goals: [srvReach, { type: "fhrpActive", device: "R2", group: 10, label: "R2 is the active router for group 10" }],
  },
);

// --- EIGRP -------------------------------------------------------------------------------

export function eigrpLab(): Topology {
  const e = (extra: Partial<NonNullable<Device["eigrp"]>> = {}): Device["eigrp"] => ({ asn: 100, networks: [{ ip: "10.0.0.0" }, { ip: "192.168.0.0", wildcard: "0.0.255.255" }], ...extra });
  return {
    devices: [
      host("PC1", "pc", 100, 270, "192.168.1.10/24", "192.168.1.1"),
      router("R1", 300, 270, [{ name: "Gi0/0", ip: "192.168.1.1/24" }, { name: "Gi0/1", ip: "10.0.12.1/30" }, { name: "Gi0/2", ip: "10.0.13.1/30" }, ...down("Gi0/3")], { eigrp: e() }),
      router("R2", 540, 140, [{ name: "Gi0/0", ip: "10.0.12.2/30" }, { name: "Gi0/1", ip: "10.0.23.1/30" }, ...down("Gi0/2", "Gi0/3")], { eigrp: e() }),
      router("R3", 780, 270, [{ name: "Gi0/0", ip: "10.0.23.2/30" }, { name: "Gi0/1", ip: "10.0.13.2/30" }, { name: "Gi0/2", ip: "192.168.3.1/24" }, ...down("Gi0/3")], { eigrp: e() }),
      host("SRV", "server", 980, 270, "192.168.3.10/24", "192.168.3.1"),
    ],
    links: [
      { a: ["PC1", "eth0"], b: ["R1", "Gi0/0"] },
      { a: ["R1", "Gi0/1"], b: ["R2", "Gi0/0"] },
      { a: ["R2", "Gi0/1"], b: ["R3", "Gi0/0"] },
      { a: ["R1", "Gi0/2"], b: ["R3", "Gi0/1"] },
      { a: ["R3", "Gi0/2"], b: ["SRV", "eth0"] },
    ],
    notes: [{ id: "n-as", kind: "text", x: 470, y: 330, w: 200, h: 40, text: "EIGRP AS 100" }],
  };
}
const eigrpTweak = (fn: (t: Topology) => void): Topology => {
  const t = eigrpLab();
  fn(t);
  return t;
};
const srv3: Scenario["goals"][number] = { type: "reach", from: "PC1", to: "192.168.3.10", expect: true, label: "PC1 reaches SRV" };

scenarios.push(
  {
    id: "eigrp",
    title: "EIGRP triangle example",
    exam: "encor",
    objective: "3.2.a",
    kind: "sandbox",
    brief: "Three routers in EIGRP AS 100. R1 reaches 192.168.3.0/24 directly over Gi0/2 and also via R2. Run `show ip eigrp topology` on R1: the direct path is the successor and the path via R2 is a feasible successor (its reported distance is lower than the feasible distance). Raise `delay` on R1 Gi0/2 and watch the successor change. Compare with OSPF: same idea, different maths.",
    topology: eigrpLab(),
    goals: [],
  },
  {
    id: "eigrp-as",
    title: "R3 won't talk to anyone",
    exam: "encor",
    objective: "3.2.a",
    kind: "challenge",
    brief: "Ticket #11030: R3 was rebuilt from a template. Its interfaces are up and EIGRP is configured, but it has no neighbours and the server LAN has vanished from R1's routing table.",
    hint: "`show ip eigrp neighbors` is empty on R3. What has to match between EIGRP neighbours that OSPF doesn't care about?",
    debrief: "R3's template used `router eigrp 101`. EIGRP neighbours must be in the same autonomous system, and a mismatch is silent: no error, no neighbour.",
    topology: eigrpTweak((t) => (dev(t, "R3").eigrp!.asn = 101)),
    goals: [{ type: "eigrpNbr", device: "R1", neighbor: "R3", label: "R1 and R3 are EIGRP neighbours" }, srv3],
  },
  {
    id: "eigrp-passive",
    title: "R2 learns routes but forms no neighbours",
    exam: "encor",
    objective: "3.2.a",
    kind: "challenge",
    brief: "Ticket #11034: after a security hardening change, R2 has no EIGRP neighbours. Traffic still flows over the R1–R3 link, but the redundant path through R2 is gone.",
    hint: "Hardening often adds `passive-interface default`. What does a passive interface do in EIGRP?",
    debrief: "`passive-interface default` stops hellos on every interface, so R2 formed no neighbours. Its links stay advertised, but nothing is learned. Keep the default and add `no passive-interface` on the transit links.",
    topology: eigrpTweak((t) => (dev(t, "R2").eigrp!.passiveDefault = true)),
    goals: [
      { type: "eigrpNbr", device: "R2", neighbor: "R1", label: "R2 and R1 are EIGRP neighbours" },
      { type: "eigrpNbr", device: "R2", neighbor: "R3", label: "R2 and R3 are EIGRP neighbours" },
    ],
  },
  {
    id: "eigrp-metric",
    title: "Keep traffic off the metered link",
    exam: "encor",
    objective: "3.2.a",
    kind: "challenge",
    brief: "Change #11040: the direct R1–R3 link is a metered circuit. Traffic from PC1 to the server LAN should go via R2, and the direct link should stay as an instant backup.",
    hint: "EIGRP's metric uses the lowest bandwidth and the total delay on the path. Which interface setting changes the metric without affecting real throughput?",
    debrief: "Raising `delay` on R1 Gi0/2 (for example `delay 100`) makes the direct path's metric worse, so the path via R2 becomes the successor. If the direct path's reported distance stays below the new feasible distance, it remains a feasible successor ready for instant failover. Bandwidth would also work but affects other features.",
    topology: eigrpLab(),
    goals: [{ type: "route", device: "R1", prefix: "192.168.3.0/24", code: "D", via: "10.0.12.2", expect: true, label: "R1 routes to 192.168.3.0/24 via R2 (10.0.12.2)" }, srv3],
  },
);

export const scenarioById = Object.fromEntries(scenarios.map((s) => [s.id, s]));
