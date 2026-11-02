// A small MDS NX-OS style CLI over the SAN Lab fabric. Commands are token patterns; keywords accept
// unique prefixes (an exact keyword wins over a longer one, so `show zone` isn't `show zoneset`),
// "?" lists what can come next and Tab completes a keyword. Config commands edit a copy of the fabric
// and hand it back; show commands read `evaluate`, so their output always matches the graded state.

import { carries, evaluate, hasVsan, peerOf, portKind, PWWN_RE, resolveMember, zoningFor, type SanFabric, type SanResult, type SanSwitch, type VsanZoning } from "./san";

export type SanMode =
  | { m: "exec" }
  | { m: "config" }
  | { m: "if"; ifs: string[] }
  | { m: "vsandb" }
  | { m: "zone"; name: string; vsan: number }
  | { m: "zoneset"; name: string; vsan: number }
  | { m: "alias" }
  | { m: "psdb"; vsan: number };

export type SanSession = { sw: string; mode: SanMode };
export type SanCliResult = { out: string; session: SanSession; fabric?: SanFabric };

const PROMPT_SUFFIX: Record<SanMode["m"], string> = {
  exec: "",
  config: "(config)",
  if: "(config-if)",
  vsandb: "(config-vsan-db)",
  zone: "(config-zone)",
  zoneset: "(config-zoneset)",
  alias: "(config-device-alias-db)",
  psdb: "(config-port-security)",
};

export const sanPrompt = (s: SanSession) => `${s.sw}${PROMPT_SUFFIX[s.mode.m]}# `;

type Ctx = {
  f: SanFabric;
  s: SanSession;
  sw: SanSwitch;
  /** Call before changing the fabric: switches to a private copy. */
  edit: () => SanFabric;
  r: () => SanResult;
  mode: (m: SanMode) => void;
};
type Cmd = { modes: SanMode["m"][] | "any"; pat: string; help: string; run: (c: Ctx, a: string[]) => string | void };

const SHOW = "any" as const;
const CFG: SanMode["m"][] = ["config", "if", "vsandb", "zone", "zoneset", "alias", "psdb"];

// ---------- helpers ----------
const line = (n = 80) => "-".repeat(n);
const pad = (s: string | number, n: number) => String(s).padEnd(n);
const nwwn = (p: string) => `20${p.slice(2)}`;
const swwn = (s: SanSwitch) => `20:00:00:de:fb:${(s.domain >> 4).toString(16)}${(s.domain & 15).toString(16)}:00:01`.replace(/:(\w)(?=:)/g, ":0$1");
const dom = (d: number) => `0x${d.toString(16).padStart(2, "0")}(${d})`;
const sortIf = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

function parseVsanList(raw: string): number[] | null {
  const out: number[] = [];
  for (const part of raw.split(",")) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) return null;
    const lo = +m[1];
    const hi = m[2] ? +m[2] : lo;
    if (lo < 1 || hi > 4094 || hi < lo) return null;
    for (let v = lo; v <= hi; v++) out.push(v);
  }
  return out;
}
function fmtList(vs: number[]): string {
  const s = [...new Set(vs)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(j > i ? `${s[i]}-${s[j]}` : `${s[i]}`);
    i = j;
  }
  return out.join(",");
}

function zoningRw(f: SanFabric, v: number): VsanZoning {
  return (f.zoning[String(v)] ??= { zones: [], zonesets: [], defaultZone: "deny" });
}

function aliasOf(f: SanFabric, pwwn: string) {
  return Object.entries(f.aliases).find(([, w]) => w.toLowerCase() === pwwn.toLowerCase())?.[0];
}

function portStatus(f: SanFabric, r: SanResult, sw: SanSwitch, name: string): { status: string; oper: string } {
  const p = sw.ports.find((x) => x.name === name)!;
  if (p.shutdown) return { status: "down", oper: "--" };
  if (p.vsan === 4094 || !hasVsan(sw, p.vsan)) return { status: "down", oper: "--" };
  const dev = f.devices.find((d) => d.at[0] === sw.id && d.at[1] === name);
  if (dev) {
    const l = r.logins.find((x) => x.dev === dev.id)!;
    if (l.ok) return { status: "up", oper: "F" };
    if (p.mode !== "F") return { status: "isolated", oper: "--" };
    return { status: l.why?.includes("port security") ? "down" : "up", oper: l.why?.includes("port security") ? "--" : "F" };
  }
  const peer = peerOf(f, sw.id, name);
  if (!peer) return { status: "notConnected", oper: "--" };
  const isl = r.isls.find((i) => (i.a[0] === sw.id && i.a[1] === name) || (i.b[0] === sw.id && i.b[1] === name));
  if (isl) return isl.up ? { status: p.trunk ? "trunking" : "up", oper: p.trunk ? "TE" : "E" } : { status: "isolated", oper: "--" };
  const peerSw = f.switches.find((s) => s.id === peer[0])!;
  const pp = peerSw.ports.find((x) => x.name === peer[1])!;
  const pair = [p.mode, pp.mode].sort().join("");
  if (pair === "FNP" && !p.shutdown && !pp.shutdown && p.vsan === pp.vsan) return { status: "up", oper: p.mode };
  return { status: "down", oper: "--" };
}

// ---------- show commands ----------
function showFlogi(c: Ctx, vsan?: number) {
  const r = c.r();
  const rows = r.logins.filter((l) => l.ok && l.sw === c.sw.id && (vsan === undefined || l.vsan === vsan));
  if (c.sw.npv) return "% This switch is in NPV mode: logins happen on the core switch. Use show npv flogi-table.";
  const body = rows
    .sort((a, b) => sortIf(a.port!, b.port!))
    .map((l) => {
      const d = c.f.devices.find((x) => x.id === l.dev)!;
      const al = aliasOf(c.f, d.pwwn);
      return `${pad(l.port!, 17)}${pad(l.vsan!, 8)}${pad(l.fcid!, 10)}${d.pwwn} ${nwwn(d.pwwn)}${al ? `\n${" ".repeat(35)}[${al}]` : ""}`;
    });
  return [line(), "INTERFACE        VSAN    FCID      PORT NAME               NODE NAME", line(), ...body, "", `Total number of flogi = ${rows.length}.`].join("\n");
}

function showFcns(c: Ctx, vsan?: number) {
  if (c.sw.npv) return "% This switch is in NPV mode and runs no name server.";
  const r = c.r();
  const vsans = vsan !== undefined ? [vsan] : [...new Set(r.logins.filter((l) => l.ok).map((l) => l.vsan!))].sort((a, b) => a - b);
  const out: string[] = [];
  for (const v of vsans) {
    const comp = r.components[v]?.find((g) => g.includes(c.sw.id));
    if (!comp) {
      out.push(`VSAN ${v} is not configured on this switch.`);
      continue;
    }
    const rows = r.logins.filter((l) => l.ok && l.vsan === v && comp.includes(l.sw!));
    out.push(`\nVSAN ${v}:`, line(74), "FCID        TYPE  PWWN                    (VENDOR)        FC4-TYPE:FEATURE", line(74));
    for (const l of rows.sort((a, b) => a.fcid!.localeCompare(b.fcid!))) {
      const d = c.f.devices.find((x) => x.id === l.dev)!;
      const al = aliasOf(c.f, d.pwwn);
      out.push(`${pad(l.fcid!, 12)}${pad("N", 6)}${d.pwwn} ${pad(d.kind === "hba" ? "(Emulex)" : "(NetApp)", 16)}scsi-fcp:${d.kind === "hba" ? "init" : "target"}`);
      if (al) out.push(`${" ".repeat(24)}[${al}]`);
    }
    out.push("", `Total number of entries = ${rows.length}`);
  }
  return out.join("\n").trim() || "No entries found.";
}

function showVsan(c: Ctx) {
  const ids = [1, ...c.sw.vsans].sort((a, b) => a - b);
  return ids
    .map((v) => {
      const up = c.sw.ports.some((p) => p.vsan === v && portStatus(c.f, c.r(), c.sw, p.name).oper !== "--");
      return `vsan ${v} information\n         name:${v === 1 ? "VSAN0001" : `VSAN${String(v).padStart(4, "0")}`}  state:active\n         interoperability mode:default\n         loadbalancing:src-id/dst-id/oxid\n         operational state:${up ? "up" : "down"}\n`;
    })
    .concat("vsan 4079:evfp_isolated_vsan\n\nvsan 4094:isolated_vsan\n")
    .join("\n");
}

function showVsanMembership(c: Ctx) {
  const ids = [...new Set([1, ...c.sw.vsans])].sort((a, b) => a - b);
  const out: string[] = [];
  const members = (v: number) => c.sw.ports.filter((p) => p.vsan === v && hasVsan(c.sw, v)).map((p) => p.name);
  for (const v of ids) out.push(`vsan ${v} interfaces:`, `    ${members(v).sort(sortIf).join("  ")}`, "");
  const iso = c.sw.ports.filter((p) => p.vsan === 4094 || !hasVsan(c.sw, p.vsan)).map((p) => p.name);
  out.push("vsan 4079(evfp_isolated_vsan) interfaces:", "", "vsan 4094(isolated_vsan) interfaces:", `    ${iso.sort(sortIf).join("  ")}`);
  return out.join("\n");
}

function zoneMembersText(c: Ctx, members: string[], active: boolean, vsan: number) {
  const r = c.r();
  return members.map((m) => {
    const isPwwn = PWWN_RE.test(m);
    const w = resolveMember(c.f, m);
    const d = w ? c.f.devices.find((x) => x.pwwn.toLowerCase() === w) : undefined;
    const l = d ? r.logins.find((x) => x.dev === d.id && x.ok && x.vsan === vsan) : undefined;
    const al = isPwwn ? (w ? aliasOf(c.f, w) : undefined) : m;
    if (!active) return `    ${isPwwn ? `pwwn ${m}` : `device-alias ${m}`}`;
    if (l) return `  * fcid ${l.fcid} [pwwn ${d!.pwwn}]${al ? ` [${al}]` : ""}`;
    return `    ${w ? `pwwn ${w}` : `device-alias ${m} (unresolved)`}${al && w ? ` [${al}]` : ""}`;
  });
}

function vsansWithZoning(c: Ctx, vsan?: number) {
  return vsan !== undefined ? [vsan] : [...new Set([1, ...c.sw.vsans])].sort((a, b) => a - b).filter((v) => c.f.zoning[String(v)]);
}

function showZonesetActive(c: Ctx, vsan?: number) {
  const out: string[] = [];
  for (const v of vsansWithZoning(c, vsan)) {
    const z = zoningFor(c.f, v);
    if (!z.active) {
      if (vsan !== undefined) out.push(`Zoneset not present`);
      continue;
    }
    out.push(`zoneset name ${z.active.name} vsan ${v}`);
    for (const zz of z.active.zones) out.push(`  zone name ${zz.name} vsan ${v}`, ...zoneMembersText(c, zz.members, true, v).map((x) => `  ${x}`), "");
  }
  return out.join("\n").trim() || "Zoneset not present";
}

function showZoneset(c: Ctx, vsan?: number) {
  const out: string[] = [];
  for (const v of vsansWithZoning(c, vsan)) {
    const z = zoningFor(c.f, v);
    for (const zs of z.zonesets) {
      out.push(`zoneset name ${zs.name} vsan ${v}`);
      for (const zn of zs.zones) {
        const zz = z.zones.find((x) => x.name === zn);
        out.push(`  zone name ${zn} vsan ${v}`, ...(zz ? zoneMembersText(c, zz.members, false, v).map((x) => `  ${x}`) : []), "");
      }
    }
  }
  return out.join("\n").trim() || "Zoneset not present";
}

function showZone(c: Ctx, vsan?: number) {
  const out: string[] = [];
  for (const v of vsansWithZoning(c, vsan)) for (const zz of zoningFor(c.f, v).zones) out.push(`zone name ${zz.name} vsan ${v}`, ...zoneMembersText(c, zz.members, false, v), "");
  return out.join("\n").trim() || "Zone not present";
}

function showZoneStatus(c: Ctx, vsan: number) {
  if (!hasVsan(c.sw, vsan)) return `% VSAN ${vsan} is not configured`;
  const z = zoningFor(c.f, vsan);
  return [
    `VSAN: ${vsan} default-zone: ${z.defaultZone} distribute: full Interop: default`,
    "    mode: basic merge-control: allow",
    "    session: none",
    "    hard-zoning: enabled broadcast: unsupported",
    "    smart-zoning: disabled",
    "Default zone:",
    `    qos: none broadcast: unsupported ronly: unsupported`,
    "Full Zoning Database :",
    `    DB size: ${120 + z.zones.length * 64} bytes`,
    `    Zonesets:${z.zonesets.length}  Zones:${z.zones.length} Aliases: 0`,
    "Active Zoning Database :",
    z.active ? `    DB Size: ${80 + z.active.zones.length * 48} bytes\n    Name: ${z.active.name}  Zonesets:1  Zones:${z.active.zones.length}` : "    Database Not Available",
    `Status: ${z.active ? "Activation completed" : "-"}`,
  ].join("\n");
}

function showAliases(c: Ctx, pending: boolean) {
  const db = pending ? c.f.aliasPending : c.f.aliases;
  if (pending && !db) return "There are no pending changes";
  const rows = Object.entries(db!).sort(([a], [b]) => a.localeCompare(b));
  return [...rows.map(([n, w]) => `device-alias name ${n} pwwn ${w}`), "", `Total number of entries = ${rows.length}`].join("\n");
}

function showIntBrief(c: Ctx) {
  const r = c.r();
  const head = [line(79), "Interface  Vsan   Admin  Admin   Status          SFP    Oper  Oper   Port", "                  Mode   Trunk                          Mode  Speed  Channel", "                         Mode                                 (Gbps)", line(79)];
  const rows = [...c.sw.ports].sort((a, b) => sortIf(a.name, b.name)).map((p) => {
    const st = portStatus(c.f, r, c.sw, p.name);
    const vs = p.vsan === 4094 || !hasVsan(c.sw, p.vsan) ? 4094 : p.vsan;
    return `${pad(p.name, 11)}${pad(vs, 7)}${pad(p.mode, 7)}${pad(p.mode === "E" ? (p.trunk ? "on" : "off") : p.mode === "NP" ? "off" : "off", 8)}${pad(st.status, 16)}${pad("swl", 7)}${pad(st.oper, 6)}${pad(st.oper === "--" ? "--" : "32", 7)}--`;
  });
  return [...head, ...rows].join("\n");
}

function showInterface(c: Ctx, name: string) {
  const p = c.sw.ports.find((x) => x.name === name);
  if (!p) return `% Invalid interface: ${name}`;
  const r = c.r();
  const st = portStatus(c.f, r, c.sw, p.name);
  const out = [`${p.name} is ${st.status}`, `    Port description is ${c.f.devices.find((d) => d.at[0] === c.sw.id && d.at[1] === p.name)?.label ?? (peerOf(c.f, c.sw.id, p.name) ?? []).join(" ")}`, `    Hardware is Fibre Channel, SFP is short wave laser w/o OFC (SN)`, `    Port WWN is 20:${(c.sw.ports.indexOf(p) + 1).toString(16).padStart(2, "0")}:00:de:fb:00:00:${c.sw.domain.toString(16).padStart(2, "0")}`, `    Admin port mode is ${p.mode}, trunk mode is ${p.mode === "E" && p.trunk ? "on" : "off"}`, `    Port mode is ${st.oper}`, `    Port vsan is ${p.vsan === 4094 || !hasVsan(c.sw, p.vsan) ? 4094 : p.vsan}`];
  if (p.mode === "E" && p.trunk) {
    const isl = r.isls.find((i) => (i.a[0] === c.sw.id && i.a[1] === p.name) || (i.b[0] === c.sw.id && i.b[1] === p.name));
    const allowed = carries(p);
    out.push(`    Trunk vsans (admin allowed and active) (${fmtList((allowed ?? [1, ...c.sw.vsans]).filter((v) => hasVsan(c.sw, v)))})`);
    out.push(`    Trunk vsans (up)                       (${fmtList((isl?.vsans ?? []).filter((v) => !isl?.isolated.includes(v)))})`);
    out.push(`    Trunk vsans (isolated)                 (${fmtList(isl?.isolated ?? [])})`);
    out.push(`    Trunk vsans (initializing)             ()`);
  }
  const isl = r.isls.find((i) => (i.a[0] === c.sw.id && i.a[1] === p.name) || (i.b[0] === c.sw.id && i.b[1] === p.name));
  if (isl && !isl.up && isl.why) out.push(`    Port isolated: ${isl.why}`);
  if (isl && isl.up && isl.isolated.length && !p.trunk) out.push(`    Port isolated: domain ID overlap with the peer (zone merge or domain conflict)`);
  out.push("    Speed is 32 Gbps", "    Receive data field Size is 2112");
  return out.join("\n");
}

function showNpvFlogi(c: Ctx) {
  if (!c.sw.npv) return "% NPV is not enabled on this switch";
  const r = c.r();
  const rows = c.f.devices.filter((d) => d.at[0] === c.sw.id).map((d) => ({ d, l: r.logins.find((x) => x.dev === d.id)! })).filter((x) => x.l.ok);
  return [line(), "SERVER                                                                  EXTERNAL", "INTERFACE VSAN FCID      PORT NAME               NODE NAME               INTERFACE", line(), ...rows.map(({ d, l }) => `${pad(d.at[1], 10)}${pad(l.vsan!, 5)}${pad(l.fcid!, 10)}${d.pwwn} ${nwwn(d.pwwn)} ${l.via!.split(" ")[1]}`), "", `Total number of flogi = ${rows.length}.`].join("\n");
}

function showNpvStatus(c: Ctx) {
  if (!c.sw.npv) return "% NPV is not enabled on this switch";
  const out = ["npiv is disabled", "", "disruptive load balancing is disabled", "", "External Interfaces:", "===================="];
  for (const u of c.sw.ports.filter((p) => p.mode === "NP")) {
    const peer = peerOf(c.f, c.sw.id, u.name);
    const core = peer && c.f.switches.find((s) => s.id === peer[0]);
    const cp = core?.ports.find((x) => x.name === peer![1]);
    const ok = !!cp && !u.shutdown && !cp.shutdown && cp.mode === "F" && cp.vsan === u.vsan;
    out.push(`  Interface: ${u.name}, VSAN: ${u.vsan}, FCID: ${ok ? `0x${core!.domain.toString(16).padStart(2, "0")}${core!.ports.indexOf(cp!).toString(16).padStart(2, "0")}00` : "0x000000"}, State: ${ok ? "Up" : "Failed (NPIV/F port mismatch or down)"}`);
  }
  out.push("", `  Number of External Interfaces: ${c.sw.ports.filter((p) => p.mode === "NP").length}`, "", "Server Interfaces:", "==================");
  for (const p of c.sw.ports.filter((x) => x.mode === "F")) out.push(`  Interface: ${p.name}, VSAN: ${p.vsan}, State: ${portStatus(c.f, c.r(), c.sw, p.name).status === "up" ? "Up" : "Down"}`);
  return out.join("\n");
}

function showPsDb(c: Ctx, active: boolean, vsan?: number) {
  if (!c.sw.portSecurityFeature) return "% port-security feature is not enabled";
  const rows = (c.sw.portSecurity ?? []).filter((x) => vsan === undefined || x.vsan === vsan).flatMap((x) => (active ? (x.active ? x.activeBindings : []) : x.bindings).map((b) => ({ v: x.vsan, b })));
  return ["VSAN    Logging-in Entity                    Logging-in Point        (Interface)", line(78), ...rows.map(({ v, b }) => `${pad(v, 8)}${b.pwwn}(pwwn)          ${swwn(c.sw)}  (${b.iface})`), `[Total ${rows.length} entries]`].join("\n");
}

function showPsStatus(c: Ctx) {
  if (!c.sw.portSecurityFeature) return "% port-security feature is not enabled";
  return ((c.sw.portSecurity ?? []).map((x) => `VSAN ${x.vsan}:${x.active ? "Activated" : "No Active database"}, Auto-learning is Off`).join("\n")) || "No VSANs have port security configured";
}

function showPsViolations(c: Ctx) {
  if (!c.sw.portSecurityFeature) return "% port-security feature is not enabled";
  const r = c.r();
  const bad = r.logins.filter((l) => !l.ok && l.why?.includes("port security") && c.f.devices.find((d) => d.id === l.dev)!.at[0] === c.sw.id);
  return ["VSAN Interface     Logging-in Entity                          Last-Time                [Repeat count]", line(100), ...bad.map((l) => {
    const d = c.f.devices.find((x) => x.id === l.dev)!;
    const p = c.sw.ports.find((x) => x.name === d.at[1])!;
    return `${pad(p.vsan, 5)}${pad(d.at[1], 14)}${d.pwwn}(pwwn)  Mon Nov  2 09:14:03 2026   [${17 + d.id.length}]`;
  }), `[Total ${bad.length} entries]`].join("\n");
}

function showDomainList(c: Ctx, vsan: number) {
  if (c.sw.npv) return "% This switch is in NPV mode";
  if (!hasVsan(c.sw, vsan)) return `% VSAN ${vsan} is not configured`;
  const comp = c.r().components[vsan]?.find((g) => g.includes(c.sw.id)) ?? [c.sw.id];
  const sws = comp.map((id) => c.f.switches.find((s) => s.id === id)!).sort((a, b) => a.domain - b.domain);
  return [`Number of domains: ${sws.length}`, "Domain ID              WWN", "---------    -----------------------", ...sws.map((s, i) => `${pad(dom(s.domain), 13)}${swwn(s)}${s.id === c.sw.id ? " [Local]" : ""}${i === 0 ? " [Principal]" : ""}`)].join("\n");
}

function showFcdomain(c: Ctx, vsan: number) {
  if (!hasVsan(c.sw, vsan)) return `% VSAN ${vsan} is not configured`;
  return [`The local switch is ${c.r().components[vsan]?.find((g) => g.includes(c.sw.id))?.length === 1 ? "the Principal Switch" : "a Subordinated Switch"}.`, "", `Local switch run time information:`, `        State: Stable`, `        Local switch WWN:    ${swwn(c.sw)}`, `        Running fabric name: ${swwn(c.sw)}`, `        Running priority: 128`, `        Current domain ID: ${dom(c.sw.domain)}`, "", "Local switch configuration information:", "        State: Enabled", "        FCID persistence: Enabled", "        Auto-reconfiguration: Disabled", "        Contiguous-allocation: Disabled", `        Configured domain ID: ${dom(c.sw.pendingDomain ?? c.sw.domain)} (static)`, ...(c.sw.pendingDomain !== undefined && c.sw.pendingDomain !== c.sw.domain ? ["", `Note: the configured domain ID differs from the running one until fcdomain restart.`] : [])].join("\n");
}

function showTopology(c: Ctx, vsan?: number) {
  const r = c.r();
  const vs = vsan !== undefined ? [vsan] : [1, ...c.sw.vsans];
  const out: string[] = [];
  for (const v of vs.sort((a, b) => a - b)) {
    const rows = r.isls.filter((i) => i.up && i.vsans.includes(v) && !i.isolated.includes(v) && (i.a[0] === c.sw.id || i.b[0] === c.sw.id));
    if (!rows.length) continue;
    out.push(`FC Topology for VSAN ${v} :`, line(), "       Interface  Peer Domain Peer Interface     Peer IP Address(Switch Name)", line());
    for (const i of rows) {
      const [me, peer] = i.a[0] === c.sw.id ? [i.a, i.b] : [i.b, i.a];
      out.push(`${me[1].padStart(16)}  ${pad(dom(c.f.switches.find((s) => s.id === peer[0])!.domain), 11)}${peer[1].padStart(15)}  0.0.0.0(${peer[0]})`);
    }
    out.push("");
  }
  return out.join("\n").trim() || "No ISLs are up on this switch.";
}

function showFeature(c: Ctx) {
  const row = (n: string, on: boolean) => `${pad(n, 24)}1          ${on ? "enabled" : "disabled"}`;
  return ["Feature Name          Instance  State", "--------------------  --------  --------", row("fcsp", false), row("fport-channel-trunk", false), row("npiv", !!c.sw.npiv), row("npv", !!c.sw.npv), row("port-security", !!c.sw.portSecurityFeature), row("scheduler", false)].join("\n");
}

// ---------- command table ----------
const optV = (a: string[]) => (a[0] !== undefined ? +a[0] : undefined);

const CMDS: Cmd[] = [
  // modes
  { modes: ["exec"], pat: "configure terminal", help: "Enter configuration mode", run: (c) => c.mode({ m: "config" }) },
  { modes: ["exec"], pat: "configure", help: "Enter configuration mode", run: (c) => c.mode({ m: "config" }) },
  { modes: SHOW, pat: "end", help: "Return to exec mode", run: (c) => c.mode({ m: "exec" }) },
  { modes: SHOW, pat: "exit", help: "Leave the current mode", run: (c) => c.mode(c.s.mode.m === "config" || c.s.mode.m === "exec" ? { m: "exec" } : { m: "config" }) },

  // show
  { modes: SHOW, pat: "show flogi database", help: "Fabric logins on this switch", run: (c) => showFlogi(c) },
  { modes: SHOW, pat: "show flogi database vsan <n>", help: "Fabric logins in one VSAN", run: (c, a) => showFlogi(c, +a[0]) },
  { modes: SHOW, pat: "show fcns database", help: "Name server entries", run: (c) => showFcns(c) },
  { modes: SHOW, pat: "show fcns database vsan <n>", help: "Name server entries in one VSAN", run: (c, a) => showFcns(c, +a[0]) },
  { modes: SHOW, pat: "show vsan", help: "VSAN database", run: (c) => showVsan(c) },
  { modes: SHOW, pat: "show vsan membership", help: "Interfaces in each VSAN", run: (c) => showVsanMembership(c) },
  { modes: SHOW, pat: "show zoneset active", help: "Active zonesets (* = logged in)", run: (c) => showZonesetActive(c) },
  { modes: SHOW, pat: "show zoneset active vsan <n>", help: "Active zoneset in one VSAN", run: (c, a) => showZonesetActive(c, +a[0]) },
  { modes: SHOW, pat: "show zoneset", help: "Configured (full) zonesets", run: (c) => showZoneset(c) },
  { modes: SHOW, pat: "show zoneset vsan <n>", help: "Configured zonesets in one VSAN", run: (c, a) => showZoneset(c, +a[0]) },
  { modes: SHOW, pat: "show zone", help: "Configured zones", run: (c) => showZone(c) },
  { modes: SHOW, pat: "show zone vsan <n>", help: "Configured zones in one VSAN", run: (c, a) => showZone(c, +a[0]) },
  { modes: SHOW, pat: "show zone status vsan <n>", help: "Zoning mode, default zone and database status", run: (c, a) => showZoneStatus(c, +a[0]) },
  { modes: SHOW, pat: "show device-alias database", help: "Committed device-alias database", run: (c) => showAliases(c, false) },
  { modes: SHOW, pat: "show device-alias pending", help: "Uncommitted device-alias changes", run: (c) => showAliases(c, true) },
  { modes: SHOW, pat: "show device-alias status", help: "Device-alias distribution and lock state", run: (c) => `Fabric Distribution: Enabled\nDatabase:- Device Aliases ${Object.keys(c.f.aliases).length}   Mode: Enhanced\n${c.f.aliasPending ? `Locked By:- User "admin" SWWN ${swwn(c.sw)}\nPending Database:- Device Aliases ${Object.keys(c.f.aliasPending).length}   Mode: Enhanced` : "Locked By:- none"}` },
  { modes: SHOW, pat: "show interface brief", help: "Port summary", run: (c) => showIntBrief(c) },
  { modes: SHOW, pat: "show interface <if>", help: "One interface, including trunk VSANs", run: (c, a) => showInterface(c, a[0]) },
  { modes: SHOW, pat: "show npv flogi-table", help: "Logins relayed by this NPV switch", run: (c) => showNpvFlogi(c) },
  { modes: SHOW, pat: "show npv status", help: "NPV uplinks and server ports", run: (c) => showNpvStatus(c) },
  { modes: SHOW, pat: "show port-security database", help: "Port security config database", run: (c) => showPsDb(c, false) },
  { modes: SHOW, pat: "show port-security database active", help: "Port security active database", run: (c) => showPsDb(c, true) },
  { modes: SHOW, pat: "show port-security database vsan <n>", help: "Config database for one VSAN", run: (c, a) => showPsDb(c, false, +a[0]) },
  { modes: SHOW, pat: "show port-security status", help: "Activation state per VSAN", run: (c) => showPsStatus(c) },
  { modes: SHOW, pat: "show port-security violations", help: "Rejected logins", run: (c) => showPsViolations(c) },
  { modes: SHOW, pat: "show fcdomain domain-list vsan <n>", help: "Domains in the fabric", run: (c, a) => showDomainList(c, +a[0]) },
  { modes: SHOW, pat: "show fcdomain vsan <n>", help: "Running and configured domain ID", run: (c, a) => showFcdomain(c, +a[0]) },
  { modes: SHOW, pat: "show topology", help: "ISLs per VSAN", run: (c) => showTopology(c) },
  { modes: SHOW, pat: "show topology vsan <n>", help: "ISLs in one VSAN", run: (c, a) => showTopology(c, +a[0]) },
  { modes: SHOW, pat: "show feature", help: "Enabled features", run: (c) => showFeature(c) },

  // features
  { modes: CFG, pat: "feature npiv", help: "Allow several logins on one F port", run: (c) => void (c.edit(), (c.sw.npiv = true)) },
  { modes: CFG, pat: "no feature npiv", help: "Disable NPIV", run: (c) => void (c.edit(), (c.sw.npiv = false)) },
  { modes: CFG, pat: "feature npv", help: "Put the switch in NPV mode", run: () => "% Enabling NPV erases the configuration and reloads the switch. That isn't available in this lab." },
  { modes: CFG, pat: "feature port-security", help: "Enable port security", run: (c) => void (c.edit(), (c.sw.portSecurityFeature = true)) },
  { modes: CFG, pat: "no feature port-security", help: "Disable port security", run: (c) => void (c.edit(), (c.sw.portSecurityFeature = false), (c.sw.portSecurity = [])) },

  // VSAN database
  { modes: CFG, pat: "vsan database", help: "Enter the VSAN database", run: (c) => c.mode({ m: "vsandb" }) },
  {
    modes: ["vsandb"],
    pat: "vsan <n>",
    help: "Create a VSAN",
    run: (c, a) => {
      const v = +a[0];
      if (v < 2 || v > 4093) return "% VSAN ID must be 2-4093";
      c.edit();
      if (!c.sw.vsans.includes(v)) c.sw.vsans = [...c.sw.vsans, v].sort((x, y) => x - y);
    },
  },
  { modes: ["vsandb"], pat: "vsan <n> name <w>", help: "Create and name a VSAN", run: (c, a) => CMDS.find((x) => x.pat === "vsan <n>")!.run(c, [a[0]]) },
  {
    modes: ["vsandb"],
    pat: "vsan <n> interface <if>",
    help: "Move an interface into a VSAN",
    run: (c, a) => {
      const v = +a[0];
      if (v !== 1 && !c.sw.vsans.includes(v)) return `% VSAN ${v} does not exist. Create it first with vsan ${v}`;
      const p = c.sw.ports.find((x) => x.name === a[1]);
      if (!p) return `% Invalid interface: ${a[1]}`;
      const d = c.f.devices.find((x) => x.at[0] === c.sw.id && x.at[1] === p.name);
      c.edit();
      c.sw.ports.find((x) => x.name === a[1])!.vsan = v;
      return d ? `Traffic on ${p.name} may be impacted. Do you want to continue? (y/n) [n] y` : undefined;
    },
  },
  {
    modes: ["vsandb"],
    pat: "no vsan <n>",
    help: "Delete a VSAN (its ports move to VSAN 4094)",
    run: (c, a) => {
      const v = +a[0];
      if (!c.sw.vsans.includes(v)) return `% VSAN ${v} does not exist`;
      c.edit();
      c.sw.vsans = c.sw.vsans.filter((x) => x !== v);
      for (const p of c.sw.ports) if (p.vsan === v) p.vsan = 4094;
      return `Do you want to continue? (y/n) y`;
    },
  },

  // interfaces
  {
    modes: CFG,
    pat: "interface <if>",
    help: "Configure an interface",
    run: (c, a) => {
      if (!c.sw.ports.some((p) => p.name === a[0])) return `% Invalid interface: ${a[0]}`;
      c.mode({ m: "if", ifs: [a[0]] });
    },
  },
  {
    modes: ["if"],
    pat: "switchport mode <w>",
    help: "Port mode: F, E, NP",
    run: (c, a) => {
      const m = a[0].toUpperCase();
      if (!["F", "E", "NP", "AUTO", "FL", "SD", "ST"].includes(m)) return "% Invalid port mode";
      if (!["F", "E", "NP"].includes(m)) return `% Mode ${m} isn't modelled in this lab; use F, E or NP`;
      if (m === "NP" && !c.sw.npv) return "% NP mode is only available on an NPV switch";
      ifEdit(c, (p) => (p.mode = m as "F" | "E" | "NP"));
    },
  },
  { modes: ["if"], pat: "switchport trunk mode on", help: "Trunk (TE) on an E port", run: (c) => ifEdit(c, (p) => (p.trunk = true)) },
  { modes: ["if"], pat: "switchport trunk mode off", help: "No trunking: the ISL carries the port VSAN only", run: (c) => ifEdit(c, (p) => (p.trunk = false)) },
  {
    modes: ["if"],
    pat: "switchport trunk allowed vsan <vl>",
    help: "Set the trunk allowed VSAN list",
    run: (c, a) => {
      const l = parseVsanList(a[0]);
      if (!l) return "% Invalid VSAN range";
      return ifEdit(c, (p) => (p.allowed = l));
    },
  },
  {
    modes: ["if"],
    pat: "switchport trunk allowed vsan add <vl>",
    help: "Add VSANs to the allowed list",
    run: (c, a) => {
      const l = parseVsanList(a[0]);
      if (!l) return "% Invalid VSAN range";
      return ifEdit(c, (p) => p.allowed && (p.allowed = [...new Set([...p.allowed, ...l])].sort((x, y) => x - y)));
    },
  },
  {
    modes: ["if"],
    pat: "no switchport trunk allowed vsan <vl>",
    help: "Remove VSANs from the allowed list",
    run: (c, a) => {
      const l = parseVsanList(a[0]);
      if (!l) return "% Invalid VSAN range";
      return ifEdit(c, (p) => (p.allowed = (p.allowed ?? Array.from({ length: 4093 }, (_, i) => i + 1)).filter((v) => !l.includes(v))));
    },
  },
  { modes: ["if"], pat: "shutdown", help: "Disable the port", run: (c) => ifEdit(c, (p) => (p.shutdown = true)) },
  { modes: ["if"], pat: "no shutdown", help: "Enable the port", run: (c) => ifEdit(c, (p) => (p.shutdown = false)) },

  // zoning
  {
    modes: CFG,
    pat: "zone name <w> vsan <n>",
    help: "Create or edit a zone",
    run: (c, a) => {
      const v = +a[1];
      if (!hasVsan(c.sw, v)) return `% VSAN ${v} is not configured`;
      const f = c.edit();
      const z = zoningRw(f, v);
      if (!z.zones.some((x) => x.name === a[0])) z.zones.push({ name: a[0], members: [] });
      c.mode({ m: "zone", name: a[0], vsan: v });
    },
  },
  { modes: ["zone"], pat: "member pwwn <pwwn>", help: "Add a member by port WWN", run: (c, a) => zoneMember(c, a[0].toLowerCase(), true) },
  {
    modes: ["zone"],
    pat: "member device-alias <w>",
    help: "Add a member by device-alias",
    run: (c, a) => {
      if (!c.f.aliases[a[0]] && !c.f.aliasPending?.[a[0]]) return `% Device-alias ${a[0]} not present`;
      return zoneMember(c, a[0], true);
    },
  },
  { modes: ["zone"], pat: "no member pwwn <pwwn>", help: "Remove a pWWN member", run: (c, a) => zoneMember(c, a[0].toLowerCase(), false) },
  { modes: ["zone"], pat: "no member device-alias <w>", help: "Remove a device-alias member", run: (c, a) => zoneMember(c, a[0], false) },
  {
    modes: CFG,
    pat: "no zone name <w> vsan <n>",
    help: "Delete a zone",
    run: (c, a) => {
      const f = c.edit();
      const z = zoningRw(f, +a[1]);
      z.zones = z.zones.filter((x) => x.name !== a[0]);
      for (const zs of z.zonesets) zs.zones = zs.zones.filter((x) => x !== a[0]);
    },
  },
  {
    modes: CFG,
    pat: "zoneset name <w> vsan <n>",
    help: "Create or edit a zoneset",
    run: (c, a) => {
      const v = +a[1];
      if (!hasVsan(c.sw, v)) return `% VSAN ${v} is not configured`;
      const z = zoningRw(c.edit(), v);
      if (!z.zonesets.some((x) => x.name === a[0])) z.zonesets.push({ name: a[0], zones: [] });
      c.mode({ m: "zoneset", name: a[0], vsan: v });
    },
  },
  {
    modes: ["zoneset"],
    pat: "member <w>",
    help: "Add a zone to the zoneset",
    run: (c, a) => {
      const m = c.s.mode as Extract<SanMode, { m: "zoneset" }>;
      const z = zoningRw(c.edit(), m.vsan);
      if (!z.zones.some((x) => x.name === a[0])) return `% Zone ${a[0]} not present in VSAN ${m.vsan}`;
      const zs = z.zonesets.find((x) => x.name === m.name)!;
      if (!zs.zones.includes(a[0])) zs.zones.push(a[0]);
    },
  },
  {
    modes: ["zoneset"],
    pat: "no member <w>",
    help: "Remove a zone from the zoneset",
    run: (c, a) => {
      const m = c.s.mode as Extract<SanMode, { m: "zoneset" }>;
      const zs = zoningRw(c.edit(), m.vsan).zonesets.find((x) => x.name === m.name)!;
      zs.zones = zs.zones.filter((x) => x !== a[0]);
    },
  },
  {
    modes: CFG,
    pat: "zoneset activate name <w> vsan <n>",
    help: "Activate a zoneset (copies it to the active database)",
    run: (c, a) => {
      const v = +a[1];
      if (!hasVsan(c.sw, v)) return `% VSAN ${v} is not configured`;
      const f = c.edit();
      const z = zoningRw(f, v);
      const zs = z.zonesets.find((x) => x.name === a[0]);
      if (!zs) return `% Zoneset ${a[0]} not present`;
      z.active = { name: zs.name, zones: structuredClone(z.zones.filter((x) => zs.zones.includes(x.name))) };
      c.mode({ m: "config" });
      return `Zoneset activation initiated. check zone status`;
    },
  },
  {
    modes: CFG,
    pat: "no zoneset activate name <w> vsan <n>",
    help: "Deactivate the zoneset",
    run: (c, a) => {
      const z = zoningRw(c.edit(), +a[1]);
      if (z.active?.name !== a[0]) return `% Zoneset ${a[0]} is not active`;
      z.active = undefined;
    },
  },
  { modes: CFG, pat: "zone default-zone permit vsan <n>", help: "Let unzoned devices talk (insecure)", run: (c, a) => void (zoningRw(c.edit(), +a[0]).defaultZone = "permit") },
  { modes: CFG, pat: "no zone default-zone permit vsan <n>", help: "Default zone denies", run: (c, a) => void (zoningRw(c.edit(), +a[0]).defaultZone = "deny") },

  // device-alias
  { modes: CFG, pat: "device-alias database", help: "Edit device-aliases (takes the fabric lock)", run: (c) => c.mode({ m: "alias" }) },
  {
    modes: ["alias"],
    pat: "device-alias name <w> pwwn <pwwn>",
    help: "Define an alias",
    run: (c, a) => {
      const f = c.edit();
      const db = (f.aliasPending ??= { ...f.aliases });
      if (db[a[0]]) return `% Device Alias already present. Remove it first with no device-alias name ${a[0]}`;
      const clash = Object.entries(db).find(([, w]) => w.toLowerCase() === a[1].toLowerCase());
      if (clash) return `% Another device-alias already present with the same pwwn (${clash[0]})`;
      db[a[0]] = a[1].toLowerCase();
    },
  },
  {
    modes: ["alias"],
    pat: "no device-alias name <w>",
    help: "Delete an alias",
    run: (c, a) => {
      const f = c.edit();
      const db = (f.aliasPending ??= { ...f.aliases });
      if (!db[a[0]]) return `% Device Alias not present`;
      delete db[a[0]];
    },
  },
  {
    modes: CFG,
    pat: "device-alias commit",
    help: "Commit and distribute pending alias changes",
    run: (c) => {
      if (!c.f.aliasPending) return "% There are no pending changes";
      const f = c.edit();
      f.aliases = f.aliasPending!;
      f.aliasPending = null;
      c.mode({ m: "config" });
    },
  },
  { modes: CFG, pat: "device-alias abort", help: "Discard pending alias changes", run: (c) => void ((c.edit().aliasPending = null), c.mode({ m: "config" })) },

  // port security
  {
    modes: CFG,
    pat: "port-security database vsan <n>",
    help: "Edit the port security config database",
    run: (c, a) => {
      if (!c.sw.portSecurityFeature) return "% port-security feature is not enabled";
      c.edit();
      const v = +a[0];
      c.sw.portSecurity ??= [];
      if (!c.sw.portSecurity.some((x) => x.vsan === v)) c.sw.portSecurity.push({ vsan: v, active: false, bindings: [], activeBindings: [] });
      c.mode({ m: "psdb", vsan: v });
    },
  },
  { modes: ["psdb"], pat: "pwwn <pwwn> interface <if>", help: "Bind a pWWN to an interface", run: (c, a) => psEdit(c, a[0], a[1], true) },
  { modes: ["psdb"], pat: "no pwwn <pwwn> interface <if>", help: "Remove a binding", run: (c, a) => psEdit(c, a[0], a[1], false) },
  {
    modes: CFG,
    pat: "port-security activate vsan <n>",
    help: "Copy the config database to active and enforce it",
    run: (c, a) => {
      if (!c.sw.portSecurityFeature) return "% port-security feature is not enabled";
      c.edit();
      const ps = c.sw.portSecurity?.find((x) => x.vsan === +a[0]);
      if (!ps) return `% No port security database for VSAN ${a[0]}`;
      ps.active = true;
      ps.activeBindings = structuredClone(ps.bindings);
      c.mode({ m: "config" });
    },
  },
  {
    modes: CFG,
    pat: "no port-security activate vsan <n>",
    help: "Stop enforcing port security",
    run: (c, a) => {
      c.edit();
      const ps = c.sw.portSecurity?.find((x) => x.vsan === +a[0]);
      if (ps) (ps.active = false), (ps.activeBindings = []);
    },
  },

  // domains
  {
    modes: CFG,
    pat: "fcdomain domain <n> static vsan <n>",
    help: "Configure a static domain ID",
    run: (c, a) => {
      const d = +a[0];
      if (d < 1 || d > 239) return "% Domain ID must be 1-239";
      if (!hasVsan(c.sw, +a[1])) return `% VSAN ${a[1]} is not configured`;
      c.edit();
      c.sw.pendingDomain = d;
    },
  },
  {
    modes: CFG,
    pat: "fcdomain restart disruptive vsan <n>",
    help: "Restart the domain manager and apply the configured domain ID",
    run: (c, a) => {
      if (!hasVsan(c.sw, +a[0])) return `% VSAN ${a[0]} is not configured`;
      c.edit();
      if (c.sw.pendingDomain !== undefined) c.sw.domain = c.sw.pendingDomain;
      return "WARNING: disruptive restart, devices in this VSAN log in again.";
    },
  },
  {
    modes: CFG,
    pat: "fcdomain restart vsan <n>",
    help: "Non-disruptive restart (can't change a running domain ID)",
    run: (c) => (c.sw.pendingDomain !== undefined && c.sw.pendingDomain !== c.sw.domain ? "% A non-disruptive restart keeps the running domain ID. Use fcdomain restart disruptive." : undefined),
  },
];

function ifEdit(c: Ctx, fn: (p: SanSwitch["ports"][number]) => unknown): string | void {
  const m = c.s.mode as Extract<SanMode, { m: "if" }>;
  c.edit();
  for (const n of m.ifs) fn(c.sw.ports.find((p) => p.name === n)!);
}

function zoneMember(c: Ctx, member: string, add: boolean): string | void {
  const m = c.s.mode as Extract<SanMode, { m: "zone" }>;
  const z = zoningRw(c.edit(), m.vsan).zones.find((x) => x.name === m.name)!;
  if (add) {
    if (!z.members.includes(member)) z.members.push(member);
  } else z.members = z.members.filter((x) => x !== member);
}

function psEdit(c: Ctx, pwwn: string, iface: string, add: boolean): string | void {
  const m = c.s.mode as Extract<SanMode, { m: "psdb" }>;
  if (!c.sw.ports.some((p) => p.name === iface)) return `% Invalid interface: ${iface}`;
  c.edit();
  const ps = c.sw.portSecurity!.find((x) => x.vsan === m.vsan)!;
  const w = pwwn.toLowerCase();
  ps.bindings = ps.bindings.filter((b) => !(b.pwwn.toLowerCase() === w && b.iface === iface));
  if (add) ps.bindings.push({ pwwn: w, iface });
}

// ---------- matcher ----------
type Match = { cmd: Cmd; args: string[]; exact: number };

function tokMatch(pt: string, t: string): { ok: boolean; exact?: boolean; arg?: string } {
  if (pt === "<n>") return { ok: /^\d+$/.test(t), arg: t };
  if (pt === "<w>") return { ok: /^[\w.-]+$/.test(t), arg: t };
  if (pt === "<pwwn>") return { ok: PWWN_RE.test(t), arg: t };
  if (pt === "<vl>") return { ok: /^[\d,-]+$/.test(t), arg: t };
  if (pt === "<if>") {
    const m = /^(?:fc|fibrechannel?|fibrechannel)?(\d+\/\d+)$/i.exec(t);
    return { ok: !!m && /^f/i.test(t), arg: m ? `fc${m[1]}` : t };
  }
  const tl = t.toLowerCase();
  return { ok: pt.startsWith(tl), exact: pt === tl };
}

function inMode(c: Cmd, m: SanMode["m"]) {
  return c.modes === "any" || c.modes.includes(m);
}

function normalize(tokens: string[]): string[] {
  // "fc 1/1" → "fc1/1"; "interface fc1/1 - 2" isn't modelled.
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (/^fc$/i.test(tokens[i]) && /^\d+\/\d+$/.test(tokens[i + 1] ?? "")) {
      out.push(`fc${tokens[i + 1]}`);
      i++;
    } else out.push(tokens[i]);
  }
  return out;
}

function findMatches(tokens: string[], mode: SanMode["m"]): Match[] {
  const res: Match[] = [];
  for (const cmd of CMDS) {
    if (!inMode(cmd, mode)) continue;
    const pts = cmd.pat.split(" ");
    if (pts.length !== tokens.length) continue;
    const args: string[] = [];
    let exact = 0;
    let ok = true;
    for (let i = 0; i < pts.length && ok; i++) {
      const r = tokMatch(pts[i], tokens[i]);
      ok = r.ok;
      if (r.arg !== undefined) args.push(r.arg);
      if (r.exact) exact++;
    }
    if (ok) res.push({ cmd, args, exact });
  }
  return res.sort((a, b) => b.exact - a.exact);
}

/** True when some command in the mode could still match after more tokens. */
function partial(tokens: string[], mode: SanMode["m"]) {
  return CMDS.some((cmd) => {
    if (!inMode(cmd, mode)) return false;
    const pts = cmd.pat.split(" ");
    return pts.length > tokens.length && tokens.every((t, i) => tokMatch(pts[i], t).ok);
  });
}

export function runSanCli(raw: string, s: SanSession, fabric: SanFabric): SanCliResult {
  let tokens = normalize(raw.trim().split(/\s+/).filter(Boolean));
  if (!tokens.length) return { out: "", session: s };
  if (tokens[0].toLowerCase() === "do" && s.mode.m !== "exec") tokens = tokens.slice(1);
  let mode = s.mode;
  let matches = findMatches(tokens, mode.m);
  // NX-OS accepts global config commands from a sub-mode and drops back to config mode.
  if (!matches.length && mode.m !== "exec" && mode.m !== "config") {
    const g = findMatches(tokens, "config");
    if (g.length) {
      matches = g;
      mode = { m: "config" };
    }
  }
  if (!matches.length) {
    if (partial(tokens, mode.m)) return { out: "% Incomplete command", session: s };
    let bad = tokens.length - 1;
    for (let k = 1; k <= tokens.length; k++) {
      const pre = tokens.slice(0, k);
      if (!partial(pre, mode.m) && !findMatches(pre, mode.m).length) {
        bad = k - 1;
        break;
      }
    }
    let at = 0;
    const raws = raw.split(/(\s+)/);
    for (let i = 0, t = 0; i < raws.length; i++) {
      if (!raws[i].trim()) {
        at += raws[i].length;
        continue;
      }
      if (t === bad) break;
      at += raws[i].length;
      t++;
    }
    return { out: `${" ".repeat(sanPrompt(s).length + at)}^\n% Invalid command at '^' marker.`, session: s };
  }
  const best = matches[0];
  let f = fabric;
  let edited = false;
  const session: SanSession = { sw: s.sw, mode };
  const ctx: Ctx = {
    get f() {
      return f;
    },
    s: session,
    get sw() {
      return f.switches.find((x) => x.id === s.sw)!;
    },
    edit: () => {
      if (!edited) {
        f = structuredClone(f);
        edited = true;
      }
      return f;
    },
    r: () => evaluate(f),
    mode: (m) => {
      session.mode = m;
    },
  } as Ctx;
  const out = best.cmd.run(ctx, best.args) ?? "";
  return { out, session: { ...session }, fabric: edited ? f : undefined };
}

export function sanHelp(raw: string, s: SanSession): string {
  const text = raw.replace(/\?$/, "");
  const endsWord = !/\s$/.test(text) && text.length > 0;
  const tokens = normalize(text.trim().split(/\s+/).filter(Boolean));
  const fixed = endsWord ? tokens.slice(0, -1) : tokens;
  const last = endsWord ? tokens[tokens.length - 1] : "";
  const seen = new Map<string, string>();
  const modes: SanMode["m"][] = s.mode.m === "exec" || s.mode.m === "config" ? [s.mode.m] : [s.mode.m, "config"];
  for (const cmd of CMDS) {
    if (!modes.some((m) => inMode(cmd, m))) continue;
    const pts = cmd.pat.split(" ");
    if (pts.length <= fixed.length) {
      if (pts.length === fixed.length && !endsWord && fixed.every((t, i) => tokMatch(pts[i], t).ok)) seen.set("<cr>", "");
      continue;
    }
    if (!fixed.every((t, i) => tokMatch(pts[i], t).ok)) continue;
    const next = pts[fixed.length];
    if (endsWord && !(next.startsWith("<") ? tokMatch(next, last).ok : next.startsWith(last.toLowerCase()))) continue;
    if (!seen.has(next) || pts.length === fixed.length + 1) seen.set(next, cmd.help);
  }
  if (!seen.size) return "% Invalid command";
  const desc: Record<string, string> = { "<n>": "Number", "<w>": "Name", "<pwwn>": "Port WWN, hh:hh:hh:hh:hh:hh:hh:hh", "<if>": "Interface, e.g. fc1/1", "<vl>": "VSAN list, e.g. 10,20 or 10-20" };
  return [...seen.entries()]
    .sort(([a], [b]) => (a === "<cr>" ? 1 : b === "<cr>" ? -1 : a.localeCompare(b)))
    .map(([k, h]) => `  ${k.padEnd(22)}${desc[k] ?? h}`)
    .join("\n");
}

export function sanComplete(raw: string, s: SanSession): string | null {
  if (/\s$/.test(raw) || !raw.trim()) return null;
  const tokens = normalize(raw.trim().split(/\s+/));
  const fixed = tokens.slice(0, -1);
  const last = tokens[tokens.length - 1].toLowerCase();
  const modes: SanMode["m"][] = s.mode.m === "exec" || s.mode.m === "config" ? [s.mode.m] : [s.mode.m, "config"];
  const opts = new Set<string>();
  for (const cmd of CMDS) {
    if (!modes.some((m) => inMode(cmd, m))) continue;
    const pts = cmd.pat.split(" ");
    if (pts.length <= fixed.length || !fixed.every((t, i) => tokMatch(pts[i], t).ok)) continue;
    const next = pts[fixed.length];
    if (!next.startsWith("<") && next.startsWith(last)) opts.add(next);
  }
  if (opts.size !== 1) return null;
  return `${raw.replace(/\S+$/, "")}${[...opts][0]} `;
}
