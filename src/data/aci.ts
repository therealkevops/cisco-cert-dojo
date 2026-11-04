import type { AciModel, AciScenario, Endpoint } from "@/lib/aci";

// ACI Policy Lab scenarios (DCCOR 1.4 access policies, 5.1 contracts). Each starts from a working
// three-tier tenant and breaks it; the validator checks it fails as shipped and passes after the
// reference fix in scripts/validate-content.mjs.

export function baseTenant(): AciModel {
  return {
    tenant: "Shop",
    pools: [{ name: "SHOP_VLANS", mode: "static", blocks: "100-199" }],
    domains: [{ name: "SHOP_PHYS", pool: "SHOP_VLANS" }],
    aaeps: [{ name: "SHOP_AAEP", domains: ["SHOP_PHYS"] }],
    policyGroups: [{ name: "SRV_25G", aaep: "SHOP_AAEP" }],
    intProfiles: [
      { name: "L101_SRV", ports: "1/10-20", policyGroup: "SRV_25G" },
      { name: "L102_SRV", ports: "1/10-20", policyGroup: "SRV_25G" },
    ],
    switchProfiles: [
      { name: "LEAF101", leaves: "101", intProfiles: ["L101_SRV"] },
      { name: "LEAF102", leaves: "102", intProfiles: ["L102_SRV"] },
    ],
    vrfs: [{ name: "PROD", enforced: true }],
    bds: [
      { name: "WEB_BD", vrf: "PROD", subnets: "10.1.1.1/24", routing: true },
      { name: "APP_BD", vrf: "PROD", subnets: "10.1.2.1/24", routing: true },
      { name: "DB_BD", vrf: "PROD", subnets: "10.1.3.1/24", routing: true },
    ],
    epgs: [
      { name: "Web", ap: "SHOP", bd: "WEB_BD", domains: ["SHOP_PHYS"], paths: "101 eth1/10 vlan-110", provides: [], consumes: ["web-to-app"] },
      { name: "App", ap: "SHOP", bd: "APP_BD", domains: ["SHOP_PHYS"], paths: "102 eth1/10 vlan-120", provides: ["web-to-app"], consumes: ["app-to-db"] },
      { name: "DB", ap: "SHOP", bd: "DB_BD", domains: ["SHOP_PHYS"], paths: "102 eth1/15 vlan-130", provides: ["app-to-db"], consumes: [] },
    ],
    filters: [
      { name: "app-8080", entries: "tcp 8080" },
      { name: "sql", entries: "tcp 1433" },
      { name: "icmp", entries: "icmp" },
    ],
    contracts: [
      { name: "web-to-app", scope: "vrf", filters: ["app-8080", "icmp"], both: true, reverse: true },
      { name: "app-to-db", scope: "vrf", filters: ["sql", "icmp"], both: true, reverse: true },
    ],
  };
}

export const baseEndpoints: Endpoint[] = [
  { name: "web01", ip: "10.1.1.11", leaf: 101, port: "eth1/10", vlan: 110 },
  { name: "app01", ip: "10.1.2.21", leaf: 102, port: "eth1/10", vlan: 120 },
  { name: "db01", ip: "10.1.3.31", leaf: 102, port: "eth1/15", vlan: 130 },
];

const tweak = (fn: (m: AciModel) => void) => {
  const m = baseTenant();
  fn(m);
  return m;
};
const epg = (m: AciModel, n: string) => m.epgs.find((e) => e.name === n)!;

export const aciScenarios: AciScenario[] = [
  {
    id: "aci-access",
    title: "A new leaf, a new server, and F0467",
    exam: "dccor",
    objective: "1.4",
    brief:
      "Leaf 103 just joined the fabric. app02 is cabled to node 103 eth1/5 and tags its traffic with VLAN 220. Someone added the static port to EPG App and stopped there. Make app02 a working member of App without faults.",
    symptoms: ["EPG App shows fault F0467 on node 103 eth1/5", "app02 never appears under the EPG's operational endpoints", "The other tiers are healthy"],
    hint: "Follow the chain for node 103 eth1/5: switch profile → interface profile → policy group → AAEP → domain → VLAN pool. Both the VLAN and the interface must be covered.",
    debrief:
      "F0467 names the broken link. **invalid-vlan** means no domain on the EPG has the encap in its pool. **invalid-path** means the leaf port's AAEP doesn't carry a domain that the EPG uses. Access policies are what let a tenant use a port at all: a switch profile selects the leaf, an interface profile selects the port, the policy group points to the AAEP, and the AAEP lists the domains (and so the VLAN pools) that port may carry.",
    model: tweak((m) => {
      epg(m, "App").paths = "102 eth1/10 vlan-120, 103 eth1/5 vlan-220";
    }),
    endpoints: [...baseEndpoints, { name: "app02", ip: "10.1.2.22", leaf: 103, port: "eth1/5", vlan: 220 }],
    goals: [
      { type: "learned", ep: "app02", epg: "App", label: "app02 is learned in EPG App" },
      { type: "reach", from: "web01", to: "app02", proto: "tcp", port: 8080, label: "web01 reaches app02 on tcp/8080" },
      { type: "noFaults", label: "No faults in the tenant or access policies" },
    ],
    solution: [
      "Fabric › Access Policies › Pools › VLAN › SHOP_VLANS: add block 200-299 (encap blocks: 100-199, 200-299)",
      "Interface profiles: add L103_SRV, ports 1/5, policy group SRV_25G",
      "Switch profiles: add LEAF103, leaf 103, interface profile L103_SRV",
    ],
  },
  {
    id: "aci-consume",
    title: "Web can't reach App on 8080",
    exam: "dccor",
    objective: "5.1",
    brief: "The web tier calls the app tier on tcp/8080. Since last night's change window, connections time out. Fix it without opening anything else: web01 must still not reach app01 on tcp/22, nor the database at all.",
    symptoms: ["web01 → app01 tcp/8080 times out", "No faults", "Both endpoints are learned with their IPs"],
    hint: "Two things to check: does Web still consume the contract App provides, and does the filter match the port the app actually listens on?",
    debrief:
      "In an enforced VRF, traffic between EPGs is denied unless a contract permits it, and a contract only applies once one EPG **provides** it and the other **consumes** it. Then the filter decides what passes. Both halves failed here: the consumer relation was gone, and the filter said 8008. Keeping the filter tight (tcp 8080 rather than ip) is what keeps tcp/22 closed.",
    model: tweak((m) => {
      epg(m, "Web").consumes = [];
      m.filters.find((f) => f.name === "app-8080")!.entries = "tcp 8008";
    }),
    endpoints: baseEndpoints,
    goals: [
      { type: "reach", from: "web01", to: "app01", proto: "tcp", port: 8080, label: "web01 reaches app01 on tcp/8080" },
      { type: "blocked", from: "web01", to: "app01", proto: "tcp", port: 22, label: "web01 can't reach app01 on tcp/22" },
      { type: "blocked", from: "web01", to: "db01", proto: "tcp", port: 1433, label: "web01 can't reach db01" },
      { type: "enforced", vrf: "PROD", label: "VRF PROD stays enforced" },
    ],
    solution: ["Tenant Shop › Contracts › Filters › app-8080: entry tcp 8080", "EPG Web › Contracts: add consumed contract web-to-app"],
  },
  {
    id: "aci-routing",
    title: "The database is learned, but not routable",
    exam: "dccor",
    objective: "1.4",
    brief: "The DB bridge domain was rebuilt from a template. App servers now fail to connect to db01 on tcp/1433, even though the contract hasn't changed.",
    symptoms: ["db01 shows up in EPG DB with a MAC address but no IP", "app01 → db01 tcp/1433 fails", "The app-to-db contract is unchanged"],
    hint: "Traffic between bridge domains is routed by the fabric, so the destination BD needs unicast routing and a gateway subnet that contains its endpoints.",
    debrief:
      "A BD with unicast routing off is a pure layer 2 segment: the fabric learns MACs only and won't route into it. The BD also needs a subnet (the pervasive gateway, 10.1.3.1/24 here) that contains the endpoint IPs, or IP learning and routing fail. The contract was never the problem: it decides **whether** traffic is allowed, the BD and VRF decide **how** it gets there.",
    model: tweak((m) => {
      Object.assign(m.bds.find((b) => b.name === "DB_BD")!, { routing: false, subnets: "" });
    }),
    endpoints: baseEndpoints,
    goals: [
      { type: "reach", from: "app01", to: "db01", proto: "tcp", port: 1433, label: "app01 reaches db01 on tcp/1433" },
      { type: "blocked", from: "web01", to: "db01", proto: "tcp", port: 1433, label: "web01 still can't reach db01" },
      { type: "noFaults", label: "No faults" },
    ],
    solution: ["Tenant Shop › Networking › Bridge Domains › DB_BD: unicast routing on, subnet 10.1.3.1/24"],
  },
  {
    id: "aci-direction",
    title: "The backup server can't start its jobs",
    exam: "dccor",
    objective: "5.1",
    brief:
      "The backup server bkp01 (EPG Backup) opens tcp/10000 sessions to the database servers to pull backups. The new contract was applied, but backups fail, while the DBA reports that the DB servers can now open sessions to the backup server, which they must not.",
    symptoms: ["bkp01 → db01 tcp/10000 is dropped", "db01 → bkp01 tcp/10000 is permitted", "Contract backup has one subject, both directions, reverse filter ports on"],
    hint: "Who starts the session? The consumer opens connections to the provider.",
    debrief:
      "Provider and consumer are about who initiates. The EPG that offers the service (the DB, listening on tcp/10000) provides; the client (the backup server) consumes. With **apply both directions** and **reverse filter ports**, the filter permits consumer → provider to port 10000 and the replies back from source port 10000, but not new sessions from the provider to the consumer on that port. Swapping the relations fixes both complaints at once.",
    model: tweak((m) => {
      m.bds.push({ name: "BKP_BD", vrf: "PROD", subnets: "10.1.9.1/24", routing: true });
      m.epgs.push({ name: "Backup", ap: "SHOP", bd: "BKP_BD", domains: ["SHOP_PHYS"], paths: "101 eth1/12 vlan-190", provides: ["backup"], consumes: [] });
      epg(m, "DB").consumes = ["backup"];
      m.filters.push({ name: "ndmp", entries: "tcp 10000" });
      m.contracts.push({ name: "backup", scope: "vrf", filters: ["ndmp"], both: true, reverse: true });
    }),
    endpoints: [...baseEndpoints, { name: "bkp01", ip: "10.1.9.91", leaf: 101, port: "eth1/12", vlan: 190 }],
    goals: [
      { type: "reach", from: "bkp01", to: "db01", proto: "tcp", port: 10000, label: "bkp01 opens tcp/10000 to db01" },
      { type: "blocked", from: "db01", to: "bkp01", proto: "tcp", port: 10000, label: "db01 can't open tcp/10000 to bkp01" },
      { type: "reach", from: "app01", to: "db01", proto: "tcp", port: 1433, label: "app01 still reaches db01 on tcp/1433" },
    ],
    solution: ["EPG Backup › Contracts: remove provided backup, add consumed backup", "EPG DB › Contracts: remove consumed backup, add provided backup"],
  },
  {
    id: "aci-unenforced",
    title: "Put the policy back",
    exam: "dccor",
    objective: "5.1",
    brief:
      "During a migration someone set VRF PROD to unenforced and deleted the contracts “to rule out ACI”. Everything talks to everything. Rebuild least-privilege policy: web → app on tcp/8080, app → db on tcp/1433, nothing else between tiers. The filters are still there.",
    symptoms: ["VRF PROD policy control enforcement: unenforced", "No contracts in tenant Shop", "web01 can reach db01 directly"],
    hint: "Create two contracts from the existing filters, provide each on the server side and consume it on the client side, then set the VRF back to enforced.",
    debrief:
      "Unenforced turns the VRF into a flat network for every EPG in it: handy for a five-minute test, dangerous when it stays. Rebuilding it the ACI way gives each tier exactly one way in: the App EPG provides web-to-app (tcp 8080) to Web, and DB provides app-to-db (tcp 1433) to App. Web → DB has no contract, so it hits the implicit deny.",
    model: tweak((m) => {
      m.vrfs[0].enforced = false;
      m.contracts = [];
      for (const e of m.epgs) (e.provides = []), (e.consumes = []);
    }),
    endpoints: baseEndpoints,
    goals: [
      { type: "enforced", vrf: "PROD", label: "VRF PROD is enforced" },
      { type: "reach", from: "web01", to: "app01", proto: "tcp", port: 8080, label: "web01 reaches app01 on tcp/8080" },
      { type: "reach", from: "app01", to: "db01", proto: "tcp", port: 1433, label: "app01 reaches db01 on tcp/1433" },
      { type: "blocked", from: "web01", to: "db01", proto: "tcp", port: 1433, label: "web01 can't reach db01" },
      { type: "blocked", from: "web01", to: "app01", proto: "tcp", port: 22, label: "web01 can't reach app01 on tcp/22" },
      { type: "noFaults", label: "No faults" },
    ],
    solution: [
      "Contracts: add web-to-app (scope VRF, filter app-8080, both directions, reverse ports) and app-to-db (filter sql)",
      "EPG Web consumes web-to-app; EPG App provides web-to-app and consumes app-to-db; EPG DB provides app-to-db",
      "VRF PROD: policy control enforcement enforced",
    ],
  },
  {
    id: "aci-encap",
    title: "One copy-paste, two broken tiers",
    exam: "dccor",
    objective: "1.4",
    brief: "After a cleanup of static ports, both app01 and db01 dropped out of the fabric. Both servers sit on leaf 102 and nothing was recabled.",
    symptoms: ["EPG DB raises F0467 encap-already-in-use", "app01 isn't learned in EPG App", "web01 is fine"],
    hint: "Compare the static ports of App and DB with the VLAN each server actually tags (app01: vlan 120, db01: vlan 130).",
    debrief:
      "On a leaf, one VLAN encap maps to one EPG (with the default global VLAN scope). App's binding was pasted with vlan-130, so App claimed that encap on leaf 102 first and DB's own binding failed with **encap-already-in-use**. Meanwhile app01 still tags 120, which nothing listened for. Fixing App's path releases the encap and both tiers come back.",
    model: tweak((m) => {
      epg(m, "App").paths = "102 eth1/10 vlan-130";
    }),
    endpoints: baseEndpoints,
    goals: [
      { type: "learned", ep: "app01", epg: "App", label: "app01 is learned in EPG App" },
      { type: "learned", ep: "db01", epg: "DB", label: "db01 is learned in EPG DB" },
      { type: "reach", from: "app01", to: "db01", proto: "tcp", port: 1433, label: "app01 reaches db01 on tcp/1433" },
      { type: "noFaults", label: "No faults" },
    ],
    solution: ["EPG App › Static Ports: 102 eth1/10 vlan-120"],
  },
  {
    id: "aci-scope",
    title: "The contract is right, the scope isn't",
    exam: "dccor",
    objective: "5.1",
    brief: "The web tier was moved into its own application profile, FRONTEND, so another team can manage it. The contract relations were recreated exactly, yet web01 can no longer reach app01 on tcp/8080.",
    symptoms: ["EPG Web is in AP FRONTEND, App and DB in AP SHOP", "Web consumes web-to-app, App provides it", "No faults"],
    hint: "A contract's scope limits which provider/consumer pairs it applies between.",
    debrief:
      "Contract scope is application-profile, VRF (the default), tenant or global. With application-profile scope, the contract only applies between EPGs in the same application profile, so moving Web into FRONTEND cut it off. VRF scope fits here: both EPGs share VRF PROD.",
    model: tweak((m) => {
      epg(m, "Web").ap = "FRONTEND";
      m.contracts.find((c) => c.name === "web-to-app")!.scope = "application-profile";
    }),
    endpoints: baseEndpoints,
    goals: [
      { type: "reach", from: "web01", to: "app01", proto: "tcp", port: 8080, label: "web01 reaches app01 on tcp/8080" },
      { type: "blocked", from: "web01", to: "db01", proto: "tcp", port: 1433, label: "web01 can't reach db01" },
    ],
    solution: ["Contract web-to-app: scope VRF"],
  },
];

export const aciById: Record<string, AciScenario> = Object.fromEntries(aciScenarios.map((s) => [s.id, s]));
