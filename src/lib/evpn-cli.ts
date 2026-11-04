// NX-OS-style CLI for the VXLAN EVPN Lab, built on the shared command-table engine.
// Show commands read `evaluate`, so their output always matches what's graded.

import { CmdTable, type CliCmd } from "./cli-table";
import { evaluate, intf, loIp, nveState, vlanOfVni, vniOfVlan, type EFabric, type EIntf, type ESwitch, type EvpnResult, type EVrf, type Nbr } from "./evpn";

export type EMode =
  | { m: "exec" }
  | { m: "config" }
  | { m: "if"; name: string }
  | { m: "vlan"; id: number }
  | { m: "nve" }
  | { m: "nvevni"; vni: number }
  | { m: "evpn" }
  | { m: "evpnvni"; vni: number }
  | { m: "vrf"; name: string }
  | { m: "vrfaf"; name: string }
  | { m: "bgp" }
  | { m: "bgpnbr"; ip: string }
  | { m: "bgpnbraf"; ip: string }
  | { m: "ospf" };
export type ESession = { sw: string; mode: EMode };
export type ECliResult = { out: string; session: ESession; fabric?: EFabric };

const SUFFIX: Record<EMode["m"], string> = {
  exec: "",
  config: "(config)",
  if: "(config-if)",
  vlan: "(config-vlan)",
  nve: "(config-if-nve)",
  nvevni: "(config-if-nve-vni)",
  evpn: "(config-evpn)",
  evpnvni: "(config-evpn-evi)",
  vrf: "(config-vrf)",
  vrfaf: "(config-vrf-af-ipv4)",
  bgp: "(config-router)",
  bgpnbr: "(config-router-neighbor)",
  bgpnbraf: "(config-router-neighbor-af)",
  ospf: "(config-router)",
};
export const evpnPrompt = (s: ESession) => `${s.sw}${SUFFIX[s.mode.m]}# `;

/** The parent chain of a mode, nearest first (config last). */
function parents(m: EMode): EMode[] {
  switch (m.m) {
    case "nvevni":
      return [{ m: "nve" }, { m: "config" }];
    case "evpnvni":
      return [{ m: "evpn" }, { m: "config" }];
    case "vrfaf":
      return [{ m: "vrf", name: m.name }, { m: "config" }];
    case "bgpnbraf":
      return [{ m: "bgpnbr", ip: m.ip }, { m: "bgp" }, { m: "config" }];
    case "bgpnbr":
      return [{ m: "bgp" }, { m: "config" }];
    case "exec":
    case "config":
      return [];
    default:
      return [{ m: "config" }];
  }
}

type Ctx = { f: EFabric; s: ESession; sw: ESwitch; edit: () => void; r: () => EvpnResult; mode: (m: EMode) => void };
const ANY = "any" as const;
const CFG = ["config", "if", "vlan", "nve", "nvevni", "evpn", "evpnvni", "vrf", "vrfaf", "bgp", "bgpnbr", "bgpnbraf", "ospf"];

// ---------- helpers ----------
const pad = (s: string | number, n: number) => String(s).padEnd(n);
const line = (n = 80) => "-".repeat(n);
const ipOnly = (c?: string) => c?.split("/")[0];
const short = (n: string) => n.replace("Ethernet", "Eth").replace("loopback", "Lo");
const routerMac = (s: ESwitch) => `5254.00${s.id.replace(/\D/g, "").padStart(2, "0")}.ab01`;


function needIf(c: Ctx) {
  return intf(c.sw, (c.s.mode as { name: string }).name)!;
}

function runningIntf(i: EIntf): string[] {
  const out = [`interface ${i.name}`];
  if (i.mtu !== 1500 && !i.name.startsWith("loopback") && i.name !== "nve1") out.push(`  mtu ${i.mtu}`);
  if (i.vrf) out.push(`  vrf member ${i.vrf}`);
  if (i.ipForward) out.push("  ip forward");
  if (i.ip) out.push(`  ip address ${i.ip}`);
  if (i.ospf) out.push(`  ip router ospf UNDERLAY area ${i.ospf}`);
  if (i.anycast) out.push("  fabric forwarding mode anycast-gateway");
  out.push(i.shutdown ? "  shutdown" : "  no shutdown");
  return out;
}

function runningNve(s: ESwitch): string[] {
  if (!s.nve) return [];
  const n = s.nve;
  const out = ["interface nve1", n.shutdown ? "  shutdown" : "  no shutdown"];
  if (n.hostReachBgp) out.push("  host-reachability protocol bgp");
  if (n.source) out.push(`  source-interface ${n.source}`);
  for (const m of n.members) {
    out.push(`  member vni ${m.vni}${m.l3 ? " associate-vrf" : ""}`);
    if (m.suppressArp) out.push("    suppress-arp");
    if (m.ir) out.push("    ingress-replication protocol bgp");
  }
  return out;
}

function runningBgp(s: ESwitch): string[] {
  const out = [`router bgp ${s.asn}`, `  router-id ${loIp(s, 0)}`, "  address-family l2vpn evpn"];
  for (const n of s.nbrs) {
    out.push(`  neighbor ${n.ip}`);
    if (n.remoteAs) out.push(`    remote-as ${n.remoteAs}`);
    if (n.updateSource) out.push(`    update-source ${n.updateSource}`);
    if (n.evpn) {
      out.push("    address-family l2vpn evpn");
      if (n.sendExt) out.push("      send-community", "      send-community extended");
      if (n.rrClient) out.push("      route-reflector-client");
    }
  }
  for (const v of s.vrfs) out.push(`  vrf ${v.name}`, "    address-family ipv4 unicast", "      advertise l2vpn evpn");
  return out;
}

function runningConfig(s: ESwitch, section?: "bgp" | "evpn" | "vrf"): string {
  const feats = s.features;
  const out: string[] = ["!Command: show running-config", ""];
  if (!section) {
    if (feats.nvOverlay) out.push("feature nv overlay");
    if (feats.ospf) out.push("feature ospf");
    if (feats.bgp) out.push("feature bgp");
    if (feats.interfaceVlan) out.push("feature interface-vlan");
    if (feats.vnSegment) out.push("feature vn-segment-vlan-based");
    if (feats.fabricForwarding) out.push("feature fabric forwarding");
    if (s.nvOverlayEvpn) out.push("nv overlay evpn");
    if (s.anycastMac) out.push(`fabric forwarding anycast-gateway-mac ${s.anycastMac}`);
    out.push("");
    for (const v of s.vlans) out.push(`vlan ${v.id}`, ...(v.vni ? [`  vn-segment ${v.vni}`] : []));
    out.push("");
  }
  if (!section || section === "vrf")
    for (const v of s.vrfs) out.push(`vrf context ${v.name}`, ...(v.vni ? [`  vni ${v.vni}`] : []), "  rd auto", "  address-family ipv4 unicast", "    route-target both auto", ...v.imp.map((x) => `    route-target import ${x} evpn`), ...v.exp.map((x) => `    route-target export ${x} evpn`), "");
  if (!section) {
    for (const i of s.intfs) if (i.name !== "nve1") out.push(...runningIntf(i), "");
    out.push(...runningNve(s), "");
    out.push(`router ospf ${s.ospfTag}`, `  router-id ${loIp(s, 0)}`, "");
  }
  if (!section || section === "bgp") out.push(...runningBgp(s), "");
  if ((!section || section === "evpn") && s.evpn.length) {
    out.push("evpn");
    for (const e of s.evpn) out.push(`  vni ${e.vni} l2`, "    rd auto", ...e.imp.map((x) => `    route-target import ${x}`), ...e.exp.map((x) => `    route-target export ${x}`));
  }
  return out.join("\n").trimEnd();
}

// ---------- show ----------
function showNvePeers(c: Ctx) {
  if (c.sw.role !== "leaf") return "% Invalid command: this switch has no NVE interface";
  const r = c.r();
  const rows = r.nvePeers[c.sw.id] ?? [];
  return [`Interface Peer-IP          State LearnType Uptime   Router-Mac`, "--------- ---------------  ----- --------- -------- -----------------", ...rows.map((p) => `nve1      ${pad(p.ip, 17)}${pad(p.up ? "Up" : "Down", 6)}${pad("CP", 10)}${pad(p.up ? "2d04h" : "-", 9)}${p.up ? routerMac(c.f.switches.find((s) => s.id === p.peer)!) : "n/a"}`)].join("\n");
}

function showNveVni(c: Ctx) {
  if (c.sw.role !== "leaf" || !c.sw.nve) return "% Invalid command: this switch has no NVE interface";
  const st = nveState(c.sw);
  const rows = c.sw.nve.members.map((m) => {
    const vlan = vlanOfVni(c.sw, m.vni);
    const vrf = m.l3 ? c.sw.vrfs.find((v) => v.vni === m.vni) : undefined;
    const up = st.up && !!vlan && (!m.l3 || !!vrf);
    const mode = c.sw.nve!.hostReachBgp ? "CP" : "DP";
    return `nve1      ${pad(m.vni, 9)}${pad(m.l3 ? "n/a" : m.ir ? "UnicastBGP" : "-", 17)}${pad(up ? "Up" : "Down", 6)}${pad(mode, 5)}${pad(m.l3 ? "L3" : "L2", 5)}${pad(m.l3 ? `[${vrf?.name ?? "?"}]` : `[${vlan ?? "?"}]`, 10)}${m.suppressArp ? "SA" : ""}`;
  });
  return ["Codes: CP - Control Plane        DP - Data Plane", "       UC - Unconfigured         SA - Suppress ARP", "", "Interface VNI      Multicast-group   State Mode Type [BD/VRF]      Flags", "--------- -------- ----------------- ----- ---- ---- ------------- -----", ...rows].join("\n");
}

function showNveIf(c: Ctx) {
  if (!c.sw.nve) return "% Invalid interface nve1";
  const st = nveState(c.sw);
  const src = c.sw.nve.source ? intf(c.sw, c.sw.nve.source) : undefined;
  return [`Interface: nve1, State: ${st.up ? "Up" : "Down"}, encapsulation: VXLAN`, ` VPC Capability: VPC-VIP-Only [not-notified]`, ` Local Router MAC: ${routerMac(c.sw)}`, ` Host Learning Mode: ${c.sw.nve.hostReachBgp ? "Control-Plane" : "Data-Plane"}`, ` Source-Interface: ${c.sw.nve.source ?? "-"} (primary: ${ipOnly(src?.ip) ?? "0.0.0.0"}, secondary: 0.0.0.0)`, ...(st.up ? [] : [` Reason: ${st.why}`])].join("\n");
}

function showBgpSummary(c: Ctx) {
  const r = c.r();
  const mine = c.sw.role === "leaf" ? r.bgp.filter((b) => b.leaf === c.sw.id) : r.bgp.filter((b) => b.spine === c.sw.id);
  const out = [`BGP summary information for VRF default, address family L2VPN EVPN`, `BGP router identifier ${loIp(c.sw, 0)}, local AS number ${c.sw.asn}`, "", "Neighbor        V    AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd"];
  for (const n of c.sw.nbrs) {
    const other = c.f.switches.find((s) => loIp(s, 0) === n.ip);
    const b = other ? mine.find((x) => x.leaf === other.id || x.spine === other.id) : undefined;
    let rcvd = 0;
    if (b?.up && other)
      rcvd = c.sw.role === "leaf" ? r.imported.filter((i) => i.leaf === c.sw.id && i.via.includes(other.id)).length : r.routes.filter((x) => x.origin === other.id && other.nbrs.find((y) => y.ip === loIp(c.sw, 0))?.evpn).length;
    out.push(`${pad(n.ip, 16)}4 ${String(n.remoteAs ?? 0).padStart(5)} ${String(b?.up ? 1834 : 0).padStart(7)} ${String(b?.up ? 1790 : 12).padStart(7)} ${String(b?.up ? 912 : 0).padStart(8)}    0    0 ${pad(b?.up ? "2d03h" : "00:04:51", 9)}${b?.up ? rcvd : "Active"}`);
  }
  return out.join("\n");
}

function routeKey(rt: { type: number; mac?: string; ip?: string; nh: string }) {
  return rt.type === 2 ? `[2]:[0]:[0]:[48]:[${rt.mac}]:[32]:[${rt.ip}]/272` : `[3]:[0]:[32]:[${rt.nh}]/88`;
}

function showBgpEvpn(c: Ctx) {
  const r = c.r();
  const out = [`BGP routing table information for VRF default, address family L2VPN EVPN`, `BGP table version is 912, Local Router ID is ${loIp(c.sw, 0)}`, "Status: s-suppressed, x-deleted, S-stale, d-dampened, h-history, *-valid, >-best", "Path type: i-internal, e-external, c-confed, l-local, a-aggregate, r-redist, I-injected", ""];
  if (c.sw.role === "leaf") {
    const local = r.routes.filter((x) => x.origin === c.sw.id);
    const remote = r.imported.filter((x) => x.leaf === c.sw.id);
    const groups = new Map<string, string[]>();
    for (const x of local) {
      const rd = `${loIp(c.sw, 0)}:${32767 + (vlanOfVni(c.sw, x.vni) ?? 0)}`;
      groups.set(rd, [...(groups.get(rd) ?? []), `*>l${routeKey(x)}`, `                      ${x.nh}                        100      32768 i`, `      Extcommunity: ${x.rts.map((t) => `RT:${t}`).join(" ")} ENCAP:8`]);
    }
    for (const x of remote) {
      const o = c.f.switches.find((s) => s.id === x.route.origin)!;
      const rd = `${loIp(o, 0)}:${32767 + (vlanOfVni(o, x.route.vni) ?? 0)}`;
      groups.set(rd, [...(groups.get(rd) ?? []), `*>i${routeKey(x.route)}`, `                      ${x.route.nh}                        100          0 i`, `      Extcommunity: ${x.route.rts.length ? x.route.rts.map((t) => `RT:${t}`).join(" ") : "(none)"} ENCAP:8${x.l2 || x.l3 ? "" : "   (not imported into any VNI or VRF)"}`]);
    }
    for (const [rd, lines] of groups) out.push(`Route Distinguisher: ${rd}`, ...lines, "");
  } else {
    for (const x of r.routes) {
      const o = c.f.switches.find((s) => s.id === x.origin)!;
      if (!r.bgp.some((b) => b.leaf === o.id && b.spine === c.sw.id && b.up)) continue;
      out.push(`Route Distinguisher: ${loIp(o, 0)}:${32767 + (vlanOfVni(o, x.vni) ?? 0)}`, `*>i${routeKey(x)}`, `                      ${x.nh}                        100          0 i`, "");
    }
  }
  return out.join("\n").trimEnd();
}

function showL2route(c: Ctx) {
  if (c.sw.role !== "leaf") return "% Invalid command on a spine";
  const r = c.r();
  const out = ["Flags -(Rmac):Router MAC (Stt):Static (L):Local (R):Remote", "Topology    Mac Address    Prod   Flags         Seq No     Next-Hops", "----------- -------------- ------ ------------- ---------- ----------------"];
  for (const h of c.f.hosts.filter((x) => x.leaf === c.sw.id)) out.push(`${pad(h.vlan, 12)}${pad(h.mac, 15)}${pad("Local", 7)}${pad("L,", 14)}${pad(0, 11)}${h.port.replace("Ethernet", "Eth")}`);
  for (const im of r.imported.filter((x) => x.leaf === c.sw.id && x.route.type === 2 && x.l2)) out.push(`${pad(vlanOfVni(c.sw, im.route.vni)!, 12)}${pad(im.route.mac!, 15)}${pad("BGP", 7)}${pad("SplRcv", 14)}${pad(0, 11)}${im.route.nh} (Label: ${im.route.vni})`);
  return out.join("\n");
}

function showIpRouteVrf(c: Ctx, vrf: string) {
  if (c.sw.role !== "leaf") return `% VRF ${vrf} not found`;
  const v = c.sw.vrfs.find((x) => x.name === vrf);
  if (!v) return `% VRF ${vrf} not found`;
  const r = c.r();
  const out = [`IP Route Table for VRF "${vrf}"`, "'*' denotes best ucast next-hop", ""];
  for (const i of c.sw.intfs.filter((x) => x.name.startsWith("Vlan") && x.vrf === vrf && x.ip && !x.shutdown && !x.ipForward)) {
    const [ip, len] = i.ip!.split("/");
    const net = ip.split(".").slice(0, 3).join(".") + ".0";
    out.push(`${net}/${len}, ubest/mbest: 1/0, attached`, `    *via ${ip}, ${i.name}, [0/0], 2d04h, direct, tag 12345`);
  }
  for (const im of r.imported.filter((x) => x.leaf === c.sw.id && x.route.type === 2 && x.l3)) {
    const o = c.f.switches.find((s) => s.id === im.route.origin)!;
    out.push(`${im.route.ip}/32, ubest/mbest: 1/0`, `    *via ${im.route.nh}%default, [200/0], 2d03h, bgp-${c.sw.asn}, internal, tag ${o.asn}, segid: ${im.route.l3vni} tunnelid: 0x${im.route.nh.split(".").map((x) => (+x).toString(16).padStart(2, "0")).join("")} encap: VXLAN`);
  }
  return out.join("\n");
}

function showOspfNbrs(c: Ctx) {
  const r = c.r();
  const rows = r.adj.filter((a) => a.a[0] === c.sw.id || a.b[0] === c.sw.id);
  return [` OSPF Process ID ${c.sw.ospfTag} VRF default`, ` Total number of neighbors: ${rows.filter((x) => x.state !== "DOWN").length}`, " Neighbor ID     Pri State            Up Time  Address         Interface", ...rows.filter((x) => x.state !== "DOWN").map((x) => {
    const [me, peer] = x.a[0] === c.sw.id ? [x.a, x.b] : [x.b, x.a];
    const ps = c.f.switches.find((s) => s.id === peer[0])!;
    return ` ${pad(loIp(ps, 0)!, 15)}   1 ${pad(x.state === "FULL" ? "FULL/ -" : "EXSTART/ -", 17)}${pad(x.state === "FULL" ? "2d04h" : "00:00:38", 9)}${pad(loIp(ps, 0)!, 16)}${short(me[1])}`;
  })].join("\n");
}

function showIpRoute(c: Ctx) {
  const r = c.r();
  const out = ['IP Route Table for VRF "default"', ""];
  for (const s of c.f.switches)
    for (const i of s.intfs.filter((x) => x.name.startsWith("loopback") && x.ip && x.ospf && !x.shutdown)) {
      if (s.id === c.sw.id) out.push(`${ipOnly(i.ip)}/32, ubest/mbest: 2/0, attached`, `    *via ${ipOnly(i.ip)}, ${short(i.name)}, [0/0], 2d04h, local`);
      else if (r.reach[c.sw.id].includes(s.id)) out.push(`${ipOnly(i.ip)}/32, ubest/mbest: 1/0`, `    *via ${loIp(s, 0)}, [110/41], 2d04h, ospf-${c.sw.ospfTag}, intra`);
    }
  return out.join("\n");
}

function showIntf(c: Ctx, name: string) {
  const i = intf(c.sw, name);
  if (!i) return `% Invalid interface ${name}`;
  const r = c.r();
  const adj = r.adj.find((a) => (a.a[0] === c.sw.id && a.a[1] === i.name) || (a.b[0] === c.sw.id && a.b[1] === i.name));
  const up = !i.shutdown && (!adj || true);
  return [`${i.name} is ${up ? "up" : "down (Administratively down)"}`, `admin state is ${i.shutdown ? "down" : "up"}`, ...(i.ip ? [`  Internet Address is ${i.ip}`] : []), `  MTU ${i.mtu} bytes, BW ${i.name.startsWith("Eth") ? "400000000 Kbit" : "8000000 Kbit"}, DLY 10 usec`, ...(adj ? [`  OSPF neighbor on this link: ${adj.state}${adj.why ? ` (${adj.why})` : ""}`] : [])].join("\n");
}

function showVxlan(c: Ctx) {
  return ["Vlan            VN-Segment", "====            ==========", ...c.sw.vlans.filter((v) => v.vni).map((v) => `${pad(v.id, 16)}${v.vni}`)].join("\n");
}

// ---------- config ----------
const edit = (c: Ctx, fn: () => string | void) => {
  c.edit();
  return fn();
};
const nveMember = (c: Ctx) => c.sw.nve!.members.find((m) => m.vni === (c.s.mode as { vni: number }).vni)!;
const evpnVni = (c: Ctx) => c.sw.evpn.find((e) => e.vni === (c.s.mode as { vni: number }).vni)!;
const curVrf = (c: Ctx): EVrf => c.sw.vrfs.find((v) => v.name === (c.s.mode as { name: string }).name)!;
const curNbr = (c: Ctx): Nbr => c.sw.nbrs.find((n) => n.ip === (c.s.mode as { ip: string }).ip)!;
const leafOnly = (c: Ctx) => (c.sw.role !== "leaf" ? "% This command is for leaf (VTEP) switches in this lab" : undefined);

const FEATURES: [string, keyof ESwitch["features"]][] = [
  ["ospf", "ospf"],
  ["bgp", "bgp"],
  ["nv overlay", "nvOverlay"],
  ["vn-segment-vlan-based", "vnSegment"],
  ["interface-vlan", "interfaceVlan"],
  ["fabric forwarding", "fabricForwarding"],
];

const rtCmds = (dir: "import" | "export" | "both"): CliCmd<Ctx>[] => [
  { modes: ["evpnvni"], pat: `route-target ${dir} auto`, help: "Route target derived as ASN:VNI", run: (c) => edit(c, () => setRt(evpnVni(c), dir, "auto", true)) },
  { modes: ["evpnvni"], pat: `route-target ${dir} <rt>`, help: "Explicit route target", run: (c, a) => edit(c, () => setRt(evpnVni(c), dir, a[0], true)) },
  { modes: ["evpnvni"], pat: `no route-target ${dir} auto`, help: "Remove", run: (c) => edit(c, () => setRt(evpnVni(c), dir, "auto", false)) },
  { modes: ["evpnvni"], pat: `no route-target ${dir} <rt>`, help: "Remove", run: (c, a) => edit(c, () => setRt(evpnVni(c), dir, a[0], false)) },
  { modes: ["vrfaf"], pat: `route-target ${dir} auto evpn`, help: "EVPN route target derived from the L3VNI", run: (c) => edit(c, () => setRt(curVrf(c), dir, "auto", true)) },
  { modes: ["vrfaf"], pat: `route-target ${dir} <rt> evpn`, help: "Explicit EVPN route target", run: (c, a) => edit(c, () => setRt(curVrf(c), dir, a[0], true)) },
  { modes: ["vrfaf"], pat: `no route-target ${dir} auto evpn`, help: "Remove", run: (c) => edit(c, () => setRt(curVrf(c), dir, "auto", false)) },
  { modes: ["vrfaf"], pat: `no route-target ${dir} <rt> evpn`, help: "Remove", run: (c, a) => edit(c, () => setRt(curVrf(c), dir, a[0], false)) },
  { modes: ["vrfaf"], pat: `route-target ${dir} auto`, help: "Non-EVPN route target (not used by this lab)", run: () => undefined },
];
function setRt(o: { imp: string[]; exp: string[] }, dir: "import" | "export" | "both", rt: string, add: boolean) {
  for (const k of dir === "both" ? (["imp", "exp"] as const) : dir === "import" ? (["imp"] as const) : (["exp"] as const)) o[k] = add ? [...new Set([...o[k], rt])] : o[k].filter((x) => x !== rt);
}

const CMDS: CliCmd<Ctx>[] = [
  { modes: ["exec"], pat: "configure terminal", help: "Enter configuration mode", run: (c) => c.mode({ m: "config" }) },
  { modes: ["exec"], pat: "configure", help: "Enter configuration mode", run: (c) => c.mode({ m: "config" }) },
  { modes: ANY, pat: "end", help: "Return to exec mode", run: (c) => c.mode({ m: "exec" }) },
  { modes: ANY, pat: "exit", help: "Leave the current mode", run: (c) => c.mode(c.s.mode.m === "exec" || c.s.mode.m === "config" ? { m: "exec" } : parents(c.s.mode)[0]) },

  { modes: ANY, pat: "show nve peers", help: "Remote VTEPs", run: (c) => showNvePeers(c) },
  { modes: ANY, pat: "show nve vni", help: "VNIs on nve1 and their state", run: (c) => showNveVni(c) },
  { modes: ANY, pat: "show nve interface nve1", help: "NVE interface state and source", run: (c) => showNveIf(c) },
  { modes: ANY, pat: "show bgp l2vpn evpn summary", help: "EVPN BGP sessions", run: (c) => showBgpSummary(c) },
  { modes: ANY, pat: "show bgp l2vpn evpn", help: "EVPN routes with route targets", run: (c) => showBgpEvpn(c) },
  { modes: ANY, pat: "show l2route evpn mac all", help: "MACs learned locally and through EVPN", run: (c) => showL2route(c) },
  { modes: ANY, pat: "show ip route vrf <w>", help: "Tenant VRF routing table", run: (c, a) => showIpRouteVrf(c, a[0]) },
  { modes: ANY, pat: "show ip route", help: "Underlay routing table", run: (c) => showIpRoute(c) },
  { modes: ANY, pat: "show ip ospf neighbors", help: "Underlay OSPF neighbours", run: (c) => showOspfNbrs(c) },
  { modes: ANY, pat: "show interface <if>", help: "Interface state and MTU", run: (c, a) => showIntf(c, a[0]) },
  { modes: ANY, pat: "show vxlan", help: "VLAN to VNI mapping", run: (c) => showVxlan(c) },
  { modes: ANY, pat: "show running-config", help: "Full configuration", run: (c) => runningConfig(c.sw) },
  { modes: ANY, pat: "show running-config bgp", help: "BGP configuration", run: (c) => runningConfig(c.sw, "bgp") },
  { modes: ANY, pat: "show running-config evpn", help: "EVPN VNI configuration", run: (c) => runningConfig(c.sw, "evpn") },
  { modes: ANY, pat: "show running-config vrf", help: "VRF configuration", run: (c) => runningConfig(c.sw, "vrf") },
  {
    modes: ANY,
    pat: "show running-config interface <if>",
    help: "One interface",
    run: (c, a) => {
      if (a[0] === "nve1") return runningNve(c.sw).join("\n") || "% Invalid interface nve1";
      const i = intf(c.sw, a[0]);
      return i ? runningIntf(i).join("\n") : `% Invalid interface ${a[0]}`;
    },
  },

  // global
  ...FEATURES.flatMap(([kw, key]): CliCmd<Ctx>[] => [
    { modes: CFG, pat: `feature ${kw}`, help: `Enable ${kw}`, run: (c) => edit(c, () => void (c.sw.features[key] = true)) },
    { modes: CFG, pat: `no feature ${kw}`, help: `Disable ${kw}`, run: (c) => edit(c, () => void (c.sw.features[key] = false)) },
  ]),
  { modes: CFG, pat: "nv overlay evpn", help: "Use BGP EVPN as the VXLAN control plane", run: (c) => edit(c, () => void (c.sw.nvOverlayEvpn = true)) },
  { modes: CFG, pat: "no nv overlay evpn", help: "Disable the EVPN control plane", run: (c) => edit(c, () => void (c.sw.nvOverlayEvpn = false)) },
  { modes: CFG, pat: "fabric forwarding anycast-gateway-mac <mac>", help: "Distributed anycast gateway MAC (same on every leaf)", run: (c, a) => edit(c, () => void (c.sw.anycastMac = a[0])) },
  {
    modes: CFG,
    pat: "vlan <n>",
    help: "Create or enter a VLAN",
    run: (c, a) => {
      const id = +a[0];
      if (id < 1 || id > 4094) return "% VLAN must be 1-4094";
      edit(c, () => void (c.sw.vlans.some((v) => v.id === id) || c.sw.vlans.push({ id })));
      c.mode({ m: "vlan", id });
    },
  },
  {
    modes: ["vlan"],
    pat: "vn-segment <n>",
    help: "Map this VLAN to a VNI",
    run: (c, a) => {
      if (!c.sw.features.vnSegment) return "% Invalid command: enable feature vn-segment-vlan-based first";
      const vni = +a[0];
      const id = (c.s.mode as { id: number }).id;
      const other = c.sw.vlans.find((v) => v.vni === vni && v.id !== id);
      if (other) return `% VNI ${vni} is already mapped to VLAN ${other.id}`;
      edit(c, () => void (c.sw.vlans.find((v) => v.id === id)!.vni = vni));
    },
  },
  { modes: ["vlan"], pat: "no vn-segment", help: "Remove the VNI mapping", run: (c) => edit(c, () => void delete c.sw.vlans.find((v) => v.id === (c.s.mode as { id: number }).id)!.vni) },
  { modes: ["vlan"], pat: "name <w>", help: "VLAN name", run: () => undefined },

  {
    modes: CFG,
    pat: "interface <if>",
    help: "Configure an interface",
    run: (c, a) => {
      const name = a[0];
      if (name === "nve1") {
        const e = leafOnly(c);
        if (e) return e;
        if (!c.sw.features.nvOverlay) return "% Invalid interface: enable feature nv overlay first";
        edit(c, () => void (c.sw.nve ??= { shutdown: true, hostReachBgp: false, members: [] }));
        return c.mode({ m: "nve" });
      }
      if (!intf(c.sw, name)) {
        if (name.startsWith("Ethernet")) return `% Invalid interface ${name}`;
        if (name.startsWith("Vlan") && !c.sw.features.interfaceVlan) return "% Invalid interface: enable feature interface-vlan first";
        edit(c, () => void c.sw.intfs.push({ name, mtu: 1500, shutdown: name.startsWith("Vlan") }));
      }
      c.mode({ m: "if", name: intf(c.sw, name)!.name });
    },
  },
  {
    modes: ["if"],
    pat: "mtu <n>",
    help: "Interface MTU",
    run: (c, a) => {
      const n = +a[0];
      if (n < 576 || n > 9216) return "% MTU must be 576-9216";
      return edit(c, () => void (needIf(c).mtu = n));
    },
  },
  { modes: ["if"], pat: "shutdown", help: "Disable", run: (c) => edit(c, () => void (needIf(c).shutdown = true)) },
  { modes: ["if"], pat: "no shutdown", help: "Enable", run: (c) => edit(c, () => void (needIf(c).shutdown = false)) },
  { modes: ["if"], pat: "ip address <cidr>", help: "IPv4 address", run: (c, a) => edit(c, () => void (needIf(c).ip = a[0])) },
  {
    modes: ["if"],
    pat: "ip router ospf <w> area <area>",
    help: "Run OSPF on this interface",
    run: (c, a) => {
      if (!c.sw.features.ospf) return "% Invalid command: enable feature ospf first";
      if (a[0] !== c.sw.ospfTag) return `% OSPF process ${a[0]} isn't configured (the process here is ${c.sw.ospfTag})`;
      return edit(c, () => void (needIf(c).ospf = a[1]));
    },
  },
  { modes: ["if"], pat: "no ip router ospf <w> area <area>", help: "Remove OSPF from this interface", run: (c) => edit(c, () => void delete needIf(c).ospf) },
  { modes: ["if"], pat: "ip ospf network point-to-point", help: "Point-to-point network type", run: () => undefined },
  { modes: ["if"], pat: "vrf member <w>", help: "Put the SVI in a tenant VRF", run: (c, a) => (c.sw.vrfs.some((v) => v.name === a[0]) ? edit(c, () => void (needIf(c).vrf = a[0])) : `% VRF ${a[0]} does not exist`) },
  { modes: ["if"], pat: "fabric forwarding mode anycast-gateway", help: "Make this SVI a distributed anycast gateway", run: (c) => (c.sw.features.fabricForwarding ? edit(c, () => void (needIf(c).anycast = true)) : "% Invalid command: enable feature fabric forwarding first") },
  { modes: ["if"], pat: "no fabric forwarding mode anycast-gateway", help: "Remove anycast gateway mode", run: (c) => edit(c, () => void (needIf(c).anycast = false)) },
  { modes: ["if"], pat: "ip forward", help: "Route on this SVI without an address (L3VNI SVI)", run: (c) => edit(c, () => void (needIf(c).ipForward = true)) },

  // NVE
  { modes: ["nve"], pat: "source-interface <if>", help: "VTEP source loopback", run: (c, a) => edit(c, () => void (c.sw.nve!.source = a[0])) },
  { modes: ["nve"], pat: "host-reachability protocol bgp", help: "Learn hosts through BGP EVPN", run: (c) => edit(c, () => void (c.sw.nve!.hostReachBgp = true)) },
  { modes: ["nve"], pat: "no host-reachability protocol bgp", help: "Flood-and-learn", run: (c) => edit(c, () => void (c.sw.nve!.hostReachBgp = false)) },
  { modes: ["nve"], pat: "shutdown", help: "Disable nve1", run: (c) => edit(c, () => void (c.sw.nve!.shutdown = true)) },
  { modes: ["nve"], pat: "no shutdown", help: "Enable nve1", run: (c) => edit(c, () => void (c.sw.nve!.shutdown = false)) },
  ...(["", " associate-vrf"] as const).map(
    (sfx): CliCmd<Ctx> => ({
      modes: ["nve"],
      pat: `member vni <n>${sfx}`,
      help: sfx ? "Add an L3VNI (tenant VRF)" : "Add an L2VNI",
      run: (c, a) => {
        const vni = +a[0];
        const l3 = !!sfx;
        const cur = c.sw.nve!.members.find((m) => m.vni === vni);
        if (cur && !!cur.l3 !== l3) return `% VNI ${vni} is already a member as ${cur.l3 ? "an L3VNI" : "an L2VNI"}; remove it first`;
        edit(c, () => void (cur || c.sw.nve!.members.push({ vni, l3 })));
        if (!l3) c.mode({ m: "nvevni", vni });
      },
    }),
  ),
  ...(["no member vni <n>", "no member vni <n> associate-vrf"] as const).map((pat): CliCmd<Ctx> => ({ modes: ["nve"], pat, help: "Remove a VNI", run: (c, a) => edit(c, () => void (c.sw.nve!.members = c.sw.nve!.members.filter((m) => m.vni !== +a[0]))) })),
  { modes: ["nvevni"], pat: "ingress-replication protocol bgp", help: "BUM traffic by unicast copies to BGP-learned VTEPs", run: (c) => edit(c, () => void (nveMember(c).ir = true)) },
  { modes: ["nvevni"], pat: "suppress-arp", help: "Answer ARP locally from EVPN information", run: (c) => edit(c, () => void (nveMember(c).suppressArp = true)) },
  { modes: ["nvevni"], pat: "no suppress-arp", help: "Stop ARP suppression", run: (c) => edit(c, () => void (nveMember(c).suppressArp = false)) },

  // EVPN
  { modes: CFG, pat: "evpn", help: "EVPN VNI settings (RD/RT)", run: (c) => (leafOnly(c) ?? c.mode({ m: "evpn" })) || undefined },
  {
    modes: ["evpn"],
    pat: "vni <n> l2",
    help: "Settings for an L2VNI",
    run: (c, a) => {
      const vni = +a[0];
      edit(c, () => void (c.sw.evpn.some((e) => e.vni === vni) || c.sw.evpn.push({ vni, imp: [], exp: [] })));
      c.mode({ m: "evpnvni", vni });
    },
  },
  { modes: ["evpn"], pat: "no vni <n> l2", help: "Remove", run: (c, a) => edit(c, () => void (c.sw.evpn = c.sw.evpn.filter((e) => e.vni !== +a[0]))) },
  { modes: ["evpnvni"], pat: "rd auto", help: "Automatic RD (router-id:VLAN-based)", run: () => undefined },
  ...rtCmds("import"),
  ...rtCmds("export"),
  ...rtCmds("both"),

  // VRF
  {
    modes: CFG,
    pat: "vrf context <w>",
    help: "Create or enter a VRF",
    run: (c, a) => {
      edit(c, () => void (c.sw.vrfs.some((v) => v.name === a[0]) || c.sw.vrfs.push({ name: a[0], imp: [], exp: [] })));
      c.mode({ m: "vrf", name: a[0] });
    },
  },
  { modes: ["vrf"], pat: "vni <n>", help: "The VRF's L3VNI", run: (c, a) => edit(c, () => void (curVrf(c).vni = +a[0])) },
  { modes: ["vrf"], pat: "no vni <n>", help: "Remove the L3VNI", run: (c) => edit(c, () => void delete curVrf(c).vni) },
  { modes: ["vrf"], pat: "rd auto", help: "Automatic RD", run: () => undefined },
  { modes: ["vrf"], pat: "address-family ipv4 unicast", help: "IPv4 route targets", run: (c) => c.mode({ m: "vrfaf", name: (c.s.mode as { name: string }).name }) },

  // BGP
  {
    modes: CFG,
    pat: "router bgp <n>",
    help: "Enter BGP",
    run: (c, a) => {
      if (!c.sw.features.bgp) return "% Invalid command: enable feature bgp first";
      if (+a[0] !== c.sw.asn) return `% BGP is already running with AS ${c.sw.asn}`;
      c.mode({ m: "bgp" });
    },
  },
  { modes: ["bgp", "ospf"], pat: "router-id <ip>", help: "Router ID", run: () => undefined },
  { modes: ["bgp"], pat: "address-family l2vpn evpn", help: "Global EVPN address family", run: () => undefined },
  {
    modes: ["bgp"],
    pat: "neighbor <ip>",
    help: "Configure a neighbour",
    run: (c, a) => {
      edit(c, () => void (c.sw.nbrs.some((n) => n.ip === a[0]) || c.sw.nbrs.push({ ip: a[0], evpn: false, sendExt: false })));
      c.mode({ m: "bgpnbr", ip: a[0] });
    },
  },
  {
    modes: ["bgp"],
    pat: "neighbor <ip> remote-as <n>",
    help: "Configure a neighbour and its AS",
    run: (c, a) => {
      edit(c, () => {
        const n = c.sw.nbrs.find((x) => x.ip === a[0]);
        if (n) n.remoteAs = +a[1];
        else c.sw.nbrs.push({ ip: a[0], remoteAs: +a[1], evpn: false, sendExt: false });
      });
      c.mode({ m: "bgpnbr", ip: a[0] });
    },
  },
  { modes: ["bgp"], pat: "no neighbor <ip>", help: "Remove a neighbour", run: (c, a) => edit(c, () => void (c.sw.nbrs = c.sw.nbrs.filter((n) => n.ip !== a[0]))) },
  { modes: ["bgpnbr"], pat: "remote-as <n>", help: "Neighbour AS", run: (c, a) => edit(c, () => void (curNbr(c).remoteAs = +a[0])) },
  { modes: ["bgpnbr"], pat: "update-source <if>", help: "Source the session from this interface", run: (c, a) => edit(c, () => void (curNbr(c).updateSource = a[0])) },
  { modes: ["bgpnbr"], pat: "no update-source <if>", help: "Remove", run: (c) => edit(c, () => void delete curNbr(c).updateSource) },
  { modes: ["bgpnbr"], pat: "address-family l2vpn evpn", help: "Activate EVPN with this neighbour", run: (c) => (edit(c, () => void (curNbr(c).evpn = true)), c.mode({ m: "bgpnbraf", ip: (c.s.mode as { ip: string }).ip })) },
  { modes: ["bgpnbr"], pat: "no address-family l2vpn evpn", help: "Deactivate EVPN", run: (c) => edit(c, () => void (curNbr(c).evpn = false)) },
  { modes: ["bgpnbraf"], pat: "send-community", help: "Send standard communities", run: () => undefined },
  { modes: ["bgpnbraf"], pat: "send-community extended", help: "Send extended communities (route targets)", run: (c) => edit(c, () => void (curNbr(c).sendExt = true)) },
  { modes: ["bgpnbraf"], pat: "send-community both", help: "Send standard and extended communities", run: (c) => edit(c, () => void (curNbr(c).sendExt = true)) },
  { modes: ["bgpnbraf"], pat: "no send-community extended", help: "Stop sending extended communities", run: (c) => edit(c, () => void (curNbr(c).sendExt = false)) },
  { modes: ["bgpnbraf"], pat: "route-reflector-client", help: "Reflect routes to and from this iBGP peer", run: (c) => (c.sw.role !== "spine" ? "% Only the spines are route reflectors in this lab" : edit(c, () => void (curNbr(c).rrClient = true))) },
  { modes: ["bgpnbraf"], pat: "no route-reflector-client", help: "Stop reflecting", run: (c) => edit(c, () => void (curNbr(c).rrClient = false)) },

  // OSPF
  { modes: CFG, pat: "router ospf <w>", help: "Enter OSPF", run: (c, a) => (a[0] !== c.sw.ospfTag ? `% Use the existing process tag ${c.sw.ospfTag}` : c.mode({ m: "ospf" })) },
];

function normIf(t: string): string | null {
  let m = /^(?:e|et|eth|ethe|ether|ethern|etherne|ethernet)(\d+\/\d+)$/i.exec(t);
  if (m) return `Ethernet${m[1]}`;
  m = /^(?:lo|loop|loopback)(\d+)$/i.exec(t);
  if (m) return `loopback${m[1]}`;
  m = /^(?:vl|vlan|interface-vlan)(\d+)$/i.exec(t);
  if (m) return `Vlan${m[1]}`;
  if (/^nve1$/i.test(t)) return "nve1";
  return null;
}

const TABLE = new CmdTable<Ctx>(
  CMDS,
  {
    "<n>": { test: (t) => (/^\d+$/.test(t) ? t : null), help: "Number" },
    "<w>": { test: (t) => (/^[\w.-]+$/.test(t) ? t : null), help: "Name" },
    "<ip>": { test: (t) => (/^(\d{1,3}\.){3}\d{1,3}$/.test(t) ? t : null), help: "IPv4 address" },
    "<cidr>": { test: (t) => (/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(t) ? t : null), help: "Address/length, e.g. 10.0.0.11/32" },
    "<if>": { test: normIf, help: "Interface, e.g. ethernet1/49, loopback1, vlan10, nve1" },
    "<rt>": { test: (t) => (/^\d+:\d+$/.test(t) ? t : null), help: "Route target ASN:NN, e.g. 65000:10010" },
    "<mac>": { test: (t) => (/^[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}$/i.test(t) ? t.toLowerCase() : null), help: "MAC address, e.g. 2020.0000.00aa" },
    "<area>": { test: (t) => (t === "0" || t === "0.0.0.0" ? "0.0.0.0" : /^(\d{1,3}\.){3}\d{1,3}$/.test(t) ? t : /^\d+$/.test(t) ? `0.0.0.${t}` : null), help: "Area, e.g. 0.0.0.0" },
  },
  (tokens) => {
    const out: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const joined = tokens[i] + (tokens[i + 1] ?? "");
      // Join "ethernet 1/49" / "loopback 1" / "vlan 10" only where an interface name is expected.
      const ifSlot = i > 0 && /^(int|inte|inter|interf|interfa|interfac|interface|source-interface|update-source)$/i.test(tokens[i - 1]);
      if (ifSlot && /^(e[a-z]*|lo[a-z]*|vl[a-z]*)$/i.test(tokens[i]) && /^[\d/]+$/.test(tokens[i + 1] ?? "") && normIf(joined)) {
        out.push(joined);
        i++;
      } else out.push(tokens[i]);
    }
    return out;
  },
);

const modesFor = (m: EMode) => [m.m, ...parents(m).map((p) => p.m)];

export function runEvpnCli(raw: string, s: ESession, fabric: EFabric): ECliResult {
  const tokens = TABLE.tokens(raw);
  if (!tokens.length) return { out: "", session: s };
  let text = raw;
  if (tokens[0].toLowerCase() === "do" && s.mode.m !== "exec") text = raw.replace(/^\s*do\s+/i, "");
  const chain = parents(s.mode);
  const d = TABLE.dispatch(text, s.mode.m, chain.map((p) => p.m), evpnPrompt(s).length);
  if (!d.ok) return { out: d.out, session: s };
  const mode = d.mode === s.mode.m ? s.mode : chain.find((p) => p.m === d.mode)!;
  let f = fabric;
  let edited = false;
  const session: ESession = { sw: s.sw, mode };
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
    },
    r: () => evaluate(f),
    mode: (m) => {
      session.mode = m;
    },
  } as Ctx;
  const out = d.cmd.run(ctx, d.args) ?? "";
  return { out, session: { ...session }, fabric: edited ? f : undefined };
}

export const evpnHelp = (raw: string, s: ESession) => TABLE.help(raw, modesFor(s.mode));
export const evpnComplete = (raw: string, s: ESession) => TABLE.complete(raw, modesFor(s.mode));
