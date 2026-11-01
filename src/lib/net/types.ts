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
  /** `channel-group N mode X` on a physical switch port. */
  channel?: { group: number; mode: ChannelMode };
  /** `ip nat inside|outside`. */
  nat?: "inside" | "outside";
  /** `ip helper-address` targets (DHCP relay). */
  helpers?: string[];
  /** Router subinterfaces ("Gi0/0.10") only: `encapsulation dot1Q <vlan> [native]`. */
  encap?: { vlan: number; native?: boolean };
  /** `bandwidth <kbps>` (EIGRP metric). */
  bandwidth?: number;
  /** `delay <tens of microseconds>` (EIGRP metric). */
  delay?: number;
  /** HSRP / VRRP groups on this routed interface. */
  fhrp?: FhrpGroup[];
  /** `standby version 2` (applies to every HSRP group on the interface). */
  hsrpVersion?: 2;
};

export type FhrpGroup = {
  proto: "hsrp" | "vrrp";
  group: number;
  /** Virtual IP. HSRP routers may learn it from the active router instead. */
  ip?: string;
  /** Default 100. */
  priority?: number;
  /** HSRP default off, VRRP default on. */
  preempt?: boolean;
  /** HSRP only: 1 (default) or 2. */
  version?: 1 | 2;
  /** Lower the priority while a tracked interface (or `track` object) is down. */
  track?: { iface?: string; object?: number; decrement: number }[];
};

/** `ip nat inside source ...` rules, in configuration order. */
export type NatRule =
  | { kind: "static"; local: string; global: string }
  | { kind: "dynamic"; acl: string; pool?: string; iface?: string; overload: boolean };

export type NatPool = { name: string; start: string; end: string; len: number };

export type DhcpPool = {
  name: string;
  /** "10.10.0.0/24" */
  network?: string;
  gateway?: string;
  dns?: string;
  domain?: string;
};

export type BgpNeighbor = {
  ip: string;
  remoteAs: number;
  shutdown?: boolean;
  /** Interface whose address sources the session (`update-source`). */
  updateSource?: string;
  /** `ebgp-multihop` TTL. Undefined = 1 for eBGP. */
  multihop?: number;
  nextHopSelf?: boolean;
  weight?: number;
  routeMapIn?: string;
  routeMapOut?: string;
};

export type Bgp = {
  asn: number;
  routerId?: string;
  neighbors: BgpNeighbor[];
  /** `network A mask M`: originated only when this exact prefix is in the routing table. */
  networks: string[];
  redistribute?: ("connected" | "static" | "ospf")[];
};

/** `router eigrp <asn>` (classic) or named mode (`router eigrp NAME` + address-family). One process per device. */
export type Eigrp = {
  asn: number;
  /** Named mode virtual-instance name; undefined = classic mode. */
  name?: string;
  routerId?: string;
  /** `network A [wildcard]`; no wildcard = the classful network. */
  networks: { ip: string; wildcard?: string }[];
  passiveDefault?: boolean;
  passive?: string[];
  noPassive?: string[];
  variance?: number;
  redistribute?: ("static" | "connected")[];
};

export type RouteMapEntry = {
  seq: number;
  action: "permit" | "deny";
  matchPrefixList?: string;
  matchAcl?: string;
  setLocalPref?: number;
  setWeight?: number;
  setMed?: number;
  setPrepend?: number[];
};

export type PrefixListEntry = { seq: number; action: "permit" | "deny"; prefix: string; ge?: number; le?: number };

export type ChannelMode = "active" | "passive" | "desirable" | "auto" | "on";

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

export type Svi = {
  vlan: number;
  ip: string;
  shutdown?: boolean;
  aclIn?: string;
  aclOut?: string;
  mtu?: number;
  ospf?: IfOspf;
  nat?: "inside" | "outside";
  helpers?: string[];
  bandwidth?: number;
  delay?: number;
  fhrp?: FhrpGroup[];
  hsrpVersion?: 2;
};

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
  /** Logical Port-channel interfaces ("Po1"), configured like switchports. */
  portChannels?: Port[];
  nat?: { rules: NatRule[]; pools: NatPool[] };
  /** IOS DHCP server. */
  dhcp?: { pools: DhcpPool[]; excluded: { start: string; end: string }[] };
  /** Hosts only: the NIC is set to obtain its address by DHCP. */
  dhcpClient?: boolean;
  bgp?: Bgp;
  eigrp?: Eigrp;
  /** `track N interface X line-protocol` objects. */
  tracks?: Record<string, { iface: string }>;
  routeMaps?: Record<string, RouteMapEntry[]>;
  prefixLists?: Record<string, PrefixListEntry[]>;
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
  /** The device's Port-channel is bundled (SU). */
  | { type: "bundle"; device: string; po: string; label: string }
  /** Every pair pings successfully in sequence on one network (shared NAT/ARP state). */
  | { type: "reachAll"; pairs: [string, string][]; label: string }
  /** The ping succeeds and `device` holds a NAT translation for the source host. */
  | { type: "natVia"; from: string; to: string; device: string; label: string }
  /** The host gets a DHCP lease (optionally inside `within`), then optionally pings `to`. */
  | { type: "dhcp"; host: string; within?: string; to?: string; label: string }
  /** The BGP session from `device` to neighbor address `neighbor` is Established. */
  | { type: "bgpUp"; device: string; neighbor: string; label: string }
  /** The device's best BGP path for `prefix` uses next hop `nextHop`. */
  | { type: "bgpBest"; device: string; prefix: string; nextHop: string; label: string }
  /** The device is the active (HSRP) or master (VRRP) router for this group. */
  | { type: "fhrpActive"; device: string; group: number; label: string }
  /** The two routers are EIGRP neighbours. */
  | { type: "eigrpNbr"; device: string; neighbor: string; label: string }
  /** A route for exactly this prefix is (or is not) in the device's table, optionally with this code. */
  | { type: "route"; device: string; prefix: string; code?: string; via?: string; expect: boolean; label: string };

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
