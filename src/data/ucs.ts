import { defaultAdapter, defaultQos, type UcsConfig, type UcsScenario } from "@/lib/ucs";

// UCS Profile Lab scenarios (DCAI 3.2). Each starts from a configuration that fails its checks;
// grading looks at the resulting policies, so any valid set of choices passes.

function base(): UcsConfig {
  return {
    domain: { vlans: [1, 100], ntp: [], qos: defaultQos() },
    server: {
      vnics: [
        { name: "eth0", purpose: "management / front-end", fabric: "A", vlans: [100], mtu: 1500, qos: "besteffort", adapter: "default" },
        { name: "eth-roce", purpose: "GPU back-end (RoCEv2)", fabric: "A", vlans: [300], mtu: 1500, qos: "besteffort", adapter: "default" },
      ],
      adapters: [defaultAdapter()],
      power: { priority: "medium", restore: "always-off", redundancy: "n+1" },
      storage: { m2: "none", data: "jbod" },
    },
  };
}

const roceGoals = [
  { type: "roceReady" as const, vnic: "eth-roce", label: "eth-roce carries RoCEv2 in an enabled no-drop class, CoS matched, MTU 9000 on the vNIC and 9216 in the class" },
  { type: "ntp" as const, label: "The domain has at least one NTP server" },
  { type: "deployClean" as const, label: "The profiles deploy with no errors or warnings" },
];

export const ucsScenarios: UcsScenario[] = [
  {
    id: "ucs-roce",
    title: "Build a RoCE-ready GPU server profile",
    exam: "dcai",
    objective: "3.2",
    brief:
      "New GPU servers arrive tomorrow. The domain and server profiles still have factory defaults. Set them up so the back-end vNIC eth-roce carries lossless RoCEv2 on VLAN 300, end to end.",
    requirements: [
      "Back-end VLAN 300 must reach the servers",
      "RoCE traffic in the Platinum class: no-drop, jumbo MTU",
      "eth-roce uses an Ethernet adapter policy with RoCEv2 enabled, marking the same CoS as the class",
      "Time from NTP server 10.0.0.1",
    ],
    hint: "Work from the domain down: VLAN policy, System QoS (enable Platinum, no-drop, MTU 9216), NTP. Then create an adapter policy with RoCE and point eth-roce at it, with the Platinum QoS class and MTU 9000.",
    debrief:
      "RoCE on UCS needs the whole chain: the VLAN in the domain's VLAN policy, a System QoS class that is enabled, no-drop and jumbo, a vNIC that uses that class with MTU 9000, and an Ethernet adapter policy with RoCEv2 (queue pairs, memory regions, resource groups) marking the class's CoS. Missing any one either blocks deployment or quietly makes RDMA lossy.",
    config: base(),
    goals: roceGoals,
  },
  {
    id: "ucs-fix",
    title: "The RoCE vNIC won't deploy",
    exam: "dcai",
    objective: "3.2",
    brief:
      "A colleague built the GPU server profile from an old template. Deployment fails, and before that the pilot showed heavy RDMA retransmissions. Fix the profiles without changing the design intent (RoCE in Platinum, VLAN 300).",
    requirements: ["Deploy without errors or warnings", "eth-roce lossless RoCEv2 end to end", "Keep NTP as configured"],
    hint: "Read the deploy findings one by one. There are at least four separate problems across the domain and server profiles.",
    debrief:
      "Four faults: VLAN 300 was missing from the domain VLAN policy, eth-roce pointed at the Gold class, which wasn't enabled, Platinum was still at MTU 1500, and the adapter policy marked CoS 4 while Platinum uses CoS 5. Intersight blocks the first two at deployment. The last two deploy fine and only show up as poor RDMA performance, which is why they're worth checking deliberately.",
    config: (() => {
      const c = base();
      c.domain.ntp = ["10.0.0.1"];
      c.domain.qos.platinum = { enabled: true, cos: 5, noDrop: true, mtu: 1500 };
      c.server.adapters.push({ name: "RoCE-v2", roce: true, roceVersion: 2, queuePairs: 1024, memoryRegions: 131072, resourceGroups: 8, cos: 4 });
      Object.assign(c.server.vnics[1], { qos: "gold", mtu: 9000, adapter: "RoCE-v2" });
      return c;
    })(),
    goals: roceGoals,
  },
  {
    id: "ucs-power",
    title: "Power and boot policies for the GPU rack",
    exam: "dcai",
    objective: "3.2",
    brief:
      "Facilities wired the GPU rack to two independent power feeds (A and B). Set the power and storage policies so the servers survive a feed failure, come back as they were after an outage, are the last to be capped, and boot from mirrored drives.",
    requirements: [
      "Survive the loss of a whole power feed",
      "After power returns, restore each server to the state it was in",
      "GPU servers are capped last when the budget is tight",
      "Boot from mirrored M.2 drives",
    ],
    hint: "Losing a feed takes out half the PSUs at once: which redundancy mode protects against that? Power restore and power priority are separate settings.",
    debrief:
      "Grid redundancy splits PSUs across the two feeds, so either feed alone can run the server (N+1 only covers one PSU failing). Power restore 'last state' brings servers back as they were. Priority 'high' keeps GPU nodes uncapped longest. M.2 RAID 1 mirrors the boot drives.",
    config: (() => {
      const c = base();
      c.domain.vlans.push(300);
      c.domain.ntp = ["10.0.0.1"];
      return c;
    })(),
    goals: [
      { type: "power", field: "redundancy", value: "grid", label: "Power redundancy protects against a whole feed failing" },
      { type: "power", field: "restore", value: "last-state", label: "Servers return to their last power state after an outage" },
      { type: "power", field: "priority", value: "high", label: "GPU servers are capped last" },
      { type: "storage", field: "m2", value: "raid1", label: "Boot drives are mirrored" },
    ],
  },
];

export const ucsById = Object.fromEntries(ucsScenarios.map((s) => [s.id, s]));
