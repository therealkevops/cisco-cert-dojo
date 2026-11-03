// vPC Lab: a converged-state model of a Nexus vPC pair for DCCOR 1.2.
// Two peers with a vPC domain (peer-keepalive over mgmt0, role priority, peer-gateway,
// auto-recovery, graceful consistency check), port-channels with LACP, trunks and VLANs, and
// downstream devices dual-homed with LACP. `evaluate` works out keepalive and peer-link state, peer
// adjacency and roles, type-1 / type-2 consistency, per-vPC state on each peer and which VLANs each
// device leg forwards, with a reason for everything that's down. Scenarios can also take a peer
// offline or reload one alone to test failure behaviour.

export type ChannelMode = "active" | "passive" | "on";

export type VpcIntf = {
  /** "Ethernet1/10" or "port-channel10" */
  name: string;
  mode: "access" | "trunk";
  accessVlan: number;
  /** Trunk allowed VLANs; null = all */
  allowed: number[] | null;
  native: number;
  mtu: number;
  shutdown?: boolean;
  channel?: { id: number; mode: ChannelMode };
  /** port-channels only */
  vpc?: number | "peer-link";
};

export type VpcDomain = {
  id: number;
  keepalive?: { dst: string; src?: string; vrf: string };
  rolePriority: number;
  peerGateway: boolean;
  autoRecovery: boolean;
  graceful: boolean;
};

export type VpcSwitch = {
  id: string;
  mgmtIp: string;
  /** system MAC, breaks role-priority ties (lower wins) */
  mac: string;
  features: { vpc: boolean; lacp: boolean; hsrp?: boolean };
  domain?: VpcDomain;
  stpMode: "rapid-pvst" | "mst";
  vlans: number[];
  intfs: VpcIntf[];
  /** Powered off / failed. */
  offline?: boolean;
  /** Came back from a reload while its peer was gone, so it never saw the peer this boot. */
  rebootedAlone?: boolean;
};

export type VpcDevice = {
  id: string;
  label: string;
  kind: "server" | "switch" | "nas";
  lacp: "active" | "none";
  /** VLANs the device sends on its bond (tagged, or the access VLAN). */
  vlans: number[];
  links: [sw: string, port: string][];
  /** Sends routed traffic to one peer's burned-in MAC instead of the HSRP virtual MAC. */
  usesRouterMac?: string;
};

export type VpcLab = { switches: [VpcSwitch, VpcSwitch]; peerLinks: [string, string][]; devices: VpcDevice[] };

export type Inconsistency = { level: "type1-global" | "type1" | "type2"; what: string; local: string; peer: string; vpc?: number };
export type VpcState = { vpc: number; po: string; status: Record<string, { up: boolean; why: string }>; consistency: "success" | "failed" | "not performed"; reason: string; incons: Inconsistency[] };
export type Leg = { dev: string; sw: string; port: string; state: "bundled" | "suspended" | "down" | "individual"; why: string; forwards: number[] };

export type VpcResult = {
  keepalive: { up: boolean; why: string };
  peerLink: { up: boolean; why: string; po?: Record<string, string> };
  adjacency: { ok: boolean; why: string };
  role: Record<string, "primary" | "secondary" | "operational primary" | "none established">;
  global: Inconsistency[];
  vpcs: VpcState[];
  legs: Leg[];
};

export const DEFAULT_ROLE = 32667;
const ALL = Array.from({ length: 4094 }, (_, i) => i + 1);
export const allowedOf = (i: VpcIntf) => (i.mode === "access" ? [i.accessVlan] : (i.allowed ?? ALL));

export const poName = (n: number) => `port-channel${n}`;
export function intfOf(s: VpcSwitch, name: string) {
  return s.intfs.find((i) => i.name === name);
}
export const membersOf = (s: VpcSwitch, id: number) => s.intfs.filter((i) => i.channel?.id === id);

export function fmtVlans(vs: number[] | null): string {
  if (!vs) return "1-4094";
  const s = [...new Set(vs)].sort((a, b) => a - b);
  if (!s.length) return "none";
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(j > i ? `${s[i]}-${s[j]}` : `${s[i]}`);
    i = j;
  }
  return out.join(",");
}

const lacpPair = (a: ChannelMode, b: ChannelMode | "none") => {
  if (a === "on") return b === "on" || b === "none" ? null : "this side is mode on (static) but the partner runs LACP, so the partner never bundles it";
  if (b === "on" || b === "none") return "LACP is configured but the partner sends no LACP PDUs, so the port is suspended";
  if (a === "passive" && b === "passive") return "both ends are LACP passive, so neither starts negotiation";
  return null;
};

export function evaluate(lab: VpcLab): VpcResult {
  const [A, B] = lab.switches;
  const peer = (s: VpcSwitch) => (s === A ? B : A);
  const on = (s: VpcSwitch) => !s.offline;

  // Peer-keepalive.
  let keepalive = { up: true, why: "peer is alive" };
  for (const s of [A, B]) {
    const p = peer(s);
    const ka = s.domain?.keepalive;
    if (!s.features.vpc || !s.domain) keepalive = { up: false, why: `${s.id} has no vPC domain` };
    else if (!ka) keepalive = { up: false, why: `${s.id} has no peer-keepalive configured` };
    else if (ka.dst !== p.mgmtIp) keepalive = { up: false, why: `${s.id} sends keepalives to ${ka.dst}, but ${p.id}'s mgmt0 is ${p.mgmtIp}` };
    else if (ka.src && ka.src !== s.mgmtIp) keepalive = { up: false, why: `${s.id} sources keepalives from ${ka.src}, which isn't its mgmt0 address (${s.mgmtIp})` };
    else if (ka.vrf !== "management") keepalive = { up: false, why: `${s.id} sends keepalives in VRF ${ka.vrf}, but mgmt0 lives in VRF management` };
    if (!keepalive.up) break;
  }
  if (keepalive.up && (A.offline || B.offline)) keepalive = { up: false, why: `${A.offline ? A.id : B.id} is down, so no keepalives arrive` };

  // Peer-link: a port-channel marked `vpc peer-link` on both peers over the cabled ports.
  const plPo = (s: VpcSwitch) => s.intfs.find((i) => i.vpc === "peer-link");
  let peerLink: VpcResult["peerLink"] = { up: true, why: "peer-link is up" };
  {
    const pa = plPo(A);
    const pb = plPo(B);
    const bad = (why: string) => (peerLink = { up: false, why });
    if (A.offline || B.offline) bad(`${A.offline ? A.id : B.id} is down`);
    else if (!pa || !pb) bad(`${!pa ? A.id : B.id} has no port-channel with vpc peer-link`);
    else if (pa.mode !== "trunk" || pb.mode !== "trunk") bad(`the peer-link must be a trunk (${pa.mode !== "trunk" ? A.id : B.id} has it in access mode)`);
    else {
      const idA = +pa.name.replace("port-channel", "");
      const idB = +pb.name.replace("port-channel", "");
      const up = lab.peerLinks.filter(([x, y]) => {
        const ia = intfOf(A, x);
        const ib = intfOf(B, y);
        return ia && ib && !ia.shutdown && !ib.shutdown && ia.channel?.id === idA && ib.channel?.id === idB && !lacpPair(ia.channel.mode, ib.channel.mode);
      });
      if (pa.shutdown || pb.shutdown) bad("the peer-link port-channel is shut down");
      else if (!up.length) bad(`no cabled member port is bundled into the peer-link on both sides (check channel-group ${idA}/${idB} and LACP modes)`);
      else peerLink = { up: true, why: `peer-link up on ${up.length} member(s)`, po: { [A.id]: pa.name, [B.id]: pb.name } };
    }
  }

  // Adjacency and roles.
  let adjacency = { ok: false, why: "" };
  const domMatch = A.domain && B.domain && A.domain.id === B.domain.id;
  if (A.offline || B.offline) adjacency = { ok: false, why: `${A.offline ? A.id : B.id} is down` };
  else if (!A.domain || !B.domain) adjacency = { ok: false, why: `${!A.domain ? A.id : B.id} has no vPC domain` };
  else if (!domMatch) adjacency = { ok: false, why: `domain IDs differ (${A.domain.id} vs ${B.domain.id}): the peers derive different vPC system MACs` };
  else if (!peerLink.up) adjacency = { ok: false, why: `peer-link is down: ${peerLink.why}` };
  else if (!keepalive.up) adjacency = { ok: false, why: `peer-keepalive has never come up (${keepalive.why}), so the peers won't form adjacency and keep their vPCs down` };
  else adjacency = { ok: true, why: "peer adjacency formed ok" };

  const role: VpcResult["role"] = {};
  if (adjacency.ok) {
    const pa = A.domain!.rolePriority;
    const pb = B.domain!.rolePriority;
    const aWins = pa < pb || (pa === pb && A.mac < B.mac);
    role[A.id] = aWins ? "primary" : "secondary";
    role[B.id] = aWins ? "secondary" : "primary";
  } else
    for (const s of [A, B]) {
      if (s.offline) continue;
      const p = peer(s);
      if (p.offline && (!s.rebootedAlone || s.domain?.autoRecovery)) role[s.id] = "operational primary";
      else if (!p.offline && keepalive.up && !peerLink.up && s.domain && p.domain) {
        // Peer-link failure with a live keepalive: roles stay as they were.
        const mine = s.domain.rolePriority;
        const theirs = p.domain.rolePriority;
        role[s.id] = mine < theirs || (mine === theirs && s.mac < p.mac) ? "primary" : "secondary";
      } else role[s.id] = "none established";
    }

  // Global type-1 checks.
  const global: Inconsistency[] = [];
  if (adjacency.ok) {
    if (A.stpMode !== B.stpMode) global.push({ level: "type1-global", what: "STP Mode", local: A.stpMode, peer: B.stpMode });
  }

  // Per-vPC state.
  const nums = [...new Set([A, B].flatMap((s) => s.intfs.filter((i) => typeof i.vpc === "number").map((i) => i.vpc as number)))].sort((x, y) => x - y);
  const vpcs: VpcState[] = [];
  const poOf = (s: VpcSwitch, n: number) => s.intfs.find((i) => i.vpc === n);
  for (const n of nums) {
    const st: VpcState = { vpc: n, po: poOf(A, n)?.name ?? poOf(B, n)!.name, status: {}, consistency: "not performed", reason: "", incons: [] };
    const ia = poOf(A, n);
    const ib = poOf(B, n);
    const incons: Inconsistency[] = [];
    if (adjacency.ok && ia && ib) {
      const lead = (s: VpcSwitch, po: VpcIntf) => membersOf(s, +po.name.replace("port-channel", ""))[0]?.channel?.mode ?? "active";
      const lacpA = lead(A, ia) === "on" ? "on" : "lacp";
      const lacpB = lead(B, ib) === "on" ? "on" : "lacp";
      if (ia.mode !== ib.mode) incons.push({ level: "type1", what: "Switchport mode", local: ia.mode, peer: ib.mode, vpc: n });
      if (ia.mode === "trunk" && ib.mode === "trunk" && ia.native !== ib.native) incons.push({ level: "type1", what: "Native VLAN", local: String(ia.native), peer: String(ib.native), vpc: n });
      if (ia.mode === "access" && ib.mode === "access" && ia.accessVlan !== ib.accessVlan) incons.push({ level: "type1", what: "Access VLAN", local: String(ia.accessVlan), peer: String(ib.accessVlan), vpc: n });
      if (lacpA !== lacpB) incons.push({ level: "type1", what: "Port-channel mode (LACP)", local: lead(A, ia), peer: lead(B, ib), vpc: n });
      if (ia.mtu !== ib.mtu) incons.push({ level: "type1", what: "MTU", local: String(ia.mtu), peer: String(ib.mtu), vpc: n });
      const va = allowedOf(ia).filter((v) => A.vlans.includes(v));
      const vb = allowedOf(ib).filter((v) => B.vlans.includes(v));
      if (fmtVlans(va) !== fmtVlans(vb)) incons.push({ level: "type2", what: "Allowed VLANs (created and allowed)", local: fmtVlans(va), peer: fmtVlans(vb), vpc: n });
    }
    const t1 = [...global, ...incons.filter((i) => i.level === "type1")];
    if (adjacency.ok && ia && ib) {
      st.consistency = t1.length ? "failed" : "success";
      st.reason = t1.length ? `vPC type-1 configuration incompatible - ${t1[0].what} inconsistent` : incons.length ? `type-2 inconsistency: ${incons[0].what} differ` : "success";
    } else st.reason = adjacency.ok ? "vPC not configured on the peer" : "Consistency Check Not Performed";
    st.incons = incons;

    for (const s of [A, B]) {
      if (s.offline) {
        st.status[s.id] = { up: false, why: `${s.id} is down` };
        continue;
      }
      const po = poOf(s, n);
      if (!po) {
        st.status[s.id] = { up: false, why: `${s.id} has no port-channel with vpc ${n}` };
        continue;
      }
      if (po.shutdown) {
        st.status[s.id] = { up: false, why: `${po.name} is shut down` };
        continue;
      }
      if (adjacency.ok) {
        if (!poOf(peer(s), n)) st.status[s.id] = { up: false, why: `vPC ${n} isn't configured on ${peer(s).id}` };
        else if (t1.length) {
          const suspended = !s.domain!.graceful || !peer(s).domain!.graceful || role[s.id] === "secondary";
          st.status[s.id] = suspended ? { up: false, why: `suspended: ${st.reason}${s.domain!.graceful && peer(s).domain!.graceful ? " (graceful consistency check suspends the secondary only)" : " (graceful consistency check is off, so both peers suspend)"}` } : { up: true, why: `kept up on the primary by the graceful consistency check, despite: ${st.reason}` };
        } else st.status[s.id] = { up: true, why: "up, consistency success" };
        continue;
      }
      const p = peer(s);
      if (p.offline) {
        st.status[s.id] =
          !s.rebootedAlone || s.domain?.autoRecovery
            ? { up: true, why: s.rebootedAlone ? "up: auto-recovery assumed the primary role after the peer stayed silent" : `up: ${s.id} is operational primary while ${p.id} is down` }
            : { up: false, why: `${s.id} reloaded while ${p.id} was down and has never seen its peer this boot; without auto-recovery it keeps vPCs down` };
      } else if (keepalive.up && !peerLink.up) {
        st.status[s.id] = role[s.id] === "secondary" ? { up: false, why: "suspended: the peer-link is down but the peer is alive (keepalive), so the secondary suspends its vPCs to avoid dual-active" } : { up: true, why: "up on the primary while the peer-link is down" };
      } else st.status[s.id] = { up: false, why: `down: ${adjacency.why}` };
    }
    vpcs.push(st);
  }

  // Device legs.
  const legs: Leg[] = [];
  for (const d of lab.devices) {
    for (const [sid, port] of d.links) {
      const s = lab.switches.find((x) => x.id === sid)!;
      const leg = (state: Leg["state"], why: string, forwards: number[] = []) => legs.push({ dev: d.id, sw: sid, port, state, why, forwards });
      const m = intfOf(s, port);
      if (!on(s)) {
        leg("down", `${sid} is down`);
        continue;
      }
      if (!m) {
        leg("down", `${port} doesn't exist on ${sid}`);
        continue;
      }
      if (m.shutdown) {
        leg("down", `${sid} ${port} is shut down`);
        continue;
      }
      if (!m.channel) {
        if (d.lacp === "active") {
          leg("individual", `${sid} ${port} isn't in a channel-group; the device's bond sees no LACP partner on this link`);
          continue;
        }
        const f = allowedOf(m).filter((v) => s.vlans.includes(v) && d.vlans.includes(v));
        leg("individual", `${sid} ${port} is a standalone port`, f);
        continue;
      }
      const err = lacpPair(m.channel.mode, d.lacp);
      if (err) {
        leg("suspended", `${sid} ${port}: ${err}`);
        continue;
      }
      const po = intfOf(s, poName(m.channel.id));
      if (!po) {
        leg("down", `${sid} has no ${poName(m.channel.id)}`);
        continue;
      }
      if (typeof po.vpc !== "number") {
        leg("bundled", `${sid} ${po.name} has no vpc number, so the two peers present different LACP system IDs and the device can't bundle both legs`, []);
        continue;
      }
      const v = vpcs.find((x) => x.vpc === po.vpc)!;
      const stt = v.status[sid];
      if (!stt.up) {
        leg("suspended", `vPC ${po.vpc} on ${sid}: ${stt.why}`);
        continue;
      }
      const f = allowedOf(po).filter((x) => d.vlans.includes(x));
      const created = f.filter((x) => s.vlans.includes(x));
      const missing = d.vlans.filter((x) => !created.includes(x));
      const notCreated = missing.filter((x) => !s.vlans.includes(x));
      const notAllowed = missing.filter((x) => !allowedOf(po).includes(x));
      const causes = [notCreated.length ? `VLAN ${fmtVlans(notCreated)} isn't in ${sid}'s VLAN database` : "", notAllowed.length ? `VLAN ${fmtVlans(notAllowed)} isn't in ${po.name}'s allowed list` : ""].filter(Boolean).join(" and ");
      leg("bundled", missing.length ? `bundled in vPC ${po.vpc}, but ${causes}` : `bundled in vPC ${po.vpc}, forwarding VLAN ${fmtVlans(created)}`, created);
    }
  }
  return { keepalive, peerLink, adjacency, role, global, vpcs, legs };
}

export type VpcGoal =
  | { type: "legs"; dev: string; vlan: number; label: string }
  | { type: "vpcUp"; vpc: number; sw: string; label: string }
  | { type: "adjacency"; label: string }
  | { type: "primary"; sw: string; label: string }
  | { type: "gateway"; dev: string; label: string };

export type VpcGoalResult = { goal: VpcGoal; ok: boolean; detail: string };

export function gradeVpc(lab: VpcLab, goals: VpcGoal[]): VpcGoalResult[] {
  const r = evaluate(lab);
  return goals.map((goal) => {
    if (goal.type === "legs") {
      const legs = r.legs.filter((l) => l.dev === goal.dev);
      const bad = legs.find((l) => !l.forwards.includes(goal.vlan));
      return { goal, ok: !bad && legs.length > 0, detail: bad ? `${bad.sw} ${bad.port}: ${bad.why}` : `every link forwards VLAN ${goal.vlan}` };
    }
    if (goal.type === "vpcUp") {
      const v = r.vpcs.find((x) => x.vpc === goal.vpc);
      const s = v?.status[goal.sw];
      return { goal, ok: !!s?.up, detail: s?.why ?? `vPC ${goal.vpc} isn't configured` };
    }
    if (goal.type === "adjacency") return { goal, ok: r.adjacency.ok, detail: r.adjacency.why };
    if (goal.type === "primary") return { goal, ok: r.role[goal.sw] === "primary", detail: `${goal.sw} is ${r.role[goal.sw] ?? "down"}` };
    const d = lab.devices.find((x) => x.id === goal.dev)!;
    const legs = r.legs.filter((l) => l.dev === d.id);
    if (legs.some((l) => !l.forwards.length)) return { goal, ok: false, detail: `${d.label} doesn't have every link forwarding yet` };
    const owner = d.usesRouterMac!;
    const other = lab.switches.find((s) => s.id !== owner)!;
    if (!other.domain?.peerGateway) return { goal, ok: false, detail: `frames hashed to ${other.id} carry ${owner}'s router MAC; ${other.id} can't route them and sends them over the peer-link, where the loop-prevention rule drops traffic headed back out a vPC. Enable peer-gateway` };
    return { goal, ok: true, detail: `${other.id} routes frames sent to ${owner}'s MAC itself (peer-gateway)` };
  });
}

export type VpcScenario = {
  id: string;
  title: string;
  exam: "dccor";
  objective: string;
  brief: string;
  symptoms: string[];
  hint?: string;
  debrief?: string;
  lab: VpcLab;
  goals: VpcGoal[];
  solution: { sw: string; lines: string[] }[];
};
