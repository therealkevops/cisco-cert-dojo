// SAN Lab: a converged-state model of a Fibre Channel fabric for DCCOR 3.1 and 5.3.
// Switches hold their VSAN database, per-port VSAN membership and mode, ISLs (E ports, trunking or not),
// NPV/NPIV, static domain IDs and port security. Zoning and device-aliases are fabric-wide, as if
// distributed by CFS. `evaluate` works out logins, FCIDs, fabric merges and per-HBA LUN visibility,
// with the reason for every failure, which is what the troubleshooting challenges grade on.

export type PortMode = "F" | "E" | "NP";

export type SanPort = {
  name: string;
  mode: PortMode;
  /** Port VSAN (for E ports that don't trunk, the one VSAN the ISL carries). */
  vsan: number;
  /** E ports: trunk mode on makes the port a TE port that carries every allowed VSAN. */
  trunk?: boolean;
  /** Trunk allowed VSANs. Absent means all. */
  allowed?: number[];
  shutdown?: boolean;
};

export type PsBinding = { pwwn: string; iface: string };
/** Port security keeps a config database and an active one: edits reach enforcement only on `port-security activate`. */
export type PortSecurity = { vsan: number; active: boolean; bindings: PsBinding[]; activeBindings: PsBinding[] };

export type SanSwitch = {
  id: string;
  /** Running domain ID (static). Switches with the same ID in one VSAN can't merge. */
  domain: number;
  /** Configured with `fcdomain domain N static`; takes effect after `fcdomain restart`. */
  pendingDomain?: number;
  /** VSANs created in this switch's VSAN database (VSAN 1 always exists). */
  vsans: number[];
  /** Edge switch in NPV mode: logs devices into a core switch through NP uplinks. */
  npv?: boolean;
  /** Core switch accepts several logins (FDISCs) on one F port. */
  npiv?: boolean;
  portSecurityFeature?: boolean;
  portSecurity?: PortSecurity[];
  ports: SanPort[];
};

export type SanDevice = { id: string; kind: "hba" | "array"; label: string; pwwn: string; at: [sw: string, port: string] };

export type Zone = { name: string; members: string[] };
export type VsanZoning = {
  zones: Zone[];
  zonesets: { name: string; zones: string[] }[];
  /** Snapshot taken at activation: editing zones later does nothing until you activate again. */
  active?: { name: string; zones: Zone[] };
  defaultZone: "deny" | "permit";
};

export type SanFabric = {
  switches: SanSwitch[];
  devices: SanDevice[];
  /** Cables between switch ports. */
  links: [a: [string, string], b: [string, string]][];
  zoning: Record<string, VsanZoning>;
  /** Committed device-alias database: name → pWWN (distributed fabric-wide). */
  aliases: Record<string, string>;
  /** Uncommitted device-alias edits (the CFS lock is held until `device-alias commit`). */
  aliasPending?: Record<string, string> | null;
  /** LUN masking per array device: which initiator pWWNs see which LUN. */
  luns: Record<string, { lun: number; initiators: string[] }[]>;
};

export type Login = { dev: string; ok: boolean; sw?: string; port?: string; vsan?: number; fcid?: string; via?: string; why?: string };
export type IslState = { a: [string, string]; b: [string, string]; up: boolean; vsans: number[]; isolated: number[]; why?: string };
export type Visibility = { hba: string; array: string; lun: number; ok: boolean; why: string };

export type SanResult = {
  logins: Login[];
  isls: IslState[];
  /** VSAN → groups of switch ids that form one fabric */
  components: Record<number, string[][]>;
  visibility: Visibility[];
};

export const PWWN_RE = /^([0-9a-f]{2}:){7}[0-9a-f]{2}$/i;
const hex2 = (n: number) => n.toString(16).padStart(2, "0");
const lc = (s: string) => s.toLowerCase();

/** Zone member → pWWN. Members are stored as a pWWN or a device-alias name (resolved against the committed database). */
export const resolveMember = (f: SanFabric, m: string): string | undefined => (PWWN_RE.test(m) ? lc(m) : f.aliases[m] ? lc(f.aliases[m]) : undefined);

export function zoningFor(f: SanFabric, vsan: number): VsanZoning {
  return f.zoning[String(vsan)] ?? { zones: [], zonesets: [], defaultZone: "deny" };
}

export const hasVsan = (s: SanSwitch, v: number) => v === 1 || s.vsans.includes(v);
export const carries = (p: SanPort) => (p.mode === "E" && p.trunk ? (p.allowed ?? null) : [p.vsan]);
export const portKind = (p: SanPort) => (p.mode === "E" && p.trunk ? "TE" : p.mode);

export function peerOf(f: SanFabric, s: string, p: string): [string, string] | undefined {
  for (const [a, b] of f.links) {
    if (a[0] === s && a[1] === p) return b;
    if (b[0] === s && b[1] === p) return a;
  }
  return undefined;
}

export function evaluate(f: SanFabric): SanResult {
  const sw = (id: string) => f.switches.find((s) => s.id === id)!;
  const port = (s: string, p: string) => sw(s).ports.find((x) => x.name === p);

  // ISLs between switches with E ports at both ends.
  const isls: IslState[] = [];
  for (const [a, b] of f.links) {
    const sa = f.switches.find((s) => s.id === a[0]);
    const sb = f.switches.find((s) => s.id === b[0]);
    if (!sa || !sb) continue;
    const pa = port(a[0], a[1])!;
    const pb = port(b[0], b[1])!;
    if (pa.mode !== "E" && pb.mode !== "E") continue;
    const st: IslState = { a, b, up: false, vsans: [], isolated: [] };
    if (pa.shutdown || pb.shutdown) st.why = "a port is shut down";
    else if (pa.mode !== "E" || pb.mode !== "E") st.why = `port modes don't match (${portKind(pa)} on ${a[0]}, ${portKind(pb)} on ${b[0]})`;
    else if (sa.npv || sb.npv) st.why = "an NPV switch can't form E port ISLs";
    else if (!!pa.trunk !== !!pb.trunk) st.why = "trunk mode is on at one end and off at the other";
    else if (!pa.trunk && pa.vsan !== pb.vsan) st.why = `port VSAN mismatch (${pa.vsan} vs ${pb.vsan}) on a non-trunking E port`;
    else {
      const ca = carries(pa);
      const cb = carries(pb);
      const cand = pa.trunk ? [...new Set([1, ...sa.vsans, ...sb.vsans])] : [pa.vsan];
      const common = cand.filter((v) => (!ca || ca.includes(v)) && (!cb || cb.includes(v)) && hasVsan(sa, v) && hasVsan(sb, v)).sort((x, y) => x - y);
      if (!common.length) st.why = "no VSAN is both allowed and created on the two ends";
      else {
        st.up = true;
        st.vsans = common;
      }
    }
    isls.push(st);
  }

  // Fabric components per VSAN; an ISL that would join two halves with a duplicate domain ID isolates that VSAN.
  const allVsans = [...new Set([1, ...f.switches.flatMap((s) => s.vsans)])].sort((x, y) => x - y);
  const components: SanResult["components"] = {};
  for (const v of allVsans) {
    const members = f.switches.filter((s) => !s.npv && hasVsan(s, v)).map((s) => s.id);
    const parent = new Map(members.map((m) => [m, m]));
    const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
    for (const l of isls) {
      if (!l.up || !l.vsans.includes(v)) continue;
      const [x, y] = [l.a[0], l.b[0]];
      if (!parent.has(x) || !parent.has(y)) continue;
      const rx = find(x);
      const ry = find(y);
      if (rx === ry) continue;
      const domsX = members.filter((m) => find(m) === rx).map((m) => sw(m).domain);
      const domsY = members.filter((m) => find(m) === ry).map((m) => sw(m).domain);
      if (domsX.some((d) => domsY.includes(d))) {
        l.isolated.push(v);
        continue;
      }
      parent.set(rx, ry);
    }
    const groups = new Map<string, string[]>();
    for (const m of members) groups.set(find(m), [...(groups.get(find(m)) ?? []), m]);
    components[v] = [...groups.values()];
  }
  const compOf = (v: number, s: string) => components[v]?.find((g) => g.includes(s));

  // Logins.
  const logins: Login[] = [];
  const perPort = new Map<string, number>();
  for (const d of f.devices) {
    const [sid, pname] = d.at;
    const s = sw(sid);
    const p = port(sid, pname);
    const fail = (why: string) => logins.push({ dev: d.id, ok: false, why });
    if (!p) {
      fail(`port ${pname} doesn't exist on ${sid}`);
      continue;
    }
    if (p.shutdown) {
      fail(`${sid} ${pname} is shut down`);
      continue;
    }
    if (p.mode !== "F") {
      fail(`${sid} ${pname} is in ${portKind(p)} mode; an end device needs an F port`);
      continue;
    }
    if (p.vsan === 4094) {
      fail(`${sid} ${pname} sits in the isolated VSAN 4094 (its VSAN was deleted), so the port stays down`);
      continue;
    }
    if (!hasVsan(s, p.vsan)) {
      fail(`${sid} ${pname} is assigned to VSAN ${p.vsan}, which isn't in ${sid}'s VSAN database, so the port is down (isolated)`);
      continue;
    }
    const ps = s.portSecurityFeature ? s.portSecurity?.find((x) => x.vsan === p.vsan && x.active) : undefined;
    if (ps && !ps.activeBindings.some((b) => lc(b.pwwn) === lc(d.pwwn) && b.iface === pname)) {
      fail(`port security in VSAN ${p.vsan} on ${sid} rejected the FLOGI from ${d.pwwn}: no active binding for it on ${pname}`);
      continue;
    }
    let loginSw = sid;
    let loginPort = pname;
    let via: string | undefined;
    if (s.npv) {
      // NPV: the device's FLOGI is relayed as an FDISC over an NP uplink in the same VSAN.
      const uplink = s.ports.find((u) => u.mode === "NP" && !u.shutdown && u.vsan === p.vsan && peerOf(f, sid, u.name));
      if (!uplink) {
        fail(`${sid} is in NPV mode but has no working NP uplink in VSAN ${p.vsan}`);
        continue;
      }
      const [csid, cport] = peerOf(f, sid, uplink.name)!;
      const core = sw(csid);
      const cp = port(csid, cport)!;
      if (cp.shutdown || cp.mode !== "F" || cp.vsan !== p.vsan || !hasVsan(core, p.vsan)) {
        fail(`the NP uplink ${uplink.name} lands on ${csid} ${cport}, which must be an F port in VSAN ${p.vsan} (it is ${cp.shutdown ? "shut down" : `${portKind(cp)} in VSAN ${cp.vsan}`})`);
        continue;
      }
      if (!core.npiv) {
        fail(`${csid} doesn't have NPIV enabled, so it rejects the FDISC that ${sid} relays for this device on ${cport}`);
        continue;
      }
      loginSw = csid;
      loginPort = cport;
      via = `${sid} ${uplink.name}`;
    }
    const ls = sw(loginSw);
    const key = `${loginSw}|${loginPort}`;
    const n = perPort.get(key) ?? 0;
    perPort.set(key, n + 1);
    const idx = Math.max(0, ls.ports.findIndex((x) => x.name === loginPort));
    const fcid = `0x${hex2(ls.domain)}${hex2(idx)}${hex2(via ? n + 1 : 0)}`;
    logins.push({ dev: d.id, ok: true, sw: loginSw, port: loginPort, vsan: p.vsan, fcid, via });
  }

  // Visibility: every HBA against every array LUN.
  const visibility: Visibility[] = [];
  const loginOf = (id: string) => logins.find((l) => l.dev === id)!;
  const shareZone = (zones: Zone[], x: string, y: string) => zones.find((z) => z.members.some((m) => resolveMember(f, m) === lc(x)) && z.members.some((m) => resolveMember(f, m) === lc(y)));
  for (const h of f.devices.filter((d) => d.kind === "hba")) {
    for (const a of f.devices.filter((d) => d.kind === "array")) {
      for (const l of f.luns[a.id] ?? []) {
        const lh = loginOf(h.id);
        const la = loginOf(a.id);
        const v = (ok: boolean, why: string) => visibility.push({ hba: h.id, array: a.id, lun: l.lun, ok, why });
        if (!lh.ok) {
          v(false, `${h.label} isn't logged in: ${lh.why}`);
          continue;
        }
        if (!la.ok) {
          v(false, `${a.label} isn't logged in: ${la.why}`);
          continue;
        }
        if (lh.vsan !== la.vsan) {
          v(false, `${h.label} is in VSAN ${lh.vsan} and ${a.label} in VSAN ${la.vsan}. Devices only see each other inside one VSAN`);
          continue;
        }
        if (compOf(lh.vsan!, lh.sw!) !== compOf(la.vsan!, la.sw!)) {
          const iso = isls.find((i) => i.isolated.includes(lh.vsan!));
          v(false, iso ? `VSAN ${lh.vsan} is isolated on the ISL ${iso.a.join(" ")} ↔ ${iso.b.join(" ")}: both sides use domain ID ${sw(iso.a[0]).domain}, so the fabrics can't merge` : `${h.label} and ${a.label} are both in VSAN ${lh.vsan}, but no ISL carries VSAN ${lh.vsan} between ${lh.sw} and ${la.sw}`);
          continue;
        }
        const z = zoningFor(f, lh.vsan!);
        if (z.active) {
          if (!shareZone(z.active.zones, h.pwwn, a.pwwn)) {
            const pending = shareZone(z.zones, h.pwwn, a.pwwn);
            const unresolved = z.active.zones.flatMap((zz) => zz.members).find((m) => !resolveMember(f, m));
            const inSet = z.active.zones.some((zz) => zz.name === pending?.name);
            v(
              false,
              pending
                ? inSet
                  ? `zone ${pending.name} now pairs them, but the active copy predates that edit. Activate zoneset ${z.active.name} again`
                  : `zone ${pending.name} pairs them, but it isn't in the active zoneset ${z.active.name}. Add it to the zoneset and activate again`
                : unresolved
                  ? `no active zone pairs them; device-alias ${unresolved} in the active zoneset doesn't resolve to a pWWN in the committed alias database`
                  : `no zone in the active zoneset ${z.active.name} contains both ${h.label} and ${a.label}`,
            );
            continue;
          }
        } else if (z.defaultZone === "deny") {
          v(false, `VSAN ${lh.vsan} has no active zoneset and the default zone denies, so nothing can talk`);
          continue;
        }
        if (!l.initiators.map(lc).includes(lc(h.pwwn))) {
          v(false, `the fabric connects them, but ${a.label}'s LUN masking doesn't present LUN ${l.lun} to ${h.pwwn}`);
          continue;
        }
        v(true, `${h.label} sees LUN ${l.lun} on ${a.label} in VSAN ${lh.vsan}${z.active ? ` (zoned by ${z.active.name})` : " (default zone permit)"}`);
      }
    }
  }
  return { logins, isls, components, visibility };
}

export type SanGoal =
  | { type: "sees"; hba: string; array: string; lun: number; label: string }
  | { type: "isolated"; hba: string; array: string; label: string }
  | { type: "defaultDeny"; vsan: number; label: string }
  | { type: "noPending"; label: string }
  | { type: "portSecurity"; sw: string; vsan: number; label: string };

export type SanGoalResult = { goal: SanGoal; ok: boolean; detail: string };

export function gradeSan(f: SanFabric, goals: SanGoal[]): SanGoalResult[] {
  const r = evaluate(f);
  return goals.map((goal) => {
    if (goal.type === "sees") {
      const v = r.visibility.find((x) => x.hba === goal.hba && x.array === goal.array && x.lun === goal.lun);
      return { goal, ok: !!v?.ok, detail: v?.why ?? "no such LUN" };
    }
    if (goal.type === "isolated") {
      const seen = r.visibility.filter((x) => x.hba === goal.hba && x.array === goal.array && x.ok);
      return { goal, ok: !seen.length, detail: seen.length ? seen[0].why : "the fabric keeps them apart" };
    }
    if (goal.type === "noPending") return { goal, ok: !f.aliasPending, detail: f.aliasPending ? "device-alias changes are still pending: run device-alias commit" : "no uncommitted device-alias changes" };
    if (goal.type === "portSecurity") {
      const s = f.switches.find((x) => x.id === goal.sw)!;
      const ps = s.portSecurityFeature ? s.portSecurity?.find((x) => x.vsan === goal.vsan && x.active) : undefined;
      return { goal, ok: !!ps, detail: ps ? `port security is active in VSAN ${goal.vsan} with ${ps.activeBindings.length} binding(s)` : `port security isn't active in VSAN ${goal.vsan} on ${goal.sw}` };
    }
    const z = zoningFor(f, goal.vsan);
    return { goal, ok: z.defaultZone === "deny", detail: `the default zone in VSAN ${goal.vsan} is ${z.defaultZone}` };
  });
}

export type SanScenario = {
  id: string;
  title: string;
  exam: "dccor";
  objective: string;
  brief: string;
  /** Ticket-style symptoms shown above the console. */
  symptoms: string[];
  hint?: string;
  debrief?: string;
  fabric: SanFabric;
  /** Diagram positions (0–100 grid) for switches and devices. */
  pos: Record<string, [number, number]>;
  goals: SanGoal[];
  /** Reference fix as CLI lines per switch; the validator replays it. */
  solution: { sw: string; lines: string[] }[];
};
