# Cert Dojo

A training rack for Cisco certifications. Each exam is drawn as a switch chassis, and each blueprint objective is a port. The port LED shows how well you know that topic: off, red, amber, then green, and it blinks when cards are due for review.

Loaded today:

| Exam | Code | Role | Content |
| --- | --- | --- | --- |
| ENCOR v1.2 | 350-401 | CCNP Enterprise core | 40 objectives · 93 questions · 9 CLI labs · 7 Wire Room scenarios |
| DCAI v1.0 | 300-640 | Data Center AI Infrastructure (Specialist / CCNP DC concentration) | 20 objectives · 45 questions · 2 NX-OS labs |

> **Note on the pairing.** 300-640 DCAI is a *Data Center* concentration. It completes CCNP Data Center together with 350-601 DCCOR, and passing it on its own earns the DCAI Specialist. CCNP Enterprise needs ENCOR plus an *Enterprise* concentration (ENARSI, ENSDWI, ENAUTO, ...).

## What's inside

- **Rack** (`/`): every track as a chassis, with port LEDs, blueprint-weighted readiness, and a belt rank from white to black.
- **Blueprint and field manual** (`/exam/[id]`): the "bandwidth allocation" bar shows domain weights filled to your mastery. Each objective has a brief, key facts, a config snippet, and the classic exam trap.
- **Kata** (`/exam/[id]/kata`): a spaced-repetition drill using Leitner boxes (1 / 3 / 7 / 16 / 35 days). It has single-answer, multi-answer, ordering, and *typed CLI* questions, and accepts IOS-style abbreviations (`int gi0/1`, `sw mo tr`). Choice order is shuffled every session.
- **Mock exam** (`/exam/[id]/mock`): questions drawn in proportion to the blueprint, timed at the real exam's pace, scored on the 300–1000 scale. Strict mode copies Cisco's no-going-back rule.
- **Labs** (`/labs`): change tickets on a simulated IOS XE / NX-OS console. A mode-aware engine coaches you when a command is entered in the wrong mode or out of order, and `show` / `show running-config` work once the ticket is closed.
- **Wire Room** (`/wire`): a full-screen network canvas. Add routers, switches, L3 switches, PCs and servers from the toolbar (or drag them in), cable them port to port with a searchable port picker, and double-click any device to open its console in the docked terminal. Routers and switches run an **IOS-style CLI** (modes, abbreviations, `?` help, Tab completion, `do`, `show run`, interfaces and ranges, VLANs and trunks, SVIs, static routes, extended ACLs, spanning-tree priority and `root primary`, CDP neighbours, `ping` and `traceroute`). PCs have a simple shell (`ip 10.0.0.10/24 10.0.0.1`, `ping`, `tracert`, `ipconfig`). The **send-a-packet** tool and every console ping light the path on the canvas and feed the **packet walk** tab, which steps through each frame with headers and a plain-language explanation. You also get L2/L3 lenses, notes and zones, undo/redo, copy/paste, power and lock per device, JSON import/export, and autosave in the browser. Six troubleshooting challenges (`/wire/challenges`) open on the same canvas and are graded on outcome.
- **Command line**: press `:` (or ⌘K / Ctrl-K) anywhere and type, for example, `kata encor`, `mock dcai`, `lab ospf`, or `theme`.
- Two themes: *rackroom* (dark) and *datasheet* (light). The default follows your system setting.

Progress is stored in `localStorage`. There is no backend, account, or tracking. Use **export / import** in the footer to move your progress between browsers.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm run validate   # content lint: references, answers, and a dry run of every lab
npm run build
```

## Deploy to Vercel

Import the repo in Vercel. It detects Next.js automatically, so no configuration is needed. Every route is prerendered static HTML.

## Adding content

All content lives in `src/data`:

- `exams/<id>.ts`: one `Exam`, made of domains → objectives (field notes) plus questions. Use the objective IDs exactly as Cisco prints them.
- `catalog.ts`: register the exam and attach it to a `Track`. Planned tracks appear on the rack as blank slots.
- `labs.ts`: CLI labs. Each step has a canonical `cmd` and `accept` patterns, written in the small DSL documented in `src/lib/cli-pattern.ts` (`conf|igure` = minimum abbreviation, `<if:Gi0/1>` = any interface spelling, `(opt)`, `{a,b}`, `<rest>`).

- `wire.ts`: Wire Room scenarios. A `Topology` is plain JSON (devices, ports, links, notes). Challenges list `goals`. The validator requires each challenge to start broken, and to pass both with a reference data fix and when solved by typing the commands into the simulated CLI (see `scripts/validate-content.mjs`).

The simulator engine lives in `src/lib/net/`. It models VLANs, 802.1Q trunks, per-VLAN spanning tree (root election, root and designated ports, alternate blocking), MAC learning and flooding, ARP (including IOS dropping the packet that triggers ARP, hence `.!!!!`), IPv4 longest-match routing with connected and static routes, inbound/outbound extended ACLs, and ICMP echo, time-exceeded and unreachable. It does not model timers, dynamic routing protocols, EtherChannel, NAT or subinterfaces yet. The CLI (`src/lib/ios/cli.ts`) is a command tree walked token by token, which gives IOS abbreviation, help and error behaviour. Add a command by adding a node.

Run `npm run validate` after editing. It fails if a question points at a missing objective, an answer index is out of range, or a lab cannot be completed with its own canonical commands.

Blueprints follow Cisco's published exam topics: [ENCOR v1.2](https://learningcontent.cisco.com/documents/marketing/exam-topics/350-401-ENCORE-v1.2.pdf) · [DCAI](https://learningnetwork.cisco.com/s/dcai-exam-topics). This is an independent study tool, not affiliated with or endorsed by Cisco.
