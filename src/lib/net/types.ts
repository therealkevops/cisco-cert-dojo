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
};

export type Svi = { vlan: number; ip: string; shutdown?: boolean; aclIn?: string; aclOut?: string };

export type StaticRoute = { prefix: string; via: string };

export type Ace = {
  action: "permit" | "deny";
  proto: "ip" | "icmp";
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
  acls?: Record<string, Ace[]>;
};

export type Link = { a: [string, string]; b: [string, string] };

export type Topology = { devices: Device[]; links: Link[] };

export type Goal =
  | { type: "reach"; from: string; to: string; expect: boolean; label: string }
  | { type: "stpRoot"; vlan: number; device: string; label: string };

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
