// Content lint: run with `npm run validate` (runs through tsx so it can import the TypeScript sources).
// Catches broken references, impossible answers, and labs that cannot be completed
// with their own canonical commands.

import { exams } from "../src/data/catalog.ts";
import { labs } from "../src/data/labs.ts";
import { matchAny } from "../src/lib/cli-pattern.ts";
import { initialState, runLine } from "../src/lib/terminal.ts";

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

if (errors.length) {
  console.error("\n" + errors.map((e) => "✗ " + e).join("\n"));
  process.exit(1);
}
console.log("✓ content OK");
