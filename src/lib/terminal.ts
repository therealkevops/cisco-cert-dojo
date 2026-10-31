import type { Lab, LabStep } from "@/data/types";
import { matchAny, matchCommand } from "./cli-pattern";

// A deliberately small IOS/NX-OS simulator. It tracks the mode stack and
// grades each line against the ticket, so it can coach like a senior engineer
// sitting next to you rather than just saying "% Invalid input".

export type Mode = { exec: "user" | "priv"; stack: string[] };

export type Line = { kind: "in" | "out" | "ok" | "err" | "coach"; text: string; prompt?: string };

export type TermState = {
  mode: Mode;
  step: number;
  slips: number;
  done: boolean;
  /** Accepted config lines with their depth, used for `show running-config`. */
  config: { depth: number; text: string }[];
};

const isEnable = (s: string) => matchCommand("en|able", s);
const isConfT = (s: string) => matchCommand("conf|igure t|erminal", s);
const isExit = (s: string) => matchCommand("exi|t", s);
const isEnd = (s: string) => matchCommand("end", s);

export function initialState(lab: Lab): TermState {
  return { mode: { exec: lab.platform === "nx-os" ? "priv" : "user", stack: [] }, step: 0, slips: 0, done: false, config: [] };
}

export function prompt(lab: Lab, mode: Mode): string {
  const top = mode.stack[mode.stack.length - 1];
  if (top) return `${lab.hostname}(${top})#`;
  return `${lab.hostname}${mode.exec === "priv" ? "#" : ">"}`;
}

function applyStep(mode: Mode, step: LabStep): Mode {
  if (isEnable(step.cmd)) return { exec: "priv", stack: [] };
  if (isConfT(step.cmd)) return { exec: "priv", stack: ["config"] };
  if (step.ends) return { exec: "priv", stack: [] };
  let stack = mode.stack;
  if (step.leaves) stack = stack.slice(0, Math.max(0, stack.length - step.leaves));
  if (step.enters) stack = [...stack, step.enters];
  return { exec: mode.exec, stack };
}

/** Mode the learner should be in before each step, derived from the ticket itself. */
export function expectedModes(lab: Lab): Mode[] {
  const out: Mode[] = [];
  let m = initialState(lab).mode;
  for (const s of lab.steps) {
    out.push(m);
    m = applyStep(m, s);
  }
  return out;
}

const sameMode = (a: Mode, b: Mode) => a.exec === b.exec && a.stack.join("/") === b.stack.join("/");

function describe(mode: Mode) {
  const top = mode.stack[mode.stack.length - 1];
  return top ? `(${top})` : mode.exec === "priv" ? "privileged EXEC (#)" : "user EXEC (>)";
}

export function runLine(lab: Lab, st: TermState, raw: string): { state: TermState; lines: Line[] } {
  const input = raw.trim();
  const lines: Line[] = [{ kind: "in", text: raw, prompt: prompt(lab, st.mode) }];
  if (!input) return { state: st, lines };

  // `do` lets you run exec commands from config mode, as on the real box.
  const body = input.toLowerCase().startsWith("do ") ? input.slice(3).trim() : input;

  if (body === "?" || matchCommand("hint", body)) {
    if (st.done) lines.push({ kind: "coach", text: "Ticket closed. Try the show commands listed beside the terminal." });
    else lines.push({ kind: "coach", text: `Next: ${lab.steps[st.step].task}  →  try: ${lab.steps[st.step].hint}` });
    return { state: st, lines };
  }

  if (matchCommand("sh|ow run|ning-config", body)) {
    const cfg = st.config.length
      ? st.config.map((c) => " ".repeat(c.depth) + c.text).join("\n")
      : "! nothing configured yet in this session";
    lines.push({ kind: "out", text: `Building configuration...\n!\nhostname ${lab.hostname}\n!\n${cfg}\n!\nend` });
    return { state: st, lines };
  }

  if (matchCommand("sh|ow <rest>", body)) {
    const show = lab.shows.find((s) => matchCommand(s.match, body));
    if (!show) lines.push({ kind: "err", text: "% This show command is not simulated in this lab." });
    else if (!st.done) lines.push({ kind: "coach", text: "Finish the ticket first. The output reflects the finished configuration." });
    else lines.push({ kind: "out", text: show.output });
    return { state: st, lines };
  }

  if (st.done) {
    lines.push({ kind: "coach", text: "Ticket already closed. Reset the lab to run it again." });
    return { state: st, lines };
  }

  const step = lab.steps[st.step];
  const want = expectedModes(lab)[st.step];

  if (matchAny(step.accept, body)) {
    if (!sameMode(st.mode, want)) {
      lines.push({ kind: "err", text: "% Invalid input detected at '^' marker." });
      lines.push({ kind: "coach", text: `Right command, wrong mode. You are in ${describe(st.mode)}; this belongs in ${describe(want)}.` });
      return { state: { ...st, slips: st.slips + 1 }, lines };
    }
    const nav = isEnable(step.cmd) || isConfT(step.cmd) || isExit(step.cmd) || isEnd(step.cmd) || step.cmd.startsWith("exit-");
    const config = nav ? st.config : [...st.config, { depth: Math.max(0, st.mode.stack.length - 1), text: step.cmd }];
    const mode = applyStep(st.mode, step);
    if (step.output) lines.push({ kind: "out", text: step.output });
    const next = st.step + 1;
    const done = next >= lab.steps.length;
    if (done) lines.push({ kind: "ok", text: `✓ Ticket complete${st.slips ? ` with ${st.slips} slip${st.slips > 1 ? "s" : ""}` : " (clean run)"}. Try a show command.` });
    return { state: { ...st, mode, step: next, done, config }, lines };
  }

  // Free navigation that is not part of the plan still behaves like IOS.
  if (isExit(body) || isEnd(body)) {
    const mode: Mode = isEnd(body) ? { exec: st.mode.exec, stack: [] } : { exec: st.mode.exec, stack: st.mode.stack.slice(0, -1) };
    return { state: { ...st, mode }, lines };
  }
  if (isEnable(body) && st.mode.exec === "user") return { state: { ...st, mode: { exec: "priv", stack: [] } }, lines };
  if (isConfT(body) && st.mode.exec === "priv" && st.mode.stack.length === 0) {
    return { state: { ...st, mode: { exec: "priv", stack: ["config"] } }, lines };
  }

  // Re-entering a sub-mode you already configured (e.g. after an early exit).
  const modes = expectedModes(lab);
  for (let i = 0; i < st.step; i++) {
    const s = lab.steps[i];
    if (s.enters && matchAny(s.accept, body) && sameMode(st.mode, modes[i])) {
      return { state: { ...st, mode: applyStep(st.mode, s) }, lines };
    }
  }

  lines.push({ kind: "err", text: "% Invalid input detected at '^' marker." });
  // If a later step matches, the learner is ahead of the ticket order.
  const later = lab.steps.findIndex((s, i) => i > st.step && matchAny(s.accept, body));
  lines.push({
    kind: "coach",
    text: later > -1 ? `Valid later in the ticket. First: ${step.task}` : `Not what the ticket asks. ${step.task}  (type ? for a hint)`,
  });
  return { state: { ...st, slips: st.slips + 1 }, lines };
}
