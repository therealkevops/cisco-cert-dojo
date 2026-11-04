import type { Question } from "../types";

// ENCOR question bank, part A: 1.0 Architecture and 2.0 Virtualization.

export const encorBankA: Question[] = [
  // 1.1.a design
  {
    id: "e-101",
    objective: "1.1.a",
    kind: "single",
    prompt: "A campus moves the Layer 3 boundary from the distribution switches down to the access switches. What is the main benefit?",
    choices: ["STP stops blocking uplinks; both forward with ECMP", "VLANs can then span every access switch freely", "No routing protocol is needed between the layers", "FHRPs can load-balance hosts across both uplinks"],
    answer: 0,
    explain: "Routed access makes the access–distribution links Layer 3, so there is no STP blocking and both uplinks are used with equal-cost multipath. The trade-off is that VLANs can't stretch across access switches.",
  },
  {
    id: "e-102",
    objective: "1.1.a",
    kind: "multi",
    prompt: "Which TWO functions belong in the distribution layer of a three-tier campus?",
    choices: ["Route summarisation toward the core", "PoE for IP phones", "Policy such as inter-VLAN ACLs", "High-speed transport only, with no policy", "Port security on user ports"],
    answer: [0, 2],
    explain: "Distribution aggregates access blocks, summarises and applies policy. PoE and port security are access-layer jobs; the core should only switch fast.",
  },
  {
    id: "e-103",
    objective: "1.1.a",
    kind: "single",
    prompt: "In a spine-leaf fabric, how many hops does traffic between any two leaf switches take?",
    choices: ["Two: leaf, spine, leaf", "One: leaf to leaf directly", "Three: leaf, spine, spine, leaf", "It depends on which spine STP elects as root"],
    answer: 0,
    explain: "Every leaf connects to every spine and leaves don't interconnect, so any leaf-to-leaf path is leaf → spine → leaf. That gives predictable latency and ECMP across all spines.",
  },
  {
    id: "e-104",
    objective: "1.1.a",
    kind: "multi",
    prompt: "Which TWO statements about IaaS are true?",
    choices: ["The customer manages the guest operating system", "The provider manages the physical hosts", "The provider patches the customer's applications", "The customer manages the hypervisor layer", "The customer has no control over networking"],
    answer: [0, 1],
    explain: "IaaS gives the customer the OS and everything above it; the provider runs the hardware and virtualisation. Customers usually control virtual networks too.",
  },
  {
    id: "e-105",
    objective: "1.1.a",
    kind: "single",
    prompt: "Why should the campus core avoid features such as ACL filtering and QoS remarking?",
    choices: ["They add processing and complexity where speed matters", "Core platforms don't support ACLs or QoS at line rate", "They break OSPF adjacencies between core switches", "They're only licensed on access-layer switches"],
    answer: 0,
    explain: "The core's job is high-speed, highly available transport between blocks. Policy belongs at the edges (access/distribution) where it scales better and failures are contained.",
  },
  {
    id: "e-106",
    objective: "1.1.b",
    kind: "single",
    prompt: "Two distribution switches run StackWise Virtual. What does an access switch gain from this compared with two independent distribution switches?",
    choices: ["One multichassis EtherChannel to both, with no STP blocking", "Access switches no longer need any uplinks to distribution", "It can run VRRP between the distribution switches instead", "It receives PoE from the distribution layer for its ports"],
    answer: 0,
    explain: "StackWise Virtual (like VSS) makes the pair one logical switch, so an access switch can run one EtherChannel across both. Both links forward and STP sees a single link.",
  },
  {
    id: "e-107",
    objective: "1.1.b",
    kind: "single",
    prompt: "A router with dual route processors has SSO and NSF configured. Its OSPF neighbour does not support graceful restart. What happens during a switchover?",
    choices: ["Forwarding continues, but the neighbour resets the adjacency", "Forwarding and the OSPF adjacency both survive the switchover", "The router reloads completely and rebuilds all of its tables", "Traffic is dropped until the standby RP has finished booting"],
    answer: 0,
    explain: "NSF only keeps the adjacency if the neighbour is NSF-aware (graceful restart helper). Otherwise the neighbour sees hellos stop and tears the adjacency down, causing reconvergence.",
  },
  {
    id: "e-108",
    objective: "1.1.b",
    kind: "single",
    prompt: "Which design gives the fastest default-gateway failover for hosts without any host reconfiguration?",
    choices: ["An FHRP such as HSRP or VRRP with tuned timers", "DHCP handing out two default gateways to hosts", "Static default routes configured on every host", "Proxy ARP answered by both distribution switches"],
    answer: 0,
    explain: "FHRPs provide a virtual gateway IP and MAC that move between routers. With sub-second hello/hold timers (or BFD), failover is fast and invisible to hosts.",
  },
  // 1.2 SD-WAN
  {
    id: "e-109",
    objective: "1.2",
    kind: "single",
    prompt: "In Catalyst SD-WAN, what is a TLOC?",
    choices: ["An OMP route for a WAN attachment (system IP, color, encap)", "A tunnel between two SD-WAN Controllers kept for redundancy", "A licence token assigned to a WAN Edge during onboarding", "The local loopback the WAN Edge uses for its management plane"],
    answer: 0,
    explain: "A transport locator (TLOC) identifies an edge's attachment to a transport: system IP + color (e.g. mpls, biz-internet) + encapsulation. IPsec tunnels are built between TLOCs.",
  },
  {
    id: "e-110",
    objective: "1.2",
    kind: "single",
    prompt: "All SD-WAN Controllers (vSmart) fail. What happens to existing data-plane tunnels between WAN Edges?",
    choices: ["They keep forwarding on last known routes until the timer expires", "They drop immediately, because no controller distributes the keys", "They fail over to the SD-WAN Validator for their route updates", "They fall back to unencrypted GRE until a controller comes back"],
    answer: 0,
    explain: "Controllers are not in the data path. With OMP graceful restart, edges keep forwarding with cached state for a period (12 hours by default), so a controller outage doesn't stop traffic straight away.",
  },
  {
    id: "e-111",
    objective: "1.2",
    kind: "single",
    prompt: "Which SD-WAN feature moves an application's traffic to another transport when loss or latency on the current path breaks its SLA?",
    choices: ["Application-aware routing", "Zero-touch provisioning", "OMP route reflection", "Service chaining"],
    answer: 0,
    explain: "App-aware routing uses BFD measurements per tunnel and compares them with SLA classes. Traffic that violates its SLA is steered to a compliant path.",
  },
  {
    id: "e-112",
    objective: "1.2",
    kind: "single",
    prompt: "A new WAN Edge is shipped to a branch and plugged in with only an Internet circuit and no configuration beyond what PnP provides. Which overlay component does it contact first, and why?",
    choices: ["The SD-WAN Validator, to authenticate and learn the controllers", "The SD-WAN Manager, to download its complete device template", "The SD-WAN Controller, to receive its OMP routes and policies", "A peer WAN Edge, to build its first IPsec data-plane tunnel"],
    answer: 0,
    explain: "The Validator (vBond) authenticates the edge, tells it where the Manager and Controllers are and helps with NAT traversal. Templates and OMP come afterwards.",
  },
  {
    id: "e-113",
    objective: "1.2",
    kind: "multi",
    prompt: "Which TWO are genuine limitations or costs of SD-WAN compared with a traditional MPLS WAN?",
    choices: ["Dependency on controller and orchestration infrastructure", "No support for encrypting traffic between sites", "Tunnel and IPsec overhead in large full meshes", "Only one WAN transport can be active at a time", "Voice traffic can't be carried over the overlay"],
    answer: [0, 2],
    explain: "SD-WAN depends on its controllers and adds tunnel/IPsec overhead and scaling considerations. It does encrypt, uses multiple transports at once, and carries voice with SLA steering.",
  },
  // 1.3 SD-Access
  {
    id: "e-114",
    objective: "1.3",
    kind: "single",
    prompt: "In SD-Access, an endpoint moves from one edge node to another. What keeps its IP address and policy working?",
    choices: ["The new edge registers it with the control plane; all edges share the anycast gateway", "The endpoint gets a new DHCP lease and the policy server reassigns its group tag", "STP recalculates so that the endpoint's VLAN is extended to the new edge node", "The border node re-NATs the endpoint's address so traffic reaches the new edge"],
    answer: 0,
    explain: "Edges register endpoints (EIDs) with the LISP control plane node, and the anycast gateway is identical on all edges. The host keeps its IP and gateway and the SGT follows it.",
  },
  {
    id: "e-115",
    objective: "1.3",
    kind: "single",
    prompt: "Which SD-Access node connects the fabric to the Internet and other unknown networks?",
    choices: ["External border", "Internal border", "Edge node", "Intermediate node"],
    answer: 0,
    explain: "An external (default) border is the gateway of last resort for unknown destinations. An internal border connects to known networks such as the data centre.",
  },
  {
    id: "e-116",
    objective: "1.3",
    kind: "single",
    prompt: "What is the default underlay routing protocol when Catalyst Center builds an SD-Access underlay with LAN Automation?",
    choices: ["OSPF", "EIGRP", "IS-IS", "BGP"],
    answer: 2,
    explain: "LAN Automation provisions an IS-IS routed underlay. The overlay then uses LISP for control and VXLAN for data.",
  },
  {
    id: "e-117",
    objective: "1.3",
    kind: "single",
    prompt: "A contractor authenticates with 802.1X on an SD-Access edge port and is placed in the Contractors group, which may reach only the Internet. Which component assigns the group tag, and where is the policy enforced?",
    choices: ["ISE assigns the SGT; the egress edge or border enforces SGACLs", "Catalyst Center assigns the SGT; the control-plane node enforces it", "The edge node assigns the SGT from the VLAN; ISE enforces it", "The border node assigns the SGT; the fabric WLC enforces it"],
    answer: 0,
    explain: "ISE returns the SGT in the authorisation result. The tag travels in the VXLAN header, and SGACLs are applied where the traffic leaves the fabric.",
  },
  // 1.4 QoS
  {
    id: "e-118",
    objective: "1.4",
    kind: "single",
    prompt: "Refer to the exhibit. What happens to voice traffic above 10% of the link when the interface is congested?",
    exhibit: `class-map match-all VOICE
 match dscp ef
policy-map WAN
 class VOICE
  priority percent 10
 class class-default
  fair-queue
interface GigabitEthernet0/0
 service-policy output WAN`,
    choices: ["It's dropped by the priority queue's implicit policer", "It's buffered until bandwidth frees up for the queue", "It's remarked to AF41 and sent with the video class", "It falls back into class-default with best-effort service"],
    answer: 0,
    explain: "LLQ's `priority` has an implicit policer during congestion, so excess EF traffic is dropped. That stops the priority queue from starving other classes.",
  },
  {
    id: "e-119",
    objective: "1.4",
    kind: "single",
    prompt: "What decimal DSCP value is CS3?",
    choices: ["16", "24", "26", "32"],
    answer: 1,
    explain: "Class selector values are 8 × n: CS3 = 24. It is commonly used for call signalling. AF31 is 26.",
  },
  {
    id: "e-120",
    objective: "1.4",
    kind: "single",
    prompt: "Between AF31 and AF33, which is dropped first by WRED during congestion?",
    choices: ["AF31", "AF33", "Both equally", "Neither: AF classes are never dropped"],
    answer: 1,
    explain: "The second digit is drop precedence. AF33 (high drop precedence) is discarded before AF31 within the same class.",
  },
  {
    id: "e-121",
    objective: "1.4",
    kind: "single",
    prompt: "Refer to the exhibit. Which statement is correct?",
    exhibit: `policy-map SHAPE
 class class-default
  shape average 50000000
interface GigabitEthernet0/1
 service-policy input SHAPE`,
    choices: ["The policy is rejected: shaping is outbound only", "Traffic is shaped to 50 Mb/s as it arrives", "Traffic is policed to 50 Mb/s as it arrives", "The shaper delays traffic in the opposite direction"],
    answer: 0,
    explain: "Shaping queues excess traffic for later transmission, which only makes sense on egress. IOS rejects a shape action in an input policy.",
  },
  {
    id: "e-122",
    objective: "1.4",
    kind: "single",
    prompt: "Where should the QoS trust boundary normally be placed for a desk with an IP phone and a PC?",
    choices: ["At the access port, extended to the phone", "At the WAN router facing the provider edge", "At the distribution switch uplink ports", "At the PC's network adapter, via its driver"],
    answer: 0,
    explain: "Classify and mark as close to the source as possible. Trusting the phone (conditionally, e.g. via CDP) while not trusting the PC behind it is the standard design.",
  },
  {
    id: "e-123",
    objective: "1.4",
    kind: "multi",
    prompt: "Which TWO statements about policing are true?",
    choices: ["It can be applied inbound or outbound", "It always buffers traffic above the rate", "Excess traffic can be dropped or remarked", "It only works inside class-default", "It adds jitter to conforming traffic"],
    answer: [0, 2],
    explain: "A policer meters traffic and drops or remarks what exceeds the rate. It works in either direction and doesn't queue, so it adds no delay.",
  },
  {
    id: "e-124",
    objective: "1.4",
    kind: "single",
    prompt: "A class uses `bandwidth percent 30`. What does this guarantee?",
    choices: ["At least 30% during congestion, with unused bandwidth shared", "A strict-priority queue that is limited to 30% of the interface", "A hard cap of 30% that applies even when the link is idle", "Remarking of any traffic above 30% to a lower-priority class"],
    answer: 0,
    explain: "CBWFQ `bandwidth` is a minimum guarantee under congestion. It is not a cap: when the link is idle the class can use more.",
  },
  // 2.1 virtualization
  {
    id: "e-125",
    objective: "2.1",
    kind: "single",
    prompt: "What is the role of a virtual switch inside a hypervisor host?",
    choices: ["Connects VM vNICs to each other and to physical NICs", "Replaces the physical access switch for the host", "Routes traffic between VMs on different subnets only", "Encrypts traffic between VMs on the same host"],
    answer: 0,
    explain: "The vSwitch forwards frames between vNICs and uplinks to physical NICs, typically tagging VLANs (port groups) toward a trunk on the physical switch.",
  },
  {
    id: "e-126",
    objective: "2.1",
    kind: "multi",
    prompt: "Which TWO statements about containers, compared with virtual machines, are true?",
    choices: ["Containers share the host's OS kernel", "Containers usually start in seconds", "Each container runs a full guest OS", "Containers need a Type 1 hypervisor", "VMs share the host kernel with each other"],
    answer: [0, 1],
    explain: "Containers isolate processes on a shared kernel, so they're small and start quickly. VMs each run their own OS on a hypervisor.",
  },
  {
    id: "e-127",
    objective: "2.1",
    kind: "single",
    prompt: "A VM's vNIC is in port group VLAN 20, but the host uplink connects to an access port in VLAN 10. What is the result?",
    choices: ["Tagged VLAN 20 frames are dropped; the uplink must be a trunk", "The VM works normally in VLAN 20 through the access port", "The VM is moved into VLAN 10 automatically and keeps working", "The hypervisor rewrites the tag from 20 to 10 on the way out"],
    answer: 0,
    explain: "With virtual switch tagging, the uplink carries 802.1Q tags, so the physical switch port must be a trunk that allows those VLANs.",
  },
  // 2.2.a VRF
  {
    id: "e-128",
    objective: "2.2.a",
    kind: "single",
    prompt: "Refer to the exhibit. Why does `ping 10.50.0.2` fail even though 10.50.0.2 is directly connected?",
    exhibit: `R1# show run interface Gi0/2
interface GigabitEthernet0/2
 vrf forwarding BLUE
 ip address 10.50.0.1 255.255.255.0
R1# ping 10.50.0.2
.....`,
    choices: ["The ping uses the global table; use `ping vrf BLUE`", "The interface in VRF BLUE is administratively down", "VRFs drop ICMP to directly connected neighbours", "The interface has the wrong subnet mask configured"],
    answer: 0,
    explain: "Without `vrf BLUE`, the router looks up 10.50.0.2 in the global routing table, where it doesn't exist. Every show and ping must name the VRF.",
  },
  {
    id: "e-129",
    objective: "2.2.a",
    kind: "single",
    prompt: "Refer to the exhibit. What happens when this configuration is applied?",
    exhibit: `vrf definition CUST-A
 address-family ipv4
vrf definition CUST-B
 address-family ipv4
!
interface GigabitEthernet0/1
 vrf forwarding CUST-A
 ip address 192.168.1.1 255.255.255.0
interface GigabitEthernet0/2
 vrf forwarding CUST-B
 ip address 192.168.1.1 255.255.255.0`,
    choices: ["Both are accepted; each VRF has its own routing table", "Gi0/2 is rejected with an overlapping-address error message", "Both are accepted, but only Gi0/1 forwards traffic", "Both are rejected until each VRF has an RD set"],
    answer: 0,
    explain: "Each VRF is a separate routing and forwarding table, so the same subnet (even the same address) can exist in both. VRF-lite doesn't need route distinguishers.",
  },
  {
    id: "e-130",
    objective: "2.2.a",
    kind: "cli",
    prompt: "Show the routing table of VRF BLUE.",
    context: "R1#",
    accept: ["sh|ow ip ro|ute vrf BLUE"],
    canonical: "show ip route vrf BLUE",
    explain: "VRF tables are separate: `show ip route` shows only the global table.",
  },
  {
    id: "e-131",
    objective: "2.2.a",
    kind: "single",
    prompt: "What is the difference between VRF-lite and MPLS L3VPN?",
    choices: ["VRF-lite separates VRFs hop by hop without MPLS or MP-BGP", "VRF-lite can't carry overlapping addresses between VRFs", "MPLS L3VPN doesn't use VRFs on the provider edge", "VRF-lite needs MP-BGP; MPLS L3VPN uses static routes"],
    answer: 0,
    explain: "VRF-lite needs a separate interface or subinterface per VRF on every hop. MPLS L3VPN carries VRFs across a shared core with labels and MP-BGP route targets.",
  },
  // 2.2.b GRE/IPsec
  {
    id: "e-132",
    objective: "2.2.b",
    kind: "single",
    prompt: "Refer to the exhibit. The tunnel is up/down. What is the most likely cause?",
    exhibit: `interface Tunnel0
 ip address 172.16.0.1 255.255.255.252
 tunnel source GigabitEthernet0/0
 tunnel destination 203.0.113.2
R1# show ip route 203.0.113.2
% Network not in table`,
    choices: ["No route to the tunnel destination", "The tunnel IP has the wrong mask", "GRE keepalives aren't configured", "IPsec isn't applied to the tunnel"],
    answer: 0,
    explain: "A GRE tunnel's line protocol comes up only when the tunnel destination is reachable via the routing table (not via the tunnel itself).",
  },
  {
    id: "e-133",
    objective: "2.2.b",
    kind: "single",
    prompt: "A GRE tunnel without IPsec runs over a path with a 1500-byte MTU. Pings work, but large file transfers through the tunnel stall. Which settings fix it?",
    choices: ["ip mtu 1476 and ip tcp adjust-mss 1436 on the tunnel", "ip mtu 1500 and ip tcp adjust-mss 1460 on the tunnel", "ip mtu 1400 on the physical interface only", "tunnel mode gre multipoint on both of the ends"],
    answer: 0,
    explain: "GRE adds 24 bytes, leaving 1476 for the inner packet; subtracting 40 bytes of IP and TCP headers gives an MSS of 1436.",
  },
  {
    id: "e-134",
    objective: "2.2.b",
    kind: "single",
    prompt: "Which IKE phase builds the secure channel used to negotiate the IPsec SAs that protect data?",
    choices: ["IKE phase 1", "IKE phase 2", "Quick mode", "ESP transport mode"],
    answer: 0,
    explain: "Phase 1 authenticates the peers and builds a protected channel. Phase 2 (quick mode, or CREATE_CHILD_SA in IKEv2) negotiates the IPsec SAs that encrypt traffic.",
  },
  {
    id: "e-135",
    objective: "2.2.b",
    kind: "single",
    prompt: "Why is ESP used instead of AH when traffic crosses NAT?",
    choices: ["AH covers the outer IP header, which NAT changes", "ESP is faster to process than AH on most routers", "AH can't protect multicast traffic between peers", "ESP runs over TCP, which NAT devices handle well"],
    answer: 0,
    explain: "AH's integrity covers the IP header, so NAT breaks it. ESP doesn't protect the outer header, and with NAT-T it is wrapped in UDP 4500.",
  },
  {
    id: "e-136",
    objective: "2.2.b",
    kind: "cli",
    prompt: "Protect this tunnel interface with the IPsec profile named VPN.",
    context: "R1(config-if)#",
    accept: ["tun|nel prot|ection ip|sec pro|file VPN"],
    canonical: "tunnel protection ipsec profile VPN",
    explain: "`tunnel protection` applies IPsec to a GRE tunnel or a VTI, so you don't need a crypto map.",
  },
  {
    id: "e-137",
    objective: "2.2.b",
    kind: "single",
    prompt: "What does `tunnel mode ipsec ipv4` create?",
    choices: ["A static VTI carrying only IPsec-protected IPv4", "A GRE tunnel with an IPsec profile applied to it", "A DMVPN hub interface that spokes register with", "A crypto map applied to the physical interface"],
    answer: 0,
    explain: "A VTI uses IPsec encapsulation directly, without GRE. Routing protocols can run over it because it is an interface.",
  },
  // 2.3.a LISP
  {
    id: "e-138",
    objective: "2.3.a",
    kind: "single",
    prompt: "An ITR receives a packet for an EID it has no mapping for. What does it do?",
    choices: ["Sends a Map-Request, then encapsulates to the RLOC", "Drops it permanently until an ETR registers the EID", "Floods it to every ETR in the LISP site for delivery", "Forwards it natively without any LISP encapsulation"],
    answer: 0,
    explain: "The ITR asks the Map-Resolver. The request is forwarded to the authoritative ETR (via the Map-Server), which replies with its RLOC, and the ITR caches it.",
  },
  {
    id: "e-139",
    objective: "2.3.a",
    kind: "single",
    prompt: "Which LISP component lets a LISP site communicate with a non-LISP site on the Internet?",
    choices: ["Map-Server", "PITR / PETR", "xTR", "Map-Resolver"],
    answer: 1,
    explain: "Proxy ITRs attract traffic from non-LISP sites toward LISP EIDs. Proxy ETRs decapsulate LISP traffic headed to non-LISP sites.",
  },
  {
    id: "e-140",
    objective: "2.3.a",
    kind: "single",
    prompt: "What is the main scalability benefit of LISP's identity/location split?",
    choices: ["Routers hold mappings only for active conversations", "It removes the need for IP addressing on the hosts", "It replaces BGP routing between autonomous systems", "It encrypts all traffic flowing between LISP sites"],
    answer: 0,
    explain: "LISP uses a pull-based mapping system, so ITRs cache only the EID-to-RLOC mappings they need. Endpoints can move without renumbering.",
  },
  // 2.3.b VXLAN
  {
    id: "e-141",
    objective: "2.3.b",
    kind: "single",
    prompt: "In a VXLAN EVPN fabric, what does BGP EVPN replace?",
    choices: ["Flood-and-learn MAC learning", "The VXLAN data-plane encapsulation", "The underlay routing protocol", "802.1Q tagging on host ports"],
    answer: 0,
    explain: "EVPN is the control plane. VTEPs advertise MAC and IP routes (type 2) in MP-BGP instead of learning them by flooding, which reduces BUM traffic.",
  },
  {
    id: "e-142",
    objective: "2.3.b",
    kind: "single",
    prompt: "Hosts send standard 1500-byte frames in a VXLAN fabric with an IPv4 underlay. What is the minimum underlay IP MTU, and why?",
    choices: ["1550: VXLAN adds 50 bytes of outer headers", "1524: VXLAN adds 24 bytes of outer headers", "1500: the VTEP fragments anything larger", "9216: VXLAN requires jumbo frames by design"],
    answer: 0,
    explain: "Outer Ethernet (14), IP (20), UDP (8) and VXLAN (8) add 50 bytes. In practice the underlay is usually set to 9216 for headroom, but 1550 is the minimum.",
  },
  {
    id: "e-143",
    objective: "2.3.b",
    kind: "single",
    prompt: "How many segments does the VXLAN Network Identifier allow?",
    choices: ["About 16 million", "4,094", "65,535", "About 1 million"],
    answer: 0,
    explain: "The VNI is 24 bits: 2^24 ≈ 16.7 million segments, compared with 12 bits (4094 usable) for 802.1Q VLANs.",
  },
  {
    id: "e-144",
    objective: "2.3.b",
    kind: "multi",
    prompt: "Which TWO methods can a VXLAN fabric use to deliver BUM (broadcast, unknown unicast, multicast) traffic?",
    choices: ["Underlay multicast groups", "Ingress (head-end) replication", "Spanning tree on the overlay", "Proxy ARP on the spines", "802.1Q double tagging"],
    answer: [0, 1],
    explain: "BUM traffic is sent either to a multicast group per VNI in the underlay, or replicated as unicast to each remote VTEP by the ingress VTEP.",
  },
  {
    id: "e-145",
    objective: "2.3.b",
    kind: "single",
    prompt: "Where does the VTEP function usually live in a data-centre VXLAN fabric?",
    choices: ["On the leaf switches", "On the spine switches", "On the hosts' NICs only", "On the border firewalls"],
    answer: 0,
    explain: "Leaves are the VTEPs that encapsulate host traffic. Spines just route the underlay IP packets.",
  },
];
