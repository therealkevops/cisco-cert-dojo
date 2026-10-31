import type { Device, Ospf, Port, Scenario, Topology } from "@/lib/net/types";

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

export const scenarioById = Object.fromEntries(scenarios.map((s) => [s.id, s]));
