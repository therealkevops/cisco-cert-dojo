import type { Exam } from "../types";
import { encorBankA } from "./encor-bank-a";
import { encorBankB } from "./encor-bank-b";
import { encorBankC } from "./encor-bank-c";
import { encorBankD } from "./encor-bank-d";
import { encorBankE } from "./encor-bank-e";
import { encorBankF } from "./encor-bank-f";
import { encorBankG } from "./encor-bank-g";

// Blueprint: Implementing Cisco Enterprise Network Core Technologies v1.2 (350-401).
// Domain numbering and weights follow Cisco's published exam topics PDF.

export const encor: Exam = {
  id: "encor",
  code: "350-401",
  short: "ENCOR",
  name: "Implementing Cisco Enterprise Network Core Technologies",
  version: "v1.2",
  minutes: 120,
  approxItems: 100,
  role: "core",
  blueprintUrl: "https://learningcontent.cisco.com/documents/marketing/exam-topics/350-401-ENCORE-v1.2.pdf",
  domains: [
    {
      id: "1.0",
      name: "Architecture",
      weight: 15,
      objectives: [
        {
          id: "1.1.a",
          title: "Enterprise design: 2-tier, 3-tier, fabric, cloud",
          brief:
            "Hierarchical design separates access, distribution and core so each layer can scale and fail independently. A collapsed core (2-tier) merges core and distribution for smaller campuses. Fabric designs replace STP-bound L2 with a routed underlay plus an overlay.",
          keys: [
            "3-tier: access (endpoints, PoE, port security) → distribution (policy, L2/L3 boundary, summarisation) → core (fast transport, no policy).",
            "2-tier / collapsed core: distribution and core share one layer. Fine for a single building or a small campus.",
            "Routed access pushes the L3 boundary down to the access switch, which removes STP from the uplinks and gives ECMP.",
            "Fabric: a routed underlay (IS-IS/OSPF) with an overlay (VXLAN data plane, LISP or BGP EVPN control plane). SD-Access is Cisco's campus fabric.",
            "Cloud designs: IaaS/PaaS/SaaS. Connectivity can be Internet VPN, a colocation direct connect, or SD-WAN cloud onramp.",
          ],
          trap: "The core layer should not do CPU-heavy policy like ACL filtering or QoS marking. That work belongs at distribution or access.",
        },
        {
          id: "1.1.b",
          title: "High availability: redundancy, FHRP, SSO",
          brief:
            "HA means removing single points of failure and making failover fast. Redundant links and devices give paths, FHRPs give a resilient default gateway, and SSO/NSF keep a chassis forwarding through a supervisor switchover.",
          keys: [
            "SSO (Stateful Switchover) syncs state from the active supervisor to the standby, so the standby takes over without resetting line cards.",
            "NSF (Non-Stop Forwarding) keeps forwarding on the existing FIB while the control plane restarts. Neighbours must be NSF-aware to keep adjacencies.",
            "StackWise Virtual and VSS make two chassis act as one logical switch, which allows multichassis EtherChannel.",
            "FHRP (HSRP, VRRP, GLBP) gives hosts one virtual gateway IP that survives a router failure.",
          ],
          trap: "SSO on its own does not keep routing adjacencies up. You need NSF (graceful restart) together with SSO.",
        },
        {
          id: "1.2",
          title: "Catalyst SD-WAN working principles",
          brief:
            "Catalyst SD-WAN (formerly Viptela) splits the WAN into orchestration, management, control and data planes. Edge routers build IPsec tunnels over any transport, and centralised policy steers traffic by application SLA.",
          keys: [
            "SD-WAN Validator (vBond): orchestration plane. It authenticates devices first, helps with NAT traversal, and tells edges where the controllers are.",
            "SD-WAN Manager (vManage): management plane. GUI, templates, monitoring, REST API.",
            "SD-WAN Controller (vSmart): control plane. Runs OMP with the edges and distributes routes, TLOCs and policy. It is not in the data path.",
            "WAN Edge (cEdge/vEdge): data plane. Builds IPsec tunnels between TLOCs. BFD runs inside the tunnels to measure loss, latency and jitter.",
            "OMP (Overlay Management Protocol) carries routes, TLOCs and service routes between edges and controllers over DTLS/TLS.",
            "Benefits: transport independence, app-aware routing, zero-touch provisioning. Limitations: controller dependence, licensing cost, and tunnel overhead in large full meshes.",
          ],
          trap: "vSmart controllers never forward user traffic. They only push routes and policy over OMP.",
        },
        {
          id: "1.3",
          title: "SD-Access working principles",
          brief:
            "SD-Access is the campus fabric. It uses LISP for the control plane, VXLAN-GPO for the data plane, and Cisco TrustSec SGTs for policy, with Catalyst Center managing it and ISE for identity.",
          keys: [
            "Control plane node: the LISP Map-Server/Map-Resolver. It holds the EID-to-RLOC mapping database.",
            "Edge node: the access switch. It registers endpoints and is the anycast gateway for its subnets.",
            "Border node: connects the fabric to the outside. Internal borders lead to known networks, external borders to unknown networks and the Internet.",
            "The VXLAN header carries the VN (VRF) in the VNI and the SGT in the Group Policy ID field.",
            "Underlay: routed IS-IS by default (LAN Automation). Overlay: LISP + VXLAN.",
            "Traditional campus interop: through the border node, with fusion routers handing VRFs to shared services. Layer 2 handoff lets legacy VLANs move gradually.",
          ],
          trap: "In SD-Access the data plane is VXLAN and the control plane is LISP. Do not swap them.",
        },
        {
          id: "1.4",
          title: "Interpret QoS configurations",
          brief:
            "QoS on IOS XE uses MQC: class-maps classify, policy-maps act, and service-policy attaches the policy to an interface in one direction. Know what the config does, and the DSCP values by heart.",
          keys: [
            "Marking: DSCP EF (46) for voice, AF41 (34) for interactive video, CS3 (24) for call signalling, CS6 (48) for network control.",
            "AFxy: x is the class (1-4), y is the drop precedence (1 low, 3 high). DSCP = 8x + 2y.",
            "priority = LLQ (strict priority with an implicit policer when congested). bandwidth = CBWFQ minimum guarantee.",
            "Policing drops or remarks excess traffic and can be applied in either direction. Shaping buffers excess and is outbound only.",
            "Trust boundary: set it as close to the endpoint as you can, such as an IP phone with a conditional trust.",
          ],
          cli: `class-map match-any VOICE
 match dscp ef
policy-map WAN-EDGE
 class VOICE
  priority percent 10
 class class-default
  fair-queue
interface Gi0/0
 service-policy output WAN-EDGE`,
          trap: "Shaping only works outbound. A policy with `shape` cannot be applied with `service-policy input`.",
        },
      ],
    },
    {
      id: "2.0",
      name: "Virtualization",
      weight: 10,
      objectives: [
        {
          id: "2.1",
          title: "Device virtualization: hypervisors, VMs, vSwitches",
          brief:
            "A hypervisor shares physical compute between virtual machines. Type 1 runs on bare metal and Type 2 runs as an application on a host OS. Virtual switches connect VMs to each other and to the physical NICs.",
          keys: [
            "Type 1 (bare metal): ESXi, KVM, Hyper-V. Lower overhead, used in production.",
            "Type 2 (hosted): VirtualBox, VMware Workstation. Runs on top of Windows, macOS or Linux.",
            "A VM includes virtual CPU, RAM, NICs and disks, plus a guest OS that is isolated from other VMs.",
            "Virtual switches: vSphere Standard/Distributed Switch, Open vSwitch, Linux bridge. They support VLAN tagging and uplink teaming.",
            "Containers share the host kernel and are lighter than VMs, but they are not hypervisor virtualisation.",
          ],
          trap: "KVM is a Type 1 hypervisor even though it runs inside Linux, because the kernel itself becomes the hypervisor.",
        },
        {
          id: "2.2.a",
          title: "VRF (VRF-lite)",
          brief:
            "A VRF creates a separate routing table on one router, so overlapping address space and isolated tenants are possible. VRF-lite does this without MPLS by putting interfaces into VRFs hop by hop.",
          keys: [
            "Modern syntax: `vrf definition NAME` + `address-family ipv4`. Legacy is `ip vrf NAME`.",
            "Applying `vrf forwarding NAME` to an interface removes its IP address, so you must configure the IP again.",
            "Verify with `show ip route vrf NAME`, `show vrf`, and `ping vrf NAME x.x.x.x`.",
            "Routing protocols run per VRF, for example `router ospf 10 vrf BLUE`.",
          ],
          cli: `vrf definition BLUE
 address-family ipv4
interface Gi0/1
 vrf forwarding BLUE
 ip address 10.1.1.1 255.255.255.0`,
          trap: "Put the interface in the VRF first, then configure the IP. Doing it in the other order deletes the address.",
        },
        {
          id: "2.2.b",
          title: "GRE and IPsec tunneling",
          brief:
            "GRE wraps any protocol (including multicast and routing protocols) in IP, but it does not encrypt. IPsec encrypts, but on its own it only carries unicast IP. GRE over IPsec, or an IPsec VTI, gives you both.",
          keys: [
            "GRE adds 24 bytes (20 new IP + 4 GRE), so `ip mtu 1476` is common on the tunnel. Add more headroom when IPsec is used too.",
            "A tunnel interface needs a tunnel source and a tunnel destination, and the destination must be reachable through the underlay. If it is reachable through the tunnel itself, you get recursive routing.",
            "IPsec: IKE (v1 or v2) builds the SAs, ESP (protocol 50) encrypts and authenticates, AH (51) authenticates only.",
            "Tunnel mode encapsulates the whole original packet. Transport mode protects only the payload.",
            "A VTI (`tunnel mode ipsec ipv4`) is a routable interface protected by `tunnel protection ipsec profile`.",
          ],
          cli: `interface Tunnel0
 ip address 172.16.0.1 255.255.255.252
 tunnel source Gi0/0
 tunnel destination 203.0.113.2
 tunnel protection ipsec profile VPN`,
          trap: "Recursive routing (\"%TUN-5-RECURDOWN\") happens when the tunnel destination is learned through the tunnel.",
        },
        {
          id: "2.3.a",
          title: "LISP",
          brief:
            "LISP splits identity (EID) from location (RLOC). A mapping system answers where an EID lives, so routers only keep the mappings they actually need.",
          keys: [
            "EID = endpoint identifier (host prefix). RLOC = routing locator (the IP of the xTR).",
            "ITR encapsulates traffic towards a remote RLOC. ETR decapsulates and registers EIDs with the Map-Server. xTR does both.",
            "Map-Server (MS) receives Map-Register messages. Map-Resolver (MR) answers Map-Requests from ITRs.",
            "PITR/PETR connect LISP sites to non-LISP sites.",
            "Data plane: UDP 4341. Control plane: UDP 4342.",
          ],
          trap: "An ETR sends Map-Register to the Map-Server, while an ITR sends Map-Request to the Map-Resolver.",
        },
        {
          id: "2.3.b",
          title: "VXLAN",
          brief:
            "VXLAN tunnels Layer 2 frames inside UDP so L2 segments can stretch across a routed underlay. The 24-bit VNI allows about 16 million segments instead of 4094 VLANs.",
          keys: [
            "Encapsulation: outer Ethernet + outer IP + UDP (dst 4789) + VXLAN header (8 bytes, 24-bit VNI) + original frame. Roughly 50 bytes of overhead.",
            "A VTEP encapsulates and decapsulates. It is usually a loopback on a leaf switch.",
            "BUM traffic is handled by underlay multicast or ingress (head-end) replication.",
            "Control planes: flood-and-learn, BGP EVPN (data centre), LISP (SD-Access). VXLAN-GPO adds the SGT field.",
          ],
          trap: "VXLAN uses UDP 4789. LISP data plane uses UDP 4341. Know which number belongs to which.",
        },
      ],
    },
    {
      id: "3.0",
      name: "Infrastructure",
      weight: 30,
      objectives: [
        {
          id: "3.1.a",
          title: "802.1Q trunking (static and DTP)",
          brief:
            "Trunks carry multiple VLANs with an 802.1Q tag. The native VLAN is untagged. DTP can negotiate trunks, but best practice is to hardcode the mode and disable negotiation.",
          keys: [
            "DTP modes: `access`, `trunk`, `dynamic desirable` (actively asks), `dynamic auto` (passive). Auto + auto = access.",
            "`switchport nonegotiate` stops DTP frames. Use it with a static trunk.",
            "A native VLAN mismatch produces CDP errors and VLAN leaking. Allowed-list mismatches silently drop VLANs.",
            "Troubleshoot with `show interfaces trunk`, `show interfaces Gi1/0/1 switchport`, `show dtp`.",
          ],
          cli: `interface Gi1/0/1
 switchport mode trunk
 switchport nonegotiate
 switchport trunk native vlan 999
 switchport trunk allowed vlan 10,20,30`,
          trap: "`switchport trunk allowed vlan 40` replaces the list. Use `allowed vlan add 40` to append.",
        },
        {
          id: "3.1.b",
          title: "EtherChannel (static, LACP, PAgP)",
          brief:
            "EtherChannel bundles links into one logical port so STP sees one path and traffic is hashed across the members. Members must match speed, duplex, mode and VLAN config.",
          keys: [
            "LACP (802.3ad): `active` / `passive`. Passive + passive does not form a bundle.",
            "PAgP (Cisco): `desirable` / `auto`. Auto + auto does not form a bundle.",
            "`mode on` = static, with no negotiation. Both ends must be `on`.",
            "Load balancing is per flow, from a hash of src/dst MAC, IP or port (`port-channel load-balance`).",
            "Verify with `show etherchannel summary`. Flags: P = bundled, s = suspended, I = stand-alone, SU = L2 in use.",
          ],
          cli: `interface range Gi1/0/1 - 2
 channel-group 1 mode active`,
          trap: "Mixing LACP on one side with PAgP or `on` on the other does not form a bundle.",
        },
        {
          id: "3.1.c",
          title: "STP: RSTP, MST, root guard, BPDU guard",
          brief:
            "RSTP converges in seconds using proposal/agreement on point-to-point links. MST maps many VLANs to a few instances. Guard features protect the topology you designed.",
          keys: [
            "RSTP port roles: root, designated, alternate, backup. States: discarding, learning, forwarding.",
            "Root election: lowest bridge ID (priority + extended system ID + MAC). Priority goes up in steps of 4096.",
            "MST: name, revision and VLAN-to-instance map must match for switches to share a region. IST is instance 0.",
            "BPDU guard err-disables an edge (PortFast) port when it receives a BPDU.",
            "Root guard puts a port in root-inconsistent state when a superior BPDU arrives. Use it on downlinks to keep the root where it is.",
            "Loop guard stops an alternate or root port going to forwarding when BPDUs stop arriving.",
          ],
          cli: `spanning-tree mode rapid-pvst
spanning-tree vlan 10 root primary
interface Gi1/0/10
 spanning-tree portfast
 spanning-tree bpduguard enable`,
          trap: "Root guard recovers by itself once superior BPDUs stop. BPDU guard err-disables the port until it is recovered.",
        },
        {
          id: "3.2.a",
          title: "EIGRP vs OSPF concepts",
          brief:
            "EIGRP is an advanced distance vector protocol using DUAL. OSPF is link state using SPF over an LSDB. Compare them on metrics, load balancing, convergence and area design.",
          keys: [
            "EIGRP metric uses bandwidth and delay by default (K1 = K3 = 1). Successor = best path, feasible successor = loop-free backup that meets the feasibility condition.",
            "Feasibility condition: the neighbour's reported distance must be lower than the current feasible distance.",
            "EIGRP supports unequal-cost load balancing with `variance`. OSPF does equal-cost only.",
            "OSPF cost = reference bandwidth / interface bandwidth (default reference 100 Mbps, so set `auto-cost reference-bandwidth`).",
            "AD: EIGRP internal 90, external 170. OSPF 110. eBGP 20, iBGP 200.",
            "OSPF area types: backbone (0), standard, stub (no type 5), totally stubby (no 3/5), NSSA (type 7 instead of 5).",
          ],
          trap: "Only EIGRP can load-balance across unequal-cost paths, using `variance`.",
        },
        {
          id: "3.2.b",
          title: "OSPFv2/v3: multi-area, summarisation, filtering",
          brief:
            "OSPF builds adjacencies, floods LSAs and runs SPF. Multi-area designs contain flooding, and summarisation on ABRs or ASBRs shrinks tables. Network type changes DR/BDR behaviour.",
          keys: [
            "Adjacency requires matching area ID, hello/dead timers, authentication, subnet and mask (on broadcast), stub flags and MTU (for DBD exchange).",
            "Network types: broadcast elects a DR/BDR (hello 10s). Point-to-point has no DR. Hello/dead timers must match.",
            "`passive-interface` advertises the subnet but sends no hellos.",
            "Inter-area summary on the ABR: `area 1 range 10.1.0.0 255.255.0.0`. External summary on the ASBR: `summary-address`.",
            "Filtering: `area X filter-list prefix` (type 3 on the ABR), or `distribute-list in` (local RIB only, the LSDB is unchanged).",
            "OSPFv3 is enabled per interface (`ipv6 ospf 1 area 0`) and uses link-local addresses for neighbours.",
          ],
          cli: `router ospf 1
 router-id 1.1.1.1
 passive-interface default
 no passive-interface Gi0/0
 network 10.0.0.0 0.0.0.255 area 0
 area 1 range 10.1.0.0 255.255.0.0`,
          trap: "A neighbour stuck in EXSTART/EXCHANGE nearly always means an MTU mismatch.",
        },
        {
          id: "3.2.c",
          title: "eBGP: neighbours and best path",
          brief:
            "eBGP peers between autonomous systems over TCP 179. The best path algorithm walks a fixed list of attributes. Know the order and which direction each one influences.",
          keys: [
            "Neighbour states: Idle → Connect → Active → OpenSent → OpenConfirm → Established.",
            "eBGP default TTL is 1, so directly connected peers need nothing extra. Loopback peering needs `ebgp-multihop` (or `disable-connected-check`) plus `update-source`.",
            "Best path order: Weight (high, Cisco-only, local) → Local Preference (high) → Locally originated → AS-path (short) → Origin (i < e < ?) → MED (low) → eBGP over iBGP → lowest IGP metric to next hop → oldest eBGP → lowest router ID.",
            "Mnemonic: \"We Love Oranges AS Oranges Mean Pure Refreshment\": Weight, Local pref, Originate, AS path, Origin, MED, Paths (eBGP>iBGP), Router ID.",
            "`network` statements need an exact match in the RIB (prefix and mask).",
          ],
          cli: `router bgp 65001
 neighbor 192.0.2.2 remote-as 65002
 address-family ipv4
  network 10.10.0.0 mask 255.255.0.0
  neighbor 192.0.2.2 activate`,
          trap: "State \"Active\" means the TCP session is not coming up. It is not a healthy state.",
        },
        {
          id: "3.2.d",
          title: "Policy-based routing",
          brief:
            "PBR overrides the routing table for matching traffic. A route-map is applied to the ingress interface, matching an ACL and setting a next hop.",
          keys: [
            "Applied inbound only: `ip policy route-map NAME` on the interface where traffic arrives.",
            "Traffic that does not match falls back to normal routing. Traffic denied by the route-map is also routed normally.",
            "`set ip next-hop` takes priority over the RIB. `set ip default next-hop` is used only when the RIB has no explicit route.",
            "Locally generated traffic needs `ip local policy route-map`.",
          ],
          trap: "PBR has no effect on traffic leaving an interface. It is evaluated only on ingress.",
        },
        {
          id: "3.3.a",
          title: "NTP and PTP",
          brief:
            "NTP keeps clocks within milliseconds for logs, certificates and AAA. PTP (IEEE 1588) gets to sub-microsecond accuracy using hardware timestamping, for industrial networks, finance and 5G.",
          keys: [
            "Stratum = distance from the reference clock. Stratum 16 means unsynchronised.",
            "`ntp server` = client mode. `ntp peer` = symmetric. `ntp master` = act as an authoritative source.",
            "NTP authentication: `ntp authenticate`, `ntp authentication-key`, `ntp trusted-key`.",
            "PTP roles: grandmaster, boundary clock (terminates and regenerates), transparent clock (corrects residence time).",
            "Verify with `show ntp associations` (* = sys.peer) and `show ntp status`.",
          ],
          trap: "NTP authentication only works when the key is also listed with `ntp trusted-key`.",
        },
        {
          id: "3.3.b",
          title: "NAT / PAT",
          brief:
            "NAT translates addresses at a boundary. Static NAT maps one to one, dynamic NAT uses a pool, and PAT (overload) multiplexes many hosts onto one address using ports.",
          keys: [
            "Inside local = the private host address. Inside global = how outsiders see it.",
            "Mark interfaces with `ip nat inside` / `ip nat outside`.",
            "PAT: `ip nat inside source list ACL interface Gi0/0 overload`.",
            "Static port forward: `ip nat inside source static tcp 10.0.0.5 80 203.0.113.10 80`.",
            "Verify with `show ip nat translations` and `show ip nat statistics`. Clear with `clear ip nat translation *`.",
          ],
          cli: `access-list 1 permit 10.0.0.0 0.0.0.255
ip nat inside source list 1 interface Gi0/0 overload
interface Gi0/1
 ip nat inside
interface Gi0/0
 ip nat outside`,
          trap: "Without the `overload` keyword, a single-address NAT only translates one host at a time.",
        },
        {
          id: "3.3.c",
          title: "FHRP: HSRP and VRRP",
          brief:
            "FHRPs give hosts a virtual default gateway. HSRP is Cisco proprietary with active/standby roles. VRRP is an open standard with master/backup roles. Both elect on priority, then highest IP.",
          keys: [
            "HSRP: default priority 100, preemption off by default. v1 uses 224.0.0.2, v2 uses 224.0.0.102. Virtual MAC 0000.0c07.acXX (v1) or 0000.0c9f.fXXX (v2).",
            "VRRP: default priority 100, preemption on by default, 224.0.0.18. Virtual MAC 0000.5e00.01XX. The virtual IP can be a real interface IP (owner = priority 255).",
            "Object tracking lowers priority when an uplink fails: `standby 1 track 1 decrement 20`.",
            "GLBP load-balances across gateways with an AVG plus multiple AVFs.",
          ],
          cli: `interface Vlan10
 ip address 10.10.10.2 255.255.255.0
 standby version 2
 standby 10 ip 10.10.10.1
 standby 10 priority 110
 standby 10 preempt`,
          trap: "Preemption is off by default in HSRP and on by default in VRRP.",
        },
        {
          id: "3.3.d",
          title: "Multicast: RPF, PIM-SM, IGMP, SSM, Bidir, MSDP",
          brief:
            "Multicast sends one stream to many receivers. IGMP handles host signalling, PIM builds the distribution trees between routers, and the RPF check prevents loops.",
          keys: [
            "RPF check: the packet must arrive on the interface the router would use to reach the source (or the RP, for shared trees).",
            "PIM-SM: receivers join a shared tree (*,G) rooted at the RP. The last-hop router can switch to the shortest path tree (S,G).",
            "IGMPv2: host joins and leaves (leave = 224.0.0.2). IGMPv3 adds source filtering (include/exclude), which SSM needs.",
            "SSM (232.0.0.0/8): no RP, joins go straight to (S,G).",
            "Bidir-PIM: shared tree only, traffic flows both ways. It scales well for many-to-many.",
            "MSDP shares active-source information between RPs in different domains (or with Anycast RP).",
          ],
          trap: "SSM needs IGMPv3 on the receiver side because the host must name the source.",
        },
      ],
    },
    {
      id: "4.0",
      name: "Network Assurance",
      weight: 10,
      objectives: [
        {
          id: "4.1",
          title: "Diagnose with debugs, ping, traceroute, SNMP, syslog",
          brief:
            "Pick the right tool for the problem. Ping and traceroute test reachability and path, debugs show the control plane live (filter them with conditional debugs), and SNMP and syslog feed monitoring systems.",
          keys: [
            "Syslog severity: 0 emergencies, 1 alerts, 2 critical, 3 errors, 4 warnings, 5 notifications, 6 informational, 7 debugging. `logging trap 4` sends levels 0-4.",
            "Conditional debug: `debug condition interface Gi0/1` or `debug platform condition`. This limits the CPU impact.",
            "SNMPv3 security levels: noAuthNoPriv, authNoPriv, authPriv (encrypted). v2c uses community strings in clear text.",
            "SNMP traps are unacknowledged. Informs are acknowledged.",
            "Extended ping lets you set the source, size, DF bit and repeat count, which is useful for MTU tests.",
          ],
          trap: "A lower syslog number means more severe. `logging trap 4` includes levels 0 to 4.",
        },
        {
          id: "4.2",
          title: "Flexible NetFlow",
          brief:
            "Flexible NetFlow builds flow records from user-defined key fields. It is configured as record → exporter → monitor → interface.",
          keys: [
            "`flow record`: `match` defines key fields, `collect` defines non-key fields.",
            "`flow exporter`: destination, source, transport udp 2055 (or another port), version 9 or IPFIX.",
            "`flow monitor` ties together the record, the exporter and the cache timeouts.",
            "Apply with `ip flow monitor NAME input` (or output) on the interface.",
            "Verify with `show flow monitor NAME cache` and `show flow exporter statistics`.",
          ],
          cli: `flow record REC
 match ipv4 source address
 match ipv4 destination address
 collect counter bytes
flow exporter EXP
 destination 10.0.0.50
 transport udp 2055
flow monitor MON
 record REC
 exporter EXP
interface Gi0/1
 ip flow monitor MON input`,
          trap: "`match` fields make a flow unique. `collect` fields are only counted.",
        },
        {
          id: "4.3",
          title: "SPAN, RSPAN, ERSPAN",
          brief:
            "Port mirroring copies traffic to an analyser. Local SPAN stays on one switch, RSPAN carries mirrored traffic in a special VLAN, and ERSPAN carries it in GRE across L3.",
          keys: [
            "Local SPAN: `monitor session 1 source interface Gi1/0/1 both`, then `monitor session 1 destination interface Gi1/0/24`.",
            "RSPAN needs a VLAN configured with `remote-span` on every switch in the path.",
            "ERSPAN encapsulates the mirrored traffic in GRE, so it can be routed. You configure source and destination sessions with an ERSPAN ID.",
            "A destination port stops acting as a normal switchport.",
          ],
          trap: "An RSPAN VLAN must be created with `remote-span` on the source, the intermediate and the destination switches.",
        },
        {
          id: "4.4",
          title: "IP SLA",
          brief:
            "IP SLA generates synthetic probes (ICMP, UDP jitter, HTTP and more) to measure reachability and performance. With object tracking it drives failover of static routes or FHRP priority.",
          keys: [
            "Steps: define the operation → schedule it → (optionally) `track` it → reference the track in a route or FHRP.",
            "`ip sla schedule 1 life forever start-time now`.",
            "`track 1 ip sla 1 reachability`.",
            "`ip route 0.0.0.0 0.0.0.0 203.0.113.1 track 1` installs the route only while the track is up.",
            "UDP jitter needs `ip sla responder` on the far end.",
          ],
          cli: `ip sla 1
 icmp-echo 8.8.8.8 source-interface Gi0/0
 frequency 10
ip sla schedule 1 life forever start-time now
track 1 ip sla 1 reachability
ip route 0.0.0.0 0.0.0.0 203.0.113.1 track 1`,
          trap: "An IP SLA operation does nothing until it has been scheduled.",
        },
        {
          id: "4.5",
          title: "Catalyst Center: traditional and AI-powered workflows",
          brief:
            "Catalyst Center (formerly DNA Center) is the intent-based controller for the campus. It covers design, policy, provisioning and assurance, plus AI-driven analytics and troubleshooting.",
          keys: [
            "Workflow: Design (hierarchy, settings, IP pools) → Policy (VNs, SGTs) → Provision (devices, fabric) → Assurance (health, issues).",
            "Assurance gathers telemetry (streaming, NetFlow, syslog, SNMP) and scores health for clients, devices and applications.",
            "AI Network Analytics creates dynamic baselines, finds anomalies and suggests root causes.",
            "Templates (Velocity/Jinja2) and the Intent API (northbound REST) automate configuration.",
            "Southbound protocols include SSH/CLI, NETCONF, SNMP and RESTCONF.",
          ],
          trap: "Catalyst Center's northbound interface is the REST Intent API. NETCONF and CLI are southbound to the devices.",
        },
        {
          id: "4.6",
          title: "NETCONF and RESTCONF",
          brief:
            "Both are model-driven programmability interfaces that use YANG. NETCONF runs over SSH (port 830) with XML RPCs. RESTCONF runs over HTTPS with REST verbs and JSON or XML.",
          keys: [
            "Enable NETCONF: `netconf-yang`. Enable RESTCONF: `restconf` plus `ip http secure-server`.",
            "NETCONF operations: get, get-config, edit-config, copy-config, delete-config, lock, unlock, commit.",
            "NETCONF datastores: running, candidate, startup.",
            "RESTCONF URL: `https://host/restconf/data/<yang-module>:<container>`.",
            "Verbs: GET = read, POST = create, PUT = create or replace, PATCH = merge, DELETE = remove.",
          ],
          cli: `netconf-yang
restconf
ip http secure-server
ip http authentication local`,
          trap: "NETCONF listens on TCP 830 over SSH. RESTCONF uses HTTPS (443).",
        },
      ],
    },
    {
      id: "5.0",
      name: "Security",
      weight: 20,
      objectives: [
        {
          id: "5.1.a",
          title: "Lines and local user authentication",
          brief:
            "Lock down console and VTY access with local users, strong password hashing, SSH only and timeouts. That is the baseline before AAA.",
          keys: [
            "`username admin privilege 15 algorithm-type scrypt secret ...`. Type 9 (scrypt) is the strongest. Type 5 is MD5, type 7 is reversible.",
            "`line vty 0 15` → `login local` + `transport input ssh`.",
            "SSH needs a hostname, `ip domain name`, and RSA keys (`crypto key generate rsa modulus 2048`). `ip ssh version 2`.",
            "`exec-timeout 5 0` disconnects idle sessions. `access-class ACL in` limits source IPs.",
            "Privilege levels: 0 to 15. Level 1 is user EXEC and 15 is full privileged.",
          ],
          trap: "`login` on its own uses the line password. `login local` uses the local username database.",
        },
        {
          id: "5.1.b",
          title: "AAA authentication and authorization",
          brief:
            "AAA centralises authentication, authorization and accounting through RADIUS or TACACS+ servers. Method lists set the order: try the server group first, then fall back to local.",
          keys: [
            "`aaa new-model` must be the first command. It changes line authentication immediately.",
            "`aaa authentication login default group TACACS-GRP local`: local is used only when the servers do not respond. It is not used after a reject.",
            "TACACS+: TCP 49, encrypts the whole payload, separates authentication, authorization and accounting. Good for device administration.",
            "RADIUS: UDP 1812/1813, encrypts only the password, combines authentication and authorization. Good for network access (802.1X).",
            "`aaa authorization exec default group TACACS-GRP local` controls shell and privilege. `aaa authorization commands 15` authorises each command.",
          ],
          cli: `aaa new-model
tacacs server ISE1
 address ipv4 10.0.0.10
 key S3cr3t
aaa group server tacacs+ TAC
 server name ISE1
aaa authentication login default group TAC local
aaa authorization exec default group TAC local`,
          trap: "The fallback method is used only when the server is unreachable. A server reject (bad password) does not fall through to local.",
        },
        {
          id: "5.2.a",
          title: "ACLs",
          brief:
            "ACLs filter traffic in order, top to bottom, and stop at the first match. Every ACL ends with an implicit deny. Standard ACLs match only the source. Extended ACLs match protocol, source, destination and ports.",
          keys: [
            "Standard: 1-99, 1300-1999. Place them close to the destination. Extended: 100-199, 2000-2699. Place them close to the source.",
            "Wildcard masks: 0 = must match, 1 = ignore. `host x` = 0.0.0.0 wildcard, `any` = 255.255.255.255.",
            "Named ACLs allow sequence numbers, so you can insert or delete individual lines.",
            "Applied with `ip access-group NAME in|out`. On VTY lines use `access-class`.",
            "There is one ACL per interface, per direction, per protocol.",
          ],
          cli: `ip access-list extended WEB-IN
 10 permit tcp any host 10.0.0.80 eq 443
 20 deny ip any any log
interface Gi0/0
 ip access-group WEB-IN in`,
          trap: "The implicit `deny any` at the end drops everything you did not permit, including routing protocol traffic.",
        },
        {
          id: "5.2.b",
          title: "CoPP",
          brief:
            "Control Plane Policing protects the route processor by rate-limiting traffic that is punted to the CPU. It uses MQC, with the policy applied to the `control-plane` interface.",
          keys: [
            "Classify with ACLs (routing protocols, management, ICMP, undesirable traffic), then police each class.",
            "Apply with `control-plane` → `service-policy input COPP`.",
            "Catalyst 9000 switches ship with a default CoPP policy (`system-cpp-policy`).",
            "Verify with `show policy-map control-plane`.",
          ],
          cli: `policy-map COPP
 class ICMP
  police 8000 conform-action transmit exceed-action drop
control-plane
 service-policy input COPP`,
          trap: "CoPP is applied inbound to the control-plane. It does not filter transit traffic.",
        },
        {
          id: "5.3",
          title: "REST API security",
          brief:
            "Secure APIs with HTTPS, strong authentication (tokens, OAuth) and least privilege. Never put credentials in URLs or source code.",
          keys: [
            "Use TLS in transit. HTTP Basic Auth is only acceptable over HTTPS.",
            "Token-based auth: Catalyst Center issues a token from POST /dna/system/api/v1/auth/token, and you send it in the X-Auth-Token header.",
            "OAuth 2.0: an authorisation server issues scoped, expiring access tokens.",
            "API keys and secrets belong in a vault or environment variables, never in a repository.",
            "Rate limiting, input validation and RBAC reduce the blast radius.",
          ],
          trap: "Base64 in HTTP Basic auth is encoding, not encryption.",
        },
        {
          id: "5.4",
          title: "Security design: threat defense, endpoint, NGFW, TrustSec, MACsec",
          brief:
            "Defence in depth layers controls across the network, endpoints and identity. Know what each Cisco product family does and where TrustSec and MACsec fit.",
          keys: [
            "Threat defense: Secure Firewall (FTD) with Snort IPS, Secure Network Analytics (Stealthwatch) using NetFlow, Talos threat intelligence.",
            "Endpoint security: Secure Endpoint (AMP) for malware, ISE posture assessment, 802.1X/MAB for network admission.",
            "NGFW adds application visibility (AVC), URL filtering, IPS and malware inspection on top of stateful filtering.",
            "TrustSec: classifies users and devices into SGTs (Security Group Tags) and enforces SGACLs, independent of IP addresses.",
            "MACsec (802.1AE): hop-by-hop Layer 2 encryption between devices, with keys via MKA.",
          ],
          trap: "MACsec encrypts each link (hop by hop). IPsec encrypts end to end at Layer 3.",
        },
      ],
    },
    {
      id: "6.0",
      name: "Automation and AI",
      weight: 15,
      objectives: [
        {
          id: "6.1",
          title: "Python components and scripts",
          brief:
            "Read basic Python: data types, loops, conditionals, functions, and libraries such as requests, netmiko and ncclient.",
          keys: [
            "Lists `[]` are ordered and mutable. Tuples `()` are immutable. Dicts `{}` are key/value. Sets have unique members.",
            "`for x in items:` / `if cond:` / `def fn(arg):`. Indentation defines blocks.",
            "`requests.get(url, headers=h, verify=False)` returns a response with `.status_code` and `.json()`.",
            "`json.loads()` converts a string to a dict. `json.dumps()` converts a dict to a string.",
            "`try/except` handles errors, and `import` brings in libraries.",
          ],
          cli: `import requests
r = requests.get(url, headers={"X-Auth-Token": token})
for dev in r.json()["response"]:
    print(dev["hostname"], dev["managementIpAddress"])`,
          trap: "`json.loads` reads a string and `json.load` reads a file object.",
        },
        {
          id: "6.2",
          title: "Construct valid JSON",
          brief:
            "JSON is the language of REST APIs. It has strict syntax: keys in double quotes, no trailing commas, and a small set of data types.",
          keys: [
            "Types: string (double quotes), number, boolean (`true`/`false`, lowercase), `null`, object `{}`, array `[]`.",
            "Keys must be double-quoted strings. Single quotes are invalid.",
            "No trailing comma after the last element. No comments.",
            "Nesting: objects inside arrays inside objects is normal for API payloads.",
          ],
          cli: `{
  "interface": {
    "name": "GigabitEthernet2",
    "enabled": true,
    "mtu": 1500,
    "description": null
  }
}`,
          trap: "`True` (capital T) is Python. JSON needs a lowercase `true`.",
        },
        {
          id: "6.3",
          title: "YANG data modelling",
          brief:
            "YANG models the structure of configuration and operational data. NETCONF and RESTCONF carry data that conforms to those models.",
          keys: [
            "Building blocks: module, container (grouping), list (keyed entries), leaf (single value), leaf-list (values).",
            "Native models are vendor specific (Cisco-IOS-XE-native). OpenConfig is vendor neutral. IETF models are standard (ietf-interfaces).",
            "Benefits: consistent and validated structure, vendor independence, and machine-readable data for automation.",
            "Tools: pyang (tree view), YANG Suite.",
          ],
          trap: "YANG is the model and XML or JSON is the encoding. NETCONF and RESTCONF are the transport protocols.",
        },
        {
          id: "6.4",
          title: "Catalyst Center and SD-WAN Manager APIs",
          brief:
            "Both controllers expose northbound REST APIs. Catalyst Center uses token auth under /dna/intent/api/v1. SD-WAN Manager uses a session cookie plus an XSRF token under /dataservice.",
          keys: [
            "Catalyst Center: POST /dna/system/api/v1/auth/token (Basic auth) returns a token, which goes in the X-Auth-Token header.",
            "Common Catalyst Center endpoints: /dna/intent/api/v1/network-device, /site, /client-health.",
            "SD-WAN Manager: POST /j_security_check (form credentials) returns a JSESSIONID cookie. GET /dataservice/client/token returns X-XSRF-TOKEN for writes.",
            "SD-WAN Manager endpoints: /dataservice/device, /dataservice/template/... ",
            "Many Catalyst Center operations are asynchronous. They return a taskId that you poll.",
          ],
          trap: "SD-WAN Manager needs the XSRF token for POST/PUT/DELETE, not only the session cookie.",
        },
        {
          id: "6.5",
          title: "REST response codes and payloads",
          brief:
            "Read status codes and the JSON payload to tell whether a call worked, and why it did not.",
          keys: [
            "2xx success: 200 OK, 201 Created, 202 Accepted (async, Catalyst Center task), 204 No Content.",
            "4xx client error: 400 Bad Request (malformed body), 401 Unauthorized (no or invalid auth), 403 Forbidden (authenticated but not allowed), 404 Not Found, 405 Method Not Allowed, 409 Conflict, 429 Too Many Requests.",
            "5xx server error: 500 Internal Server Error, 503 Service Unavailable.",
            "RESTCONF returns 204 for a successful PUT/PATCH with no body, and 201 for a POST that created a resource.",
          ],
          trap: "401 means \"who are you?\" (authentication). 403 means \"I know who you are, but no\" (authorization).",
        },
        {
          id: "6.6",
          title: "EEM applets",
          brief:
            "The Embedded Event Manager runs on-box automation. An event (syslog pattern, interface state, timer, CLI) triggers numbered actions, such as CLI commands, syslog messages or email.",
          keys: [
            "`event manager applet NAME` → `event syslog pattern \"...\"` / `event timer cron` / `event track 1 state down`.",
            "Actions run in lexical (string) order of their labels, so use 1.0, 2.0, ... and note that `10` sorts before `9`.",
            "Applets need `action 1.0 cli command \"enable\"` before privileged commands.",
            "`action x syslog msg \"...\"`, `action x mail ...`, `action x cli command \"show run | redirect flash:x.txt\"`.",
          ],
          cli: `event manager applet UPLINK-DOWN
 event syslog pattern "Interface GigabitEthernet0/0, changed state to down"
 action 1.0 cli command "enable"
 action 2.0 cli command "show ip route | append flash:uplink.log"
 action 3.0 syslog msg "Uplink down, route table saved"`,
          trap: "Action labels sort as strings, so \"10\" runs before \"9\". Use decimals like 1.0, 2.0 or zero-padded labels.",
        },
        {
          id: "6.7",
          title: "Agent vs agentless orchestration",
          brief:
            "Configuration management tools either install an agent on each managed node, or connect over existing protocols such as SSH or APIs. Know which tool works which way.",
          keys: [
            "Agentless: Ansible (push over SSH, NETCONF or APIs; YAML playbooks; inventory). Good for network devices.",
            "Agent-based: Puppet (pull, manifests in Puppet DSL, master/agent), Chef (pull, Ruby recipes and cookbooks, chef-client), SaltStack (agent 'minion' by default; agentless salt-ssh exists).",
            "Push model: the controller connects out to devices. Pull model: agents check in periodically.",
            "Ansible: playbook → plays → tasks → modules. Inventory lists hosts and groups.",
          ],
          trap: "Ansible is agentless and pushes changes. Puppet and Chef use agents that pull their configuration.",
        },
      ],
    },
  ],

  questions: [
    ...encorBankA,
    ...encorBankB,
    ...encorBankC,
    ...encorBankD,
    ...encorBankE,
    ...encorBankF,
    ...encorBankG,
    // 1.x Architecture
    {
      id: "e-001",
      objective: "1.1.a",
      kind: "single",
      prompt: "In a three-tier campus design, which layer is the usual place for route summarisation and policy such as ACLs between VLANs?",
      choices: ["Access", "Distribution", "Core", "Data centre edge"],
      answer: 1,
      explain: "Distribution aggregates access blocks and is the L2/L3 boundary. That makes it the place for summarisation and policy. The core should only move packets quickly.",
    },
    {
      id: "e-002",
      objective: "1.1.a",
      kind: "single",
      prompt: "A small single-building campus merges its core and distribution layers into one pair of switches. What is this design called?",
      choices: ["Spine-leaf", "Collapsed core (two-tier)", "Routed access", "Hub-and-spoke"],
      answer: 1,
      explain: "A collapsed core is a two-tier design in which distribution and core share the same devices.",
    },
    {
      id: "e-003",
      objective: "1.1.b",
      kind: "multi",
      prompt: "Which TWO features together let a dual-supervisor switch keep forwarding traffic and keep its routing adjacencies during a supervisor failover?",
      choices: ["SSO", "NSF", "HSRP", "UDLD", "PortFast"],
      answer: [0, 1],
      explain: "SSO syncs state to the standby supervisor. NSF (graceful restart) keeps forwarding on the existing FIB and preserves adjacencies with NSF-aware neighbours.",
    },
    {
      id: "e-004",
      objective: "1.2",
      kind: "single",
      prompt: "Which Catalyst SD-WAN component is the first point of authentication for a new WAN Edge and helps it through NAT?",
      choices: ["SD-WAN Manager (vManage)", "SD-WAN Controller (vSmart)", "SD-WAN Validator (vBond)", "WAN Edge"],
      answer: 2,
      explain: "The Validator (vBond) handles orchestration. It authenticates devices, assists with NAT traversal, and tells the edge where the controllers and manager are.",
    },
    {
      id: "e-005",
      objective: "1.2",
      kind: "single",
      prompt: "Which protocol do SD-WAN Controllers use to distribute routes, TLOCs and policy to WAN Edges?",
      choices: ["BGP", "OMP", "LISP", "BFD"],
      answer: 1,
      explain: "OMP (Overlay Management Protocol) runs between the edges and the controllers. BFD runs inside the data plane tunnels to measure path quality.",
    },
    {
      id: "e-006",
      objective: "1.2",
      kind: "single",
      prompt: "In Catalyst SD-WAN, what does BFD measure inside the IPsec tunnels between edges?",
      choices: ["Route convergence time", "Loss, latency and jitter for app-aware routing", "Controller reachability", "Certificate validity"],
      answer: 1,
      explain: "BFD probes every tunnel. App-aware routing compares the measured loss, latency and jitter with SLA classes.",
    },
    {
      id: "e-007",
      objective: "1.3",
      kind: "single",
      prompt: "Which SD-Access node acts as the LISP Map-Server/Map-Resolver?",
      choices: ["Edge node", "Border node", "Control plane node", "Intermediate node"],
      answer: 2,
      explain: "The control plane node holds the host tracking database (EID to RLOC mappings) as the LISP MS/MR.",
    },
    {
      id: "e-008",
      objective: "1.3",
      kind: "multi",
      prompt: "Which TWO pieces of information does the SD-Access VXLAN header carry?",
      choices: ["Virtual network (VRF) in the VNI", "Scalable Group Tag", "OSPF area ID", "MPLS label", "DSCP of the underlay only"],
      answer: [0, 1],
      explain: "SD-Access uses VXLAN-GPO. The VNI identifies the VN (VRF), and the Group Policy ID field carries the SGT.",
    },
    {
      id: "e-009",
      objective: "1.4",
      kind: "single",
      prompt: "What is the decimal DSCP value of AF41?",
      choices: ["26", "34", "36", "46"],
      answer: 1,
      explain: "DSCP = 8 × class + 2 × drop precedence = 8×4 + 2×1 = 34.",
    },
    {
      id: "e-010",
      objective: "1.4",
      kind: "single",
      prompt: "A policy-map class contains `priority percent 10`. What does this give the class?",
      choices: [
        "A minimum bandwidth guarantee with WFQ",
        "Strict priority queuing (LLQ), policed to 10% during congestion",
        "Traffic shaping to 10% of the line rate",
        "Remarking to DSCP 10",
      ],
      answer: 1,
      explain: "`priority` creates the low latency queue. Under congestion an implicit policer stops it from starving the other classes.",
    },
    {
      id: "e-011",
      objective: "1.4",
      kind: "single",
      prompt: "Which statement about policing and shaping is correct?",
      choices: [
        "Shaping can be applied inbound and outbound",
        "Policing buffers excess traffic",
        "Shaping buffers excess traffic and applies outbound only",
        "Policing adds delay but never drops",
      ],
      answer: 2,
      explain: "Shapers queue excess traffic and send it later, which only makes sense on egress. Policers drop or remark and work in either direction.",
    },

    // 2.x Virtualization
    {
      id: "e-012",
      objective: "2.1",
      kind: "single",
      prompt: "Which hypervisor is Type 2?",
      choices: ["VMware ESXi", "Microsoft Hyper-V Server", "Oracle VirtualBox", "KVM"],
      answer: 2,
      explain: "VirtualBox runs as an application on a host operating system. ESXi, Hyper-V and KVM run on bare metal (KVM turns the Linux kernel into the hypervisor).",
    },
    {
      id: "e-013",
      objective: "2.2.a",
      kind: "cli",
      prompt: "Place this interface into the VRF named BLUE (modern IOS XE syntax).",
      context: "R1(config-if)#",
      accept: ["vrf forw|arding BLUE"],
      canonical: "vrf forwarding BLUE",
      explain: "`vrf forwarding` is the command for `vrf definition` VRFs. The legacy `ip vrf forwarding` goes with `ip vrf`. Either way, the IP address is removed and must be configured again.",
    },
    {
      id: "e-014",
      objective: "2.2.a",
      kind: "single",
      prompt: "An engineer applies `vrf forwarding RED` to an interface that already had an IP address. What happens?",
      choices: ["The IP moves into VRF RED automatically", "The IP address is removed", "The command is rejected", "The interface is shut down"],
      answer: 1,
      explain: "IOS removes the interface's IPv4/IPv6 address when VRF membership changes. You need to configure it again.",
    },
    {
      id: "e-015",
      objective: "2.2.b",
      kind: "single",
      prompt: "A GRE tunnel flaps with %TUN-5-RECURDOWN. What is the most likely cause?",
      choices: [
        "MTU mismatch",
        "The tunnel destination is learned through the tunnel itself",
        "IPsec SA lifetime expired",
        "Keepalives disabled",
      ],
      answer: 1,
      explain: "Recursive routing happens when the route to the tunnel destination points into the tunnel. Make sure the underlay route is preferred.",
    },
    {
      id: "e-016",
      objective: "2.2.b",
      kind: "single",
      prompt: "Why is GRE over IPsec used instead of plain IPsec for site-to-site routing?",
      choices: [
        "GRE provides encryption",
        "Plain IPsec cannot carry multicast routing protocols such as OSPF",
        "GRE reduces overhead",
        "IPsec cannot use IKEv2",
      ],
      answer: 1,
      explain: "Plain policy-based IPsec carries unicast IP only. GRE encapsulates multicast and routing protocol packets, and IPsec then encrypts the GRE.",
    },
    {
      id: "e-017",
      objective: "2.2.b",
      kind: "single",
      prompt: "Which IP protocol number does ESP use?",
      choices: ["47", "50", "51", "500"],
      answer: 1,
      explain: "ESP = 50, AH = 51, GRE = 47. IKE uses UDP 500 (and 4500 with NAT-T).",
    },
    {
      id: "e-018",
      objective: "2.3.a",
      kind: "single",
      prompt: "In LISP, which device sends a Map-Register message, and to which device?",
      choices: ["ITR to Map-Resolver", "ETR to Map-Server", "PITR to ETR", "Map-Resolver to Map-Server"],
      answer: 1,
      explain: "ETRs register their EID prefixes with the Map-Server. ITRs query the Map-Resolver with Map-Requests.",
    },
    {
      id: "e-019",
      objective: "2.3.b",
      kind: "single",
      prompt: "Which UDP destination port and identifier size does VXLAN use?",
      choices: ["4341 / 12-bit", "4789 / 24-bit", "4789 / 12-bit", "8472 / 32-bit"],
      answer: 1,
      explain: "The IANA VXLAN port is UDP 4789. The VNI is 24 bits, which allows about 16 million segments.",
    },
    {
      id: "e-020",
      objective: "2.3.b",
      kind: "order",
      prompt: "Order the headers of a VXLAN packet from outermost to innermost.",
      items: ["Outer Ethernet", "Outer IP", "UDP", "VXLAN header", "Original Ethernet frame"],
      explain: "MAC-in-UDP: outer L2 → outer IP (VTEP to VTEP) → UDP 4789 → VXLAN (VNI) → the original L2 frame.",
    },

    // 3.1 Layer 2
    {
      id: "e-021",
      objective: "3.1.a",
      kind: "single",
      prompt: "Both ends of a link are set to `switchport mode dynamic auto`. What is the result?",
      choices: ["Trunk", "Access", "Err-disabled", "Trunk with native VLAN 1 only"],
      answer: 1,
      explain: "Auto is passive and waits to be asked. Two passive ends never negotiate, so the link stays in access mode.",
    },
    {
      id: "e-022",
      objective: "3.1.a",
      kind: "cli",
      prompt: "Add VLAN 40 to the existing allowed list on this trunk without removing the other VLANs.",
      context: "SW1(config-if)#",
      accept: ["sw|itchport tr|unk al|lowed vl|an add 40"],
      canonical: "switchport trunk allowed vlan add 40",
      explain: "Without `add`, the command replaces the whole list. That is a classic change-window outage.",
    },
    {
      id: "e-023",
      objective: "3.1.a",
      kind: "single",
      prompt: "CDP logs %CDP-4-NATIVE_VLAN_MISMATCH. What is the impact?",
      choices: [
        "The trunk goes err-disabled",
        "Untagged traffic leaks between the two native VLANs",
        "DTP forces access mode",
        "Nothing; it is cosmetic",
      ],
      answer: 1,
      explain: "Untagged frames are put into each side's own native VLAN, so traffic crosses between two different VLANs. That breaks the design and is a security risk.",
    },
    {
      id: "e-024",
      objective: "3.1.b",
      kind: "single",
      prompt: "Switch A uses `channel-group 1 mode passive`, and switch B uses `channel-group 1 mode passive`. What happens?",
      choices: ["LACP bundle forms", "PAgP bundle forms", "No bundle forms", "A static bundle forms"],
      answer: 2,
      explain: "LACP needs at least one active side. Passive + passive never sends LACPDUs.",
    },
    {
      id: "e-025",
      objective: "3.1.b",
      kind: "cli",
      prompt: "Make these member ports actively negotiate LACP in port-channel 1.",
      context: "SW1(config-if-range)#",
      accept: ["chan|nel-group 1 mode act|ive"],
      canonical: "channel-group 1 mode active",
      explain: "`active` sends LACPDUs. `passive` only answers. `desirable` and `auto` are PAgP modes.",
    },
    {
      id: "e-026",
      objective: "3.1.b",
      kind: "single",
      prompt: "In `show etherchannel summary`, a member port shows flag (s). What does it mean?",
      choices: ["Bundled", "Suspended", "Stand-alone", "Layer 3"],
      answer: 1,
      explain: "s = suspended, usually because of a configuration mismatch with the port-channel. P = bundled, I = stand-alone, S = Layer 2.",
    },
    {
      id: "e-027",
      objective: "3.1.c",
      kind: "single",
      prompt: "A PortFast access port with BPDU guard receives a BPDU. What happens?",
      choices: ["The port goes root-inconsistent", "The port is err-disabled", "The port becomes the root port", "The BPDU is silently filtered"],
      answer: 1,
      explain: "BPDU guard shuts the port into err-disabled. Root guard is the feature that uses root-inconsistent.",
    },
    {
      id: "e-028",
      objective: "3.1.c",
      kind: "single",
      prompt: "Which feature should go on distribution downlinks so that an access switch can never become the STP root?",
      choices: ["BPDU guard", "Loop guard", "Root guard", "UplinkFast"],
      answer: 2,
      explain: "Root guard blocks the port (root-inconsistent) when a superior BPDU arrives, which protects the root placement.",
    },
    {
      id: "e-029",
      objective: "3.1.c",
      kind: "multi",
      prompt: "Which THREE parameters must match for two switches to be in the same MST region?",
      choices: ["Region name", "Revision number", "VLAN-to-instance mapping", "Bridge priority", "Hello timer"],
      answer: [0, 1, 2],
      explain: "MST region membership depends on the configuration name, the revision number and the VLAN-to-instance table.",
    },
    {
      id: "e-030",
      objective: "3.1.c",
      kind: "cli",
      prompt: "Enable BPDU guard on this access port only (not globally).",
      context: "SW1(config-if)#",
      accept: ["span|ning-tree bpdug|uard en|able"],
      canonical: "spanning-tree bpduguard enable",
      explain: "Per interface: `spanning-tree bpduguard enable`. Globally: `spanning-tree portfast bpduguard default`, which applies to all PortFast ports.",
    },

    // 3.2 Layer 3
    {
      id: "e-031",
      objective: "3.2.a",
      kind: "single",
      prompt: "Which routing protocol can load-balance across unequal-cost paths natively?",
      choices: ["OSPF", "IS-IS", "EIGRP", "RIPv2"],
      answer: 2,
      explain: "EIGRP's `variance` command installs feasible successors whose metric is within the multiplier.",
    },
    {
      id: "e-032",
      objective: "3.2.a",
      kind: "single",
      prompt: "An EIGRP route has FD 3000. Neighbour X reports RD 2500 for the same prefix. Is X a feasible successor?",
      choices: ["Yes, because RD < FD", "No, because RD must equal FD", "No, because RD must be greater than FD", "Only if variance is set"],
      answer: 0,
      explain: "Feasibility condition: the reported distance must be strictly lower than the current feasible distance. 2500 < 3000.",
    },
    {
      id: "e-033",
      objective: "3.2.a",
      kind: "single",
      prompt: "What is the default administrative distance of OSPF?",
      choices: ["90", "100", "110", "120"],
      answer: 2,
      explain: "OSPF = 110. EIGRP internal = 90, external = 170. RIP = 120. eBGP = 20.",
    },
    {
      id: "e-034",
      objective: "3.2.a",
      kind: "single",
      prompt: "Which OSPF area type blocks Type 5 LSAs but still allows external routes to be imported inside the area as Type 7?",
      choices: ["Stub", "Totally stubby", "NSSA", "Backbone"],
      answer: 2,
      explain: "An NSSA ASBR originates Type 7 LSAs, and the ABR translates them into Type 5 for the rest of the domain.",
    },
    {
      id: "e-035",
      objective: "3.2.b",
      kind: "single",
      prompt: "Two OSPF neighbours are stuck in EXSTART. What is the most common cause?",
      choices: ["Area mismatch", "Hello timer mismatch", "MTU mismatch", "Duplicate router ID on another segment"],
      answer: 2,
      explain: "An area or timer mismatch stops neighbours from reaching 2-WAY at all. A stall in EXSTART/EXCHANGE points to an interface MTU mismatch during DBD exchange.",
    },
    {
      id: "e-036",
      objective: "3.2.b",
      kind: "cli",
      prompt: "On the ABR, summarise area 1's 10.1.0.0/16 networks into a single inter-area route.",
      context: "R1(config-router)#",
      accept: ["area 1 range 10.1.0.0 255.255.0.0"],
      canonical: "area 1 range 10.1.0.0 255.255.0.0",
      explain: "`area X range` summarises Type 3 LSAs on an ABR. `summary-address` is for external routes on an ASBR.",
    },
    {
      id: "e-037",
      objective: "3.2.b",
      kind: "single",
      prompt: "What does `passive-interface Gi0/2` under `router ospf 1` do?",
      choices: [
        "Removes Gi0/2's subnet from OSPF",
        "Stops hellos on Gi0/2 but still advertises its subnet",
        "Makes Gi0/2 a stub area",
        "Sets the cost of Gi0/2 to the maximum",
      ],
      answer: 1,
      explain: "A passive interface forms no adjacency, but its network is still included in the router LSA.",
    },
    {
      id: "e-038",
      objective: "3.2.b",
      kind: "single",
      prompt: "Which OSPF network type on Ethernet removes DR/BDR election?",
      choices: ["broadcast", "non-broadcast", "point-to-point", "point-to-multipoint non-broadcast"],
      answer: 2,
      explain: "`ip ospf network point-to-point` skips the DR election and speeds up adjacency on two-router links.",
    },
    {
      id: "e-039",
      objective: "3.2.c",
      kind: "order",
      prompt: "Order these BGP best path attributes as Cisco evaluates them (first at the top).",
      items: ["Weight (highest)", "Local preference (highest)", "Locally originated", "AS path (shortest)", "Origin (IGP < EGP < incomplete)", "MED (lowest)", "eBGP over iBGP"],
      explain: "We Love Oranges AS Oranges Mean Pure Refreshment: Weight, Local pref, Originated, AS path, Origin, MED, Paths (eBGP > iBGP), then IGP metric, age, and router ID.",
    },
    {
      id: "e-040",
      objective: "3.2.c",
      kind: "cli",
      prompt: "Configure an eBGP neighbour 192.0.2.2 in AS 65002.",
      context: "R1(config-router)#",
      accept: ["nei|ghbor 192.0.2.2 rem|ote-as 65002"],
      canonical: "neighbor 192.0.2.2 remote-as 65002",
      explain: "When remote-as differs from the local AS, the session is eBGP.",
    },
    {
      id: "e-041",
      objective: "3.2.c",
      kind: "single",
      prompt: "`show ip bgp summary` shows a neighbour constantly in the Active state. What does that mean?",
      choices: ["The session is up and exchanging routes", "The router is trying, but failing, to establish TCP to the peer", "The neighbour is administratively shut down", "The router is in OpenConfirm"],
      answer: 1,
      explain: "Active means the router is actively trying to open the TCP 179 connection. Check reachability, the update-source, ACLs and the remote-as.",
    },
    {
      id: "e-042",
      objective: "3.2.c",
      kind: "single",
      prompt: "A `network 10.10.0.0 mask 255.255.0.0` statement under BGP does not advertise anything. The RIB contains 10.10.1.0/24 and 10.10.2.0/24. Why?",
      choices: [
        "BGP needs `no auto-summary`",
        "The network statement needs an exact prefix match in the RIB",
        "The neighbour is not activated",
        "eBGP does not advertise private ranges",
      ],
      answer: 1,
      explain: "BGP originates a prefix with `network` only when that exact prefix and mask are in the routing table. A static route to Null0 is a common fix.",
    },
    {
      id: "e-043",
      objective: "3.2.d",
      kind: "single",
      prompt: "Where is PBR applied to influence traffic from users on Gi0/1?",
      choices: ["Outbound on the WAN interface", "Inbound on Gi0/1 with `ip policy route-map`", "Globally with `ip local policy`", "Under router ospf"],
      answer: 1,
      explain: "PBR is evaluated on ingress. `ip local policy` is only for traffic the router itself generates.",
    },
    {
      id: "e-044",
      objective: "3.2.d",
      kind: "single",
      prompt: "A packet is denied by a PBR route-map's match clause. How is it forwarded?",
      choices: ["Dropped", "Normally, using the routing table", "Sent to the default next hop", "Sent to Null0"],
      answer: 1,
      explain: "Deny (or no match) in a PBR route-map means \"do not policy route\". The packet follows the RIB.",
    },

    // 3.3 IP services
    {
      id: "e-045",
      objective: "3.3.a",
      kind: "single",
      prompt: "`show ntp status` reports stratum 16. What does it mean?",
      choices: ["Synchronised to a GPS clock", "Unsynchronised", "Acting as master", "Using PTP"],
      answer: 1,
      explain: "Stratum 16 means unsynchronised. Stratum 1 is directly attached to a reference clock.",
    },
    {
      id: "e-046",
      objective: "3.3.a",
      kind: "single",
      prompt: "Which PTP clock type corrects for the time a packet spends inside the switch but does not run its own clock domain?",
      choices: ["Grandmaster", "Boundary clock", "Transparent clock", "Ordinary clock"],
      answer: 2,
      explain: "Transparent clocks add residence time to a correction field. Boundary clocks terminate PTP and act as master downstream.",
    },
    {
      id: "e-047",
      objective: "3.3.b",
      kind: "cli",
      prompt: "Translate inside hosts matching ACL 1 to the address of Gi0/0 using PAT.",
      context: "R1(config)#",
      accept: ["ip nat ins|ide sou|rce li|st 1 int|erface <if:Gi0/0> ov|erload"],
      canonical: "ip nat inside source list 1 interface GigabitEthernet0/0 overload",
      explain: "The `overload` keyword enables port address translation, so many inside hosts share one global IP.",
    },
    {
      id: "e-048",
      objective: "3.3.b",
      kind: "single",
      prompt: "In NAT terminology, what is the \"inside global\" address?",
      choices: ["The private address of the inside host", "The public address that represents the inside host", "The real address of an outside host", "The address of the NAT router's inside interface"],
      answer: 1,
      explain: "Inside global = how the outside world sees the inside host after translation.",
    },
    {
      id: "e-049",
      objective: "3.3.c",
      kind: "single",
      prompt: "Router A (HSRP priority 110) fails and later recovers. Router B (priority 100) is active. A does not take the role back. Why?",
      choices: ["HSRP v1 does not support priority", "Preemption is not configured on A", "B has a higher IP", "The virtual MAC changed"],
      answer: 1,
      explain: "HSRP does not preempt by default. Add `standby X preempt` on the router that should take the role back.",
    },
    {
      id: "e-050",
      objective: "3.3.c",
      kind: "multi",
      prompt: "Which TWO statements about VRRP are true?",
      choices: [
        "Preemption is enabled by default",
        "It is Cisco proprietary",
        "The virtual IP can be the same as a real interface address",
        "It uses multicast 224.0.0.102",
        "Default priority is 110",
      ],
      answer: [0, 2],
      explain: "VRRP (RFC 5798) preempts by default, and the IP address owner can use its own interface IP as the virtual IP (priority 255). It uses 224.0.0.18, and the default priority is 100.",
    },
    {
      id: "e-051",
      objective: "3.3.c",
      kind: "cli",
      prompt: "Set HSRP group 10's priority to 110 on this SVI.",
      context: "DSW1(config-if)#",
      accept: ["standby 10 prio|rity 110"],
      canonical: "standby 10 priority 110",
      explain: "The highest priority wins, with the highest interface IP as the tie-breaker. Remember to add `standby 10 preempt` too.",
    },
    {
      id: "e-052",
      objective: "3.3.d",
      kind: "single",
      prompt: "Which multicast model requires IGMPv3 on receivers and uses no RP?",
      choices: ["PIM-SM", "Bidir-PIM", "PIM-SSM", "PIM-DM"],
      answer: 2,
      explain: "With SSM, receivers name the source in an IGMPv3 report, so the tree is built straight to (S,G).",
    },
    {
      id: "e-053",
      objective: "3.3.d",
      kind: "single",
      prompt: "A multicast packet arrives on an interface that is not the router's path back to the source. What happens?",
      choices: ["It is forwarded out of all interfaces", "It fails the RPF check and is dropped", "It is sent to the RP", "It is converted to unicast"],
      answer: 1,
      explain: "The RPF check stops loops. The packet must arrive on the interface the unicast routing table uses towards the source.",
    },
    {
      id: "e-054",
      objective: "3.3.d",
      kind: "single",
      prompt: "Which protocol shares active-source information between RPs in different PIM domains?",
      choices: ["IGMP", "MSDP", "PIM-DM", "Auto-RP"],
      answer: 1,
      explain: "MSDP peers exchange Source-Active messages so RPs can learn about sources in other domains.",
    },

    // 4.x Network assurance
    {
      id: "e-055",
      objective: "4.1",
      kind: "single",
      prompt: "`logging trap warnings` is configured. Which severity levels are sent to the syslog server?",
      choices: ["4 only", "0 through 4", "4 through 7", "All levels"],
      answer: 1,
      explain: "Warnings = 4. Everything at that level and more severe (lower numbers 0-3) is sent.",
    },
    {
      id: "e-056",
      objective: "4.1",
      kind: "single",
      prompt: "Which SNMPv3 security level provides both authentication and encryption?",
      choices: ["noAuthNoPriv", "authNoPriv", "authPriv", "community"],
      answer: 2,
      explain: "authPriv = authentication (SHA) plus privacy (AES).",
    },
    {
      id: "e-057",
      objective: "4.1",
      kind: "single",
      prompt: "What is the main reason to use a conditional debug on a busy production router?",
      choices: ["It writes debug output to flash", "It limits debug output to a specific interface, peer or MAC, which reduces CPU load", "It runs debugs on the standby supervisor", "It removes the need for `terminal monitor`"],
      answer: 1,
      explain: "Conditions filter what the debug processes. Unfiltered debugs can overload the CPU.",
    },
    {
      id: "e-058",
      objective: "4.2",
      kind: "order",
      prompt: "Order the Flexible NetFlow configuration steps.",
      items: ["flow record (match/collect)", "flow exporter (destination)", "flow monitor (record + exporter)", "Apply monitor on interface"],
      explain: "The monitor references the record and the exporter, so those must exist first. The monitor is then applied to the interface.",
    },
    {
      id: "e-059",
      objective: "4.2",
      kind: "single",
      prompt: "In a Flexible NetFlow record, what is the difference between `match` and `collect`?",
      choices: ["They are synonyms", "match defines key fields that make a flow unique; collect gathers non-key data", "collect defines keys; match filters packets", "match is for IPv4 and collect is for IPv6"],
      answer: 1,
      explain: "Key fields (match) decide when a new flow is created. Non-key fields (collect), such as counters, are added to it.",
    },
    {
      id: "e-060",
      objective: "4.3",
      kind: "single",
      prompt: "You need to mirror traffic from a switch in building A to an analyser behind a routed core in building B. Which technology fits?",
      choices: ["Local SPAN", "RSPAN", "ERSPAN", "Port security"],
      answer: 2,
      explain: "ERSPAN puts the mirrored frames in GRE, so they can cross an L3 network. RSPAN needs an L2 path carrying the RSPAN VLAN.",
    },
    {
      id: "e-061",
      objective: "4.4",
      kind: "cli",
      prompt: "Start IP SLA operation 1 now and run it forever.",
      context: "R1(config)#",
      accept: ["ip sla sch|edule 1 life forever start-time now", "ip sla sch|edule 1 start-time now life forever"],
      canonical: "ip sla schedule 1 life forever start-time now",
      explain: "The operation does nothing until it is scheduled. Then reference it with `track 1 ip sla 1 reachability`.",
    },
    {
      id: "e-062",
      objective: "4.4",
      kind: "single",
      prompt: "Which IP SLA operation needs `ip sla responder` on the remote device?",
      choices: ["icmp-echo", "udp-jitter", "dns", "http get"],
      answer: 1,
      explain: "UDP jitter uses timestamps from the responder to calculate one-way delay, jitter and loss.",
    },
    {
      id: "e-063",
      objective: "4.5",
      kind: "single",
      prompt: "Which Catalyst Center capability uses machine learning to build dynamic baselines and point out anomalies?",
      choices: ["Template Editor", "AI Network Analytics (Assurance)", "LAN Automation", "Plug and Play"],
      answer: 1,
      explain: "AI Network Analytics in Assurance learns the normal behaviour of a network and raises issues that include likely root causes.",
    },
    {
      id: "e-064",
      objective: "4.5",
      kind: "single",
      prompt: "Which interface does an external script use to automate Catalyst Center?",
      choices: ["Southbound NETCONF", "Northbound Intent REST API", "SNMP traps", "Syslog"],
      answer: 1,
      explain: "Applications talk to Catalyst Center through its northbound Intent API. Catalyst Center talks to devices southbound.",
    },
    {
      id: "e-065",
      objective: "4.6",
      kind: "single",
      prompt: "Which transport and port does NETCONF use by default?",
      choices: ["HTTPS 443", "SSH 830", "SSH 22 with REST", "UDP 161"],
      answer: 1,
      explain: "NETCONF runs over SSH on TCP 830. RESTCONF runs over HTTPS.",
    },
    {
      id: "e-066",
      objective: "4.6",
      kind: "single",
      prompt: "Which RESTCONF HTTP method merges a configuration change into an existing resource?",
      choices: ["PUT", "POST", "PATCH", "GET"],
      answer: 2,
      explain: "PATCH merges. PUT creates or replaces the whole resource. POST creates a new child resource.",
    },
    {
      id: "e-067",
      objective: "4.6",
      kind: "cli",
      prompt: "Enable the NETCONF agent on IOS XE.",
      context: "R1(config)#",
      accept: ["netconf-yang"],
      canonical: "netconf-yang",
      explain: "`netconf-yang` starts the agent on TCP 830. RESTCONF needs `restconf` plus `ip http secure-server`.",
    },

    // 5.x Security
    {
      id: "e-068",
      objective: "5.1.a",
      kind: "single",
      prompt: "Which password type is the strongest choice on current IOS XE?",
      choices: ["Type 0", "Type 5 (MD5)", "Type 7", "Type 9 (scrypt)"],
      answer: 3,
      explain: "Type 9 (scrypt) and type 8 (PBKDF2-SHA256) are the recommended hashes. Type 7 can be reversed.",
    },
    {
      id: "e-069",
      objective: "5.1.a",
      kind: "cli",
      prompt: "Allow only SSH on these VTY lines.",
      context: "R1(config-line)#",
      accept: ["trans|port inp|ut ssh"],
      canonical: "transport input ssh",
      explain: "This blocks Telnet. Add `login local` (or AAA) and RSA keys so SSH works.",
    },
    {
      id: "e-070",
      objective: "5.1.b",
      kind: "single",
      prompt: "With `aaa authentication login default group TAC local`, the TACACS+ server rejects a user's password. What happens?",
      choices: ["The router tries the local database", "Login fails", "The router tries RADIUS", "The user is placed at privilege 1"],
      answer: 1,
      explain: "The next method is used only on an ERROR (server unreachable). A FAIL (reject) is final.",
    },
    {
      id: "e-071",
      objective: "5.1.b",
      kind: "multi",
      prompt: "Which TWO statements describe TACACS+ compared with RADIUS?",
      choices: ["Uses TCP 49", "Encrypts the entire packet body", "Combines authentication and authorization", "Uses UDP 1812", "Is the usual choice for 802.1X"],
      answer: [0, 1],
      explain: "TACACS+ uses TCP 49, encrypts the full payload and separates the three A's. That makes it the usual choice for device administration.",
    },
    {
      id: "e-072",
      objective: "5.1.b",
      kind: "cli",
      prompt: "Enable AAA on the device (the first step before any method lists).",
      context: "R1(config)#",
      accept: ["aaa new-m|odel"],
      canonical: "aaa new-model",
      explain: "This turns on AAA. Keep a console session open, because line authentication changes immediately.",
    },
    {
      id: "e-073",
      objective: "5.2.a",
      kind: "single",
      prompt: "Which wildcard mask matches only the hosts 10.1.1.0 to 10.1.1.3?",
      choices: ["0.0.0.3", "0.0.0.4", "255.255.255.252", "0.0.0.7"],
      answer: 0,
      explain: "A /30 has a wildcard of 0.0.0.3. The last two bits are ignored, so the match covers .0 to .3.",
    },
    {
      id: "e-074",
      objective: "5.2.a",
      kind: "single",
      prompt: "Where should a standard ACL normally be placed?",
      choices: ["As close to the source as possible", "As close to the destination as possible", "On the core layer", "On the VTY lines only"],
      answer: 1,
      explain: "Standard ACLs match only the source, so placing them close to the source could block that source from reaching other destinations too.",
    },
    {
      id: "e-075",
      objective: "5.2.b",
      kind: "single",
      prompt: "How is a CoPP policy applied?",
      choices: ["service-policy input under each interface", "service-policy input under control-plane", "ip access-group under control-plane", "service-policy output under the VTY lines"],
      answer: 1,
      explain: "CoPP uses MQC, attached inbound to the `control-plane` pseudo-interface.",
    },
    {
      id: "e-076",
      objective: "5.3",
      kind: "single",
      prompt: "Which practice weakens REST API security?",
      choices: ["Using short-lived OAuth tokens", "Sending HTTP Basic credentials over plain HTTP", "Storing secrets in a vault", "Applying RBAC to API users"],
      answer: 1,
      explain: "Basic auth is only base64 encoded, so anyone on the path can read it. Always use TLS.",
    },
    {
      id: "e-077",
      objective: "5.4",
      kind: "single",
      prompt: "Which technology encrypts traffic hop by hop at Layer 2 between switches?",
      choices: ["IPsec", "MACsec", "TrustSec SGACL", "SSL VPN"],
      answer: 1,
      explain: "MACsec (802.1AE) encrypts at the link layer, with keys from MKA.",
    },
    {
      id: "e-078",
      objective: "5.4",
      kind: "single",
      prompt: "TrustSec makes access decisions based on what?",
      choices: ["Source IP subnets", "Security Group Tags assigned at authentication", "VLAN IDs", "DSCP markings"],
      answer: 1,
      explain: "ISE assigns an SGT when a user or device authenticates, and SGACLs enforce policy between groups regardless of IP address.",
    },
    {
      id: "e-079",
      objective: "5.4",
      kind: "single",
      prompt: "Which Cisco product uses NetFlow telemetry to detect anomalous behaviour inside the network?",
      choices: ["Secure Endpoint", "Secure Network Analytics", "Umbrella", "Duo"],
      answer: 1,
      explain: "Secure Network Analytics (formerly Stealthwatch) builds behavioural baselines from flow data.",
    },

    // 6.x Automation and AI
    {
      id: "e-080",
      objective: "6.1",
      kind: "single",
      prompt: "`devices = {\"r1\": \"10.0.0.1\", \"r2\": \"10.0.0.2\"}`. What does `devices[\"r2\"]` return?",
      choices: ["\"r2\"", "\"10.0.0.2\"", "1", "KeyError"],
      answer: 1,
      explain: "Dictionary lookup by key returns the value.",
    },
    {
      id: "e-081",
      objective: "6.1",
      kind: "single",
      prompt: "What does `r.json()` return on a `requests` response?",
      choices: ["A raw string", "The decoded JSON body as Python objects (dict/list)", "The HTTP status code", "The headers"],
      answer: 1,
      explain: "`.json()` parses the body. Use `.status_code` for the code and `.text` for the raw string.",
    },
    {
      id: "e-082",
      objective: "6.2",
      kind: "single",
      prompt: "Which snippet is valid JSON?",
      choices: [
        "{'name': 'R1'}",
        "{\"name\": \"R1\", \"up\": True}",
        "{\"name\": \"R1\", \"up\": true}",
        "{\"name\": \"R1\", \"up\": true,}",
      ],
      answer: 2,
      explain: "JSON needs double quotes, lowercase booleans and no trailing comma.",
    },
    {
      id: "e-083",
      objective: "6.3",
      kind: "single",
      prompt: "In YANG, which statement defines a single value with a type, such as an interface MTU?",
      choices: ["container", "list", "leaf", "grouping"],
      answer: 2,
      explain: "A leaf holds one value. A leaf-list holds several values. A list holds keyed entries, and a container groups nodes.",
    },
    {
      id: "e-084",
      objective: "6.3",
      kind: "single",
      prompt: "What does OpenConfig provide compared with Cisco native YANG models?",
      choices: ["Encrypted transport", "Vendor-neutral models for multi-vendor automation", "Faster CLI parsing", "SNMP MIB compatibility"],
      answer: 1,
      explain: "OpenConfig is an operator-led set of common models, so the same payload can configure different vendors.",
    },
    {
      id: "e-085",
      objective: "6.4",
      kind: "single",
      prompt: "After getting a Catalyst Center token, which header should carry it?",
      choices: ["Authorization: Bearer", "X-Auth-Token", "X-XSRF-TOKEN", "Cookie: JSESSIONID"],
      answer: 1,
      explain: "Catalyst Center expects X-Auth-Token. SD-WAN Manager uses a JSESSIONID cookie plus X-XSRF-TOKEN.",
    },
    {
      id: "e-086",
      objective: "6.4",
      kind: "single",
      prompt: "A script logs in to SD-WAN Manager and GET requests work, but POST requests are rejected. What is missing?",
      choices: ["X-Auth-Token header", "X-XSRF-TOKEN header", "OAuth scope", "NETCONF session"],
      answer: 1,
      explain: "State-changing calls need the token from /dataservice/client/token in the X-XSRF-TOKEN header.",
    },
    {
      id: "e-087",
      objective: "6.5",
      kind: "single",
      prompt: "An API call returns 403. What does it mean?",
      choices: ["Invalid or missing credentials", "Authenticated but not authorised for this resource", "Resource not found", "Server error"],
      answer: 1,
      explain: "401 = authentication failed. 403 = authenticated but forbidden.",
    },
    {
      id: "e-088",
      objective: "6.5",
      kind: "single",
      prompt: "A Catalyst Center POST returns 202 with a taskId. What should the script do next?",
      choices: ["Treat the call as failed", "Poll the task API until it completes", "Retry the POST immediately", "Re-authenticate"],
      answer: 1,
      explain: "202 Accepted means the request is queued for asynchronous processing. Poll /dna/intent/api/v1/task/{taskId}.",
    },
    {
      id: "e-089",
      objective: "6.5",
      kind: "single",
      prompt: "A RESTCONF PATCH succeeds with no response body. Which status code is expected?",
      choices: ["200", "201", "204", "302"],
      answer: 2,
      explain: "204 No Content means the change succeeded and there is nothing to return.",
    },
    {
      id: "e-090",
      objective: "6.6",
      kind: "single",
      prompt: "An EEM applet has actions labelled 1, 2, ... 9, 10. In what order do they run?",
      choices: ["1 through 10 numerically", "1, 10, 2, 3, ... 9 (string sort)", "In the order they were typed", "Randomly"],
      answer: 1,
      explain: "Labels are sorted as strings. Use labels like 1.0, 2.0 ... or 010, 020 to keep the order predictable.",
    },
    {
      id: "e-091",
      objective: "6.6",
      kind: "cli",
      prompt: "Create an EEM applet named BACKUP.",
      context: "R1(config)#",
      accept: ["ev|ent man|ager app|let BACKUP"],
      canonical: "event manager applet BACKUP",
      explain: "Then define one `event` line and numbered `action` lines.",
    },
    {
      id: "e-092",
      objective: "6.7",
      kind: "single",
      prompt: "Which configuration management tool is agentless and pushes changes over SSH?",
      choices: ["Puppet", "Chef", "Ansible", "SaltStack (minion mode)"],
      answer: 2,
      explain: "Ansible connects out from the control node. Puppet and Chef rely on agents that pull from a server.",
    },
    {
      id: "e-093",
      objective: "6.7",
      kind: "single",
      prompt: "What language are Chef recipes written in?",
      choices: ["YAML", "Ruby", "Python", "Puppet DSL"],
      answer: 1,
      explain: "Chef uses a Ruby DSL (recipes and cookbooks). Ansible uses YAML. Puppet has its own declarative DSL.",
    },
  ],
};
