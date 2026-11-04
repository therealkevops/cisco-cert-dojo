import type { Question } from "../types";

// DCCOR bank G: 1.0 Network, bringing every objective to at least 16 questions with more exhibits and CLI.

export const dccorBankG: Question[] = [
  // 1.1.a OSPF
  {
    id: "c-901",
    objective: "1.1.a",
    kind: "single",
    prompt: "Refer to the exhibit. The neighbour stays in INIT. What does that state mean?",
    exhibit: `LEAF1# show ip ospf neighbors
 OSPF Process ID UNDERLAY VRF default
 Total number of neighbors: 1
 Neighbor ID     Pri State            Up Time  Address         Interface
 10.0.0.201        1 INIT/DROTHER     00:01:12 10.1.1.1        Eth1/49`,
    choices: ["LEAF1 receives the peer's hellos, but the peer isn't listing LEAF1 as a neighbour, so hellos only get through in one direction", "The adjacency is full", "The area IDs match and LSAs are exchanged", "The router IDs are duplicated"],
    answer: 0,
    explain: "Look for something that blocks LEAF1's hellos toward the peer: an ACL, a multicast problem or a one-way link.",
  },
  { id: "c-902", objective: "1.1.a", kind: "cli", prompt: "Set this fabric link's OSPF network type to point-to-point.", context: "LEAF1(config-if)#", accept: ["ip ospf net|work point-to-point"], canonical: "ip ospf network point-to-point", explain: "No DR/BDR election and faster adjacency on two-node links." },
  { id: "c-903", objective: "1.1.a", kind: "single", prompt: "What is the default OSPF reference bandwidth on NX-OS?", choices: ["40 Gb/s", "100 Mb/s", "1 Gb/s", "400 Gb/s"], answer: 0, explain: "Links faster than the reference all cost 1; raise it with `auto-cost reference-bandwidth` on 100G/400G fabrics and set it the same everywhere." },
  { id: "c-904", objective: "1.1.a", kind: "cli", prompt: "Set the OSPF router ID to 10.0.0.11.", context: "LEAF1(config-router)#", accept: ["router-id 10.0.0.11"], canonical: "router-id 10.0.0.11", explain: "A fixed router ID (usually loopback0) avoids surprises when interfaces change." },

  // 1.1.b BGP
  {
    id: "c-905",
    objective: "1.1.b",
    kind: "single",
    prompt: "Refer to the exhibit. What does the state of neighbour 10.0.0.201 tell you?",
    exhibit: `LEAF1# show bgp l2vpn evpn summary
Neighbor        V    AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd
10.0.0.201      4 65000       0      12        0    0    0 00:04:51 Active
10.0.0.202      4 65000    1834    1790      912    0    0 2d03h    412`,
    choices: ["The TCP session to 10.0.0.201 isn't established: check reachability of its loopback, update-source and remote-as", "The session is up and has received 0 prefixes", "10.0.0.201 is a route reflector client", "The neighbour is administratively shut down"],
    answer: 0,
    explain: "Active means BGP is trying to connect. A number in State/PfxRcd means the session is Established.",
  },
  { id: "c-906", objective: "1.1.b", kind: "cli", prompt: "Define neighbour 10.0.0.201 in remote AS 65000.", context: "LEAF1(config-router)#", accept: ["neigh|bor 10.0.0.201 remote-as 65000"], canonical: "neighbor 10.0.0.201 remote-as 65000", explain: "Or enter `neighbor 10.0.0.201` and set `remote-as 65000` in neighbour mode." },
  { id: "c-907", objective: "1.1.b", kind: "single", prompt: "What does `route-reflector-client` under a neighbour's l2vpn evpn address family do on a spine?", choices: ["The spine reflects EVPN routes learned from this iBGP peer to its other clients", "It makes the neighbour an eBGP peer", "It turns off route targets", "It stops the spine from sending routes"], answer: 0, explain: "Without it, iBGP split horizon would stop the spine passing leaf routes on to other leaves." },
  { id: "c-908", objective: "1.1.b", kind: "single", prompt: "Which EVPN route type elects the designated forwarder for a multi-homed Ethernet segment?", choices: ["Type 4 (Ethernet segment route)", "Type 2", "Type 3", "Type 5"], answer: 0, explain: "Type 1 (Ethernet A-D) routes support aliasing and mass withdrawal for the same segment." },

  // 1.1.c PIM
  {
    id: "c-909",
    objective: "1.1.c",
    kind: "single",
    prompt: "Refer to the exhibit. Receivers joined 239.1.1.1 but get no traffic. What is the most likely cause?",
    exhibit: `LEAF1# show ip mroute 239.1.1.1
(*, 239.1.1.1/32), uptime: 00:03:10, igmp ip pim
  Incoming interface: Null, RPF nbr: 0.0.0.0
  Outgoing interface list: (count: 1)
    Vlan10, uptime: 00:03:10, igmp`,
    choices: ["The router has no RPF path toward the RP (or no RP is known for the group)", "The source is sending too fast", "IGMP snooping is disabled", "The group is in the SSM range"],
    answer: 0,
    explain: "A (*,G) with a Null incoming interface can't join the shared tree. Check the RP mapping and the route to the RP.",
  },
  { id: "c-910", objective: "1.1.c", kind: "cli", prompt: "Enable PIM on this Nexus switch.", context: "LEAF1(config)#", accept: ["fea|ture pim"], canonical: "feature pim", explain: "Then `ip pim sparse-mode` on interfaces and an RP configuration." },
  { id: "c-911", objective: "1.1.c", kind: "single", prompt: "In PIM sparse mode, what does the designated router on the source's LAN do?", choices: ["Encapsulates the source's first packets in PIM Register messages to the RP", "Sends IGMP queries to the source", "Elects the RP", "Floods traffic to every PIM router"], answer: 0, explain: "The RP then joins toward the source, and the DR stops registering when native traffic arrives." },
  { id: "c-912", objective: "1.1.c", kind: "single", prompt: "On NX-OS, how can several anycast RPs share source information without MSDP?", choices: ["PIM Anycast-RP (RFC 4610), configured with `ip pim anycast-rp`", "IGMP snooping", "Bidir-PIM", "Static joins"], answer: 0, explain: "Each RP forwards Register information to the others in the anycast set." },

  // 1.1.d HSRP
  {
    id: "c-913",
    objective: "1.1.d",
    kind: "single",
    prompt: "Refer to the exhibit, taken on both distribution switches. What is wrong?",
    exhibit: `DIST1# show hsrp brief
  Interface   Grp  Prio P State    Active addr      Standby addr     Group addr
  Vlan10      10   110  P Active   local            unknown          10.1.10.1

DIST2# show hsrp brief
  Interface   Grp  Prio P State    Active addr      Standby addr     Group addr
  Vlan10      10   100  P Active   local            unknown          10.1.10.1`,
    choices: ["Both are active: the peers don't see each other's hellos (VLAN 10 not carried between them, an ACL, or mismatched group or version)", "DIST2 has the higher priority", "Preemption is off", "The virtual IP is wrong"],
    answer: 0,
    explain: "Standby 'unknown' on both sides confirms no hellos are received. Check the L2 path between them first.",
  },
  { id: "c-914", objective: "1.1.d", kind: "cli", prompt: "Set this HSRP group's priority to 110.", context: "DIST1(config-if-hsrp)#", accept: ["prio|rity 110"], canonical: "priority 110", explain: "Higher wins; add `preempt` so it takes the active role back after recovering." },
  { id: "c-915", objective: "1.1.d", kind: "cli", prompt: "Use HSRP version 2 on this interface.", context: "DIST1(config-if)#", accept: ["hsrp ver|sion 2"], canonical: "hsrp version 2", explain: "Version 2 allows group numbers up to 4095 and uses a different multicast address and virtual MAC range." },
  { id: "c-916", objective: "1.1.d", kind: "single", prompt: "What virtual MAC does HSRP version 1 group 10 use?", choices: ["0000.0c07.ac0a", "0000.0c9f.f00a", "0000.5e00.010a", "0100.5e00.000a"], answer: 0, explain: "v1: 0000.0c07.acXX (XX = group in hex). v2: 0000.0c9f.fXXX. VRRP: 0000.5e00.01XX." },

  // 1.2 vPC/STP
  {
    id: "c-917",
    objective: "1.2",
    kind: "single",
    prompt: "Refer to the exhibit from the vPC secondary. What happens to vPC 20?",
    exhibit: `N9K-B# show vpc consistency-parameters vpc 20
Name                        Type  Local Value            Peer Value
-------------               ----  ---------------------- -----------------------
mode                        1     on                     active
Speed                       1     25 Gb/s                25 Gb/s
Port Mode                   1     trunk                  trunk
Native Vlan                 1     1                      1
Allowed VLANs               -     120                    120`,
    choices: ["A type-1 mismatch (channel mode): with graceful consistency check, the secondary suspends its side of vPC 20", "Nothing, because allowed VLANs match", "Both peers keep forwarding with a warning", "The peer-link goes down"],
    answer: 0,
    explain: "Static `on` against LACP active is also a link-level problem: the LACP partner never bundles the static side.",
  },
  { id: "c-918", objective: "1.2", kind: "cli", prompt: "In the vPC domain, send keepalives to 10.0.0.12 from 10.0.0.11 over mgmt0's VRF.", context: "N9K-A(config-vpc-domain)#", accept: ["peer-keep|alive dest|ination 10.0.0.12 sou|rce 10.0.0.11 vrf manag|ement", "peer-keep|alive dest|ination 10.0.0.12 sou|rce 10.0.0.11"], canonical: "peer-keepalive destination 10.0.0.12 source 10.0.0.11 vrf management", explain: "VRF management is the default for the keepalive." },
  { id: "c-919", objective: "1.2", kind: "single", prompt: "What must match for two switches to be in the same MST region?", choices: ["Region name, revision number and VLAN-to-instance mapping", "Bridge priority only", "Port costs", "The number of VLANs"], answer: 0, explain: "A mismatch makes them separate regions, which interact through the CST." },

  // 1.3 VXLAN EVPN
  {
    id: "c-920",
    objective: "1.3",
    kind: "single",
    prompt: "Refer to the exhibit. What does LearnType CP mean?",
    exhibit: `LEAF1# show nve peers
Interface Peer-IP          State LearnType Uptime   Router-Mac
--------- ---------------  ----- --------- -------- -----------------
nve1      10.0.1.12        Up    CP        2d04h    5254.0012.ab01
nve1      10.0.1.13        Up    CP        2d04h    5254.0013.ab01`,
    choices: ["The peers were learned through the control plane (BGP EVPN), not by flood-and-learn", "The peers are customer premises", "Peer learning is disabled", "The peers are in a different VRF"],
    answer: 0,
    explain: "With flood-and-learn the type would be DP (data plane).",
  },
  { id: "c-921", objective: "1.3", kind: "cli", prompt: "Add VNI 10010 to this NVE interface.", context: "LEAF1(config-if-nve)#", accept: ["mem|ber vni 10010"], canonical: "member vni 10010", explain: "Then choose BUM handling under it, e.g. `ingress-replication protocol bgp` or `mcast-group`." },
  { id: "c-922", objective: "1.3", kind: "single", prompt: "In symmetric IRB, what is the L3VNI's VLAN and SVI on each leaf used for?", choices: ["Carrying routed traffic for the tenant VRF between VTEPs (the SVI has `ip forward` and no address)", "Hosting the anycast gateway for servers", "Carrying BUM traffic", "Management access"], answer: 0, explain: "Every leaf routes into and out of the shared L3VNI, so not every leaf needs every L2VNI." },

  // 1.4 ACI
  { id: "c-923", objective: "1.4", kind: "single", prompt: "Which ACI interface policy group type is used for a port-channel to a single leaf?", choices: ["PC interface policy group", "Leaf access port policy group", "VPC interface policy group", "Spine access policy group"], answer: 0, explain: "VPC policy groups span two leaves in a vPC pair; access policy groups are single ports." },
  { id: "c-924", objective: "1.4", kind: "single", prompt: "Which use suits a VLAN pool with dynamic allocation?", choices: ["A VMM domain, where APIC picks VLANs for the port groups it creates", "Static path bindings to bare-metal servers", "L3Out SVIs with fixed VLANs", "Fabric links between leaves and spines"], answer: 0, explain: "Static bindings need static allocation blocks." },
  {
    id: "c-925",
    objective: "1.4",
    kind: "single",
    prompt: "Refer to the exhibit. The VLAN is in the domain's pool. What should you fix?",
    exhibit: `Fault F0467  Severity: minor
Affected object: uni/tn-Shop/ap-SHOP/epg-App
Description: Configuration failed for node 103 eth1/5 due to Invalid Path
Configuration, debug message: invalid-path: Either the EpG is not associated
with a domain or the domain does not have this interface assigned to it`,
    choices: ["The access policies for node 103 eth1/5: a switch profile, interface profile and policy group whose AAEP includes the EPG's domain", "The bridge domain subnet", "The contract between EPGs", "The VRF enforcement"],
    answer: 0,
    explain: "invalid-path is about the port's access policies; invalid-vlan would point to the VLAN pool instead.",
  },
  { id: "c-926", objective: "1.4", kind: "single", prompt: "What does the ACI infrastructure VLAN carry?", choices: ["Internal fabric communication, such as between APICs and switches (and OpFlex to supported hypervisor switches)", "Tenant user traffic", "Management traffic for servers", "Storage replication"], answer: 0, explain: "It's chosen at setup and must not clash with VLANs used elsewhere; 3967 is a common choice." },

  // 1.5 Packet flow
  {
    id: "c-927",
    objective: "1.5",
    kind: "single",
    prompt: "Refer to the exhibit. Where is the host with MAC 0050.56aa.bbbb?",
    exhibit: `LEAF1# show mac address-table address 0050.56aa.bbbb
   VLAN     MAC Address      Type      age     Secure NTFY Ports
---------+-----------------+--------+---------+------+----+------------------
*   10     0050.56aa.bbbb   dynamic  0         F      F    nve1(10.0.1.12)`,
    choices: ["Behind the remote VTEP 10.0.1.12; frames to it are VXLAN-encapsulated toward that leaf", "On local port Eth1/12", "On the peer-link", "Nowhere; it will be flooded"],
    answer: 0,
    explain: "MACs learned over the overlay point to the NVE interface and the remote VTEP address.",
  },
  { id: "c-928", objective: "1.5", kind: "single", prompt: "A host sends a packet to an IP in another subnet. Which destination MAC does the frame carry?", choices: ["Its default gateway's MAC", "The destination host's MAC", "The broadcast MAC", "Its own MAC"], answer: 0, explain: "IP addresses stay end-to-end; MACs change at every routed hop." },
  { id: "c-929", objective: "1.5", kind: "single", prompt: "With ARP suppression on a VXLAN EVPN leaf, what happens to an ARP request for a remote host the leaf already knows through EVPN?", choices: ["The local leaf answers it from its EVPN-learned table, so it isn't flooded across the fabric", "It is flooded to every VTEP", "It is dropped", "It is sent to the spine to answer"], answer: 0, explain: "Unknown targets are still flooded through the BUM mechanism." },
  { id: "c-930", objective: "1.5", kind: "single", prompt: "With a multicast underlay, what is the outer destination IP of a VXLAN packet carrying broadcast traffic?", choices: ["The multicast group mapped to that VNI", "The destination VTEP's loopback", "255.255.255.255", "The anycast gateway IP"], answer: 0, explain: "With ingress replication, the leaf sends one unicast copy per remote VTEP instead." },

  // 1.6 Cloud models
  { id: "c-931", objective: "1.6", kind: "single", prompt: "Which NIST deployment model is provisioned for exclusive use by a single organisation?", choices: ["Private cloud", "Community cloud", "Public cloud", "Hybrid cloud"], answer: 0, explain: "It can be owned and operated by the organisation or a third party, on or off premises." },
  { id: "c-932", objective: "1.6", kind: "single", prompt: "Which NIST essential characteristic means resource use is monitored, controlled and reported?", choices: ["Measured service", "Broad network access", "Resource pooling", "On-demand self-service"], answer: 0, explain: "It makes pay-per-use billing possible." },
  { id: "c-933", objective: "1.6", kind: "single", prompt: "Under PaaS, who manages the operating system the application runs on?", choices: ["The provider", "The consumer", "Both equally", "Nobody"], answer: 0, explain: "The consumer controls the deployed application and its configuration." },
  { id: "c-934", objective: "1.6", kind: "multi", prompt: "Which TWO are NIST SP 800-145 service models?", choices: ["IaaS", "SaaS", "DaaS", "FaaS"], answer: [0, 1], explain: "The three NIST service models are IaaS, PaaS and SaaS." },

  // 1.7 Software updates
  {
    id: "c-935",
    objective: "1.7",
    kind: "single",
    prompt: "Refer to the exhibit. What will the upgrade do?",
    exhibit: `N9K# show install all impact nxos bootflash:nxos64-cs.10.4.3.F.bin
Compatibility check is done:
Module  bootable          Impact  Install-type  Reason
------  --------  --------------  ------------  ------
     1       yes      disruptive         reset  Incompatible image for ISSU`,
    choices: ["Reload the switch, interrupting traffic through it", "Upgrade without any traffic impact", "Only upgrade the EPLDs", "Fail because the image isn't bootable"],
    answer: 0,
    explain: "Plan a maintenance window, or move traffic away first (for example by shutting the vPC member or draining it).",
  },
  { id: "c-936", objective: "1.7", kind: "cli", prompt: "Show the software packages and SMUs that are active.", context: "N9K#", accept: ["sh|ow ins|tall act|ive"], canonical: "show install active", explain: "`show install inactive` lists packages added but not active." },
  { id: "c-937", objective: "1.7", kind: "single", prompt: "What is enhanced ISSU on a Nexus 9000?", choices: ["A non-disruptive upgrade where NX-OS runs in a container, so the data plane keeps forwarding while the control plane restarts", "An EPLD upgrade", "A faster disruptive upgrade", "An upgrade of the power supplies"], answer: 0, explain: "It needs the switch to boot in LXC mode (`boot mode lxc`) and a supported platform and release." },
  { id: "c-938", objective: "1.7", kind: "single", prompt: "Which Nexus 9000 platforms does Cisco's ISSU support matrix list for non-disruptive ISSU?", choices: ["Nexus 9300 top-of-rack switches (on supported release pairs)", "Nexus 9500 modular chassis only", "Every Nexus 9000 on every release", "None; Nexus 9000 upgrades are always disruptive"], answer: 0, explain: "On a modular 9500 the impact check reports that non-disruptive ISSU isn't supported. Always check the matrix for the exact source and target releases." },

  // 1.8 Config management
  { id: "c-939", objective: "1.8", kind: "cli", prompt: "Show the differences between the running and startup configuration.", context: "N9K#", accept: ["sh|ow run|ning-config diff"], canonical: "show running-config diff", explain: "Lines starting with + exist only in the running config." },
  { id: "c-940", objective: "1.8", kind: "single", prompt: "Which NX-OS rollback mode stops at the first failing command and keeps the changes already applied?", choices: ["stop-at-first-failure", "atomic", "best-effort", "verbose"], answer: 0, explain: "Atomic (the default) applies all or nothing; best-effort skips failures and continues." },
  { id: "c-941", objective: "1.8", kind: "single", prompt: "What does `write erase` do on NX-OS?", choices: ["Erases the startup configuration; the running configuration stays until the next reload", "Erases the running configuration immediately", "Deletes all checkpoints and images", "Reloads the switch"], answer: 0, explain: "After a reload the switch comes up with factory defaults." },
  { id: "c-942", objective: "1.8", kind: "single", prompt: "In Nexus Dashboard's fabric controller, what does an 'Out-of-Sync' switch mean?", choices: ["Its running configuration no longer matches the intent the controller holds for it", "The switch is offline", "The switch runs an unsupported release", "Its clock is wrong"], answer: 0, explain: "Deploying the pending configuration (or accepting the change into intent) brings it back in sync." },

  // 1.9 Monitoring
  { id: "c-943", objective: "1.9", kind: "cli", prompt: "Create local SPAN session 1.", context: "N9K(config)#", accept: ["mon|itor sess|ion 1"], canonical: "monitor session 1", explain: "Then set the source, destination and `no shut`." },
  { id: "c-944", objective: "1.9", kind: "cli", prompt: "In this SPAN session, mirror both directions of Ethernet1/10.", context: "N9K(config-monitor)#", accept: ["sou|rce int|erface <if:eth1/10> both", "sou|rce int|erface <if:eth1/10>"], canonical: "source interface ethernet1/10 both", explain: "Both is the default direction." },
  {
    id: "c-945",
    objective: "1.9",
    kind: "single",
    prompt: "Refer to the exhibit. The analyser receives nothing. What is the fix?",
    exhibit: `N9K# show monitor session 1
   session 1
---------------
type              : local
state             : down (Session admin shut)
source intf       :
    rx            : Eth1/10
    tx            : Eth1/10
    both          : Eth1/10
destination ports : Eth1/48`,
    choices: ["Enter the session and run `no shut`; NX-OS SPAN sessions are shut by default", "Change the destination to a port-channel", "Use ERSPAN instead", "Set Eth1/48 to access mode"],
    answer: 0,
    explain: "The destination port also needs `switchport monitor`.",
  },
  { id: "c-946", objective: "1.9", kind: "single", prompt: "Which NetFlow object ties a record to an exporter and is applied to interfaces?", choices: ["The flow monitor", "The flow record", "The flow exporter", "The sampler"], answer: 0, explain: "Record = which fields, exporter = where to send, monitor = both together on an interface." },

  // 1.10 Telemetry
  { id: "c-947", objective: "1.10", kind: "cli", prompt: "Create sensor group 1 in telemetry configuration.", context: "N9K(config-telemetry)#", accept: ["sensor-gr|oup 1"], canonical: "sensor-group 1", explain: "Sensor groups list the paths; subscriptions link them to destinations." },
  { id: "c-948", objective: "1.10", kind: "cli", prompt: "In this sensor group, stream the DME path sys/intf with unbounded depth.", context: "N9K(conf-tm-sensor)#", accept: ["path sys/intf dep|th unbounded"], canonical: "path sys/intf depth unbounded", explain: "Depth controls how many levels of child objects are included." },
  { id: "c-949", objective: "1.10", kind: "single", prompt: "What is an on-change telemetry subscription?", choices: ["The switch sends data only when the value changes, instead of at a fixed interval", "Data is polled by SNMP", "The collector pulls once a day", "Telemetry is disabled until changed"], answer: 0, explain: "In NX-OS sensor subscriptions, sample interval 0 means event-driven." },
  { id: "c-950", objective: "1.10", kind: "single", prompt: "Which NX-OS feature must be enabled for a gNMI client to subscribe to the switch?", choices: ["feature grpc", "feature netconf", "feature nxapi", "feature telemetry only"], answer: 0, explain: "gNMI runs over gRPC; the gRPC agent also needs a certificate for TLS." },

  // 1.11 Nexus Dashboard
  { id: "c-951", objective: "1.11", kind: "single", prompt: "Which Nexus Dashboard capability manages NX-OS images and orchestrates upgrades across a fabric?", choices: ["Image management in the fabric controller", "The SAN controller only", "Orchestrator", "AI Canvas"], answer: 0, explain: "It stages images, runs pre-checks and upgrades switches in groups." },
  { id: "c-952", objective: "1.11", kind: "single", prompt: "How many nodes form a typical production physical Nexus Dashboard cluster?", choices: ["Three", "One", "Two", "Five"], answer: 0, explain: "A one-node cluster is supported but has no redundancy. Three primary nodes give quorum; secondary nodes can be added for scale, but only at initial deployment in release 4.x." },
  { id: "c-953", objective: "1.11", kind: "single", prompt: "What does Nexus Dashboard's connectivity analysis do?", choices: ["Traces a flow's path hop by hop through the fabric and shows where and why it would be dropped", "Measures internet speed", "Backs up the fabric", "Runs the APIC"], answer: 0, explain: "It's useful for 'why can't A reach B' tickets without capturing packets." },
  { id: "c-954", objective: "1.11", kind: "single", prompt: "What does multi-cluster connectivity in Nexus Dashboard allow?", choices: ["Managing several Nexus Dashboard clusters (and their fabrics) from one login and view", "Merging two ACI fabrics into one", "Replicating storage", "Running vPC between clusters"], answer: 0, explain: "It suits organisations with clusters per region or site." },
];
