"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { examList } from "@/data/catalog";
import { labs } from "@/data/labs";

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
      { name: "labs", help: "list all CLI labs", run: go("/labs") },
    ];
    for (const e of examList) {
      list.push({ name: `study ${e.id}`, help: `${e.short} ${e.code} blueprint and field notes`, run: go(`/exam/${e.id}`) });
      list.push({ name: `kata ${e.id}`, help: `${e.short}: spaced-repetition drill`, run: go(`/exam/${e.id}/kata`) });
      list.push({ name: `mock ${e.id}`, help: `${e.short}: timed mock exam`, run: go(`/exam/${e.id}/mock`) });
    }
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
