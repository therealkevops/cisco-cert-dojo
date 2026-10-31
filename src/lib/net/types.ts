// Data model for the Wire Room simulator. A Topology is plain JSON so it can
// live in scenario files, be edited by the quick-config panel, and later be
// driven by a real CLI parser.

export type DeviceKind = "pc" | "server" | "switch" | "l3switch" | "router";

export type Port = {
  name: string;
  shutdown?: boolean;
  /** Switch ports default to access VLAN 1. Router / host NICs are always routed. */
  mode?: "access" | "trunk" | "routed";
  vlan?: number;
  /** Trunk allowed list. Undefined = all VLANs. */
  allowed?: number[];
  native?: number;
  /** "10.0.0.1/24" */
  ip?: string;
  aclIn?: string;
  aclOut?: string;
  description?: string;
  /** Interface MTU used by OSPF's database exchange check. Default 1500. */
  mtu?: number;
  ospf?: IfOspf;
};

/** Per-interface OSPF settings (`ip ospf ...`). */
export type IfOspf = {
  /** `ip ospf <pid> area <n>` enables OSPF on the interface directly. */
  area?: number;
  cost?: number;
  hello?: number;
  dead?: number;
  priority?: number;
  network?: "point-to-point" | "broadcast";
};

/** Router-level OSPF process (`router ospf <pid>`). One process per device. */
export type Ospf = {
  pid: number;
  routerId?: string;
  networks: { ip: string; wildcard: string; area: number }[];
  passiveDefault?: boolean;
  passive?: string[];
  noPassive?: string[];
  ranges?: { area: number; prefix: string }[];
  /** Mb/s. Default 100, so every gigabit link costs 1. */
  refBw?: number;
  defaultOriginate?: "yes" | "always";
};

export type Svi = { vlan: number; ip: string; shutdown?: boolean; aclIn?: string; aclOut?: string; mtu?: number; ospf?: IfOspf };

export type StaticRoute = { prefix: string; via: string };

export type Ace = {
  seq?: number;
  action: "permit" | "deny";
  /** Only ICMP traffic is simulated, so tcp/udp entries never match a ping. */
  proto: "ip" | "icmp" | "tcp" | "udp";
  /** "any", "host 1.2.3.4" or "10.0.0.0/8" */
  src: string;
  dst: string;
};

export type Device = {
  id: string;
  kind: DeviceKind;
  x: number;
  y: number;
  ports: Port[];
  svis?: Svi[];
  routes?: StaticRoute[];
  /** Hosts only. */
  gateway?: string;
  /** Switches only. Default 32768. */
  stpPriority?: number;
  /** Per-VLAN override, from `spanning-tree vlan N priority P`. */
  stpVlanPriority?: Record<string, number>;
  /** Powered off: every link on it is down. */
  off?: boolean;
  /** Locked devices can't be dragged on the canvas. */
  locked?: boolean;
  acls?: Record<string, Ace[]>;
  ospf?: Ospf;
};

export type Link = { a: [string, string]; b: [string, string] };

/** Canvas annotations: free text or a labelled rectangle. */
export type Note = { id: string; kind: "text" | "rect"; x: number; y: number; w: number; h: number; text: string };

export type Topology = { devices: Device[]; links: Link[]; notes?: Note[] };

export type Goal =
  | { type: "reach"; from: string; to: string; expect: boolean; label: string }
  | { type: "stpRoot"; vlan: number; device: string; label: string }
  /** An OSPF adjacency between two devices is FULL. */
  | { type: "ospfFull"; device: string; neighbor: string; label: string }
  /** The device's interface holds this OSPF role on its segment. */
  | { type: "ospfRole"; device: string; iface: string; role: "DR" | "BDR" | "DROTHER"; label: string }
  /** A route for exactly this prefix is (or is not) in the device's table, optionally with this code. */
  | { type: "route"; device: string; prefix: string; code?: string; expect: boolean; label: string };

export type Scenario = {
  id: string;
  title: string;
  exam: string;
  objective: string;
  kind: "sandbox" | "challenge";
  brief: string;
  /** Shown after the challenge is solved. */
  debrief?: string;
  hint?: string;
  topology: Topology;
  goals: Goal[];
};
