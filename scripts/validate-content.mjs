// Content lint: run with `npm run validate` (runs through tsx so it can import the TypeScript sources).
// Catches broken references, impossible answers, and labs that cannot be completed
// with their own canonical commands.

import { exams } from "../src/data/catalog.ts";
import { labs } from "../src/data/labs.ts";
import { matchAny } from "../src/lib/cli-pattern.ts";
import { initialState, runLine } from "../src/lib/terminal.ts";
import { scenarios, campus } from "../src/data/wire.ts";
import { gradeGoals } from "../src/lib/net/grade.ts";
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
  const after = gradeGoals(t, sc.goals);
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
};
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
  for (const g of gradeGoals(topo, sc.goals)) if (!g.ok) fail(`wire ${sc.id}: CLI fix fails "${g.goal.label}" (${g.detail})`);
}
console.log(`wire   ${scenarios.length} scenarios (data + CLI fixes)`);

if (errors.length) {
  console.error("\n" + errors.map((e) => "✗ " + e).join("\n"));
  process.exit(1);
}
console.log("✓ content OK");
