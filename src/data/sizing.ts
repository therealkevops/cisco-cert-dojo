import {
  CKPT_BYTES_PER_PARAM,
  TRAIN_BYTES_PER_PARAM,
  checkpointGB,
  checkpointGBps,
  gpusFor,
  inferenceGB,
  pow2,
  rawForUsable,
  readGBps,
  sizeFabric,
  sizePower,
  trainingStateGB,
  weightsGB,
} from "@/lib/sizing";

// Sizing Desk: worksheet exercises for DCAI 2.1–2.4. Every answer is computed by src/lib/sizing.ts, so the
// worked solution and the grading can't drift apart.

type StepBase = {
  prompt: string;
  /** Optional code, JSON or CLI shown above the answer box. */
  exhibit?: string;
  working: string;
};
export type NumberStep = StepBase & {
  kind?: "number";
  unit: string;
  answer: number;
  /** relative tolerance (0 = exact integer) */
  tol: number;
};
/** Free text, compared case-insensitively with whitespace collapsed. */
export type TextStep = StepBase & { kind: "text"; accept: string[]; canonical: string; unit?: string };
export type JsonCheck = { path: string; equals?: string | number | boolean | null; type?: "string" | "number" | "boolean" | "array" | "object"; length?: number };
/** The learner writes JSON; it must parse and pass every check. */
export type JsonStep = StepBase & { kind: "json"; checks: JsonCheck[]; example: string };
export type ChoiceStep = StepBase & { kind: "choice"; choices: string[]; answer: number };
export type SizingStep = NumberStep | TextStep | JsonStep | ChoiceStep;

export type SizingExercise = {
  id: string;
  exam: "dcai" | "encor" | "dccor";
  /** Sizing Desk (DCAI) or Design & Automation Desk (ENCOR). */
  area?: "sizing" | "desk";
  objective: string;
  /** Further objectives this worksheet practises. */
  also?: string[];
  title: string;
  brief: string;
  /** The facts on the design request, shown as a spec sheet. */
  given: [string, string][];
  steps: SizingStep[];
  /** What the numbers mean for the design. */
  takeaway: string;
};

const n = (x: number, d = 1) => (Number.isInteger(x) ? x.toLocaleString("en-US") : x.toLocaleString("en-US", { maximumFractionDigits: d }));

// --- 2.1 Network: 256 GPUs ------------------------------------------------------------------
const f256 = sizeFabric({ gpus: 256, gpusPerServer: 8, switchPorts: 64, oversub: 1 });
// --- 2.1 Network: scale to 1,024 ------------------------------------------------------------
const f1k = sizeFabric({ gpus: 1024, gpusPerServer: 8, switchPorts: 64, oversub: 1 });
const fOver = sizeFabric({ gpus: 1024, gpusPerServer: 8, switchPorts: 64, oversub: 3 });
// --- 2.2 Inference -------------------------------------------------------------------------
const inf16 = inferenceGB(70, "FP16", 0.2);
const inf8 = inferenceGB(70, "FP8", 0.2);
const tp16 = pow2(gpusFor(inf16, 80));
const replicasPerServer = 8 / tp16;
const replicasNeeded = Math.ceil(30000 / 2500);
// --- 2.2 Training memory -------------------------------------------------------------------
const train13 = trainingStateGB(13);
// --- 2.3 Storage ---------------------------------------------------------------------------
const ck70 = checkpointGB(70);
const ckRate = checkpointGBps(70, 60);
const read512 = readGBps(512, 200);
const raw = rawForUsable(2, 8, 2);
// --- 2.4 Power -----------------------------------------------------------------------------
const pw = sizePower({ servers: 32, serverKW: 10.2, rackKW: 41, networkPct: 8, pue: 1.3 });
const pwAir = sizePower({ servers: 32, serverKW: 10.2, rackKW: 15, networkPct: 8, pue: 1.3 });

export const sizingExercises: SizingExercise[] = [
  {
    id: "size-fabric-256",
    exam: "dcai",
    objective: "2.1",
    title: "A back-end fabric for 256 GPUs",
    brief: "A customer is buying 32 GPU servers for training. Design a non-blocking, rail-optimised, two-tier back-end fabric.",
    given: [
      ["GPUs", "256 (8 per server)"],
      ["Back-end NICs", "one 400G NIC per GPU"],
      ["Switches", "64 × 400G ports, used as leaf or spine"],
      ["Design", "rail-optimised, non-blocking (1:1), two tiers"],
    ],
    steps: [
      { prompt: "How many rails (one per GPU position in a server)?", unit: "rails", answer: f256.rails, tol: 0, working: "One rail per GPU slot: 8 GPUs per server → 8 rails." },
      { prompt: "How many leaf ports face GPUs when the leaf is non-blocking?", unit: "ports", answer: f256.down, tol: 0, working: "Non-blocking means downlinks = uplinks: 64 / 2 = 32 down, 32 up." },
      { prompt: "How many leaves in total?", unit: "leaves", answer: f256.leaves, tol: 0, working: `Each rail has ${n(f256.servers)} GPUs (one per server), which fits on ${n(f256.leavesPerRail)} leaf of 32 downlinks. 8 rails × ${n(f256.leavesPerRail)} = ${n(f256.leaves)} leaves.` },
      { prompt: "How many spines?", unit: "spines", answer: f256.spines, tol: 0, working: `Uplinks: ${n(f256.leaves)} leaves × 32 = ${n(f256.spineCables)}. Spines: ${n(f256.spineCables)} / 64 ports = ${n(f256.spines)}.` },
      { prompt: "How many cables in total (GPU-to-leaf plus leaf-to-spine)?", unit: "cables", answer: f256.gpuCables + f256.spineCables, tol: 0, working: `${n(f256.gpuCables)} GPU links + ${n(f256.spineCables)} leaf-spine links = ${n(f256.gpuCables + f256.spineCables)}.` },
      { prompt: "How many optical transceivers, if every link uses optics at both ends?", unit: "optics", answer: f256.optics, tol: 0, working: `Two per cable: 2 × ${n(f256.gpuCables + f256.spineCables)} = ${n(f256.optics)}.` },
    ],
    takeaway: "A non-blocking back-end needs as many leaf-spine links as GPU links, so cables and optics double. Optics are a large part of an AI fabric's cost and power.",
  },
  {
    id: "size-fabric-1k",
    exam: "dcai",
    objective: "2.1",
    title: "Scaling the fabric to 1,024 GPUs",
    brief: "The same customer wants to grow to 128 servers. Check whether two tiers still work, and what oversubscription would save.",
    given: [
      ["GPUs", "1,024 (8 per server)"],
      ["Back-end NICs", "one 400G NIC per GPU"],
      ["Switches", "64 × 400G ports"],
      ["Design", "rail-optimised, two tiers"],
    ],
    steps: [
      { prompt: "Non-blocking: how many leaves per rail?", unit: "leaves", answer: f1k.leavesPerRail, tol: 0, working: `${n(f1k.servers)} GPUs per rail / 32 downlinks per leaf = ${n(f1k.leavesPerRail)}.` },
      { prompt: "Non-blocking: how many leaves and spines in total? Enter the spine count.", unit: "spines", answer: f1k.spines, tol: 0, working: `${n(f1k.leaves)} leaves × 32 uplinks = ${n(f1k.spineCables)} uplinks. ${n(f1k.spineCables)} / 64 = ${n(f1k.spines)} spines.` },
      { prompt: "What is the largest GPU count a non-blocking two-tier fabric of 64-port switches can connect?", unit: "GPUs", answer: f1k.max2Tier, tol: 0, working: "Each leaf needs a link to every spine, so a spine's 64 ports allow at most 64 leaves. 64 leaves × 32 GPUs = 2,048. Beyond that you need a third tier (super-spine) or higher-radix switches." },
      { prompt: "If each leaf instead uses 48 ports down and 16 up, what is the oversubscription ratio? (down ÷ up)", unit: ": 1", answer: 48 / 16, tol: 0.01, working: "48 / 16 = 3:1. Cross-leaf traffic from a full leaf gets a third of its line rate." },
      { prompt: "With 48 down / 16 up, how many leaves would the 1,024 GPUs need?", unit: "leaves", answer: fOver.leaves, tol: 0, working: `${n(fOver.servers)} GPUs per rail / 48 = ${n(fOver.leavesPerRail)} per rail (rounded up). 8 rails × ${n(fOver.leavesPerRail)} = ${n(fOver.leaves)} leaves, instead of ${n(f1k.leaves)}.` },
      { prompt: "And how many spines?", unit: "spines", answer: fOver.spines, tol: 0, working: `${n(fOver.leaves)} leaves × 16 uplinks = ${n(fOver.spineCables)}. ${n(fOver.spineCables)} / 64 = ${n(fOver.spines)} spines, instead of ${n(f1k.spines)}.` },
    ],
    takeaway: "Oversubscription saves switches and optics, but AI training is synchronous: cross-leaf collectives run at the uplink rate, so most back-end fabrics stay at 1:1.",
  },
  {
    id: "size-inference",
    exam: "dcai",
    objective: "2.2",
    title: "Serving a 70B model",
    brief: "Size GPU servers to serve a 70-billion-parameter LLM to an internal chat service.",
    given: [
      ["Model", "70B parameters"],
      ["Overhead", "+20% on top of weights for KV cache and activations"],
      ["GPU", "80 GB HBM, 8 GPUs per server"],
      ["Demand", "30,000 tokens/s at peak; one replica serves 2,500 tokens/s"],
    ],
    steps: [
      { prompt: "Memory for the weights alone in FP16?", unit: "GB", answer: weightsGB(70, "FP16"), tol: 0.01, working: "70 × 10⁹ params × 2 bytes = 140 GB." },
      { prompt: "Total footprint including the 20% overhead?", unit: "GB", answer: inf16, tol: 0.01, working: `140 × 1.2 = ${n(inf16)} GB.` },
      { prompt: "GPUs per replica? (Tensor-parallel sizes are powers of two.)", unit: "GPUs", answer: tp16, tol: 0, working: `${n(inf16)} / 80 = ${n(inf16 / 80, 2)} → at least ${gpusFor(inf16, 80)} GPUs, rounded up to the next power of two = ${tp16}.` },
      { prompt: "Quantised to FP8, what is the total footprint?", unit: "GB", answer: inf8, tol: 0.01, working: `70 × 1 byte × 1.2 = ${n(inf8)} GB → ${gpusFor(inf8, 80)} GPUs. Halving precision halves memory.` },
      { prompt: "Back in FP16: how many replicas does peak demand need?", unit: "replicas", answer: replicasNeeded, tol: 0, working: `30,000 / 2,500 = ${replicasNeeded}.` },
      { prompt: "How many 8-GPU servers is that?", unit: "servers", answer: Math.ceil(replicasNeeded / replicasPerServer), tol: 0, working: `8 / ${tp16} = ${replicasPerServer} replicas per server. ${replicasNeeded} / ${replicasPerServer} = ${Math.ceil(replicasNeeded / replicasPerServer)} servers.` },
    ],
    takeaway: "Inference is sized by memory first (model + KV cache per replica), then by throughput (replicas). Quantisation is often the cheapest way to fit a model on fewer GPUs.",
  },
  {
    id: "size-training-memory",
    exam: "dcai",
    objective: "2.2",
    title: "Why a 13B model doesn't train on one GPU",
    brief: "A data scientist asks why fine-tuning a 13B model fails with out-of-memory errors on one 80 GB GPU, when the FP16 weights are only 26 GB.",
    given: [
      ["Model", "13B parameters, full fine-tune"],
      ["Training", `mixed precision with Adam ≈ ${TRAIN_BYTES_PER_PARAM} bytes per parameter (FP16 weights 2 + FP16 gradients 2 + FP32 master 4 + two FP32 Adam moments 8)`],
      ["GPU", "80 GB HBM"],
    ],
    steps: [
      { prompt: "FP16 weights alone?", unit: "GB", answer: weightsGB(13, "FP16"), tol: 0.01, working: "13 × 2 = 26 GB." },
      { prompt: "Total training state (weights, gradients, master copy, optimizer)?", unit: "GB", answer: train13, tol: 0.01, working: `13 × ${TRAIN_BYTES_PER_PARAM} = ${train13} GB, before activations.` },
      { prompt: "Minimum GPUs if the state is fully sharded across them (ZeRO-3 / FSDP), ignoring activations?", unit: "GPUs", answer: gpusFor(train13, 80), tol: 0, working: `${train13} / 80 = ${n(train13 / 80, 2)} → ${gpusFor(train13, 80)} GPUs. Activations add more, so in practice a full 8-GPU server.` },
    ],
    takeaway: "Training needs roughly 8× the memory of the FP16 weights. That's why training uses multi-GPU sharding and fast interconnects, and why parameter-efficient methods such as LoRA are popular.",
  },
  {
    id: "size-storage",
    exam: "dcai",
    objective: "2.3",
    title: "Checkpoints, data loading and raw capacity",
    brief: "Size the storage tier for a 512-GPU training cluster that trains a 70B model.",
    given: [
      ["Checkpoint", `${CKPT_BYTES_PER_PARAM} bytes per parameter (FP16 weights, FP32 master copy, two Adam moments)`],
      ["Checkpoint window", "write within 60 seconds"],
      ["Data loading", "200 MB/s per GPU, 512 GPUs"],
      ["Capacity", "2 PB usable, erasure coding 8+2"],
    ],
    steps: [
      { prompt: "Size of one checkpoint?", unit: "GB", answer: ck70, tol: 0.01, working: `70 × ${CKPT_BYTES_PER_PARAM} = ${n(ck70)} GB.` },
      { prompt: "Write throughput to save it in 60 s?", unit: "GB/s", answer: ckRate, tol: 0.02, working: `${n(ck70)} / 60 ≈ ${n(ckRate)} GB/s.` },
      { prompt: "Aggregate read throughput for data loading?", unit: "GB/s", answer: read512, tol: 0.01, working: `512 × 200 MB/s = 102,400 MB/s ≈ ${n(read512)} GB/s.` },
      { prompt: "Raw capacity for 2 PB usable with 8+2 erasure coding?", unit: "PB", answer: raw, tol: 0.01, working: `2 × (8+2)/8 = ${n(raw, 2)} PB.` },
    ],
    takeaway: "Here data loading sets the steady throughput and checkpoints set the write bursts. Both point to a parallel file system or NVMe-oF tier, with object storage behind it for capacity.",
  },
  {
    id: "size-power",
    exam: "dcai",
    objective: "2.4",
    title: "Racks, power and PUE",
    brief: "Plan the room for 32 GPU servers and see why the cooling choice decides the floor plan.",
    given: [
      ["Servers", "32 × 10.2 kW at full load"],
      ["Rack budget", "41 kW per rack (liquid-assisted)"],
      ["Networking", "adds 8% to the server load"],
      ["Facility", "PUE 1.3, runs all year"],
    ],
    steps: [
      { prompt: "Servers per rack within 41 kW?", unit: "servers", answer: pw.serversPerRack, tol: 0, working: `41 / 10.2 = ${n(41 / 10.2, 2)} → ${pw.serversPerRack} per rack.` },
      { prompt: "Racks needed?", unit: "racks", answer: pw.racks, tol: 0, working: `32 / ${pw.serversPerRack} = ${pw.racks}.` },
      { prompt: "IT load including networking?", unit: "kW", answer: pw.itKW, tol: 0.01, working: `32 × 10.2 × 1.08 = ${n(pw.itKW)} kW.` },
      { prompt: "Total facility power at PUE 1.3?", unit: "kW", answer: pw.facilityKW, tol: 0.01, working: `${n(pw.itKW)} × 1.3 = ${n(pw.facilityKW)} kW.` },
      { prompt: "Energy per year?", unit: "MWh", answer: pw.mwhYear, tol: 0.01, working: `${n(pw.facilityKW)} kW × 8,760 h / 1,000 = ${n(pw.mwhYear, 0)} MWh.` },
      { prompt: "In a legacy air-cooled room limited to 15 kW per rack, how many racks?", unit: "racks", answer: pwAir.racks, tol: 0, working: `15 / 10.2 → ${pwAir.serversPerRack} server per rack, so ${pwAir.racks} racks for the same 32 servers.` },
    ],
    takeaway: "Rack density, not floor space, is the constraint for GPU clusters. Cutting PUE from 1.6 to 1.3 on this load saves about 0.3 × IT load continuously, which is why liquid cooling and efficient facilities matter.",
  },
];

export const sizingById = Object.fromEntries(sizingExercises.map((e) => [e.id, e]));

/** Accepts "1,024", "1.67", "1.67:1" and the like. */
export function parseAnswer(s: string): number | null {
  const m = s.replace(/,/g, "").trim().match(/^-?\d*\.?\d+/);
  return m ? Number(m[0]) : null;
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").replace(/^["'`]|["'`]$/g, "").toLowerCase();

/** Value at a dotted path such as `vlans[1].name` or `ietf-interfaces:interface.name`. */
export function jsonAt(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const part of path.split(".")) {
    const m = part.match(/^([^[\]]*)((?:\[\d+\])*)$/);
    if (!m) return undefined;
    if (m[1]) cur = cur && typeof cur === "object" ? (cur as Record<string, unknown>)[m[1]] : undefined;
    for (const ix of m[2].match(/\d+/g) ?? []) cur = Array.isArray(cur) ? cur[+ix] : undefined;
  }
  return cur;
}

const typeOf = (v: unknown) => (Array.isArray(v) ? "array" : v === null ? "null" : typeof v);

/** Checks a JSON answer; returns the problems found (empty = correct). */
export function checkJson(step: JsonStep, input: string): string[] {
  let data: unknown;
  try {
    data = JSON.parse(input);
  } catch (e) {
    return [`Not valid JSON: ${(e as Error).message}`];
  }
  const out: string[] = [];
  for (const c of step.checks) {
    const v = jsonAt(data, c.path);
    if (v === undefined) {
      out.push(`${c.path} is missing`);
      continue;
    }
    const wantType = c.type ?? (c.equals !== undefined && c.equals !== null ? typeOf(c.equals) : undefined);
    if (wantType && typeOf(v) !== wantType) {
      out.push(`${c.path} should be ${wantType === "array" ? "an array" : wantType === "object" ? "an object" : `a ${wantType}`}, not ${typeOf(v)} ${JSON.stringify(v)}`.trim());
      continue;
    }
    if (c.equals !== undefined && v !== c.equals) out.push(`${c.path} should be ${JSON.stringify(c.equals)}, not ${JSON.stringify(v)}`);
    if (c.length !== undefined && (!Array.isArray(v) || v.length !== c.length)) out.push(`${c.path} should have ${c.length} items`);
  }
  return out;
}

export function checkStep(step: SizingStep, input: string): boolean {
  if (step.kind === "text") return step.accept.some((a) => norm(a) === norm(input));
  if (step.kind === "json") return checkJson(step, input).length === 0;
  if (step.kind === "choice") return Number(input) === step.answer;
  const v = parseAnswer(input);
  if (v === null) return false;
  if (step.tol === 0) return Math.abs(v - step.answer) < 1e-9;
  return Math.abs(v - step.answer) <= Math.abs(step.answer) * step.tol;
}

/** The answer as it should be shown when revealed. */
export function shownAnswer(step: SizingStep): string {
  if (step.kind === "text") return step.canonical;
  if (step.kind === "json") return step.example;
  if (step.kind === "choice") return step.choices[step.answer];
  return `${step.answer.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${step.unit}`.trim();
}
