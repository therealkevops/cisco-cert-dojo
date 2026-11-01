# Cert Dojo

A training rack for Cisco certifications. Each exam is drawn as a switch chassis, and each blueprint objective is a port. The port LED shows how well you know that topic: off, red, amber, then green, and it blinks when cards are due for review.

Loaded today:

| Exam | Code | Role | Content |
| --- | --- | --- | --- |
| ENCOR v1.2 | 350-401 | CCNP Enterprise core | 40 objectives · 492 questions · 21 config drills · 31 Wire Room scenarios · 8 worksheets |
| DCAI v1.0 | 300-640 | Data Center AI Infrastructure (Specialist / CCNP DC concentration) | 21 objectives · 278 questions · 7 NX-OS config drills · 8 Fabric Lab challenges · 6 sizing worksheets |

> **Note on the pairing.** 300-640 DCAI is a *Data Center* concentration. It completes CCNP Data Center together with 350-601 DCCOR, and passing it on its own earns the DCAI Specialist. CCNP Enterprise needs ENCOR plus an *Enterprise* concentration (ENARSI, ENSDWI, ENAUTO, ...).

## What's inside

- **Rack** (`/`): every track as a chassis, with port LEDs, blueprint-weighted readiness, and a belt rank from white to black.
- **Blueprint and field manual** (`/exam/[id]`): the "bandwidth allocation" bar shows domain weights filled to your mastery. Each objective has a brief, key facts, a config snippet, the classic exam trap, and links to every Wire Room challenge and config drill for it.
- **Kata** (`/exam/[id]/kata`): a spaced-repetition drill using Leitner boxes (1 / 3 / 7 / 16 / 35 days). It has single-answer, multi-answer, ordering, and *typed CLI* questions (many with `show`-output or config exhibits), and accepts IOS-style abbreviations (`int gi0/1`, `sw mo tr`). Choice order is shuffled every session.
- **Mock exam** (`/exam/[id]/mock`): questions drawn in proportion to the blueprint, timed at the real exam's pace, scored on the 300–1000 scale. Strict mode copies Cisco's no-going-back rule.
- **Config drills** (`/labs`): guided change tickets on a simulated IOS XE / NX-OS console, for exact syntax and for features the Wire Room doesn't simulate yet (HSRP, VRF-lite, IP SLA, EEM, AAA, and the NX-OS RoCEv2 QoS, PFC watchdog, ECMP hashing, telemetry and logging set-up for DCAI). A mode-aware engine coaches you when a command is entered in the wrong mode or out of order, and `show` / `show running-config` work once the ticket is closed.
- **Wire Room** (`/wire`): a full-screen network canvas. Add routers, switches, L3 switches, PCs and servers from the toolbar (or drag them in), cable them port to port with a searchable port picker, and double-click any device to open its console in the docked terminal. Routers and switches run an **IOS-style CLI** (modes, abbreviations, `?` help, Tab completion, `do`, `show run`, interfaces and ranges, VLANs and trunks, SVIs, static routes, extended ACLs, spanning-tree priority and `root primary`, EtherChannel (`channel-group`, Port-channel interfaces, `show etherchannel summary`), OSPF (`router ospf`, `network … area`, passive interfaces, `area range`, `ip ospf` cost/priority/timers/network type, loopbacks, `show ip ospf neighbor`, `debug ip ospf adj`), NAT/PAT (`ip nat inside|outside`, interface overload, pools, static mappings, `show ip nat translations`), DHCP (`ip dhcp pool`, `excluded-address`, `ip helper-address`, `show ip dhcp binding`), BGP (`router bgp`, `neighbor … remote-as`, `network … mask`, `update-source`, `ebgp-multihop`, `next-hop-self`, `weight`, route-maps with `set local-preference` / `as-path prepend`, prefix-lists, `show ip bgp`, `show ip bgp summary`), output modifiers (`| include`, `| section`, `| begin`), CDP neighbours, `ping` and `traceroute`). PCs have a simple shell (`ip 10.0.0.10/24 10.0.0.1`, `ip dhcp`, `ipconfig /release`, `ping`, `tracert`, `ipconfig`). The **send-a-packet** tool and every console ping light the path on the canvas and feed the **packet walk** tab, which steps through each frame with headers and a plain-language explanation. You also get L2/L3 lenses, notes and zones, undo/redo, copy/paste, power and lock per device, JSON import/export, and autosave in the browser. Twenty-five challenges (`/wire/challenges`) covering VLANs, trunks, STP, routing, ACLs, OSPF, EtherChannel, NAT, DHCP and BGP open on the same canvas and are graded on outcome.
- **Fabric Lab** (`/fabric`): a 16-GPU RoCEv2 pod (four leaves, two spines, 400G NICs, 800G uplinks) simulated microsecond by microsecond for DCAI. Click any switch, NIC or link to change PFC, the PFC pause threshold, DSCP classification into the no-drop class, MTU, WRED-ECN thresholds, ECMP hashing (with or without L4 ports), flowlet dynamic load balancing, the PFC watchdog, and the NICs' DSCP marking, DCQCN, RoCE MTU and queue pairs. Each setting shows its NX-OS equivalent. Replay the run to watch link load, queue depth and PFC pause frames spread, then read per-port counters (pauses, ECN marks, drops, CRC errors). It includes a sandbox with incast, ring all-reduce and pair traffic, and eight challenges graded on job completion time, drops and pause time (DSCP mismatch, ECN off, ECN thresholds above xOFF, DCQCN off, MTU, hash collisions, PFC storm, bad optic).
- **Sizing Desk** (`/sizing`): six worksheet exercises for DCAI 2.1–2.4. You size a rail-optimised back-end fabric (leaves, spines, cables, optics, two-tier limits, oversubscription), GPUs per model replica and replicas for a throughput target, training memory, checkpoint and data-loading throughput, erasure-coded capacity, and racks, kilowatts, PUE and annual energy. Each step is checked with a tolerance and shows the working. The **cluster builder** (`/sizing/builder`) runs the same formulas live, with a sketch of spines, leaves by rail, and racks.
- **Design & Automation Desk** (`/desk`): eight ENCOR worksheets for the topics that are about reading and building rather than device config: write JSON payloads (parsed and checked field by field), turn a YANG tree into RESTCONF and NETCONF calls, walk through Catalyst Center and SD-WAN Manager API sessions and status codes, predict what Python snippets print, availability and QoS maths, overlay MTU and LISP/VXLAN roles, SD-WAN and SD-Access planes, and API security and orchestration tools. Every ENCOR objective now has at least one hands-on item: a Wire Room challenge, a config drill or a worksheet.
- **Command line**: press `:` (or ⌘K / Ctrl-K) anywhere and type, for example, `kata encor`, `mock dcai`, `lab ospf`, or `theme`.
- Two themes: *rackroom* (dark) and *datasheet* (light). The default follows your system setting.

Progress is stored in `localStorage`. There is no backend, account, or tracking. Objective mastery is the mean Leitner box of the objective's questions, with each solved Wire Room challenge or closed config drill for that objective counted as two questions at the top box, so hands-on work moves readiness too. A missed kata question links to the hands-on items for its objective. Use **export / import** in the footer to move your progress between browsers.

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

- `exams/<id>.ts`: one `Exam`, made of domains → objectives (field notes) plus questions. Use the objective IDs exactly as Cisco prints them. Larger question banks live beside it (`encor-bank-*.ts`, `dcai-bank-*.ts`); a question can carry an `exhibit` (CLI output or config shown above the choices).
- `catalog.ts`: register the exam and attach it to a `Track`. Planned tracks appear on the rack as blank slots.
- `labs.ts`: CLI labs. Each step has a canonical `cmd` and `accept` patterns, written in the small DSL documented in `src/lib/cli-pattern.ts` (`conf|igure` = minimum abbreviation, `<if:Gi0/1>` = any interface spelling, `(opt)`, `{a,b}`, `<rest>`).

- `wire.ts`: Wire Room scenarios. A `Topology` is plain JSON (devices, ports, links, notes). Challenges list `goals`. The validator requires each challenge to start broken, and to pass both with a reference data fix and when solved by typing the commands into the simulated CLI (see `scripts/validate-content.mjs`).

The simulator engine lives in `src/lib/net/`. It models VLANs, 802.1Q trunks, per-VLAN spanning tree (root election, root and designated ports, alternate blocking), MAC learning and flooding, ARP (including IOS dropping the packet that triggers ARP, hence `.!!!!`), EtherChannel negotiation (LACP active/passive, PAgP desirable/auto, static on) with bundles presented to STP and forwarding as one logical link, IPv4 longest-match routing with connected, static, OSPF and BGP routes (administrative distance respected, BGP next hops resolved recursively), OSPFv2 as a converged-state model (adjacency checks for subnet/area/timers/MTU/router ID, passive interfaces, DR/BDR election on segments that span switches, per-area SPF, inter-area routes, `area range` with Null0 discard, default-information originate), inbound/outbound extended ACLs, NAT (inside/outside roles, IOS order of operations, interface PAT with ICMP identifier translation, pools with and without overload, static mappings, ARP replies for global addresses), DHCP (server pools chosen by receiving interface or relay giaddr, excluded addresses, ping-check conflicts, helper-address relay with routed reachability checks, APIPA on failure), BGP (session checks for reachability, AS number, update-source and eBGP multihop; eBGP/iBGP propagation with split horizon and AS-path loop prevention; best-path selection on weight, local preference, origination, AS-path length, origin, MED, eBGP over iBGP and router ID, with the deciding step shown in `show ip bgp`; inbound/outbound route-maps and prefix-lists), and ICMP echo, time-exceeded and unreachable. It does not model protocol timers, EIGRP, subinterfaces, or TCP/UDP application traffic yet. The CLI (`src/lib/ios/cli.ts`) is a command tree walked token by token, which gives IOS abbreviation, help and error behaviour. Add a command by adding a node.

Run `npm run validate` after editing. It fails if a question points at a missing objective, an answer index is out of range, or a lab cannot be completed with its own canonical commands.

Blueprints follow Cisco's published exam topics: [ENCOR v1.2](https://learningcontent.cisco.com/documents/marketing/exam-topics/350-401-ENCORE-v1.2.pdf) · [DCAI v1.0](https://learningcontent.cisco.com/documents/marketing/exam-topics/300-640-DCAI-v1.0_2025Nov5.pdf). This is an independent study tool, not affiliated with or endorsed by Cisco.
