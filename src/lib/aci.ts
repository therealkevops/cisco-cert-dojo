// ACI Policy Lab: a model of the APIC object tree for DCCOR 1.4 (access policies) and 5.1 (contracts).
// Access policies: VLAN pool → physical domain → AAEP → interface policy group → interface profile
// (port selector) → switch profile (leaf). Tenant: VRF, bridge domains, EPGs with static path bindings,
// filters and contracts. `evaluate` raises APIC-style faults for path bindings, learns the scenario's
// endpoints into EPGs, and `reach` answers whether one endpoint can open a session to another and why.
// Several fields are free text the way APIC forms are (VLAN blocks, port ranges, subnets, paths,
// filter entries); they're parsed here, and a parse error becomes a fault.

export type Pool = { name: string; mode: "static" | "dynamic"; blocks: string };
export type Domain = { name: string; pool: string };
export type Aaep = { name: string; domains: string[] };
export type PolicyGroup = { name: string; aaep: string };
export type IntProfile = { name: string; ports: string; policyGroup: string };
export type SwitchProfile = { name: string; leaves: string; intProfiles: string[] };
export type Vrf = { name: string; enforced: boolean };
export type Bd = { name: string; vrf: string; subnets: string; routing: boolean };
export type Epg = { name: string; ap: string; bd: string; domains: string[]; paths: string; provides: string[]; consumes: string[] };
export type Filter = { name: string; entries: string };
export type Contract = { name: string; scope: "vrf" | "application-profile" | "tenant" | "global"; filters: string[]; both: boolean; reverse: boolean };

export type AciModel = {
  tenant: string;
  pools: Pool[];
  domains: Domain[];
  aaeps: Aaep[];
  policyGroups: PolicyGroup[];
  intProfiles: IntProfile[];
  switchProfiles: SwitchProfile[];
  vrfs: Vrf[];
  bds: Bd[];
  epgs: Epg[];
  filters: Filter[];
  contracts: Contract[];
};

export type Endpoint = { name: string; ip: string; leaf: number; port: string; vlan: number };

export type Fault = { code?: string; severity: "critical" | "major" | "minor" | "warning"; dn: string; text: string };
export type Binding = { epg: string; leaf: number; port: string; vlan: number; ok: boolean };
export type Learned = { ep: string; epg?: string; ipLearned: boolean; why: string };
export type AciResult = { faults: Fault[]; bindings: Binding[]; learned: Learned[] };

export type Proto = "tcp" | "udp" | "icmp";
export type Flow = { from: string; to: string; proto: Proto; port?: number };
export type Verdict = { ok: boolean; why: string };

// ---------- parsing ----------
type R<T> = { ok: true; v: T } | { ok: false; err: string };
const split = (s: string) => s.split(/[,\n;]+/).map((x) => x.trim()).filter(Boolean);

export function parseRanges(s: string, lo: number, hi: number, what: string): R<[number, number][]> {
  const out: [number, number][] = [];
  for (const part of split(s)) {
    const m = /^(?:vlan-)?(\d+)(?:\s*-\s*(?:vlan-)?(\d+))?$/i.exec(part);
    if (!m) return { ok: false, err: `"${part}" isn't a ${what} or range` };
    const a = +m[1];
    const b = m[2] ? +m[2] : a;
    if (a < lo || b > hi || b < a) return { ok: false, err: `${what} range ${part} is outside ${lo}-${hi}` };
    out.push([a, b]);
  }
  return { ok: true, v: out };
}

/** "1/10-12, 1/14" → eth1/10, eth1/11, eth1/12, eth1/14 */
export function parsePorts(s: string): R<string[]> {
  const out: string[] = [];
  for (const part of split(s)) {
    const m = /^(?:eth)?(\d+)\/(\d+)(?:\s*-\s*(\d+))?$/i.exec(part);
    if (!m) return { ok: false, err: `"${part}" isn't a port or range like 1/10-12` };
    const a = +m[2];
    const b = m[3] ? +m[3] : a;
    if (b < a || b > 64) return { ok: false, err: `port range ${part} is invalid` };
    for (let p = a; p <= b; p++) out.push(`eth${m[1]}/${p}`);
  }
  return { ok: true, v: out };
}

/** "101 eth1/10 vlan-100" lines */
export function parsePaths(s: string): R<{ leaf: number; port: string; vlan: number }[]> {
  const out: { leaf: number; port: string; vlan: number }[] = [];
  for (const part of split(s)) {
    const m = /^(?:node-|leaf-?)?(\d{3,4})\s+(?:eth)?(\d+\/\d+)\s+vlan-?(\d+)$/i.exec(part);
    if (!m) return { ok: false, err: `"${part}" isn't a path like 101 eth1/10 vlan-100` };
    if (+m[3] < 1 || +m[3] > 4094) return { ok: false, err: `vlan-${m[3]} is out of range` };
    out.push({ leaf: +m[1], port: `eth${m[2]}`, vlan: +m[3] });
  }
  return { ok: true, v: out };
}

const ip2n = (ip: string) => ip.split(".").reduce((a, o) => a * 256 + +o, 0);
const IP_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function parseSubnets(s: string): R<{ gw: string; len: number }[]> {
  const out: { gw: string; len: number }[] = [];
  for (const part of split(s)) {
    const m = /^([\d.]+)\/(\d+)$/.exec(part);
    if (!m || !IP_RE.test(m[1]) || m[1].split(".").some((o) => +o > 255) || +m[2] < 1 || +m[2] > 32) return { ok: false, err: `"${part}" isn't a gateway address like 10.1.1.1/24` };
    out.push({ gw: m[1], len: +m[2] });
  }
  return { ok: true, v: out };
}

const inSubnet = (ip: string, sn: { gw: string; len: number }) => {
  const mask = sn.len === 0 ? 0 : (0xffffffff << (32 - sn.len)) >>> 0;
  return ((ip2n(ip) & mask) >>> 0) === ((ip2n(sn.gw) & mask) >>> 0);
};

export type Entry = { proto: "ip" | Proto; from?: number; to?: number };
export function parseEntries(s: string): R<Entry[]> {
  const out: Entry[] = [];
  for (const part of split(s)) {
    const m = /^(ip|tcp|udp|icmp)(?:\s+(\d+)(?:\s*-\s*(\d+))?)?$/i.exec(part);
    if (!m) return { ok: false, err: `"${part}" isn't an entry like tcp 443, udp 161-162, icmp or ip` };
    const proto = m[1].toLowerCase() as Entry["proto"];
    if (m[2] && (proto === "ip" || proto === "icmp")) return { ok: false, err: `${proto} entries take no port (${part})` };
    const a = m[2] ? +m[2] : undefined;
    const b = m[3] ? +m[3] : a;
    if (a !== undefined && (a < 1 || b! > 65535 || b! < a)) return { ok: false, err: `port range in "${part}" is invalid` };
    out.push({ proto, from: a, to: b });
  }
  return { ok: true, v: out };
}

const entryMatches = (e: Entry, f: Flow) => e.proto === "ip" || (e.proto === f.proto && (e.from === undefined || (f.port !== undefined && f.port >= e.from && f.port <= e.to!)));
export const flowText = (f: Pick<Flow, "proto" | "port">) => (f.port !== undefined ? `${f.proto}/${f.port}` : f.proto);

// ---------- evaluation ----------
const dnEpg = (m: AciModel, e: Epg) => `uni/tn-${m.tenant}/ap-${e.ap}/epg-${e.name}`;

export function evaluate(m: AciModel, endpoints: Endpoint[]): AciResult {
  const faults: Fault[] = [];
  const bindings: Binding[] = [];

  // Access policies: what each leaf port is allowed to carry (domains via the AAEP).
  const portDomains = new Map<string, Set<string>>(); // "101|eth1/10" → domains
  for (const sp of m.switchProfiles) {
    const leaves = parseRanges(sp.leaves, 101, 4000, "node ID");
    if (!leaves.ok) {
      faults.push({ severity: "minor", dn: `uni/infra/nprof-${sp.name}`, text: `Leaf selector: ${leaves.err}` });
      continue;
    }
    for (const ipn of sp.intProfiles) {
      const ip = m.intProfiles.find((x) => x.name === ipn);
      if (!ip) {
        faults.push({ severity: "minor", dn: `uni/infra/nprof-${sp.name}`, text: `Interface profile ${ipn} not found` });
        continue;
      }
      const ports = parsePorts(ip.ports);
      if (!ports.ok) {
        faults.push({ severity: "minor", dn: `uni/infra/accportprof-${ip.name}`, text: `Port selector: ${ports.err}` });
        continue;
      }
      const pg = m.policyGroups.find((x) => x.name === ip.policyGroup);
      const aaep = pg && m.aaeps.find((x) => x.name === pg.aaep);
      if (!pg) faults.push({ severity: "minor", dn: `uni/infra/accportprof-${ip.name}`, text: `Port selector points to policy group ${ip.policyGroup || "(none)"}, which doesn't exist` });
      else if (!aaep) faults.push({ severity: "minor", dn: `uni/infra/funcprof/accportgrp-${pg.name}`, text: `Policy group has no attachable entity profile (AAEP)` });
      const doms = new Set(aaep?.domains ?? []);
      for (const [a, b] of leaves.v) for (let leaf = a; leaf <= b; leaf++) for (const p of ports.v) portDomains.set(`${leaf}|${p}`, new Set([...(portDomains.get(`${leaf}|${p}`) ?? []), ...doms]));
    }
  }
  const poolOf = (dom: string) => {
    const d = m.domains.find((x) => x.name === dom);
    const p = d && m.pools.find((x) => x.name === d.pool);
    const r = p ? parseRanges(p.blocks, 1, 4094, "VLAN") : undefined;
    return { d, p, ranges: r?.ok ? r.v : [] };
  };
  for (const p of m.pools) {
    const r = parseRanges(p.blocks, 1, 4094, "VLAN");
    if (!r.ok) faults.push({ severity: "minor", dn: `uni/infra/vlanns-[${p.name}]-${p.mode}`, text: `Encap block: ${r.err}` });
  }
  for (const d of m.domains) if (!m.pools.some((p) => p.name === d.pool)) faults.push({ severity: "minor", dn: `uni/phys-${d.name}`, text: `Domain has no VLAN pool` });

  // Tenant objects.
  for (const b of m.bds) {
    if (!m.vrfs.some((v) => v.name === b.vrf)) faults.push({ severity: "warning", dn: `uni/tn-${m.tenant}/BD-${b.name}`, text: `Bridge domain isn't associated with a VRF; its EPGs can't be deployed` });
    const s = parseSubnets(b.subnets);
    if (!s.ok) faults.push({ severity: "minor", dn: `uni/tn-${m.tenant}/BD-${b.name}`, text: `Subnet: ${s.err}` });
  }
  for (const f of m.filters) {
    const r = parseEntries(f.entries);
    if (!r.ok) faults.push({ severity: "minor", dn: `uni/tn-${m.tenant}/flt-${f.name}`, text: `Filter entry: ${r.err}` });
  }
  for (const c of m.contracts) for (const fn of c.filters) if (!m.filters.some((x) => x.name === fn)) faults.push({ severity: "minor", dn: `uni/tn-${m.tenant}/brc-${c.name}`, text: `Subject references filter ${fn}, which doesn't exist` });

  const usedEncap = new Map<string, string>(); // "leaf|vlan" → epg
  for (const e of m.epgs) {
    const dn = dnEpg(m, e);
    const bd = m.bds.find((b) => b.name === e.bd);
    for (const c of [...e.provides, ...e.consumes]) if (!m.contracts.some((x) => x.name === c)) faults.push({ severity: "minor", dn, text: `Contract ${c} not found` });
    const paths = parsePaths(e.paths);
    if (!paths.ok) {
      faults.push({ severity: "minor", dn, text: `Static port: ${paths.err}` });
      continue;
    }
    for (const p of paths.v) {
      const where = `node ${p.leaf} ${p.port} vlan-${p.vlan}`;
      const fail = (reason: string, debug: string) => {
        faults.push({ code: "F0467", severity: "minor", dn, text: `Configuration failed for ${where} due to ${reason}, debug message: ${debug}` });
        bindings.push({ epg: e.name, ...p, ok: false });
      };
      if (!bd || !m.vrfs.some((v) => v.name === bd.vrf)) {
        faults.push({ severity: "warning", dn, text: `EPG isn't deployed on ${where}: ${bd ? `bridge domain ${bd.name} has no VRF` : "the EPG has no bridge domain"}` });
        bindings.push({ epg: e.name, ...p, ok: false });
        continue;
      }
      const vlanDoms = e.domains.filter((d) => poolOf(d).ranges.some(([a, b]) => p.vlan >= a && p.vlan <= b));
      if (!vlanDoms.length) {
        fail("Invalid VLAN Configuration", `invalid-vlan: vlan-${p.vlan} :: Either the EpG is not associated with a domain or the domain does not have this vlan assigned to it`);
        continue;
      }
      const pd = portDomains.get(`${p.leaf}|${p.port}`);
      if (!pd || !vlanDoms.some((d) => pd.has(d))) {
        fail("Invalid Path Configuration", `invalid-path: Either the EpG is not associated with a domain or the domain does not have this interface assigned to it`);
        continue;
      }
      const key = `${p.leaf}|${p.vlan}`;
      const holder = usedEncap.get(key);
      if (holder && holder !== e.name) {
        const h = m.epgs.find((x) => x.name === holder)!;
        fail("Encap Already Used in Another EPG", `encap-already-in-use: Encap (vlan-${p.vlan}) is already in use by ${m.tenant}:${h.ap}:${h.name}`);
        continue;
      }
      usedEncap.set(key, e.name);
      bindings.push({ epg: e.name, ...p, ok: true });
    }
  }

  // Endpoint learning.
  const learned: Learned[] = endpoints.map((ep) => {
    const b = bindings.find((x) => x.ok && x.leaf === ep.leaf && x.port === ep.port && x.vlan === ep.vlan);
    if (!b) {
      const bad = bindings.find((x) => x.leaf === ep.leaf && x.port === ep.port && x.vlan === ep.vlan);
      return { ep: ep.name, ipLearned: false, why: bad ? `EPG ${bad.epg} has a binding for node ${ep.leaf} ${ep.port} vlan-${ep.vlan}, but it failed (see faults)` : `no EPG is deployed on node ${ep.leaf} ${ep.port} with vlan-${ep.vlan}, so the leaf drops its frames` };
    }
    const epg = m.epgs.find((x) => x.name === b.epg)!;
    const bd = m.bds.find((x) => x.name === epg.bd)!;
    const sn = parseSubnets(bd.subnets);
    const inSn = sn.ok && sn.v.some((s) => inSubnet(ep.ip, s));
    const ipLearned = bd.routing && inSn;
    return {
      ep: ep.name,
      epg: epg.name,
      ipLearned,
      why: ipLearned ? `learned in EPG ${epg.name} with IP ${ep.ip}` : `learned in EPG ${epg.name} by MAC only: ${bd.routing ? `${ep.ip} isn't inside a subnet of BD ${bd.name}` : `unicast routing is off on BD ${bd.name}`}`,
    };
  });

  return { faults, bindings, learned };
}

export function reach(m: AciModel, endpoints: Endpoint[], f: Flow, r: AciResult = evaluate(m, endpoints)): Verdict {
  const ls = r.learned.find((x) => x.ep === f.from);
  const ld = r.learned.find((x) => x.ep === f.to);
  if (!ls?.epg) return { ok: false, why: `${f.from} isn't learned: ${ls?.why}` };
  if (!ld?.epg) return { ok: false, why: `${f.to} isn't learned: ${ld?.why}` };
  const es = m.epgs.find((x) => x.name === ls.epg)!;
  const ed = m.epgs.find((x) => x.name === ld.epg)!;
  const bs = m.bds.find((x) => x.name === es.bd)!;
  const bdd = m.bds.find((x) => x.name === ed.bd)!;
  if (bs.vrf !== bdd.vrf) return { ok: false, why: `${es.name} is in VRF ${bs.vrf} and ${ed.name} in VRF ${bdd.vrf}; there's no route leaking between them here` };
  if (bs.name !== bdd.name) {
    if (!ls.ipLearned) return { ok: false, why: `${es.name} and ${ed.name} are in different BDs, so this traffic is routed, but ${f.from} is ${ls.why.replace(/^learned in EPG \S+ /, "learned ")}` };
    if (!ld.ipLearned) return { ok: false, why: `${es.name} and ${ed.name} are in different BDs, so this traffic is routed, but ${f.to} is ${ld.why.replace(/^learned in EPG \S+ /, "learned ")}` };
  }
  const via = bs.name === bdd.name ? `bridged in BD ${bs.name}` : `routed in VRF ${bs.vrf}`;
  if (es.name === ed.name) return { ok: true, why: `same EPG (${es.name}): intra-EPG traffic is permitted by default` };
  const vrf = m.vrfs.find((v) => v.name === bs.vrf)!;
  if (!vrf.enforced) return { ok: true, why: `VRF ${vrf.name} is unenforced, so every EPG can talk to every other (${via})` };

  const matchC = (c: Contract) => {
    const entries = c.filters.flatMap((fn) => {
      const flt = m.filters.find((x) => x.name === fn);
      const p = flt ? parseEntries(flt.entries) : undefined;
      return p?.ok ? p.v : [];
    });
    return entries.some((e) => entryMatches(e, f));
  };
  const inScope = (c: Contract) => c.scope !== "application-profile" || es.ap === ed.ap;
  const notes: string[] = [];
  for (const c of m.contracts) {
    const fwd = es.consumes.includes(c.name) && ed.provides.includes(c.name);
    const rev = es.provides.includes(c.name) && ed.consumes.includes(c.name);
    if (!fwd && !rev) continue;
    if (!inScope(c)) {
      notes.push(`contract ${c.name} has application-profile scope and the EPGs are in different application profiles (${es.ap}, ${ed.ap})`);
      continue;
    }
    if (!matchC(c)) {
      notes.push(`contract ${c.name} is between them, but its filters don't match ${flowText(f)}`);
      continue;
    }
    if (fwd) {
      if (!c.both) {
        notes.push(`contract ${c.name} matches, but "apply both directions" is off, so the replies from ${ed.name} back to ${es.name} are dropped`);
        continue;
      }
      return { ok: true, why: `${es.name} consumes and ${ed.name} provides contract ${c.name}, which permits ${flowText(f)} (${via})` };
    }
    if (c.both && !c.reverse) return { ok: true, why: `${es.name} provides contract ${c.name}; with both directions on and reverse filter ports off, its filter also applies provider → consumer (${via})` };
    notes.push(`${es.name} provides contract ${c.name} and ${ed.name} consumes it: the consumer opens sessions to the provider, not the other way round${c.both ? " (reverse filter ports only lets the replies back)" : ""}`);
  }
  return { ok: false, why: `implicit deny in enforced VRF ${vrf.name}: ${notes.length ? notes.join("; ") : `no contract between ${es.name} and ${ed.name}`}` };
}

export type AciGoal =
  | ({ type: "reach"; label: string } & Flow)
  | ({ type: "blocked"; label: string } & Flow)
  | { type: "learned"; ep: string; epg: string; label: string }
  | { type: "noFaults"; label: string }
  | { type: "enforced"; vrf: string; label: string };

export type AciGoalResult = { goal: AciGoal; ok: boolean; detail: string };

export function gradeAci(m: AciModel, endpoints: Endpoint[], goals: AciGoal[]): AciGoalResult[] {
  const r = evaluate(m, endpoints);
  return goals.map((goal) => {
    if (goal.type === "reach" || goal.type === "blocked") {
      const v = reach(m, endpoints, goal, r);
      return { goal, ok: goal.type === "reach" ? v.ok : !v.ok, detail: v.why };
    }
    if (goal.type === "learned") {
      const l = r.learned.find((x) => x.ep === goal.ep)!;
      return { goal, ok: l.epg === goal.epg, detail: l.why };
    }
    if (goal.type === "enforced") {
      const v = m.vrfs.find((x) => x.name === goal.vrf);
      return { goal, ok: !!v?.enforced, detail: `VRF ${goal.vrf} is ${v?.enforced ? "enforced" : "unenforced"}` };
    }
    return { goal, ok: !r.faults.length, detail: r.faults.length ? `${r.faults.length} fault(s) raised: ${r.faults[0].text}` : "no faults" };
  });
}

export type AciScenario = {
  id: string;
  title: string;
  exam: "dccor";
  objective: string;
  brief: string;
  symptoms: string[];
  hint?: string;
  debrief?: string;
  model: AciModel;
  endpoints: Endpoint[];
  goals: AciGoal[];
  /** Reference fix as GUI steps (shown on request; the validator has its own code version). */
  solution: string[];
};
