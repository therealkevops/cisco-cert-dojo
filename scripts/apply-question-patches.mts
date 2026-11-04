// Applies question rewrites to the exam bank sources without reformatting anything else.
// Usage: npx tsx scripts/apply-question-patches.mts <patch.json> [<patch.json> ...]
//
// A patch file maps question ids to replacements:
//   { "d-101": { "c": ["correct", "wrong", "wrong", "wrong"], "a": [0], "p": "new prompt?", "e": "new explanation?" } }
// `c` replaces `choices`; `a` lists the correct indices (one for single questions); `p` and `e` are optional.
// The script finds each question's object literal by its `id` in src/data/exams/*.ts and rewrites only
// those properties, so comments, ordering and other fields stay as they were.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

type Patch = { c?: string[]; a?: number[]; p?: string; e?: string };

const dir = join(import.meta.dirname, "..", "src", "data", "exams");
const patches: Record<string, Patch> = {};
for (const f of process.argv.slice(2)) Object.assign(patches, JSON.parse(readFileSync(f, "utf8")));
const todo = new Set(Object.keys(patches));

const lit = (s: string) => JSON.stringify(s);

for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
  const path = join(dir, file);
  const text = readFileSync(path, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const edits: { start: number; end: number; text: string }[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const prop = (name: string) => node.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText(sf) === name);
      const idP = prop("id");
      const id = idP && ts.isStringLiteral(idP.initializer) ? idP.initializer.text : undefined;
      if (id && patches[id]) {
        const p = patches[id];
        const kind = prop("kind");
        const isMulti = kind && ts.isStringLiteral(kind.initializer) && kind.initializer.text === "multi";
        const set = (name: string, value: string) => {
          const q = prop(name);
          if (!q) throw new Error(`${id}: no ${name} property to replace`);
          edits.push({ start: q.initializer.getStart(sf), end: q.initializer.getEnd(), text: value });
        };
        if (p.c) set("choices", `[${p.c.map(lit).join(", ")}]`);
        if (p.a) set("answer", isMulti ? `[${p.a.join(", ")}]` : String(p.a[0]));
        if (p.p) set("prompt", lit(p.p));
        if (p.e) set("explain", lit(p.e));
        todo.delete(id);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!edits.length) continue;
  let out = text;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  writeFileSync(path, out);
  console.log(`${file}: ${edits.length} edits`);
}
if (todo.size) {
  console.error(`not found: ${[...todo].join(", ")}`);
  process.exit(1);
}
