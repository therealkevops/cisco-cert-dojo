import { hostsOf, leafOf, switchesOf } from "@/lib/fabric/sim";
import type { Fabric, FabricJob, FabricScenario, HostCfg, SwitchCfg } from "@/lib/fabric/types";

// Fabric Lab scenarios. The base is a healthy rail-style pod: 4 leaves × 4 GPU NICs at 400G, 2 spines with
// 800G uplinks (non-blocking), RoCE marked DSCP 26 into a no-drop class with PFC, ECN and DCQCN.

export const goodSwitch = (): SwitchCfg => ({
  pfc: true,
  noDropDscp: [24, 26],
  mtu: 9216,
  ecn: true,
  kmin: 100,
  kmax: 400,
  xoff: 600,
  hash: "l3l4",
  dlb: false,
  watchdog: true,
});
export const goodHost = (): HostCfg => ({ dscp: 26, pfc: true, dcqcn: true, mtu: 4096, qps: 4, up: true });

export function baseFabric(jobs: FabricJob[]): Fabric {
  const f: Fabric = { leaves: 4, spines: 2, hostsPerLeaf: 4, hostGbps: 400, uplinkGbps: 800, buffer: 1200, switches: {}, hosts: {}, links: {}, stuck: [], jobs };
  for (const s of switchesOf(f)) f.switches[s] = goodSwitch();
  for (const h of hostsOf(f)) f.hosts[h] = goodHost();
  return f;
}

export function tweak(f: Fabric, fn: (f: Fabric) => void): Fabric {
  fn(f);
  return f;
}
export const allSwitches = (f: Fabric, fn: (s: SwitchCfg) => void) => Object.values(f.switches).forEach(fn);
export const allHosts = (f: Fabric, fn: (h: HostCfg) => void) => Object.values(f.hosts).forEach(fn);

// Traffic patterns
export const incast = (id: string, name: string, dst: string, srcs: string[], mb: number): FabricJob => ({ id, name, flows: srcs.map((s) => [s, dst, mb]) });
export const pairs = (id: string, name: string, list: [string, string][], mb: number): FabricJob => ({ id, name, flows: list.map(([a, b]) => [a, b, mb]) });
/** Ring all-reduce: each member sends to the next one. */
export const ring = (id: string, name: string, members: string[], mb: number): FabricJob => ({ id, name, flows: members.map((m, i) => [m, members[(i + 1) % members.length], mb]) });

export { leafOf };

const incastJobs = (): FabricJob[] => [
  incast("inc", "Incast 7→1 (gradient sync)", "H16", ["H1", "H2", "H5", "H6", "H9", "H10", "H13"], 4),
  pairs("vic", "Neighbour job (H3→H7, H4→H8)", [["H3", "H7"], ["H4", "H8"]], 8),
];
/** A 16-GPU ring where every hop crosses leaves, so all uplinks carry traffic. */
export const ringMembers = ["H1", "H5", "H9", "H13", "H2", "H6", "H10", "H14", "H3", "H7", "H11", "H15", "H4", "H8", "H12", "H16"];
const ringJobs = (): FabricJob[] => [ring("ar", "All-reduce ring (16 GPUs)", ringMembers, 8)];
const stormJobs = (): FabricJob[] => [
  pairs("dead", "Job on the failed node", [["H1", "H12"]], 2),
  pairs("a", "Job A", [["H2", "H5"], ["H3", "H6"], ["H4", "H9"]], 8),
  pairs("b", "Job B", [["H13", "H8"], ["H14", "H7"]], 8),
];

/** Selectable traffic for the sandbox. */
export const trafficPresets: { id: string; name: string; jobs: () => FabricJob[] }[] = [
  { id: "incast", name: "Incast 7→1 plus a neighbour job", jobs: incastJobs },
  { id: "ring", name: "All-reduce ring across 16 GPUs", jobs: ringJobs },
  { id: "pairs", name: "Cross-leaf pairs", jobs: () => [pairs("p", "Rail pairs", [["H1", "H5"], ["H2", "H6"], ["H3", "H7"], ["H4", "H8"], ["H9", "H13"], ["H10", "H14"]], 8)] },
];

const victimFast = { type: "jct" as const, job: "vic", maxUs: 350, label: "Neighbour job finishes within 350 µs" };
const pauseOk = { type: "pauseBudget" as const, maxPct: 35, label: "No link spends more than 35% of the run paused" };

export const fabricScenarios: FabricScenario[] = [
  {
    id: "fabric",
    title: "Lossless pod sandbox",
    exam: "dcai",
    objective: "3.1.a",
    kind: "sandbox",
    brief:
      "A healthy 16-GPU pod: four leaves, two spines, RoCEv2 in a no-drop class with PFC, ECN and DCQCN. Run the incast and watch ECN slow the senders. Then switch ECN off, or set PFC off, and compare the pause map, drops and completion times.",
    fabric: baseFabric(incastJobs()),
    goals: [],
  },
  {
    id: "fab-dscp",
    title: "RoCE is landing in the lossy class",
    exam: "dcai",
    objective: "3.1.c",
    kind: "challenge",
    brief: "Ticket: since the NIC firmware upgrade, gradient sync never finishes and the fabric shows heavy drops but almost no PFC pauses. The switch team swears nothing changed.",
    hint: "Compare what the NICs mark with what the switches classify into the no-drop class. Where are the drops counted?",
    debrief:
      "The new NIC firmware marks RoCE with DSCP 26, but the switches only classified DSCP 24 into the no-drop class. RoCE fell into lossy class-default, so there was no PFC protection, buffers overflowed, and go-back-N retransmissions made it worse. Classify 24 and 26 (or mark 24 on the NICs). The lossless chain only holds if marking and classification match on every hop.",
    fabric: tweak(baseFabric(incastJobs()), (f) => allSwitches(f, (s) => (s.noDropDscp = [24]))),
    goals: [
      { type: "noDrops", job: "inc", label: "Gradient sync has no drops" },
      { type: "jct", job: "inc", maxUs: 700, label: "Gradient sync finishes within 700 µs" },
      { type: "noDrops", job: "vic", label: "Neighbour job has no drops" },
    ],
  },
  {
    id: "fab-ecn",
    title: "PFC is doing all the work",
    exam: "dcai",
    objective: "3.1.a",
    kind: "challenge",
    brief: "Ticket: a small job sharing the pod with a big incast runs 2–3× slower than it should, and PFC pause counters are climbing everywhere. Nothing is dropped.",
    hint: "PFC stops loss, but pauses whole queues upstream. What should slow the incast senders before buffers reach the pause threshold?",
    debrief:
      "ECN was disabled on the switches, so DCQCN never got a signal and the senders kept blasting at line rate. Only PFC held the loss off, and its pauses spread upstream into queues the neighbour job shared (head-of-line blocking). With WRED-ECN marking below the PFC threshold, CNPs slow the incast senders early and pauses become rare.",
    fabric: tweak(baseFabric(incastJobs()), (f) => allSwitches(f, (s) => (s.ecn = false))),
    goals: [victimFast, pauseOk],
  },
  {
    id: "fab-ecn-thresholds",
    title: "ECN is on, but nothing changes",
    exam: "dcai",
    objective: "3.1.c",
    kind: "challenge",
    brief: "Ticket: after last month's 'tuning' of the queuing policy, the pod behaves exactly as if ECN were off. ECN is enabled everywhere.",
    hint: "Compare the WRED-ECN thresholds with the PFC pause threshold. Which one does a filling queue reach first?",
    debrief:
      "The ECN minimum threshold (800 KB) was above the PFC xOFF threshold (600 KB). Queues hit the pause threshold before they ever marked a packet, so PFC fired first every time. ECN thresholds must sit below xOFF so the gentle end-to-end signal comes before the hop-by-hop brake.",
    fabric: tweak(baseFabric(incastJobs()), (f) =>
      allSwitches(f, (s) => {
        s.kmin = 800;
        s.kmax = 1100;
      }),
    ),
    goals: [victimFast, pauseOk],
  },
  {
    id: "fab-dcqcn",
    title: "Packets are marked, senders don't care",
    exam: "dcai",
    objective: "4.4",
    kind: "challenge",
    brief: "Ticket: the switches report plenty of ECN-marked packets, yet PFC pauses keep spreading and the neighbour job is slow. The network team says 'ECN is working, look at the counters'.",
    hint: "ECN marks are only half of the loop. Who turns a mark into a slower sender, and is it switched on?",
    debrief:
      "DCQCN was disabled on the NICs. Switches marked packets, but receivers sent no CNPs and senders never cut their rate, so the marks did nothing. Congestion control is end to end: switch marking, receiver CNP, sender rate reduction. Check the hosts as well as the fabric.",
    fabric: tweak(baseFabric(incastJobs()), (f) => allHosts(f, (h) => (h.dcqcn = false))),
    goals: [victimFast, pauseOk],
  },
  {
    id: "fab-mtu",
    title: "One leaf eats every RoCE frame",
    exam: "dcai",
    objective: "3.1.b",
    kind: "challenge",
    brief: "Ticket: LEAF4 was replaced last night. Jobs that send to GPUs on LEAF4 stall completely. Jobs elsewhere are fine.",
    hint: "RoCE frames carry a 4096-byte payload plus headers. What does LEAF4 allow?",
    debrief:
      "The replacement LEAF4 came up with a 1500-byte MTU, so every 4 KB RoCE frame was discarded and resent forever. Jumbo MTU (9216) must be set on every hop of the RoCE path, and on replacement hardware before it goes into service.",
    fabric: tweak(baseFabric(incastJobs()), (f) => (f.switches.L4.mtu = 1500)),
    goals: [
      { type: "noDrops", job: "inc", label: "Gradient sync has no drops" },
      { type: "jct", job: "inc", maxUs: 700, label: "Gradient sync finishes within 700 µs" },
    ],
  },
  {
    id: "fab-hash",
    title: "Half the uplinks are idle",
    exam: "dcai",
    objective: "3.1.d",
    kind: "challenge",
    brief: "Ticket: a 16-GPU all-reduce ring takes almost three times its theoretical time. The fabric is non-blocking, nothing is dropped, and every link is up, but some uplinks run at 100% while others idle.",
    hint: "Each ring hop is one large flow. How many paths can ECMP spread one flow over, and what gives the hash more to work with?",
    debrief:
      "With 3-tuple (L3-only) hashing and one QP per connection, each ring hop is a single elephant flow, and several landed on the same spine uplinks. Add entropy (hash on L4 ports and use several QPs per connection), or use flowlet dynamic load balancing, which places traffic by real link load and gets close to the ideal time.",
    fabric: tweak(baseFabric(ringJobs()), (f) => {
      allSwitches(f, (s) => (s.hash = "l3"));
      allHosts(f, (h) => (h.qps = 1));
    }),
    goals: [{ type: "jct", job: "ar", maxUs: 320, label: "The all-reduce ring finishes within 320 µs" }],
  },
  {
    id: "fab-storm",
    title: "One dead NIC freezes the pod",
    exam: "dcai",
    objective: "4.4",
    kind: "challenge",
    brief: "Ticket: GPU H12's NIC hung during a job. Since then, Job A, which never talks to H12, has frozen too, and PFC pause counters sit at 100% on links far from H12. Job B is still running, for now.",
    hint: "A stuck receiver sends pause frames forever, and PFC passes them upstream. Which feature stops a queue that has been paused for too long? (Isolating the node also works.)",
    debrief:
      "H12's NIC kept the RoCE priority paused, the leaf's queue toward it filled and paused its own senders, and the pause spread through the spines into queues Job A shared. The PFC watchdog shuts a no-drop queue that stays paused too long, discarding its traffic so the rest of the fabric can move. Shutting the port to H12 also stops the storm. Either way, the failed node's own job can't finish until the NIC is fixed.",
    fabric: tweak(baseFabric(stormJobs()), (f) => {
      f.stuck = ["H12"];
      allSwitches(f, (s) => (s.watchdog = false));
    }),
    goals: [
      { type: "jct", job: "a", maxUs: 600, label: "Job A finishes within 600 µs" },
      { type: "jct", job: "b", maxUs: 600, label: "Job B finishes within 600 µs" },
    ],
  },
  {
    id: "fab-optic",
    title: "The ring is slow and nothing is congested",
    exam: "dcai",
    objective: "4.3",
    kind: "challenge",
    brief: "Ticket: the all-reduce ring runs more than twice as slow as yesterday. There is no congestion: no pauses, no ECN marks, no tail drops. Dynamic load balancing is on.",
    hint: "Look at the per-link counters for errors rather than congestion. What happens to RoCE when frames arrive corrupted?",
    debrief:
      "The optic on H6's link was corrupting about 2% of frames (CRC errors). RoCE's go-back-N recovery resends a whole window for each loss, so every hop of the ring that touched H6 crawled, and a ring is only as fast as its slowest hop. Trend CRC/FEC errors and DOM light levels, and replace degrading optics before jobs feel them.",
    fabric: tweak(baseFabric(ringJobs()), (f) => {
      allSwitches(f, (s) => (s.dlb = true));
      f.links["H6-L2"] = { crc: 0.02 };
    }),
    goals: [{ type: "jct", job: "ar", maxUs: 250, label: "The all-reduce ring finishes within 250 µs" }],
  },
];

export const fabricById = Object.fromEntries(fabricScenarios.map((s) => [s.id, s]));
