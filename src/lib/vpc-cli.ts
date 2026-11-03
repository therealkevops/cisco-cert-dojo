// A small NX-OS style CLI over the vPC Lab pair. Same conventions as the SAN Lab CLI: keyword
// prefixes (an exact keyword beats a longer one), "?" help, Tab completion, global config commands
// accepted from sub-modes. Show commands read `evaluate`, so they always match what's graded.

import { allowedOf, evaluate, fmtVlans, intfOf, membersOf, poName, type VpcIntf, type VpcLab, type VpcResult, type VpcSwitch } from "./vpc";

export type VpcMode = { m: "exec" } | { m: "config" } | { m: "if"; name: string } | { m: "vpcdom" } | { m: "vlan" };
export type VpcSession = { sw: string; mode: VpcMode };
export type VpcCliResult = { out: string; session: VpcSession; lab?: VpcLab };

const SUFFIX: Record<VpcMode["m"], string> = { exec: "", config: "(config)", if: "(config-if)", vpcdom: "(config-vpc-domain)", vlan: "(config-vlan)" };
export const vpcPrompt = (s: VpcSession) => `${s.sw}${SUFFIX[s.mode.m]}# `;

type Ctx = { lab: VpcLab; s: VpcSession; sw: VpcSwitch; peer: VpcSwitch; edit: () => VpcLab; r: () => VpcResult; mode: (m: VpcMode) => void };
type Cmd = { modes: VpcMode["m"][] | "any"; pat: string; help: string; run: (c: Ctx, a: string[]) => string | void };
const CFG: VpcMode["m"][] = ["config", "if", "vpcdom", "vlan"];

// ---------- helpers ----------
const line = (n = 80) => "-".repeat(n);
const pad = (s: string | number, n: number) => String(s).padEnd(n);
const shortIf = (n: string) => n.replace("port-channel", "Po").replace("Ethernet", "Eth");
const sortIf = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

export function parseVlans(raw: string): number[] | null {
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

function newIntf(name: string, from?: VpcIntf): VpcIntf {
  return { name, mode: from?.mode ?? "access", accessVlan: from?.accessVlan ?? 1, allowed: from?.allowed ?? null, native: from?.native ?? 1, mtu: from?.mtu ?? 1500 };
}

function poStatus(c: Ctx, po: VpcIntf): { up: boolean; members: { name: string; flag: string }[] } {
  const r = c.r();
  const id = +po.name.replace("port-channel", "");
  const members = membersOf(c.sw, id).map((m) => {
    if (c.sw.offline || m.shutdown || po.shutdown) return { name: m.name, flag: "D" };
    if (po.vpc === "peer-link") return { name: m.name, flag: r.peerLink.up ? "P" : "D" };
    const leg = r.legs.find((l) => l.sw === c.sw.id && l.port === m.name);
    if (!leg) return { name: m.name, flag: "D" };
    return { name: m.name, flag: leg.state === "bundled" ? "P" : leg.state === "suspended" ? "s" : leg.state === "individual" ? "I" : "D" };
  });
  return { up: members.some((m) => m.flag === "P"), members };
}

// ---------- show ----------
function showVpc(c: Ctx) {
  const r = c.r();
  const d = c.sw.domain;
  if (!c.sw.features.vpc) return "% Invalid command (feature vpc is not enabled)";
  if (!d) return "vPC domain id                     : Not configured";
  const pl = c.sw.intfs.find((i) => i.vpc === "peer-link");
  const vpcs = r.vpcs.filter((v) => c.sw.intfs.some((i) => i.vpc === v.vpc));
  const t1 = r.global.length ? "failed" : "success";
  const t2 = vpcs.some((v) => v.incons.some((i) => i.level === "type2")) ? "failed" : "success";
  const role = r.role[c.sw.id] ?? "none established";
  const out = [
    "Legend:",
    "                (*) - local vPC is down, forwarding via vPC peer-link",
    "",
    `vPC domain id                     : ${d.id}`,
    `Peer status                       : ${r.adjacency.ok ? "peer adjacency formed ok" : !r.peerLink.up ? "peer link is down" : "peer adjacency not formed yet"}`,
    `vPC keep-alive status             : ${r.keepalive.up ? "peer is alive" : "peer is not reachable through peer-keepalive"}`,
    `Configuration consistency status  : ${r.adjacency.ok ? t1 : "failed"}`,
    `Per-vlan consistency status       : ${r.adjacency.ok ? "success" : "failed"}`,
    ...(r.adjacency.ok && r.global.length ? [`Configuration inconsistency reason: vPC type-1 configuration incompatible - ${r.global[0].what} inconsistent`] : []),
    `Type-2 consistency status         : ${r.adjacency.ok ? t2 : "failed"}`,
    `vPC role                          : ${role}`,
    `Number of vPCs configured         : ${vpcs.length}`,
    `Peer Gateway                      : ${d.peerGateway ? "Enabled" : "Disabled"}`,
    "Dual-active excluded VLANs        : -",
    `Graceful Consistency Check        : ${d.graceful ? "Enabled" : "Disabled"}`,
    `Auto-recovery status              : ${d.autoRecovery ? `Enabled, timer is off.(timeout = 240s)` : "Disabled"}`,
    "",
    "vPC Peer-link status",
    line(69),
    "id    Port   Status Active vlans",
    "--    ----   ------ -------------------------------------------------",
    pl ? `1     ${pad(shortIf(pl.name), 7)}${pad(r.peerLink.up ? "up" : "down", 7)}${r.peerLink.up ? fmtVlans(allowedOf(pl).filter((v) => c.sw.vlans.includes(v))) : "-"}` : "1     -      down   -",
    "",
    "vPC status",
    line(76),
    "Id    Port          Status Consistency Reason                Active vlans",
    "--    ------------  ------ ----------- ------                ---------------",
  ];
  for (const v of vpcs) {
    const po = c.sw.intfs.find((i) => i.vpc === v.vpc)!;
    const st = v.status[c.sw.id];
    const active = st?.up ? fmtVlans(allowedOf(po).filter((x) => c.sw.vlans.includes(x))) : "-";
    out.push(`${pad(v.vpc, 6)}${pad(shortIf(po.name), 14)}${pad(st?.up ? "up" : "down*", 7)}${pad(v.consistency, 12)}${pad(v.reason, 22)} ${active}`);
  }
  return out.join("\n");
}

function showKeepalive(c: Ctx) {
  const r = c.r();
  const ka = c.sw.domain?.keepalive;
  if (!c.sw.domain) return "% vPC domain is not configured";
  return [
    `vPC keep-alive status           : ${r.keepalive.up ? "peer is alive" : "peer is not reachable through peer-keepalive"}`,
    "",
    ...(r.keepalive.up ? ["--Peer is alive for             : (3612) seconds, (216) msec", "--Send status                   : Success", "--Sent on interface             : mgmt0", "--Receive status                : Success", "--Received on interface         : mgmt0", "--Last update from peer         : (0) seconds, (412) msec"] : ["--Send status                   : Failed", "--Receive status                : Failed", "--Last update from peer         : (never)"]),
    "",
    "vPC Keep-alive parameters",
    `--Destination                   : ${ka?.dst ?? "-"}`,
    "--Keepalive interval            : 1000 msec",
    "--Keepalive timeout             : 5 seconds",
    "--Keepalive hold timeout        : 3 seconds",
    `--Keepalive vrf                 : ${ka?.vrf ?? "-"}`,
    "--Keepalive udp port            : 3200",
    "--Keepalive tos                 : 192",
  ].join("\n");
}

function showRole(c: Ctx) {
  const r = c.r();
  const d = c.sw.domain;
  if (!d) return "% vPC domain is not configured";
  const peer = c.peer.domain;
  return [
    "",
    "Primary-Secondary role configuration:",
    `vPC Role                        : ${r.role[c.sw.id] ?? "none established"}`,
    `Dual Active Detection Status    : 0`,
    `vPC system-mac                  : 00:23:04:ee:be:${d.id.toString(16).padStart(2, "0")}`,
    `vPC system-priority             : 32667`,
    `vPC local system-mac            : ${c.sw.mac}`,
    `vPC local role-priority         : ${d.rolePriority}`,
    `vPC peer system-mac             : ${r.adjacency.ok ? c.peer.mac : "00:00:00:00:00:00"}`,
    `vPC peer role-priority          : ${r.adjacency.ok && peer ? peer.rolePriority : 0}`,
  ].join("\n");
}

const head = ["    Legend:", "        Type 1 : vPC will be suspended in case of mismatch", "", "Name                        Type  Local Value            Peer Value", "-------------               ----  ---------------------- -----------------------"];
const row = (n: string, t: string, a: string, b: string) => `${pad(n, 28)}${pad(t, 6)}${pad(a, 22)} ${b}`;

function showConsGlobal(c: Ctx) {
  const r = c.r();
  if (!r.adjacency.ok) return "Consistency Check Not Performed (peer adjacency not formed)";
  const stp = (m: string) => (m === "mst" ? "MST" : "Rapid-PVST");
  return [...head, row("STP Mode", "1", stp(c.sw.stpMode), stp(c.peer.stpMode)), row("STP Disabled", "1", "None", "None"), row("STP MST Region Name", "1", '""', '""'), row("Interface-vlan admin up", "2", "-", "-"), row("Allowed VLANs", "-", fmtVlans(c.sw.vlans), fmtVlans(c.peer.vlans)), row("Local suspended VLANs", "-", "-", "-")].join("\n");
}

function showConsVpc(c: Ctx, n: number) {
  const r = c.r();
  if (!r.adjacency.ok) return "Consistency Check Not Performed (peer adjacency not formed)";
  const a = c.sw.intfs.find((i) => i.vpc === n);
  const b = c.peer.intfs.find((i) => i.vpc === n);
  if (!a) return `% vPC ${n} is not configured on this switch`;
  if (!b) return `vPC ${n} is not configured on the peer`;
  const mode = (s: VpcSwitch, po: VpcIntf) => membersOf(s, +po.name.replace("port-channel", ""))[0]?.channel?.mode ?? "-";
  const v = (s: VpcSwitch, po: VpcIntf) => fmtVlans(allowedOf(po).filter((x) => s.vlans.includes(x)));
  return [
    ...head,
    row("lag-id", "1", `[(7f9b, 0-23-4-ee-be-${(c.sw.domain?.id ?? 0).toString(16).padStart(2, "0")}, 80${n.toString(16).padStart(2, "0")}, 0, 0)]`, `[(7f9b, 0-23-4-ee-be-${(c.peer.domain?.id ?? 0).toString(16).padStart(2, "0")}, 80${n.toString(16).padStart(2, "0")}, 0, 0)]`),
    row("mode", "1", mode(c.sw, a), mode(c.peer, b)),
    row("Speed", "1", "25 Gb/s", "25 Gb/s"),
    row("Duplex", "1", "full", "full"),
    row("Port Mode", "1", a.mode, b.mode),
    row("Native Vlan", "1", String(a.mode === "trunk" ? a.native : a.accessVlan), String(b.mode === "trunk" ? b.native : b.accessVlan)),
    row("MTU", "1", String(a.mtu), String(b.mtu)),
    row("Allowed VLANs", "-", v(c.sw, a), v(c.peer, b)),
    row("Local suspended VLANs", "-", "-", "-"),
  ].join("\n");
}

function showPoSummary(c: Ctx) {
  const pos = c.sw.intfs.filter((i) => i.name.startsWith("port-channel")).sort((x, y) => sortIf(x.name, y.name));
  return [
    "Flags:  D - Down        P - Up in port-channel (members)",
    "        I - Individual  H - Hot-standby (LACP only)",
    "        s - Suspended   r - Module-removed",
    "        S - Switched    R - Routed",
    "        U - Up (port-channel)",
    "        M - Not in use. Min-links not met",
    line(),
    "Group Port-       Type     Protocol  Member Ports",
    "      Channel",
    line(),
    ...pos.map((po) => {
      const st = poStatus(c, po);
      const id = po.name.replace("port-channel", "");
      const proto = membersOf(c.sw, +id)[0]?.channel?.mode === "on" ? "NONE" : "LACP";
      return `${pad(id, 6)}${pad(`${shortIf(po.name)}(${st.up ? "SU" : "SD"})`, 12)}${pad("Eth", 9)}${pad(proto, 10)}${st.members.map((m) => `${shortIf(m.name)}(${m.flag})`).join("  ")}`;
    }),
  ].join("\n");
}

function showVlanBrief(c: Ctx) {
  return [
    "",
    "VLAN Name                             Status    Ports",
    "---- -------------------------------- --------- -------------------------------",
    ...[...c.sw.vlans].sort((a, b) => a - b).map((v) => {
      const ports = c.sw.intfs.filter((i) => i.mode === "access" && i.accessVlan === v && !i.channel).map((i) => shortIf(i.name));
      return `${pad(v, 5)}${pad(v === 1 ? "default" : `VLAN${String(v).padStart(4, "0")}`, 33)}${pad("active", 10)}${ports.join(", ")}`;
    }),
  ].join("\n");
}

function showTrunk(c: Ctx) {
  const r = c.r();
  const trunks = c.sw.intfs.filter((i) => i.mode === "trunk" && (i.name.startsWith("port-channel") || !i.channel)).sort((x, y) => sortIf(x.name, y.name));
  const fwd = (i: VpcIntf) => {
    if (i.vpc === "peer-link") return r.peerLink.up ? allowedOf(i).filter((v) => c.sw.vlans.includes(v)) : [];
    if (typeof i.vpc === "number") return r.vpcs.find((v) => v.vpc === i.vpc)?.status[c.sw.id]?.up ? allowedOf(i).filter((v) => c.sw.vlans.includes(v)) : [];
    return poStatus(c, i).up ? allowedOf(i).filter((v) => c.sw.vlans.includes(v)) : [];
  };
  const errd = (i: VpcIntf) => (typeof i.vpc === "number" && !r.vpcs.find((v) => v.vpc === i.vpc)?.status[c.sw.id]?.up ? allowedOf(i).filter((v) => c.sw.vlans.includes(v)) : []);
  return [
    "",
    line(),
    "Port          Native  Status        Port",
    "              Vlan                  Channel",
    line(),
    ...trunks.map((i) => `${pad(shortIf(i.name), 14)}${pad(i.native, 8)}${pad(fwd(i).length ? "trunking" : "not-trunking", 14)}--`),
    "",
    line(),
    "Port          Vlans Allowed on Trunk",
    line(),
    ...trunks.map((i) => `${pad(shortIf(i.name), 14)}${fmtVlans(i.allowed)}`),
    "",
    line(),
    "Port          Vlans Err-disabled on Trunk",
    line(),
    ...trunks.map((i) => `${pad(shortIf(i.name), 14)}${errd(i).length ? fmtVlans(errd(i)) : "none"}`),
    "",
    line(),
    "Port          STP Forwarding",
    line(),
    ...trunks.map((i) => `${pad(shortIf(i.name), 14)}${fwd(i).length ? fmtVlans(fwd(i)) : "none"}`),
  ].join("\n");
}

function runIntf(i: VpcIntf): string[] {
  const out = [`interface ${i.name}`];
  if (i.mode === "trunk") {
    out.push("  switchport mode trunk");
    if (i.native !== 1) out.push(`  switchport trunk native vlan ${i.native}`);
    if (i.allowed) out.push(`  switchport trunk allowed vlan ${fmtVlans(i.allowed)}`);
  } else if (i.accessVlan !== 1) out.push(`  switchport access vlan ${i.accessVlan}`);
  if (i.mtu !== 1500) out.push(`  mtu ${i.mtu}`);
  if (i.vpc === "peer-link") out.push("  vpc peer-link");
  else if (typeof i.vpc === "number") out.push(`  vpc ${i.vpc}`);
  if (i.channel) out.push(`  channel-group ${i.channel.id}${i.channel.mode === "on" ? "" : ` mode ${i.channel.mode}`}`);
  out.push(i.shutdown ? "  shutdown" : "  no shutdown");
  return out;
}

function showRunVpc(c: Ctx) {
  const d = c.sw.domain;
  const out = ["!Command: show running-config vpc", "", ...(c.sw.features.vpc ? ["feature vpc"] : [])];
  if (d) {
    out.push("", `vpc domain ${d.id}`);
    if (d.rolePriority !== 32667) out.push(`  role priority ${d.rolePriority}`);
    if (d.keepalive) out.push(`  peer-keepalive destination ${d.keepalive.dst}${d.keepalive.src ? ` source ${d.keepalive.src}` : ""}${d.keepalive.vrf !== "management" ? ` vrf ${d.keepalive.vrf}` : ""}`);
    if (d.peerGateway) out.push("  peer-gateway");
    if (d.autoRecovery) out.push("  auto-recovery");
    if (!d.graceful) out.push("  no graceful consistency-check");
  }
  for (const i of c.sw.intfs.filter((x) => x.vpc !== undefined).sort((x, y) => sortIf(x.name, y.name))) out.push("", `interface ${i.name}`, i.vpc === "peer-link" ? "  vpc peer-link" : `  vpc ${i.vpc}`);
  return out.join("\n");
}

// ---------- config helpers ----------
function ifEdit(c: Ctx, fn: (i: VpcIntf, sw: VpcSwitch) => string | void): string | void {
  const m = c.s.mode as Extract<VpcMode, { m: "if" }>;
  c.edit();
  const i = intfOf(c.sw, m.name)!;
  const msg = fn(i, c.sw);
  if (msg) return msg;
  // Port-channel config is inherited by its members, as on NX-OS.
  if (i.name.startsWith("port-channel")) for (const mem of membersOf(c.sw, +i.name.replace("port-channel", ""))) Object.assign(mem, { mode: i.mode, accessVlan: i.accessVlan, allowed: i.allowed, native: i.native, mtu: i.mtu });
}

function trunkEdit(c: Ctx, raw: string, how: "set" | "add" | "remove"): string | void {
  const vs = parseVlans(raw);
  if (!vs) return "% Invalid VLAN range";
  return ifEdit(c, (i) => {
    const cur = i.allowed ?? Array.from({ length: 4094 }, (_, k) => k + 1);
    i.allowed = how === "set" ? vs : how === "add" ? [...new Set([...cur, ...vs])].sort((a, b) => a - b) : cur.filter((v) => !vs.includes(v));
    if (i.allowed.length === 4094) i.allowed = null;
  });
}

const needVpc = (c: Ctx) => (!c.sw.features.vpc ? "% Invalid command: enable feature vpc first" : undefined);

const CMDS: Cmd[] = [
  { modes: ["exec"], pat: "configure terminal", help: "Enter configuration mode", run: (c) => c.mode({ m: "config" }) },
  { modes: ["exec"], pat: "configure", help: "Enter configuration mode", run: (c) => c.mode({ m: "config" }) },
  { modes: "any", pat: "end", help: "Return to exec mode", run: (c) => c.mode({ m: "exec" }) },
  { modes: "any", pat: "exit", help: "Leave the current mode", run: (c) => c.mode(c.s.mode.m === "config" || c.s.mode.m === "exec" ? { m: "exec" } : { m: "config" }) },

  { modes: "any", pat: "show vpc", help: "vPC status", run: (c) => showVpc(c) },
  { modes: "any", pat: "show vpc brief", help: "vPC status", run: (c) => showVpc(c) },
  { modes: "any", pat: "show vpc peer-keepalive", help: "Peer-keepalive status and parameters", run: (c) => showKeepalive(c) },
  { modes: "any", pat: "show vpc role", help: "Role, priorities and system MACs", run: (c) => showRole(c) },
  { modes: "any", pat: "show vpc consistency-parameters global", help: "Global type-1 parameters", run: (c) => showConsGlobal(c) },
  { modes: "any", pat: "show vpc consistency-parameters vpc <n>", help: "Parameters for one vPC", run: (c, a) => showConsVpc(c, +a[0]) },
  {
    modes: "any",
    pat: "show vpc consistency-parameters interface <if>",
    help: "Parameters for a vPC port-channel",
    run: (c, a) => {
      const i = intfOf(c.sw, a[0]);
      return typeof i?.vpc === "number" ? showConsVpc(c, i.vpc) : `% ${a[0]} is not a vPC`;
    },
  },
  { modes: "any", pat: "show port-channel summary", help: "Port-channels and member flags", run: (c) => showPoSummary(c) },
  { modes: "any", pat: "show vlan brief", help: "VLAN database", run: (c) => showVlanBrief(c) },
  { modes: "any", pat: "show vlan", help: "VLAN database", run: (c) => showVlanBrief(c) },
  { modes: "any", pat: "show interface trunk", help: "Trunks, allowed and forwarding VLANs", run: (c) => showTrunk(c) },
  { modes: "any", pat: "show running-config vpc", help: "vPC configuration", run: (c) => showRunVpc(c) },
  {
    modes: "any",
    pat: "show running-config interface <if>",
    help: "One interface's configuration",
    run: (c, a) => {
      const i = intfOf(c.sw, a[0]);
      return i ? ["!Command: show running-config interface " + a[0], "", ...runIntf(i)].join("\n") : `% Invalid interface ${a[0]}`;
    },
  },
  { modes: "any", pat: "show spanning-tree summary", help: "STP mode", run: (c) => `Switch is in ${c.sw.stpMode} mode\nRoot bridge for: ${fmtVlans(c.sw.vlans)}\nPort Type Default                        is disable\nEdge Port [PortFast] BPDU Guard Default  is disabled\nBridge Assurance                         is enabled\nLoopguard Default                        is disabled\nPathcost method used                     is short` },
  { modes: "any", pat: "show feature", help: "Enabled features", run: (c) => ["Feature Name          Instance  State", "--------------------  --------  --------", `hsrp_engine           1         ${c.sw.features.hsrp ? "enabled" : "disabled"}`, `interface-vlan        1         enabled`, `lacp                  1         ${c.sw.features.lacp ? "enabled" : "disabled"}`, `vpc                   1         ${c.sw.features.vpc ? "enabled" : "disabled"}`].join("\n") },

  // features and global
  { modes: CFG, pat: "feature vpc", help: "Enable vPC", run: (c) => void (c.edit(), (c.sw.features.vpc = true)) },
  { modes: CFG, pat: "feature lacp", help: "Enable LACP", run: (c) => void (c.edit(), (c.sw.features.lacp = true)) },
  {
    modes: CFG,
    pat: "spanning-tree mode <w>",
    help: "rapid-pvst or mst",
    run: (c, a) => {
      const m = a[0].toLowerCase();
      const mode = "rapid-pvst".startsWith(m) && m.length > 1 ? "rapid-pvst" : "mst".startsWith(m) && m.length > 0 ? "mst" : null;
      if (!mode) return "% Invalid STP mode (rapid-pvst or mst)";
      c.edit();
      c.sw.stpMode = mode;
    },
  },
  {
    modes: CFG,
    pat: "vlan <vl>",
    help: "Create VLANs",
    run: (c, a) => {
      const vs = parseVlans(a[0]);
      if (!vs) return "% Invalid VLAN range";
      c.edit();
      c.sw.vlans = [...new Set([...c.sw.vlans, ...vs])].sort((x, y) => x - y);
      c.mode({ m: "vlan" });
    },
  },
  {
    modes: CFG,
    pat: "no vlan <vl>",
    help: "Delete VLANs",
    run: (c, a) => {
      const vs = parseVlans(a[0]);
      if (!vs) return "% Invalid VLAN range";
      c.edit();
      c.sw.vlans = c.sw.vlans.filter((v) => v === 1 || !vs.includes(v));
    },
  },
  { modes: ["vlan"], pat: "name <w>", help: "Name the VLAN", run: () => undefined },

  // vPC domain
  {
    modes: CFG,
    pat: "vpc domain <n>",
    help: "Enter the vPC domain",
    run: (c, a) => {
      const e = needVpc(c);
      if (e) return e;
      const id = +a[0];
      if (id < 1 || id > 1000) return "% Domain ID must be 1-1000";
      if (c.sw.domain && c.sw.domain.id !== id) return `% vPC domain ${c.sw.domain.id} is already configured. Only one vPC domain is allowed per switch`;
      c.edit();
      c.sw.domain ??= { id, rolePriority: 32667, peerGateway: false, autoRecovery: false, graceful: true };
      c.mode({ m: "vpcdom" });
    },
  },
  ...(
    [
      ["peer-keepalive destination <ip> source <ip> vrf <w>", (a: string[]) => ({ dst: a[0], src: a[1], vrf: a[2] })],
      ["peer-keepalive destination <ip> vrf <w> source <ip>", (a: string[]) => ({ dst: a[0], vrf: a[1], src: a[2] })],
      ["peer-keepalive destination <ip> source <ip>", (a: string[]) => ({ dst: a[0], src: a[1], vrf: "management" })],
      ["peer-keepalive destination <ip> vrf <w>", (a: string[]) => ({ dst: a[0], vrf: a[1] })],
      ["peer-keepalive destination <ip>", (a: string[]) => ({ dst: a[0], vrf: "management" })],
    ] as const
  ).map(([pat, mk]): Cmd => ({ modes: ["vpcdom"], pat, help: "Peer-keepalive (default VRF: management)", run: (c, a) => void (c.edit(), (c.sw.domain!.keepalive = mk(a))) })),
  {
    modes: ["vpcdom"],
    pat: "role priority <n>",
    help: "Lower wins the primary role",
    run: (c, a) => {
      const n = +a[0];
      if (n < 1 || n > 65535) return "% Role priority must be 1-65535";
      c.edit();
      c.sw.domain!.rolePriority = n;
      return "Warning: the role is only re-elected when the peer adjacency re-forms (a non-preemptive change).";
    },
  },
  { modes: ["vpcdom"], pat: "peer-gateway", help: "Route frames sent to the peer's router MAC", run: (c) => void (c.edit(), (c.sw.domain!.peerGateway = true)) },
  { modes: ["vpcdom"], pat: "no peer-gateway", help: "Disable peer-gateway", run: (c) => void (c.edit(), (c.sw.domain!.peerGateway = false)) },
  { modes: ["vpcdom"], pat: "auto-recovery", help: "Bring vPCs up if the peer stays silent after a reload", run: (c) => void (c.edit(), (c.sw.domain!.autoRecovery = true)) },
  { modes: ["vpcdom"], pat: "no auto-recovery", help: "Disable auto-recovery", run: (c) => void (c.edit(), (c.sw.domain!.autoRecovery = false)) },
  { modes: ["vpcdom"], pat: "graceful consistency-check", help: "Suspend only the secondary on type-1 mismatch", run: (c) => void (c.edit(), (c.sw.domain!.graceful = true)) },
  { modes: ["vpcdom"], pat: "no graceful consistency-check", help: "Suspend both peers on type-1 mismatch", run: (c) => void (c.edit(), (c.sw.domain!.graceful = false)) },

  // interfaces
  {
    modes: CFG,
    pat: "interface <if>",
    help: "Configure an interface (ethernet1/x or port-channelN)",
    run: (c, a) => {
      const name = a[0];
      if (!intfOf(c.sw, name)) {
        if (!name.startsWith("port-channel")) return `% Invalid interface ${name}`;
        c.edit();
        c.sw.intfs.push(newIntf(name));
      }
      c.mode({ m: "if", name });
    },
  },
  { modes: ["if"], pat: "switchport", help: "Layer 2 port", run: () => undefined },
  { modes: ["if"], pat: "switchport mode trunk", help: "802.1Q trunk", run: (c) => ifEdit(c, (i) => void (i.mode = "trunk")) },
  { modes: ["if"], pat: "switchport mode access", help: "Access port", run: (c) => ifEdit(c, (i) => void (i.mode = "access")) },
  { modes: ["if"], pat: "switchport access vlan <n>", help: "Access VLAN", run: (c, a) => ifEdit(c, (i) => void (i.accessVlan = +a[0])) },
  { modes: ["if"], pat: "switchport trunk native vlan <n>", help: "Native VLAN", run: (c, a) => ifEdit(c, (i) => void (i.native = +a[0])) },
  { modes: ["if"], pat: "switchport trunk allowed vlan all", help: "Allow every VLAN", run: (c) => ifEdit(c, (i) => void (i.allowed = null)) },
  { modes: ["if"], pat: "switchport trunk allowed vlan <vl>", help: "Set the allowed list", run: (c, a) => trunkEdit(c, a[0], "set") },
  { modes: ["if"], pat: "switchport trunk allowed vlan add <vl>", help: "Add to the allowed list", run: (c, a) => trunkEdit(c, a[0], "add") },
  { modes: ["if"], pat: "switchport trunk allowed vlan remove <vl>", help: "Remove from the allowed list", run: (c, a) => trunkEdit(c, a[0], "remove") },
  {
    modes: ["if"],
    pat: "mtu <n>",
    help: "Interface MTU",
    run: (c, a) => {
      const n = +a[0];
      if (n !== 1500 && n !== 9216) return "% Layer 2 ports support mtu 1500 or 9216";
      return ifEdit(c, (i) => void (i.mtu = n));
    },
  },
  { modes: ["if"], pat: "shutdown", help: "Disable", run: (c) => ifEdit(c, (i) => void (i.shutdown = true)) },
  { modes: ["if"], pat: "no shutdown", help: "Enable", run: (c) => ifEdit(c, (i) => void (i.shutdown = false)) },
  ...(["channel-group <n> mode <w>", "channel-group <n>"] as const).map(
    (pat): Cmd => ({
      modes: ["if"],
      pat,
      help: "Add the port to a port-channel (active / passive / on)",
      run: (c, a) => {
        const m = c.s.mode as Extract<VpcMode, { m: "if" }>;
        if (m.name.startsWith("port-channel")) return "% channel-group is configured on member ports";
        const raw = (a[1] ?? "on").toLowerCase();
        const mode = (["active", "passive", "on"] as const).find((x) => x.startsWith(raw));
        if (!mode) return "% Invalid mode (active, passive or on)";
        if (mode !== "on" && !c.sw.features.lacp) return "% LACP feature is not enabled. Use feature lacp";
        const id = +a[0];
        const cur = intfOf(c.sw, m.name)!.channel;
        if (cur && cur.mode !== mode) return `% Cannot change the channel mode of ${m.name} while it's a member (${cur.mode}). Remove it with no channel-group first`;
        c.edit();
        const i = intfOf(c.sw, m.name)!;
        i.channel = { id, mode };
        if (!intfOf(c.sw, poName(id))) c.sw.intfs.push({ ...newIntf(poName(id), i) });
        else Object.assign(i, (({ mode: md, accessVlan, allowed, native, mtu }) => ({ mode: md, accessVlan, allowed, native, mtu }))(intfOf(c.sw, poName(id))!));
      },
    }),
  ),
  { modes: ["if"], pat: "no channel-group", help: "Remove the port from its port-channel", run: (c) => ifEdit(c, (i) => void delete i.channel) },
  {
    modes: ["if"],
    pat: "vpc peer-link",
    help: "Make this port-channel the peer-link",
    run: (c) => {
      const e = needVpc(c);
      if (e) return e;
      return ifEdit(c, (i, sw) => {
        if (!i.name.startsWith("port-channel")) return "% vpc commands go on a port-channel";
        if (sw.intfs.some((x) => x !== i && x.vpc === "peer-link")) return "% A peer-link is already configured";
        i.vpc = "peer-link";
        return "Please note that spanning tree port type is changed to \"network\" port type on vPC peer-link.\nThis will enable spanning tree Bridge Assurance on vPC peer-link provided the STP Bridge Assurance\n(which is enabled by default) is not disabled.";
      });
    },
  },
  {
    modes: ["if"],
    pat: "vpc <n>",
    help: "Make this port-channel a vPC",
    run: (c, a) => {
      const e = needVpc(c);
      if (e) return e;
      return ifEdit(c, (i, sw) => {
        if (!i.name.startsWith("port-channel")) return "% vpc commands go on a port-channel";
        const n = +a[0];
        if (sw.intfs.some((x) => x !== i && x.vpc === n)) return `% vPC ${n} is already used by another port-channel`;
        i.vpc = n;
      });
    },
  },
  { modes: ["if"], pat: "no vpc", help: "Remove the vPC number", run: (c) => ifEdit(c, (i) => void delete i.vpc) },
];

// ---------- matcher ----------
type Match = { cmd: Cmd; args: string[]; exact: number };

function normIf(t: string): string | null {
  let m = /^(?:e|et|eth|ethe|ether|ethern|etherne|ethernet)(\d+\/\d+)$/i.exec(t);
  if (m) return `Ethernet${m[1]}`;
  m = /^(?:po|port|port-|port-c|port-ch|port-cha|port-chan|port-chann|port-channe|port-channel)(\d+)$/i.exec(t);
  if (m) return `port-channel${m[1]}`;
  return null;
}

function tokMatch(pt: string, t: string): { ok: boolean; exact?: boolean; arg?: string } {
  if (pt === "<n>") return { ok: /^\d+$/.test(t), arg: t };
  if (pt === "<w>") return { ok: /^[\w.-]+$/.test(t), arg: t };
  if (pt === "<ip>") return { ok: /^(\d{1,3}\.){3}\d{1,3}$/.test(t), arg: t };
  if (pt === "<vl>") return { ok: /^[\d,-]+$/.test(t), arg: t };
  if (pt === "<if>") {
    const n = normIf(t);
    return { ok: !!n, arg: n ?? t };
  }
  const tl = t.toLowerCase();
  return { ok: pt.startsWith(tl), exact: pt === tl };
}

const inMode = (c: Cmd, m: VpcMode["m"]) => c.modes === "any" || c.modes.includes(m);

function normalize(tokens: string[]): string[] {
  // "ethernet 1/10" → "ethernet1/10", "port-channel 10" → "port-channel10"
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const next = tokens[i + 1] ?? "";
    if ((/^e[a-z]*$/i.test(tokens[i]) && /^\d+\/\d+$/.test(next)) || (/^po[a-z-]*$/i.test(tokens[i]) && /^\d+$/.test(next) && normIf(tokens[i] + next))) {
      out.push(tokens[i] + next);
      i++;
    } else out.push(tokens[i]);
  }
  return out;
}

function findMatches(tokens: string[], mode: VpcMode["m"]): Match[] {
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

function partial(tokens: string[], mode: VpcMode["m"]) {
  return CMDS.some((cmd) => {
    if (!inMode(cmd, mode)) return false;
    const pts = cmd.pat.split(" ");
    return pts.length > tokens.length && tokens.every((t, i) => tokMatch(pts[i], t).ok);
  });
}

export function runVpcCli(raw: string, s: VpcSession, lab: VpcLab): VpcCliResult {
  let tokens = normalize(raw.trim().split(/\s+/).filter(Boolean));
  if (!tokens.length) return { out: "", session: s };
  const me = lab.switches.find((x) => x.id === s.sw)!;
  if (me.offline) return { out: `${s.sw} is powered off.`, session: s };
  if (tokens[0].toLowerCase() === "do" && s.mode.m !== "exec") tokens = tokens.slice(1);
  let mode = s.mode;
  let matches = findMatches(tokens, mode.m);
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
    const words = raw.trim().split(/\s+/);
    const at = raw.indexOf(words[Math.min(bad, words.length - 1)] ?? "");
    return { out: `${" ".repeat(vpcPrompt(s).length + Math.max(0, at))}^\n% Invalid command at '^' marker.`, session: s };
  }
  let l = lab;
  let edited = false;
  const session: VpcSession = { sw: s.sw, mode };
  const ctx: Ctx = {
    get lab() {
      return l;
    },
    s: session,
    get sw() {
      return l.switches.find((x) => x.id === s.sw)!;
    },
    get peer() {
      return l.switches.find((x) => x.id !== s.sw)!;
    },
    edit: () => {
      if (!edited) {
        l = structuredClone(l);
        edited = true;
      }
      return l;
    },
    r: () => evaluate(l),
    mode: (m) => {
      session.mode = m;
    },
  } as Ctx;
  const out = matches[0].cmd.run(ctx, matches[0].args) ?? "";
  return { out, session: { ...session }, lab: edited ? l : undefined };
}

const modesFor = (s: VpcSession): VpcMode["m"][] => (s.mode.m === "exec" || s.mode.m === "config" ? [s.mode.m] : [s.mode.m, "config"]);

export function vpcHelp(raw: string, s: VpcSession): string {
  const text = raw.replace(/\?$/, "");
  const endsWord = !/\s$/.test(text) && text.length > 0;
  const tokens = normalize(text.trim().split(/\s+/).filter(Boolean));
  const fixed = endsWord ? tokens.slice(0, -1) : tokens;
  const last = endsWord ? tokens[tokens.length - 1] : "";
  const seen = new Map<string, string>();
  for (const cmd of CMDS) {
    if (!modesFor(s).some((m) => inMode(cmd, m))) continue;
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
  const desc: Record<string, string> = { "<n>": "Number", "<w>": "Name", "<ip>": "IPv4 address", "<if>": "Interface, e.g. ethernet1/10 or port-channel10", "<vl>": "VLAN list, e.g. 100,110 or 100-110" };
  return [...seen.entries()]
    .sort(([a], [b]) => (a === "<cr>" ? 1 : b === "<cr>" ? -1 : a.localeCompare(b)))
    .map(([k, h]) => `  ${k.padEnd(22)}${desc[k] ?? h}`)
    .join("\n");
}

export function vpcComplete(raw: string, s: VpcSession): string | null {
  if (/\s$/.test(raw) || !raw.trim()) return null;
  const tokens = normalize(raw.trim().split(/\s+/));
  const fixed = tokens.slice(0, -1);
  const last = tokens[tokens.length - 1].toLowerCase();
  const opts = new Set<string>();
  for (const cmd of CMDS) {
    if (!modesFor(s).some((m) => inMode(cmd, m))) continue;
    const pts = cmd.pat.split(" ");
    if (pts.length <= fixed.length || !fixed.every((t, i) => tokMatch(pts[i], t).ok)) continue;
    const next = pts[fixed.length];
    if (!next.startsWith("<") && next.startsWith(last)) opts.add(next);
  }
  if (opts.size !== 1) return null;
  return `${raw.replace(/\S+$/, "")}${[...opts][0]} `;
}
