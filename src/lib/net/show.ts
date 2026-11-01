import { parentOf, type Net } from "./engine";
import type { Device, FhrpGroup, IfOspf } from "./types";
import { aclSpecToIos, dottedMask, inCidr, intToIp, ipToInt, parseCidr } from "./ip";

// IOS-flavoured renderings of simulator state, so the inspector reads like a
// console and the same text can back a CLI later.

const pad = (s: string | number, n: number) => String(s).padEnd(n);

export function showIpIntBrief(net: Net, dev: string): string {
  const d = net.device(dev);
  const rows = [pad("Interface", 22) + pad("IP-Address", 16) + pad("Status", 22) + "Protocol"];
  const l3 = new Map(net.l3Ifs(dev).map((i) => [i.name, i]));
  for (const p of byParent(d.ports)) {
    const ip = l3.get(p.name)?.cidr.ip ?? "unassigned";
    const up = /^Po\d+$/.test(p.name) ? net.linkUp(dev, p.name) : net.physUp(dev, p.name);
    const status = p.shutdown ? "administratively down" : up ? "up" : "down";
    rows.push(pad(p.name, 22) + pad(ip, 16) + pad(status, 22) + (up ? "up" : "down"));
  }
  for (const s of d.svis ?? []) {
    const up = net.sviUp(d, s.vlan);
    rows.push(pad(`Vlan${s.vlan}`, 22) + pad(s.ip.split("/")[0] || "unassigned", 16) + pad(s.shutdown ? "administratively down" : up ? "up" : "down", 22) + (up ? "up" : "down"));
  }
  return rows.join("\n");
}

export function showIpRoute(net: Net, dev: string, only?: string): string {
  const routes = net
    .routes(dev)
    .filter((r) => !only || (only === "ospf" ? r.code.startsWith("O") : only === "eigrp" ? r.code.startsWith("D") : only === "bgp" ? r.code === "B" : only === "static" ? r.code === "S" : r.code === "C" || r.code === "L"));
  const gw = routes.find((r) => r.prefix === "0.0.0.0/0");
  const head =
    "Codes: L - local, C - connected, S - static, O - OSPF, B - BGP, D - EIGRP, EX - EIGRP external\n       IA - OSPF inter area, E2 - OSPF external type 2, * - candidate default\n\nGateway of last resort is " +
    (gw?.via ? `${gw.via} to network 0.0.0.0` : "not set") +
    "\n";
  if (!routes.length) return head + "\n(empty: no interfaces are up)";
  const order: Record<string, number> = { S: 0, B: 1, D: 2, "D EX": 3, "O*E2": 4, O: 5, "O IA": 6, C: 7, L: 8 };
  const lines = routes
    .slice()
    .sort((a, b) => a.cidr.net - b.cidr.net || a.cidr.len - b.cidr.len || order[a.code] - order[b.code])
    .map((r) => {
      const code = r.code === "S" && r.prefix === "0.0.0.0/0" ? "S*" : r.code;
      const ad = r.code === "S" ? " [1/0]" : r.code === "B" || r.code.startsWith("D") ? ` [${r.ad}/${r.metric ?? 0}]` : r.code.startsWith("O") && r.iface !== "Null0" ? ` [110/${r.metric}]` : "";
      const tail =
        r.iface === "Null0"
          ? " is a summary, 00:01:12, Null0"
          : r.code === "B"
            ? ` via ${r.nh}, 00:02:41`
            : r.via
              ? ` via ${r.via}${r.code.startsWith("O") || r.code.startsWith("D") ? `, 00:01:12, ${r.iface}` : ""}`
              : ` is directly connected, ${r.iface}`;
      return `${pad(code, 9)}${r.prefix}${ad}${tail}`;
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
    `   DHCP Enabled. . . . . . . . . : ${d.dhcpClient ? "Yes" : "No"}`,
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

const LONG: Record<string, string> = { Gi: "GigabitEthernet", Fa: "FastEthernet", Te: "TenGigabitEthernet", Po: "Port-channel", Lo: "Loopback" };

/** "Gi0/1" → "GigabitEthernet0/1". */
/** Ports in display order: each subinterface right after its parent. */
function byParent<T extends { name: string }>(ports: T[]): T[] {
  const subs = ports.filter((p) => parentOf(p.name));
  const out: T[] = [];
  for (const p of ports) {
    if (parentOf(p.name)) continue;
    out.push(p, ...subs.filter((s) => parentOf(s.name) === p.name).sort((a, b) => +a.name.split(".")[1] - +b.name.split(".")[1]));
  }
  return out;
}

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
  for (const po of d.portChannels ?? []) {
    L.push(`interface ${longIf(po.name)}`);
    if (po.description) L.push(` description ${po.description}`);
    if ((po.mode ?? "access") === "trunk") {
      if (po.native && po.native !== 1) L.push(` switchport trunk native vlan ${po.native}`);
      if (po.allowed) L.push(` switchport trunk allowed vlan ${po.allowed.join(",")}`);
      L.push(" switchport mode trunk");
    } else {
      if ((po.vlan ?? 1) !== 1) L.push(` switchport access vlan ${po.vlan}`);
      L.push(" switchport mode access");
    }
    if (po.shutdown) L.push(" shutdown");
    L.push("!");
  }
  if (d.kind === "switch" && d.gateway) L.push(`ip default-gateway ${d.gateway}`, "!");
  const pos = (d.portChannels ?? []).map((x) => x.name);
  for (const p of byParent(d.ports.filter((x) => !pos.includes(x.name)))) {
    L.push(`interface ${longIf(p.name)}`);
    if (p.description) L.push(` description ${p.description}`);
    if (p.encap) L.push(` encapsulation dot1Q ${p.encap.vlan}${p.encap.native ? " native" : ""}`);
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
    L.push(...ifServiceLines(p));
    L.push(...ifOspfLines(d, p));
    if (p.channel) L.push(` channel-group ${p.channel.group} mode ${p.channel.mode}`);
    if (p.shutdown) L.push(" shutdown");
    L.push("!");
  }
  for (const s of d.svis ?? []) {
    const [ip, len] = s.ip.split("/");
    L.push(`interface Vlan${s.vlan}`, s.ip ? ` ip address ${ip} ${dottedMask(Number(len))}` : " no ip address");
    if (s.aclIn) L.push(` ip access-group ${s.aclIn} in`);
    if (s.aclOut) L.push(` ip access-group ${s.aclOut} out`);
    L.push(...ifServiceLines(s));
    L.push(...ifOspfLines(d, s));
    if (s.shutdown) L.push(" shutdown");
    L.push("!");
  }
  if (d.dhcp) {
    for (const e of d.dhcp.excluded) L.push(`ip dhcp excluded-address ${e.start}${e.end !== e.start ? ` ${e.end}` : ""}`);
    for (const p of d.dhcp.pools) {
      L.push(`ip dhcp pool ${p.name}`);
      if (p.network) {
        const [ip, len] = p.network.split("/");
        L.push(` network ${ip} ${dottedMask(Number(len))}`);
      }
      if (p.gateway) L.push(` default-router ${p.gateway}`);
      if (p.dns) L.push(` dns-server ${p.dns}`);
      if (p.domain) L.push(` domain-name ${p.domain}`);
    }
    L.push("!");
  }
  if (d.nat) {
    for (const p of d.nat.pools) L.push(`ip nat pool ${p.name} ${p.start} ${p.end} netmask ${dottedMask(p.len)}`);
    for (const r of d.nat.rules)
      L.push(
        r.kind === "static"
          ? `ip nat inside source static ${r.local} ${r.global}`
          : `ip nat inside source list ${r.acl} ${r.iface ? `interface ${longIf(r.iface)}` : `pool ${r.pool}`}${r.overload ? " overload" : ""}`,
      );
    L.push("!");
  }
  for (const [n, t] of Object.entries(d.tracks ?? {})) L.push(`track ${n} interface ${longIf(t.iface)} line-protocol`, "!");
  if (d.eigrp) {
    const e = d.eigrp;
    const net4 = (x: { ip: string; wildcard?: string }) => ` network ${x.ip}${x.wildcard ? ` ${x.wildcard}` : ""}`;
    if (e.name) {
      L.push(`router eigrp ${e.name}`, " !", ` address-family ipv4 unicast autonomous-system ${e.asn}`, " !");
      if (e.passiveDefault || e.noPassive?.length || e.passive?.length) {
        if (e.passiveDefault) L.push("  af-interface default", "   passive-interface", "  exit-af-interface", "  !");
        for (const x of e.noPassive ?? []) L.push(`  af-interface ${longIf(x)}`, "   no passive-interface", "  exit-af-interface", "  !");
        for (const x of e.passive ?? []) L.push(`  af-interface ${longIf(x)}`, "   passive-interface", "  exit-af-interface", "  !");
      }
      if (e.variance || e.redistribute?.length) {
        L.push("  topology base");
        if (e.variance) L.push(`   variance ${e.variance}`);
        for (const r of e.redistribute ?? []) L.push(`   redistribute ${r}`);
        L.push("  exit-af-topology");
      }
      for (const x of e.networks) L.push(" " + net4(x));
      if (e.routerId) L.push(`  eigrp router-id ${e.routerId}`);
      L.push(" exit-address-family", "!");
    } else {
      L.push(`router eigrp ${e.asn}`);
      for (const x of e.networks) L.push(net4(x));
      if (e.passiveDefault) L.push(" passive-interface default");
      for (const x of e.passive ?? []) L.push(` passive-interface ${longIf(x)}`);
      for (const x of e.noPassive ?? []) L.push(` no passive-interface ${longIf(x)}`);
      if (e.variance) L.push(` variance ${e.variance}`);
      for (const r of e.redistribute ?? []) L.push(` redistribute ${r}`);
      if (e.routerId) L.push(` eigrp router-id ${e.routerId}`);
      L.push("!");
    }
  }
  if (d.ospf) {
    const o = d.ospf;
    L.push(`router ospf ${o.pid}`);
    if (o.routerId) L.push(` router-id ${o.routerId}`);
    if (o.refBw) L.push(` auto-cost reference-bandwidth ${o.refBw}`);
    for (const r of o.ranges ?? []) {
      const [ip, len] = r.prefix.split("/");
      L.push(` area ${r.area} range ${ip} ${dottedMask(Number(len))}`);
    }
    if (o.passiveDefault) L.push(" passive-interface default");
    for (const x of o.passive ?? []) L.push(` passive-interface ${longIf(x)}`);
    for (const x of o.noPassive ?? []) L.push(` no passive-interface ${longIf(x)}`);
    for (const n of o.networks) L.push(` network ${n.ip} ${n.wildcard} area ${n.area}`);
    if (o.defaultOriginate) L.push(` default-information originate${o.defaultOriginate === "always" ? " always" : ""}`);
    L.push("!");
  }
  if (d.bgp) {
    const b = d.bgp;
    L.push(`router bgp ${b.asn}`);
    if (b.routerId) L.push(` bgp router-id ${b.routerId}`);
    for (const n of b.neighbors) {
      L.push(` neighbor ${n.ip} remote-as ${n.remoteAs}`);
      if (n.updateSource) L.push(` neighbor ${n.ip} update-source ${longIf(n.updateSource)}`);
      if (n.multihop) L.push(` neighbor ${n.ip} ebgp-multihop ${n.multihop}`);
      if (n.shutdown) L.push(` neighbor ${n.ip} shutdown`);
    }
    L.push(" !", " address-family ipv4");
    for (const pfx of b.networks) {
      const [ip, len] = pfx.split("/");
      L.push(`  network ${ip} mask ${dottedMask(Number(len))}`);
    }
    for (const r of b.redistribute ?? []) L.push(`  redistribute ${r}${r === "ospf" ? ` ${d.ospf?.pid ?? 1}` : ""}`);
    for (const n of b.neighbors) {
      L.push(`  neighbor ${n.ip} activate`);
      if (n.nextHopSelf) L.push(`  neighbor ${n.ip} next-hop-self`);
      if (n.weight !== undefined) L.push(`  neighbor ${n.ip} weight ${n.weight}`);
      if (n.routeMapIn) L.push(`  neighbor ${n.ip} route-map ${n.routeMapIn} in`);
      if (n.routeMapOut) L.push(`  neighbor ${n.ip} route-map ${n.routeMapOut} out`);
    }
    L.push(" exit-address-family", "!");
  }
  for (const [name, list] of Object.entries(d.prefixLists ?? {})) {
    for (const e of list) L.push(`ip prefix-list ${name} seq ${e.seq} ${e.action} ${e.prefix}${e.ge !== undefined ? ` ge ${e.ge}` : ""}${e.le !== undefined ? ` le ${e.le}` : ""}`);
    L.push("!");
  }
  for (const [name, list] of Object.entries(d.routeMaps ?? {})) {
    for (const e of list) {
      L.push(`route-map ${name} ${e.action} ${e.seq}`);
      if (e.matchPrefixList) L.push(` match ip address prefix-list ${e.matchPrefixList}`);
      if (e.matchAcl) L.push(` match ip address ${e.matchAcl}`);
      if (e.setLocalPref !== undefined) L.push(` set local-preference ${e.setLocalPref}`);
      if (e.setWeight !== undefined) L.push(` set weight ${e.setWeight}`);
      if (e.setMed !== undefined) L.push(` set metric ${e.setMed}`);
      if (e.setPrepend) L.push(` set as-path prepend ${e.setPrepend.join(" ")}`);
    }
    L.push("!");
  }
  for (const r of d.routes ?? []) {
    const [ip, len] = r.prefix.split("/");
    L.push(`ip route ${ip} ${dottedMask(Number(len))} ${r.via}`);
  }
  if (d.routes?.length) L.push("!");
  for (const [name, aces] of Object.entries(d.acls ?? {})) {
    const num = /^\d+$/.test(name) ? +name : 0;
    if (num >= 1 && num <= 99) aces.forEach((a) => L.push(`access-list ${name} ${a.action} ${aclSpecToIos(a.src).replace(/^host /, "")}`));
    else if (num >= 100) aces.forEach((a) => L.push(`access-list ${name} ${a.action} ${a.proto} ${aclSpecToIos(a.src)} ${aclSpecToIos(a.dst)}`));
    else {
      L.push(`ip access-list extended ${name}`);
      aces.forEach((a, i) => L.push(` ${a.seq ?? (i + 1) * 10} ${a.action} ${a.proto} ${aclSpecToIos(a.src)} ${aclSpecToIos(a.dst)}`));
    }
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
    const status = p.shutdown ? "disabled" : (/^Po\d+$/.test(p.name) ? net.linkUp(dev, p.name) : net.physUp(dev, p.name)) ? "connected" : "notconnect";
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
    const peer = net.physPeer(dev, p.name);
    if (!peer || !net.physUp(dev, p.name)) continue;
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
    "Simulated: VLANs, 802.1Q, RSTP, EtherChannel, ARP, static routing, OSPFv2, extended ACLs, NAT/PAT, DHCP, ICMP.",
    "Not simulated yet: EIGRP, BGP, subinterfaces.",
  ].join("\n");
}

function ifOspfLines(d: Device, p: { mtu?: number; ospf?: IfOspf }): string[] {
  const out: string[] = [];
  if (p.mtu && p.mtu !== 1500) out.push(` ip mtu ${p.mtu}`);
  const o = p.ospf;
  if (!o) return out;
  if (o.area !== undefined) out.push(` ip ospf ${d.ospf?.pid ?? 1} area ${o.area}`);
  if (o.network) out.push(` ip ospf network ${o.network}`);
  if (o.cost !== undefined) out.push(` ip ospf cost ${o.cost}`);
  if (o.priority !== undefined) out.push(` ip ospf priority ${o.priority}`);
  if (o.hello !== undefined) out.push(` ip ospf hello-interval ${o.hello}`);
  if (o.dead !== undefined) out.push(` ip ospf dead-interval ${o.dead}`);
  return out;
}

// --- OSPF --------------------------------------------------------------------------

const noOspf = (net: Net, dev: string) => !net.device(dev).ospf;

export function showOspfNbr(net: Net, dev: string): string {
  if (noOspf(net, dev)) return "";
  const rows = ["", "Neighbor ID     Pri   State           Dead Time   Address         Interface"];
  for (const n of net.ospf().nbrs.filter((x) => x.dev === dev)) {
    const state = `${n.state}/${n.role === "-" ? " -" : n.role}`;
    rows.push(`${pad(n.nbrRid, 16)}${pad(n.nbrPri, 6)}${pad(state, 16)}${pad("00:00:3" + (n.nbrRid.length % 10), 12)}${pad(n.nbrIp, 16)}${longIf(n.iface)}`);
  }
  return rows.join("\n");
}

export function showOspfIntBrief(net: Net, dev: string): string {
  if (noOspf(net, dev)) return "";
  const rows = ["Interface    PID   Area            IP Address/Mask    Cost  State Nbrs F/C"];
  const pid = net.device(dev).ospf!.pid;
  for (const i of net.ospf().ifaces.filter((x) => x.dev === dev)) {
    const state = i.passive && !i.loopback ? (i.state === "WAIT" ? "DR" : i.state) : i.state;
    rows.push(`${pad(i.name, 13)}${pad(pid, 6)}${pad(i.area, 16)}${pad(`${i.ip}/${i.cidr.len}`, 19)}${pad(i.cost, 6)}${pad(state, 6)}${i.full}/${i.seen}`);
  }
  return rows.join("\n");
}

export function showOspf(net: Net, dev: string): string {
  const d = net.device(dev);
  if (!d.ospf) return "%OSPF: Router process not running";
  const o = net.ospf();
  const rid = o.rid.get(dev);
  const mine = o.ifaces.filter((x) => x.dev === dev);
  const areas = [...new Set(mine.map((x) => x.area))].sort((a, b) => a - b);
  const L = [` Routing Process "ospf ${d.ospf.pid}" with ID ${rid ?? "0.0.0.0 (no router ID: configure one or add an IP address)"}`];
  if (o.abr.has(dev)) L.push(" It is an area border router");
  if (o.asbr.has(dev)) L.push(" It is an autonomous system boundary router");
  L.push(` Reference bandwidth unit is ${d.ospf.refBw ?? 100} mbps`, ` Number of areas in this router is ${areas.length}. ${areas.length} normal 0 stub 0 nssa`);
  for (const a of areas) {
    const ifs = mine.filter((x) => x.area === a);
    L.push(`    Area ${a === 0 ? "BACKBONE(0)" : a}`, `        Number of interfaces in this area is ${ifs.length} (${ifs.filter((x) => x.loopback).length} loopback)`);
    for (const r of (d.ospf.ranges ?? []).filter((x) => x.area === a)) L.push(`        Area ranges are`, `           ${r.prefix} Active(${1}) Advertise`);
  }
  return L.join("\n");
}

export function showIpProtocols(net: Net, dev: string): string {
  const d = net.device(dev);
  if (!d.ospf) return '*** IP Routing is NSF aware ***\n\n(no dynamic routing protocol is configured)';
  const o = d.ospf;
  const passive = net.ospf().ifaces.filter((x) => x.dev === dev && x.passive && !x.loopback).map((x) => x.name);
  return [
    `Routing Protocol is "ospf ${o.pid}"`,
    `  Router ID ${net.ospf().rid.get(dev) ?? "none"}`,
    `  Maximum path: 4`,
    `  Routing for Networks:`,
    ...o.networks.map((n) => `    ${n.ip} ${n.wildcard} area ${n.area}`),
    ...(passive.length ? [`  Passive Interface(s):`, ...passive.map((x) => `    ${longIf(x)}`)] : []),
    `  Distance: (default is 110)`,
  ].join("\n");
}

/** What `debug ip ospf adj` would have been printing about this router's failed adjacencies. */
export function debugOspfAdj(net: Net, dev: string): string {
  if (noOspf(net, dev)) return "OSPF adjacency debugging is on\n(no OSPF process on this device)";
  const probs = net.ospf().problems.filter((p) => p.dev === dev);
  const lines = ["OSPF adjacency debugging is on"];
  if (!probs.length) lines.push("(no adjacency errors: every OSPF neighbour that is reachable passes the hello checks)");
  for (const p of probs) lines.push(`*Oct 31 10:0${lines.length}:12: OSPF-1 ADJ   ${p.iface}: ${p.text}`);
  return lines.join("\n");
}

export function showEtherchannel(net: Net, dev: string): string {
  const list = net.bundles.filter((b) => b.dev === dev);
  const rows = [
    "Flags:  D - down        P - bundled in port-channel",
    "        I - stand-alone s - suspended",
    "        S - Layer2      U - in use",
    "",
    `Number of channel-groups in use: ${list.length}`,
    `Number of aggregators:           ${list.length}`,
    "",
    "Group  Port-channel  Protocol    Ports",
    "------+-------------+-----------+-----------------------------------------------",
  ];
  for (const b of list) {
    const ports = b.members.map((m) => `${m.port}(${m.flag})`).join("  ");
    rows.push(`${pad(b.po.slice(2), 7)}${pad(`${b.po}(${b.formed && net.linkUp(dev, b.po) ? "SU" : "SD"})`, 16)}${pad(b.protocol, 10)}${ports}`);
  }
  const why = list.flatMap((b) => b.members.filter((m) => m.why && m.flag !== "D").map((m) => `  ${m.port}: ${m.why}`));
  if (why.length) rows.push("", "Not bundled:", ...why);
  return rows.join("\n");
}

function ifServiceLines(p: { nat?: "inside" | "outside"; helpers?: string[]; bandwidth?: number; delay?: number; fhrp?: FhrpGroup[]; hsrpVersion?: 2 }): string[] {
  const out: string[] = [];
  if (p.bandwidth) out.push(` bandwidth ${p.bandwidth}`);
  if (p.delay) out.push(` delay ${p.delay}`);
  const hsrp = (p.fhrp ?? []).filter((g) => g.proto === "hsrp");
  if (p.hsrpVersion === 2 || hsrp.some((g) => g.version === 2)) out.push(" standby version 2");
  for (const g of p.fhrp ?? []) {
    const k = g.proto === "hsrp" ? "standby" : "vrrp";
    if (g.ip) out.push(` ${k} ${g.group} ip ${g.ip}`);
    if (g.priority !== undefined && g.priority !== 100) out.push(` ${k} ${g.group} priority ${g.priority}`);
    if (g.proto === "hsrp" && g.preempt) out.push(` standby ${g.group} preempt`);
    if (g.proto === "vrrp" && g.preempt === false) out.push(` no vrrp ${g.group} preempt`);
    for (const t of g.track ?? []) out.push(` ${k} ${g.group} track ${t.object ?? t.iface} decrement ${t.decrement}`);
  }
  for (const h of p.helpers ?? []) out.push(` ip helper-address ${h}`);
  if (p.nat) out.push(` ip nat ${p.nat}`);
  return out;
}

// --- NAT ---------------------------------------------------------------------------

export function showNatTranslations(net: Net, dev: string): string {
  const list = net.natTables.get(dev) ?? [];
  const d = net.device(dev);
  // Static mappings show even before any traffic uses them.
  const statics = (d.nat?.rules ?? []).filter((r) => r.kind === "static");
  const rows = ["Pro  Inside global         Inside local          Outside local         Outside global"];
  const sock = (ip?: string, id?: number) => (ip ? `${ip}${id !== undefined ? `:${id}` : ""}` : "---");
  for (const e of list) {
    if (e.kind === "static") continue;
    const pro = e.kind === "pat" || e.outside ? "icmp" : "---";
    rows.push(`${pad(pro, 5)}${pad(sock(e.insideGlobal, e.globalId), 22)}${pad(sock(e.insideLocal, e.localId), 22)}${pad(sock(e.outside, e.localId), 22)}${sock(e.outside, e.localId)}`);
  }
  for (const r of statics) if (r.kind === "static") rows.push(`${pad("---", 5)}${pad(r.global, 22)}${pad(r.local, 22)}${pad("---", 22)}---`);
  if (rows.length === 1) rows.push("(no translations yet: send traffic from an inside host to an outside address)");
  return rows.join("\n");
}

export function showNatStatistics(net: Net, dev: string): string {
  const d = net.device(dev);
  const list = net.natTables.get(dev) ?? [];
  const st = net.natStats.get(dev) ?? { hits: 0, misses: 0 };
  const role = (r: "inside" | "outside") => [...d.ports.filter((p) => p.nat === r).map((p) => longIf(p.name)), ...(d.svis ?? []).filter((s) => s.nat === r).map((s) => `Vlan${s.vlan}`)];
  const L = [
    `Total active translations: ${list.length + (d.nat?.rules ?? []).filter((r) => r.kind === "static" && !list.some((e) => e.insideLocal === r.local)).length} (${(d.nat?.rules ?? []).filter((r) => r.kind === "static").length} static, ${list.filter((e) => e.kind !== "static").length} dynamic; ${list.filter((e) => e.kind === "pat").length} extended)`,
    `Outside interfaces:`,
    `  ${role("outside").join(", ") || "(none: mark one with ip nat outside)"}`,
    `Inside interfaces:`,
    `  ${role("inside").join(", ") || "(none: mark one with ip nat inside)"}`,
    `Hits: ${st.hits}  Misses: ${st.misses}`,
    `Dynamic mappings:`,
  ];
  for (const r of d.nat?.rules ?? []) {
    if (r.kind !== "dynamic") continue;
    L.push(`-- Inside Source`, `[Id: 1] access-list ${r.acl} ${r.iface ? `interface ${longIf(r.iface)}` : `pool ${r.pool}`}${r.overload ? " overload" : ""} refcount ${list.filter((e) => e.kind !== "static").length}`);
    const pool = d.nat!.pools.find((p) => p.name === r.pool);
    if (pool) {
      const total = ipToInt(pool.end) - ipToInt(pool.start) + 1;
      const used = new Set(list.filter((e) => e.kind !== "static").map((e) => e.insideGlobal)).size;
      L.push(` pool ${pool.name}: netmask ${dottedMask(pool.len)}`, `\tstart ${pool.start} end ${pool.end}`, `\ttype generic, total addresses ${total}, allocated ${used} (${Math.round((100 * used) / total)}%), misses ${st.misses}`);
    }
  }
  return L.join("\n");
}

// --- DHCP ---------------------------------------------------------------------------

export function showDhcpBinding(net: Net, dev: string): string {
  const list = net.dhcpBindings.get(dev) ?? [];
  const rows = [
    "Bindings from all pools not associated with VRF:",
    "IP address      Client-ID/              Lease expiration        Type       State      Interface",
    "                Hardware address/",
    "                User name",
  ];
  for (const b of list) rows.push(`${pad(b.ip, 16)}${pad(("01" + b.mac.replace(/\./g, "")).replace(/(.{4})(?=.)/g, "$1."), 24)}${pad("Nov 01 2026 10:00 AM", 24)}${pad("Automatic", 11)}${pad("Active", 11)}${longIf(b.iface)}`);
  if (!list.length) rows.push("(no bindings: run 'ip dhcp' on a client)");
  return rows.join("\n");
}

export function showDhcpPool(net: Net, dev: string): string {
  const d = net.device(dev);
  if (!d.dhcp?.pools.length) return "(no DHCP pools configured)";
  const L: string[] = [];
  const binds = net.dhcpBindings.get(dev) ?? [];
  for (const p of d.dhcp.pools) {
    const c = p.network ? parseCidr(p.network) : null;
    const size = c ? Math.max(0, 2 ** (32 - c.len) - 2) : 0;
    const excl = c
      ? d.dhcp.excluded.reduce((n, e) => {
          let k = 0;
          for (let x = ipToInt(e.start); x <= ipToInt(e.end); x++) if (inCidr(intToIp(x), c)) k++;
          return n + k;
        }, 0)
      : 0;
    const leased = binds.filter((b) => b.pool === p.name).length;
    L.push(
      `Pool ${p.name} :`,
      ` Utilization mark (high/low)    : 100 / 0`,
      ` Subnet size (first/next)       : 0 / 0`,
      ` Total addresses                : ${size}`,
      ` Leased addresses               : ${leased}`,
      ` Excluded addresses             : ${excl}`,
      ` Network                        : ${p.network ?? "(not set: this pool can't hand out addresses)"}`,
      ` Default router                 : ${p.gateway ?? "(not set: clients get no gateway)"}`,
      ` DNS server                     : ${p.dns ?? "-"}`,
      "",
    );
  }
  return L.join("\n");
}

export function showDhcpConflict(net: Net, dev: string): string {
  const list = net.dhcpConflicts.get(dev) ?? [];
  const rows = ["IP address        Detection method   Detection time          VRF"];
  for (const ip of list) rows.push(`${pad(ip, 18)}${pad("Ping", 19)}Nov 01 2026 10:00 AM`);
  if (!list.length) rows.push("(no conflicts)");
  return rows.join("\n");
}

// --- BGP ----------------------------------------------------------------------------

export function showBgpSummary(net: Net, dev: string): string {
  const d = net.device(dev);
  if (!d.bgp) return "% BGP not active";
  const b = net.bgp();
  const table = b.tables.get(dev) ?? [];
  const L = [
    `BGP router identifier ${b.rid.get(dev) ?? "0.0.0.0"}, local AS number ${d.bgp.asn}`,
    `BGP table version is ${table.length + 1}, main routing table version ${table.length + 1}`,
    `${new Set(table.map((p) => p.prefix)).size} network entries using ${new Set(table.map((p) => p.prefix)).size * 112} bytes of memory`,
    "",
    "Neighbor        V           AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd",
  ];
  for (const s of b.sessions.filter((x) => x.dev === dev)) {
    const pfx = table.filter((p) => s.peerDev && p.fromDev === s.peerDev).length;
    const st = s.state === "Established" ? String(pfx) : s.state;
    L.push(`${pad(s.peerIp, 16)}4 ${String(s.remoteAs).padStart(10)} ${String(s.state === "Established" ? 27 : 0).padStart(7)} ${String(s.state === "Established" ? 25 : 0).padStart(7)} ${String(table.length + 1).padStart(8)}    0    0 ${pad(s.state === "Established" ? "00:12:04" : "never", 9)}${st}`);
  }
  return L.join("\n");
}

export function showBgpTable(net: Net, dev: string): string {
  const d = net.device(dev);
  if (!d.bgp) return "% BGP not active";
  const b = net.bgp();
  const table = [...(b.tables.get(dev) ?? [])].sort((x, y) => x.cidr.net - y.cidr.net || x.cidr.len - y.cidr.len || Number(y.best) - Number(x.best));
  const L = [
    `BGP table version is ${table.length + 1}, local router ID is ${b.rid.get(dev)}`,
    "Status codes: * valid, > best, i - internal",
    "Origin codes: i - IGP, e - EGP, ? - incomplete",
    "",
    "     Network          Next Hop            Metric LocPrf Weight Path",
  ];
  let last = "";
  for (const p of table) {
    const status = `${p.valid ? "*" : " "}${p.best ? ">" : " "}${!p.local && !p.ebgp ? "i" : " "}`;
    const shown = p.prefix === last ? "" : p.prefix;
    last = p.prefix;
    L.push(
      ` ${pad(status, 4)}${pad(shown, 17)}${pad(p.nextHop, 20)}${String(p.med ?? "").padStart(6)} ${String(p.local || !p.ebgp ? p.localPref : "").padStart(6)} ${String(p.weight).padStart(6)} ${[...p.asPath, p.origin].join(" ")}${p.invalid ? `   (${p.invalid})` : ""}`,
    );
  }
  if (table.length === 0) L.push("(empty: no network statements match the routing table and no paths were received)");
  const why = table.filter((p) => p.best && p.bestBecause).map((p) => `  ${p.prefix}: best via ${p.nextHop === "0.0.0.0" ? "local" : p.nextHop} because of ${p.bestBecause}`);
  if (why.length) L.push("", "Best-path decisions:", ...why);
  return L.join("\n");
}

export function showBgpNeighbors(net: Net, dev: string, only?: string): string {
  const d = net.device(dev);
  if (!d.bgp) return "% BGP not active";
  const b = net.bgp();
  const L: string[] = [];
  const list = b.sessions.filter((x) => x.dev === dev && (!only || x.peerIp === only));
  if (only && !list.length) return `% No such neighbor or address family`;
  for (const s of list) {
    L.push(
      `BGP neighbor is ${s.peerIp},  remote AS ${s.remoteAs}, ${s.ebgp ? "external" : "internal"} link`,
      `  BGP version 4, remote router ID ${s.peerDev ? b.rid.get(s.peerDev) : "0.0.0.0"}`,
      `  BGP state = ${s.state}${s.state === "Established" ? ", up for 00:12:04" : ""}`,
    );
    if (s.localIp) L.push(`  Local host: ${s.localIp}, Local port: 179`, `  Foreign host: ${s.peerIp}, Foreign port: 31842`);
    if (s.why) L.push(`  Reason: ${s.why}`);
    L.push("");
  }
  return L.join("\n") || "(no neighbors configured)";
}

// --- EIGRP -------------------------------------------------------------------------

export function showEigrpNeighbors(net: Net, dev: string): string {
  const d = net.device(dev);
  if (!d.eigrp) return "% EIGRP is not running";
  const e = net.eigrp();
  const rows = e.nbrs.filter((n) => n.dev === dev);
  const head = d.eigrp.name ? `EIGRP-IPv4 VR(${d.eigrp.name}) Address-Family Neighbors for AS(${d.eigrp.asn})` : `EIGRP-IPv4 Neighbors for AS(${d.eigrp.asn})`;
  const L = [head, "H   Address                 Interface              Hold Uptime   SRTT   RTO  Q  Seq", "                                                   (sec)         (ms)       Cnt Num"];
  rows.forEach((n, i) => L.push(`${pad(String(i), 4)}${pad(n.peerIp, 24)}${pad(n.iface, 23)}${pad("12", 5)}00:04:${String(10 + i * 7).padStart(2, "0")}    1   100  0  ${12 + i}`));
  for (const p of e.problems.filter((x) => x.dev === dev)) L.push("", p.text);
  return L.join("\n");
}

export function showEigrpTopology(net: Net, dev: string, all = false): string {
  const d = net.device(dev);
  if (!d.eigrp) return "% EIGRP is not running";
  const e = net.eigrp();
  const L = [
    `EIGRP-IPv4 Topology Table for AS(${d.eigrp.asn})/ID(${e.rid.get(dev)})`,
    "Codes: P - Passive, A - Active, U - Update, Q - Query, R - Reply,",
    "       r - reply Status, s - sia Status",
    "",
  ];
  for (const t of e.topo.get(dev) ?? []) {
    if (t.connected) {
      L.push(`P ${t.prefix}, 1 successors, FD is ${t.fd}`, `        via ${t.connected === "Redistributed" ? "Rstatic" : "Connected"}, ${t.connected}`);
      continue;
    }
    const shown = all ? t.paths : [...t.successors, ...t.feasible];
    L.push(`P ${t.prefix}, ${t.successors.length} successors, FD is ${t.fd}${t.installed.length > t.successors.length ? `, ${t.installed.length - t.successors.length} more installed by variance` : ""}`);
    for (const p of shown) L.push(`        via ${p.nbrIp} (${p.fd}/${p.rd}), ${p.iface}${t.successors.includes(p) ? "" : p.rd < t.fd ? "   <- feasible successor (RD < FD)" : "   (not feasible: RD ≥ FD)"}`);
  }
  L.push("", "(fd/rd) = metric through that neighbour / the neighbour's own reported distance.");
  return L.join("\n");
}

export function showEigrpInterfaces(net: Net, dev: string): string {
  const d = net.device(dev);
  if (!d.eigrp) return "% EIGRP is not running";
  const e = net.eigrp();
  const L = [`EIGRP-IPv4 Interfaces for AS(${d.eigrp.asn})`, "Interface              Peers  BW (Kbit)  Delay (usec)  Passive"];
  for (const i of e.enabled.get(dev) ?? []) {
    const peers = e.nbrs.filter((n) => n.dev === dev && n.iface === i.iface).length;
    L.push(`${pad(i.iface, 23)}${pad(String(peers), 7)}${pad(String(i.bw), 11)}${pad(String(i.delayUs), 14)}${i.passive ? "yes" : "no"}`);
  }
  return L.join("\n");
}

// --- HSRP / VRRP --------------------------------------------------------------------

export function showFhrpBrief(net: Net, dev: string, proto: "hsrp" | "vrrp"): string {
  const groups = net.fhrp().groups.filter((g) => g.proto === proto && g.members.some((m) => m.dev === dev));
  const d = net.device(dev);
  // Groups configured but not yet formed (interface down) still show, in Init.
  const L =
    proto === "hsrp"
      ? ["                     P indicates configured to preempt.", "                     |", "Interface   Grp  Pri P State   Active          Standby         Virtual IP"]
      : ["  Interface          Grp Pri Time  Own Pre State   Master addr     Group addr"];
  const shownIfs = new Set<string>();
  for (const g of groups) {
    const me = g.members.find((m) => m.dev === dev)!;
    shownIfs.add(`${me.iface}|${g.group}`);
    const state = !g.vip ? "Init" : g.active === me ? (proto === "hsrp" ? "Active" : "Master") : g.standby === me && proto === "hsrp" ? "Standby" : proto === "hsrp" ? "Listen" : "Backup";
    const other = (m?: typeof me) => (!m ? "unknown" : m === me ? "local" : m.ip);
    if (proto === "hsrp")
      L.push(`${pad(me.iface, 12)}${pad(String(g.group), 5)}${pad(String(me.prio), 4)}${me.preempt ? "P" : " "} ${pad(state, 8)}${pad(other(g.active), 16)}${pad(other(g.standby), 16)}${g.vip ?? "unknown"}`);
    else L.push(`  ${pad(me.iface, 19)}${pad(String(g.group), 4)}${pad(String(me.prio), 4)}3609  ${me.prio === 255 ? "Y" : " "}   ${me.preempt ? "Y" : " "}   ${pad(state, 8)}${pad(g.active?.ip ?? "unknown", 16)}${g.vip ?? ""}`);
  }
  for (const p of [...d.ports, ...(d.svis ?? []).map((s) => ({ ...s, name: `Vlan${s.vlan}` }))])
    for (const g of (p.fhrp ?? []).filter((x) => x.proto === proto)) {
      if (shownIfs.has(`${p.name}|${g.group}`)) continue;
      L.push(proto === "hsrp" ? `${pad(p.name, 12)}${pad(String(g.group), 5)}${pad(String(g.priority ?? 100), 4)}${g.preempt ? "P" : " "} Init    unknown         unknown         ${g.ip ?? "unknown"}` : `  ${pad(p.name, 19)}${pad(String(g.group), 4)}${pad(String(g.priority ?? 100), 4)}3609        Init    unknown         ${g.ip ?? ""}`);
    }
  return L.join("\n");
}

export function showStandby(net: Net, dev: string): string {
  const L: string[] = [];
  for (const g of net.fhrp().groups.filter((x) => x.proto === "hsrp" && x.members.some((m) => m.dev === dev))) {
    const me = g.members.find((m) => m.dev === dev)!;
    const state = !g.vip ? "Init" : g.active === me ? "Active" : g.standby === me ? "Standby" : "Listen";
    L.push(
      `${me.iface} - Group ${g.group}${g.version === 2 ? " (version 2)" : ""}`,
      `  State is ${state}`,
      `  Virtual IP address is ${g.vip ?? "unknown"}`,
      `  Active virtual MAC address is ${g.vmac}`,
      `  Hello time 3 sec, hold time 10 sec`,
      `  Preemption ${me.preempt ? "enabled" : "disabled"}`,
      `  Active router is ${!g.active ? "unknown" : g.active === me ? "local" : `${g.active.ip}, priority ${g.active.prio}`}`,
      `  Standby router is ${!g.standby ? "unknown" : g.standby === me ? "local" : `${g.standby.ip}, priority ${g.standby.prio}`}`,
      `  Priority ${me.prio} (configured ${me.basePrio})`,
      ...me.tracked.map((t) => `    Track ${t}`),
      "",
    );
  }
  return L.length ? L.join("\n") : "% HSRP is not configured";
}
