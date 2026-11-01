"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BYTES, checkpointGBps, gpusFor, inferenceGB, pow2, readGBps, sizeFabric, sizePower, trainingStateGB } from "@/lib/sizing";

type In = {
  gpus: number;
  gpusPerServer: number;
  nicGbps: number;
  switchPorts: number;
  oversub: number;
  paramsB: number;
  precision: string;
  hbm: number;
  overhead: number;
  ckptSec: number;
  mbPerGpu: number;
  serverKW: number;
  rackKW: number;
  netPct: number;
  pue: number;
};

const DEFAULTS: In = {
  gpus: 256,
  gpusPerServer: 8,
  nicGbps: 400,
  switchPorts: 64,
  oversub: 1,
  paramsB: 70,
  precision: "FP16",
  hbm: 80,
  overhead: 20,
  ckptSec: 60,
  mbPerGpu: 200,
  serverKW: 10.2,
  rackKW: 41,
  netPct: 8,
  pue: 1.3,
};
const KEY = "cert-dojo:sizing:builder";

const fmt = (x: number, d = 0) => (Number.isFinite(x) ? x.toLocaleString("en-US", { maximumFractionDigits: d }) : "∞");

export function ClusterBuilder() {
  const [v, setV] = useState<In>(DEFAULTS);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setV({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {
      /* storage unavailable: start from defaults */
    }
  }, []);
  const set = <K extends keyof In>(k: K, x: In[K]) =>
    setV((prev) => {
      const next = { ...prev, [k]: x };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

  const fab = sizeFabric({ gpus: v.gpus, gpusPerServer: v.gpusPerServer, switchPorts: v.switchPorts, oversub: v.oversub });
  const pw = sizePower({ servers: fab.servers, serverKW: v.serverKW, rackKW: v.rackKW, networkPct: v.netPct, pue: v.pue });
  const infGB = inferenceGB(v.paramsB, v.precision, v.overhead / 100);
  const tp = pow2(gpusFor(infGB, v.hbm));
  const replicas = Math.floor(v.gpus / tp);
  const trainGB = trainingStateGB(v.paramsB);
  const perServerTbps = (v.gpusPerServer * v.nicGbps) / 1000;
  const uplinkTbps = (fab.spineCables * v.nicGbps) / 1000;

  return (
    <main className="page">
      <section className="hero size-hero">
        <div>
          <span className="silk">Sizing Desk · cluster builder · DCAI 2.1–2.4</span>
          <h1 className="display">
            Build the <em>cluster.</em>
          </h1>
          <p className="lede">
            Change the inputs and every number updates: back-end fabric, model fit, storage throughput, racks and power. The same formulas grade the{" "}
            <Link href="/sizing">worksheets</Link>. They are planning approximations, not a bill of materials.
          </p>
        </div>
        <button className="sw" onClick={() => setV(DEFAULTS)} style={{ alignSelf: "end" }}>
          Reset inputs
        </button>
      </section>

      <div className="build-grid">
        <form className="build-in" onSubmit={(e) => e.preventDefault()} aria-label="Inputs">
          <fieldset>
            <legend className="silk">Cluster</legend>
            <Field label="GPUs" value={v.gpus} step={8} min={8} onChange={(x) => set("gpus", x)} />
            <Pick label="GPUs per server" value={v.gpusPerServer} options={[4, 8]} onChange={(x) => set("gpusPerServer", x)} />
          </fieldset>
          <fieldset>
            <legend className="silk">Back-end network</legend>
            <Pick label="NIC speed" value={v.nicGbps} options={[200, 400, 800]} suffix=" Gb/s" onChange={(x) => set("nicGbps", x)} />
            <Pick label="Switch ports at that speed" value={v.switchPorts} options={[32, 64, 128]} onChange={(x) => set("switchPorts", x)} />
            <Pick label="Leaf oversubscription" value={v.oversub} options={[1, 2, 3]} suffix=":1" onChange={(x) => set("oversub", x)} />
          </fieldset>
          <fieldset>
            <legend className="silk">Model</legend>
            <Field label="Parameters" value={v.paramsB} unit="B" step={1} min={1} onChange={(x) => set("paramsB", x)} />
            <Pick label="Serving precision" value={v.precision} options={["FP16", "FP8", "INT4"]} onChange={(x) => set("precision", x)} />
            <Pick label="HBM per GPU" value={v.hbm} options={[48, 80, 96, 141, 192]} suffix=" GB" onChange={(x) => set("hbm", x)} />
            <Field label="KV cache overhead" value={v.overhead} unit="%" step={5} min={0} onChange={(x) => set("overhead", x)} />
          </fieldset>
          <fieldset>
            <legend className="silk">Storage</legend>
            <Field label="Checkpoint window" value={v.ckptSec} unit="s" step={10} min={1} onChange={(x) => set("ckptSec", x)} />
            <Field label="Data loading per GPU" value={v.mbPerGpu} unit="MB/s" step={50} min={0} onChange={(x) => set("mbPerGpu", x)} />
          </fieldset>
          <fieldset>
            <legend className="silk">Power and cooling</legend>
            <Field label="Server power" value={v.serverKW} unit="kW" step={0.1} min={0.1} onChange={(x) => set("serverKW", x)} />
            <Field label="Rack budget" value={v.rackKW} unit="kW" step={1} min={1} onChange={(x) => set("rackKW", x)} />
            <Field label="Networking overhead" value={v.netPct} unit="%" step={1} min={0} onChange={(x) => set("netPct", x)} />
            <Field label="PUE" value={v.pue} step={0.05} min={1} onChange={(x) => set("pue", x)} />
          </fieldset>
        </form>

        <div className="build-out">
          <FabricSketch spines={fab.spines} leaves={fab.leaves} rails={fab.rails} racks={pw.racks} perRack={pw.serversPerRack} servers={fab.servers} />

          <div className="build-cards">
            <Card title="Back-end fabric" tone={fab.fits2Tier ? "" : "warn"}>
              <Row k="Servers" v={fmt(fab.servers)} />
              <Row k="Rails" v={fmt(fab.rails)} />
              <Row k="Leaf ports down / up" v={`${fab.down} / ${fab.up}`} />
              <Row k="Leaves" v={`${fmt(fab.leaves)} (${fab.leavesPerRail} per rail)`} />
              <Row k="Spines" v={fmt(fab.spines)} />
              <Row k="Cables" v={fmt(fab.gpuCables + fab.spineCables)} />
              <Row k="Optics" v={fmt(fab.optics)} />
              <Row k="Back-end bandwidth per server" v={`${fmt(perServerTbps, 1)} Tb/s`} />
              <Row k="Leaf uplink capacity (all leaves)" v={`${fmt(uplinkTbps, 1)} Tb/s`} />
              <p className={fab.fits2Tier ? "build-note" : "build-warn"}>
                {fab.fits2Tier
                  ? `Two tiers of ${v.switchPorts}-port switches reach ${fmt(fab.max2Tier)} GPUs at ${v.oversub}:1.`
                  : `Too big for two tiers: ${v.switchPorts}-port switches reach ${fmt(fab.max2Tier)} GPUs at ${v.oversub}:1. Add a super-spine tier or use higher-radix switches.`}
              </p>
            </Card>
            <Card title="Model fit (inference)" tone={replicas ? "" : "warn"}>
              <Row k={`Weights in ${v.precision}`} v={`${fmt(v.paramsB * BYTES[v.precision], 1)} GB`} />
              <Row k="With KV cache" v={`${fmt(infGB, 1)} GB`} />
              <Row k="GPUs per replica" v={fmt(tp)} />
              <Row k="Replicas on this cluster" v={fmt(replicas)} />
              <Row k="Training state (16 B/param)" v={`${fmt(trainGB)} GB`} />
              <Row k="Minimum GPUs to train (sharded)" v={fmt(gpusFor(trainGB, v.hbm))} />
              {tp > v.gpusPerServer && <p className="build-warn">One replica spans servers: tensor parallelism would cross the back-end fabric. Prefer pipeline parallelism across servers, or quantise.</p>}
            </Card>
            <Card title="Storage">
              <Row k="Checkpoint size (14 B/param)" v={`${fmt(v.paramsB * 14)} GB`} />
              <Row k="Checkpoint write rate" v={`${fmt(checkpointGBps(v.paramsB, v.ckptSec), 1)} GB/s`} />
              <Row k="Data loading rate" v={`${fmt(readGBps(v.gpus, v.mbPerGpu), 1)} GB/s`} />
            </Card>
            <Card title="Power and space" tone={pw.serversPerRack ? "" : "warn"}>
              <Row k="Servers per rack" v={fmt(pw.serversPerRack)} />
              <Row k="Racks" v={fmt(pw.racks)} />
              <Row k="IT load" v={`${fmt(pw.itKW)} kW`} />
              <Row k="Facility load" v={`${fmt(pw.facilityKW)} kW`} />
              <Row k="Energy per year" v={`${fmt(pw.mwhYear)} MWh`} />
              {!pw.serversPerRack && <p className="build-warn">A single server exceeds the rack budget. This room needs more power and cooling per rack (liquid cooling).</p>}
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}

function Field({ label, value, unit, step, min, onChange }: { label: string; value: number; unit?: string; step: number; min: number; onChange: (v: number) => void }) {
  return (
    <label className="build-field">
      <span>{label}</span>
      <span className="build-num">
        <input type="number" value={value} step={step} min={min} onChange={(e) => onChange(Math.max(min, Number(e.target.value) || min))} />
        {unit && <small>{unit}</small>}
      </span>
    </label>
  );
}

function Pick<T extends string | number>({ label, value, options, suffix = "", onChange }: { label: string; value: T; options: T[]; suffix?: string; onChange: (v: T) => void }) {
  return (
    <div className="build-field" role="group" aria-label={label}>
      <span>{label}</span>
      <span className="build-seg">
        {options.map((o) => (
          <button key={String(o)} type="button" className={o === value ? "on" : ""} aria-pressed={o === value} onClick={() => onChange(o)}>
            {o}
            {suffix}
          </button>
        ))}
      </span>
    </div>
  );
}

function Card({ title, tone = "", children }: { title: string; tone?: string; children: React.ReactNode }) {
  return (
    <section className={`build-card ${tone}`}>
      <span className="silk">{title}</span>
      <dl>{children}</dl>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt>{k}</dt>
      <dd className="num">{v}</dd>
    </>
  );
}

/** Spines over leaves (coloured by rail), with the rack row underneath. Large counts are summarised. */
function FabricSketch({ spines, leaves, rails, racks, perRack, servers }: { spines: number; leaves: number; rails: number; racks: number; perRack: number; servers: number }) {
  const W = 760;
  const cap = 48;
  const sShow = Math.min(spines, cap);
  const lShow = Math.min(leaves, cap * 2);
  const rShow = Number.isFinite(racks) ? Math.min(racks, 60) : 0;
  const sx = (i: number, n: number) => 20 + ((W - 40) / Math.max(1, n)) * (i + 0.5);
  return (
    <svg className="build-sketch" viewBox={`0 0 ${W} 210`} role="img" aria-label={`${spines} spines, ${leaves} leaves in ${rails} rails, ${racks} racks`}>
      {Array.from({ length: lShow }, (_, l) =>
        Array.from({ length: sShow }, (_, s) => (
          <line key={`${l}-${s}`} x1={sx(l, lShow)} y1={88} x2={sx(s, sShow)} y2={30} className="build-wire" />
        )),
      )}
      {Array.from({ length: sShow }, (_, s) => (
        <rect key={s} x={sx(s, sShow) - 6} y={22} width={12} height={12} rx={2} className="build-spine" />
      ))}
      {Array.from({ length: lShow }, (_, l) => (
        <rect key={l} x={sx(l, lShow) - 4} y={84} width={8} height={10} rx={1.5} className={`build-leaf r${(Math.floor(l / Math.max(1, leaves / rails)) % 8) + 1}`} />
      ))}
      <text x={W - 20} y={16} textAnchor="end" className="build-cap">
        {spines} spines{spines > sShow ? ` (showing ${sShow})` : ""}
      </text>
      <text x={W - 20} y={112} textAnchor="end" className="build-cap">
        {leaves} leaves · {rails} rails{leaves > lShow ? ` (showing ${lShow})` : ""}
      </text>
      {Array.from({ length: rShow }, (_, r) => {
        const x = 20 + ((W - 40) / Math.max(1, rShow)) * r;
        const w = Math.max(4, (W - 40) / Math.max(1, rShow) - 3);
        const inRack = Math.min(perRack, servers - r * perRack);
        return (
          <g key={r}>
            <rect x={x} y={130} width={w} height={56} className="build-rack" />
            {Array.from({ length: Math.max(0, inRack) }, (_, k) => (
              <rect key={k} x={x + 1.5} y={184 - (k + 1) * Math.min(12, 52 / Math.max(1, perRack))} width={w - 3} height={Math.min(10, 52 / Math.max(1, perRack) - 2)} className="build-srv" />
            ))}
          </g>
        );
      })}
      <text x={W - 20} y={204} textAnchor="end" className="build-cap">
        {Number.isFinite(racks) ? `${racks} racks · ${perRack} servers per rack${racks > rShow ? ` (showing ${rShow})` : ""}` : "no rack can hold a server at this budget"}
      </text>
    </svg>
  );
}
