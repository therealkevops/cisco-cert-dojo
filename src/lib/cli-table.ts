// A reusable command-table CLI engine for the NX-OS-style labs. Commands are space-separated token
// patterns; literal keywords match unique prefixes (an exact keyword beats a longer one), and `<x>`
// placeholders are checked by the table's placeholder functions. It gives "?" help, Tab completion,
// "% Incomplete command" and a caret under the first bad token.

export type CliCmd<C> = { modes: string[] | "any"; pat: string; help: string; run: (c: C, a: string[]) => string | void };
export type Placeholder = { test: (t: string) => string | null; help: string };

export type Dispatch<C> = { ok: true; cmd: CliCmd<C>; args: string[]; mode: string } | { ok: false; out: string };

export class CmdTable<C> {
  constructor(
    private cmds: CliCmd<C>[],
    private ph: Record<string, Placeholder>,
    private norm: (tokens: string[]) => string[] = (t) => t,
  ) {}

  private tok(pt: string, t: string): { ok: boolean; exact?: boolean; arg?: string } {
    const p = this.ph[pt];
    if (p) {
      const v = p.test(t);
      return { ok: v !== null, arg: v ?? t };
    }
    const tl = t.toLowerCase();
    return { ok: pt.startsWith(tl), exact: pt === tl };
  }

  private inMode(c: CliCmd<C>, m: string) {
    return c.modes === "any" || c.modes.includes(m);
  }

  tokens(raw: string) {
    return this.norm(raw.trim().split(/\s+/).filter(Boolean));
  }

  private find(tokens: string[], mode: string) {
    const res: { cmd: CliCmd<C>; args: string[]; exact: number }[] = [];
    for (const cmd of this.cmds) {
      if (!this.inMode(cmd, mode)) continue;
      const pts = cmd.pat.split(" ");
      if (pts.length !== tokens.length) continue;
      const args: string[] = [];
      let exact = 0;
      let ok = true;
      for (let i = 0; i < pts.length && ok; i++) {
        const r = this.tok(pts[i], tokens[i]);
        ok = r.ok;
        if (pts[i].startsWith("<")) args.push(r.arg!);
        if (r.exact) exact++;
      }
      if (ok) res.push({ cmd, args, exact });
    }
    return res.sort((a, b) => b.exact - a.exact);
  }

  private partial(tokens: string[], mode: string) {
    return this.cmds.some((cmd) => {
      if (!this.inMode(cmd, mode)) return false;
      const pts = cmd.pat.split(" ");
      return pts.length > tokens.length && tokens.every((t, i) => this.tok(pts[i], t).ok);
    });
  }

  /** Find the command for a line. `fallback` lists modes to try next (e.g. the parent modes, then config). */
  dispatch(raw: string, mode: string, fallback: string[], promptLen: number): Dispatch<C> {
    const tokens = this.tokens(raw);
    for (const m of [mode, ...fallback]) {
      const found = this.find(tokens, m);
      if (found.length) return { ok: true, cmd: found[0].cmd, args: found[0].args, mode: m };
    }
    if (this.partial(tokens, mode)) return { ok: false, out: "% Incomplete command" };
    let bad = tokens.length - 1;
    for (let k = 1; k <= tokens.length; k++) {
      const pre = tokens.slice(0, k);
      if (!this.partial(pre, mode) && !this.find(pre, mode).length && ![...fallback].some((m) => this.partial(pre, m) || this.find(pre, m).length)) {
        bad = k - 1;
        break;
      }
    }
    const words = raw.trim().split(/\s+/);
    const at = Math.max(0, raw.indexOf(words[Math.min(bad, words.length - 1)] ?? ""));
    return { ok: false, out: `${" ".repeat(promptLen + at)}^\n% Invalid command at '^' marker.` };
  }

  help(raw: string, modes: string[]): string {
    const text = raw.replace(/\?$/, "");
    const endsWord = !/\s$/.test(text) && text.length > 0;
    const tokens = this.tokens(text);
    const fixed = endsWord ? tokens.slice(0, -1) : tokens;
    const last = endsWord ? tokens[tokens.length - 1] : "";
    const seen = new Map<string, string>();
    for (const cmd of this.cmds) {
      if (!modes.some((m) => this.inMode(cmd, m))) continue;
      const pts = cmd.pat.split(" ");
      if (pts.length <= fixed.length) {
        if (pts.length === fixed.length && !endsWord && fixed.every((t, i) => this.tok(pts[i], t).ok)) seen.set("<cr>", "");
        continue;
      }
      if (!fixed.every((t, i) => this.tok(pts[i], t).ok)) continue;
      const next = pts[fixed.length];
      if (endsWord && !(this.ph[next] ? this.tok(next, last).ok : next.startsWith(last.toLowerCase()))) continue;
      if (!seen.has(next) || pts.length === fixed.length + 1) seen.set(next, cmd.help);
    }
    if (!seen.size) return "% Invalid command";
    return [...seen.entries()]
      .sort(([a], [b]) => (a === "<cr>" ? 1 : b === "<cr>" ? -1 : a.localeCompare(b)))
      .map(([k, h]) => `  ${k.padEnd(24)}${this.ph[k]?.help ?? h}`)
      .join("\n");
  }

  complete(raw: string, modes: string[]): string | null {
    if (/\s$/.test(raw) || !raw.trim()) return null;
    const tokens = this.tokens(raw);
    const fixed = tokens.slice(0, -1);
    const last = tokens[tokens.length - 1].toLowerCase();
    const opts = new Set<string>();
    for (const cmd of this.cmds) {
      if (!modes.some((m) => this.inMode(cmd, m))) continue;
      const pts = cmd.pat.split(" ");
      if (pts.length <= fixed.length || !fixed.every((t, i) => this.tok(pts[i], t).ok)) continue;
      const next = pts[fixed.length];
      if (!this.ph[next] && next.startsWith(last)) opts.add(next);
    }
    if (opts.size !== 1) return null;
    return `${raw.replace(/\S+$/, "")}${[...opts][0]} `;
  }
}
