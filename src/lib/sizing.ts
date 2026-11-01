// Back-of-envelope sizing for AI clusters (DCAI 2.1–2.4). The worksheet exercises and the cluster builder
// both use these functions, so every answer and every "show working" line comes from one place.
// They are planning approximations: real designs add headroom, vendor limits and failure domains.

export type FabricIn = {
  gpus: number;
  gpusPerServer: number;
  /** switch ports at the NIC speed */
  switchPorts: number;
  /** leaf downlink:uplink ratio, 1 = non-blocking */
  oversub: number;
};

export type FabricOut = {
  servers: number;
  rails: number;
  /** GPU-facing ports per leaf */
  down: number;
  /** spine-facing ports per leaf */
  up: number;
  leavesPerRail: number;
  leaves: number;
  spines: number;
  gpuCables: number;
  spineCables: number;
  /** transceivers, two per cable */
  optics: number;
  /** largest GPU count a 2-tier fabric of these switches supports at this ratio */
  max2Tier: number;
  fits2Tier: boolean;
};

/** Rail-optimised 2-tier leaf-spine: GPU n of every server goes to rail n. */
export function sizeFabric(i: FabricIn): FabricOut {
  const servers = Math.ceil(i.gpus / i.gpusPerServer);
  const rails = i.gpusPerServer;
  const down = Math.floor((i.switchPorts * i.oversub) / (1 + i.oversub) + 1e-9);
  const up = i.switchPorts - down;
  const leavesPerRail = Math.ceil(servers / down);
  const leaves = rails * leavesPerRail;
  const spineCables = leaves * up;
  const spines = Math.ceil(spineCables / i.switchPorts);
  const gpuCables = servers * rails;
  // Every leaf needs at least one link to every spine, so a spine's ports cap the number of leaves.
  const max2Tier = i.switchPorts * down;
  return { servers, rails, down, up, leavesPerRail, leaves, spines, gpuCables, spineCables, optics: 2 * (gpuCables + spineCables), max2Tier, fits2Tier: leaves <= i.switchPorts && i.gpus <= max2Tier };
}

export const BYTES: Record<string, number> = { FP32: 4, BF16: 2, FP16: 2, FP8: 1, INT8: 1, INT4: 0.5 };

/** GB of GPU memory to hold a model's weights. 1 billion params × 1 byte = 1 GB. */
export const weightsGB = (paramsB: number, precision: string) => paramsB * BYTES[precision];

/** Inference footprint with an overhead factor for KV cache and activations. */
export const inferenceGB = (paramsB: number, precision: string, overhead: number) => weightsGB(paramsB, precision) * (1 + overhead);

export const gpusFor = (gb: number, hbmGB: number) => Math.ceil(gb / hbmGB);

/** Round up to the next power of two (tensor parallel sizes are usually 1, 2, 4, 8). */
export const pow2 = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(1, n)));

/** Mixed-precision training with Adam: FP16 weights (2) + FP16 grads (2) + FP32 master (4) + two FP32 moments (8). */
export const TRAIN_BYTES_PER_PARAM = 16;
/** A checkpoint holds weights, FP32 master copy and optimizer moments, but not gradients. */
export const CKPT_BYTES_PER_PARAM = 14;

export const trainingStateGB = (paramsB: number) => paramsB * TRAIN_BYTES_PER_PARAM;
export const checkpointGB = (paramsB: number) => paramsB * CKPT_BYTES_PER_PARAM;
/** GB/s needed to write a checkpoint within the window. */
export const checkpointGBps = (paramsB: number, seconds: number) => checkpointGB(paramsB) / seconds;
/** Aggregate read throughput in GB/s from a per-GPU ingest rate in MB/s. */
export const readGBps = (gpus: number, mbPerGpu: number) => (gpus * mbPerGpu) / 1000;
/** Raw capacity for a usable target with k data + m parity erasure coding. */
export const rawForUsable = (usable: number, k: number, m: number) => (usable * (k + m)) / k;

export type PowerIn = { servers: number; serverKW: number; rackKW: number; networkPct: number; pue: number };
export type PowerOut = { serversPerRack: number; racks: number; itKW: number; facilityKW: number; mwhYear: number };

export function sizePower(i: PowerIn): PowerOut {
  const serversPerRack = Math.max(0, Math.floor(i.rackKW / i.serverKW));
  const racks = serversPerRack ? Math.ceil(i.servers / serversPerRack) : Infinity;
  const itKW = i.servers * i.serverKW * (1 + i.networkPct / 100);
  const facilityKW = itKW * i.pue;
  return { serversPerRack, racks, itKW, facilityKW, mwhYear: (facilityKW * 8760) / 1000 };
}

export const ratio = (down: number, up: number) => down / up;
