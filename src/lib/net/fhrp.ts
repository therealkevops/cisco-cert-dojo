import type { L3If, Net } from "./engine";
import { ipToInt } from "./ip";
import { segmentOf } from "./ospf";
import type { FhrpGroup } from "./types";

// HSRP and VRRP as a converged-state model. Groups are formed by routers whose interfaces
// share a Layer 2 segment and use the same protocol, group number (and HSRP version).
// Election: highest priority, then highest interface IP. Preemption is honoured by
// remembering the previous active router across configuration changes.

export type FhrpMember = {
  dev: string;
  iface: string;
  ip: string;
  /** Effective priority after tracking. */
  prio: number;
  basePrio: number;
  preempt: boolean;
  /** Why the priority was lowered, if it was. */
  tracked: string[];
  conf: FhrpGroup;
};

export type FhrpState = {
  key: string;
  proto: "hsrp" | "vrrp";
  group: number;
  version: 1 | 2;
  vip?: string;
  vmac: string;
  active?: FhrpMember;
  standby?: FhrpMember;
  members: FhrpMember[];
};

export type FhrpResult = {
  groups: FhrpState[];
  /** `dev|iface` → the virtual addresses this interface currently owns. */
  owned: Map<string, { vip: string; vmac: string; state: FhrpState }[]>;
  /** group key → active `dev|iface`, for preemption decisions after the next change. */
  activeByKey: Map<string, string>;
};

const hex = (n: number, w: number) => n.toString(16).padStart(w, "0");

export function vmacOf(proto: "hsrp" | "vrrp", group: number, version: 1 | 2 = 1): string {
  if (proto === "vrrp") return `0000.5e00.01${hex(group, 2)}`;
  if (version === 2) return `0000.0c9f.f${hex(group, 3)}`;
  return `0000.0c07.ac${hex(group, 2)}`;
}

export function computeFhrp(net: Net, prevActive?: Map<string, string>): FhrpResult {
  const groups: FhrpState[] = [];
  const owned: FhrpResult["owned"] = new Map();
  const activeByKey = new Map<string, string>();
  const done = new Set<string>();

  const conf = (i: L3If) => net.ifObj(i.dev, i.name)?.fhrp ?? [];
  const trackDown = (dev: string, t: NonNullable<FhrpGroup["track"]>[number]): string | null => {
    const iface = t.iface ?? net.device(dev).tracks?.[String(t.object)]?.iface;
    if (!iface) return null;
    const up = net.l3Ifs(dev).find((x) => x.name === iface)?.up ?? net.linkUp(dev, iface);
    return up ? null : `${t.object !== undefined ? `track ${t.object} (${iface})` : iface} down, −${t.decrement}`;
  };

  for (const d of net.devices) {
    for (const ifc of net.l3Ifs(d.id)) {
      if (!ifc.up || !conf(ifc).length || done.has(`${ifc.dev}|${ifc.name}`)) continue;
      const seg = segmentOf(net, ifc).filter((x) => x.up && conf(x).length);
      const segKey = seg.map((x) => `${x.dev}|${x.name}`).sort().join(",");
      for (const x of seg) done.add(`${x.dev}|${x.name}`);

      const byGroup = new Map<string, FhrpMember[]>();
      for (const x of seg) {
        for (const g of conf(x)) {
          const version = g.proto === "hsrp" ? (g.version ?? 1) : 1;
          const gk = `${g.proto}|${g.group}|v${version}`;
          const owner = g.proto === "vrrp" && g.ip === x.cidr.ip;
          const base = owner ? 255 : (g.priority ?? 100);
          const tracked = (g.track ?? []).map((t) => [t, trackDown(x.dev, t)] as const).filter(([, why]) => why);
          const prio = owner ? 255 : Math.max(1, base - tracked.reduce((s, [t]) => s + t.decrement, 0));
          const m: FhrpMember = { dev: x.dev, iface: x.name, ip: x.cidr.ip, prio, basePrio: base, preempt: g.preempt ?? g.proto === "vrrp", tracked: tracked.map(([, w]) => w!), conf: g };
          byGroup.set(gk, [...(byGroup.get(gk) ?? []), m]);
        }
      }

      for (const [gk, members] of byGroup) {
        const [proto, group, v] = gk.split("|");
        const version = (v === "v2" ? 2 : 1) as 1 | 2;
        const key = `${segKey}#${gk}`;
        const rank = [...members].sort((a, b) => b.prio - a.prio || ipToInt(b.ip) - ipToInt(a.ip));
        const id = (m: FhrpMember) => `${m.dev}|${m.iface}`;
        let active = rank[0];
        const prev = members.find((m) => id(m) === prevActive?.get(key));
        if (prev && prev !== active) {
          // A higher-priority router only takes over a live active router if it preempts.
          const challenger = rank.find((m) => m !== prev && m.preempt && m.prio > prev.prio);
          active = challenger ?? prev;
        }
        const standby = rank.find((m) => m !== active);
        // HSRP routers without a configured address learn it from the active router.
        const vip = active.conf.ip ?? rank.find((m) => m.conf.ip)?.conf.ip;
        const st: FhrpState = { key, proto: proto as "hsrp" | "vrrp", group: +group, version, vip, vmac: vmacOf(proto as "hsrp" | "vrrp", +group, version), active: vip ? active : undefined, standby: vip ? standby : undefined, members };
        groups.push(st);
        if (!vip) continue;
        activeByKey.set(key, id(active));
        const k = id(active);
        owned.set(k, [...(owned.get(k) ?? []), { vip, vmac: st.vmac, state: st }]);
      }
    }
  }
  return { groups, owned, activeByKey };
}
