"use client";

import Link from "next/link";
import type { Exam } from "@/data/types";
import { belt, dueCount, isObjectiveDue, objectiveMastery, readiness, type Progress } from "@/lib/progress";

export function ledClass(m: number) {
  if (m === 0) return "";
  if (m < 0.4) return "r";
  if (m < 0.75) return "a";
  return "g";
}

export function Chassis({ exam, p }: { exam: Exam; p: Progress }) {
  const r = readiness(p, exam);
  const b = belt(r);
  const due = dueCount(p, exam);

  return (
    <section className="chassis" aria-label={`${exam.short} ${exam.code}`}>
      <div className="chassis-id">
        <span className="silk">
          {exam.code} · {exam.version} · {exam.role}
        </span>
        <div className="model">
          <i>{exam.short}</i>
        </div>
        <p>{exam.name}</p>
      </div>

      <div className="ports">
        {exam.domains.map((d) => (
          <div className="port-group" key={d.id}>
            <span className="silk">
              {d.id.replace(".0", "")} {d.name} · {d.weight}%
            </span>
            <div className="port-grid">
              {d.objectives.map((o) => {
                const m = objectiveMastery(p, exam, o.id);
                const isDue = isObjectiveDue(p, exam, o.id);
                return (
                  <Link key={o.id} href={`/exam/${exam.id}?o=${o.id}`} className="port" aria-label={`${o.id} ${o.title}, ${Math.round(m * 100)}%`}>
                    <span className={`led ${ledClass(m)} ${isDue ? "due a" : ""}`} />
                    <span className="jack" />
                    <span className="tip">
                      {o.id} {o.title} · {Math.round(m * 100)}%{isDue ? " · due" : ""}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="chassis-ctl">
        <div className="gauge num">
          {Math.round(r * 100)}
          <small>%</small>
        </div>
        <div className="beltline">
          <span className="belt-swatch" style={{ background: b.color }} />
          {b.name} belt
        </div>
        <div className="switches">
          <Link className="sw" href={`/exam/${exam.id}`}>
            Study
          </Link>
          <Link className={`sw ${due ? "primary" : ""}`} href={`/exam/${exam.id}/kata`}>
            Kata{due ? ` · ${due}` : ""}
          </Link>
          <Link className="sw" href={`/exam/${exam.id}/mock`}>
            Mock
          </Link>
        </div>
      </div>
    </section>
  );
}
