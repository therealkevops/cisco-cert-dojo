import type { VpcIntf, VpcLab, VpcScenario, VpcSwitch } from "@/lib/vpc";

// vPC Lab scenarios (DCCOR 1.2). Each starts from a working pair, N9K-A (primary) and N9K-B, and
// breaks it; the validator replays `solution` through the CLI and checks every goal passes, and that
// the shipped lab fails at least one.

const eth = (n: string, extra: Partial<VpcIntf> = {}): VpcIntf => ({ name: `Ethernet${n}`, mode: "trunk", accessVlan: 1, allowed: null, native: 1, mtu: 1500, ...extra });
const po = (n: number, extra: Partial<VpcIntf> = {}): VpcIntf => ({ name: `port-channel${n}`, mode: "trunk", accessVlan: 1, allowed: null, native: 1, mtu: 1500, ...extra });

function peer(id: string, mgmt: string, peerMgmt: string, mac: string, prio: number): VpcSwitch {
  return {
    id,
    mgmtIp: mgmt,
    mac,
    features: { vpc: true, lacp: true, hsrp: true },
    domain: { id: 10, keepalive: { dst: peerMgmt, src: mgmt, vrf: "management" }, rolePriority: prio, peerGateway: false, autoRecovery: false, graceful: true },
    stpMode: "rapid-pvst",
    vlans: [1, 100, 110, 120],
    intfs: [
      eth("1/49", { channel: { id: 1, mode: "active" }, mtu: 9216 }),
      eth("1/50", { channel: { id: 1, mode: "active" }, mtu: 9216 }),
      po(1, { vpc: "peer-link", mtu: 9216 }),
      eth("1/10", { channel: { id: 10, mode: "active" }, allowed: [100, 110], mtu: 9216 }),
      po(10, { vpc: 10, allowed: [100, 110], mtu: 9216 }),
      eth("1/20", { channel: { id: 20, mode: "active" }, allowed: [120] }),
      po(20, { vpc: 20, allowed: [120] }),
    ],
  };
}

export function basePair(): VpcLab {
  return {
    switches: [peer("N9K-A", "10.0.0.11", "10.0.0.12", "00de.fb11.1111", 100), peer("N9K-B", "10.0.0.12", "10.0.0.11", "00de.fb22.2222", 200)],
    peerLinks: [
      ["Ethernet1/49", "Ethernet1/49"],
      ["Ethernet1/50", "Ethernet1/50"],
    ],
    devices: [
      { id: "esx01", label: "ESX01", kind: "server", lacp: "active", vlans: [100, 110], links: [["N9K-A", "Ethernet1/10"], ["N9K-B", "Ethernet1/10"]] },
      { id: "acc1", label: "ACCESS-1", kind: "switch", lacp: "active", vlans: [120], links: [["N9K-A", "Ethernet1/20"], ["N9K-B", "Ethernet1/20"]] },
    ],
  };
}

const tweak = (fn: (l: VpcLab, a: VpcSwitch, b: VpcSwitch) => void) => {
  const l = basePair();
  fn(l, l.switches[0], l.switches[1]);
  return l;
};
const intf = (s: VpcSwitch, n: string) => s.intfs.find((i) => i.name === n)!;

const both = [
  { type: "legs" as const, dev: "esx01", vlan: 100, label: "ESX01 forwards VLAN 100 on both links" },
  { type: "legs" as const, dev: "acc1", vlan: 120, label: "ACCESS-1 forwards VLAN 120 on both links" },
];

export const vpcScenarios: VpcScenario[] = [
  {
    id: "vpc-keepalive",
    title: "The peer-link is up, the vPCs aren't",
    exam: "dccor",
    objective: "1.2",
    brief: "N9K-B was replaced after a supervisor failure and its config was restored from an old template. The peer-link comes up, but every vPC stays down on both switches.",
    symptoms: ["show vpc: Peer status: peer adjacency not formed yet", "vPC keep-alive status: peer is not reachable through peer-keepalive", "Both mgmt0 ports are up and in the same subnet"],
    hint: "Compare `show vpc peer-keepalive` on both peers, especially the VRF. mgmt0 lives in VRF management.",
    debrief:
      "The keepalive is a heartbeat over a separate path (normally mgmt0, in VRF management) that lets each peer tell a dead peer from a dead peer-link. If it has never come up, the pair won't form adjacency and won't bring vPCs up, even with a healthy peer-link. Here N9K-B sent its keepalives in VRF default, where 10.0.0.11 isn't reachable.",
    lab: tweak((_, __, b) => {
      b.domain!.keepalive = { dst: "10.0.0.11", src: "10.0.0.12", vrf: "default" };
    }),
    goals: [{ type: "adjacency", label: "Peer adjacency formed" }, ...both],
    solution: [{ sw: "N9K-B", lines: ["configure terminal", "vpc domain 10", "peer-keepalive destination 10.0.0.11 source 10.0.0.12 vrf management"] }],
  },
  {
    id: "vpc-stp",
    title: "Half of every vPC is suspended",
    exam: "dccor",
    objective: "1.2",
    brief: "After a weekend of “STP tuning” on N9K-B, every dual-homed device runs on one link. N9K-A still forwards; N9K-B's vPC members are all suspended.",
    symptoms: ["show vpc on N9K-B: Configuration consistency status: failed", "Peer adjacency is formed and the keepalive is alive", "Only the secondary's vPC ports are down"],
    hint: "Global type-1 parameters must match on both peers. `show vpc consistency-parameters global`.",
    debrief:
      "STP mode is a global **type-1** parameter: a mismatch would make the two halves of each vPC run different spanning trees. With the graceful consistency check (the default), only the secondary suspends its vPC member ports and the primary keeps forwarding, so the outage is “only” half the bandwidth and no redundancy. Without it, both peers would suspend and every vPC would go down.",
    lab: tweak((_, __, b) => {
      b.stpMode = "mst";
    }),
    goals: [...both, { type: "vpcUp", vpc: 10, sw: "N9K-B", label: "vPC 10 is up on N9K-B" }],
    solution: [{ sw: "N9K-B", lines: ["configure terminal", "spanning-tree mode rapid-pvst"] }],
  },
  {
    id: "vpc-lacp",
    title: "ACCESS-1 bundles only one uplink",
    exam: "dccor",
    objective: "1.2",
    brief: "The access switch ACCESS-1 runs LACP on its two uplinks. Since N9K-B's port was re-patched and reconfigured, ACCESS-1 has only the link to N9K-A in its port-channel.",
    symptoms: ["show port-channel summary on N9K-B: Po20 protocol NONE", "vPC 20 consistency: failed on both peers", "ESX01 on vPC 10 is unaffected"],
    hint: "Look at the channel-group on N9K-B Ethernet1/20 and compare `show vpc consistency-parameters vpc 20`. NX-OS won't change a member's channel mode in place.",
    debrief:
      "`channel-group 20` without a mode is static (mode **on**), which never sends LACP PDUs, so ACCESS-1 suspends that link. The channel mode is also a **type-1** vPC parameter, so the vPC was inconsistent too and the secondary suspended it. To change a member's mode, remove it with `no channel-group` and add it back with `channel-group 20 mode active`.",
    lab: tweak((_, __, b) => {
      intf(b, "Ethernet1/20").channel = { id: 20, mode: "on" };
    }),
    goals: [both[1], { type: "vpcUp", vpc: 20, sw: "N9K-B", label: "vPC 20 is up on N9K-B" }],
    solution: [{ sw: "N9K-B", lines: ["configure terminal", "interface ethernet1/20", "no channel-group", "channel-group 20 mode active"] }],
  },
  {
    id: "vpc-vlans",
    title: "A new VLAN works on one leg only",
    exam: "dccor",
    objective: "1.2",
    brief: "VLAN 130 was added for ESX01's vMotion network on N9K-A only. vMotion fails intermittently, depending on which link the host's hash picks.",
    symptoms: ["vPC 10 is up on both peers; no type-1 failure", "show vpc: Type-2 consistency status: failed", "ESX01 sends VLAN 100, 110 and 130 on its bond"],
    hint: "Type-2 mismatches don't suspend anything, they just leave VLANs forwarding on one side. Check the VLAN database and the allowed list on N9K-B.",
    debrief:
      "Allowed VLANs differing between peers is a **type-2** inconsistency: the vPC stays up and the VLAN only forwards where it's configured, so traffic hashed to the other peer is lost. Make both peers identical: create the VLAN (`vlan 130`) and add it to the vPC trunk (`switchport trunk allowed vlan add 130`). The peer-link carries all VLANs here, so it needed nothing.",
    lab: tweak((l, a) => {
      l.devices[0].vlans = [100, 110, 130];
      a.vlans.push(130);
      for (const n of ["port-channel10", "Ethernet1/10"]) intf(a, n).allowed = [100, 110, 130];
    }),
    goals: [{ type: "legs", dev: "esx01", vlan: 130, label: "ESX01 forwards VLAN 130 on both links" }, both[0]],
    solution: [{ sw: "N9K-B", lines: ["configure terminal", "vlan 130", "exit", "interface port-channel10", "switchport trunk allowed vlan add 130"] }],
  },
  {
    id: "vpc-recovery",
    title: "One switch came back from the power cut, the servers didn't",
    exam: "dccor",
    objective: "1.2",
    brief:
      "A power event took down the rack. N9K-A rebooted; N9K-B's power supply died and it stays off until a replacement arrives tomorrow. N9K-A is up, yet every vPC on it is down. Configure N9K-A so that it brings vPCs up on its own in this situation (the lab replays the reload with your configuration).",
    symptoms: ["N9K-B: powered off", "show vpc on N9K-A: peer link is down, keep-alive not reachable", "vPC 10 and 20 down on N9K-A"],
    hint: "A peer that boots alone can't tell whether its peer is dead or just unreachable, so it waits. One vPC domain feature tells it to stop waiting.",
    debrief:
      "Without its peer ever having been seen this boot, a vPC switch keeps its vPCs down to avoid dual-active. **auto-recovery** (under `vpc domain`) makes it assume the primary role after the reload-delay (240 s by default) and bring its vPCs up. It also covers a second case: peer-link failure followed by primary failure, where the secondary would otherwise stay suspended. Configure it on both peers.",
    lab: tweak((_, a, b) => {
      b.offline = true;
      a.rebootedAlone = true;
    }),
    goals: [
      { type: "vpcUp", vpc: 10, sw: "N9K-A", label: "vPC 10 comes up on N9K-A" },
      { type: "vpcUp", vpc: 20, sw: "N9K-A", label: "vPC 20 comes up on N9K-A" },
    ],
    solution: [{ sw: "N9K-A", lines: ["configure terminal", "vpc domain 10", "auto-recovery"] }],
  },
  {
    id: "vpc-gateway",
    title: "The NAS can only reach its gateway half the time",
    exam: "dccor",
    objective: "1.2",
    brief:
      "NAS01 is dual-homed on vPC 30 in VLAN 110. Its firmware replies to the burned-in MAC of N9K-A's SVI instead of the HSRP virtual MAC. Traffic it hashes towards N9K-B is lost. Fix it in the vPC domain, not on the NAS.",
    symptoms: ["vPC 30 up and consistent on both peers", "Pings from NAS01 to its gateway lose about half the packets", "Other hosts in VLAN 110 use the HSRP vMAC and are fine"],
    hint: "Which vPC domain feature lets a peer route frames addressed to the other peer's router MAC?",
    debrief:
      "Normally only the HSRP virtual MAC is routed by both peers. A frame for N9K-A's own MAC that lands on N9K-B is bridged over the peer-link, and the vPC loop-prevention rule drops traffic that crossed the peer-link from leaving a vPC member port. **peer-gateway** makes each peer route frames sent to its peer's router MAC locally. Enable it on both peers (it also needs `no ip redirects` on the SVIs in practice).",
    lab: tweak((l, a, b) => {
      for (const s of [a, b]) s.intfs.push(eth("1/30", { channel: { id: 30, mode: "active" }, allowed: [110] }), po(30, { vpc: 30, allowed: [110] }));
      l.devices.push({ id: "nas01", label: "NAS01", kind: "nas", lacp: "active", vlans: [110], links: [["N9K-A", "Ethernet1/30"], ["N9K-B", "Ethernet1/30"]], usesRouterMac: "N9K-A" });
    }),
    goals: [{ type: "gateway", dev: "nas01", label: "NAS01's routed traffic works whichever peer it hashes to" }, { type: "legs", dev: "nas01", vlan: 110, label: "NAS01 forwards VLAN 110 on both links" }],
    solution: [
      { sw: "N9K-A", lines: ["configure terminal", "vpc domain 10", "peer-gateway"] },
      { sw: "N9K-B", lines: ["configure terminal", "vpc domain 10", "peer-gateway"] },
    ],
  },
];

export const vpcById: Record<string, VpcScenario> = Object.fromEntries(vpcScenarios.map((s) => [s.id, s]));
