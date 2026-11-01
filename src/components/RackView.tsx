"use client";

import Link from "next/link";
import { useRef } from "react";
import { exams, tracks } from "@/data/catalog";
import { labs } from "@/data/labs";
import { practicals } from "@/data/practice";
import { scenarios } from "@/data/wire";
import { exportProgress, importProgress, practicalDone, resetProgress, streak, useProgress } from "@/lib/progress";
import { Chassis } from "./Chassis";

export function RackView() {
  const p = useProgress();
  const file = useRef<HTMLInputElement>(null);
  const racked = tracks.filter((t) => t.status === "racked");
  const planned = tracks.filter((t) => t.status === "planned");
  const answered = Object.keys(p.cards).length;
  const labsDone = Object.keys(p.labs).length;
  // Count each hands-on item once, even if it is listed under several objectives.
  const unique = [...new Map(practicals.filter((x) => x.kind !== "lab").map((x) => [`${x.kind}:${x.id}`, x])).values()];
  const wireDone = unique.filter((x) => practicalDone(p, x)).length;
  const wireTotal = unique.length;
  const lastMock = p.mocks[p.mocks.length - 1];

  const download = () => {
    const blob = new Blob([exportProgress()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cert-dojo-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <main className="page">
      <section className="hero">
        <div>
          <span className="silk">Cisco certification training rack</span>
          <h1 className="display">
            Light every <em>port.</em>
          </h1>
          <p className="lede">
            Each exam is a chassis. Each blueprint objective is a port, and its LED shows how well you know it. Study the field notes, run
            katas until the LEDs go green, close the CLI tickets, then sit a timed mock.
          </p>
        </div>
        <div className="readout num" aria-label="Session readout">
          <span>
            <b>streak</b> {streak(p)} day{streak(p) === 1 ? "" : "s"}
          </span>
          <span>
            <b>cards</b> {answered} answered
          </span>
          <span>
            <b>hands-on</b> {labsDone + wireDone}/{labs.length + wireTotal} done
          </span>
          <span>
            <b>last mock</b>{" "}
            {lastMock ? (
              <span className={lastMock.scaled >= 825 ? "" : "hot"}>
                {exams[lastMock.exam]?.short} {lastMock.scaled}/1000
              </span>
            ) : (
              "none yet"
            )}
          </span>
          <span className="silk" style={{ marginTop: 6 }}>
            press <span className="inline-code">:</span> for the command line
          </span>
        </div>
      </section>

      {racked.map((t) => (
        <div key={t.id}>
          <div className="section-head">
            <h2 className="display">{t.name}</h2>
            <span className="silk">{t.level}</span>
          </div>
          <p className="lede" style={{ marginTop: -4, fontSize: 13 }}>
            {t.rule}
          </p>
          {t.exams.map((id) => (
            <Chassis key={id} exam={exams[id]} p={p} />
          ))}
        </div>
      ))}

      <div className="notice">
        <b>How the pairing works.</b> ENCOR counts toward CCNP Enterprise, which also needs an Enterprise concentration (ENARSI, ENSDWI, ENAUTO and
        others). DCCOR plus DCAI completes CCNP Data Center.
      </div>

      <div className="section-head">
        <h3 className="display">Empty slots</h3>
        <span className="silk">roadmap</span>
      </div>
      {planned.map((t) => (
        <div className="blank" key={t.id}>
          <b>{t.name}</b>
          <p>{t.rule}</p>
          <span className="silk">{t.level} · slot reserved</span>
        </div>
      ))}

      <div className="section-head">
        <h3 className="display">Wire room</h3>
        <Link href="/wire" className="sw">
          Open simulator →
        </Link>
      </div>
      <Link href="/wire" className="blank" style={{ textDecoration: "none", borderStyle: "solid" }}>
        <b>Network canvas</b>
        <p>
          Build any topology: drop routers, switches and hosts, cable them port to port, and configure each one from its own IOS-style
          console. Send a packet and watch every hop. Includes {scenarios.filter((s) => s.kind === "challenge").length} troubleshooting
          challenges.
        </p>
        <span className="silk">
          {Object.keys(p.wire).length} solved · open canvas →
        </span>
      </Link>

      <div className="section-head">
        <h3 className="display">Config drills</h3>
        <Link href="/labs" className="sw">
          All drills →
        </Link>
      </div>
      <div className="lab-list">
        {labs.slice(0, 4).map((l) => (
          <Link key={l.id} href={`/labs/${l.id}`} className="lab-row">
            <span className="silk">{exams[l.exam].short}</span>
            <span className="silk">{l.objective}</span>
            <span className="title">{l.title}</span>
            <span className={`state ${p.labs[l.id] ? "done" : ""}`}>{p.labs[l.id] ? "closed ✓" : "open"}</span>
          </Link>
        ))}
      </div>

      <footer className="footer">
        <span>
          Independent study tool. Not affiliated with or endorsed by Cisco. Blueprints follow Cisco&apos;s published exam topics; always
          check the official pages.
        </span>
        <span style={{ display: "flex", gap: 14 }}>
          <button onClick={download}>export progress</button>
          <button onClick={() => file.current?.click()}>import</button>
          <button
            onClick={() => {
              if (confirm("Erase all progress in this browser?")) resetProgress();
            }}
          >
            reset
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                importProgress(await f.text());
              } catch (err) {
                alert(String(err));
              }
              e.target.value = "";
            }}
          />
        </span>
      </footer>
    </main>
  );
}
