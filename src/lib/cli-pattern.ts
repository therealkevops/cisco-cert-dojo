// A tiny pattern language for grading typed CLI commands the way IOS parses
// them: keywords can be abbreviated, interface names come in many spellings.
//
//   conf|igure       keyword; "conf" is the shortest accepted abbreviation
//   vlan             exact token (case-insensitive)
//   {active,passive} any one of the alternatives (each may use |)
//   (token)          optional token
//   <n>              integer          <ip>   dotted quad
//   <word>           any one token    <rest> everything that is left (may be empty)
//   <if:Gi0/1>       that interface, in any accepted spelling ("g0/1", "gig 0/1", ...)

type IfType = { full: string; min: number; spec: string };

const IF_TYPES: IfType[] = [
  { full: "gigabitethernet", min: 1, spec: "gi" },
  { full: "fastethernet", min: 1, spec: "fa" },
  { full: "tengigabitethernet", min: 2, spec: "te" },
  { full: "fortygigabitethernet", min: 2, spec: "fo" },
  { full: "hundredgige", min: 2, spec: "hu" },
  { full: "ethernet", min: 1, spec: "eth" },
  { full: "loopback", min: 1, spec: "lo" },
  { full: "vlan", min: 1, spec: "vlan" },
  { full: "port-channel", min: 1, spec: "po" },
  { full: "tunnel", min: 2, spec: "tu" },
  { full: "serial", min: 1, spec: "se" },
];

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

function keywordMatch(spec: string, input: string): boolean {
  const word = input.toLowerCase();
  const bar = spec.indexOf("|");
  if (bar === -1) return word === spec.toLowerCase();
  const head = spec.slice(0, bar).toLowerCase();
  const full = head + spec.slice(bar + 1).toLowerCase();
  return word.length >= head.length && full.startsWith(word);
}

function splitIf(raw: string): { type: string; num: string } | null {
  const m = raw.toLowerCase().match(/^([a-z-]+)\s*([\d/.:]+)$/);
  return m ? { type: m[1], num: m[2] } : null;
}

function ifMatch(spec: string, input: string): boolean {
  const want = splitIf(spec);
  const got = splitIf(input);
  if (!want || !got || want.num !== got.num) return false;
  const t = IF_TYPES.find((x) => x.spec === want.type);
  if (!t) return false;
  return got.type.length >= t.min && t.full.startsWith(got.type);
}

/** Splits on spaces but keeps brace groups together. */
function tokenizePattern(p: string): string[] {
  const out: string[] = [];
  let buf = "";
  let depth = 0;
  for (const ch of p.trim()) {
    if (ch === "{" || ch === "(") depth++;
    if (ch === "}" || ch === ")") depth--;
    if (ch === " " && depth === 0) {
      if (buf) out.push(buf);
      buf = "";
    } else buf += ch;
  }
  if (buf) out.push(buf);
  return out;
}

function matchFrom(pt: string[], pi: number, it: string[], ii: number): boolean {
  if (pi === pt.length) return ii === it.length;
  const tok = pt[pi];

  if (tok === "<rest>") return true;

  if (tok.startsWith("(") && tok.endsWith(")")) {
    const inner = tokenizePattern(tok.slice(1, -1));
    // Try with the optional group, then without.
    return matchFrom([...inner, ...pt.slice(pi + 1)], 0, it, ii) || matchFrom(pt, pi + 1, it, ii);
  }

  if (tok.startsWith("<if:")) {
    const spec = tok.slice(4, -1);
    // "gi0/1" as one token, or "gigabitEthernet 0/1" as two.
    if (ii < it.length && ifMatch(spec, it[ii]) && matchFrom(pt, pi + 1, it, ii + 1)) return true;
    if (ii + 1 < it.length && ifMatch(spec, it[ii] + it[ii + 1]) && matchFrom(pt, pi + 1, it, ii + 2)) return true;
    return false;
  }

  if (ii >= it.length) return false;
  const word = it[ii];
  let ok: boolean;
  if (tok === "<n>") ok = /^\d+$/.test(word);
  else if (tok === "<ip>" || tok === "<mask>") ok = IPV4.test(word);
  else if (tok === "<word>") ok = true;
  else if (tok.startsWith("{") && tok.endsWith("}")) {
    ok = tok.slice(1, -1).split(",").some((alt) => keywordMatch(alt.trim(), word));
  } else ok = keywordMatch(tok, word);

  return ok && matchFrom(pt, pi + 1, it, ii + 1);
}

export function matchCommand(pattern: string, input: string): boolean {
  const it = input.trim().split(/\s+/).filter(Boolean);
  return matchFrom(tokenizePattern(pattern), 0, it, 0);
}

export function matchAny(patterns: string[], input: string): boolean {
  return patterns.some((p) => matchCommand(p, input));
}
