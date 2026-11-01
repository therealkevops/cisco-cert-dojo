// Fabric Lab: a small RoCEv2 back-end fabric (GPU NICs → leaves → spines) simulated as fluid queues.
// Units: time in microseconds (one tick = 1 µs), data in KB, rates in KB/µs (400 Gb/s = 50 KB/µs).

export type SwitchCfg = {
  /** PFC on the no-drop class (send and honour pause frames). */
  pfc: boolean;
  /** DSCP values classified into the no-drop RoCE class (qos-group 3). Everything else is lossy class-default. */
  noDropDscp: number[];
  /** MTU of the no-drop class / interfaces, in bytes. */
  mtu: number;
  /** WRED-ECN marking on the RoCE queue. */
  ecn: boolean;
  /** ECN min / max thresholds in KB. */
  kmin: number;
  kmax: number;
  /** PFC pause (xOFF) threshold in KB; resume is 80% of it. */
  xoff: number;
  /** ECMP hash inputs on uplinks. */
  hash: "l3" | "l3l4";
  /** Flowlet-based dynamic load balancing on uplinks. */
  dlb: boolean;
  /** PFC watchdog: shut a no-drop queue that stays paused too long. */
  watchdog: boolean;
};

export type HostCfg = {
  /** DSCP the NIC marks RoCE traffic with. */
  dscp: number;
  /** NIC honours PFC pause frames for the RoCE priority. */
  pfc: boolean;
  /** DCQCN: react to ECN (CNPs) by lowering the sending rate. */
  dcqcn: boolean;
  /** RoCE path MTU in bytes (1024 / 2048 / 4096). */
  mtu: 1024 | 2048 | 4096;
  /** Queue pairs per connection; each QP uses its own UDP source port. */
  qps: number;
  /** Port admin-up. */
  up: boolean;
};

export type LinkState = { down?: boolean; /** fraction of bytes corrupted (bad optic) */ crc?: number };

export type FabricJob = { id: string; name: string; flows: [src: string, dst: string, mb: number][] };

export type Fabric = {
  leaves: number;
  spines: number;
  hostsPerLeaf: number;
  /** Host link and uplink speed in Gb/s. */
  hostGbps: number;
  uplinkGbps: number;
  /** Egress buffer per queue, KB. */
  buffer: number;
  switches: Record<string, SwitchCfg>;
  hosts: Record<string, HostCfg>;
  /** Keyed "A-B" with A < B alphabetically (undirected). */
  links: Record<string, LinkState>;
  /** Hosts whose NIC is stuck: it stops receiving and sends PFC pause frames non-stop. */
  stuck: string[];
  jobs: FabricJob[];
};

export type FabricGoal =
  | { type: "jct"; job: string; maxUs: number; label: string }
  | { type: "noDrops"; job: string; label: string }
  | { type: "pauseBudget"; maxPct: number; label: string };

export type FabricScenario = {
  id: string;
  title: string;
  exam: "dcai";
  objective: string;
  kind: "sandbox" | "challenge";
  brief: string;
  hint?: string;
  debrief?: string;
  fabric: Fabric;
  goals: FabricGoal[];
};
