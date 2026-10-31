import type { Net } from "./engine";
import { dottedMask } from "./ip";

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
    rows.push(pad(`Vlan${s.vlan}`, 22) + pad(s.ip.split("/")[0], 16) + pad(s.shutdown ? "administratively down" : up ? "up" : "down", 22) + (up ? "up" : "down"));
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
  const vlans = new Set<number>();
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
    d.acls![n].forEach((a, i) => lines.push(`    ${(i + 1) * 10} ${a.action} ${a.proto} ${a.src} ${a.dst}`));
    const where = [...d.ports, ...(d.svis ?? []).map((s) => ({ ...s, name: `Vlan${s.vlan}` }))]
      .flatMap((p) => [p.aclIn === n ? `${p.name} in` : "", p.aclOut === n ? `${p.name} out` : ""])
      .filter(Boolean);
    lines.push(`    (applied: ${where.length ? where.join(", ") : "not applied"})`);
  }
  return lines.join("\n");
}
