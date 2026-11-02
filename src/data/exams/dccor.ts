import type { Exam } from "../types";
import { dccorBankA } from "./dccor-bank-a";
import { dccorBankB } from "./dccor-bank-b";
import { dccorBankC } from "./dccor-bank-c";
import { dccorBankD } from "./dccor-bank-d";
import { dccorBankE } from "./dccor-bank-e";
import { dccorBankF } from "./dccor-bank-f";

// Blueprint: Implementing Cisco Data Center Core Technologies v1.2 (350-601 DCCOR), exam topics
// document © 2024. The core exam for CCNP Data Center and the qualifier for the CCIE Data Center lab.
// 1.1's lettered items are separate objectives here; other lettered items live in their parent's notes.

export const dccor: Exam = {
  id: "dccor",
  code: "350-601",
  short: "DCCOR",
  name: "Implementing Cisco Data Center Core Technologies",
  version: "v1.2",
  minutes: 120,
  approxItems: 100,
  role: "core",
  blueprintUrl: "https://learningcontent.cisco.com/documents/marketing/exam-topics/350-601-DCCOR-v1.2.pdf",
  domains: [
    {
      id: "1.0",
      name: "Network",
      weight: 25,
      objectives: [
        {
          id: "1.1.a",
          title: "OSPFv2 and OSPFv3 on NX-OS",
          brief:
            "NX-OS runs OSPF as a feature with a named process. Interfaces join an area directly under the interface, and data centre fabrics use point-to-point links with BFD for fast, simple underlays.",
          keys: [
            "Enable first: `feature ospf` (OSPFv2) and `feature ospfv3`. Features are off until enabled.",
            "Process tags are names or numbers: `router ospf UNDERLAY`. Interfaces join with `ip router ospf UNDERLAY area 0.0.0.0` (there is no `network` statement).",
            "OSPFv3: `ipv6 router ospfv3 UNDERLAY area 0` on the interface. It runs over IPv6 link-local addresses and uses IPsec or the authentication trailer, not its own MD5.",
            "Spine-leaf links: `ip ospf network point-to-point` skips DR/BDR election and the type 2 LSA. Unnumbered links (`ip unnumbered loopback0`) save addresses.",
            "Fast failure detection: `feature bfd` plus `bfd` under the OSPF process or interface.",
            "Neighbours need matching area, subnet, hello/dead timers, MTU, authentication and stub flags.",
          ],
          cli: `feature ospf
router ospf UNDERLAY
  router-id 10.0.0.11
interface Ethernet1/49
  no switchport
  ip address 10.1.1.1/31
  ip ospf network point-to-point
  ip router ospf UNDERLAY area 0.0.0.0
  no shutdown`,
          trap: "NX-OS has no `network ... area` under `router ospf`. Interfaces join OSPF with `ip router ospf <tag> area <id>`.",
        },
        {
          id: "1.1.b",
          title: "MP-BGP (including the EVPN address family)",
          brief:
            "Multiprotocol BGP carries several address families over one session. In VXLAN EVPN fabrics, iBGP with spines as route reflectors distributes MAC/IP reachability (l2vpn evpn) over an IGP underlay.",
          keys: [
            "Address families: `ipv4 unicast`, `ipv6 unicast`, `l2vpn evpn`. Each neighbour activates the families it carries.",
            "EVPN needs extended communities for route targets: `send-community extended` (or `both`) under the neighbour's address family.",
            "Spines are usually iBGP route reflectors (`route-reflector-client` per leaf), so leaves don't need a full mesh.",
            "EVPN route types: 2 = MAC/IP advertisement, 3 = inclusive multicast (VTEP flood list), 5 = IP prefix.",
            "RD makes routes unique, RT controls import/export. `rd auto` and `route-target both auto` derive them from the router ID, ASN and VNI.",
            "Sessions to loopbacks need `update-source loopback0`. eBGP also needs `ebgp-multihop` or `disable-connected-check`.",
          ],
          cli: `feature bgp
feature nv overlay
nv overlay evpn
router bgp 65001
  router-id 10.0.0.1
  neighbor 10.0.0.11
    remote-as 65001
    update-source loopback0
    address-family l2vpn evpn
      send-community extended
      route-reflector-client`,
          trap: "Without `send-community extended`, EVPN routes lose their route targets and VTEPs won't import them.",
        },
        {
          id: "1.1.c",
          title: "PIM",
          brief:
            "PIM builds multicast distribution trees using the unicast routing table for RPF checks. In data centres it carries application multicast and, in VXLAN fabrics, the underlay for BUM traffic.",
          keys: [
            "`feature pim`, then `ip pim sparse-mode` on every interface in the multicast path.",
            "Sparse mode needs an RP: static `ip pim rp-address 10.254.254.1 group-list 239.0.0.0/8`, Auto-RP, or BSR.",
            "Anycast RP gives a redundant RP on two spines sharing the same address: `ip pim anycast-rp <rp> <member>`.",
            "RPF check: a multicast packet is accepted only on the interface the router would use to reach the source (or the RP for shared trees).",
            "Bidir-PIM suits many-to-many traffic such as VXLAN BUM: one shared tree, no source state.",
            "IGMP on host-facing interfaces, and IGMP snooping on switches, limit multicast to interested ports.",
          ],
          cli: `feature pim
ip pim rp-address 10.254.254.1 group-list 239.1.1.0/24
interface Ethernet1/49
  ip pim sparse-mode`,
          trap: "A multicast stream that stops at one hop is usually an RPF failure: the unicast route back to the source points out a different interface.",
        },
        {
          id: "1.1.d",
          title: "FHRP: HSRP and VRRP on NX-OS",
          brief:
            "NX-OS provides HSRP and VRRP for default-gateway redundancy. With vPC, both peers forward traffic sent to the virtual MAC, and VXLAN EVPN fabrics often replace FHRP with a distributed anycast gateway.",
          keys: [
            "`feature hsrp` and `feature interface-vlan`. Under the SVI: `hsrp version 2`, `hsrp 10`, then `ip 10.1.10.1`, `priority`, `preempt`.",
            "HSRP default priority 100, highest wins, then highest IP. Preempt is off by default.",
            "`feature vrrp`: `vrrp 10`, `address 10.1.10.1`. VRRP preempts by default and the address owner gets priority 255.",
            "With vPC, the HSRP standby router also forwards traffic sent to the virtual MAC (active/active forwarding), so the peer-link carries less.",
            "VXLAN EVPN: `fabric forwarding mode anycast-gateway` gives every leaf the same gateway IP and MAC, with no FHRP at all.",
            "Virtual MACs: HSRPv1 0000.0c07.acXX, HSRPv2 0000.0c9f.fXXX, VRRP 0000.5e00.01XX.",
          ],
          cli: `feature hsrp
feature interface-vlan
interface Vlan10
  ip address 10.1.10.2/24
  hsrp version 2
  hsrp 10
    ip 10.1.10.1
    priority 110
    preempt`,
          trap: "In a vPC domain the HSRP 'standby' still routes traffic: both vPC peers forward frames addressed to the virtual MAC.",
        },
        {
          id: "1.2",
          title: "Switching: Rapid PVST+, MST, LACP and vPC",
          brief:
            "Data centre access uses LACP port-channels, and vPC lets two Nexus switches present one logical switch to downstream devices, so every link forwards without spanning tree blocking any of them.",
          keys: [
            "Rapid PVST+ runs one RSTP instance per VLAN. MST maps many VLANs to a few instances, which scales better.",
            "LACP: `feature lacp`, then `channel-group 10 mode active` (or passive). `mode on` is static with no negotiation.",
            "vPC parts: vPC domain, peer-keepalive (a separate L3 path, often the mgmt VRF), peer-link (a port-channel trunk), and vPC member port-channels (`vpc 20`).",
            "Role: lower `role priority` becomes primary. If the peer-link fails while keepalive is up, the secondary suspends its vPC member ports.",
            "Consistency checks: type 1 mismatches (such as STP mode or MTU) suspend vPCs; type 2 mismatches only log.",
            "Loop rule: a frame that crosses the peer-link is not sent out a vPC member port whose twin on the other peer is up.",
            "`peer-gateway` lets each peer route frames sent to the other peer's MAC. `auto-recovery` restores vPCs if a peer never comes back.",
          ],
          cli: `feature vpc
feature lacp
vpc domain 10
  role priority 100
  peer-keepalive destination 192.168.0.2 source 192.168.0.1 vrf management
  peer-gateway
interface port-channel1
  switchport mode trunk
  vpc peer-link
interface port-channel20
  switchport mode trunk
  vpc 20`,
          trap: "Peer-keepalive must not run over the peer-link. It must tell 'peer is dead' apart from 'peer-link is down'.",
        },
        {
          id: "1.3",
          title: "VXLAN EVPN",
          brief:
            "VXLAN carries Layer 2 segments over a routed underlay, and BGP EVPN is its control plane: it advertises MAC and IP reachability and the list of VTEPs per VNI, removing flood-and-learn.",
          keys: [
            "Features: `feature nv overlay`, `feature vn-segment-vlan-based`, `nv overlay evpn`, `feature bgp`.",
            "Map a VLAN to a VNI with `vn-segment 10010` under `vlan 10`. The NVE interface (`interface nve1`) is the VTEP, sourced from a loopback.",
            "`host-reachability protocol bgp` turns on EVPN learning. BUM uses `ingress-replication protocol bgp` or a multicast group (`mcast-group`).",
            "L2VNI bridges within a segment. L3VNI (one per VRF) routes between segments with symmetric IRB.",
            "Distributed anycast gateway: `fabric forwarding anycast-gateway-mac` globally and `fabric forwarding mode anycast-gateway` on SVIs.",
            "`suppress-arp` (under the NVE member VNI) lets the leaf answer ARP from EVPN information, cutting flooding.",
          ],
          cli: `vlan 10
  vn-segment 10010
interface nve1
  no shutdown
  host-reachability protocol bgp
  source-interface loopback1
  member vni 10010
    ingress-replication protocol bgp
evpn
  vni 10010 l2
    rd auto
    route-target import auto
    route-target export auto`,
          trap: "VXLAN adds 50 bytes. Underlay links need jumbo MTU (9216 is normal) or large frames are dropped.",
        },
        {
          id: "1.4",
          title: "ACI: fabric setup, access policies and VMM",
          brief:
            "ACI is a policy-driven spine-leaf fabric controlled by an APIC cluster. Fabric discovery is automatic, access policies say how ports are used, and VMM integration extends policy into the hypervisor.",
          keys: [
            "APIC cluster: usually 3 controllers. Setup asks for the fabric name, TEP pool, infra VLAN and controller IDs. Leaves and spines are discovered with LLDP and registered by serial number.",
            "Underlay: IS-IS for TEP reachability, COOP on spines for endpoint mapping, MP-BGP to share external routes. None of it is configured by hand.",
            "Access policy chain: VLAN pool → domain (physical, VMM or L3Out) → AAEP → interface policy group → interface profile (port selectors) → switch profile (leaf selectors).",
            "Tenant policy: tenant → VRF → bridge domain (subnets) → EPG. Contracts between EPGs allow traffic (allow-list).",
            "VMM: APIC connects to vCenter, creates a distributed switch, and each EPG associated with the VMM domain becomes a port group.",
            "Resolution and deployment immediacy (immediate, on-demand, pre-provision) control when VLANs and policies are pushed to leaves.",
          ],
          trap: "A static port binding or VMM EPG fails silently if the VLAN isn't in a pool linked through domain → AAEP → that port's policy group.",
        },
        {
          id: "1.5",
          title: "Packet flow: unicast, multicast and broadcast",
          brief:
            "Troubleshooting means knowing exactly how each frame type is forwarded: learned unicast by table lookup, unknown unicast and broadcast by flooding, multicast by snooping or PIM state, plus how overlays and vPC change each case.",
          keys: [
            "Known unicast: MAC table lookup in the VLAN. Routed traffic: longest-prefix match, TTL decrement, MAC rewrite (source = router, destination = next hop).",
            "Broadcast and unknown unicast: flooded to every forwarding port in the VLAN except the one it arrived on.",
            "Multicast: flooded unless IGMP snooping limits it to ports with receivers and mrouter ports. Routed multicast follows PIM state after the RPF check.",
            "VXLAN BUM: replicated to every VTEP in the VNI by ingress replication (unicast copies) or sent once to an underlay multicast group.",
            "vPC: traffic hashes across both peers. Frames that cross the peer-link don't go out a vPC member port whose twin is up.",
            "ACI: unknown unicast can go to the spine proxy (hardware proxy) instead of flooding. ARP can be flooded or directed per bridge domain.",
          ],
          trap: "An ARP request is a broadcast but its reply is unicast. Asymmetric problems (request seen, no reply) often point to a MAC or ARP table issue on the return path.",
        },
        {
          id: "1.6",
          title: "Cloud service and deployment models (NIST SP 800-145)",
          brief:
            "NIST defines cloud computing by five essential characteristics, three service models and four deployment models. Exam questions map scenarios onto these terms.",
          keys: [
            "Characteristics: on-demand self-service, broad network access, resource pooling, rapid elasticity, measured service.",
            "IaaS: the consumer controls OS, storage and applications, but not the underlying infrastructure.",
            "PaaS: the consumer deploys applications on the provider's platform and runtime.",
            "SaaS: the consumer uses the provider's application. At most user-specific settings are configurable.",
            "Deployment models: private (one organisation), community (shared concern), public (general public), hybrid (two or more bound together, e.g. cloud bursting).",
          ],
          trap: "Hybrid isn't just 'some cloud and some on-prem'. NIST requires the clouds to stay distinct but be bound by technology that allows data and application portability.",
        },
        {
          id: "1.7",
          title: "Software updates: disruptive vs non-disruptive, EPLD, patches",
          brief:
            "NX-OS upgrades range from fully disruptive reloads to in-service upgrades (ISSU) that keep forwarding. EPLD images update hardware logic and need module reloads, and SMUs patch specific bugs without a full upgrade.",
          keys: [
            "`show install all impact nxos bootflash:<image>` predicts whether an upgrade is disruptive before you run it.",
            "`install all nxos bootflash:<image>` performs the upgrade, using ISSU where the platform and path support it.",
            "EPLD (Electronic Programmable Logical Device) upgrades: `install epld bootflash:<img> module all`. Disruptive, because modules reload.",
            "SMU patches: `install add`, `install activate`, `install commit` to keep them across reloads.",
            "With vPC, upgrade one peer at a time (secondary first is common), checking consistency between steps.",
          ],
          trap: "A non-disruptive ISSU for NX-OS doesn't make an EPLD upgrade non-disruptive. EPLD always reloads the affected modules.",
        },
        {
          id: "1.8",
          title: "Network configuration management",
          brief:
            "Keep configuration recoverable and consistent: checkpoints and rollback on the box, configuration replace to return to a golden config, archives off the box, and controller-driven compliance at scale.",
          keys: [
            "`checkpoint NAME` saves the running config. NX-OS also takes automatic checkpoints before some changes.",
            "`rollback running-config checkpoint NAME` with modes atomic (default: all or nothing), best-effort and stop-at-first-failure.",
            "`show diff rollback-patch running-config checkpoint NAME` previews the commands a rollback would apply (source first, then destination).",
            "`configure replace bootflash:golden.cfg` replaces the whole running config with a file, applying only the differences.",
            "`copy running-config startup-config` persists changes. Back up off-box with `copy running-config scp://... vrf management`.",
            "Nexus Dashboard (fabric controller) templates detect configuration drift (compliance) and can deploy fixes.",
          ],
          cli: `checkpoint before-change
! ...make changes...
show diff rollback-patch running-config checkpoint before-change
rollback running-config checkpoint before-change atomic`,
          trap: "Checkpoints live on the switch and are lost by `write erase` and reloads into a clean config, so they don't replace off-box backups.",
        },
        {
          id: "1.9",
          title: "Infrastructure monitoring: NetFlow, SPAN, Nexus Dashboard",
          brief:
            "Traditional tools copy or summarise traffic: SPAN/ERSPAN mirrors packets and NetFlow records flows. AI-powered tools such as Nexus Dashboard Insights add anomaly detection and correlation across the fabric.",
          keys: [
            "NetFlow on NX-OS: `feature netflow`, flow record (match/collect), flow exporter (destination, `use-vrf`, transport, version 9), flow monitor, applied with `ip flow monitor M input`.",
            "SPAN: `monitor session 1`, `source interface ethernet1/1 both`, `destination interface ethernet1/48`, `no shut`. The destination needs `switchport monitor`.",
            "ERSPAN: `monitor session 2 type erspan-source` with destination IP and erspan-id, to an analyser across L3.",
            "Nexus Dashboard Insights: anomalies, advisories (PSIRTs and field notices), flow analytics with drop reasons, endpoint and microburst analytics.",
            "Telemetry and flow data in NDI come from the switches' hardware telemetry and streaming, not from polling.",
          ],
          trap: "An NX-OS SPAN session is created shut down. Without `no shutdown` nothing is mirrored.",
        },
        {
          id: "1.10",
          title: "Network assurance and streaming telemetry",
          brief:
            "Assurance continuously checks that the network does what it's meant to, using streamed state rather than periodic polling. NX-OS streams model-driven data on change or on a schedule.",
          keys: [
            "Dial-out: the switch is configured with destination groups, sensor groups and subscriptions, and pushes data (gRPC/GPB, or JSON over HTTP).",
            "Dial-in: a collector subscribes with gNMI. The switch's gRPC agent serves it.",
            "Sources: DME paths (`sys/intf`, `sys/bgp`), YANG/OpenConfig paths, or NX-API CLI output (`show` commands).",
            "Sample-interval subscriptions stream periodically. Event subscriptions (`sample-interval 0`) stream on change.",
            "Assurance compares observed state with intent: is the endpoint where policy says, is the route present, are links error-free.",
          ],
          cli: `feature telemetry
telemetry
  destination-group 1
    ip address 10.0.0.50 port 57000 protocol gRPC encoding GPB
  sensor-group 1
    data-source DME
    path sys/bgp depth unbounded
  subscription 1
    dst-grp 1
    snsr-grp 1 sample-interval 30000`,
          trap: "`sample-interval 0` doesn't mean 'disabled'. It means event-driven streaming.",
        },
        {
          id: "1.11",
          title: "Nexus Dashboard capabilities",
          brief:
            "Nexus Dashboard is Cisco's data centre operations platform. On one cluster it provides fabric control for NX-OS and SAN, insights and assurance for NX-OS and ACI, and multi-site orchestration.",
          keys: [
            "Deployed as a physical or virtual cluster (commonly 3 nodes). Sites (ACI, NX-OS or SAN fabrics) are onboarded to it.",
            "Fabric control (formerly NDFC/DCNM): builds and manages VXLAN EVPN, classic LAN, IP fabric for media and SAN fabrics from templates.",
            "Insights (NDI): anomaly detection, flow analytics, delta analysis between snapshots, pre-change analysis, advisories and compliance.",
            "Orchestrator (NDO): pushes consistent tenants, VRFs and policies across multiple ACI or NX-OS sites.",
            "Has a REST API and integrates with Ansible and Terraform for automation.",
          ],
          trap: "Pre-change analysis predicts a change's impact against a fabric model before you deploy. It doesn't make the change.",
        },
      ],
    },
    {
      id: "2.0",
      name: "Compute",
      weight: 25,
      objectives: [
        {
          id: "2.1",
          title: "UCS C-Series rack servers",
          brief:
            "Rack servers can run standalone and be managed through CIMC, be managed by UCS Manager through fabric interconnects, or be managed from Intersight. The choice decides how policies, firmware and networking are handled.",
          keys: [
            "CIMC (Cisco Integrated Management Controller): web UI, CLI, IPMI and Redfish for standalone servers. Its NIC mode can be dedicated, shared LOM or Cisco card.",
            "Managed by UCS Manager: connect the VIC to the fabric interconnects (single-wire management carries data and management on the same links).",
            "Intersight: standalone servers are claimed through the device connector, and FI-attached servers can run in Intersight Managed Mode.",
            "VIC adapters present virtual NICs and HBAs to the OS, configured by policy rather than per card.",
            "Firmware for standalone servers: Host Upgrade Utility (HUU) ISO, or Intersight firmware upgrade.",
          ],
          trap: "In standalone mode, UCS Manager service profiles don't apply. Configuration comes from CIMC or Intersight standalone policies.",
        },
        {
          id: "2.2",
          title: "UCS blade chassis with UCS Manager",
          brief:
            "UCS Manager runs on the fabric interconnect pair and manages blades and rack servers through pools, policies, templates and service profiles, so server identity and configuration are abstracted from the hardware.",
          keys: [
            "Initial setup: console on FI A creates the cluster (cluster IP, management IPs, admin password). FI B joins as subordinate. L1/L2 links carry cluster heartbeat.",
            "Ports: server ports to IOMs or FEXes, uplink ports to the LAN, FC uplinks to the SAN. Chassis discovery policy sets the minimum links.",
            "End-host mode (default): FIs don't run STP toward the LAN and pin server traffic to uplinks. FC is in end-host (NPV) mode by default.",
            "Pools: UUID, MAC, WWNN, WWPN, IP (for KVM) and server pools. Identities move with the service profile.",
            "Policies: boot, BIOS, maintenance (user-ack prevents surprise reboots), QoS system classes, network control (CDP), host firmware package.",
            "Templates: initial templates create independent copies, while updating templates keep linked profiles in sync. The same applies to vNIC/vHBA templates.",
            "SAN: create VSANs on the FIs, add vHBAs from WWPN pools, uplink FC ports to the MDS, and do zoning on the upstream SAN.",
            "Server management: server pools with qualification policies, and boot policies (local, SAN, PXE, virtual media).",
          ],
          trap: "Changing an updating service profile template can reboot every associated server at once, unless a maintenance policy requires user acknowledgement.",
        },
        {
          id: "2.3",
          title: "UCS X-Series in Intersight Managed Mode",
          brief:
            "UCS X-Series is a modular chassis managed from Intersight in Intersight Managed Mode (IMM). Policies and profiles live in Intersight and apply to fabric interconnects, chassis and servers.",
          keys: [
            "X9508 chassis with X-Series compute nodes, Intelligent Fabric Modules (IFMs) to the FIs, and X-Fabric modules for PCIe and GPU nodes.",
            "IMM: FIs (6400/6500 series) are set to Intersight mode at setup and claimed into Intersight. Configuration is no longer in UCS Manager.",
            "Domain profile: port, VLAN/VSAN, system QoS, NTP and network connectivity policies for the FI pair.",
            "Chassis profile: power, thermal and IMC access policies for the chassis.",
            "Server profile (often from a template): BIOS, boot, LAN/SAN connectivity, storage, power, virtual media.",
            "Pools (MAC, WWPN, UUID, IP) and policies are reusable objects within an Intersight organisation.",
          ],
          trap: "A fabric interconnect is in either UCS Manager mode or Intersight Managed Mode. Switching modes erases its configuration.",
        },
        {
          id: "2.4",
          title: "Firmware updates for blade and rack servers",
          brief:
            "UCS firmware is delivered in bundles and applied infrastructure first, then servers. Policies decide when servers reboot, so upgrades don't cause surprise outages.",
          keys: [
            "UCS Manager bundles: A (infrastructure: FIs, IOMs, UCS Manager), B (blade servers), C (rack servers).",
            "Auto Install: infrastructure upgrade first (UCS Manager, then IOMs, then subordinate FI, then primary FI after acknowledgement), then server firmware.",
            "Host firmware package policy sets the versions for adapters, BIOS, CIMC and storage controllers in each service profile.",
            "Maintenance policy 'user-ack' holds disruptive changes until an admin acknowledges them. 'Immediate' reboots straight away.",
            "Intersight: firmware upgrade per server or per domain, checked against the HCL (hardware compatibility list) for the OS and drivers.",
          ],
          trap: "During an FI upgrade, traffic fails over to the other FI only if hosts have redundant paths (dual vNICs or fabric failover).",
        },
        {
          id: "2.5",
          title: "Compute configuration management: backup and restore",
          brief:
            "UCS Manager backups come in types for different jobs: full state for disaster recovery of the same system, and XML configuration exports to import into a running or replacement system.",
          keys: [
            "Full state: binary snapshot of the whole system, restored during initial setup (disaster recovery).",
            "All configuration: XML export of system and logical configuration, imported into a running system.",
            "System configuration: admin settings (users, roles, management). Logical configuration: service profiles, VLANs, VSANs, pools, policies.",
            "Import modes: merge (add to the existing configuration) or replace (overwrite matching objects).",
            "Scheduled backup and export policies send backups to a remote server automatically.",
            "Intersight: policies and profiles live in the SaaS service, and profiles can be cloned or redeployed.",
          ],
          trap: "A full-state backup is restored at initial setup of an erased system. To bring configuration into a running system you import an all-configuration or logical backup.",
        },
        {
          id: "2.6",
          title: "Compute monitoring: SPAN and Intersight",
          brief:
            "UCS raises faults and statistics for every component, can mirror server and uplink traffic with traffic monitoring sessions, and reports health, alarms and compatibility through Intersight.",
          keys: [
            "UCS Manager faults have severity (critical to info) and a lifecycle: active, flapping, soaking, cleared, retained.",
            "Notifications: SNMP traps, syslog, Smart Call Home.",
            "Traffic monitoring sessions (SPAN on the FI): sources can be vNICs, vHBAs, uplink Ethernet or FC ports, VLANs or VSANs. The destination is an unused FI port to an analyser.",
            "Intersight: alarms, HCL status, firmware drift, advisories (security and field notices), and server telemetry.",
            "Thresholds on statistics (for example temperature or errors) raise faults before failures.",
          ],
          trap: "A UCS SPAN destination port must be unconfigured (not an uplink or server port) and dedicated to the analyser.",
        },
      ],
    },
    {
      id: "3.0",
      name: "Storage Network",
      weight: 20,
      objectives: [
        {
          id: "3.1",
          title: "Fibre Channel: fabric, VSANs, zoning, NPV/NPIV",
          brief:
            "Fibre Channel fabrics elect a principal switch, assign domain IDs and FCIDs, and provide name services. VSANs separate fabrics, zoning controls which initiators see which targets, and NPV/NPIV scale edge switches and virtual servers.",
          keys: [
            "Fabric init: ELP/ESC/EFP exchanges on E ports, principal switch by lowest priority then lowest WWN, which assigns domain IDs 1–239.",
            "FCID: 24-bit domain.area.port given at FLOGI. Then PLOGI to the target, PRLI for the upper-layer protocol, and FCNS (name server) registration.",
            "VSANs: isolated logical fabrics (`vsan database`, `vsan 10 interface fc1/1`). TE ports trunk several VSANs (EISL).",
            "Zoning: zones (members by pWWN, device-alias or FCID) grouped into a zoneset. Only the active zoneset enforces. Default zone is deny.",
            "Enhanced zoning and device-alias use CFS to lock and distribute changes fabric-wide (`zone commit`, `device-alias commit`).",
            "FC port-channels: up to 16 links, `channel mode active` negotiates, members join with `channel-group N force`.",
            "NPV: the edge switch logs servers into the core with its NP uplinks, uses no domain ID and runs no fabric services. The core needs `feature npiv` to accept several FLOGIs on one F port.",
            "Port types: E, TE, F, NP, TF, TNP, SD (SPAN destination).",
          ],
          cli: `vsan database
  vsan 10 name PROD
  vsan 10 interface fc1/1
zone name HOST1_ARRAY1 vsan 10
  member pwwn 21:00:00:24:ff:4c:aa:01
  member pwwn 50:06:01:60:3b:20:11:22
zoneset name FABRIC_A vsan 10
  member HOST1_ARRAY1
zoneset activate name FABRIC_A vsan 10`,
          trap: "Editing a zone doesn't change enforcement until the zoneset is activated again. Only the active zoneset counts.",
        },
        {
          id: "3.2",
          title: "Network storage: NFS, iSCSI and friends",
          brief:
            "Storage reaches servers as files (NAS: NFS, SMB) or blocks (SAN: Fibre Channel, iSCSI, FCoE, NVMe-oF). Knowing which one an application needs determines the network design.",
          keys: [
            "NFS: file access over TCP 2049. NFSv3 is stateless, NFSv4 is stateful with integrated locking and Kerberos.",
            "iSCSI: SCSI over TCP 3260. Initiators and targets are named by IQN. CHAP authenticates, and LUN masking limits which LUNs an initiator sees.",
            "FCoE: FC frames in Ethernet, needs a lossless DCB network (PFC on the FCoE priority, typically CoS 3). FIP discovers the FCF.",
            "NVMe over Fabrics (FC-NVMe, NVMe/TCP, NVMe/RoCE): low-latency access to flash.",
            "Use separate VLANs or networks, jumbo frames and multipathing (MPIO) for IP storage.",
          ],
          trap: "iSCSI and NFS both use TCP/IP, but iSCSI is block storage (the host owns the file system) and NFS is file storage (the array owns it).",
        },
        {
          id: "3.3",
          title: "Storage switch software updates",
          brief:
            "MDS switches support non-disruptive upgrades on most platforms and paths, while EPLD upgrades reload modules. Plan upgrades per fabric (A then B) so hosts keep a path.",
          keys: [
            "`show install all impact` before upgrading, to see disruptive or non-disruptive per module.",
            "`install all` upgrades kickstart/system images (on MDS NX-OS releases that use two images) or the unified image.",
            "Directors with dual supervisors switch over during the upgrade, so data traffic keeps flowing.",
            "EPLD upgrades are disruptive to the modules being upgraded.",
            "Upgrade fabric A, verify every host path, then fabric B. Multipathing on hosts keeps I/O running.",
          ],
          trap: "'Non-disruptive' refers to the data path. The management session to the switch is still interrupted during the switchover.",
        },
        {
          id: "3.4",
          title: "Storage monitoring: SPAN and Nexus Dashboard",
          brief:
            "Storage troubleshooting combines frame capture (SPAN to a Fibre Channel analyser) with analytics: MDS SAN Analytics measures I/O latency and IOPS per flow, and Nexus Dashboard presents it fabric-wide.",
          keys: [
            "MDS SPAN: sources are interfaces or VSANs, and the destination is an SD port (`switchport mode SD`) connected to an FC analyser.",
            "Remote SPAN on MDS uses ST (source) and RD (destination) port types across the fabric.",
            "SAN Analytics (on 32G/64G MDS) inspects FC and SCSI/NVMe headers in hardware: exchange completion time, IOPS, throughput per initiator/target/LUN.",
            "Nexus Dashboard SAN (fabric controller for SAN plus SAN Insights) shows trends, anomalies and slow-drain issues.",
            "Slow drain: a device that returns buffer credits slowly backs up the fabric. Watch credit-loss and TxWait counters.",
          ],
          trap: "An FC SPAN destination is an SD port. You can't mirror FC traffic to an Ethernet port on an MDS.",
        },
      ],
    },
    {
      id: "4.0",
      name: "Automation and Artificial Intelligence",
      weight: 15,
      objectives: [
        {
          id: "4.1",
          title: "On-box automation: EEM, scheduler, shells, NX-API, Python",
          brief:
            "NX-OS can automate itself: EEM reacts to events, the scheduler runs jobs on a timer, Bash and Guest Shell give a Linux environment, NX-API exposes the CLI and object model over HTTP, and Python runs on the box.",
          keys: [
            "EEM: `event manager applet NAME`, `event cli match \"...\"` or `event syslog pattern`, then `action 1.0 ...`. `action event-default` lets the matched CLI command run.",
            "Scheduler: `feature scheduler`, `scheduler job name J` (commands), `scheduler schedule name S` with `job name J` and `time daily 02:00`.",
            "Bash: `feature bash-shell`, then `run bash`. Guest Shell: a CentOS-based container (`guestshell enable`, `guestshell run python3 ...`).",
            "NX-API: `feature nxapi`. NX-API CLI sends CLI over HTTP(S) (cli_show, cli_conf; JSON or XML). NX-API REST uses the DME object model (`/api/mo/sys/...`).",
            "On-box Python: `python bootflash:script.py`. The `cli` module provides `cli()`, `clid()` (JSON output) and `clip()`.",
          ],
          cli: `feature nxapi
event manager applet CONF-ALERT
  event cli match "conf t"
  action 1.0 syslog priority alerts msg "configuration mode entered"
  action 2.0 event-default`,
          trap: "Without `action event-default`, an EEM applet triggered by a CLI pattern blocks that command from running.",
        },
        {
          id: "4.2",
          title: "Automation and orchestration tools",
          brief:
            "Different tools suit different jobs: Ansible and Terraform for declarative configuration, Python for custom logic, POAP for zero-touch switch deployment, Nexus Dashboard and Intersight as controllers with APIs, and PowerShell for UCS.",
          keys: [
            "Ansible: agentless and YAML playbooks. The cisco.nxos collection uses SSH (network_cli) or NX-API (httpapi). Idempotent modules.",
            "Terraform: declarative HCL. Providers for ACI, Nexus Dashboard/NDFC, NX-OS and Intersight. `terraform plan` shows changes and `apply` makes them. A state file tracks what Terraform manages.",
            "Python: requests (REST), ncclient (NETCONF), netmiko (SSH), and Cisco SDKs (intersight, cobra for ACI).",
            "POAP: a switch with no startup config gets an IP and script location by DHCP, downloads a script (Python), then fetches its image and configuration.",
            "PowerShell: Cisco UCS PowerTool and the Intersight PowerShell module automate compute.",
            "Nexus Dashboard and Intersight: controllers with REST APIs and templates. Intersight Cloud Orchestrator builds workflows.",
          ],
          trap: "Terraform compares the desired configuration with its state file. Changes made outside Terraform show up as drift on the next plan.",
        },
        {
          id: "4.3",
          title: "High-performance networking for AI workloads",
          brief:
            "AI training fabrics need lossless, low-latency, high-bandwidth Ethernet. Nexus switches provide RoCEv2 with PFC and ECN, 400G/800G ports, and dynamic load balancing, and Nexus Dashboard deploys them from AI fabric templates.",
          keys: [
            "RoCEv2: RDMA over UDP 4791. Lossless with PFC on the no-drop class and ECN marking (DCQCN at the NICs).",
            "Back-end fabrics are non-blocking (1:1) and often rail-optimised. Job completion time is the metric that matters.",
            "Load distribution: hash on L4 ports (QP entropy), dynamic and flowlet load balancing.",
            "Nexus 9000 Cloud Scale and Silicon One switches, and Nexus Dashboard templates that apply consistent QoS.",
            "GPUDirect RDMA moves data NIC to GPU memory without the CPU.",
          ],
          trap: "ECN should engage before PFC. If the ECN thresholds are above the PFC pause threshold, PFC does all the work and pauses spread.",
        },
      ],
    },
    {
      id: "5.0",
      name: "Security",
      weight: 15,
      objectives: [
        {
          id: "5.1",
          title: "Network security: AAA/RBAC, ACI contracts, first-hop security, keychains, MACsec",
          brief:
            "Secure the network's control and data planes: central AAA with role-based access, policy-based segmentation in ACI, protection of the access edge, authenticated routing protocols, and link encryption.",
          keys: [
            "NX-OS RBAC: built-in roles network-admin and network-operator. Custom roles have rules (`rule 1 permit command \"show *\"`) and can be limited by VLAN, VRF or interface.",
            "AAA: `feature tacacs+`, server groups with `use-vrf management`, `aaa authentication login default group TAC`. Local accounts are used if the servers are unreachable.",
            "ACI contracts: provider and consumer EPGs, with subjects and filters. vzAny applies a contract to all EPGs in a VRF. Microsegmentation (uSeg EPGs) classifies endpoints by attributes such as VM name or IP.",
            "First-hop security: DHCP snooping (trusted ports toward the server), Dynamic ARP Inspection, IP Source Guard, and IPv6 RA Guard and snooping.",
            "Keychains: `key chain K`, `key 1`, `key-string`, with optional send and accept lifetimes for hitless rotation. Used by OSPF, EIGRP, BGP and others.",
            "MACsec (802.1AE): hop-by-hop link encryption with keys from MKA (pre-shared CAK in a keychain), AES-GCM-128/256.",
          ],
          trap: "DHCP snooping drops server replies on untrusted ports, so the uplink toward the DHCP server or relay must be `ip dhcp snooping trust`.",
        },
        {
          id: "5.2",
          title: "Compute security: AAA and RBAC on UCS",
          brief:
            "UCS Manager and Intersight control who can change what: roles define privileges, locales and organisations limit where they apply, and external identity providers authenticate users.",
          keys: [
            "UCS Manager roles: admin, read-only, server-profile, network, storage, operations, AAA. Custom roles combine privileges.",
            "Locales map users to organisations, so a team manages only its own servers and policies.",
            "Remote authentication: LDAP, RADIUS, TACACS+, with authentication domains selectable at login and a local fallback.",
            "Intersight: account roles and privileges per organisation, SSO through SAML identity providers, and API keys per user.",
            "Use least privilege and separate service accounts for automation.",
          ],
          trap: "A UCS user without a locale has access to the whole organisation tree. Locales restrict, so forgetting one grants everything.",
        },
        {
          id: "5.3",
          title: "Storage security: AAA/RBAC, port security, fabric binding",
          brief:
            "SAN security limits who can manage the fabric and which devices and switches may join it: RBAC for admins, port security for end devices, fabric binding for switches, plus zoning and link authentication.",
          keys: [
            "MDS RBAC: network-admin and network-operator roles, custom roles with rules, VSAN-based roles that restrict an admin to certain VSANs.",
            "Port security: `feature port-security`, a database per VSAN binding pWWN, nWWN or sWWN to interfaces, auto-learn mode, then `port-security activate vsan N`.",
            "Fabric binding: `feature fabric-binding`, a list of allowed switch WWNs and domain IDs per VSAN, activated per VSAN. Required for FICON.",
            "DHCHAP: authenticates switch-to-switch and host-to-switch FC links.",
            "Zoning is also a security control: initiators only see the targets in their zones.",
          ],
          trap: "Port security controls which devices log into which ports. Fabric binding controls which switches may join the fabric (ISLs).",
        },
      ],
    },
  ],
  questions: [...dccorBankA, ...dccorBankB, ...dccorBankC, ...dccorBankD, ...dccorBankE, ...dccorBankF],
};
