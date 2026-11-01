import type { SizingExercise } from "./sizing";

// Design & Automation Desk: ENCOR worksheets for the topics that are about reading, building and reasoning
// rather than typing device configuration. Answers are checked exactly (text ignores case and spacing),
// JSON is parsed and checked field by field.

const ifTree = `module: ietf-interfaces
  +--rw interfaces
     +--rw interface* [name]
        +--rw name           string
        +--rw description?   string
        +--rw type           identityref
        +--rw enabled?       boolean`;

export const deskExercises: SizingExercise[] = [
  {
    id: "desk-json",
    exam: "encor",
    area: "desk",
    objective: "6.2",
    title: "Write the JSON the API expects",
    brief: "An automation script needs request bodies for a device API. Write each payload by hand. It must parse, and the fields must have the right names, values and types.",
    given: [
      ["Strings", "double quotes only"],
      ["Booleans", "true / false, lowercase, no quotes"],
      ["Numbers", "no quotes"],
      ["Not allowed", "trailing commas, comments, single quotes"],
    ],
    steps: [
      {
        kind: "json",
        prompt: "Write an object for interface GigabitEthernet1: description 'Uplink to core', enabled, MTU 9000. Use the keys name, description, enabled and mtu.",
        checks: [
          { path: "name", equals: "GigabitEthernet1" },
          { path: "description", equals: "Uplink to core" },
          { path: "enabled", equals: true, type: "boolean" },
          { path: "mtu", equals: 9000, type: "number" },
        ],
        example: `{
  "name": "GigabitEthernet1",
  "description": "Uplink to core",
  "enabled": true,
  "mtu": 9000
}`,
        working: "true and 9000 are unquoted: \"true\" and \"9000\" would be strings, and a strict API would reject them.",
      },
      {
        kind: "json",
        prompt: "Write an object with a key vlans holding an array of three objects, each with id and name: 10 users, 20 voice, 30 printers.",
        checks: [
          { path: "vlans", type: "array", length: 3 },
          { path: "vlans[0].id", equals: 10 },
          { path: "vlans[1].name", equals: "voice" },
          { path: "vlans[2].id", equals: 30 },
          { path: "vlans[2].name", equals: "printers" },
        ],
        example: `{
  "vlans": [
    { "id": 10, "name": "users" },
    { "id": 20, "name": "voice" },
    { "id": 30, "name": "printers" }
  ]
}`,
        working: "A list of records is an array of objects. Order is preserved, so vlans[1] is the second entry.",
      },
      {
        kind: "text",
        prompt: "What is the value at device.interfaces[1].ip?",
        exhibit: `{
  "device": {
    "hostname": "edge-1",
    "interfaces": [
      { "name": "Gi1", "ip": "10.0.1.1" },
      { "name": "Gi2", "ip": "10.0.2.1" }
    ]
  }
}`,
        accept: ["10.0.2.1"],
        canonical: "10.0.2.1",
        working: "Arrays start at index 0, so interfaces[1] is Gi2.",
      },
      {
        kind: "json",
        prompt: "Write the RESTCONF body that creates Loopback100 using the ietf-interfaces model: top-level key ietf-interfaces:interface, with name Loopback100, type iana-if-type:softwareLoopback and enabled true.",
        checks: [
          { path: "ietf-interfaces:interface", type: "object" },
          { path: "ietf-interfaces:interface.name", equals: "Loopback100" },
          { path: "ietf-interfaces:interface.type", equals: "iana-if-type:softwareLoopback" },
          { path: "ietf-interfaces:interface.enabled", equals: true },
        ],
        example: `{
  "ietf-interfaces:interface": {
    "name": "Loopback100",
    "type": "iana-if-type:softwareLoopback",
    "enabled": true
  }
}`,
        working: "RESTCONF JSON prefixes the top-level node with its YANG module name. Identity values such as the interface type carry their module prefix too.",
      },
      {
        kind: "choice",
        prompt: "Which line is valid JSON for an interface with no neighbours?",
        choices: ['{"neighbors": []}', "{'neighbors': []}", '{"neighbors": None}', '{neighbors: []}'],
        answer: 0,
        working: "An empty array is valid. Single quotes, Python's None and unquoted keys are not JSON (JSON uses null).",
      },
    ],
    takeaway: "Most API errors in practice are payload errors. Valid JSON with the wrong types (\"9000\" instead of 9000) parses fine and still gets a 400 from the API.",
  },
  {
    id: "desk-yang",
    exam: "encor",
    area: "desk",
    objective: "6.3",
    also: ["4.6"],
    title: "From a YANG tree to RESTCONF and NETCONF calls",
    brief: "Use the ietf-interfaces tree to build the calls an automation tool makes against an IOS XE router at 10.0.0.1.",
    given: [
      ["Model", "ietf-interfaces (tree in step 1)"],
      ["RESTCONF root", "/restconf/data"],
      ["Device", "IOS XE, RESTCONF and NETCONF enabled"],
    ],
    steps: [
      {
        kind: "text",
        prompt: "Which RESTCONF path reads all interfaces? (path only, starting with /restconf)",
        exhibit: ifTree,
        accept: ["/restconf/data/ietf-interfaces:interfaces", "/restconf/data/ietf-interfaces:interfaces/"],
        canonical: "/restconf/data/ietf-interfaces:interfaces",
        working: "Data root + module:top-level-container.",
      },
      {
        kind: "text",
        prompt: "Which path reads only GigabitEthernet2?",
        accept: ["/restconf/data/ietf-interfaces:interfaces/interface=GigabitEthernet2", "/restconf/data/ietf-interfaces:interfaces/interface=gigabitethernet2"],
        canonical: "/restconf/data/ietf-interfaces:interfaces/interface=GigabitEthernet2",
        working: "List entries are addressed as list=key. The key here is name, from `interface* [name]`.",
      },
      {
        kind: "text",
        prompt: "Which HTTP method changes only the description, leaving the rest of the interface as it is?",
        accept: ["PATCH"],
        canonical: "PATCH",
        working: "PATCH merges. PUT would replace the whole interface entry with what you send.",
      },
      {
        kind: "text",
        prompt: "Which Accept header asks for JSON?",
        accept: ["application/yang-data+json", "Accept: application/yang-data+json"],
        canonical: "application/yang-data+json",
        working: "RESTCONF media types are application/yang-data+json and application/yang-data+xml.",
      },
      {
        prompt: "Which TCP port does NETCONF over SSH use?",
        unit: "port",
        answer: 830,
        tol: 0,
        working: "NETCONF is XML RPCs over SSH on port 830. RESTCONF runs over HTTPS (443).",
      },
      {
        kind: "choice",
        prompt: "In the tree, what does the ? after description mean?",
        choices: ["The leaf is optional", "The leaf is read-only", "It is a list", "The value is unknown"],
        answer: 0,
        working: "? marks an optional node, * a list (or leaf-list), rw configuration, ro state.",
      },
      {
        kind: "text",
        prompt: "Which NETCONF operation reads only configuration (not operational state)?",
        accept: ["get-config", "<get-config>"],
        canonical: "<get-config>",
        working: "<get> returns config and state. <get-config> takes a datastore such as <running/>.",
      },
    ],
    takeaway: "Once you can read a YANG tree, the RESTCONF URL, the JSON body and the NETCONF filter all follow from it. You never need to scrape CLI output.",
  },
  {
    id: "desk-api",
    exam: "encor",
    area: "desk",
    objective: "6.4",
    also: ["6.5", "5.3"],
    title: "Call the Catalyst Center and SD-WAN Manager APIs",
    brief: "Walk through a script that inventories devices from Catalyst Center, then logs in to SD-WAN Manager. Fill in the calls and interpret the responses.",
    given: [
      ["Catalyst Center", "https://dnac.corp.local"],
      ["SD-WAN Manager", "https://vmanage.corp.local"],
      ["Credentials", "read from a secrets vault at run time"],
    ],
    steps: [
      {
        kind: "text",
        prompt: "Which HTTP method requests a Catalyst Center token?",
        accept: ["POST"],
        canonical: "POST",
        working: "POST with HTTP Basic credentials.",
      },
      {
        kind: "text",
        prompt: "Which path does that request go to?",
        accept: ["/dna/system/api/v1/auth/token"],
        canonical: "/dna/system/api/v1/auth/token",
        working: "The response body is {\"Token\": \"...\"}.",
      },
      {
        kind: "text",
        prompt: "Which request header carries the token on every later call?",
        accept: ["X-Auth-Token"],
        canonical: "X-Auth-Token",
        working: "Catalyst Center uses X-Auth-Token rather than Authorization: Bearer.",
      },
      {
        prompt: "GET /dna/intent/api/v1/network-device succeeds. Which status code comes back?",
        unit: "",
        answer: 200,
        tol: 0,
        working: "200 OK with the device list in the body's response array.",
      },
      {
        prompt: "Two hours later the same call fails because the token has expired. Which status code?",
        unit: "",
        answer: 401,
        tol: 0,
        working: "401 Unauthorized: get a new token and retry. 403 would mean the account lacks permission.",
      },
      {
        prompt: "A POST that starts a long-running job returns a taskId straight away. Which status code?",
        unit: "",
        answer: 202,
        tol: 0,
        working: "202 Accepted: the work continues in the background. Poll GET /dna/intent/api/v1/task/{taskId} for the result.",
      },
      {
        kind: "text",
        prompt: "SD-WAN Manager: which path does the script POST the username and password to?",
        accept: ["/j_security_check"],
        canonical: "/j_security_check",
        working: "It returns a JSESSIONID cookie for the session.",
      },
      {
        kind: "text",
        prompt: "Which header must POST/PUT/DELETE calls to SD-WAN Manager add, using the value from /dataservice/client/token?",
        accept: ["X-XSRF-TOKEN"],
        canonical: "X-XSRF-TOKEN",
        working: "GETs work with the session cookie alone. Changes also need the anti-CSRF token.",
      },
      {
        kind: "choice",
        prompt: "The API returns 429. What should the script do?",
        choices: ["Back off and retry after the time in Retry-After", "Retry immediately in a tight loop", "Request a new token", "Switch to HTTP"],
        answer: 0,
        working: "429 Too Many Requests is rate limiting. Respect Retry-After, or use exponential back-off.",
      },
    ],
    takeaway: "Both platforms use a token or session obtained once and sent with each call. Reading the status code first (2xx success, 4xx fix the request or credentials, 5xx server side) tells you what to do next.",
  },
  {
    id: "desk-python",
    exam: "encor",
    area: "desk",
    objective: "6.1",
    title: "Read the Python before you run it",
    brief: "Predict what each snippet prints. These are the building blocks of most network automation scripts: lists, dictionaries, loops, functions and error handling.",
    given: [
      ["Python", "3.x"],
      ["Answer", "exactly what is printed (case doesn't matter)"],
    ],
    steps: [
      {
        kind: "text",
        prompt: "What is printed?",
        exhibit: `devices = ["r1", "r2", "r3"]
print(devices[1].upper())`,
        accept: ["R2"],
        canonical: "R2",
        working: "Index 1 is the second item, 'r2'. .upper() makes it 'R2'.",
      },
      {
        prompt: "What is printed?",
        exhibit: `interfaces = [
    {"name": "Gi1", "status": "up"},
    {"name": "Gi2", "status": "down"},
    {"name": "Gi3", "status": "down"},
]
down = 0
for i in interfaces:
    if i["status"] == "down":
        down += 1
print(down)`,
        unit: "",
        answer: 2,
        tol: 0,
        working: "The loop counts entries whose status is 'down': Gi2 and Gi3.",
      },
      {
        kind: "text",
        prompt: "What is printed?",
        exhibit: `name, state = "Gi0/1", "up"
print(f"{name} is {state}")`,
        accept: ["Gi0/1 is up"],
        canonical: "Gi0/1 is up",
        working: "Tuple unpacking assigns both variables. The f-string substitutes them.",
      },
      {
        prompt: "What is printed?",
        exhibit: `intf = {"name": "Gi1", "enabled": True}
print(intf.get("mtu", 1500))`,
        unit: "",
        answer: 1500,
        tol: 0,
        working: ".get returns the default when the key is missing. intf[\"mtu\"] would raise KeyError instead.",
      },
      {
        kind: "text",
        prompt: "What is printed?",
        exhibit: `import json
data = json.loads('{"hostname": "edge-1", "vlans": [10, 20]}')
print(type(data).__name__)`,
        accept: ["dict"],
        canonical: "dict",
        working: "json.loads turns a JSON object into a Python dict (arrays become lists).",
      },
      {
        kind: "text",
        prompt: "The device is offline, so connect() raises ConnectionError. What is printed?",
        exhibit: `def backup(host):
    try:
        conn = connect(host)
        return "saved"
    except ConnectionError:
        return "unreachable"

print(backup("10.9.9.9"))`,
        accept: ["unreachable"],
        canonical: "unreachable",
        working: "The exception is caught, so the script reports and carries on instead of crashing.",
      },
    ],
    takeaway: "Exam items show short scripts and ask what they do. Read indices from 0, know dict vs list access, and follow try/except paths.",
  },
  {
    id: "desk-ha-qos",
    exam: "encor",
    area: "desk",
    objective: "1.1.b",
    also: ["1.1.a", "1.4"],
    title: "Availability maths and reading a QoS policy",
    brief: "Back up a campus design review with numbers: how much redundancy buys, how many links a design needs, and what a WAN QoS policy actually guarantees.",
    given: [
      ["Link or device", "99.9% available, failures independent"],
      ["Year", "525,600 minutes"],
      ["WAN link", "50 Mb/s"],
    ],
    steps: [
      {
        prompt: "Two 99.9% links in parallel (either is enough). What is the combined availability?",
        unit: "%",
        answer: 99.9999,
        tol: 0.0000001,
        working: "Both must fail: 0.001 × 0.001 = 0.000001 → 99.9999%.",
      },
      {
        prompt: "Three 99.9% devices in series (all needed). Availability, to two decimals?",
        unit: "%",
        answer: 99.7,
        tol: 0.00005,
        working: "0.999³ = 0.997003 → 99.70%. Each single point of failure in the path lowers it.",
      },
      {
        prompt: "How many minutes of downtime per year does 99.99% allow?",
        unit: "minutes",
        answer: 52.56,
        tol: 0.005,
        working: "0.0001 × 525,600 = 52.56 minutes.",
      },
      {
        prompt: "Six distribution blocks fully meshed to each other with one link per pair: how many links?",
        unit: "links",
        answer: 15,
        tol: 0,
        working: "n(n−1)/2 = 6 × 5 / 2 = 15. With a core pair instead, each block needs only its uplinks to the core.",
      },
      {
        prompt: "Refer to the policy. During congestion, how much bandwidth is VOICE guaranteed (and capped at)?",
        exhibit: `policy-map WAN-OUT
 class VOICE
  priority percent 20
 class CRITICAL
  bandwidth remaining percent 50
 class class-default
  bandwidth remaining percent 50
!
interface Gi0/0
 bandwidth 50000
 service-policy output WAN-OUT`,
        unit: "Mb/s",
        answer: 10,
        tol: 0.001,
        working: "20% of 50 Mb/s = 10 Mb/s. A priority class is policed to its rate during congestion.",
      },
      {
        prompt: "And CRITICAL's guarantee during congestion?",
        unit: "Mb/s",
        answer: 20,
        tol: 0.001,
        working: "`bandwidth remaining` shares what the priority queue leaves: (50 − 10) × 50% = 20 Mb/s.",
      },
      {
        prompt: "What decimal DSCP value is AF31?",
        unit: "",
        answer: 26,
        tol: 0,
        working: "AFxy = 8x + 2y: 8 × 3 + 2 × 1 = 26.",
      },
      {
        kind: "choice",
        prompt: "Where should the QoS trust boundary be for a desk with a Cisco IP phone and a PC behind it?",
        choices: ["At the IP phone (conditional trust on the access port)", "At the WAN router", "At the PC", "At the core"],
        answer: 0,
        working: "Trust markings as close to the source as you can control. The phone re-marks the PC's traffic.",
      },
    ],
    takeaway: "Parallel redundancy multiplies failure probabilities (big gains). Series components multiply availabilities (small losses). For QoS, priority is a percentage of the link, and `bandwidth remaining` shares what is left.",
  },
  {
    id: "desk-overlay",
    exam: "encor",
    area: "desk",
    objective: "2.3.b",
    also: ["2.3.a", "2.2.b", "2.1"],
    title: "Overlays: MTU, segments and who does what",
    brief: "Before rolling out tunnels and overlays, the team needs the numbers and roles right: header overhead, underlay MTU, segment counts, and the LISP and hypervisor vocabulary.",
    given: [
      ["Underlay", "1500-byte IP MTU unless raised"],
      ["GRE", "20-byte outer IPv4 + 4-byte GRE header"],
      ["VXLAN", "outer Ethernet 14 + IPv4 20 + UDP 8 + VXLAN 8"],
    ],
    steps: [
      {
        prompt: "What `ip mtu` should a plain GRE tunnel use over a 1500-byte path?",
        unit: "bytes",
        answer: 1476,
        tol: 0,
        working: "1500 − 24 = 1476. Adding IPsec costs more, so 1400 is a common safe value.",
      },
      {
        prompt: "How many bytes does VXLAN add to the original frame?",
        unit: "bytes",
        answer: 50,
        tol: 0,
        working: "14 + 20 + 8 + 8 = 50.",
      },
      {
        prompt: "Minimum underlay IP MTU to carry 1500-byte host packets in VXLAN without fragmentation?",
        unit: "bytes",
        answer: 1550,
        tol: 0,
        working: "1500 + 50. Data centres usually just run 9216 everywhere.",
      },
      {
        prompt: "How many segments does a 24-bit VNI allow?",
        unit: "segments",
        answer: 16777216,
        tol: 0,
        working: "2²⁴ = 16,777,216, against 4,094 usable VLANs.",
      },
      {
        kind: "text",
        prompt: "Which UDP destination port does VXLAN use?",
        accept: ["4789", "udp 4789"],
        canonical: "4789",
        working: "IANA-assigned 4789 (not RoCEv2's 4791).",
      },
      {
        kind: "text",
        prompt: "In LISP, what is the address that identifies a host, regardless of where it attaches? (acronym)",
        accept: ["EID", "endpoint identifier"],
        canonical: "EID",
        working: "Endpoint Identifier. The RLOC is the locator of the site router.",
      },
      {
        kind: "text",
        prompt: "Which LISP device does an ITR send its Map-Request to?",
        accept: ["map-resolver", "map resolver", "mr", "ms/mr", "map-server/map-resolver"],
        canonical: "Map-Resolver",
        working: "ITRs query the Map-Resolver. ETRs register with the Map-Server. Often one box does both.",
      },
      {
        kind: "choice",
        prompt: "VMware ESXi installed directly on a server is which type of hypervisor?",
        choices: ["Type 1 (bare metal)", "Type 2 (hosted)", "A container runtime", "A virtual switch"],
        answer: 0,
        working: "Type 1 runs on the hardware. Type 2 runs as an application on a host OS.",
      },
    ],
    takeaway: "Every overlay adds headers. Size the underlay MTU for them, or the overlay fragments or silently drops large packets.",
  },
  {
    id: "desk-sdwan-sda",
    exam: "encor",
    area: "desk",
    objective: "1.2",
    also: ["1.3", "4.5"],
    title: "Name the planes: SD-WAN, SD-Access and Catalyst Center",
    brief: "A new engineer has a whiteboard with boxes and no labels. Name the component or protocol for each job.",
    given: [
      ["SD-WAN", "Catalyst SD-WAN (older names accepted)"],
      ["SD-Access", "fabric managed by Catalyst Center"],
    ],
    steps: [
      {
        kind: "text",
        prompt: "SD-WAN: which component authenticates new WAN Edges first and helps them through NAT (orchestration plane)?",
        accept: ["validator", "sd-wan validator", "vbond", "catalyst sd-wan validator"],
        canonical: "SD-WAN Validator (vBond)",
        working: "The Validator is the first point of contact and tells edges where the Controllers and Manager are.",
      },
      {
        kind: "text",
        prompt: "SD-WAN: which component is the control plane, distributing routes and policy?",
        accept: ["controller", "sd-wan controller", "vsmart", "catalyst sd-wan controller"],
        canonical: "SD-WAN Controller (vSmart)",
        working: "Controllers run OMP with every edge. Data traffic never passes through them.",
      },
      {
        kind: "text",
        prompt: "SD-WAN: which component is the management plane (GUI, templates, monitoring)?",
        accept: ["manager", "sd-wan manager", "vmanage", "catalyst sd-wan manager"],
        canonical: "SD-WAN Manager (vManage)",
        working: "Manager holds configuration, policy and monitoring, and exposes the REST API.",
      },
      {
        kind: "text",
        prompt: "SD-WAN: which protocol carries routes, TLOCs and policy between Controllers and edges? (acronym)",
        accept: ["OMP", "overlay management protocol"],
        canonical: "OMP",
        working: "Overlay Management Protocol runs inside DTLS/TLS control connections.",
      },
      {
        kind: "text",
        prompt: "SD-Access: which protocol is the fabric control plane?",
        accept: ["LISP"],
        canonical: "LISP",
        working: "Edge nodes register endpoints with the LISP control-plane node.",
      },
      {
        kind: "text",
        prompt: "SD-Access: which encapsulation is the data plane?",
        accept: ["VXLAN", "VXLAN-GPO", "vxlan gpo"],
        canonical: "VXLAN",
        working: "VXLAN (with the Group Policy Option) carries the VN and the SGT.",
      },
      {
        kind: "text",
        prompt: "SD-Access: what tag does the policy plane use for group-based access? (acronym)",
        accept: ["SGT", "scalable group tag", "security group tag"],
        canonical: "SGT",
        working: "Scalable Group Tags from Cisco TrustSec, assigned by ISE when the endpoint authenticates.",
      },
      {
        kind: "text",
        prompt: "Which Cisco product authenticates endpoints and assigns their group in SD-Access? (acronym)",
        accept: ["ISE", "identity services engine", "cisco ise"],
        canonical: "ISE",
        working: "Identity Services Engine provides 802.1X/MAB authentication and SGT assignment.",
      },
      {
        kind: "choice",
        prompt: "In Catalyst Center, where do you define the site hierarchy, IP pools and DNS/NTP settings?",
        choices: ["Design", "Policy", "Provision", "Assurance"],
        answer: 0,
        working: "Design is the first workflow: sites, settings and pools. Policy, Provision and Assurance build on it.",
      },
    ],
    takeaway: "SD-WAN splits orchestration (Validator), control (Controller), management (Manager) and data (edges). SD-Access maps control, data and policy to LISP, VXLAN and SGT, with Catalyst Center and ISE on top.",
  },
  {
    id: "desk-secure-ops",
    exam: "encor",
    area: "desk",
    objective: "6.7",
    also: ["5.3", "5.4"],
    title: "Secure the API, pick the tool, name the control",
    brief: "Review an automation proposal for security and tooling: how credentials travel, which orchestration tool fits network devices, and which security components the design relies on.",
    given: [
      ["Targets", "IOS XE routers and switches, no agents allowed"],
      ["Proposal", "nightly configuration push from a CI pipeline"],
    ],
    steps: [
      {
        kind: "text",
        prompt: "Which orchestration tool is agentless, pushes over SSH and uses YAML playbooks?",
        accept: ["Ansible"],
        canonical: "Ansible",
        working: "Ansible runs from a control node and only needs SSH (or an API) on the device.",
      },
      {
        kind: "text",
        prompt: "Which Ansible file lists the devices and groups a playbook can target?",
        accept: ["inventory", "inventory file", "hosts", "hosts file"],
        canonical: "inventory",
        working: "The inventory (INI or YAML) defines hosts, groups and their variables.",
      },
      {
        kind: "choice",
        prompt: "Puppet and Chef traditionally work in which model?",
        choices: ["Agents pull their configuration from a server", "The server pushes over SSH with no agent", "They only read state", "They use SNMP sets"],
        answer: 0,
        working: "Agent-based pull. That's harder on network OSes that can't run the agent.",
      },
      {
        kind: "text",
        prompt: "Which HTTP request header carries an OAuth 2.0 bearer token?",
        accept: ["Authorization", "Authorization: Bearer"],
        canonical: "Authorization",
        working: "Authorization: Bearer <token>. Always over HTTPS.",
      },
      {
        kind: "choice",
        prompt: "Where should the pipeline keep the device and API credentials?",
        choices: ["In a secrets manager or protected CI variables, injected at run time", "In the playbook in Git", "In the device banner", "In a shared spreadsheet"],
        answer: 0,
        working: "Keep secrets out of code. Rotate them, and use per-pipeline accounts with least privilege.",
      },
      {
        kind: "text",
        prompt: "Which IEEE 802.1AE technology encrypts traffic hop by hop on Ethernet links?",
        accept: ["MACsec", "802.1ae"],
        canonical: "MACsec",
        working: "MACsec encrypts at Layer 2 between directly connected devices. TrustSec adds SGT-based policy.",
      },
      {
        kind: "choice",
        prompt: "What does a next-generation firewall add over a stateful packet filter?",
        choices: ["Application awareness, user identity and integrated intrusion prevention", "Only faster ACL lookups", "Routing protocol support", "DHCP services"],
        answer: 0,
        working: "NGFWs classify applications and users and inspect content (IPS, malware), not just ports and addresses.",
      },
    ],
    takeaway: "Agentless push tools suit network devices. Whatever the tool, credentials belong in a vault, tokens travel over HTTPS in the Authorization header, and the network design adds layered controls (NGFW, endpoint, TrustSec, MACsec).",
  },
];
