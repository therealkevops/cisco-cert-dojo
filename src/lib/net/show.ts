import type { Net } from "./engine";
import { aclSpecToIos, dottedMask } from "./ip";

// IOS-flavoured renderings of simulator state, so the inspector reads like a
// console and the same text can back a CLI later.

const pad = (s: string | number, n: number) => String(s).padEnd(n);

export function showIpIntBrief(net: Net, dev: string): string {
  const d = net.device(dev);
  const rows = [pad("Interface", 22) + pad("IP-Address", 16) + pad("Status", 22) + "Protocol"];
  const l3 = new Map(net.l3Ifs(dev).map((i) => [i.name, i]));
  for (const p of d.ports) {
    const ip = l3.get(p.name)?.cidr.ip ?? "unassigned";
    const status = p.shutdown ? "administratively down" : net.peer(dev, p.name) ? (net.linkUp(dev, p.name) ? "up" : "down") : "down";
    rows.push(pad(p.name, 22) + pad(ip, 16) + pad(status, 22) + (net.linkUp(dev, p.name) ? "up" : "down"));
  }
  for (const s of d.svis ?? []) {
    const up = net.sviUp(d, s.vlan);
    rows.push(pad(`Vlan${s.vlan}`, 22) + pad(s.ip.split("/")[0] || "unassigned", 16) + pad(s.shutdown ? "administratively down" : up ? "up" : "down", 22) + (up ? "up" : "down"));
  }
  return rows.join("\n");
}

export function showIpRoute(net: Net, dev: string): string {
  const routes = net.routes(dev);
  const head = "Codes: L - local, C - connected, S - static\n\nGateway of last resort is " + (routes.find((r) => r.prefix === "0.0.0.0/0")?.via ?? "not set") + "\n";
  if (!routes.length) return head + "\n(empty: no interfaces are up)";
  const order = { S: 0, C: 1, L: 2 } as const;
  const lines = routes
    .slice()
    .sort((a, b) => a.cidr.net - b.cidr.net || order[a.code] - order[b.code])
    .map((r) => {
      const ad = r.code === "S" ? " [1/0]" : "";
      const tail = r.via ? ` via ${r.via}` : ` is directly connected, ${r.iface}`;
      return `${r.code}${r.prefix === "0.0.0.0/0" ? "*" : " "}    ${r.prefix}${ad}${tail}`;
    });
  return head + "\n" + lines.join("\n");
}

export function showMacTable(net: Net, dev: string): string {
  const t = net.macTables.get(dev);
  const rows = ["          Mac Address Table", "-------------------------------------------", "Vlan    Mac Address       Type        Ports", "----    -----------       --------    -----"];
  const list = t ? [...t.values()].sort((a, b) => a.vlan - b.vlan || a.mac.localeCompare(b.mac)) : [];
  for (const e of list) rows.push(`${pad(e.vlan, 8)}${pad(e.mac, 18)}${pad("DYNAMIC", 12)}${e.port}`);
  rows.push(`Total Mac Addresses for this criterion: ${list.length}`);
  if (!list.length) rows.push("\n(empty: send some traffic and watch it learn)");
  return rows.join("\n");
}

export function showArp(net: Net, dev: string): string {
  const d = net.device(dev);
  const t = net.arpTables.get(dev);
  const own = net.l3Ifs(dev).map((i) => ({ ip: i.cidr.ip, mac: i.mac, iface: i.name, age: "-" }));
  const learned = t ? [...t.entries()].map(([ip, e]) => ({ ip, mac: e.mac, iface: e.iface, age: "0" })) : [];
  if (net.isHost(d)) {
    const rows = ["  Internet Address      Physical Address      Type"];
    for (const e of learned) rows.push(`  ${pad(e.ip, 22)}${pad(e.mac, 22)}dynamic`);
    if (!learned.length) rows.push("  (no entries)");
    return rows.join("\n");
  }
  const rows = ["Protocol  Address          Age (min)  Hardware Addr   Type   Interface"];
  for (const e of [...own, ...learned]) rows.push(`Internet  ${pad(e.ip, 17)}${pad(e.age, 11)}${pad(e.mac, 16)}ARPA   ${e.iface}`);
  return rows.join("\n");
}

export function showSpanningTree(net: Net, dev: string, vlan: number): string {
  const d = net.device(dev);
  const v = net.stp(vlan);
  const bid = v.bridgeId[dev];
  const root = v.rootOf[dev];
  if (!bid || !root) return `VLAN${String(vlan).padStart(4, "0")}\n  Spanning tree instance does not exist (no active ports carry VLAN ${vlan}).`;
  const rb = v.bridgeId[root];
  const rootPort = d.ports.find((p) => v.roles[`${dev}|${p.name}`] === "root");
  const lines = [
    `VLAN${String(vlan).padStart(4, "0")}`,
    `  Spanning tree enabled protocol rstp`,
    `  Root ID    Priority    ${rb.prio}`,
    `             Address     ${rb.mac}`,
    root === dev ? `             This bridge is the root` : `             Cost        ${v.cost[dev]}\n             Port        ${rootPort?.name ?? "-"}`,
    ``,
    `  Bridge ID  Priority    ${bid.prio}  (priority ${bid.prio - vlan} sys-id-ext ${vlan})`,
    `             Address     ${bid.mac}`,
    ``,
    `Interface           Role Sts Cost      Type`,
    `------------------- ---- --- --------- ----`,
  ];
  for (const p of d.ports) {
    const role = v.roles[`${dev}|${p.name}`];
    if (!role) continue;
    lines.push(`${pad(p.name, 20)}${pad(role === "root" ? "Root" : role === "desig" ? "Desg" : "Altn", 5)}${pad(role === "alt" ? "BLK" : "FWD", 4)}${pad(4, 10)}P2p`);
  }
  return lines.join("\n");
}

export function showVlanBrief(net: Net, dev: string): string {
  const d = net.device(dev);
  const rows = ["VLAN Name                             Status    Ports", "---- -------------------------------- --------- -------------------------------"];
  const vlans = new Set<number>([1]);
  for (const p of d.ports) if (net.portMode(d, p) === "access") vlans.add(p.vlan ?? 1);
  for (const s of d.svis ?? []) vlans.add(s.vlan);
  for (const v of [...vlans].sort((a, b) => a - b)) {
    const ports = d.ports.filter((p) => net.portMode(d, p) === "access" && (p.vlan ?? 1) === v).map((p) => p.name);
    rows.push(`${pad(v, 5)}${pad(v === 1 ? "default" : `VLAN${String(v).padStart(4, "0")}`, 33)}${pad("active", 10)}${ports.join(", ")}`);
  }
  const trunks = d.ports.filter((p) => net.portMode(d, p) === "trunk");
  if (trunks.length) {
    rows.push("", "Port        Mode   Native  Vlans allowed");
    for (const t of trunks) rows.push(`${pad(t.name, 12)}${pad("on", 7)}${pad(t.native ?? 1, 8)}${t.allowed ? t.allowed.join(",") : "1-4094"}`);
  }
  return rows.join("\n");
}

export function ipconfig(net: Net, dev: string): string {
  const d = net.device(dev);
  const nic = net.l3Ifs(dev)[0];
  if (!nic) return "No IP configuration.";
  return [
    `Ethernet adapter ${nic.name}:`,
    ``,
    `   Link status . . . . . . . . . : ${nic.up ? "connected" : "disconnected"}`,
    `   Physical Address. . . . . . . : ${nic.mac}`,
    `   IPv4 Address. . . . . . . . . : ${nic.cidr.ip}`,
    `   Subnet Mask . . . . . . . . . : ${dottedMask(nic.cidr.len)}`,
    `   Default Gateway . . . . . . . : ${d.gateway ?? ""}`,
  ].join("\n");
}

export function showAcls(net: Net, dev: string): string {
  const d = net.device(dev);
  const names = Object.keys(d.acls ?? {});
  if (!names.length) return "No access lists configured.";
  const lines: string[] = [];
  for (const n of names) {
    lines.push(`Extended IP access list ${n}`);
    d.acls![n].forEach((a, i) => lines.push(`    ${a.seq ?? (i + 1) * 10} ${a.action} ${a.proto} ${a.src} ${a.dst}`));
    const where = [...d.ports, ...(d.svis ?? []).map((s) => ({ ...s, name: `Vlan${s.vlan}` }))]
      .flatMap((p) => [p.aclIn === n ? `${p.name} in` : "", p.aclOut === n ? `${p.name} out` : ""])
      .filter(Boolean);
    lines.push(`    (applied: ${where.length ? where.join(", ") : "not applied"})`);
  }
  return lines.join("\n");
}

const LONG: Record<string, string> = { Gi: "GigabitEthernet", Fa: "FastEthernet", Te: "TenGigabitEthernet", Po: "Port-channel" };

/** "Gi0/1" → "GigabitEthernet0/1". */
export function longIf(name: string): string {
  const m = name.match(/^([A-Za-z]+)(.*)$/);
  return m && LONG[m[1]] ? LONG[m[1]] + m[2] : name;
}

export function showRun(net: Net, dev: string): string {
  const d = net.device(dev);
  const L: string[] = ["Building configuration...", "", "Current configuration:", "!", `hostname ${d.id}`, "!"];
  if (net.isSwitch(d)) {
    L.push("spanning-tree mode rapid-pvst");
    if (d.stpPriority !== undefined) L.push(`spanning-tree vlan 1-4094 priority ${d.stpPriority}`);
    for (const [v, p] of Object.entries(d.stpVlanPriority ?? {})) L.push(`spanning-tree vlan ${v} priority ${p}`);
    L.push("!");
  }
  if (d.kind === "l3switch") L.push("ip routing", "!");
  if (d.kind === "switch" && d.gateway) L.push(`ip default-gateway ${d.gateway}`, "!");
  for (const p of d.ports) {
    L.push(`interface ${longIf(p.name)}`);
    if (p.description) L.push(` description ${p.description}`);
    const mode = net.portMode(d, p);
    if (net.isSwitch(d)) {
      if (mode === "routed") L.push(" no switchport");
      else if (mode === "trunk") {
        if (p.native && p.native !== 1) L.push(` switchport trunk native vlan ${p.native}`);
        if (p.allowed) L.push(` switchport trunk allowed vlan ${p.allowed.join(",")}`);
        L.push(" switchport mode trunk");
      } else {
        if ((p.vlan ?? 1) !== 1) L.push(` switchport access vlan ${p.vlan}`);
        L.push(" switchport mode access");
      }
    }
    if (p.ip && mode === "routed") {
      const [ip, len] = p.ip.split("/");
      L.push(` ip address ${ip} ${dottedMask(Number(len))}`);
    } else if (mode === "routed" && !net.isHost(d)) L.push(" no ip address");
    if (p.aclIn) L.push(` ip access-group ${p.aclIn} in`);
    if (p.aclOut) L.push(` ip access-group ${p.aclOut} out`);
    if (p.shutdown) L.push(" shutdown");
    L.push("!");
  }
  for (const s of d.svis ?? []) {
    const [ip, len] = s.ip.split("/");
    L.push(`interface Vlan${s.vlan}`, s.ip ? ` ip address ${ip} ${dottedMask(Number(len))}` : " no ip address");
    if (s.aclIn) L.push(` ip access-group ${s.aclIn} in`);
    if (s.aclOut) L.push(` ip access-group ${s.aclOut} out`);
    if (s.shutdown) L.push(" shutdown");
    L.push("!");
  }
  for (const r of d.routes ?? []) {
    const [ip, len] = r.prefix.split("/");
    L.push(`ip route ${ip} ${dottedMask(Number(len))} ${r.via}`);
  }
  if (d.routes?.length) L.push("!");
  for (const [name, aces] of Object.entries(d.acls ?? {})) {
    L.push(`ip access-list extended ${name}`);
    aces.forEach((a, i) => L.push(` ${a.seq ?? (i + 1) * 10} ${a.action} ${a.proto} ${aclSpecToIos(a.src)} ${aclSpecToIos(a.dst)}`));
    L.push("!");
  }
  L.push("end");
  return L.join("\n");
}

export function showIntTrunk(net: Net, dev: string): string {
  const d = net.device(dev);
  const trunks = d.ports.filter((p) => net.portMode(d, p) === "trunk" && net.linkUp(dev, p.name));
  if (!trunks.length) return "";
  const vl = net.vlans();
  const rows = ["Port        Mode             Encapsulation  Status        Native vlan"];
  for (const t of trunks) rows.push(`${pad(t.name, 12)}${pad("on", 17)}${pad("802.1q", 15)}${pad("trunking", 14)}${t.native ?? 1}`);
  rows.push("", "Port        Vlans allowed on trunk");
  for (const t of trunks) rows.push(`${pad(t.name, 12)}${t.allowed ? t.allowed.join(",") : "1-4094"}`);
  rows.push("", "Port        Vlans in spanning tree forwarding state and not pruned");
  for (const t of trunks) {
    const fwd = vl.filter((v) => net.carries(d, t, v) && net.forwarding(dev, t.name, v));
    rows.push(`${pad(t.name, 12)}${fwd.join(",") || "none"}`);
  }
  return rows.join("\n");
}

export function showIntStatus(net: Net, dev: string): string {
  const d = net.device(dev);
  const rows = ["Port         Name               Status       Vlan       Duplex  Speed Type"];
  for (const p of d.ports) {
    const status = p.shutdown ? "disabled" : net.linkUp(dev, p.name) ? "connected" : "notconnect";
    const mode = net.portMode(d, p);
    const vlan = mode === "trunk" ? "trunk" : mode === "routed" ? "routed" : String(p.vlan ?? 1);
    rows.push(`${pad(p.name, 13)}${pad((p.description ?? "").slice(0, 18), 19)}${pad(status, 13)}${pad(vlan, 11)}${pad("a-full", 8)}${pad("a-1000", 6)}10/100/1000BaseTX`);
  }
  return rows.join("\n");
}

export function showCdp(net: Net, dev: string): string {
  const d = net.device(dev);
  const caps: Record<string, string> = { router: "R", switch: "S I", l3switch: "R S I", pc: "H", server: "H" };
  const rows = [
    "Capability Codes: R - Router, S - Switch, H - Host, I - IGMP",
    "",
    "Device ID        Local Intrfce     Holdtme    Capability  Platform  Port ID",
  ];
  for (const p of d.ports) {
    const peer = net.peer(dev, p.name);
    if (!peer || !net.linkUp(dev, p.name)) continue;
    const pd = net.device(peer[0]);
    if (net.isHost(pd)) continue; // hosts do not speak CDP
    rows.push(`${pad(pd.id, 17)}${pad(p.name, 18)}${pad(150, 11)}${pad(caps[pd.kind], 12)}${pad(pd.kind === "router" ? "vRouter" : "vSwitch", 10)}${peer[1]}`);
  }
  if (rows.length === 3) rows.push("(no neighbors: CDP needs an up link to a router or switch)");
  return rows.join("\n");
}

export function showVersion(net: Net, dev: string): string {
  const d = net.device(dev);
  return [
    `Wire Room simulated ${d.kind === "router" ? "router" : d.kind === "l3switch" ? "multilayer switch" : "switch"}, IOS-style CLI`,
    `${d.id} uptime is 0 minutes`,
    `${d.ports.length} Gigabit Ethernet interfaces`,
    "",
    "Simulated: VLANs, 802.1Q, RSTP, ARP, static routing, extended ACLs, ICMP.",
    "Not simulated yet: dynamic routing protocols, EtherChannel, NAT, subinterfaces.",
  ].join("\n");
}
