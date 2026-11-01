"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { exams, objectiveIndex } from "@/data/catalog";
import { practicalsFor } from "@/data/practice";
import { domainMastery, markRead, objectiveMastery, practicalDone, readiness, useProgress } from "@/lib/progress";
import { Rich } from "./Rich";

function Meter({ value }: { value: number }) {
  const on = Math.round(value * 5);
  return (
    <span className={`meter ${on === 5 ? "full" : ""}`} aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <i key={i} className={i < on ? "on" : ""} />
      ))}
    </span>
  );
}

export function Blueprint({ examId }: { examId: string }) {
  const exam = exams[examId];
  const p = useProgress();
  const router = useRouter();
  const params = useSearchParams();
  const index = useMemo(() => objectiveIndex(exam), [exam]);
  const firstId = exam.domains[0].objectives[0].id;
  const selected = params.get("o") && index.has(params.get("o")!) ? params.get("o")! : firstId;
  const { objective, domain } = index.get(selected)!;
  const qCount = exam.questions.filter((q) => q.objective === selected).length;
  const hands = practicalsFor(exam.id, selected);

  useEffect(() => {
    // Opening the notes for a few seconds counts as having read them.
    const t = setTimeout(() => markRead(exam.id, selected), 4000);
    return () => clearTimeout(t);
  }, [exam.id, selected]);

  const select = (id: string) => router.replace(`/exam/${exam.id}?o=${id}`, { scroll: false });

  return (
    <main className="page">
      <section className="hero">
        <div>
          <span className="silk">
            {exam.code} · {exam.version} · {exam.minutes} min ·{" "}
            <a href={exam.blueprintUrl} target="_blank" rel="noreferrer">
              official blueprint ↗
            </a>
          </span>
          <h1 className="display" style={{ fontSize: "clamp(40px, 6vw, 76px)" }}>
            {exam.name.split(" ").slice(0, -2).join(" ")} <em>{exam.name.split(" ").slice(-2).join(" ")}</em>
          </h1>
        </div>
        <div className="readout num">
          <span>
            <b>readiness</b> <span className="hot">{Math.round(readiness(p, exam) * 100)}%</span> (blueprint-weighted)
          </span>
          <span>
            <b>bank</b> {exam.questions.length} questions · {index.size} objectives
          </span>
          <div className="switches" style={{ justifyContent: "flex-start", marginTop: 8 }}>
            <Link className="sw primary" href={`/exam/${exam.id}/kata`}>
              Kata
            </Link>
            <Link className="sw" href={`/exam/${exam.id}/mock`}>
              Mock exam
            </Link>
          </div>
        </div>
      </section>

      <span className="silk" style={{ display: "block", marginTop: 22 }}>
        Bandwidth allocation: the share of the exam each domain gets, filled to your mastery
      </span>
      <div className="alloc" role="list">
        {exam.domains.map((d) => {
          const m = domainMastery(p, exam, d.id);
          return (
            <button
              key={d.id}
              role="listitem"
              className={`alloc-seg ${domain.id === d.id ? "on" : ""}`}
              style={{ flex: d.weight }}
              onClick={() => select(d.objectives[0].id)}
              title={`${d.name}: ${d.weight}% of exam, ${Math.round(m * 100)}% mastered`}
            >
              <span className="fill" style={{ height: `${m * 100}%` }} />
              <span className="silk">{d.weight}%</span>
              <span>{d.name}</span>
            </button>
          );
        })}
      </div>

      <div className="bp">
        <div className="config" aria-label="Blueprint objectives">
          {exam.domains.map((d) => (
            <div key={d.id}>
              <div className="dom">
                <span>! {d.id}</span>
                <span style={{ color: "var(--ink)" }}>{d.name.toUpperCase()}</span>
                <span className="dots" />
                <span>{d.weight}%</span>
              </div>
              {d.objectives.map((o) => {
                const m = objectiveMastery(p, exam, o.id);
                return (
                  <button key={o.id} className={`obj ${o.id === selected ? "on" : ""}`} onClick={() => select(o.id)}>
                    <span className="id">{o.id}</span>
                    <span className="t">
                      {p.read[`${exam.id}:${o.id}`] ? "" : "• "}
                      {o.title}
                    </span>
                    <Meter value={m} />
                    <span className="pct num">{Math.round(m * 100)}%</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <article className="manual" key={selected}>
          <span className="silk">
            Field manual · {domain.name} · objective {objective.id}
          </span>
          <h3 className="display">{objective.title}</h3>
          <p className="brief">{objective.brief}</p>
          <ol>
            {objective.keys.map((k, i) => (
              <li key={i}>
                <span>
                  <Rich text={k} />
                </span>
              </li>
            ))}
          </ol>
          {objective.cli && <pre className="cli">{objective.cli}</pre>}
          {objective.trap && (
            <div className="trap">
              <Rich text={objective.trap} />
            </div>
          )}
          <div className="manual-actions">
            <Link className="sw primary" href={`/exam/${exam.id}/kata?o=${objective.id}`}>
              Drill {objective.id} · {qCount}q
            </Link>
          </div>
          {hands.length > 0 && (
            <div className="hands">
              <span className="silk">
                Hands-on · {hands.filter((x) => practicalDone(p, x)).length}/{hands.length} done · each counts toward this objective&apos;s mastery
              </span>
              <ul>
                {hands.map((x) => (
                  <li key={x.id}>
                    <Link href={x.href}>
                      <span className="silk">{{ wire: "Wire Room", fabric: "Fabric Lab", sizing: "Sizing Desk", desk: "Worksheet", ucs: "UCS lab", lab: "Config drill" }[x.kind]}</span>
                      <span className="t">{x.title}</span>
                      <span className={`state ${practicalDone(p, x) ? "done" : ""}`}>{practicalDone(p, x) ? "done ✓" : "open →"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </article>
      </div>
    </main>
  );
}
