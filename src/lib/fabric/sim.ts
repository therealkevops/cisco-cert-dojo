import type { Fabric, FabricGoal, HostCfg, SwitchCfg } from "./types";

// A fluid model of a RoCEv2 back-end fabric, ticked in 1 µs steps. Each switch egress port has two queues:
// the no-drop RoCE class (qos-group 3) and lossy class-default. Bytes move one hop per tick. PFC, ECN with
// DCQCN at the NICs, ETS scheduling, ECMP hashing, flowlet load balancing, the PFC watchdog, MTU checks,
// bad optics and stuck NICs are modelled closely enough to show cause and effect, not to predict real numbers.

export type Cls = "roce" | "def";

export type LinkStat = {
  /** KB carried */
  kb: number;
  /** ticks during which this direction was held by PFC pause from the receiver */
  pausedUs: number;
  ecnKb: number;
  /** tail drops (KB) at the egress queue */
  dropKb: number;
  /** frames over the receiver's MTU (KB) */
  mtuKb: number;
  /** bytes corrupted by a bad optic (KB) */
  crcKb: number;
  /** bytes discarded by the PFC watchdog (KB) */
  stompKb: number;
  maxQ: number;
  wdEvents: number;
};

export type Frame = {
  t: number;
  /** directed link "A>B" → utilisation 0..1 over the sample window */
  util: Record<string, number>;
  /** directed link → queued KB at the sender (both classes) */
  q: Record<string, number>;
  /** directed links whose sender is paused for the RoCE class */
  paused: string[];
  /** directed links whose RoCE queue is shut by the watchdog */
  shut: string[];
  /** job id → 0..1 */
  progress: Record<string, number>;
};

export type JobResult = { id: string; name: string; done: boolean; jctUs?: number; dropKb: number; sizeKb: number };

export type FlowInfo = { id: string; job: string; src: string; dst: string; qp: number; path: string[]; doneAt?: number; minRateGbps: number };

export type SimResult = {
  endT: number;
  frames: Frame[];
  jobs: JobResult[];
  links: Record<string, LinkStat>;
  flows: FlowInfo[];
  cnps: number;
  /** highest share of the run any one link spent paused, 0..100 */
  worstPausePct: number;
};

export const TICK_LIMIT = 9000;
const SAMPLE = 10;
const GBN = 4; // go-back-N: each KB lost to congestion costs this many KB of resending
const GBN_CRC = 25; // corruption losses are isolated, so each one costs a whole window
const WD_US = 100; // watchdog: queue paused this long is shut
const WD_RESTORE_US = 50;
const G = 1 / 16;
const RAI = 0.5; // KB/µs additive increase
const MIN_RATE = 0.5;
const CNP_DELAY = 4;
const CNP_GAP = 5;
const HDR = 100; // bytes of headers above the RoCE MTU

// --- naming -------------------------------------------------------------------------------

export const leafId = (l: number) => `L${l}`;
export const spineId = (s: number) => `S${s}`;
export const hostId = (n: number) => `H${n}`;
export const linkKey = (a: string, b: string) => (a < b ? `${a}-${b}` : `${b}-${a}`);

export function hostsOf(f: Fabric): string[] {
  return Array.from({ length: f.leaves * f.hostsPerLeaf }, (_, i) => hostId(i + 1));
}
export function leafOf(f: Fabric, host: string): string {
  return leafId(Math.ceil(+host.slice(1) / f.hostsPerLeaf));
}
export function switchesOf(f: Fabric): string[] {
  return [...Array.from({ length: f.spines }, (_, i) => spineId(i + 1)), ...Array.from({ length: f.leaves }, (_, i) => leafId(i + 1))];
}
export function linksOf(f: Fabric): [string, string][] {
  const out: [string, string][] = [];
  for (let l = 1; l <= f.leaves; l++) for (let s = 1; s <= f.spines; s++) out.push([leafId(l), spineId(s)]);
  for (const h of hostsOf(f)) out.push([h, leafOf(f, h)]);
  return out;
}

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Spine an ECMP hash picks for one QP, given the usable spines. */
export function hashSpine(f: Fabric, src: string, dst: string, qp: number, usable: string[]): string {
  const sw = f.switches[leafOf(f, src)];
  const key = sw.hash === "l3l4" ? `${src}|${dst}|${49152 + qp * 7}` : `${src}|${dst}`;
  return usable[fnv(key) % usable.length];
}

// --- simulation ---------------------------------------------------------------------------

type Flow = {
  id: string;
  job: string;
  src: string;
  dst: string;
  qp: number;
  size: number;
  toSend: number;
  queued: number;
  delivered: number;
  path: string[];
  reachable: boolean;
  rate: number;
  rt: number;
  alpha: number;
  lastCnp: number;
  lastInc: number;
  lastCnpGen: number;
  markAcc: number;
  cnpDue: number[];
  doneAt?: number;
  dropKb: number;
  minRate: number;
};

type Queue = { flows: Map<Flow, number>; total: number; xoff: boolean; pausedFor: number; clearFor: number; shut: boolean };

const isHost = (id: string) => id.startsWith("H");

export function simulate(fab: Fabric, maxT = TICK_LIMIT): SimResult {
  const hostCap = fab.hostGbps / 8;
  const upCap = fab.uplinkGbps / 8;
  const sw = (id: string): SwitchCfg => fab.switches[id];
  const host = (id: string): HostCfg => fab.hosts[id];
  const stuck = new Set(fab.stuck);
  const linkDown = (a: string, b: string) => {
    if (isHost(a) && !host(a).up) return true;
    if (isHost(b) && !host(b).up) return true;
    return !!fab.links[linkKey(a, b)]?.down;
  };
  const cap = (a: string, b: string) => (isHost(a) || isHost(b) ? hostCap : upCap);
  const crc = (a: string, b: string) => fab.links[linkKey(a, b)]?.crc ?? 0;

  const stats: Record<string, LinkStat> = {};
  const stat = (dl: string) => (stats[dl] ??= { kb: 0, pausedUs: 0, ecnKb: 0, dropKb: 0, mtuKb: 0, crcKb: 0, stompKb: 0, maxQ: 0, wdEvents: 0 });
  for (const [a, b] of linksOf(fab)) {
    stat(`${a}>${b}`);
    stat(`${b}>${a}`);
  }

  const queues = new Map<string, Queue>();
  const queue = (dl: string, c: Cls) => {
    const k = `${dl}|${c}`;
    let q = queues.get(k);
    if (!q) queues.set(k, (q = { flows: new Map(), total: 0, xoff: false, pausedFor: 0, clearFor: 0, shut: false }));
    return q;
  };
  const classify = (x: string, f: Flow): Cls => (sw(x).noDropDscp.includes(host(f.src).dscp) ? "roce" : "def");

  // --- flows and paths ---
  const flows: Flow[] = [];
  const assigned = new Map<string, number>(); // uplink → KB assigned (for DLB placement)
  for (const job of fab.jobs) {
    for (const [src, dst, mb] of job.flows) {
      const qps = Math.max(1, host(src).qps);
      for (let qp = 0; qp < qps; qp++) {
        const size = (mb * 1000) / qps;
        const ls = leafOf(fab, src);
        const ld = leafOf(fab, dst);
        let path: string[] = [src, ls, dst];
        let reachable = !linkDown(src, ls) && !linkDown(ld, dst);
        if (ls !== ld) {
          const usable = Array.from({ length: fab.spines }, (_, i) => spineId(i + 1)).filter((s) => !linkDown(ls, s) && !linkDown(s, ld));
          if (!usable.length) reachable = false;
          let spine = usable[0] ?? spineId(1);
          if (usable.length) {
            if (sw(ls).dlb) spine = usable.reduce((best, s) => ((assigned.get(`${ls}>${s}`) ?? 0) < (assigned.get(`${ls}>${best}`) ?? 0) ? s : best));
            else spine = hashSpine(fab, src, dst, qp, usable);
          }
          assigned.set(`${ls}>${spine}`, (assigned.get(`${ls}>${spine}`) ?? 0) + size);
          path = [src, ls, spine, ld, dst];
        }
        flows.push({
          id: `${job.id}:${src}>${dst}#${qp}`,
          job: job.id,
          src,
          dst,
          qp,
          size,
          toSend: size,
          queued: 0,
          delivered: 0,
          path,
          reachable,
          rate: hostCap,
          rt: hostCap,
          alpha: 1,
          lastCnp: -1e9,
          lastInc: 0,
          lastCnpGen: -1e9,
          markAcc: 0,
          cnpDue: [],
          dropKb: 0,
          minRate: hostCap,
        });
      }
    }
  }

  const resend = (f: Flow, kb: number) => {
    f.toSend += kb;
  };

  let paused = new Set<string>();
  const frames: Frame[] = [];
  const windowKb: Record<string, number> = {};
  let cnps = 0;
  let t = 0;

  for (; t < maxT; t++) {
    const pending: { dev: string; f: Flow; kb: number; from: string }[] = [];

    // 1. Switch egress: ETS between the RoCE class and class-default, PFC pause on the RoCE class.
    const egressLinks = new Set<string>();
    for (const k of queues.keys()) egressLinks.add(k.split("|")[0]);
    for (const dl of egressLinks) {
      const [x, y] = dl.split(">");
      if (linkDown(x, y)) continue;
      const qr = queue(dl, "roce");
      const qd = queue(dl, "def");
      const c = cap(x, y);
      const blocked = paused.has(dl) && !qr.shut;
      const dr = blocked ? 0 : qr.total;
      const dd = qd.total;
      const shareR = Math.min(dr, Math.max(c / 2, c - dd));
      const shareD = Math.min(dd, c - shareR);
      for (const [q, share] of [
        [qr, shareR],
        [qd, shareD],
      ] as const) {
        if (share <= 0 || q.total <= 0) continue;
        const ratio = share / q.total;
        for (const [f, kb] of [...q.flows]) {
          const out = kb * ratio;
          const left = kb - out;
          if (left < 1e-6) q.flows.delete(f);
          else q.flows.set(f, left);
          q.total -= out;
          f.queued -= out;
          windowKb[dl] = (windowKb[dl] ?? 0) + out;
          stat(dl).kb += out;
          const lost = out * crc(x, y);
          if (lost > 0) {
            stat(dl).crcKb += lost;
            resend(f, lost * GBN_CRC);
          }
          const ok = out - lost;
          if (isHost(y)) {
            if (stuck.has(y)) {
              stat(dl).dropKb += ok;
              f.dropKb += ok;
              resend(f, ok);
            } else f.delivered += ok;
          } else pending.push({ dev: y, f, kb: ok, from: x });
        }
        if (q.total < 1e-6) q.total = 0;
      }
    }

    // 2. NICs inject.
    const bySrc = new Map<string, Flow[]>();
    for (const f of flows) if (f.reachable && f.doneAt === undefined && f.toSend > 0) (bySrc.get(f.src) ?? bySrc.set(f.src, []).get(f.src)!).push(f);
    for (const [h, list] of bySrc) {
      if (stuck.has(h)) continue;
      const leaf = leafOf(fab, h);
      const roceClass = classify(leaf, list[0]) === "roce";
      if (roceClass && paused.has(`${h}>${leaf}`) && host(h).pfc) continue;
      const want = list.map((f) => Math.min(f.rate, f.toSend));
      const sum = want.reduce((a, b) => a + b, 0);
      const scale = sum > hostCap ? hostCap / sum : 1;
      list.forEach((f, i) => {
        const kb = want[i] * scale;
        if (kb <= 0) return;
        f.toSend -= kb;
        windowKb[`${h}>${leaf}`] = (windowKb[`${h}>${leaf}`] ?? 0) + kb;
        stat(`${h}>${leaf}`).kb += kb;
        const lost = kb * crc(h, leaf);
        if (lost > 0) {
          stat(`${h}>${leaf}`).crcKb += lost;
          resend(f, lost * GBN_CRC);
        }
        pending.push({ dev: leaf, f, kb: kb - lost, from: h });
      });
    }

    // 3. Ingress at each switch: MTU check, classification, ECN marking, tail drop.
    for (const p of pending) {
      const { dev: x, f, kb } = p;
      if (kb <= 0) continue;
      const cfg = sw(x);
      if (host(f.src).mtu + HDR > cfg.mtu) {
        stat(`${p.from}>${x}`).mtuKb += kb;
        f.dropKb += kb;
        resend(f, kb);
        continue;
      }
      const y = f.path[f.path.indexOf(x) + 1];
      const dl = `${x}>${y}`;
      const c = classify(x, f);
      const q = queue(dl, c);
      if (q.shut) {
        stat(dl).stompKb += kb;
        resend(f, kb);
        continue;
      }
      if (c === "roce" && cfg.ecn) {
        const occ = q.total;
        const prob = occ <= cfg.kmin ? 0 : occ >= cfg.kmax ? 1 : (0.07 * (occ - cfg.kmin)) / Math.max(1, cfg.kmax - cfg.kmin);
        if (prob > 0) {
          f.markAcc += kb * prob;
          stat(dl).ecnKb += kb * prob;
        }
      }
      const room = Math.max(0, fab.buffer - q.total);
      const keep = Math.min(kb, room);
      const drop = kb - keep;
      if (drop > 0) {
        stat(dl).dropKb += drop;
        f.dropKb += drop;
        resend(f, drop * GBN);
      }
      if (keep > 0) {
        q.flows.set(f, (q.flows.get(f) ?? 0) + keep);
        q.total += keep;
        f.queued += keep;
        if (q.total > stat(dl).maxQ) stat(dl).maxQ = q.total;
      }
    }

    // 4. PFC watchdog.
    for (const [k, q] of queues) {
      const [dl, c] = k.split("|");
      if (c !== "roce") continue;
      const x = dl.split(">")[0];
      if (paused.has(dl)) {
        q.pausedFor++;
        q.clearFor = 0;
      } else {
        q.pausedFor = 0;
        q.clearFor++;
      }
      if (!q.shut && sw(x).watchdog && q.pausedFor >= WD_US) {
        q.shut = true;
        stat(dl).wdEvents++;
        for (const [f, kb] of q.flows) {
          f.queued -= kb;
          resend(f, kb);
          stat(dl).stompKb += kb;
        }
        q.flows.clear();
        q.total = 0;
      } else if (q.shut && q.clearFor >= WD_RESTORE_US) q.shut = false;
    }

    // 5. Pause state for the next tick (PFC is generated by the congested switch toward each upstream sender).
    const next = new Set<string>();
    for (const h of stuck) {
      const leaf = leafOf(fab, h);
      if (sw(leaf).pfc) next.add(`${leaf}>${h}`);
    }
    for (const [k, q] of queues) {
      const [dl, c] = k.split("|");
      if (c !== "roce") continue;
      const x = dl.split(">")[0];
      const cfg = sw(x);
      if (!cfg.pfc) continue;
      if (q.total > cfg.xoff) q.xoff = true;
      else if (q.total < cfg.xoff * 0.8) q.xoff = false;
      if (!q.xoff) continue;
      for (const f of q.flows.keys()) {
        const prev = f.path[f.path.indexOf(x) - 1];
        const honours = isHost(prev) ? host(prev).pfc : sw(prev).pfc;
        if (honours) next.add(`${prev}>${x}`);
      }
    }
    paused = next;
    for (const dl of paused) stat(dl).pausedUs++;

    // 6. DCQCN at the NICs.
    for (const f of flows) {
      if (f.doneAt !== undefined) continue;
      if (f.markAcc >= 4) {
        f.markAcc = 0;
        if (host(f.dst).dcqcn && t - f.lastCnpGen >= CNP_GAP) {
          f.lastCnpGen = t;
          f.cnpDue.push(t + CNP_DELAY);
        }
      }
      if (f.cnpDue.length && f.cnpDue[0] <= t) {
        f.cnpDue.shift();
        cnps++;
        if (host(f.src).dcqcn) {
          f.rt = f.rate;
          f.rate = Math.max(MIN_RATE, f.rate * (1 - f.alpha / 2));
          f.alpha = (1 - G) * f.alpha + G;
          f.lastCnp = t;
        }
      } else if (t - f.lastCnp >= 10 && t - f.lastInc >= 10) {
        f.alpha *= 1 - G;
        f.rt = Math.min(hostCap, f.rt + RAI);
        f.rate = Math.min(hostCap, (f.rate + f.rt) / 2);
        f.lastInc = t;
      }
      if (f.rate < f.minRate) f.minRate = f.rate;
      if (f.toSend <= 1e-6 && f.queued <= 1e-3) {
        f.toSend = 0;
        f.doneAt = t;
      }
    }

    // 7. Flowlet load balancing: periodically move cross-leaf flows to the least-loaded uplink.
    if (t % 50 === 25) {
      for (const f of flows) {
        if (f.doneAt !== undefined || f.path.length !== 5 || !sw(f.path[1]).dlb) continue;
        const [, ls, , ld] = f.path;
        const usable = Array.from({ length: fab.spines }, (_, i) => spineId(i + 1)).filter((s) => !linkDown(ls, s) && !linkDown(s, ld));
        const load = (s: string) => queue(`${ls}>${s}`, "roce").total + queue(`${ls}>${s}`, "def").total;
        const best = usable.reduce((b, s) => (load(s) < load(b) ? s : b), f.path[2]);
        if (load(best) + 50 < load(f.path[2])) f.path = [f.src, ls, best, ld, f.dst];
      }
    }

    // 8. Sample.
    if (t % SAMPLE === 0) frames.push(sample());
    if (flows.every((f) => f.doneAt !== undefined || !f.reachable)) break;
  }
  frames.push(sample());

  function sample(): Frame {
    const util: Record<string, number> = {};
    for (const [dl, kb] of Object.entries(windowKb)) {
      const [a, b] = dl.split(">");
      util[dl] = Math.min(1, kb / (cap(a, b) * SAMPLE));
      windowKb[dl] = 0;
    }
    const q: Record<string, number> = {};
    for (const [k, qq] of queues) {
      const dl = k.split("|")[0];
      q[dl] = (q[dl] ?? 0) + qq.total;
    }
    const shut = [...queues].filter(([k, qq]) => qq.shut && k.endsWith("|roce")).map(([k]) => k.split("|")[0]);
    const progress: Record<string, number> = {};
    for (const job of fab.jobs) {
      const fs = flows.filter((f) => f.job === job.id);
      progress[job.id] = fs.length ? fs.reduce((s, f) => s + (f.doneAt !== undefined ? 1 : Math.min(0.99, f.delivered / f.size)), 0) / fs.length : 1;
    }
    return { t, util, q, paused: [...paused], shut, progress };
  }

  const endT = t;
  const jobs: JobResult[] = fab.jobs.map((job) => {
    const fs = flows.filter((f) => f.job === job.id);
    const done = fs.length > 0 && fs.every((f) => f.doneAt !== undefined);
    return {
      id: job.id,
      name: job.name,
      done,
      jctUs: done ? Math.max(...fs.map((f) => f.doneAt!)) : undefined,
      dropKb: fs.reduce((s, f) => s + f.dropKb, 0),
      sizeKb: fs.reduce((s, f) => s + f.size, 0),
    };
  });
  const worstPausePct = endT ? Math.max(0, ...Object.values(stats).map((s) => (100 * s.pausedUs) / endT)) : 0;
  return {
    endT,
    frames,
    jobs,
    links: stats,
    flows: flows.map((f) => ({ id: f.id, job: f.job, src: f.src, dst: f.dst, qp: f.qp, path: f.path, doneAt: f.doneAt, minRateGbps: f.minRate * 8 })),
    cnps,
    worstPausePct,
  };
}

// --- grading ------------------------------------------------------------------------------

export type FabricGoalResult = { goal: FabricGoal; ok: boolean; detail: string };

export function gradeFabric(r: SimResult, goals: FabricGoal[]): FabricGoalResult[] {
  return goals.map((goal) => {
    if (goal.type === "jct") {
      const j = r.jobs.find((x) => x.id === goal.job);
      if (!j?.done) return { goal, ok: false, detail: `${j?.name ?? goal.job} did not finish within ${r.endT} µs` };
      return { goal, ok: j.jctUs! <= goal.maxUs, detail: `${j.name} finished in ${j.jctUs} µs (target ≤ ${goal.maxUs} µs)` };
    }
    if (goal.type === "noDrops") {
      const j = r.jobs.find((x) => x.id === goal.job);
      const kb = j?.dropKb ?? 0;
      return { goal, ok: !!j && kb < 1, detail: kb < 1 ? "no drops" : `${Math.round(kb).toLocaleString()} KB dropped` };
    }
    const pct = r.worstPausePct;
    return { goal, ok: pct <= goal.maxPct, detail: `busiest link paused ${pct.toFixed(1)}% of the run (target ≤ ${goal.maxPct}%)` };
  });
}
