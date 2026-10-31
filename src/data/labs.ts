import type { Lab, LabStep } from "./types";

// Shared navigation steps. The terminal engine understands these natively;
// they are listed in a lab so the ticket reads like a real change plan.
const enable: LabStep = { task: "Enter privileged EXEC.", cmd: "enable", accept: ["en|able"], hint: "enable" };
const conft: LabStep = { task: "Enter global configuration mode.", cmd: "configure terminal", accept: ["conf|igure t|erminal"], hint: "configure terminal" };
const exit: LabStep = { task: "Back out one level.", cmd: "exit", accept: ["exi|t"], leaves: 1, hint: "exit" };
const end: LabStep = { task: "Return to privileged EXEC.", cmd: "end", accept: ["end"], ends: true, hint: "end (or Ctrl-Z)" };

export const labs: Lab[] = [
  {
    id: "lacp-trunk",
    exam: "encor",
    objective: "3.1.b",
    title: "Bundle two uplinks and trunk them",
    hostname: "SW1",
    platform: "ios-xe",
    brief:
      "Change #4471. Bundle Gi1/0/1-2 towards DSW1 with LACP, then make Port-channel1 a hardened 802.1Q trunk: no DTP, native VLAN 999, and only VLANs 10, 20 and 30.",
    topology: `  SW1 Gi1/0/1 ════╗
                 ╠═══ Po1 ═══ DSW1
  SW1 Gi1/0/2 ════╝`,
    steps: [
      enable,
      conft,
      { task: "Select both uplinks at once.", cmd: "interface range GigabitEthernet1/0/1 - 2", accept: ["int|erface ra|nge <rest>"], enters: "config-if-range", hint: "interface range gi1/0/1 - 2" },
      { task: "Join them to channel-group 1 with active LACP.", cmd: "channel-group 1 mode active", accept: ["chan|nel-group 1 mode act|ive"], hint: "channel-group 1 mode active", output: "Creating a port-channel interface Port-channel 1" },
      exit,
      { task: "Configure the logical Port-channel1 interface.", cmd: "interface Port-channel1", accept: ["int|erface <if:po1>"], enters: "config-if", hint: "interface port-channel 1" },
      { task: "Hardcode trunk mode.", cmd: "switchport mode trunk", accept: ["sw|itchport mo|de tr|unk"], hint: "switchport mode trunk" },
      { task: "Stop DTP negotiation.", cmd: "switchport nonegotiate", accept: ["sw|itchport non|egotiate"], hint: "switchport nonegotiate" },
      { task: "Move the native VLAN to 999.", cmd: "switchport trunk native vlan 999", accept: ["sw|itchport tr|unk nat|ive vl|an 999"], hint: "switchport trunk native vlan 999" },
      { task: "Allow only VLANs 10, 20 and 30.", cmd: "switchport trunk allowed vlan 10,20,30", accept: ["sw|itchport tr|unk al|lowed vl|an 10,20,30"], hint: "switchport trunk allowed vlan 10,20,30" },
      end,
    ],
    shows: [
      {
        match: "sh|ow etherc|hannel su|mmary",
        output: `Flags:  D - down        P - bundled in port-channel
        I - stand-alone s - suspended
        S - Layer2      U - in use

Group  Port-channel  Protocol    Ports
------+-------------+-----------+-----------------------------------------------
1      Po1(SU)         LACP      Gi1/0/1(P)  Gi1/0/2(P)`,
      },
      {
        match: "sh|ow int|erfaces tr|unk",
        output: `Port        Mode             Encapsulation  Status        Native vlan
Po1         on               802.1q         trunking      999

Port        Vlans allowed on trunk
Po1         10,20,30

Port        Vlans in spanning tree forwarding state and not pruned
Po1         10,20,30`,
      },
    ],
  },
  {
    id: "ospf-abr",
    exam: "encor",
    objective: "3.2.b",
    title: "Build an OSPF ABR with summarisation",
    hostname: "R1",
    platform: "ios-xe",
    brief:
      "R1 sits between the backbone (area 0, Gi0/0, 10.0.12.0/30) and the branch area 1 (10.1.0.0/16). Bring up OSPF process 1 with router ID 1.1.1.1. Make every interface passive except the backbone link, and summarise area 1 into one /16.",
    topology: `  [R2]──Gi0/0── R1 ──Gi0/1..3── 10.1.x.0/24 LANs
  area 0  10.0.12.0/30      area 1`,
    steps: [
      enable,
      conft,
      { task: "Start OSPF process 1.", cmd: "router ospf 1", accept: ["router ospf 1"], enters: "config-router", hint: "router ospf 1" },
      { task: "Pin the router ID to 1.1.1.1.", cmd: "router-id 1.1.1.1", accept: ["router-id 1.1.1.1"], hint: "router-id 1.1.1.1" },
      { task: "Make all interfaces passive by default.", cmd: "passive-interface default", accept: ["pass|ive-interface def|ault"], hint: "passive-interface default" },
      { task: "Re-enable hellos on the backbone link only.", cmd: "no passive-interface GigabitEthernet0/0", accept: ["no pass|ive-interface <if:gi0/0>"], hint: "no passive-interface gi0/0" },
      { task: "Put the 10.0.12.0/30 link in area 0.", cmd: "network 10.0.12.0 0.0.0.3 area 0", accept: ["net|work 10.0.12.0 0.0.0.3 area 0"], hint: "network 10.0.12.0 0.0.0.3 area 0" },
      { task: "Put all 10.1.0.0/16 LANs in area 1.", cmd: "network 10.1.0.0 0.0.255.255 area 1", accept: ["net|work 10.1.0.0 0.0.255.255 area 1"], hint: "network 10.1.0.0 0.0.255.255 area 1" },
      { task: "Summarise area 1 to 10.1.0.0/16 at the ABR.", cmd: "area 1 range 10.1.0.0 255.255.0.0", accept: ["area 1 ran|ge 10.1.0.0 255.255.0.0"], hint: "area 1 range 10.1.0.0 255.255.0.0" },
      end,
    ],
    shows: [
      {
        match: "sh|ow ip ospf nei|ghbor",
        output: `Neighbor ID     Pri   State           Dead Time   Address         Interface
2.2.2.2           1   FULL/BDR        00:00:36    10.0.12.2       GigabitEthernet0/0`,
      },
      {
        match: "sh|ow ip ro|ute ospf",
        output: `      10.0.0.0/8 is variably subnetted, 7 subnets, 4 masks
O        10.1.0.0/16 is a summary, 00:00:41, Null0
O        10.2.0.0/16 [110/2] via 10.0.12.2, 00:00:41, GigabitEthernet0/0`,
      },
    ],
  },
  {
    id: "ebgp-edge",
    exam: "encor",
    objective: "3.2.c",
    title: "Advertise an aggregate to your ISP over eBGP",
    hostname: "R1",
    platform: "ios-xe",
    brief:
      "Peer AS 65001 with the ISP (192.0.2.2, AS 65002) and advertise 10.10.0.0/16. The RIB only has /24s, so anchor the aggregate first or BGP will not originate it.",
    topology: `  R1 (AS 65001) ──192.0.2.0/30── ISP (AS 65002)
  10.10.1.0/24, 10.10.2.0/24 behind R1`,
    steps: [
      enable,
      conft,
      { task: "Anchor 10.10.0.0/16 in the RIB with a discard route.", cmd: "ip route 10.10.0.0 255.255.0.0 Null0", accept: ["ip route 10.10.0.0 255.255.0.0 {null0,null} (0)"], hint: "ip route 10.10.0.0 255.255.0.0 null0" },
      { task: "Start BGP in AS 65001.", cmd: "router bgp 65001", accept: ["router bgp 65001"], enters: "config-router", hint: "router bgp 65001" },
      { task: "Define the ISP neighbour.", cmd: "neighbor 192.0.2.2 remote-as 65002", accept: ["nei|ghbor 192.0.2.2 rem|ote-as 65002"], hint: "neighbor 192.0.2.2 remote-as 65002" },
      { task: "Enter the IPv4 unicast address family.", cmd: "address-family ipv4", accept: ["add|ress-family ipv4 (uni|cast)"], enters: "config-router-af", hint: "address-family ipv4" },
      { task: "Originate the /16.", cmd: "network 10.10.0.0 mask 255.255.0.0", accept: ["net|work 10.10.0.0 mask 255.255.0.0"], hint: "network 10.10.0.0 mask 255.255.0.0" },
      { task: "Activate the neighbour for IPv4.", cmd: "neighbor 192.0.2.2 activate", accept: ["nei|ghbor 192.0.2.2 act|ivate"], hint: "neighbor 192.0.2.2 activate", output: "%BGP-5-ADJCHANGE: neighbor 192.0.2.2 Up" },
      { task: "Leave the address family.", cmd: "exit-address-family", accept: ["exit-a|ddress-family"], leaves: 1, hint: "exit-address-family" },
      end,
    ],
    shows: [
      {
        match: "sh|ow ip bgp su|mmary",
        output: `BGP router identifier 192.0.2.1, local AS number 65001
Neighbor        V           AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd
192.0.2.2       4        65002      12      10        4    0    0 00:02:11        3`,
      },
      {
        match: "sh|ow ip bgp",
        output: `     Network          Next Hop            Metric LocPrf Weight Path
 *>   0.0.0.0          192.0.2.2                0             0 65002 i
 *>   10.10.0.0/16     0.0.0.0                  0         32768 i`,
      },
    ],
  },
  {
    id: "hsrp-track",
    exam: "encor",
    objective: "3.3.c",
    title: "HSRP gateway that fails over on uplink loss",
    hostname: "DSW1",
    platform: "ios-xe",
    brief:
      "DSW1 should be the active gateway 10.10.10.1 for VLAN 10 (HSRPv2, group 10, priority 110, preempt). If uplink Gi1/0/48 goes down, its priority must drop below DSW2's 100.",
    topology: `          ┌── Gi1/0/48 ── Core
  DSW1 ───┤ Vlan10 .2  ── VIP .1 ── hosts
  DSW2 ───┘ Vlan10 .3  (priority 100)`,
    steps: [
      enable,
      conft,
      { task: "Track the line protocol of Gi1/0/48 as object 1.", cmd: "track 1 interface GigabitEthernet1/0/48 line-protocol", accept: ["track 1 int|erface <if:gi1/0/48> line|-protocol"], enters: "config-track", hint: "track 1 interface gi1/0/48 line-protocol" },
      exit,
      { task: "Configure the VLAN 10 SVI.", cmd: "interface Vlan10", accept: ["int|erface <if:vlan10>"], enters: "config-if", hint: "interface vlan 10" },
      { task: "Use HSRP version 2.", cmd: "standby version 2", accept: ["stand|by vers|ion 2"], hint: "standby version 2" },
      { task: "Group 10, virtual IP 10.10.10.1.", cmd: "standby 10 ip 10.10.10.1", accept: ["stand|by 10 ip 10.10.10.1"], hint: "standby 10 ip 10.10.10.1" },
      { task: "Priority 110.", cmd: "standby 10 priority 110", accept: ["stand|by 10 prio|rity 110"], hint: "standby 10 priority 110" },
      { task: "Take the active role back after recovering.", cmd: "standby 10 preempt", accept: ["stand|by 10 pre|empt"], hint: "standby 10 preempt" },
      { task: "Drop priority by 20 when track 1 goes down.", cmd: "standby 10 track 1 decrement 20", accept: ["stand|by 10 track 1 dec|rement 20"], hint: "standby 10 track 1 decrement 20", output: "%HSRP-5-STATECHANGE: Vlan10 Grp 10 state Standby -> Active" },
      end,
    ],
    shows: [
      {
        match: "sh|ow stand|by br|ief",
        output: `                     P indicates configured to preempt.
Interface   Grp  Pri P State   Active          Standby         Virtual IP
Vl10        10   110 P Active  local           10.10.10.3      10.10.10.1`,
      },
    ],
  },
  {
    id: "pat",
    exam: "encor",
    objective: "3.3.b",
    title: "PAT the LAN out to the Internet",
    hostname: "R1",
    platform: "ios-xe",
    brief: "Hosts on 10.0.0.0/24 (behind Gi0/1) need Internet access through Gi0/0's public address. Use PAT.",
    topology: `  10.0.0.0/24 ──Gi0/1 [R1] Gi0/0── 203.0.113.2 ── Internet`,
    steps: [
      enable,
      conft,
      { task: "Match the LAN with standard ACL 1.", cmd: "access-list 1 permit 10.0.0.0 0.0.0.255", accept: ["access-l|ist 1 per|mit 10.0.0.0 0.0.0.255"], hint: "access-list 1 permit 10.0.0.0 0.0.0.255" },
      { task: "Go to the LAN interface.", cmd: "interface GigabitEthernet0/1", accept: ["int|erface <if:gi0/1>"], enters: "config-if", hint: "interface gi0/1" },
      { task: "Mark it NAT inside.", cmd: "ip nat inside", accept: ["ip nat ins|ide"], hint: "ip nat inside" },
      exit,
      { task: "Go to the WAN interface.", cmd: "interface GigabitEthernet0/0", accept: ["int|erface <if:gi0/0>"], enters: "config-if", hint: "interface gi0/0" },
      { task: "Mark it NAT outside.", cmd: "ip nat outside", accept: ["ip nat out|side"], hint: "ip nat outside" },
      exit,
      { task: "Overload ACL 1 onto Gi0/0's address.", cmd: "ip nat inside source list 1 interface GigabitEthernet0/0 overload", accept: ["ip nat ins|ide sou|rce li|st 1 int|erface <if:gi0/0> ov|erload"], hint: "ip nat inside source list 1 interface gi0/0 overload" },
      end,
    ],
    shows: [
      {
        match: "sh|ow ip nat tr|anslations",
        output: `Pro  Inside global         Inside local          Outside local         Outside global
tcp  203.0.113.2:1024      10.0.0.11:51544       142.250.80.46:443     142.250.80.46:443
tcp  203.0.113.2:1025      10.0.0.23:61022       151.101.1.69:443      151.101.1.69:443
udp  203.0.113.2:1026      10.0.0.11:53011       1.1.1.1:53            1.1.1.1:53`,
      },
    ],
  },
  {
    id: "vrf-lite",
    exam: "encor",
    objective: "2.2.a",
    title: "Isolate a tenant with VRF-lite",
    hostname: "R1",
    platform: "ios-xe",
    brief: "Create VRF BLUE (IPv4) and move Gi0/2 into it with 10.50.0.1/24. Watch what happens to the address when you change VRF membership.",
    topology: `  global table ── R1 ── Gi0/2 ── BLUE tenant 10.50.0.0/24`,
    steps: [
      enable,
      conft,
      { task: "Define VRF BLUE.", cmd: "vrf definition BLUE", accept: ["vrf def|inition BLUE"], enters: "config-vrf", hint: "vrf definition BLUE" },
      { task: "Enable the IPv4 address family in the VRF.", cmd: "address-family ipv4", accept: ["add|ress-family ipv4"], enters: "config-vrf-af", hint: "address-family ipv4" },
      { task: "Leave the address family.", cmd: "exit-address-family", accept: ["exit-a|ddress-family"], leaves: 1, hint: "exit-address-family" },
      exit,
      { task: "Go to Gi0/2.", cmd: "interface GigabitEthernet0/2", accept: ["int|erface <if:gi0/2>"], enters: "config-if", hint: "interface gi0/2" },
      { task: "Put the interface in VRF BLUE.", cmd: "vrf forwarding BLUE", accept: ["vrf forw|arding BLUE"], hint: "vrf forwarding BLUE", output: "% Interface GigabitEthernet0/2 IPv4 disabled and address(es) removed due to enabling VRF BLUE" },
      { task: "Configure the IP address again (it was just removed).", cmd: "ip address 10.50.0.1 255.255.255.0", accept: ["ip add|ress 10.50.0.1 255.255.255.0"], hint: "ip address 10.50.0.1 255.255.255.0" },
      { task: "Bring the interface up.", cmd: "no shutdown", accept: ["no shut|down"], hint: "no shutdown" },
      end,
    ],
    shows: [
      {
        match: "sh|ow ip ro|ute vrf BLUE",
        output: `Routing Table: BLUE
      10.0.0.0/8 is variably subnetted, 2 subnets, 2 masks
C        10.50.0.0/24 is directly connected, GigabitEthernet0/2
L        10.50.0.1/32 is directly connected, GigabitEthernet0/2`,
      },
      {
        match: "sh|ow vrf",
        output: `  Name                             Default RD            Protocols   Interfaces
  BLUE                             <not set>             ipv4        Gi0/2`,
      },
    ],
  },
  {
    id: "ipsla-failover",
    exam: "encor",
    objective: "4.4",
    title: "Track the ISP and fail the default route over",
    hostname: "R1",
    platform: "ios-xe",
    brief:
      "Probe 8.8.8.8 from Gi0/0 every 10 seconds. Install the primary default route via 203.0.113.1 only while the probe succeeds, and keep a floating backup via 198.51.100.1 with AD 250.",
    topology: `        ┌─Gi0/0── ISP-A 203.0.113.1 (primary)
  R1 ───┤
        └─Gi0/1── ISP-B 198.51.100.1 (backup)`,
    steps: [
      enable,
      conft,
      { task: "Create IP SLA operation 1.", cmd: "ip sla 1", accept: ["ip sla 1"], enters: "config-ip-sla", hint: "ip sla 1" },
      { task: "ICMP echo to 8.8.8.8 sourced from Gi0/0.", cmd: "icmp-echo 8.8.8.8 source-interface GigabitEthernet0/0", accept: ["icmp-e|cho 8.8.8.8 source-i|nterface <if:gi0/0>"], enters: "config-ip-sla-echo", hint: "icmp-echo 8.8.8.8 source-interface gi0/0" },
      { task: "Probe every 10 seconds.", cmd: "frequency 10", accept: ["freq|uency 10"], hint: "frequency 10" },
      { task: "Return to global config.", cmd: "exit", accept: ["exi|t"], leaves: 2, hint: "exit" },
      { task: "Schedule it to start now and run forever.", cmd: "ip sla schedule 1 life forever start-time now", accept: ["ip sla sch|edule 1 life forever start-time now", "ip sla sch|edule 1 start-time now life forever"], hint: "ip sla schedule 1 life forever start-time now" },
      { task: "Create track 1 on the SLA's reachability.", cmd: "track 1 ip sla 1 reachability", accept: ["track 1 ip sla 1 reach|ability"], enters: "config-track", hint: "track 1 ip sla 1 reachability" },
      exit,
      { task: "Primary default route, tied to track 1.", cmd: "ip route 0.0.0.0 0.0.0.0 203.0.113.1 track 1", accept: ["ip route 0.0.0.0 0.0.0.0 203.0.113.1 track 1"], hint: "ip route 0.0.0.0 0.0.0.0 203.0.113.1 track 1" },
      { task: "Floating backup default route with AD 250.", cmd: "ip route 0.0.0.0 0.0.0.0 198.51.100.1 250", accept: ["ip route 0.0.0.0 0.0.0.0 198.51.100.1 250"], hint: "ip route 0.0.0.0 0.0.0.0 198.51.100.1 250" },
      end,
    ],
    shows: [
      {
        match: "sh|ow track (1)",
        output: `Track 1
  IP SLA 1 reachability
  Reachability is Up
    3 changes, last change 00:01:12
  Latest operation return code: OK
  Latest RTT (millisecs) 14
Tracked by:
  Static IP Routing 0`,
      },
      {
        match: "sh|ow ip sla stat|istics",
        output: `IPSLA operation id: 1
        Latest RTT: 14 milliseconds
Latest operation return code: OK
Number of successes: 42
Number of failures: 0
Operation time to live: Forever`,
      },
    ],
  },
  {
    id: "eem-uplink",
    exam: "encor",
    objective: "6.6",
    title: "EEM: capture state when the uplink drops",
    hostname: "R1",
    platform: "ios-xe",
    brief:
      "When Gi0/0 goes down, save the routing table to flash and log a custom message. Build it as an EEM applet called UPLINK-DOWN.",
    topology: `  syslog "%LINEPROTO-5-UPDOWN ... GigabitEthernet0/0 ... down"  ──▶  applet`,
    steps: [
      enable,
      conft,
      { task: "Create the applet UPLINK-DOWN.", cmd: "event manager applet UPLINK-DOWN", accept: ["ev|ent man|ager app|let UPLINK-DOWN"], enters: "config-applet", hint: "event manager applet UPLINK-DOWN" },
      { task: "Trigger on the syslog message for Gi0/0 going down.", cmd: 'event syslog pattern "GigabitEthernet0/0, changed state to down"', accept: ["ev|ent sys|log pat|tern <rest>"], hint: 'event syslog pattern "GigabitEthernet0/0, changed state to down"' },
      { task: "Action 1.0: go to privileged mode.", cmd: 'action 1.0 cli command "enable"', accept: ['act|ion 1.0 cli com|mand "enable"', "act|ion 1.0 cli com|mand enable"], hint: 'action 1.0 cli command "enable"' },
      { task: "Action 2.0: append the routing table to flash:uplink.log.", cmd: 'action 2.0 cli command "show ip route | append flash:uplink.log"', accept: ["act|ion 2.0 cli com|mand <rest>"], hint: 'action 2.0 cli command "show ip route | append flash:uplink.log"' },
      { task: "Action 3.0: log a syslog message.", cmd: 'action 3.0 syslog msg "Uplink down, route table saved"', accept: ["act|ion 3.0 sys|log msg <rest>"], hint: 'action 3.0 syslog msg "Uplink down, route table saved"' },
      end,
    ],
    shows: [
      {
        match: "sh|ow ev|ent man|ager pol|icy reg|istered",
        output: `No.  Class     Type    Event Type          Trap  Time Registered           Name
1    applet    user    syslog              Off   Sat Oct 31 10:02:44 2026  UPLINK-DOWN
 pattern {GigabitEthernet0/0, changed state to down}
 action 1.0 cli command "enable"
 action 2.0 cli command "show ip route | append flash:uplink.log"
 action 3.0 syslog msg "Uplink down, route table saved"`,
      },
    ],
  },
  {
    id: "aaa-tacacs",
    exam: "encor",
    objective: "5.1.b",
    title: "AAA with TACACS+ and local fallback",
    hostname: "R1",
    platform: "ios-xe",
    brief:
      "Point device administration at ISE (10.0.0.10, key S3cr3t) over TACACS+. Logins and exec authorization use the server group TAC first and fall back to local only if ISE is unreachable.",
    topology: `  admin ──ssh──▶ R1 ──TCP/49──▶ ISE 10.0.0.10`,
    steps: [
      enable,
      conft,
      { task: "Turn on AAA.", cmd: "aaa new-model", accept: ["aaa new-m|odel"], hint: "aaa new-model" },
      { task: "Define TACACS+ server ISE1.", cmd: "tacacs server ISE1", accept: ["tacacs ser|ver ISE1"], enters: "config-server-tacacs", hint: "tacacs server ISE1" },
      { task: "Its address is 10.0.0.10.", cmd: "address ipv4 10.0.0.10", accept: ["add|ress ipv4 10.0.0.10"], hint: "address ipv4 10.0.0.10" },
      { task: "Shared key S3cr3t.", cmd: "key S3cr3t", accept: ["key S3cr3t", "key 0 S3cr3t"], hint: "key S3cr3t" },
      exit,
      { task: "Create server group TAC.", cmd: "aaa group server tacacs+ TAC", accept: ["aaa gr|oup ser|ver tacacs+ TAC"], enters: "config-sg-tacacs+", hint: "aaa group server tacacs+ TAC" },
      { task: "Add ISE1 to the group.", cmd: "server name ISE1", accept: ["ser|ver na|me ISE1"], hint: "server name ISE1" },
      exit,
      { task: "Login authentication: TAC, then local.", cmd: "aaa authentication login default group TAC local", accept: ["aaa authe|ntication log|in def|ault gr|oup TAC loc|al"], hint: "aaa authentication login default group TAC local" },
      { task: "Exec authorization: TAC, then local.", cmd: "aaa authorization exec default group TAC local", accept: ["aaa autho|rization ex|ec def|ault gr|oup TAC loc|al"], hint: "aaa authorization exec default group TAC local" },
      end,
    ],
    shows: [
      {
        match: "sh|ow tacacs",
        output: `Tacacs+ Server - public  :
               Server name: ISE1
            Server address: 10.0.0.10
               Server port: 49
              Socket opens:          4
             Socket closes:          4
              Total Packets Sent:    8
              Total Packets Recv:    8`,
      },
    ],
  },
  {
    id: "roce-pfc",
    exam: "dcai",
    objective: "3.1.a",
    title: "Lossless class for RoCEv2 on Nexus",
    hostname: "LEAF1",
    platform: "nx-os",
    brief:
      "Make CoS 3 a no-drop class with jumbo MTU system-wide, then force PFC on the GPU-facing port Ethernet1/1. The NICs already mark RoCE with priority 3.",
    topology: `  GPU node NIC ══400G══ Eth1/1 [LEAF1] ══ spines
            RoCEv2 prio 3 (no-drop)`,
    steps: [
      conft,
      { task: "Create the network-qos policy RoCE-NQ.", cmd: "policy-map type network-qos RoCE-NQ", accept: ["policy-m|ap ty|pe network-qos RoCE-NQ"], enters: "config-pmap-nqos", hint: "policy-map type network-qos RoCE-NQ" },
      { task: "Edit the 8-queue class for qos-group 3.", cmd: "class type network-qos c-8q-nq3", accept: ["cla|ss ty|pe network-qos c-8q-nq3"], enters: "config-pmap-nqos-c", hint: "class type network-qos c-8q-nq3" },
      { task: "Make it no-drop with PFC on CoS 3.", cmd: "pause pfc-cos 3", accept: ["pau|se pfc-cos 3"], hint: "pause pfc-cos 3" },
      { task: "Jumbo MTU 9216 for this class.", cmd: "mtu 9216", accept: ["mtu 9216"], hint: "mtu 9216" },
      { task: "Back to global config.", cmd: "exit", accept: ["exi|t"], leaves: 1, hint: "exit (twice)" },
      { task: "And out of the policy-map.", cmd: "exit", accept: ["exi|t"], leaves: 1, hint: "exit" },
      { task: "Enter system qos.", cmd: "system qos", accept: ["sys|tem qos"], enters: "config-sys-qos", hint: "system qos" },
      { task: "Apply RoCE-NQ system-wide.", cmd: "service-policy type network-qos RoCE-NQ", accept: ["serv|ice-policy ty|pe network-qos RoCE-NQ"], hint: "service-policy type network-qos RoCE-NQ" },
      exit,
      { task: "Go to the GPU-facing port.", cmd: "interface Ethernet1/1", accept: ["int|erface <if:eth1/1>"], enters: "config-if", hint: "interface ethernet1/1" },
      { task: "Force PFC on (do not rely on DCBX).", cmd: "priority-flow-control mode on", accept: ["prio|rity-flow-control mode on"], hint: "priority-flow-control mode on" },
      end,
    ],
    shows: [
      {
        match: "sh|ow int|erface prio|rity-flow-control",
        output: `============================================================
Port               Mode Oper(VL bmap)  RxPPP      TxPPP
============================================================
Ethernet1/1        On   On     (8)     0          0
Ethernet1/2        Auto Off            0          0`,
      },
      {
        match: "sh|ow policy-map sys|tem ty|pe network-qos",
        output: `  Type network-qos policy-maps
  ============================
  policy-map type network-qos RoCE-NQ
    class type network-qos c-8q-nq3
      match qos-group 3
      pause pfc-cos 3
      mtu 9216`,
      },
    ],
  },
  {
    id: "roce-ecn",
    exam: "dcai",
    objective: "3.1.c",
    title: "ECN marking and a priority queue for CNPs",
    hostname: "LEAF1",
    platform: "nx-os",
    brief:
      "Build egress queuing policy RoCE-Q-OUT: give queue 3 (RoCE) 50% of remaining bandwidth with WRED-ECN marking between 150 KB and 3000 KB, and put queue 7 (CNP) in strict priority. Apply it system-wide on output.",
    topology: `  RoCE data → q3 (ECN mark)    CNP → q7 (priority)`,
    steps: [
      conft,
      { task: "Create the queuing policy RoCE-Q-OUT.", cmd: "policy-map type queuing RoCE-Q-OUT", accept: ["policy-m|ap ty|pe que|uing RoCE-Q-OUT"], enters: "config-pmap-que", hint: "policy-map type queuing RoCE-Q-OUT" },
      { task: "Edit egress queue 3.", cmd: "class type queuing c-out-8q-q3", accept: ["cla|ss ty|pe que|uing c-out-8q-q3"], enters: "config-pmap-c-que", hint: "class type queuing c-out-8q-q3" },
      { task: "Give it 50% of the remaining bandwidth.", cmd: "bandwidth remaining percent 50", accept: ["band|width rem|aining per|cent 50"], hint: "bandwidth remaining percent 50" },
      {
        task: "WRED with ECN: min 150 KB, max 3000 KB, drop-probability 7, weight 0.",
        cmd: "random-detect minimum-threshold 150 kbytes maximum-threshold 3000 kbytes drop-probability 7 weight 0 ecn",
        accept: ["random-d|etect minimum-t|hreshold 150 kb|ytes maximum-t|hreshold 3000 kb|ytes drop-p|robability 7 wei|ght 0 ecn"],
        hint: "random-detect minimum-threshold 150 kbytes maximum-threshold 3000 kbytes drop-probability 7 weight 0 ecn",
      },
      exit,
      { task: "Edit egress queue 7.", cmd: "class type queuing c-out-8q-q7", accept: ["cla|ss ty|pe que|uing c-out-8q-q7"], enters: "config-pmap-c-que", hint: "class type queuing c-out-8q-q7" },
      { task: "Strict priority for CNPs.", cmd: "priority level 1", accept: ["prio|rity (lev|el 1)"], hint: "priority level 1" },
      exit,
      exit,
      { task: "Enter system qos.", cmd: "system qos", accept: ["sys|tem qos"], enters: "config-sys-qos", hint: "system qos" },
      { task: "Apply the policy on egress.", cmd: "service-policy type queuing output RoCE-Q-OUT", accept: ["serv|ice-policy ty|pe que|uing out|put RoCE-Q-OUT"], hint: "service-policy type queuing output RoCE-Q-OUT" },
      end,
    ],
    shows: [
      {
        match: "sh|ow queu|ing int|erface <rest>",
        output: `Egress Queuing for Ethernet1/1 [System]
------------------------------------------------------------------------------
QoS-Group#  Bandwidth%  PrioLevel    Shape                   QLimit
                                       Min          Max        Units
------------------------------------------------------------------------------
      7             -         1           -            -     -            9(D)
      3            50         -           -            -     -            9(D)
      0            50         -           -            -     -            9(D)
+-------------------------------------------------------------+
|                              QOS GROUP 3                    |
+-------------------------------------------------------------+
|                           |  Unicast       |Multicast       |
+-------------------------------------------------------------+
|                   Tx Pkts |      918273645|               0|
|              WRED/AFD & Tail Drop Pkts |    0|               0|
|              ECN Marked Pkts |       10482|               -|`,
      },
    ],
  },
];

export const labById = Object.fromEntries(labs.map((l) => [l.id, l]));
