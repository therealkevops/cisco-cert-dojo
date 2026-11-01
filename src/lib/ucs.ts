// UCS Profile Lab: a small model of Intersight Managed Mode policies for GPU servers.
// The domain profile (fabric interconnects) holds the VLAN, NTP and System QoS policies; the server
// profile holds the LAN connectivity (vNICs with their QoS and Ethernet adapter policies), power and
// storage policies. `validate` gives the deploy errors and warnings an engineer would act on.

export type QosClassId = "platinum" | "gold" | "silver" | "bronze" | "besteffort" | "fc";
export const QOS_CLASSES: { id: QosClassId; name: string }[] = [
  { id: "platinum", name: "Platinum" },
  { id: "gold", name: "Gold" },
  { id: "silver", name: "Silver" },
  { id: "bronze", name: "Bronze" },
  { id: "besteffort", name: "Best Effort" },
  { id: "fc", name: "Fibre Channel" },
];
export const className = (id: QosClassId) => QOS_CLASSES.find((c) => c.id === id)!.name;

export type QosClass = { enabled: boolean; cos: number; noDrop: boolean; mtu: 1500 | 9216 };
export type AdapterPolicy = { name: string; roce: boolean; roceVersion: 1 | 2; queuePairs: number; memoryRegions: number; resourceGroups: number; cos: number };
export type Vnic = { name: string; fabric: "A" | "B"; vlans: number[]; mtu: number; qos: QosClassId; adapter: string; purpose: string };

export type UcsConfig = {
  domain: { vlans: number[]; ntp: string[]; qos: Record<QosClassId, QosClass> };
  server: {
    vnics: Vnic[];
    adapters: AdapterPolicy[];
    power: { priority: "low" | "medium" | "high"; restore: "always-off" | "always-on" | "last-state"; redundancy: "grid" | "n+1" | "not-redundant" };
    storage: { m2: "none" | "raid1"; data: "jbod" | "raid0" | "raid5" | "raid10" };
  };
};

export type UcsGoal =
  | { type: "roceReady"; vnic: string; label: string }
  | { type: "deployClean"; label: string }
  | { type: "ntp"; label: string }
  | { type: "power"; field: keyof UcsConfig["server"]["power"]; value: string; label: string }
  | { type: "storage"; field: keyof UcsConfig["server"]["storage"]; value: string; label: string };

export type UcsScenario = {
  id: string;
  title: string;
  exam: "dcai";
  objective: string;
  brief: string;
  requirements: string[];
  hint?: string;
  debrief?: string;
  config: UcsConfig;
  goals: UcsGoal[];
};

/** UCS defaults: Best Effort and FC enabled; Platinum CoS 5, Gold 4, Silver 2, Bronze 1, FC 3 (no-drop). */
export function defaultQos(): Record<QosClassId, QosClass> {
  return {
    platinum: { enabled: false, cos: 5, noDrop: false, mtu: 1500 },
    gold: { enabled: false, cos: 4, noDrop: false, mtu: 1500 },
    silver: { enabled: false, cos: 2, noDrop: false, mtu: 1500 },
    bronze: { enabled: false, cos: 1, noDrop: false, mtu: 1500 },
    besteffort: { enabled: true, cos: 0, noDrop: false, mtu: 1500 },
    fc: { enabled: true, cos: 3, noDrop: true, mtu: 1500 },
  };
}

export const defaultAdapter = (): AdapterPolicy => ({ name: "default", roce: false, roceVersion: 2, queuePairs: 0, memoryRegions: 0, resourceGroups: 0, cos: 0 });

export type Finding = { level: "error" | "warning"; where: string; text: string };

export function validate(c: UcsConfig): Finding[] {
  const out: Finding[] = [];
  const q = c.domain.qos;
  // System QoS: each enabled class needs its own CoS.
  const seen = new Map<number, QosClassId>();
  for (const { id } of QOS_CLASSES) {
    const k = q[id];
    if (!k.enabled || id === "besteffort") continue;
    const other = seen.get(k.cos);
    if (other) out.push({ level: "error", where: "System QoS policy", text: `CoS ${k.cos} is used by both ${className(other)} and ${className(id)}. Each enabled class needs a unique CoS.` });
    seen.set(k.cos, id);
  }
  if (!c.domain.ntp.length) out.push({ level: "warning", where: "NTP policy", text: "No NTP servers. Fabric interconnect and server clocks will drift, which breaks log correlation and certificate checks." });

  for (const v of c.server.vnics) {
    const where = `vNIC ${v.name}`;
    for (const vl of v.vlans) if (!c.domain.vlans.includes(vl)) out.push({ level: "error", where, text: `VLAN ${vl} is not in the domain profile's VLAN policy, so the server profile cannot deploy.` });
    const k = q[v.qos];
    if (!k.enabled) out.push({ level: "error", where, text: `Its Ethernet QoS policy uses the ${className(v.qos)} class, which is not enabled in the domain's System QoS policy.` });
    const a = c.server.adapters.find((x) => x.name === v.adapter);
    if (!a) {
      out.push({ level: "error", where, text: `Ethernet adapter policy "${v.adapter}" does not exist.` });
      continue;
    }
    if (k.enabled && v.mtu > k.mtu - 216 && v.mtu > 1500) out.push({ level: "warning", where, text: `vNIC MTU ${v.mtu} is larger than the ${className(v.qos)} class MTU (${k.mtu}). Jumbo frames will be dropped in the fabric.` });
    if (a.roce) {
      if (k.enabled && !k.noDrop) out.push({ level: "warning", where, text: `RoCE is enabled, but the ${className(v.qos)} class is not no-drop. RDMA traffic will see loss and go-back-N retransmissions.` });
      if (k.enabled && a.cos !== k.cos) out.push({ level: "warning", where, text: `Adapter policy "${a.name}" marks RoCE with CoS ${a.cos}, but the ${className(v.qos)} class uses CoS ${k.cos}. RoCE frames land in a different class.` });
      if (a.roceVersion !== 2) out.push({ level: "warning", where, text: `Adapter policy "${a.name}" uses RoCEv1, which is not routable. AI fabrics use RoCEv2.` });
      if (!a.queuePairs || !a.memoryRegions || !a.resourceGroups) out.push({ level: "error", where, text: `Adapter policy "${a.name}" enables RoCE without queue pairs, memory regions and resource groups.` });
    }
  }
  return out;
}

export type UcsGoalResult = { goal: UcsGoal; ok: boolean; detail: string };

export function gradeUcs(c: UcsConfig, goals: UcsGoal[]): UcsGoalResult[] {
  const findings = validate(c);
  return goals.map((goal) => {
    if (goal.type === "deployClean") {
      const e = findings.filter((f) => f.level === "error").length;
      const w = findings.filter((f) => f.level === "warning").length;
      return { goal, ok: !e && !w, detail: e || w ? `${e} error${e === 1 ? "" : "s"}, ${w} warning${w === 1 ? "" : "s"}` : "deploys cleanly" };
    }
    if (goal.type === "ntp") return { goal, ok: c.domain.ntp.length > 0, detail: c.domain.ntp.length ? c.domain.ntp.join(", ") : "no NTP servers" };
    if (goal.type === "power") {
      const v = c.server.power[goal.field];
      return { goal, ok: v === goal.value, detail: `${goal.field} is ${v}` };
    }
    if (goal.type === "storage") {
      const v = c.server.storage[goal.field];
      return { goal, ok: v === goal.value, detail: `${goal.field} is ${v}` };
    }
    const v = c.server.vnics.find((x) => x.name === goal.vnic);
    if (!v) return { goal, ok: false, detail: `no vNIC ${goal.vnic}` };
    const k = c.domain.qos[v.qos];
    const a = c.server.adapters.find((x) => x.name === v.adapter);
    const why: string[] = [];
    if (!a?.roce) why.push("RoCE is not enabled on its adapter policy");
    else {
      if (a.roceVersion !== 2) why.push("not RoCEv2");
      if (a.cos !== k.cos) why.push(`adapter CoS ${a.cos} ≠ class CoS ${k.cos}`);
    }
    if (!k.enabled) why.push(`${className(v.qos)} is disabled`);
    else {
      if (!k.noDrop) why.push(`${className(v.qos)} is not no-drop`);
      if (k.mtu !== 9216) why.push(`${className(v.qos)} MTU is ${k.mtu}`);
    }
    if (v.mtu !== 9000) why.push(`vNIC MTU is ${v.mtu}`);
    if (findings.some((f) => f.level === "error" && f.where === `vNIC ${v.name}`)) why.push("the vNIC has deploy errors");
    return { goal, ok: !why.length, detail: why.length ? why.join("; ") : `${v.name}: RoCEv2, ${className(v.qos)} no-drop CoS ${k.cos}, MTU 9000/9216` };
  });
}
