import type { SanFabric, SanPort, SanScenario, SanSwitch } from "@/lib/san";

// SAN Lab scenarios (DCCOR 3.1 and 5.3). Each ships broken; the validator replays `solution` through the
// MDS CLI and checks every goal passes, and checks the shipped fabric fails at least one.

const W = {
  esx01: "10:00:00:90:fa:a1:00:01",
  esx02: "10:00:00:90:fa:a1:00:02",
  esx03: "10:00:00:90:fa:a1:00:03",
  esx03new: "10:00:00:90:fa:b7:3c:42",
  db01: "10:00:00:90:fa:d0:00:01",
  db02: "10:00:00:90:fa:d0:00:02",
  web01: "10:00:00:90:fa:e0:00:01",
  sql01: "10:00:00:90:fa:e0:00:02",
  app01: "10:00:00:90:fa:c0:00:01",
  app02: "10:00:00:90:fa:c0:00:02",
  esx11: "10:00:00:90:fa:11:00:01",
  esx12: "10:00:00:90:fa:11:00:02",
  arrA: "50:0a:09:81:00:00:a0:01",
  arrB: "50:0a:09:82:00:00:a0:01",
  arrDb: "50:0a:09:81:00:00:d0:01",
  bak: "50:0a:09:81:00:00:bb:01",
};

const fc = (n: number, mode: SanPort["mode"], vsan: number, extra: Partial<SanPort> = {}): SanPort => ({ name: `fc1/${n}`, mode, vsan, ...extra });
const mds = (id: string, domain: number, vsans: number[], ports: SanPort[], extra: Partial<SanSwitch> = {}): SanSwitch => ({ id, domain, vsans, ports, ...extra });
const zoning = (zones: [string, string[]][], zoneset?: [string, string[]], activate = true) => {
  const zs = zones.map(([name, members]) => ({ name, members }));
  return {
    zones: zs,
    zonesets: zoneset ? [{ name: zoneset[0], zones: zoneset[1] }] : [],
    active: zoneset && activate ? { name: zoneset[0], zones: structuredClone(zs.filter((z) => zoneset[1].includes(z.name))) } : undefined,
    defaultZone: "deny" as const,
  };
};

// 1 ─ zone built, zoneset never re-activated
const zonesetLab: SanFabric = {
  switches: [mds("MDS-A", 10, [10], [fc(1, "F", 10), fc(2, "F", 10), fc(9, "F", 10), fc(10, "F", 1)])],
  devices: [
    { id: "esx01", kind: "hba", label: "ESX01", pwwn: W.esx01, at: ["MDS-A", "fc1/1"] },
    { id: "esx02", kind: "hba", label: "ESX02", pwwn: W.esx02, at: ["MDS-A", "fc1/2"] },
    { id: "arr", kind: "array", label: "ARRAY-A ct0", pwwn: W.arrA, at: ["MDS-A", "fc1/9"] },
  ],
  links: [],
  zoning: { "10": { ...zoning([["Z_ESX01_ARRAYA", ["ESX01", "ARRAYA_CT0"]]], ["ZS_FAB_A", ["Z_ESX01_ARRAYA"]]), zones: [{ name: "Z_ESX01_ARRAYA", members: ["ESX01", "ARRAYA_CT0"] }, { name: "Z_ESX02_ARRAYA", members: ["ESX02", "ARRAYA_CT0"] }] } },
  aliases: { ESX01: W.esx01, ESX02: W.esx02, ARRAYA_CT0: W.arrA },
  luns: { arr: [{ lun: 1, initiators: [W.esx01] }, { lun: 2, initiators: [W.esx02] }] },
};

// 2 ─ host port left in VSAN 1, zone member typo
const vsanLab: SanFabric = {
  switches: [mds("MDS-A", 10, [20], [fc(3, "F", 1), fc(4, "F", 20), fc(10, "F", 20), fc(11, "F", 1)])],
  devices: [
    { id: "db01", kind: "hba", label: "DB01", pwwn: W.db01, at: ["MDS-A", "fc1/3"] },
    { id: "db02", kind: "hba", label: "DB02", pwwn: W.db02, at: ["MDS-A", "fc1/4"] },
    { id: "arr", kind: "array", label: "DB-ARRAY ct0", pwwn: W.arrDb, at: ["MDS-A", "fc1/10"] },
  ],
  links: [],
  zoning: {
    "20": zoning(
      [
        ["Z_DB01_ARR", [W.db01, W.arrDb]],
        ["Z_DB02_ARR", ["10:00:00:90:fa:d0:00:20", W.arrDb]],
      ],
      ["ZS_DB", ["Z_DB01_ARR", "Z_DB02_ARR"]],
    ),
  },
  aliases: {},
  luns: { arr: [{ lun: 0, initiators: [W.db01, W.db02] }] },
};

// 3 ─ trunk allowed list is missing VSAN 20
const trunkLab: SanFabric = {
  switches: [
    mds("MDS-CORE", 10, [10, 20], [fc(9, "F", 10), fc(10, "F", 20), fc(13, "E", 1, { trunk: true, allowed: [1, 10] })]),
    mds("MDS-EDGE", 20, [10, 20], [fc(1, "F", 10), fc(2, "F", 20), fc(13, "E", 1, { trunk: true, allowed: [1, 10] })]),
  ],
  devices: [
    { id: "web01", kind: "hba", label: "WEB01", pwwn: W.web01, at: ["MDS-EDGE", "fc1/1"] },
    { id: "sql01", kind: "hba", label: "SQL01", pwwn: W.sql01, at: ["MDS-EDGE", "fc1/2"] },
    { id: "arr10", kind: "array", label: "ARRAY-A ct0", pwwn: W.arrA, at: ["MDS-CORE", "fc1/9"] },
    { id: "arr20", kind: "array", label: "ARRAY-A ct1", pwwn: W.arrB, at: ["MDS-CORE", "fc1/10"] },
  ],
  links: [[["MDS-CORE", "fc1/13"], ["MDS-EDGE", "fc1/13"]]],
  zoning: {
    "10": zoning([["Z_WEB01", ["WEB01", "ARRAYA_CT0"]]], ["ZS_V10", ["Z_WEB01"]]),
    "20": zoning([["Z_SQL01", ["SQL01", "ARRAYA_CT1"]]], ["ZS_V20", ["Z_SQL01"]]),
  },
  aliases: { WEB01: W.web01, SQL01: W.sql01, ARRAYA_CT0: W.arrA, ARRAYA_CT1: W.arrB },
  luns: { arr10: [{ lun: 0, initiators: [W.web01] }], arr20: [{ lun: 0, initiators: [W.sql01] }] },
};

// 4 ─ two fabrics with the same static domain ID
const mergeLab: SanFabric = {
  switches: [
    mds("MDS-1", 10, [10], [fc(9, "F", 10), fc(16, "E", 10, { trunk: false })]),
    mds("MDS-2", 10, [10], [fc(1, "F", 10), fc(16, "E", 10, { trunk: false })]),
  ],
  devices: [
    { id: "esx01", kind: "hba", label: "ESX01", pwwn: W.esx01, at: ["MDS-2", "fc1/1"] },
    { id: "arr", kind: "array", label: "ARRAY-A ct0", pwwn: W.arrA, at: ["MDS-1", "fc1/9"] },
  ],
  links: [[["MDS-1", "fc1/16"], ["MDS-2", "fc1/16"]]],
  zoning: { "10": zoning([["Z_ESX01_ARRAYA", [W.esx01, W.arrA]]], ["ZS_FAB_A", ["Z_ESX01_ARRAYA"]]) },
  aliases: {},
  luns: { arr: [{ lun: 4, initiators: [W.esx01] }] },
};

// 5 ─ NPV edge: core without NPIV, uplink in the wrong VSAN
const npvLab: SanFabric = {
  switches: [
    mds("MDS-CORE", 10, [10], [fc(1, "F", 10), fc(2, "F", 10), fc(9, "F", 10)]),
    mds("NPV-EDGE", 30, [10], [fc(1, "F", 10), fc(2, "F", 10), fc(9, "NP", 1), fc(10, "NP", 10, { shutdown: true })], { npv: true }),
  ],
  devices: [
    { id: "esx11", kind: "hba", label: "ESX11", pwwn: W.esx11, at: ["NPV-EDGE", "fc1/1"] },
    { id: "esx12", kind: "hba", label: "ESX12", pwwn: W.esx12, at: ["NPV-EDGE", "fc1/2"] },
    { id: "arr", kind: "array", label: "ARRAY-A ct0", pwwn: W.arrA, at: ["MDS-CORE", "fc1/9"] },
  ],
  links: [
    [["NPV-EDGE", "fc1/9"], ["MDS-CORE", "fc1/1"]],
    [["NPV-EDGE", "fc1/10"], ["MDS-CORE", "fc1/2"]],
  ],
  zoning: { "10": zoning([["Z_ESX11", ["ESX11", "ARRAYA_CT0"]], ["Z_ESX12", ["ESX12", "ARRAYA_CT0"]]], ["ZS_FAB_A", ["Z_ESX11", "Z_ESX12"]]) },
  aliases: { ESX11: W.esx11, ESX12: W.esx12, ARRAYA_CT0: W.arrA },
  luns: { arr: [{ lun: 0, initiators: [W.esx11, W.esx12] }] },
};

// 6 ─ replaced HBA: port security and device-alias still hold the old pWWN
const swapLab: SanFabric = {
  switches: [
    mds("MDS-A", 10, [10], [fc(1, "F", 10), fc(3, "F", 10), fc(9, "F", 10)], {
      portSecurityFeature: true,
      portSecurity: [
        {
          vsan: 10,
          active: true,
          bindings: [
            { pwwn: W.esx01, iface: "fc1/1" },
            { pwwn: W.esx03, iface: "fc1/3" },
            { pwwn: W.arrA, iface: "fc1/9" },
          ],
          activeBindings: [
            { pwwn: W.esx01, iface: "fc1/1" },
            { pwwn: W.esx03, iface: "fc1/3" },
            { pwwn: W.arrA, iface: "fc1/9" },
          ],
        },
      ],
    }),
  ],
  devices: [
    { id: "esx01", kind: "hba", label: "ESX01", pwwn: W.esx01, at: ["MDS-A", "fc1/1"] },
    { id: "esx03", kind: "hba", label: "ESX03", pwwn: W.esx03new, at: ["MDS-A", "fc1/3"] },
    { id: "arr", kind: "array", label: "ARRAY-A ct0", pwwn: W.arrA, at: ["MDS-A", "fc1/9"] },
  ],
  links: [],
  zoning: { "10": zoning([["Z_ESX01", ["ESX01", "ARRAYA_CT0"]], ["Z_ESX03", ["ESX03", "ARRAYA_CT0"]]], ["ZS_FAB_A", ["Z_ESX01", "Z_ESX03"]]) },
  aliases: { ESX01: W.esx01, ESX03: W.esx03, ARRAYA_CT0: W.arrA },
  luns: { arr: [{ lun: 1, initiators: [W.esx01] }, { lun: 3, initiators: [W.esx03new] }] },
};

// 7 ─ VSAN running wide open on the default zone
const defaultZoneLab: SanFabric = {
  switches: [mds("MDS-B", 20, [30], [fc(1, "F", 30), fc(2, "F", 30), fc(9, "F", 30), fc(10, "F", 30)])],
  devices: [
    { id: "app01", kind: "hba", label: "APP01", pwwn: W.app01, at: ["MDS-B", "fc1/1"] },
    { id: "app02", kind: "hba", label: "APP02", pwwn: W.app02, at: ["MDS-B", "fc1/2"] },
    { id: "prod", kind: "array", label: "PROD-ARRAY", pwwn: W.arrB, at: ["MDS-B", "fc1/9"] },
    { id: "bak", kind: "array", label: "BACKUP-ARRAY", pwwn: W.bak, at: ["MDS-B", "fc1/10"] },
  ],
  links: [],
  zoning: { "30": { zones: [], zonesets: [], defaultZone: "permit" } },
  aliases: { APP01: W.app01, APP02: W.app02, PROD_CT0: W.arrB, BACKUP_CT0: W.bak },
  luns: {
    prod: [
      { lun: 0, initiators: [W.app01] },
      { lun: 1, initiators: [W.app02] },
    ],
    // Sloppy masking on the backup array: the fabric has to do the isolating.
    bak: [{ lun: 0, initiators: [W.app01, W.app02] }],
  },
};

export const sanScenarios: SanScenario[] = [
  {
    id: "san-zoneset",
    title: "The zone is there, the LUN isn't",
    exam: "dccor",
    objective: "3.1",
    brief: "A colleague zoned the new host ESX02 to ARRAY-A yesterday and went home. ESX02 still sees no disks. ESX01 works and must keep working.",
    symptoms: ["ESX02: rescan finds no LUNs on ARRAY-A", "ESX02 shows a fabric login on MDS-A fc1/2", "The storage team has presented LUN 2 to ESX02"],
    hint: "Compare `show zone vsan 10` with `show zoneset active vsan 10`. Zoning changes only take effect when the zoneset is activated.",
    debrief:
      "Zones live in the full zoning database; the switch enforces the **active** zoneset, a copy made at `zoneset activate`. A zone has to be a member of the zoneset, and the zoneset activated again, before it does anything. Since only one zoneset can be active per VSAN, you add to the existing one rather than activating a new one with just your zone, which would cut off every other host.",
    fabric: zonesetLab,
    pos: { "MDS-A": [50, 50], esx01: [14, 20], esx02: [14, 80], arr: [86, 50] },
    goals: [
      { type: "sees", hba: "esx02", array: "arr", lun: 2, label: "ESX02 sees LUN 2 on ARRAY-A" },
      { type: "sees", hba: "esx01", array: "arr", lun: 1, label: "ESX01 still sees LUN 1 on ARRAY-A" },
    ],
    solution: [{ sw: "MDS-A", lines: ["configure terminal", "zoneset name ZS_FAB_A vsan 10", "member Z_ESX02_ARRAYA", "zoneset activate name ZS_FAB_A vsan 10"] }],
  },
  {
    id: "san-vsan",
    title: "Two database hosts, two different problems",
    exam: "dccor",
    objective: "3.1",
    brief: "The DB cluster lives in VSAN 20. Both nodes were patched in today, and neither sees the shared LUN 0 on DB-ARRAY.",
    symptoms: ["DB01 logs in, but not in the VSAN the array is in", "DB02 logs in to VSAN 20 but sees no targets", "Zoneset ZS_DB is active in VSAN 20"],
    hint: "`show flogi database` shows the VSAN each port logged into. For DB02, compare its pWWN in the flogi table with the member in its zone, character by character.",
    debrief:
      "Two classics. A port stays in VSAN 1 until you move it in the VSAN database (`vsan 20 interface fc1/3`), and devices in different VSANs can never see each other, whatever the zoning says. And a zone member that's one digit off is valid syntax that matches nothing; device-aliases (or `member pwwn` pasted from `show flogi database`) avoid that.",
    fabric: vsanLab,
    pos: { "MDS-A": [50, 50], db01: [14, 20], db02: [14, 80], arr: [86, 50] },
    goals: [
      { type: "sees", hba: "db01", array: "arr", lun: 0, label: "DB01 sees LUN 0" },
      { type: "sees", hba: "db02", array: "arr", lun: 0, label: "DB02 sees LUN 0" },
    ],
    solution: [
      {
        sw: "MDS-A",
        lines: [
          "configure terminal",
          "vsan database",
          "vsan 20 interface fc1/3",
          "zone name Z_DB02_ARR vsan 20",
          "no member pwwn 10:00:00:90:fa:d0:00:20",
          `member pwwn ${W.db02}`,
          "zoneset activate name ZS_DB vsan 20",
        ],
      },
    ],
  },
  {
    id: "san-trunk",
    title: "VSAN 10 crosses the ISL, VSAN 20 doesn't",
    exam: "dccor",
    objective: "3.1",
    brief: "Hosts on MDS-EDGE reach the array on MDS-CORE over a TE port. WEB01 (VSAN 10) is fine; SQL01 (VSAN 20) sees nothing, although its zone is active.",
    symptoms: ["SQL01 is logged in on MDS-EDGE in VSAN 20", "ARRAY-A ct1 is logged in on MDS-CORE in VSAN 20", "show fcns database vsan 20 on MDS-EDGE lists only SQL01"],
    hint: "Look at the trunk VSAN lines in `show interface fc1/13` on either switch.",
    debrief:
      "A TE port carries only the VSANs that are created on both switches **and** allowed on both ends of the trunk. VSAN 20 existed everywhere but wasn't in the allowed list, so each switch had its own one-switch VSAN 20 fabric and its own name server. `switchport trunk allowed vsan add 20` on both ends merges them.",
    fabric: trunkLab,
    pos: { "MDS-CORE": [72, 50], "MDS-EDGE": [30, 50], web01: [6, 20], sql01: [6, 80], arr10: [94, 20], arr20: [94, 80] },
    goals: [
      { type: "sees", hba: "sql01", array: "arr20", lun: 0, label: "SQL01 sees LUN 0 on ARRAY-A ct1 (VSAN 20)" },
      { type: "sees", hba: "web01", array: "arr10", lun: 0, label: "WEB01 still sees LUN 0 on ARRAY-A ct0 (VSAN 10)" },
    ],
    solution: [
      { sw: "MDS-CORE", lines: ["configure terminal", "interface fc1/13", "switchport trunk allowed vsan add 20"] },
      { sw: "MDS-EDGE", lines: ["configure terminal", "interface fc1/13", "switchport trunk allowed vsan add 20"] },
    ],
  },
  {
    id: "san-merge",
    title: "Joining two switches that both think they're domain 10",
    exam: "dccor",
    objective: "3.1",
    brief: "MDS-2 was staged from a copy of MDS-1's config and cabled to it on fc1/16 in VSAN 10. ESX01 on MDS-2 needs LUN 4 on the array behind MDS-1.",
    symptoms: ["fc1/16 is not up as an E port", "show fcdomain domain-list vsan 10 shows one domain on each switch", "Both switches have static domain IDs"],
    hint: "Each switch in a VSAN needs a unique domain ID. A static domain ID change only takes effect after a disruptive fcdomain restart for that VSAN.",
    debrief:
      "With static domain IDs, a duplicate can't be reassigned by the principal switch, so the ISL isolates that VSAN instead of merging the fabrics. Configuring `fcdomain domain 20 static vsan 10` only changes the **configured** ID; `fcdomain restart disruptive vsan 10` applies it (the devices on that switch log in again with new FCIDs). Plan unique IDs before cabling.",
    fabric: mergeLab,
    pos: { "MDS-1": [72, 50], "MDS-2": [30, 50], esx01: [6, 50], arr: [94, 50] },
    goals: [{ type: "sees", hba: "esx01", array: "arr", lun: 4, label: "ESX01 sees LUN 4 across the merged fabric" }],
    solution: [{ sw: "MDS-2", lines: ["configure terminal", "fcdomain domain 20 static vsan 10", "fcdomain restart disruptive vsan 10"] }],
  },
  {
    id: "san-npv",
    title: "NPV edge: the switch logs in, the servers don't",
    exam: "dccor",
    objective: "3.1",
    brief: "NPV-EDGE (an NPV-mode switch) connects ESX11 and ESX12 to MDS-CORE over fc1/9. Neither server gets a fabric login. A second uplink, fc1/10, is shut for maintenance and should stay that way.",
    symptoms: ["show npv status on NPV-EDGE: server interfaces have no working external interface", "show flogi database on MDS-CORE lists only the array", "Hosts and the array are in VSAN 10"],
    hint: "An NP uplink only carries logins for servers in its own VSAN. And the core has to accept more than one login on the F port the uplink lands on.",
    debrief:
      "An NPV switch has no domain ID and runs no fabric services; it turns each server FLOGI into an FDISC on an NP uplink whose VSAN matches the server port. The core F port then sees several logins, which it only accepts with `feature npiv`. So: uplink VSAN must match (`vsan 10 interface fc1/9` on the edge), and NPIV on the core.",
    fabric: npvLab,
    pos: { "MDS-CORE": [72, 50], "NPV-EDGE": [28, 50], esx11: [6, 20], esx12: [6, 80], arr: [94, 50] },
    goals: [
      { type: "sees", hba: "esx11", array: "arr", lun: 0, label: "ESX11 sees LUN 0" },
      { type: "sees", hba: "esx12", array: "arr", lun: 0, label: "ESX12 sees LUN 0" },
    ],
    solution: [
      { sw: "NPV-EDGE", lines: ["configure terminal", "vsan database", "vsan 10 interface fc1/9"] },
      { sw: "MDS-CORE", lines: ["configure terminal", "feature npiv"] },
    ],
  },
  {
    id: "san-hba-swap",
    title: "The HBA was replaced overnight",
    exam: "dccor",
    objective: "5.3",
    brief: `ESX03's HBA failed and was replaced. The new card's pWWN is ${W.esx03new}, and storage has already re-masked LUN 3 to it. Keep port security on: just make it trust the new card instead of the old one.`,
    symptoms: ["fc1/3 on MDS-A is down; show port-security violations lists the new pWWN", "Zone Z_ESX03 uses device-alias ESX03", "ESX01 on fc1/1 is unaffected"],
    hint: "Port security has a config database and an active one: edit the config database, then activate again. The alias change is held in a pending session until you commit it.",
    debrief:
      "Two layers keyed on the old pWWN. Port security rejected the FLOGI because the active database binds fc1/3 to the old card: edit the binding under `port-security database vsan 10`, then `port-security activate vsan 10` to copy it to the active database. Zoning by device-alias pays off here: in enhanced mode zones reference the alias by name, so re-pointing the alias and running `device-alias commit` fixes every zone at once, with no zoneset re-activation.",
    fabric: swapLab,
    pos: { "MDS-A": [50, 50], esx01: [14, 20], esx03: [14, 80], arr: [86, 50] },
    goals: [
      { type: "sees", hba: "esx03", array: "arr", lun: 3, label: "ESX03 (new HBA) sees LUN 3" },
      { type: "sees", hba: "esx01", array: "arr", lun: 1, label: "ESX01 still sees LUN 1" },
      { type: "portSecurity", sw: "MDS-A", vsan: 10, label: "Port security stays active in VSAN 10" },
      { type: "noPending", label: "No uncommitted device-alias changes (the fabric lock is released)" },
    ],
    solution: [
      {
        sw: "MDS-A",
        lines: [
          "configure terminal",
          "port-security database vsan 10",
          `no pwwn ${W.esx03} interface fc1/3`,
          `pwwn ${W.esx03new} interface fc1/3`,
          "port-security activate vsan 10",
          "device-alias database",
          "no device-alias name ESX03",
          `device-alias name ESX03 pwwn ${W.esx03new}`,
          "device-alias commit",
        ],
      },
    ],
  },
  {
    id: "san-default-zone",
    title: "Lock down a wide-open VSAN",
    exam: "dccor",
    objective: "5.3",
    brief:
      "VSAN 30 was brought up in a hurry with the default zone set to permit and no zoning at all. Put single-initiator zoning in place: APP01 gets PROD-ARRAY only; APP02 gets PROD-ARRAY and BACKUP-ARRAY. Then close the default zone. Device-aliases already exist for every port.",
    symptoms: ["show zone status vsan 30: default-zone permit", "Every host sees every target in show fcns database", "BACKUP-ARRAY masks LUN 0 to both hosts, so only the fabric can keep APP01 off it"],
    hint: "Build zones with `member device-alias`, put them in one zoneset, activate it, then `no zone default-zone permit vsan 30`.",
    debrief:
      "Default zone permit means every unzoned device can talk to every other, which is fine for a lab and wrong for production. Single-initiator zones (one host, its targets) keep a misbehaving HBA from disturbing other hosts and limit RSCN noise. LUN masking on the array is a second layer, not a substitute: here the backup array presented its LUN to both hosts, and only zoning kept APP01 off it.",
    fabric: defaultZoneLab,
    pos: { "MDS-B": [50, 50], app01: [14, 20], app02: [14, 80], prod: [86, 20], bak: [86, 80] },
    goals: [
      { type: "sees", hba: "app01", array: "prod", lun: 0, label: "APP01 sees LUN 0 on PROD-ARRAY" },
      { type: "sees", hba: "app02", array: "prod", lun: 1, label: "APP02 sees LUN 1 on PROD-ARRAY" },
      { type: "sees", hba: "app02", array: "bak", lun: 0, label: "APP02 sees LUN 0 on BACKUP-ARRAY" },
      { type: "isolated", hba: "app01", array: "bak", label: "APP01 can't reach BACKUP-ARRAY" },
      { type: "defaultDeny", vsan: 30, label: "The default zone in VSAN 30 denies" },
    ],
    solution: [
      {
        sw: "MDS-B",
        lines: [
          "configure terminal",
          "zone name Z_APP01_PROD vsan 30",
          "member device-alias APP01",
          "member device-alias PROD_CT0",
          "zone name Z_APP02_PROD_BAK vsan 30",
          "member device-alias APP02",
          "member device-alias PROD_CT0",
          "member device-alias BACKUP_CT0",
          "zoneset name ZS_V30 vsan 30",
          "member Z_APP01_PROD",
          "member Z_APP02_PROD_BAK",
          "zoneset activate name ZS_V30 vsan 30",
          "no zone default-zone permit vsan 30",
        ],
      },
    ],
  },
];

export const sanById: Record<string, SanScenario> = Object.fromEntries(sanScenarios.map((s) => [s.id, s]));
