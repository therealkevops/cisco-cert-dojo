// Content lint: run with `npm run validate` (runs through tsx so it can import the TypeScript sources).
// Catches broken references, impossible answers, and labs that cannot be completed
// with their own canonical commands.

import { exams } from "../src/data/catalog.ts";
import { labs } from "../src/data/labs.ts";
import { matchAny } from "../src/lib/cli-pattern.ts";
import { initialState, runLine } from "../src/lib/terminal.ts";
import { scenarios, campus } from "../src/data/wire.ts";
import { gradeGoals } from "../src/lib/net/grade.ts";
import { allPracticals as practicals } from "../src/data/practice.ts";
import { fabricScenarios } from "../src/data/fabric.ts";
import { ucsScenarios } from "../src/data/ucs.ts";
import { gradeUcs } from "../src/lib/ucs.ts";
import { sanScenarios } from "../src/data/san.ts";
import { gradeSan } from "../src/lib/san.ts";
import { runSanCli } from "../src/lib/san-cli.ts";
import { checkStep, shownAnswer } from "../src/data/sizing.ts";
import { worksheets } from "../src/data/worksheets.ts";
import { simulate, gradeFabric } from "../src/lib/fabric/sim.ts";
import { Net } from "../src/lib/net/engine.ts";
import { newSession, runCli } from "../src/lib/ios/cli.ts";

const errors = [];
const fail = (m) => errors.push(m);

for (const exam of Object.values(exams)) {
  const weight = exam.domains.reduce((s, d) => s + d.weight, 0);
  if (weight !== 100) fail(`${exam.id}: domain weights sum to ${weight}`);

  const objectives = new Set(exam.domains.flatMap((d) => d.objectives.map((o) => o.id)));
  const ids = new Set();
  for (const q of exam.questions) {
    if (ids.has(q.id)) fail(`${exam.id}: duplicate question id ${q.id}`);
    ids.add(q.id);
    if (!objectives.has(q.objective)) fail(`${q.id}: unknown objective ${q.objective}`);
    if (q.kind === "single" && (q.answer < 0 || q.answer >= q.choices.length)) fail(`${q.id}: answer out of range`);
    if (q.kind === "multi" && q.answer.some((a) => a < 0 || a >= q.choices.length)) fail(`${q.id}: answer out of range`);
    if (q.kind === "multi" && q.answer.length < 2) fail(`${q.id}: multi needs 2+ answers`);
    if (q.kind === "cli" && !matchAny(q.accept, q.canonical)) fail(`${q.id}: canonical "${q.canonical}" fails its own patterns`);
    if (q.kind === "order" && q.items.length < 3) fail(`${q.id}: order needs 3+ items`);
  }
  for (const o of objectives) {
    if (!exam.questions.some((q) => q.objective === o)) fail(`${exam.id} ${o}: no questions`);
  }
  console.log(`${exam.short.padEnd(6)} ${objectives.size} objectives, ${exam.questions.length} questions`);
}

for (const lab of labs) {
  const exam = exams[lab.exam];
  if (!exam) {
    fail(`${lab.id}: unknown exam ${lab.exam}`);
    continue;
  }
  if (!exam.domains.some((d) => d.objectives.some((o) => o.id === lab.objective))) fail(`${lab.id}: unknown objective ${lab.objective}`);

  let st = initialState(lab);
  for (const step of lab.steps) {
    const r = runLine(lab, st, step.cmd);
    st = r.state;
  }
  if (!st.done || st.slips) fail(`${lab.id}: canonical run finished=${st.done} slips=${st.slips} (stuck at step ${st.step})`);
  for (const step of lab.steps) {
    if (!matchAny(step.accept, step.hint.replace(/ \(.*\)$/, ""))) fail(`${lab.id}: hint "${step.hint}" fails its step patterns`);
  }
}
console.log(`labs   ${labs.length}`);

// Wire Room: the healthy campus must be fully reachable, every challenge must
// start broken, and the intended fix must pass.
{
  const net = new Net(campus());
  const hosts = ["PC-A", "PC-B", "PC-C", "SRV"];
  const ips = { "PC-A": "10.10.10.11", "PC-B": "10.20.20.12", "PC-C": "10.30.30.13", SRV: "192.0.2.10" };
  for (const a of hosts)
    for (const b of hosts) {
      if (a === b) continue;
      net.ping(a, ips[b], 3);
      const r = net.ping(a, ips[b], 2);
      if (!r.probes.every((p) => p.mark === "!")) fail(`wire campus: ${a} -> ${b} failed (${r.probes.map((p) => p.mark).join("")})`);
    }
}
const fixes = {
  "wrong-vlan": (t) => (t.devices.find((d) => d.id === "ASW2").ports.find((p) => p.name === "Gi1/0/2").vlan = 20),
  "pruned-trunk": (t) => (t.devices.find((d) => d.id === "ASW2").ports.find((p) => p.name === "Gi1/0/1").allowed = [10, 20, 30]),
  "return-route": (t) => t.devices.find((d) => d.id === "R1").routes.push({ prefix: "10.20.20.0/24", via: "10.0.0.1" }),
  "acl-guest": (t) => (t.devices.find((d) => d.id === "R1").acls.EDGE[0].src = "10.30.30.0/24"),
  "stp-root": (t) => (t.devices.find((d) => d.id === "DSW1").stpPriority = 4096 - 4096),
  "dead-gateway": (t) => {
    t.devices.find((d) => d.id === "PC-A").gateway = "10.10.10.1";
    t.devices.find((d) => d.id === "DSW1").svis.find((s) => s.vlan === 10).shutdown = false;
  },
  "ospf-mtu": (t) => delete t.devices.find((d) => d.id === "R2").ports.find((p) => p.name === "Gi0/1").mtu,
  "ospf-area": (t) => t.devices.find((d) => d.id === "R3").ospf.networks.forEach((n) => (n.area = 1)),
  "ospf-passive": (t) => (t.devices.find((d) => d.id === "R2").ospf.noPassive = ["Gi0/0", "Gi0/1"]),
  "ospf-summary": (t) => (t.devices.find((d) => d.id === "R2").ospf.ranges = [{ area: 1, prefix: "10.3.0.0/16" }]),
  "ospf-dr": (t) => {
    t.devices.find((d) => d.id === "R2").ports.find((p) => p.name === "Gi0/0").ospf = { priority: 255 };
    t.devices.find((d) => d.id === "R1").ports.find((p) => p.name === "Gi0/0").ospf = { priority: 0 };
  },
  "lacp-passive": (t) => t.devices.find((d) => d.id === "SW1").ports.forEach((p) => p.channel && (p.channel.mode = "active")),
  "lacp-on": (t) => t.devices.find((d) => d.id === "SW1").ports.forEach((p) => p.channel && (p.channel.mode = "active")),
  "po-access": (t) => (t.devices.find((d) => d.id === "SW2").portChannels[0].mode = "trunk"),
  "nat-outside": (t) => (t.devices.find((d) => d.id === "R1").ports.find((p) => p.name === "Gi0/0").nat = "outside"),
  "nat-acl": (t) => (t.devices.find((d) => d.id === "R1").acls["1"][0].src = "10.0.0.0/24"),
  "nat-static": (t) => t.devices.find((d) => d.id === "R1").nat.rules.push({ kind: "static", local: "10.0.0.50", global: "203.0.113.50" }),
  "nat-pool": (t) => (t.devices.find((d) => d.id === "R1").nat.rules[0].overload = true),
  "dhcp-relay": (t) => (t.devices.find((d) => d.id === "BR").ports.find((p) => p.name === "Gi0/1").helpers = ["10.0.0.1"]),
  "dhcp-gateway": (t) => (t.devices.find((d) => d.id === "HQ").dhcp.pools[0].gateway = "10.10.0.1"),
  "dhcp-pool": (t) => (t.devices.find((d) => d.id === "HQ").dhcp.pools[1].network = "10.20.0.0/24"),
  "bgp-remote-as": (t) => (t.devices.find((d) => d.id === "R1").bgp.neighbors[0].remoteAs = 65010),
  "bgp-network": (t) => (t.devices.find((d) => d.id === "R1").bgp.networks = ["203.0.113.0/24"]),
  "bgp-outbound": (t) => (t.devices.find((d) => d.id === "R1").bgp.neighbors[1].weight = 100),
  "bgp-inbound": (t) => {
    const r1 = t.devices.find((d) => d.id === "R1");
    r1.routeMaps = { PREPEND: [{ seq: 10, action: "permit", setPrepend: [65001, 65001] }] };
    r1.bgp.neighbors[0].routeMapOut = "PREPEND";
  },
  "roas-encap": (t) => (t.devices.find((d) => d.id === "R1").ports.find((p) => p.name === "Gi0/0.20").encap = { vlan: 20 }),
  "roas-trunk": (t) => Object.assign(t.devices.find((d) => d.id === "SW1").ports.find((p) => p.name === "Gi1/0/24"), { mode: "trunk" }),
  "hsrp-track": (t) => {
    t.devices.find((d) => d.id === "R1").ports[0].fhrp[0].track = [{ iface: "Gi0/1", decrement: 20 }];
    t.devices.find((d) => d.id === "R2").ports[0].fhrp[0].preempt = true;
  },
  "hsrp-vip": (t) => (t.devices.find((d) => d.id === "R2").ports[0].fhrp[0].ip = "10.1.1.1"),
  "eigrp-as": (t) => (t.devices.find((d) => d.id === "R3").eigrp.asn = 100),
  "eigrp-passive": (t) => (t.devices.find((d) => d.id === "R2").eigrp.noPassive = ["Gi0/0", "Gi0/1"]),
  "eigrp-metric": (t) => (t.devices.find((d) => d.id === "R1").ports.find((p) => p.name === "Gi0/2").delay = 100),
};
for (const sc of scenarios) {
  if (sc.kind !== "challenge") continue;
  const before = gradeGoals(sc.topology, sc.goals);
  if (before.every((g) => g.ok)) fail(`wire ${sc.id}: already solved before any fix`);
  const fix = fixes[sc.id];
  if (!fix) {
    fail(`wire ${sc.id}: no reference fix in validator`);
    continue;
  }
  const t = structuredClone(sc.topology);
  fix(t);
  const after = gradeGoals(t, sc.goals, new Net(sc.topology));
  for (const g of after) if (!g.ok) fail(`wire ${sc.id}: reference fix fails "${g.goal.label}" (${g.detail})`);
}
// The same challenges solved the way a learner would: typing into the consoles.
const cliFixes = {
  "wrong-vlan": [["ASW2", "en", "conf t", "int g1/0/2", "sw acc vlan 20", "end"]],
  "pruned-trunk": [["ASW2", "en", "conf t", "int g1/0/1", "sw tr al vl add 20", "end"]],
  "return-route": [["R1", "en", "conf t", "ip route 10.20.20.0 255.255.255.0 10.0.0.1", "end"]],
  "acl-guest": [["R1", "en", "conf t", "ip access-list extended EDGE", "no 10", "10 deny ip 10.30.30.0 0.0.0.255 192.0.2.0 0.0.0.255", "end"]],
  "stp-root": [["DSW1", "en", "conf t", "spanning-tree vlan 10,20 root primary", "end"]],
  "dead-gateway": [
    ["PC-A", "ip 10.10.10.11/24 10.10.10.1"],
    ["DSW1", "en", "conf t", "int vlan 10", "no shut", "end"],
  ],
  "ospf-mtu": [["R2", "en", "conf t", "int g0/1", "no ip mtu", "end"]],
  "ospf-area": [["R3", "en", "conf t", "router ospf 1", "no network 10.0.0.0 0.255.255.255 area 0", "network 10.0.0.0 0.255.255.255 area 1", "no network 3.3.3.3 0.0.0.0 area 0", "network 3.3.3.3 0.0.0.0 area 1", "end"]],
  "ospf-passive": [["R2", "en", "conf t", "router ospf 1", "no passive-interface g0/0", "no passive-interface gi 0/1", "end"]],
  "ospf-summary": [["R2", "en", "conf t", "router ospf 1", "area 1 range 10.3.0.0 255.255.0.0", "end"]],
  "ospf-dr": [
    ["R2", "en", "conf t", "int g0/0", "ip ospf priority 255", "end"],
    ["R1", "en", "conf t", "int g0/0", "ip ospf prio 0", "end"],
  ],
  "lacp-passive": [["SW1", "en", "conf t", "int range g1/0/23 - 24", "channel-group 1 mode active", "end"]],
  "lacp-on": [["SW1", "en", "conf t", "int range gi1/0/23-24", "no channel-group", "channel-group 1 mode active", "end"]],
  "po-access": [["SW2", "en", "conf t", "int po1", "sw mode trunk", "end"]],
  "nat-outside": [["R1", "en", "conf t", "int g0/0", "ip nat outside", "end"]],
  "nat-acl": [["R1", "en", "conf t", "no access-list 1", "access-list 1 permit 10.0.0.0 0.0.0.255", "end"]],
  "nat-static": [["R1", "en", "conf t", "ip nat inside source static 10.0.0.50 203.0.113.50", "end"]],
  "nat-pool": [["R1", "en", "conf t", "ip nat inside source list 1 pool PUBLIC overload", "end"]],
  "dhcp-relay": [["BR", "en", "conf t", "int g0/1", "ip helper-address 10.0.0.1", "end"]],
  "dhcp-gateway": [["HQ", "en", "conf t", "ip dhcp pool LAN-A", "default-router 10.10.0.1", "end"]],
  "dhcp-pool": [["HQ", "en", "conf t", "ip dhcp pool LAN-B", "no network", "network 10.20.0.0 255.255.255.0", "end"]],
  "bgp-remote-as": [["R1", "en", "conf t", "router bgp 65001", "neighbor 192.0.2.2 remote-as 65010", "end"]],
  "bgp-network": [["R1", "en", "conf t", "router bgp 65001", "no network 203.0.0.0 mask 255.255.0.0", "network 203.0.113.0 mask 255.255.255.0", "end"]],
  "bgp-outbound": [["R1", "en", "conf t", "route-map PREFER-B permit 10", "set local-preference 200", "exit", "router bgp 65001", "address-family ipv4", "neighbor 192.0.2.6 route-map PREFER-B in", "end"]],
  "bgp-inbound": [["R1", "en", "conf t", "route-map PREPEND permit 10", "set as-path prepend 65001 65001", "exit", "router bgp 65001", "neighbor 192.0.2.2 route-map PREPEND out", "end"]],
  "roas-encap": [["R1", "en", "conf t", "interface gi0/0.20", "encapsulation dot1q 20", "end"]],
  "roas-trunk": [["SW1", "en", "conf t", "interface gi1/0/24", "switchport mode trunk", "end"]],
  "hsrp-track": [
    ["R1", "en", "conf t", "interface gi0/0", "standby 10 track gi0/1 decrement 20", "end"],
    ["R2", "en", "conf t", "interface gi0/0", "standby 10 preempt", "end"],
  ],
  "hsrp-vip": [["R2", "en", "conf t", "interface gi0/0", "standby 10 ip 10.1.1.1", "end"]],
  "eigrp-as": [["R3", "en", "conf t", "no router eigrp 101", "router eigrp 100", "network 10.0.0.0", "network 192.168.0.0 0.0.255.255", "end"]],
  "eigrp-passive": [["R2", "en", "conf t", "router eigrp 100", "no passive-interface gi0/0", "no passive-interface gi0/1", "end"]],
  "eigrp-metric": [["R1", "en", "conf t", "interface gi0/2", "delay 100", "end"]],
};
// BGP example: all sessions up, both paths present, end-to-end reachability.
{
  const n = new Net(scenarios.find((s) => s.id === "bgp").topology);
  const down = n.bgp().sessions.filter((x) => x.state !== "Established");
  if (down.length) fail(`wire bgp: sessions not up: ${down.map((x) => `${x.dev}->${x.peerIp} ${x.state} ${x.why}`).join("; ")}`);
  const paths = (n.bgp().tables.get("R1") ?? []).filter((p) => p.prefix === "198.51.100.0/24");
  if (paths.length !== 2) fail(`wire bgp: R1 should see two paths to 198.51.100.0/24, sees ${paths.length}`);
  n.ping("PC1", "198.51.100.10", 8);
  if (!n.ping("PC1", "198.51.100.10", 2).probes.every((p) => p.mark === "!")) fail("wire bgp: PC1 can't reach WEB");
}
// NAT and DHCP examples must work end to end.
{
  const nat = new Net(scenarios.find((s) => s.id === "nat").topology);
  for (const h of ["PC1", "PC2"]) {
    nat.ping(h, "198.51.100.10", 2);
    if (!nat.ping(h, "198.51.100.10", 2).probes.every((p) => p.mark === "!")) fail(`wire nat: ${h} can't reach WEB`);
  }
  if ((nat.natTables.get("R1") ?? []).filter((e) => e.kind === "pat").length !== 2) fail("wire nat: expected two PAT entries on R1");
  const dl = scenarios.find((s) => s.id === "dhcp").topology;
  const g = gradeGoals(dl, [
    { type: "dhcp", host: "PCA1", within: "10.10.0.0/24", to: "10.20.0.1", label: "a" },
    { type: "dhcp", host: "PCB1", within: "10.20.0.0/24", to: "10.10.0.11", label: "b" },
  ]);
  for (const r of g) if (!r.ok) fail(`wire dhcp example: ${r.detail}`);
}
// EtherChannel example: bundle formed on both sides, and it survives losing a member.
{
  const ex = scenarios.find((s) => s.id === "lag");
  const net = new Net(ex.topology);
  if (!net.bundles.every((b) => b.formed)) fail("wire lag: Po1 not bundled in the example");
  const t = structuredClone(ex.topology);
  t.devices.find((d) => d.id === "SW1").ports.find((p) => p.name === "Gi1/0/23").shutdown = true;
  const n2 = new Net(t);
  n2.ping("PC1", "10.10.0.12", 2);
  if (!n2.ping("PC1", "10.10.0.12", 2).probes.every((p) => p.mark === "!")) fail("wire lag: bundle did not survive a member failure");
}
// The OSPF example must be fully reachable with every adjacency FULL.
{
  const ex = scenarios.find((s) => s.id === "ospf");
  const net = new Net(ex.topology);
  const bad = net.ospf().nbrs.filter((n) => n.state === "EXSTART");
  if (bad.length) fail(`wire ospf: EXSTART neighbours in the example`);
  for (const [a, ip] of [["PC1", "10.3.1.10"], ["PC4", "10.3.0.10"], ["SRV", "10.4.4.10"], ["PC3", "10.1.1.10"]]) {
    net.ping(a, ip, 4);
    if (!net.ping(a, ip, 2).probes.every((p) => p.mark === "!")) fail(`wire ospf: ${a} -> ${ip} fails`);
  }
}
for (const sc of scenarios) {
  if (sc.kind !== "challenge") continue;
  let topo = structuredClone(sc.topology);
  let net = new Net(topo);
  for (const [dev, ...lines] of cliFixes[sc.id] ?? []) {
    let s = newSession(dev, topo.devices.find((d) => d.id === dev).kind);
    for (const line of lines) {
      const r = runCli(line, s, topo, net);
      if (/^\s*\^|% (Invalid|Ambiguous|Incomplete)/m.test(r.out)) fail(`wire ${sc.id}: CLI rejected "${line}" on ${dev}: ${r.out}`);
      s = r.session;
      if (r.topo) ((topo = r.topo), (net = new Net(topo, net)));
    }
  }
  for (const g of gradeGoals(topo, sc.goals, net)) if (!g.ok) fail(`wire ${sc.id}: CLI fix fails "${g.goal.label}" (${g.detail})`);
}
console.log(`wire   ${scenarios.length} scenarios (data + CLI fixes)`);
// Fabric Lab: each challenge must fail as shipped and pass with its reference fix.
const sw = (f, fn) => Object.values(f.switches).forEach(fn);
const fabricFixes = {
  "fab-dscp": (f) => sw(f, (s) => (s.noDropDscp = [24, 26])),
  "fab-ecn": (f) => sw(f, (s) => (s.ecn = true)),
  "fab-ecn-thresholds": (f) => sw(f, (s) => ((s.kmin = 100), (s.kmax = 400))),
  "fab-dcqcn": (f) => Object.values(f.hosts).forEach((h) => (h.dcqcn = true)),
  "fab-mtu": (f) => (f.switches.L4.mtu = 9216),
  "fab-hash": (f) => sw(f, (s) => (s.dlb = true)),
  "fab-storm": (f) => sw(f, (s) => (s.watchdog = true)),
  "fab-optic": (f) => delete f.links["H6-L2"].crc,
};
const fabricAlt = {
  "fab-hash": (f) => (sw(f, (s) => (s.hash = "l3l4")), Object.values(f.hosts).forEach((h) => (h.qps = 4))),
  "fab-storm": (f) => (f.hosts.H12.up = false),
};
for (const sc of fabricScenarios) {
  if (sc.kind !== "challenge") continue;
  const before = gradeFabric(simulate(sc.fabric), sc.goals);
  if (before.every((g) => g.ok)) fail(`fabric ${sc.id}: already passes before any fix`);
  for (const [name, fix] of [["reference", fabricFixes[sc.id]], ["alternative", fabricAlt[sc.id]]]) {
    if (!fix) {
      if (name === "reference") fail(`fabric ${sc.id}: no reference fix`);
      continue;
    }
    const f = structuredClone(sc.fabric);
    fix(f);
    for (const g of gradeFabric(simulate(f), sc.goals)) if (!g.ok) fail(`fabric ${sc.id}: ${name} fix fails "${g.goal.label}" (${g.detail})`);
  }
}
console.log(`fabric ${fabricScenarios.length} scenarios (broken as shipped, fixed by reference)`);

// UCS Profile Lab: each scenario fails as shipped and passes with its reference fix.
const roceFix = (c) => {
  if (!c.domain.vlans.includes(300)) c.domain.vlans.push(300);
  if (!c.domain.ntp.length) c.domain.ntp.push("10.0.0.1");
  Object.assign(c.domain.qos.platinum, { enabled: true, noDrop: true, mtu: 9216 });
  let a = c.server.adapters.find((x) => x.roce);
  if (!a) c.server.adapters.push((a = { name: "RoCE-v2", roce: true, roceVersion: 2, queuePairs: 1024, memoryRegions: 131072, resourceGroups: 8, cos: 5 }));
  a.cos = c.domain.qos.platinum.cos;
  Object.assign(c.server.vnics.find((v) => v.name === "eth-roce"), { qos: "platinum", mtu: 9000, adapter: a.name });
};
const ucsFixes = {
  "ucs-roce": roceFix,
  "ucs-fix": roceFix,
  "ucs-power": (c) => Object.assign(c.server, { power: { priority: "high", restore: "last-state", redundancy: "grid" }, storage: { ...c.server.storage, m2: "raid1" } }),
};
for (const sc of ucsScenarios) {
  if (gradeUcs(sc.config, sc.goals).every((g) => g.ok)) fail(`ucs ${sc.id}: already passes before any fix`);
  const c = structuredClone(sc.config);
  ucsFixes[sc.id]?.(c);
  if (!ucsFixes[sc.id]) fail(`ucs ${sc.id}: no reference fix`);
  for (const g of gradeUcs(c, sc.goals)) if (!g.ok) fail(`ucs ${sc.id}: reference fix fails "${g.goal.label}" (${g.detail})`);
}
console.log(`ucs    ${ucsScenarios.length} scenarios (broken as shipped, fixed by reference)`);

// SAN Lab: broken as shipped; the reference fix, replayed through the MDS CLI, must run cleanly and pass.
for (const sc of sanScenarios) {
  for (const id of [...sc.fabric.switches.map((s) => s.id), ...sc.fabric.devices.map((d) => d.id)]) if (!sc.pos[id]) fail(`san ${sc.id}: no diagram position for ${id}`);
  if (gradeSan(sc.fabric, sc.goals).every((g) => g.ok)) fail(`san ${sc.id}: already passes before any fix`);
  let f = sc.fabric;
  const before = JSON.stringify(sc.fabric);
  for (const step of sc.solution) {
    let sess = { sw: step.sw, mode: { m: "exec" } };
    for (const line of step.lines) {
      const r = runSanCli(line, sess, f);
      if (r.out.startsWith("%") || r.out.includes("% Invalid")) fail(`san ${sc.id}: "${line}" on ${step.sw} → ${r.out.split("\n").pop()}`);
      sess = r.session;
      if (r.fabric) f = r.fabric;
    }
  }
  if (JSON.stringify(sc.fabric) !== before) fail(`san ${sc.id}: the CLI mutated the shipped fabric`);
  for (const g of gradeSan(f, sc.goals)) if (!g.ok) fail(`san ${sc.id}: reference fix fails "${g.goal.label}" (${g.detail})`);
}
console.log(`san    ${sanScenarios.length} tickets (broken as shipped, CLI reference fix passes)`);

// Sizing Desk: every step has a finite answer that its own grader accepts, and a worked solution.
const ids = new Set();
for (const e of worksheets) {
  if (ids.has(e.id)) fail(`worksheet ${e.id}: duplicate id`);
  ids.add(e.id);
  if (!e.steps.length) fail(`worksheet ${e.id}: no steps`);
  e.steps.forEach((st, i) => {
    const where = `worksheet ${e.id} step ${i + 1}`;
    if (!st.working) fail(`${where}: no working`);
    if (st.kind === "text") {
      if (!checkStep(st, st.canonical) && !st.accept.length) fail(`${where}: no accepted answers`);
      if (!st.accept.some((a) => checkStep(st, a))) fail(`${where}: accepts nothing`);
      if (checkStep(st, "")) fail(`${where}: accepts an empty answer`);
    } else if (st.kind === "json") {
      if (!checkStep(st, st.example)) fail(`${where}: example fails its own checks`);
      if (checkStep(st, "{}")) fail(`${where}: {} passes`);
    } else if (st.kind === "choice") {
      if (!(st.answer >= 0 && st.answer < st.choices.length)) fail(`${where}: answer index out of range`);
    } else {
      if (!Number.isFinite(st.answer)) fail(`${where}: answer is not a number`);
      const shown = shownAnswer(st).split(" ")[0];
      if (!checkStep(st, shown)) fail(`${where}: grader rejects its own answer ${shown}`);
      if (st.tol === 0 && !Number.isInteger(st.answer)) fail(`${where}: exact step with a fractional answer`);
    }
    if (!shownAnswer(st)) fail(`${where}: nothing to reveal`);
  });
}
console.log(`sheets ${worksheets.length} worksheets (${worksheets.filter((w) => w.area === "desk").length} on the Design & Automation Desk)`);

// Every hands-on item must land on a real blueprint objective, or it would silently never count toward mastery.
for (const x of practicals) {
  const exam = exams[x.exam];
  if (!exam) fail(`practical ${x.id}: unknown exam ${x.exam}`);
  else if (!exam.domains.some((d) => d.objectives.some((o) => o.id === x.objective))) fail(`practical ${x.id}: ${x.exam} has no objective ${x.objective}`);
}
console.log(`hands-on ${practicals.length} items mapped to objectives`);

if (errors.length) {
  console.error("\n" + errors.map((e) => "✗ " + e).join("\n"));
  process.exit(1);
}
console.log("✓ content OK");
