"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { examList } from "@/data/catalog";
import { labs } from "@/data/labs";
import { fabricScenarios } from "@/data/fabric";
import { ucsScenarios } from "@/data/ucs";
import { sanScenarios } from "@/data/san";
import { aciScenarios } from "@/data/aci";
import { deskSheets as deskExercises } from "@/data/worksheets";
import { sizingExercises } from "@/data/sizing";
import { scenarios } from "@/data/wire";

type Cmd = { name: string; help: string; run: () => void };

export function CommandBar({ onClose, toggleTheme }: { onClose: () => void; toggleTheme: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [msg, setMsg] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const commands = useMemo<Cmd[]>(() => {
    const go = (href: string) => () => {
      router.push(href);
      onClose();
    };
    const list: Cmd[] = [
      { name: "rack", help: "home: every chassis and its port lights", run: go("/") },
      { name: "labs", help: "list all config drills", run: go("/labs") },
      { name: "drills", help: "list all config drills", run: go("/labs") },
      { name: "fabric", help: "Fabric Lab: RoCEv2 PFC/ECN simulator (DCAI)", run: go("/fabric") },
      { name: "sizing", help: "Sizing Desk: GPU cluster sizing worksheets (DCAI)", run: go("/sizing") },
      { name: "builder", help: "AI cluster builder: live sizing calculator", run: go("/sizing/builder") },
      { name: "ucs", help: "UCS Profile Lab: Intersight domain and server profiles for GPU servers (DCAI)", run: go("/ucs") },
      { name: "san", help: "SAN Lab: troubleshoot a Fibre Channel fabric from an MDS-style CLI (DCCOR)", run: go("/san") },
      { name: "aci", help: "ACI Policy Lab: access policies, EPGs and contracts with APIC-style faults (DCCOR)", run: go("/aci") },
      { name: "desk", help: "Design & Automation Desk: ENCOR worksheets (JSON, YANG, APIs, Python, design maths)", run: go("/desk") },
      { name: "wire", help: "network canvas: build, cable, configure, ping", run: go("/wire") },
      { name: "wire challenges", help: "troubleshooting challenges", run: go("/wire/challenges") },
    ];
    for (const e of examList) {
      list.push({ name: `study ${e.id}`, help: `${e.short} ${e.code} blueprint and field notes`, run: go(`/exam/${e.id}`) });
      list.push({ name: `kata ${e.id}`, help: `${e.short}: spaced-repetition drill`, run: go(`/exam/${e.id}/kata`) });
      list.push({ name: `mock ${e.id}`, help: `${e.short}: timed mock exam`, run: go(`/exam/${e.id}/mock`) });
    }
    for (const e of deskExercises) list.push({ name: `desk ${e.id.replace(/^desk-/, "")}`, help: e.title, run: go(`/desk/${e.id}`) });
    for (const e of sizingExercises) list.push({ name: `sizing ${e.id.replace(/^size-/, "")}`, help: e.title, run: go(`/sizing/${e.id}`) });
    for (const s of ucsScenarios) list.push({ name: `ucs ${s.id.replace(/^ucs-/, "")}`, help: s.title, run: go(`/ucs/${s.id}`) });
    for (const s of sanScenarios) list.push({ name: `san ${s.id.replace(/^san-/, "")}`, help: s.title, run: go(`/san/${s.id}`) });
    for (const s of aciScenarios) list.push({ name: `aci ${s.id.replace(/^aci-/, "")}`, help: s.title, run: go(`/aci/${s.id}`) });
    for (const s of fabricScenarios) list.push({ name: `fabric ${s.id}`, help: s.title, run: go(`/fabric/${s.id}`) });
    for (const s of scenarios) list.push({ name: `wire ${s.id}`, help: s.title, run: go(`/wire/${s.id}`) });
    for (const l of labs) list.push({ name: `lab ${l.id}`, help: l.title, run: go(`/labs/${l.id}`) });
    list.push({
      name: "theme",
      help: "switch rackroom / datasheet",
      run: () => {
        toggleTheme();
        onClose();
      },
    });
    return list;
  }, [router, onClose, toggleTheme]);

  const matches = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return commands;
    return commands.filter((c) => words.every((w) => c.name.includes(w) || c.help.toLowerCase().includes(w)));
  }, [q, commands]);

  useEffect(() => input.current?.focus(), []);
  useEffect(() => setSel(0), [q]);

  return (
    <div className="cmdbar" role="dialog" aria-label="Command line">
      {matches.length > 0 && (
        <ul>
          {matches.slice(0, 12).map((c, i) => (
            <li key={c.name} className={i === sel ? "sel" : ""} onMouseEnter={() => setSel(i)} onClick={c.run}>
              <b>{c.name}</b>
              <span>{c.help}</span>
            </li>
          ))}
        </ul>
      )}
      {msg && <div className="msg">{msg}</div>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const c = matches[sel];
          if (c) c.run();
          else setMsg(`% Unknown command "${q}". Try: rack, labs, kata encor, mock dcai, lab ospf-abr`);
        }}
      >
        <span>dojo:</span>
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => Math.min(s + 1, Math.min(matches.length, 12) - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => Math.max(s - 1, 0));
            }
          }}
          onBlur={() => setTimeout(onClose, 150)}
          placeholder="kata encor · mock dcai · lab ospf · theme   (esc to close)"
          aria-label="Command"
          spellCheck={false}
          autoComplete="off"
        />
      </form>
    </div>
  );
}
