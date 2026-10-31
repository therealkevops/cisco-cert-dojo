// Content model. Everything the app renders comes from these shapes, so adding
// a new exam is a matter of writing one more file in src/data/exams.

export type Objective = {
  /** Blueprint number exactly as Cisco prints it, e.g. "3.2.b". */
  id: string;
  title: string;
  /** Two or three sentence summary — the "why it matters". */
  brief: string;
  /** Facts worth memorising. */
  keys: string[];
  /** Optional config / output snippet shown in the field notes. */
  cli?: string;
  /** The classic exam trap for this topic. */
  trap?: string;
};

export type Domain = {
  id: string; // "1.0"
  name: string;
  weight: number; // percent of the exam
  objectives: Objective[];
};

type QuestionBase = {
  id: string;
  objective: string; // Objective.id
  prompt: string;
  explain: string;
};

export type SingleQuestion = QuestionBase & {
  kind: "single";
  choices: string[];
  answer: number;
};

export type MultiQuestion = QuestionBase & {
  kind: "multi";
  choices: string[];
  answer: number[];
};

/** Learner types a command; any pattern in `accept` (pattern DSL, see lib/cli-pattern) counts. */
export type CliQuestion = QuestionBase & {
  kind: "cli";
  prompt: string;
  /** Prompt shown before the cursor, e.g. "R1(config-if)#". */
  context: string;
  accept: string[];
  /** The canonical answer shown after grading. */
  canonical: string;
};

/** Items are listed in the correct order; the UI shuffles them. */
export type OrderQuestion = QuestionBase & {
  kind: "order";
  items: string[];
};

export type Question = SingleQuestion | MultiQuestion | CliQuestion | OrderQuestion;

export type Exam = {
  id: string; // url slug
  code: string; // "350-401"
  short: string; // "ENCOR"
  name: string;
  version: string;
  minutes: number;
  /** Rough number of items on the real exam, used to pace mock exams. */
  approxItems: number;
  /** Role in the certification: core or concentration. */
  role: "core" | "concentration" | "associate" | "expert";
  blueprintUrl: string;
  domains: Domain[];
  questions: Question[];
};

export type Track = {
  id: string;
  name: string;
  level: "Associate" | "Professional" | "Expert" | "Specialist";
  /** Exam ids that are loaded in the dojo. */
  exams: string[];
  /** Short plain-language note on how the track is earned. */
  rule: string;
  status: "racked" | "planned";
};

// --- CLI labs -------------------------------------------------------------

export type LabStep = {
  /** What the learner is asked to do, written as a ticket line. */
  task: string;
  /** Canonical command, used for the solution view and the running-config. */
  cmd: string;
  /** Pattern DSL strings; first match wins. */
  accept: string[];
  /** If the command opens a sub-mode, the prompt suffix it enters, e.g. "config-if". */
  enters?: string;
  /** How many mode levels the command climbs out of (exit = 1, exit-address-family = 1, ...). */
  leaves?: number;
  /** `end` — drop straight back to privileged EXEC. */
  ends?: boolean;
  hint: string;
  /** Optional device response printed after the command is accepted. */
  output?: string;
};

export type Lab = {
  id: string;
  exam: string;
  objective: string;
  title: string;
  hostname: string;
  /** NX-OS skips the enable step and starts privileged. */
  platform: "ios-xe" | "nx-os";
  brief: string;
  topology: string;
  steps: LabStep[];
  /** Canned show-command output, keyed by pattern DSL. Available once the lab is finished. */
  shows: { match: string; output: string }[];
};
