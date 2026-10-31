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
- **Wire Room** (`/wire`): a topology simulator. Drag one device onto another to ping it (or traceroute), and the path lights up on the map: request in amber, reply in green, a red ✕ where a packet died. A **packet walk** scrubber steps through every frame with its Ethernet / 802.1Q / ARP / IPv4 / ICMP headers and a plain-language explanation of each decision. The **L2 lens** colours links by VLAN and shows the spanning-tree root and blocked ports. The inspector renders `show ip route`, `show mac address-table`, `show spanning-tree` and more from live state, and a quick-config panel edits ports, VLANs, trunks, SVIs, static routes, STP priority and ACLs. Six troubleshooting challenges are graded on outcome (reachability, STP root), so any valid fix passes.
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

- `wire.ts`: Wire Room scenarios. A `Topology` is plain JSON (devices, ports, links). Challenges list `goals`, and the validator requires each challenge to start broken and to pass with a reference fix (see `scripts/validate-content.mjs`).

The simulator engine lives in `src/lib/net/`. It models VLANs, 802.1Q trunks, per-VLAN spanning tree (root election, root and designated ports, alternate blocking), MAC learning and flooding, ARP (including IOS dropping the packet that triggers ARP, hence `.!!!!`), IPv4 longest-match routing with connected and static routes, inbound/outbound extended ACLs, and ICMP echo, time-exceeded and unreachable. It does not model timers or dynamic routing protocols yet.

Run `npm run validate` after editing. It fails if a question points at a missing objective, an answer index is out of range, or a lab cannot be completed with its own canonical commands.

Blueprints follow Cisco's published exam topics: [ENCOR v1.2](https://learningcontent.cisco.com/documents/marketing/exam-topics/350-401-ENCORE-v1.2.pdf) · [DCAI](https://learningnetwork.cisco.com/s/dcai-exam-topics). This is an independent study tool, not affiliated with or endorsed by Cisco.
