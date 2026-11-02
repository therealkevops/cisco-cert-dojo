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
  // --- ENCOR drills for topics without a Wire Room challenge ---------------------------------
  {
    id: "sso-nsf",
    exam: "encor",
    objective: "1.1.b",
    title: "Stateful switchover with NSF for OSPF",
    hostname: "CORE1",
    platform: "ios-xe",
    brief: "CORE1 has two supervisors. Make the standby stateful (SSO) and let OSPF keep forwarding through a switchover with Cisco NSF.",
    topology: `  [SUP1 active] ══ SSO sync ══ [SUP2 standby]
          OSPF 1 neighbours keep forwarding during switchover`,
    steps: [
      enable,
      conft,
      { task: "Enter redundancy configuration.", cmd: "redundancy", accept: ["red|undancy"], enters: "config-red", hint: "redundancy" },
      { task: "Set the mode to SSO.", cmd: "mode sso", accept: ["mode sso"], hint: "mode sso" },
      exit,
      { task: "Enter OSPF process 1.", cmd: "router ospf 1", accept: ["router ospf 1"], enters: "config-router", hint: "router ospf 1" },
      { task: "Enable Cisco NSF (graceful restart) for OSPF.", cmd: "nsf", accept: ["nsf (cisco)", "nsf ietf"], hint: "nsf" },
      end,
    ],
    shows: [
      {
        match: "sh|ow red|undancy states",
        output: `       my state = 13 -ACTIVE
     peer state = 8  -STANDBY HOT
           Mode = Duplex
  Redundancy Mode (Operational) = sso
  Redundancy Mode (Configured)  = sso`,
      },
    ],
  },
  {
    id: "qos-wan",
    exam: "encor",
    objective: "1.4",
    title: "Low-latency queuing for voice and video on the WAN",
    hostname: "BR1",
    platform: "ios-xe",
    brief: "On the WAN link Gi0/0: voice (DSCP EF) gets a strict-priority queue of 10%, interactive video (DSCP AF41) gets 40% of the remaining bandwidth. Everything else shares the rest.",
    topology: `  LAN ── [BR1] Gi0/0 ══ WAN (policy WAN-OUT outbound)`,
    steps: [
      enable,
      conft,
      { task: "Create class-map VOICE (match-any).", cmd: "class-map match-any VOICE", accept: ["class-m|ap (match-any) VOICE"], enters: "config-cmap", hint: "class-map match-any VOICE" },
      { task: "Match DSCP EF.", cmd: "match dscp ef", accept: ["mat|ch dscp ef", "mat|ch dscp 46"], hint: "match dscp ef" },
      exit,
      { task: "Create class-map VIDEO (match-any).", cmd: "class-map match-any VIDEO", accept: ["class-m|ap (match-any) VIDEO"], enters: "config-cmap", hint: "class-map match-any VIDEO" },
      { task: "Match DSCP AF41.", cmd: "match dscp af41", accept: ["mat|ch dscp af41", "mat|ch dscp 34"], hint: "match dscp af41" },
      exit,
      { task: "Create policy-map WAN-OUT.", cmd: "policy-map WAN-OUT", accept: ["policy-m|ap WAN-OUT"], enters: "config-pmap", hint: "policy-map WAN-OUT" },
      { task: "Select class VOICE.", cmd: "class VOICE", accept: ["cla|ss VOICE"], enters: "config-pmap-c", hint: "class VOICE" },
      { task: "Strict priority, 10% of the link.", cmd: "priority percent 10", accept: ["prio|rity per|cent 10"], hint: "priority percent 10" },
      exit,
      { task: "Select class VIDEO.", cmd: "class VIDEO", accept: ["cla|ss VIDEO"], enters: "config-pmap-c", hint: "class VIDEO" },
      { task: "40% of the bandwidth left after the priority queue.", cmd: "bandwidth remaining percent 40", accept: ["band|width rem|aining per|cent 40"], hint: "bandwidth remaining percent 40" },
      exit,
      exit,
      { task: "Go to the WAN interface.", cmd: "interface GigabitEthernet0/0", accept: ["int|erface <if:gi0/0>"], enters: "config-if", hint: "interface gi0/0" },
      { task: "Apply WAN-OUT outbound.", cmd: "service-policy output WAN-OUT", accept: ["serv|ice-policy out|put WAN-OUT"], hint: "service-policy output WAN-OUT" },
      end,
    ],
    shows: [
      {
        match: "sh|ow policy-map int|erface <rest>",
        output: ` GigabitEthernet0/0

  Service-policy output: WAN-OUT

    Class-map: VOICE (match-any)
      Match: dscp ef (46)
      Priority: 10% (10000 kbps), burst bytes 250000, b/w exceed drops: 0

    Class-map: VIDEO (match-any)
      Match: dscp af41 (34)
      bandwidth remaining 40%

    Class-map: class-default (match-any)
      Match: any`,
      },
    ],
  },
  {
    id: "gre-ipsec",
    exam: "encor",
    objective: "2.2.b",
    title: "GRE over IPsec with IKEv2 to a branch",
    hostname: "HQ",
    platform: "ios-xe",
    brief: "Build Tunnel0 (172.16.0.1/30) from HQ (Gi0/0) to the branch at 198.51.100.2, protected with IPsec using IKEv2 and a pre-shared key 'Br4nchKey!'. Use the IKEv2 smart defaults for proposals and transform sets.",
    topology: `  [HQ] Gi0/0 ═══ Internet ═══ 198.51.100.2 [BR1]
     Tunnel0 172.16.0.1/30 ─── GRE in IPsec ─── 172.16.0.2/30`,
    steps: [
      enable,
      conft,
      { task: "Create IKEv2 keyring KR.", cmd: "crypto ikev2 keyring KR", accept: ["cry|pto ikev2 keyr|ing KR"], enters: "config-ikev2-keyring", hint: "crypto ikev2 keyring KR" },
      { task: "Add a peer entry named BR1.", cmd: "peer BR1", accept: ["peer BR1"], enters: "config-ikev2-keyring-peer", hint: "peer BR1" },
      { task: "Peer address 198.51.100.2.", cmd: "address 198.51.100.2", accept: ["addr|ess 198.51.100.2"], hint: "address 198.51.100.2" },
      { task: "Pre-shared key Br4nchKey!.", cmd: "pre-shared-key Br4nchKey!", accept: ["pre-s|hared-key Br4nchKey!"], hint: "pre-shared-key Br4nchKey!" },
      exit,
      exit,
      { task: "Create IKEv2 profile IKEV2-PROF.", cmd: "crypto ikev2 profile IKEV2-PROF", accept: ["cry|pto ikev2 prof|ile IKEV2-PROF"], enters: "config-ikev2-profile", hint: "crypto ikev2 profile IKEV2-PROF" },
      { task: "Match the remote peer's address.", cmd: "match identity remote address 198.51.100.2 255.255.255.255", accept: ["mat|ch iden|tity rem|ote addr|ess 198.51.100.2 (255.255.255.255)"], hint: "match identity remote address 198.51.100.2 255.255.255.255" },
      { task: "Authenticate the remote side with the pre-shared key.", cmd: "authentication remote pre-share", accept: ["auth|entication rem|ote pre-sh|are"], hint: "authentication remote pre-share" },
      { task: "Authenticate the local side with the pre-shared key.", cmd: "authentication local pre-share", accept: ["auth|entication loc|al pre-sh|are"], hint: "authentication local pre-share" },
      { task: "Use keyring KR.", cmd: "keyring local KR", accept: ["keyr|ing loc|al KR"], hint: "keyring local KR" },
      exit,
      { task: "Create IPsec profile VPN.", cmd: "crypto ipsec profile VPN", accept: ["cry|pto ipsec prof|ile VPN"], enters: "ipsec-profile", hint: "crypto ipsec profile VPN" },
      { task: "Use the IKEv2 profile.", cmd: "set ikev2-profile IKEV2-PROF", accept: ["set ikev2-p|rofile IKEV2-PROF"], hint: "set ikev2-profile IKEV2-PROF" },
      exit,
      { task: "Create Tunnel0.", cmd: "interface Tunnel0", accept: ["int|erface <if:tu0>"], enters: "config-if", hint: "interface tunnel0" },
      { task: "Tunnel address 172.16.0.1/30.", cmd: "ip address 172.16.0.1 255.255.255.252", accept: ["ip add|ress 172.16.0.1 255.255.255.252"], hint: "ip address 172.16.0.1 255.255.255.252" },
      { task: "Lower the tunnel IP MTU to 1400 to leave room for GRE and ESP.", cmd: "ip mtu 1400", accept: ["ip mtu 1400"], hint: "ip mtu 1400" },
      { task: "Source the tunnel from Gi0/0.", cmd: "tunnel source GigabitEthernet0/0", accept: ["tun|nel sou|rce <if:gi0/0>"], hint: "tunnel source gi0/0" },
      { task: "Destination 198.51.100.2.", cmd: "tunnel destination 198.51.100.2", accept: ["tun|nel dest|ination 198.51.100.2"], hint: "tunnel destination 198.51.100.2" },
      { task: "Protect it with IPsec profile VPN.", cmd: "tunnel protection ipsec profile VPN", accept: ["tun|nel prot|ection ipsec prof|ile VPN"], hint: "tunnel protection ipsec profile VPN", output: "%CRYPTO-6-ISAKMP_ON_OFF: ISAKMP is ON\n%LINEPROTO-5-UPDOWN: Line protocol on Interface Tunnel0, changed state to up" },
      end,
    ],
    shows: [
      {
        match: "sh|ow cry|pto ikev2 sa",
        output: ` IPv4 Crypto IKEv2  SA

Tunnel-id Local                 Remote                fvrf/ivrf            Status
1         203.0.113.1/500       198.51.100.2/500      none/none            READY
      Encr: AES-CBC, keysize: 256, PRF: SHA512, Hash: SHA512, DH Grp:19, Auth sign: PSK, Auth verify: PSK`,
      },
    ],
  },
  {
    id: "eigrp-named",
    exam: "encor",
    objective: "3.2.a",
    title: "EIGRP named mode with passive defaults and unequal-cost load sharing",
    hostname: "R1",
    platform: "ios-xe",
    brief: "Run EIGRP named mode CORP, AS 100, on all 10.0.0.0/8 interfaces. Make interfaces passive by default and form neighbours only on Gi0/1. Allow unequal-cost load balancing with variance 2.",
    topology: `  LANs (passive) ── [R1] Gi0/1 ══ EIGRP AS 100 ══ R2`,
    steps: [
      enable,
      conft,
      { task: "Start EIGRP named mode CORP.", cmd: "router eigrp CORP", accept: ["router eigrp CORP"], enters: "config-router", hint: "router eigrp CORP" },
      { task: "IPv4 unicast address family, AS 100.", cmd: "address-family ipv4 unicast autonomous-system 100", accept: ["addr|ess-family ipv4 (uni|cast) auto|nomous-system 100"], enters: "config-router-af", hint: "address-family ipv4 unicast autonomous-system 100" },
      { task: "Enable EIGRP on 10.0.0.0/8.", cmd: "network 10.0.0.0 0.255.255.255", accept: ["net|work 10.0.0.0 0.255.255.255", "net|work 10.0.0.0"], hint: "network 10.0.0.0 0.255.255.255" },
      { task: "Enter the default interface settings.", cmd: "af-interface default", accept: ["af-int|erface def|ault"], enters: "config-router-af-interface", hint: "af-interface default" },
      { task: "Make every interface passive.", cmd: "passive-interface", accept: ["pass|ive-interface"], hint: "passive-interface" },
      { task: "Leave the default interface section.", cmd: "exit-af-interface", accept: ["exit-af-int|erface", "exi|t"], leaves: 1, hint: "exit-af-interface" },
      { task: "Select Gi0/1.", cmd: "af-interface GigabitEthernet0/1", accept: ["af-int|erface <if:gi0/1>"], enters: "config-router-af-interface", hint: "af-interface gi0/1" },
      { task: "Allow neighbours on it.", cmd: "no passive-interface", accept: ["no pass|ive-interface"], hint: "no passive-interface" },
      { task: "Leave the interface section.", cmd: "exit-af-interface", accept: ["exit-af-int|erface", "exi|t"], leaves: 1, hint: "exit-af-interface" },
      { task: "Enter the base topology.", cmd: "topology base", accept: ["top|ology base"], enters: "config-router-af-topology", hint: "topology base" },
      { task: "Unequal-cost load balancing up to twice the best metric.", cmd: "variance 2", accept: ["var|iance 2"], hint: "variance 2", output: "%DUAL-5-NBRCHANGE: EIGRP-IPv4 100: Neighbor 10.0.12.2 (GigabitEthernet0/1) is up: new adjacency" },
      end,
    ],
    shows: [
      {
        match: "sh|ow ip eigrp nei|ghbors",
        output: `EIGRP-IPv4 VR(CORP) Address-Family Neighbors for AS(100)
H   Address                 Interface              Hold Uptime   SRTT   RTO  Q  Seq
                                                   (sec)         (ms)       Cnt Num
0   10.0.12.2               Gi0/1                    13 00:00:21    1   100  0  7`,
      },
    ],
  },
  {
    id: "pbr-guest",
    exam: "encor",
    objective: "3.2.d",
    title: "Policy-route guest traffic to the Internet link",
    hostname: "BR1",
    platform: "ios-xe",
    brief: "Guest users (10.50.0.0/24, arriving on Gi0/2) must leave via the cheap Internet circuit at 203.0.113.1, whatever the routing table says. Corporate traffic keeps following normal routing over MPLS.",
    topology: `  guests 10.50.0.0/24 ── Gi0/2 [BR1] ── Gi0/0 MPLS (routing table)
                                     └── Gi0/1 Internet 203.0.113.1 (PBR)`,
    steps: [
      enable,
      conft,
      { task: "Create extended ACL GUEST.", cmd: "ip access-list extended GUEST", accept: ["ip access-l|ist ext|ended GUEST"], enters: "config-ext-nacl", hint: "ip access-list extended GUEST" },
      { task: "Match the guest subnet to anywhere.", cmd: "permit ip 10.50.0.0 0.0.0.255 any", accept: ["(10) perm|it ip 10.50.0.0 0.0.0.255 any"], hint: "permit ip 10.50.0.0 0.0.0.255 any" },
      exit,
      { task: "Create route-map PBR, permit sequence 10.", cmd: "route-map PBR permit 10", accept: ["route-m|ap PBR (perm|it) (10)"], enters: "config-route-map", hint: "route-map PBR permit 10" },
      { task: "Match ACL GUEST.", cmd: "match ip address GUEST", accept: ["mat|ch ip add|ress GUEST"], hint: "match ip address GUEST" },
      { task: "Send it to 203.0.113.1.", cmd: "set ip next-hop 203.0.113.1", accept: ["set ip next-h|op 203.0.113.1"], hint: "set ip next-hop 203.0.113.1" },
      exit,
      { task: "Go to the guest-facing interface.", cmd: "interface GigabitEthernet0/2", accept: ["int|erface <if:gi0/2>"], enters: "config-if", hint: "interface gi0/2" },
      { task: "Apply the policy to arriving traffic.", cmd: "ip policy route-map PBR", accept: ["ip pol|icy route-m|ap PBR"], hint: "ip policy route-map PBR" },
      end,
    ],
    shows: [
      {
        match: "sh|ow route-m|ap (PBR)",
        output: `route-map PBR, permit, sequence 10
  Match clauses:
    ip address (access-lists): GUEST
  Set clauses:
    ip next-hop 203.0.113.1
  Policy routing matches: 18342 packets, 21945120 bytes`,
      },
    ],
  },
  {
    id: "ntp-auth",
    exam: "encor",
    objective: "3.3.a",
    title: "Authenticated NTP client",
    hostname: "R1",
    platform: "ios-xe",
    brief: "Sync R1 to the NTP server 10.0.0.1, and accept time only if it is authenticated with MD5 key 1 ('Tick70ck').",
    topology: `  [R1] ── NTP (key 1, MD5) ──▶ 10.0.0.1 (stratum 2)`,
    steps: [
      enable,
      conft,
      { task: "Define authentication key 1 (MD5).", cmd: "ntp authentication-key 1 md5 Tick70ck", accept: ["ntp authentication-k|ey 1 md5 Tick70ck"], hint: "ntp authentication-key 1 md5 Tick70ck" },
      { task: "Require authentication.", cmd: "ntp authenticate", accept: ["ntp authenticate"], hint: "ntp authenticate" },
      { task: "Trust key 1.", cmd: "ntp trusted-key 1", accept: ["ntp trusted-k|ey 1"], hint: "ntp trusted-key 1" },
      { task: "Use server 10.0.0.1 with key 1.", cmd: "ntp server 10.0.0.1 key 1", accept: ["ntp serv|er 10.0.0.1 key 1"], hint: "ntp server 10.0.0.1 key 1" },
      end,
    ],
    shows: [
      {
        match: "sh|ow ntp ass|ociations",
        output: `  address         ref clock       st   when   poll reach  delay  offset   disp
*~10.0.0.1        192.0.2.10       2     21     64   377  1.102  -0.207  0.188
 * sys.peer, # selected, + candidate, - outlyer, x falseticker, ~ configured`,
      },
      { match: "sh|ow ntp stat|us", output: "Clock is synchronized, stratum 3, reference is 10.0.0.1" },
    ],
  },
  {
    id: "pim-sm",
    exam: "encor",
    objective: "3.3.d",
    title: "PIM sparse mode with a static RP",
    hostname: "R2",
    platform: "ios-xe",
    brief: "Enable multicast routing on R2 with PIM sparse mode toward the core (Gi0/1) and the receiver LAN (Gi0/2). The RP is 10.0.0.1. Receivers on Gi0/2 use SSM-capable IGMPv3.",
    topology: `  source ── ... ── RP 10.0.0.1 ══ Gi0/1 [R2] Gi0/2 ── receivers (IGMPv3)`,
    steps: [
      enable,
      conft,
      { task: "Enable multicast routing.", cmd: "ip multicast-routing", accept: ["ip multicast-r|outing (distributed)"], hint: "ip multicast-routing" },
      { task: "Point at the static RP 10.0.0.1.", cmd: "ip pim rp-address 10.0.0.1", accept: ["ip pim rp-a|ddress 10.0.0.1"], hint: "ip pim rp-address 10.0.0.1" },
      { task: "Core-facing interface.", cmd: "interface GigabitEthernet0/1", accept: ["int|erface <if:gi0/1>"], enters: "config-if", hint: "interface gi0/1" },
      { task: "PIM sparse mode.", cmd: "ip pim sparse-mode", accept: ["ip pim sparse-m|ode"], hint: "ip pim sparse-mode" },
      exit,
      { task: "Receiver LAN interface.", cmd: "interface GigabitEthernet0/2", accept: ["int|erface <if:gi0/2>"], enters: "config-if", hint: "interface gi0/2" },
      { task: "PIM sparse mode here too (the DR for the LAN).", cmd: "ip pim sparse-mode", accept: ["ip pim sparse-m|ode"], hint: "ip pim sparse-mode" },
      { task: "IGMP version 3.", cmd: "ip igmp version 3", accept: ["ip igmp vers|ion 3"], hint: "ip igmp version 3" },
      end,
    ],
    shows: [
      {
        match: "sh|ow ip mroute",
        output: `(*, 239.1.1.1), 00:02:11/00:03:08, RP 10.0.0.1, flags: SC
  Incoming interface: GigabitEthernet0/1, RPF nbr 10.0.12.1
  Outgoing interface list:
    GigabitEthernet0/2, Forward/Sparse, 00:02:11/00:03:08

(10.9.9.9, 239.1.1.1), 00:01:40/00:02:59, flags: T
  Incoming interface: GigabitEthernet0/1, RPF nbr 10.0.12.1
  Outgoing interface list:
    GigabitEthernet0/2, Forward/Sparse, 00:01:40/00:03:08`,
      },
    ],
  },
  {
    id: "netflow",
    exam: "encor",
    objective: "4.2",
    title: "Flexible NetFlow to a collector",
    hostname: "BR1",
    platform: "ios-xe",
    brief: "Export flows seen arriving on Gi0/1 to the collector 10.0.0.50 (UDP 2055, NetFlow v9). Key flows on the 5-tuple and collect byte and packet counters.",
    topology: `  users ── Gi0/1 [BR1] ── WAN        exporter ──▶ 10.0.0.50:2055`,
    steps: [
      enable,
      conft,
      { task: "Create flow record REC.", cmd: "flow record REC", accept: ["flow rec|ord REC"], enters: "config-flow-record", hint: "flow record REC" },
      { task: "Key on source IPv4 address.", cmd: "match ipv4 source address", accept: ["mat|ch ipv4 sou|rce add|ress"], hint: "match ipv4 source address" },
      { task: "Key on destination IPv4 address.", cmd: "match ipv4 destination address", accept: ["mat|ch ipv4 dest|ination add|ress"], hint: "match ipv4 destination address" },
      { task: "Key on the protocol.", cmd: "match ipv4 protocol", accept: ["mat|ch ipv4 prot|ocol"], hint: "match ipv4 protocol" },
      { task: "Key on the source port.", cmd: "match transport source-port", accept: ["mat|ch trans|port source-p|ort"], hint: "match transport source-port" },
      { task: "Key on the destination port.", cmd: "match transport destination-port", accept: ["mat|ch trans|port destination-p|ort"], hint: "match transport destination-port" },
      { task: "Collect the byte count.", cmd: "collect counter bytes long", accept: ["coll|ect coun|ter bytes (long)"], hint: "collect counter bytes long" },
      { task: "Collect the packet count.", cmd: "collect counter packets long", accept: ["coll|ect coun|ter packets (long)"], hint: "collect counter packets long" },
      exit,
      { task: "Create flow exporter EXP.", cmd: "flow exporter EXP", accept: ["flow exp|orter EXP"], enters: "config-flow-exporter", hint: "flow exporter EXP" },
      { task: "Collector address.", cmd: "destination 10.0.0.50", accept: ["dest|ination 10.0.0.50"], hint: "destination 10.0.0.50" },
      { task: "UDP port 2055.", cmd: "transport udp 2055", accept: ["trans|port udp 2055"], hint: "transport udp 2055" },
      { task: "NetFlow v9 format.", cmd: "export-protocol netflow-v9", accept: ["export-p|rotocol netflow-v9"], hint: "export-protocol netflow-v9" },
      exit,
      { task: "Create flow monitor MON.", cmd: "flow monitor MON", accept: ["flow mon|itor MON"], enters: "config-flow-monitor", hint: "flow monitor MON" },
      { task: "Use record REC.", cmd: "record REC", accept: ["rec|ord REC"], hint: "record REC" },
      { task: "Use exporter EXP.", cmd: "exporter EXP", accept: ["exp|orter EXP"], hint: "exporter EXP" },
      exit,
      { task: "Go to Gi0/1.", cmd: "interface GigabitEthernet0/1", accept: ["int|erface <if:gi0/1>"], enters: "config-if", hint: "interface gi0/1" },
      { task: "Monitor arriving traffic.", cmd: "ip flow monitor MON input", accept: ["ip flow mon|itor MON in|put"], hint: "ip flow monitor MON input" },
      end,
    ],
    shows: [
      {
        match: "sh|ow flow exp|orter stat|istics",
        output: `Flow Exporter EXP:
  Packet send statistics (last cleared 00:10:12 ago):
    Successfully sent:         412                   (58214 bytes)`,
      },
    ],
  },
  {
    id: "span-erspan",
    exam: "encor",
    objective: "4.3",
    title: "Local SPAN and an ERSPAN source session",
    hostname: "SW1",
    platform: "ios-xe",
    brief: "Mirror Gi1/0/1 (both directions) to a local analyser on Gi1/0/24. Also send received traffic from Gi1/0/2 across the routed core with ERSPAN ID 10 to the collector 10.9.9.9, sourced from 10.0.0.2.",
    topology: `  Gi1/0/1 ⇄ ─ SPAN 1 ─▶ Gi1/0/24 analyser
  Gi1/0/2 ← ─ ERSPAN 2 (GRE) ═ routed core ═▶ 10.9.9.9`,
    steps: [
      enable,
      conft,
      { task: "Session 1 source: Gi1/0/1, both directions.", cmd: "monitor session 1 source interface GigabitEthernet1/0/1 both", accept: ["mon|itor sess|ion 1 sou|rce int|erface <if:gi1/0/1> (both)"], hint: "monitor session 1 source interface gi1/0/1 both" },
      { task: "Session 1 destination: Gi1/0/24.", cmd: "monitor session 1 destination interface GigabitEthernet1/0/24", accept: ["mon|itor sess|ion 1 dest|ination int|erface <if:gi1/0/24>"], hint: "monitor session 1 destination interface gi1/0/24" },
      { task: "Create ERSPAN source session 2.", cmd: "monitor session 2 type erspan-source", accept: ["mon|itor sess|ion 2 type erspan-s|ource"], enters: "config-mon-erspan-src", hint: "monitor session 2 type erspan-source" },
      { task: "Source Gi1/0/2, received traffic.", cmd: "source interface GigabitEthernet1/0/2 rx", accept: ["sou|rce int|erface <if:gi1/0/2> rx"], hint: "source interface gi1/0/2 rx" },
      { task: "Enter the destination section.", cmd: "destination", accept: ["dest|ination"], enters: "config-mon-erspan-src-dst", hint: "destination" },
      { task: "ERSPAN ID 10.", cmd: "erspan-id 10", accept: ["erspan-id 10"], hint: "erspan-id 10" },
      { task: "Collector address 10.9.9.9.", cmd: "ip address 10.9.9.9", accept: ["ip add|ress 10.9.9.9"], hint: "ip address 10.9.9.9" },
      { task: "Source the GRE packets from 10.0.0.2.", cmd: "origin ip address 10.0.0.2", accept: ["orig|in ip add|ress 10.0.0.2"], hint: "origin ip address 10.0.0.2" },
      exit,
      { task: "ERSPAN sessions start shut down: enable it.", cmd: "no shutdown", accept: ["no shut|down"], hint: "no shutdown" },
      end,
    ],
    shows: [
      {
        match: "sh|ow mon|itor (sess|ion all)",
        output: `Session 1
---------
Type                     : Local Session
Source Ports             :
    Both                 : Gi1/0/1
Destination Ports        : Gi1/0/24

Session 2
---------
Type                     : ERSPAN Source Session
Status                   : Admin Enabled
Source Ports             :
    RX Only              : Gi1/0/2
Destination IP Address   : 10.9.9.9
Origin IP Address        : 10.0.0.2
ERSPAN ID                : 10`,
      },
    ],
  },
  {
    id: "netconf-restconf",
    exam: "encor",
    objective: "4.6",
    title: "Turn on NETCONF and RESTCONF",
    hostname: "R1",
    platform: "ios-xe",
    brief: "An automation team needs NETCONF (SSH 830) and RESTCONF (HTTPS) on R1. Create a privilege-15 local user 'netops' (secret 'Aut0mate!'), enable both agents and the HTTPS server with local authentication.",
    topology: `  automation host ── NETCONF/SSH 830 ──▶ [R1]
                  └── RESTCONF/HTTPS 443 ──▶`,
    steps: [
      enable,
      conft,
      { task: "Create user netops with privilege 15.", cmd: "username netops privilege 15 secret Aut0mate!", accept: ["user|name netops priv|ilege 15 sec|ret Aut0mate!"], hint: "username netops privilege 15 secret Aut0mate!" },
      { task: "Enable the NETCONF agent.", cmd: "netconf-yang", accept: ["netconf-yang"], hint: "netconf-yang" },
      { task: "Enable the HTTPS server.", cmd: "ip http secure-server", accept: ["ip http secure-s|erver"], hint: "ip http secure-server" },
      { task: "Authenticate HTTP users locally.", cmd: "ip http authentication local", accept: ["ip http auth|entication loc|al"], hint: "ip http authentication local" },
      { task: "Enable RESTCONF.", cmd: "restconf", accept: ["restconf"], hint: "restconf" },
      end,
    ],
    shows: [
      {
        match: "sh|ow netconf-yang stat|us",
        output: `netconf-yang: enabled
netconf-yang ssh port: 830
netconf-yang candidate-datastore: disabled`,
      },
      {
        match: "sh|ow platform software yang-management process",
        output: `confd            : Running
nesd             : Running
syncfd           : Running
ncsshd           : Running
dmiauthd         : Running
nginx            : Running
ndbmand          : Running
pubd             : Running`,
      },
    ],
  },
  {
    id: "ssh-local",
    exam: "encor",
    objective: "5.1.a",
    title: "SSH-only access with local users",
    hostname: "R1",
    platform: "ios-xe",
    brief: "Replace Telnet with SSHv2 on R1. Use domain corp.local and 2048-bit RSA keys, a local admin with a type-9 secret ('Str0ngPass!'), and log idle VTY sessions out after 10 minutes.",
    topology: `  admin ── SSHv2 ──▶ [R1] vty 0 4 (Telnet refused)`,
    steps: [
      enable,
      conft,
      { task: "Set the domain name (needed for the RSA key name).", cmd: "ip domain name corp.local", accept: ["ip domain name corp.local", "ip domain-name corp.local"], hint: "ip domain name corp.local" },
      { task: "Generate 2048-bit RSA keys.", cmd: "crypto key generate rsa modulus 2048", accept: ["cry|pto key gen|erate rsa (gen|eral-keys) mod|ulus 2048"], hint: "crypto key generate rsa modulus 2048", output: "% Generating 2048 bit RSA keys, keys will be non-exportable...\n[OK] (elapsed time was 1 seconds)\n%SSH-5-ENABLED: SSH 1.99 has been enabled" },
      { task: "Allow SSH version 2 only.", cmd: "ip ssh version 2", accept: ["ip ssh vers|ion 2"], hint: "ip ssh version 2" },
      { task: "Local admin with a type-9 secret.", cmd: "username admin privilege 15 algorithm-type scrypt secret Str0ngPass!", accept: ["user|name admin priv|ilege 15 alg|orithm-type scrypt sec|ret Str0ngPass!"], hint: "username admin privilege 15 algorithm-type scrypt secret Str0ngPass!" },
      { task: "Configure VTY lines 0 to 4.", cmd: "line vty 0 4", accept: ["line vty 0 4"], enters: "config-line", hint: "line vty 0 4" },
      { task: "Authenticate with local users.", cmd: "login local", accept: ["login local"], hint: "login local" },
      { task: "Allow SSH only.", cmd: "transport input ssh", accept: ["trans|port in|put ssh"], hint: "transport input ssh" },
      { task: "Idle timeout 10 minutes.", cmd: "exec-timeout 10 0", accept: ["exec-t|imeout 10 (0)"], hint: "exec-timeout 10 0" },
      end,
    ],
    shows: [
      {
        match: "sh|ow ip ssh",
        output: `SSH Enabled - version 2.0
Authentication methods:publickey,keyboard-interactive,password
Authentication timeout: 120 secs; Authentication retries: 3`,
      },
    ],
  },
  {
    id: "copp",
    exam: "encor",
    objective: "5.2.b",
    title: "Police management traffic to the control plane",
    hostname: "R1",
    platform: "ios-xe",
    brief: "Protect R1's CPU: SSH from the management subnet 10.0.0.0/24 is policed to 128 kb/s (excess dropped), and that policy is applied to the control plane. (Routers use user-defined CoPP. Catalyst 9000 switches ship a fixed system CoPP policy.)",
    topology: `  mgmt 10.0.0.0/24 ── SSH ──▶ [R1 control plane]  policy COPP (128 kb/s)`,
    steps: [
      enable,
      conft,
      { task: "ACL COPP-SSH for management SSH.", cmd: "ip access-list extended COPP-SSH", accept: ["ip access-l|ist ext|ended COPP-SSH"], enters: "config-ext-nacl", hint: "ip access-list extended COPP-SSH" },
      { task: "Match SSH from 10.0.0.0/24.", cmd: "permit tcp 10.0.0.0 0.0.0.255 any eq 22", accept: ["(10) perm|it tcp 10.0.0.0 0.0.0.255 any eq {22,ssh}"], hint: "permit tcp 10.0.0.0 0.0.0.255 any eq 22" },
      exit,
      { task: "Class-map CM-SSH.", cmd: "class-map match-all CM-SSH", accept: ["class-m|ap (match-all) CM-SSH"], enters: "config-cmap", hint: "class-map match-all CM-SSH" },
      { task: "Match the ACL.", cmd: "match access-group name COPP-SSH", accept: ["mat|ch access-g|roup name COPP-SSH"], hint: "match access-group name COPP-SSH" },
      exit,
      { task: "Policy-map COPP.", cmd: "policy-map COPP", accept: ["policy-m|ap COPP"], enters: "config-pmap", hint: "policy-map COPP" },
      { task: "Select class CM-SSH.", cmd: "class CM-SSH", accept: ["cla|ss CM-SSH"], enters: "config-pmap-c", hint: "class CM-SSH" },
      { task: "Police to 128 kb/s: transmit conforming, drop excess.", cmd: "police 128000 conform-action transmit exceed-action drop", accept: ["pol|ice (cir) 128000 conform-a|ction trans|mit exceed-a|ction drop"], hint: "police 128000 conform-action transmit exceed-action drop" },
      exit,
      exit,
      { task: "Enter the control plane.", cmd: "control-plane", accept: ["control-p|lane"], enters: "config-cp", hint: "control-plane" },
      { task: "Apply COPP inbound.", cmd: "service-policy input COPP", accept: ["serv|ice-policy in|put COPP"], hint: "service-policy input COPP" },
      end,
    ],
    shows: [
      {
        match: "sh|ow policy-map control-p|lane",
        output: ` Control Plane

  Service-policy input: COPP

    Class-map: CM-SSH (match-all)
      2381 packets, 291442 bytes
      Match: access-group name COPP-SSH
      police:
          cir 128000 bps, bc 4000 bytes
        conformed 2301 packets, 280122 bytes; actions:
          transmit
        exceeded 80 packets, 11320 bytes; actions:
          drop`,
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
  {
    id: "roce-classify",
    exam: "dcai",
    objective: "3.1.c",
    title: "Classify RoCE and CNP traffic on a GPU-facing port",
    hostname: "LEAF1",
    platform: "nx-os",
    brief:
      "The GPU NICs mark RoCE data with DSCP 24 or 26 and CNPs with DSCP 48. Classify them into qos-group 3 (no-drop) and qos-group 7 (priority), apply the policy inbound on Ethernet1/1, and give the port a 9216 MTU.",
    topology: `  GPU NIC ── DSCP 24/26 (RoCE) · DSCP 48 (CNP) ──▶ Eth1/1 [LEAF1]
                       qos-group 3        qos-group 7`,
    steps: [
      conft,
      { task: "Create class-map ROCE (type qos, match-all).", cmd: "class-map type qos match-all ROCE", accept: ["class-m|ap ty|pe qos (match-all) ROCE"], enters: "config-cmap-qos", hint: "class-map type qos match-all ROCE" },
      { task: "Match DSCP 24 and 26.", cmd: "match dscp 24,26", accept: ["mat|ch dscp 24,26", "mat|ch dscp 26,24"], hint: "match dscp 24,26" },
      exit,
      { task: "Create class-map CNP (type qos, match-all).", cmd: "class-map type qos match-all CNP", accept: ["class-m|ap ty|pe qos (match-all) CNP"], enters: "config-cmap-qos", hint: "class-map type qos match-all CNP" },
      { task: "Match DSCP 48.", cmd: "match dscp 48", accept: ["mat|ch dscp 48"], hint: "match dscp 48" },
      exit,
      { task: "Create the classification policy RoCE-QOS.", cmd: "policy-map type qos RoCE-QOS", accept: ["policy-m|ap ty|pe qos RoCE-QOS"], enters: "config-pmap-qos", hint: "policy-map type qos RoCE-QOS" },
      { task: "Select class ROCE.", cmd: "class ROCE", accept: ["cla|ss ROCE"], enters: "config-pmap-c-qos", hint: "class ROCE" },
      { task: "Put it in qos-group 3.", cmd: "set qos-group 3", accept: ["set qos-g|roup 3"], hint: "set qos-group 3" },
      exit,
      { task: "Select class CNP.", cmd: "class CNP", accept: ["cla|ss CNP"], enters: "config-pmap-c-qos", hint: "class CNP" },
      { task: "Put it in qos-group 7.", cmd: "set qos-group 7", accept: ["set qos-g|roup 7"], hint: "set qos-group 7" },
      exit,
      exit,
      { task: "Go to the GPU-facing port.", cmd: "interface Ethernet1/1", accept: ["int|erface <if:eth1/1>"], enters: "config-if", hint: "interface ethernet1/1" },
      { task: "Jumbo MTU.", cmd: "mtu 9216", accept: ["mtu 9216"], hint: "mtu 9216" },
      { task: "Apply RoCE-QOS inbound.", cmd: "service-policy type qos input RoCE-QOS", accept: ["serv|ice-policy ty|pe qos in|put RoCE-QOS"], hint: "service-policy type qos input RoCE-QOS" },
      end,
    ],
    shows: [
      {
        match: "sh|ow policy-map int|erface <rest>",
        output: `Global statistics status :   enabled

Ethernet1/1

  Service-policy (qos) input:   RoCE-QOS

    Class-map (qos):   ROCE (match-all)
      Slot 1
        9182736 packets
      Match: dscp 24,26
      set qos-group 3

    Class-map (qos):   CNP (match-all)
      Slot 1
        10482 packets
      Match: dscp 48
      set qos-group 7

    Class-map (qos):   class-default (match-any)
      Slot 1
        2231 packets`,
      },
    ],
  },
  {
    id: "pfc-watchdog",
    exam: "dcai",
    objective: "4.4",
    title: "Contain PFC storms with the watchdog",
    hostname: "LEAF2",
    platform: "nx-os",
    brief:
      "Last week a failed NIC sent pause frames non-stop and froze the no-drop class across the pod. Enable the PFC watchdog globally, and shut a stuck queue after 5 watchdog intervals. Then check the result.",
    topology: `  stuck NIC ══ PAUSE PAUSE PAUSE ══▶ Eth1/12 [LEAF2] ══▶ spines (congestion spreads)`,
    steps: [
      conft,
      { task: "Turn on the PFC watchdog globally.", cmd: "priority-flow-control watch-dog-interval on", accept: ["prio|rity-flow-control watch-dog-i|nterval on"], hint: "priority-flow-control watch-dog-interval on" },
      { task: "Shut a stuck queue after 5 intervals.", cmd: "priority-flow-control watch-dog shutdown-multiplier 5", accept: ["prio|rity-flow-control watch-dog shut|down-multiplier 5"], hint: "priority-flow-control watch-dog shutdown-multiplier 5" },
      end,
    ],
    shows: [
      {
        match: "sh|ow queu|ing pfc-q|ueue (det|ail)",
        output: `+----------------------------------------------------+
Global watch-dog interval [Enabled]
Global PFC watchdog shutdown-multiplier [5]
+----------------------------------------------------+

+----------------------------------------------------+
|  Port PFC Watchdog (VL bmap)        | Enabled (0x8)
+----------------------------------------------------+
| Ethernet1/12  QOS GROUP 3    [Active]  PFC [YES]   PFC-COS [3]
|   Stomped packets   |   0
|   Shutdown events   |   1
|   Restore events    |   1`,
      },
    ],
  },
  {
    id: "ecmp-hash",
    exam: "dcai",
    objective: "3.1.d",
    title: "Add L4 entropy to fabric ECMP hashing",
    hostname: "LEAF3",
    platform: "nx-os",
    brief:
      "Two of LEAF3's four spine uplinks run hot while the other two idle. RoCEv2 flows between the same hosts differ only in their UDP source port, so hash on Layer 4 ports as well as IP addresses. Set the uplink range Ethernet1/49-52 to MTU 9216 while you are there.",
    topology: `             SPINE1  SPINE2  SPINE3  SPINE4
               98%     3%     98%     3%
                 \\      |      |      /
                  Eth1/49-52 [LEAF3]`,
    steps: [
      conft,
      { task: "Hash on source/destination IP and L4 ports.", cmd: "ip load-sharing address source-destination port source-destination", accept: ["ip load-sh|aring add|ress source-d|estination port source-d|estination"], hint: "ip load-sharing address source-destination port source-destination" },
      { task: "Select the four uplinks at once.", cmd: "interface Ethernet1/49-52", accept: ["int|erface ethernet1/49-52", "int|erface ethernet 1/49-52", "int|erface eth1/49-52", "int|erface eth 1/49-52", "int|erface e1/49-52", "int|erface e 1/49-52"], enters: "config-if-range", hint: "interface ethernet1/49-52" },
      { task: "Jumbo MTU on the uplinks.", cmd: "mtu 9216", accept: ["mtu 9216"], hint: "mtu 9216" },
      end,
    ],
    shows: [
      {
        match: "sh|ow ip load-sh|aring",
        output: `IPv4/IPv6 ECMP load sharing:
Universal-id (Random Seed): 3735928559
Load-share mode : address source-destination port source-destination
GRE-Outer hash is disabled
Concatenation is disabled
Rotate: 32`,
      },
    ],
  },
  {
    id: "fabric-telemetry",
    exam: "dcai",
    objective: "4.3",
    title: "Stream interface telemetry to a collector",
    hostname: "LEAF1",
    platform: "nx-os",
    brief:
      "Polling every 5 minutes hides microbursts. Stream the interface tree (sys/intf) every 10 seconds with gRPC and GPB encoding to the collector at 10.0.0.50 port 57000.",
    topology: `  [LEAF1] ── gRPC/GPB every 10 s ──▶ collector 10.0.0.50:57000`,
    steps: [
      conft,
      { task: "Enable the telemetry feature.", cmd: "feature telemetry", accept: ["fea|ture tele|metry"], hint: "feature telemetry" },
      { task: "Enter telemetry configuration.", cmd: "telemetry", accept: ["tele|metry"], enters: "config-telemetry", hint: "telemetry" },
      { task: "Create destination group 1.", cmd: "destination-group 1", accept: ["dest|ination-group 1"], enters: "conf-tm-dest", hint: "destination-group 1" },
      { task: "Point it at the collector (gRPC, GPB).", cmd: "ip address 10.0.0.50 port 57000 protocol gRPC encoding GPB", accept: ["ip add|ress 10.0.0.50 port 57000 prot|ocol grpc enc|oding gpb"], hint: "ip address 10.0.0.50 port 57000 protocol gRPC encoding GPB" },
      exit,
      { task: "Create sensor group 1.", cmd: "sensor-group 1", accept: ["sens|or-group 1"], enters: "conf-tm-sensor", hint: "sensor-group 1" },
      { task: "Use the DME data source.", cmd: "data-source DME", accept: ["data-s|ource dme"], hint: "data-source DME" },
      { task: "Stream the whole interface tree.", cmd: "path sys/intf depth unbounded", accept: ["path sys/intf (depth unbounded)"], hint: "path sys/intf depth unbounded" },
      exit,
      { task: "Create subscription 1.", cmd: "subscription 1", accept: ["subs|cription 1"], enters: "conf-tm-sub", hint: "subscription 1" },
      { task: "Send it to destination group 1.", cmd: "dst-grp 1", accept: ["dst-grp 1"], hint: "dst-grp 1" },
      { task: "Sample sensor group 1 every 10 seconds (10000 ms).", cmd: "snsr-grp 1 sample-interval 10000", accept: ["snsr-grp 1 sample-i|nterval 10000"], hint: "snsr-grp 1 sample-interval 10000" },
      end,
    ],
    shows: [
      {
        match: "sh|ow tele|metry trans|port",
        output: `Session Id      IP Address      Port       Encoding   Transport  Status
-----------------------------------------------------------------------------------
0               10.0.0.50       57000      GPB        gRPC       Connected`,
      },
    ],
  },
  {
    id: "time-and-logs",
    exam: "dcai",
    objective: "4.3",
    title: "Time and logging for cross-device log correlation",
    hostname: "LEAF1",
    platform: "nx-os",
    brief:
      "Logs from switches, servers and GPUs can't be lined up because LEAF1's clock drifts. Sync to NTP server 10.0.0.1 and send severity 5 and above to syslog server 10.0.0.60, both through the management VRF, with millisecond timestamps.",
    topology: `  [LEAF1] mgmt0 ── NTP 10.0.0.1 · syslog 10.0.0.60`,
    steps: [
      conft,
      { task: "Use NTP server 10.0.0.1 via the management VRF.", cmd: "ntp server 10.0.0.1 use-vrf management", accept: ["ntp ser|ver 10.0.0.1 use-v|rf man|agement"], hint: "ntp server 10.0.0.1 use-vrf management" },
      { task: "Send severity 5 (notifications) and above to 10.0.0.60 via management.", cmd: "logging server 10.0.0.60 5 use-vrf management", accept: ["logg|ing ser|ver 10.0.0.60 5 use-v|rf man|agement"], hint: "logging server 10.0.0.60 5 use-vrf management" },
      { task: "Millisecond timestamps on log messages.", cmd: "logging timestamp milliseconds", accept: ["logg|ing time|stamp milli|seconds"], hint: "logging timestamp milliseconds" },
      end,
    ],
    shows: [
      {
        match: "sh|ow ntp peer-s|tatus",
        output: `Total peers : 1
* - selected for sync, + -  peer mode(active),
- - peer mode(passive), = - polled in client mode
    remote                                 local                                   st   poll   reach delay   vrf
-----------------------------------------------------------------------------------------------------------------------
*10.0.0.1                                 0.0.0.0                                  2   64     377   0.00041 management`,
      },
    ],
  },
  // --- DCCOR: NX-OS and MDS drills ------------------------------------------------------------
  {
    id: "nxos-ospf",
    exam: "dccor",
    objective: "1.1.a",
    title: "OSPF underlay on a leaf, the NX-OS way",
    hostname: "LEAF1",
    platform: "nx-os",
    brief: "Bring up OSPF process UNDERLAY with router ID 10.0.0.11. Put loopback0 and the /31 spine link Ethernet1/49 into area 0, with the spine link as point-to-point and BFD for fast failure detection.",
    topology: `  [SPINE1] Eth1/1 ══ 10.1.1.0/31 ══ Eth1/49 [LEAF1] lo0 10.0.0.11/32`,
    steps: [
      conft,
      { task: "Enable OSPF.", cmd: "feature ospf", accept: ["fea|ture ospf"], hint: "feature ospf" },
      { task: "Enable BFD.", cmd: "feature bfd", accept: ["fea|ture bfd"], hint: "feature bfd", output: "Please disable the ICMP redirects on all interfaces running BFD sessions using the command below\n'no ip redirects'" },
      { task: "Create OSPF process UNDERLAY.", cmd: "router ospf UNDERLAY", accept: ["router ospf UNDERLAY"], enters: "config-router", hint: "router ospf UNDERLAY" },
      { task: "Router ID 10.0.0.11.", cmd: "router-id 10.0.0.11", accept: ["router-id 10.0.0.11"], hint: "router-id 10.0.0.11" },
      { task: "BFD for all OSPF interfaces.", cmd: "bfd", accept: ["bfd"], hint: "bfd" },
      exit,
      { task: "Configure loopback0.", cmd: "interface loopback0", accept: ["int|erface lo|opback0", "int|erface lo|opback 0"], enters: "config-if", hint: "interface loopback0" },
      { task: "Add it to area 0.0.0.0.", cmd: "ip router ospf UNDERLAY area 0.0.0.0", accept: ["ip router ospf UNDERLAY area 0.0.0.0", "ip router ospf UNDERLAY area 0"], hint: "ip router ospf UNDERLAY area 0.0.0.0" },
      exit,
      { task: "Configure the spine link Ethernet1/49.", cmd: "interface Ethernet1/49", accept: ["int|erface <if:eth1/49>"], enters: "config-if", hint: "interface ethernet1/49" },
      { task: "Point-to-point network type.", cmd: "ip ospf network point-to-point", accept: ["ip ospf net|work point-to-point"], hint: "ip ospf network point-to-point" },
      { task: "Add it to area 0.0.0.0.", cmd: "ip router ospf UNDERLAY area 0.0.0.0", accept: ["ip router ospf UNDERLAY area 0.0.0.0", "ip router ospf UNDERLAY area 0"], hint: "ip router ospf UNDERLAY area 0.0.0.0", output: "%OSPF-5-ADJCHANGE: ospf-UNDERLAY [5732] Nbr 10.0.0.1 on Ethernet1/49 went FULL" },
      end,
    ],
    shows: [
      {
        match: "sh|ow ip ospf nei|ghbors",
        output: ` OSPF Process ID UNDERLAY VRF default
 Total number of neighbors: 1
 Neighbor ID     Pri State            Up Time  Address         Interface
 10.0.0.1          1 FULL/ -          00:00:41 10.1.1.0        Eth1/49`,
      },
    ],
  },
  {
    id: "nxos-bgp-evpn",
    exam: "dccor",
    objective: "1.1.b",
    title: "iBGP EVPN session from a leaf to its route reflector",
    hostname: "LEAF1",
    platform: "nx-os",
    brief: "Peer LEAF1 (AS 65001) with spine route reflector 10.0.0.1 over loopbacks, carrying the l2vpn evpn address family with extended communities.",
    topology: `  [LEAF1] lo0 10.0.0.11 ── iBGP AS 65001 (l2vpn evpn) ──▶ [SPINE1 RR] lo0 10.0.0.1`,
    steps: [
      conft,
      { task: "Enable BGP.", cmd: "feature bgp", accept: ["fea|ture bgp"], hint: "feature bgp" },
      { task: "Enable the VXLAN overlay feature.", cmd: "feature nv overlay", accept: ["fea|ture nv over|lay"], hint: "feature nv overlay" },
      { task: "Enable EVPN as the overlay control plane.", cmd: "nv overlay evpn", accept: ["nv over|lay evpn"], hint: "nv overlay evpn" },
      { task: "Start BGP AS 65001.", cmd: "router bgp 65001", accept: ["router bgp 65001"], enters: "config-router", hint: "router bgp 65001" },
      { task: "Router ID 10.0.0.11.", cmd: "router-id 10.0.0.11", accept: ["router-id 10.0.0.11"], hint: "router-id 10.0.0.11" },
      { task: "Add the spine 10.0.0.1 as a neighbour.", cmd: "neighbor 10.0.0.1", accept: ["nei|ghbor 10.0.0.1"], enters: "config-router-neighbor", hint: "neighbor 10.0.0.1" },
      { task: "Same AS (iBGP).", cmd: "remote-as 65001", accept: ["remote-as 65001"], hint: "remote-as 65001" },
      { task: "Source the session from loopback0.", cmd: "update-source loopback0", accept: ["upd|ate-source lo|opback0", "upd|ate-source lo|opback 0"], hint: "update-source loopback0" },
      { task: "Enter the l2vpn evpn address family.", cmd: "address-family l2vpn evpn", accept: ["add|ress-family l2vpn evpn"], enters: "config-router-neighbor-af", hint: "address-family l2vpn evpn" },
      { task: "Send extended communities (route targets).", cmd: "send-community extended", accept: ["send-c|ommunity ext|ended", "send-c|ommunity both"], hint: "send-community extended", output: "%BGP-5-ADJCHANGE: bgp-65001 [8812] neighbor 10.0.0.1 Up" },
      end,
    ],
    shows: [
      {
        match: "sh|ow bgp l2vpn evpn summ|ary",
        output: `BGP summary information for VRF default, address family L2VPN EVPN
BGP router identifier 10.0.0.11, local AS number 65001
Neighbor        V    AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd
10.0.0.1        4 65001      42      38       17    0    0 00:05:12 12`,
      },
    ],
  },
  {
    id: "nxos-pim",
    exam: "dccor",
    objective: "1.1.c",
    title: "PIM sparse mode with an anycast RP on two spines",
    hostname: "SPINE1",
    platform: "nx-os",
    brief: "Make SPINE1 one of two anycast RPs (RP address 10.254.254.1 on loopback254) for 239.0.0.0/8, with SPINE2 (10.0.0.2) as the other RP member. Enable PIM sparse mode on the leaf-facing link Ethernet1/1.",
    topology: `  [SPINE1 10.0.0.1] ═ anycast RP 10.254.254.1 ═ [SPINE2 10.0.0.2]
        Eth1/1 ── PIM ── leaves (VTEPs, BUM groups 239.x)`,
    steps: [
      conft,
      { task: "Enable PIM.", cmd: "feature pim", accept: ["fea|ture pim"], hint: "feature pim" },
      { task: "Create loopback254 for the shared RP address.", cmd: "interface loopback254", accept: ["int|erface lo|opback254", "int|erface lo|opback 254"], enters: "config-if", hint: "interface loopback254" },
      { task: "RP address 10.254.254.1/32.", cmd: "ip address 10.254.254.1/32", accept: ["ip add|ress 10.254.254.1/32", "ip add|ress 10.254.254.1 255.255.255.255"], hint: "ip address 10.254.254.1/32" },
      { task: "PIM on the loopback.", cmd: "ip pim sparse-mode", accept: ["ip pim sparse-m|ode"], hint: "ip pim sparse-mode" },
      exit,
      { task: "Static RP 10.254.254.1 for 239.0.0.0/8.", cmd: "ip pim rp-address 10.254.254.1 group-list 239.0.0.0/8", accept: ["ip pim rp-a|ddress 10.254.254.1 group-l|ist 239.0.0.0/8"], hint: "ip pim rp-address 10.254.254.1 group-list 239.0.0.0/8" },
      { task: "Anycast RP member: this spine (10.0.0.1).", cmd: "ip pim anycast-rp 10.254.254.1 10.0.0.1", accept: ["ip pim anycast-rp 10.254.254.1 10.0.0.1"], hint: "ip pim anycast-rp 10.254.254.1 10.0.0.1" },
      { task: "Anycast RP member: SPINE2 (10.0.0.2).", cmd: "ip pim anycast-rp 10.254.254.1 10.0.0.2", accept: ["ip pim anycast-rp 10.254.254.1 10.0.0.2"], hint: "ip pim anycast-rp 10.254.254.1 10.0.0.2" },
      { task: "Leaf-facing link Ethernet1/1.", cmd: "interface Ethernet1/1", accept: ["int|erface <if:eth1/1>"], enters: "config-if", hint: "interface ethernet1/1" },
      { task: "PIM sparse mode.", cmd: "ip pim sparse-mode", accept: ["ip pim sparse-m|ode"], hint: "ip pim sparse-mode" },
      end,
    ],
    shows: [
      {
        match: "sh|ow ip pim rp",
        output: `PIM RP Status Information for VRF "default"
Anycast-RP 10.254.254.1 members:
  10.0.0.1*  10.0.0.2
RP: 10.254.254.1*, (0), uptime: 00:02:10   priority: 255,
  RP-source: (local), group ranges:
  239.0.0.0/8`,
      },
    ],
  },
  {
    id: "nxos-hsrp",
    exam: "dccor",
    objective: "1.1.d",
    title: "HSRP on an NX-OS SVI",
    hostname: "AGG1",
    platform: "nx-os",
    brief: "AGG1 is the preferred gateway 10.1.10.1 for VLAN 10 (HSRPv2 group 10, priority 110, preempt with a 60-second delay). Its SVI address is 10.1.10.2/24.",
    topology: `  hosts VLAN 10 ── [AGG1 .2  prio 110]  [AGG2 .3  prio 100]  VIP 10.1.10.1`,
    steps: [
      conft,
      { task: "Enable SVIs.", cmd: "feature interface-vlan", accept: ["fea|ture interface-vlan"], hint: "feature interface-vlan" },
      { task: "Enable HSRP.", cmd: "feature hsrp", accept: ["fea|ture hsrp"], hint: "feature hsrp" },
      { task: "Configure interface Vlan10.", cmd: "interface Vlan10", accept: ["int|erface <if:vlan10>", "int|erface vlan 10"], enters: "config-if", hint: "interface vlan10" },
      { task: "Real address 10.1.10.2/24.", cmd: "ip address 10.1.10.2/24", accept: ["ip add|ress 10.1.10.2/24", "ip add|ress 10.1.10.2 255.255.255.0"], hint: "ip address 10.1.10.2/24" },
      { task: "HSRP version 2.", cmd: "hsrp version 2", accept: ["hsrp vers|ion 2"], hint: "hsrp version 2" },
      { task: "Enter group 10.", cmd: "hsrp 10", accept: ["hsrp 10"], enters: "config-if-hsrp", hint: "hsrp 10" },
      { task: "Virtual IP 10.1.10.1.", cmd: "ip 10.1.10.1", accept: ["ip 10.1.10.1"], hint: "ip 10.1.10.1" },
      { task: "Priority 110.", cmd: "priority 110", accept: ["prio|rity 110"], hint: "priority 110" },
      { task: "Preempt, waiting 60 seconds after boot.", cmd: "preempt delay minimum 60", accept: ["pre|empt del|ay min|imum 60"], hint: "preempt delay minimum 60" },
      exit,
      { task: "Bring the SVI up.", cmd: "no shutdown", accept: ["no shut|down"], hint: "no shutdown", output: "%HSRP_ENGINE-5-STATECHANGE: Interface Vlan10 Grp 10 state Standby -> Active" },
      end,
    ],
    shows: [
      {
        match: "sh|ow hsrp br|ief",
        output: `                     P indicates configured to preempt.
                     |
 Interface   Grp  Prio P State    Active addr      Standby addr     Group addr
  Vlan10     10   110  P Active   local            10.1.10.3        10.1.10.1      (conf)`,
      },
    ],
  },
  {
    id: "vpc-domain",
    exam: "dccor",
    objective: "1.2",
    title: "Build a vPC domain and a vPC to a server",
    hostname: "LEAF1",
    platform: "nx-os",
    brief: "Pair LEAF1 with LEAF2 in vPC domain 10 (LEAF1 primary with role priority 100). Keepalive over mgmt0 (192.168.0.1 → 192.168.0.2). Port-channel 1 is the peer-link, and port-channel 20 is vPC 20 down to a server.",
    topology: `  [LEAF1] ═ Po1 peer-link ═ [LEAF2]     mgmt0 ── keepalive ── mgmt0
      └──────── Po20 / vPC 20 ────────┘
                    server`,
    steps: [
      conft,
      { task: "Enable vPC.", cmd: "feature vpc", accept: ["fea|ture vpc"], hint: "feature vpc" },
      { task: "Enable LACP.", cmd: "feature lacp", accept: ["fea|ture lacp"], hint: "feature lacp" },
      { task: "Create vPC domain 10.", cmd: "vpc domain 10", accept: ["vpc dom|ain 10"], enters: "config-vpc-domain", hint: "vpc domain 10" },
      { task: "Role priority 100 (lower = primary).", cmd: "role priority 100", accept: ["role prio|rity 100"], hint: "role priority 100" },
      { task: "Peer-keepalive over the management VRF.", cmd: "peer-keepalive destination 192.168.0.2 source 192.168.0.1 vrf management", accept: ["peer-k|eepalive dest|ination 192.168.0.2 sou|rce 192.168.0.1 (vrf man|agement)"], hint: "peer-keepalive destination 192.168.0.2 source 192.168.0.1 vrf management" },
      { task: "Let each peer route frames sent to the other's MAC.", cmd: "peer-gateway", accept: ["peer-g|ateway"], hint: "peer-gateway" },
      exit,
      { task: "Configure port-channel 1.", cmd: "interface port-channel1", accept: ["int|erface <if:po1>", "int|erface port-channel 1"], enters: "config-if", hint: "interface port-channel1" },
      { task: "Trunk.", cmd: "switchport mode trunk", accept: ["switchp|ort mode trunk"], hint: "switchport mode trunk" },
      { task: "Make it the peer-link.", cmd: "vpc peer-link", accept: ["vpc peer-l|ink"], hint: "vpc peer-link" },
      exit,
      { task: "Configure port-channel 20.", cmd: "interface port-channel20", accept: ["int|erface <if:po20>", "int|erface port-channel 20"], enters: "config-if", hint: "interface port-channel20" },
      { task: "Trunk.", cmd: "switchport mode trunk", accept: ["switchp|ort mode trunk"], hint: "switchport mode trunk" },
      { task: "vPC number 20.", cmd: "vpc 20", accept: ["vpc 20"], hint: "vpc 20" },
      end,
    ],
    shows: [
      {
        match: "sh|ow vpc (br|ief)",
        output: `vPC domain id                     : 10
Peer status                       : peer adjacency formed ok
vPC keep-alive status             : peer is alive
Configuration consistency status  : success
vPC role                          : primary
vPC Peer-link status
id    Port   Status Active vlans
1     Po1    up     1,10,20
vPC status
Id    Port          Status Consistency Reason
20    Po20          up     success     success`,
      },
    ],
  },
  {
    id: "vxlan-leaf",
    exam: "dccor",
    objective: "1.3",
    title: "VXLAN EVPN L2VNI on a leaf",
    hostname: "LEAF1",
    platform: "nx-os",
    brief: "Extend VLAN 10 as VNI 10010 over the fabric. The VTEP is sourced from loopback1, learns hosts with BGP EVPN, replicates BUM with ingress replication, and suppresses ARP. Use automatic RD and RTs. (BGP and the EVPN features are already enabled.)",
    topology: `  hosts VLAN 10 ── [LEAF1 nve1 lo1 10.0.1.11] ══ VXLAN VNI 10010 ══ other leaves`,
    steps: [
      conft,
      { task: "Enable VLAN-to-VNI mapping.", cmd: "feature vn-segment-vlan-based", accept: ["fea|ture vn-segment-vlan-based"], hint: "feature vn-segment-vlan-based" },
      { task: "Configure VLAN 10.", cmd: "vlan 10", accept: ["vlan 10"], enters: "config-vlan", hint: "vlan 10" },
      { task: "Map it to VNI 10010.", cmd: "vn-segment 10010", accept: ["vn-seg|ment 10010"], hint: "vn-segment 10010" },
      exit,
      { task: "Create the NVE interface.", cmd: "interface nve1", accept: ["int|erface nve1", "int|erface nve 1"], enters: "config-if-nve", hint: "interface nve1" },
      { task: "Bring it up.", cmd: "no shutdown", accept: ["no shut|down"], hint: "no shutdown" },
      { task: "Learn remote hosts from BGP EVPN.", cmd: "host-reachability protocol bgp", accept: ["host-r|eachability prot|ocol bgp"], hint: "host-reachability protocol bgp" },
      { task: "Source the VTEP from loopback1.", cmd: "source-interface loopback1", accept: ["source-i|nterface lo|opback1", "source-i|nterface lo|opback 1"], hint: "source-interface loopback1" },
      { task: "Add VNI 10010.", cmd: "member vni 10010", accept: ["mem|ber vni 10010"], enters: "config-if-nve-vni", hint: "member vni 10010" },
      { task: "Answer ARP locally from EVPN data.", cmd: "suppress-arp", accept: ["suppress-arp"], hint: "suppress-arp" },
      { task: "BUM by ingress replication, flood list from BGP.", cmd: "ingress-replication protocol bgp", accept: ["ingress-r|eplication prot|ocol bgp"], hint: "ingress-replication protocol bgp" },
      exit,
      exit,
      { task: "Enter EVPN configuration.", cmd: "evpn", accept: ["evpn"], enters: "config-evpn", hint: "evpn" },
      { task: "Configure VNI 10010 as layer 2.", cmd: "vni 10010 l2", accept: ["vni 10010 l2"], enters: "config-evpn-evi", hint: "vni 10010 l2" },
      { task: "Automatic route distinguisher.", cmd: "rd auto", accept: ["rd auto"], hint: "rd auto" },
      { task: "Automatic import route target.", cmd: "route-target import auto", accept: ["route-t|arget imp|ort auto"], hint: "route-target import auto" },
      { task: "Automatic export route target.", cmd: "route-target export auto", accept: ["route-t|arget exp|ort auto"], hint: "route-target export auto" },
      end,
    ],
    shows: [
      {
        match: "sh|ow nve peers",
        output: `Interface Peer-IP          State LearnType Uptime   Router-Mac
--------- ---------------  ----- --------- -------- -----------------
nve1      10.0.1.12        Up    CP        00:12:44 n/a
nve1      10.0.1.13        Up    CP        00:12:40 n/a`,
      },
      { match: "sh|ow nve vni", output: `Interface VNI      Multicast-group   State Mode Type [BD/VRF]      Flags\nnve1      10010    UnicastBGP        Up    CP   L2 [10]               SA` },
    ],
  },
  {
    id: "nxos-upgrade",
    exam: "dccor",
    objective: "1.7",
    title: "Plan and run an NX-OS upgrade, then the EPLDs",
    hostname: "LEAF1",
    platform: "nx-os",
    brief: "The new image nxos64-cs.10.4.3.F.bin and EPLD image n9000-epld.10.4.3.F.img are on bootflash. Check the impact, upgrade NX-OS, then check and upgrade the EPLDs on all modules in the maintenance window.",
    topology: `  bootflash: nxos64-cs.10.4.3.F.bin · n9000-epld.10.4.3.F.img`,
    steps: [
      { task: "Confirm there's room on bootflash (and the images are there).", cmd: "dir bootflash:", accept: ["dir bootflash:"], hint: "dir bootflash:", output: "  2147483648    Oct 30 09:12:01 2026  nxos64-cs.10.4.3.F.bin\n   156237824    Oct 30 09:15:44 2026  n9000-epld.10.4.3.F.img\nUsage for bootflash://sup-local\n  9123456000 bytes free" },
      { task: "Check the upgrade's impact without changing anything.", cmd: "show install all impact nxos bootflash:nxos64-cs.10.4.3.F.bin", accept: ["sh|ow inst|all all imp|act nxos bootflash:nxos64-cs.10.4.3.F.bin"], hint: "show install all impact nxos bootflash:nxos64-cs.10.4.3.F.bin", output: "Compatibility check is done:\nModule  bootable          Impact  Install-type  Reason\n------  --------  --------------  ------------  ------\n     1       yes      disruptive         reset  Default upgrade is not hitless" },
      { task: "Run the NX-OS upgrade.", cmd: "install all nxos bootflash:nxos64-cs.10.4.3.F.bin", accept: ["inst|all all nxos bootflash:nxos64-cs.10.4.3.F.bin"], hint: "install all nxos bootflash:nxos64-cs.10.4.3.F.bin", output: "Do you want to continue with the installation (y/n)?  [n] y\nInstall is in progress, please wait.\nFinishing the upgrade, switch will reboot in 10 seconds." },
      { task: "Check what the EPLD upgrade would change.", cmd: "show install all impact epld bootflash:n9000-epld.10.4.3.F.img", accept: ["sh|ow inst|all all imp|act epld bootflash:n9000-epld.10.4.3.F.img"], hint: "show install all impact epld bootflash:n9000-epld.10.4.3.F.img", output: "Module  Type  EPLD             Running-Version  New-Version  Upg-Required\n     1  SUP   MI FPGA          0x15             0x17         Yes" },
      { task: "Upgrade the EPLDs (modules reload).", cmd: "install epld bootflash:n9000-epld.10.4.3.F.img module all", accept: ["inst|all epld bootflash:n9000-epld.10.4.3.F.img mod|ule all"], hint: "install epld bootflash:n9000-epld.10.4.3.F.img module all", output: "Module 1 : MI FPGA [Programming] : 100.00% (     64 of      64 sectors)\nEPLD upgrade is successful. Module 1 will be reloaded." },
    ],
    shows: [
      { match: "sh|ow ver|sion", output: "Cisco Nexus Operating System (NX-OS) Software\n  NXOS: version 10.4(3)\n  NXOS image file is: bootflash:///nxos64-cs.10.4.3.F.bin" },
      { match: "sh|ow inst|all epld stat|us", output: "Module 1 EPLD upgrade: Successful (MI FPGA 0x17)" },
    ],
  },
  {
    id: "checkpoint-rollback",
    exam: "dccor",
    objective: "1.8",
    title: "Checkpoint, change, preview, roll back",
    hostname: "LEAF1",
    platform: "nx-os",
    brief: "Before a risky change, take checkpoint pre-ntp. Make the change (NTP server 10.0.0.1 via the management VRF). It went wrong, so preview the rollback, roll back atomically, and copy the good config off-box.",
    topology: `  [LEAF1] bootflash checkpoints · scp://backup@10.0.0.5 via mgmt0`,
    steps: [
      { task: "Take a checkpoint named pre-ntp.", cmd: "checkpoint pre-ntp", accept: ["checkpoint pre-ntp"], hint: "checkpoint pre-ntp", output: "...........Done" },
      conft,
      { task: "The change: NTP server 10.0.0.1 in the management VRF.", cmd: "ntp server 10.0.0.1 use-vrf management", accept: ["ntp serv|er 10.0.0.1 use-v|rf man|agement"], hint: "ntp server 10.0.0.1 use-vrf management" },
      end,
      { task: "Preview what a rollback would apply (source running-config, destination the checkpoint).", cmd: "show diff rollback-patch running-config checkpoint pre-ntp", accept: ["sh|ow diff rollback-p|atch running-c|onfig checkpoint pre-ntp"], hint: "show diff rollback-patch running-config checkpoint pre-ntp", output: "#Generating Rollback Patch\n!!\nno ntp server 10.0.0.1 use-vrf management" },
      { task: "Roll back to pre-ntp, all or nothing.", cmd: "rollback running-config checkpoint pre-ntp atomic", accept: ["rollback running-c|onfig checkpoint pre-ntp (atomic)"], hint: "rollback running-config checkpoint pre-ntp atomic", output: "Note: Applying config parallelly may fail Rollback verification\nCollecting Running-Config\n#Generating Rollback Patch\nExecuting Rollback Patch\nRollback completed successfully." },
      { task: "Back up the running config off-box through the management VRF.", cmd: "copy running-config scp://backup@10.0.0.5/leaf1.cfg vrf management", accept: ["copy run|ning-config scp://backup@10.0.0.5/leaf1.cfg vrf man|agement"], hint: "copy running-config scp://backup@10.0.0.5/leaf1.cfg vrf management", output: "Copy complete." },
    ],
    shows: [{ match: "sh|ow checkpoint summ|ary", output: "User Checkpoint Summary\n--------------------------------------------------------------------------------\n1) pre-ntp:\nCreated by admin\nCreated at Sat, 10:41:07 01 Nov 2026\nSize is 41,233 bytes\nDescription: None" }],
  },
  {
    id: "nxos-span-netflow",
    exam: "dccor",
    objective: "1.9",
    title: "SPAN to an analyser and NetFlow to a collector",
    hostname: "LEAF1",
    platform: "nx-os",
    brief: "Mirror Ethernet1/1 (both directions) to an analyser on Ethernet1/48 with SPAN session 1. Then export NetFlow v9 for traffic entering Ethernet1/1 to collector 10.0.0.50 (UDP 2055) through the management VRF.",
    topology: `  Eth1/1 ⇄ ─ SPAN 1 ─▶ Eth1/48 analyser      NetFlow ─▶ 10.0.0.50:2055 (mgmt VRF)`,
    steps: [
      conft,
      { task: "Make Ethernet1/48 a monitor (SPAN destination) port.", cmd: "interface Ethernet1/48", accept: ["int|erface <if:eth1/48>"], enters: "config-if", hint: "interface ethernet1/48" },
      { task: "Monitor mode.", cmd: "switchport monitor", accept: ["switchp|ort mon|itor"], hint: "switchport monitor" },
      exit,
      { task: "Create SPAN session 1.", cmd: "monitor session 1", accept: ["mon|itor sess|ion 1"], enters: "config-monitor", hint: "monitor session 1" },
      { task: "Source Ethernet1/1, both directions.", cmd: "source interface Ethernet1/1 both", accept: ["sou|rce int|erface <if:eth1/1> (both)"], hint: "source interface ethernet1/1 both" },
      { task: "Destination Ethernet1/48.", cmd: "destination interface Ethernet1/48", accept: ["dest|ination int|erface <if:eth1/48>"], hint: "destination interface ethernet1/48" },
      { task: "Sessions start shut down: enable it.", cmd: "no shut", accept: ["no shut|down"], hint: "no shut" },
      exit,
      { task: "Enable NetFlow.", cmd: "feature netflow", accept: ["fea|ture netflow"], hint: "feature netflow" },
      { task: "Create flow exporter EXP.", cmd: "flow exporter EXP", accept: ["flow exp|orter EXP"], enters: "config-flow-exporter", hint: "flow exporter EXP" },
      { task: "Collector through the management VRF.", cmd: "destination 10.0.0.50 use-vrf management", accept: ["dest|ination 10.0.0.50 use-v|rf man|agement"], hint: "destination 10.0.0.50 use-vrf management" },
      { task: "UDP 2055.", cmd: "transport udp 2055", accept: ["trans|port udp 2055"], hint: "transport udp 2055" },
      { task: "NetFlow version 9.", cmd: "version 9", accept: ["vers|ion 9"], hint: "version 9" },
      exit,
      { task: "Create flow monitor MON (with the built-in netflow-original record).", cmd: "flow monitor MON", accept: ["flow mon|itor MON"], enters: "config-flow-monitor", hint: "flow monitor MON" },
      { task: "Use the netflow-original record.", cmd: "record netflow-original", accept: ["rec|ord netflow-original"], hint: "record netflow-original" },
      { task: "Use exporter EXP.", cmd: "exporter EXP", accept: ["exp|orter EXP"], hint: "exporter EXP" },
      exit,
      { task: "Go to Ethernet1/1.", cmd: "interface Ethernet1/1", accept: ["int|erface <if:eth1/1>"], enters: "config-if", hint: "interface ethernet1/1" },
      { task: "Monitor traffic arriving on it.", cmd: "ip flow monitor MON input", accept: ["ip flow mon|itor MON in|put"], hint: "ip flow monitor MON input" },
      end,
    ],
    shows: [{ match: "sh|ow mon|itor sess|ion (all|1)", output: "  session 1\n---------------\ntype              : local\nstate             : up\nsource intf       :\n    rx            : Eth1/1\n    tx            : Eth1/1\n    both          : Eth1/1\ndestination ports : Eth1/48" }],
  },
  {
    id: "mds-vsan-zoning",
    exam: "dccor",
    objective: "3.1",
    title: "VSAN, device-aliases and zoning on an MDS",
    hostname: "MDS-A",
    platform: "nx-os",
    brief: "On fabric A, create VSAN 10 (PROD) with fc1/1 (host) and fc1/5 (array). Give the host and array device-aliases, zone them together, add the zone to zoneset FABRIC_A and activate it.",
    topology: `  host HBA 21:00:00:24:ff:4c:aa:01 ── fc1/1 [MDS-A] fc1/5 ── array 50:06:01:60:3b:20:11:22`,
    steps: [
      conft,
      { task: "Enter the VSAN database.", cmd: "vsan database", accept: ["vsan data|base"], enters: "config-vsan-db", hint: "vsan database" },
      { task: "Create VSAN 10 named PROD.", cmd: "vsan 10 name PROD", accept: ["vsan 10 name PROD"], hint: "vsan 10 name PROD" },
      { task: "Assign fc1/1 to VSAN 10.", cmd: "vsan 10 interface fc1/1", accept: ["vsan 10 int|erface fc1/1"], hint: "vsan 10 interface fc1/1" },
      { task: "Assign fc1/5 to VSAN 10.", cmd: "vsan 10 interface fc1/5", accept: ["vsan 10 int|erface fc1/5"], hint: "vsan 10 interface fc1/5" },
      exit,
      { task: "Enter the device-alias database.", cmd: "device-alias database", accept: ["device-a|lias data|base"], enters: "config-device-alias-db", hint: "device-alias database" },
      { task: "Alias HOST1 for the host's pWWN.", cmd: "device-alias name HOST1 pwwn 21:00:00:24:ff:4c:aa:01", accept: ["device-a|lias name HOST1 pwwn 21:00:00:24:ff:4c:aa:01"], hint: "device-alias name HOST1 pwwn 21:00:00:24:ff:4c:aa:01" },
      { task: "Alias ARRAY1 for the array port.", cmd: "device-alias name ARRAY1 pwwn 50:06:01:60:3b:20:11:22", accept: ["device-a|lias name ARRAY1 pwwn 50:06:01:60:3b:20:11:22"], hint: "device-alias name ARRAY1 pwwn 50:06:01:60:3b:20:11:22" },
      exit,
      { task: "Commit and distribute the aliases (CFS).", cmd: "device-alias commit", accept: ["device-a|lias com|mit"], hint: "device-alias commit" },
      { task: "Create zone HOST1_ARRAY1 in VSAN 10.", cmd: "zone name HOST1_ARRAY1 vsan 10", accept: ["zone name HOST1_ARRAY1 vsan 10"], enters: "config-zone", hint: "zone name HOST1_ARRAY1 vsan 10" },
      { task: "Add the host by alias.", cmd: "member device-alias HOST1", accept: ["mem|ber device-a|lias HOST1"], hint: "member device-alias HOST1" },
      { task: "Add the array by alias.", cmd: "member device-alias ARRAY1", accept: ["mem|ber device-a|lias ARRAY1"], hint: "member device-alias ARRAY1" },
      exit,
      { task: "Create zoneset FABRIC_A in VSAN 10.", cmd: "zoneset name FABRIC_A vsan 10", accept: ["zones|et name FABRIC_A vsan 10"], enters: "config-zoneset", hint: "zoneset name FABRIC_A vsan 10" },
      { task: "Add the zone.", cmd: "member HOST1_ARRAY1", accept: ["mem|ber HOST1_ARRAY1"], hint: "member HOST1_ARRAY1" },
      exit,
      { task: "Activate the zoneset.", cmd: "zoneset activate name FABRIC_A vsan 10", accept: ["zones|et act|ivate name FABRIC_A vsan 10"], hint: "zoneset activate name FABRIC_A vsan 10", output: "Zoneset activation initiated. check zone status" },
      end,
    ],
    shows: [{ match: "sh|ow zone act|ive (vsan 10)", output: "zoneset name FABRIC_A vsan 10\n  zone name HOST1_ARRAY1 vsan 10\n  * fcid 0x0a0000 [device-alias HOST1]\n  * fcid 0x0a0100 [device-alias ARRAY1]" }],
  },
  {
    id: "mds-npiv-portchannel",
    exam: "dccor",
    objective: "3.1",
    title: "NPIV core with a trunking F port-channel to an NPV edge",
    hostname: "MDS-CORE",
    platform: "nx-os",
    brief: "MDS-CORE accepts an NPV edge switch (a UCS fabric interconnect) on fc1/1 and fc1/2. Enable NPIV and F port-channel trunking, build port-channel 10 in active mode, and add both ports.",
    topology: `  [UCS FI (NPV)] NP ══ fc1/1, fc1/2 ══ F port-channel 10 [MDS-CORE (NPIV)]`,
    steps: [
      conft,
      { task: "Allow multiple logins per F port.", cmd: "feature npiv", accept: ["fea|ture npiv"], hint: "feature npiv" },
      { task: "Allow trunking F port-channels.", cmd: "feature fport-channel-trunk", accept: ["fea|ture fport-channel-trunk"], hint: "feature fport-channel-trunk" },
      { task: "Create port-channel 10.", cmd: "interface port-channel 10", accept: ["int|erface port-channel 10", "int|erface port-channel10"], enters: "config-if", hint: "interface port-channel 10" },
      { task: "F mode toward the edge.", cmd: "switchport mode F", accept: ["switchp|ort mode F"], hint: "switchport mode F" },
      { task: "Negotiate the bundle.", cmd: "channel mode active", accept: ["chan|nel mode act|ive"], hint: "channel mode active" },
      exit,
      { task: "Configure fc1/1.", cmd: "interface fc1/1", accept: ["int|erface fc1/1"], enters: "config-if", hint: "interface fc1/1" },
      { task: "Join port-channel 10, copying its settings.", cmd: "channel-group 10 force", accept: ["chan|nel-group 10 (force)"], hint: "channel-group 10 force" },
      { task: "Enable the port.", cmd: "no shutdown", accept: ["no shut|down"], hint: "no shutdown" },
      exit,
      { task: "Configure fc1/2.", cmd: "interface fc1/2", accept: ["int|erface fc1/2"], enters: "config-if", hint: "interface fc1/2" },
      { task: "Join port-channel 10.", cmd: "channel-group 10 force", accept: ["chan|nel-group 10 (force)"], hint: "channel-group 10 force" },
      { task: "Enable the port.", cmd: "no shutdown", accept: ["no shut|down"], hint: "no shutdown" },
      end,
    ],
    shows: [{ match: "sh|ow port-channel data|base", output: "port-channel 10\n    Administrative channel mode is active\n    Operational channel mode is active\n    Last membership update succeeded\n    2 ports in total, 2 ports up\n    Ports:   fc1/1    [up] *\n             fc1/2    [up]" }],
  },
  {
    id: "mds-upgrade",
    exam: "dccor",
    objective: "3.3",
    title: "Non-disruptive MDS upgrade, fabric A first",
    hostname: "MDS-A",
    platform: "nx-os",
    brief: "Upgrade fabric A's MDS to 9.4(2a) with the kickstart and system images on bootflash. Check the impact, run the upgrade, and confirm the result. Fabric B waits until hosts show both paths again.",
    topology: `  hosts ── fabric A [MDS-A] (upgrading) ── array
        └── fabric B [MDS-B] (carrying I/O) ──┘`,
    steps: [
      { task: "Check the impact of the upgrade.", cmd: "show install all impact kickstart bootflash:m9100-s6ek9-kickstart-mz.9.4.2a.bin system bootflash:m9100-s6ek9-mz.9.4.2a.bin", accept: ["sh|ow inst|all all imp|act kick|start bootflash:m9100-s6ek9-kickstart-mz.9.4.2a.bin sys|tem bootflash:m9100-s6ek9-mz.9.4.2a.bin"], hint: "show install all impact kickstart bootflash:m9100-s6ek9-kickstart-mz.9.4.2a.bin system bootflash:m9100-s6ek9-mz.9.4.2a.bin", output: "Module  bootable          Impact  Install-type  Reason\n------  --------  --------------  ------------  ------\n     1       yes  non-disruptive         reset" },
      { task: "Run the upgrade.", cmd: "install all kickstart bootflash:m9100-s6ek9-kickstart-mz.9.4.2a.bin system bootflash:m9100-s6ek9-mz.9.4.2a.bin", accept: ["inst|all all kick|start bootflash:m9100-s6ek9-kickstart-mz.9.4.2a.bin sys|tem bootflash:m9100-s6ek9-mz.9.4.2a.bin"], hint: "install all kickstart bootflash:m9100-s6ek9-kickstart-mz.9.4.2a.bin system bootflash:m9100-s6ek9-mz.9.4.2a.bin", output: "Do you want to continue with the installation (y/n)?  [n] y\nInstall is in progress, please wait.\nNotifying services about the upgrade.\nThe switch will reboot in non-disruptive mode (data traffic continues)." },
      { task: "Check the result.", cmd: "show install all status", accept: ["sh|ow inst|all all stat|us"], hint: "show install all status", output: "Install has been successful." },
      { task: "Confirm every host still logged in on fabric A.", cmd: "show flogi database", accept: ["sh|ow flogi data|base"], hint: "show flogi database", output: "INTERFACE  VSAN  FCID      PORT NAME                NODE NAME\nfc1/1      10    0x0a0000  21:00:00:24:ff:4c:aa:01  20:00:00:24:ff:4c:aa:01\nfc1/5      10    0x0a0100  50:06:01:60:3b:20:11:22  50:06:01:60:bb:20:11:22" },
    ],
    shows: [{ match: "sh|ow ver|sion", output: "Cisco Nexus Operating System (NX-OS) Software\n  system:    version 9.4(2a)\n  kickstart: version 9.4(2a)" }],
  },
  {
    id: "mds-span",
    exam: "dccor",
    objective: "3.4",
    title: "Capture FC traffic with SPAN to an analyser",
    hostname: "MDS-A",
    platform: "nx-os",
    brief: "A host on fc1/1 has intermittent I/O aborts. Mirror the frames it receives and sends to an FC analyser on fc1/16 with SPAN session 1.",
    topology: `  host ── fc1/1 [MDS-A] fc1/16 (SD) ── FC analyser`,
    steps: [
      conft,
      { task: "Configure fc1/16.", cmd: "interface fc1/16", accept: ["int|erface fc1/16"], enters: "config-if", hint: "interface fc1/16" },
      { task: "Make it a SPAN destination (SD) port.", cmd: "switchport mode SD", accept: ["switchp|ort mode SD"], hint: "switchport mode SD" },
      { task: "Enable it.", cmd: "no shutdown", accept: ["no shut|down"], hint: "no shutdown" },
      exit,
      { task: "Create SPAN session 1.", cmd: "span session 1", accept: ["span sess|ion 1"], enters: "config-span", hint: "span session 1" },
      { task: "Destination fc1/16.", cmd: "destination interface fc1/16", accept: ["dest|ination int|erface fc1/16"], hint: "destination interface fc1/16" },
      { task: "Source fc1/1, received frames.", cmd: "source interface fc1/1 rx", accept: ["sou|rce int|erface fc1/1 rx"], hint: "source interface fc1/1 rx" },
      { task: "Source fc1/1, transmitted frames.", cmd: "source interface fc1/1 tx", accept: ["sou|rce int|erface fc1/1 tx"], hint: "source interface fc1/1 tx" },
      end,
    ],
    shows: [{ match: "sh|ow span sess|ion (1)", output: "Session 1 (active)\n   Destination is fc1/16\n   Ingress (rx) sources are\n     fc1/1,\n   Egress (tx) sources are\n     fc1/1," }],
  },
  {
    id: "nxos-scheduler-nxapi",
    exam: "dccor",
    objective: "4.1",
    title: "Nightly backup job, NX-API and an EEM guard",
    hostname: "LEAF1",
    platform: "nx-os",
    brief: "Turn on NX-API for the automation team. Schedule a nightly 02:00 job that copies the running config to bootflash. Add an EEM applet that logs an alert whenever someone enters configuration mode, without blocking them.",
    topology: `  automation ── HTTPS/NX-API ──▶ [LEAF1]   scheduler 02:00 → bootflash:nightly.cfg`,
    steps: [
      conft,
      { task: "Enable NX-API.", cmd: "feature nxapi", accept: ["fea|ture nxapi"], hint: "feature nxapi" },
      { task: "Enable the scheduler.", cmd: "feature scheduler", accept: ["fea|ture sched|uler"], hint: "feature scheduler" },
      { task: "Create job BACKUP.", cmd: "scheduler job name BACKUP", accept: ["sched|uler job name BACKUP"], enters: "config-job", hint: "scheduler job name BACKUP" },
      { task: "The job's command.", cmd: "copy running-config bootflash:nightly.cfg", accept: ["copy run|ning-config bootflash:nightly.cfg"], hint: "copy running-config bootflash:nightly.cfg" },
      exit,
      { task: "Create schedule NIGHTLY.", cmd: "scheduler schedule name NIGHTLY", accept: ["sched|uler sched|ule name NIGHTLY"], enters: "config-schedule", hint: "scheduler schedule name NIGHTLY" },
      { task: "Run job BACKUP.", cmd: "job name BACKUP", accept: ["job name BACKUP"], hint: "job name BACKUP" },
      { task: "Every day at 02:00.", cmd: "time daily 02:00", accept: ["time daily 02:00", "time daily 2:00"], hint: "time daily 02:00" },
      exit,
      { task: "Create EEM applet CONF-ALERT.", cmd: "event manager applet CONF-ALERT", accept: ["event man|ager applet CONF-ALERT"], enters: "config-applet", hint: "event manager applet CONF-ALERT" },
      { task: "Trigger on 'conf t'.", cmd: 'event cli match "conf t"', accept: ['event cli match "conf t"', "event cli match conf t"], hint: 'event cli match "conf t"' },
      { task: "Log an alert.", cmd: 'action 1.0 syslog priority alerts msg "configuration mode entered"', accept: ['act|ion 1.0 syslog prio|rity alerts msg "configuration mode entered"', "act|ion 1.0 syslog prio|rity alerts msg configuration mode entered"], hint: 'action 1.0 syslog priority alerts msg "configuration mode entered"' },
      { task: "Let the command run.", cmd: "action 2.0 event-default", accept: ["act|ion 2.0 event-default"], hint: "action 2.0 event-default" },
      end,
    ],
    shows: [{ match: "sh|ow sched|uler sched|ule", output: "Schedule Name       : NIGHTLY\n------------------------------------\nUser Name           : admin\nSchedule Type       : Run every day at 2 Hrs 0 Mins\nJob Name            Last Execution Status\n---------------------------------------------\nBACKUP                       Success (0)" }],
  },
  {
    id: "nxos-rbac-aaa",
    exam: "dccor",
    objective: "5.1",
    title: "Custom role and TACACS+ login on NX-OS",
    hostname: "LEAF1",
    platform: "nx-os",
    brief: "Create role NOC that can read everything but not reload, give local user noc1 that role, and authenticate logins against TACACS+ server 10.0.0.5 (key Tac4cs!) through the management VRF.",
    topology: `  admins ── SSH ──▶ [LEAF1] ── TACACS+ (mgmt VRF) ──▶ 10.0.0.5`,
    steps: [
      conft,
      { task: "Create role NOC.", cmd: "role name NOC", accept: ["role name NOC"], enters: "config-role", hint: "role name NOC" },
      { task: "Rule 10: read access to everything.", cmd: "rule 10 permit read", accept: ["rule 10 per|mit read"], hint: "rule 10 permit read" },
      { task: "Rule 20: deny reload (higher rules are checked first).", cmd: "rule 20 deny command reload", accept: ["rule 20 deny com|mand reload"], hint: "rule 20 deny command reload" },
      exit,
      { task: "Local user noc1 with role NOC.", cmd: "username noc1 password N0cRead! role NOC", accept: ["user|name noc1 pass|word N0cRead! role NOC"], hint: "username noc1 password N0cRead! role NOC" },
      { task: "Enable TACACS+.", cmd: "feature tacacs+", accept: ["fea|ture tacacs+"], hint: "feature tacacs+" },
      { task: "Define the server and key.", cmd: "tacacs-server host 10.0.0.5 key Tac4cs!", accept: ["tacacs-s|erver host 10.0.0.5 key Tac4cs!"], hint: "tacacs-server host 10.0.0.5 key Tac4cs!" },
      { task: "Create server group TAC.", cmd: "aaa group server tacacs+ TAC", accept: ["aaa group server tacacs+ TAC"], enters: "config-tacacs+", hint: "aaa group server tacacs+ TAC" },
      { task: "Add the server.", cmd: "server 10.0.0.5", accept: ["server 10.0.0.5"], hint: "server 10.0.0.5" },
      { task: "Reach it through the management VRF.", cmd: "use-vrf management", accept: ["use-v|rf man|agement"], hint: "use-vrf management" },
      exit,
      { task: "Authenticate logins with group TAC (local if unreachable).", cmd: "aaa authentication login default group TAC", accept: ["aaa authe|ntication login default group TAC"], hint: "aaa authentication login default group TAC" },
      end,
    ],
    shows: [{ match: "sh|ow role name NOC", output: "Role: NOC\n  Description: new role\n  -------------------------------------------------------------------\n  Rule    Perm    Type        Scope               Entity\n  -------------------------------------------------------------------\n  20      deny    command                         reload\n  10      permit  read" }],
  },
  {
    id: "nxos-fhs",
    exam: "dccor",
    objective: "5.1",
    title: "DHCP snooping, ARP inspection and IP Source Guard",
    hostname: "LEAF1",
    platform: "nx-os",
    brief: "Protect VLAN 10's hosts on Ethernet1/1 from rogue DHCP servers and spoofing. The real DHCP relay is reached through uplink Ethernet1/49.",
    topology: `  hosts ── Eth1/1 [LEAF1] Eth1/49 ── uplink to DHCP relay/server (trusted)`,
    steps: [
      conft,
      { task: "Enable the DHCP feature.", cmd: "feature dhcp", accept: ["fea|ture dhcp"], hint: "feature dhcp" },
      { task: "Turn on DHCP snooping globally.", cmd: "ip dhcp snooping", accept: ["ip dhcp snoop|ing"], hint: "ip dhcp snooping" },
      { task: "Snoop VLAN 10.", cmd: "ip dhcp snooping vlan 10", accept: ["ip dhcp snoop|ing vlan 10"], hint: "ip dhcp snooping vlan 10" },
      { task: "Inspect ARP in VLAN 10.", cmd: "ip arp inspection vlan 10", accept: ["ip arp insp|ection vlan 10"], hint: "ip arp inspection vlan 10" },
      { task: "Configure the uplink Ethernet1/49.", cmd: "interface Ethernet1/49", accept: ["int|erface <if:eth1/49>"], enters: "config-if", hint: "interface ethernet1/49" },
      { task: "Trust DHCP server messages here.", cmd: "ip dhcp snooping trust", accept: ["ip dhcp snoop|ing trust"], hint: "ip dhcp snooping trust" },
      { task: "Trust ARP here.", cmd: "ip arp inspection trust", accept: ["ip arp insp|ection trust"], hint: "ip arp inspection trust" },
      exit,
      { task: "Configure the host port Ethernet1/1.", cmd: "interface Ethernet1/1", accept: ["int|erface <if:eth1/1>"], enters: "config-if", hint: "interface ethernet1/1" },
      { task: "IP Source Guard from the snooping bindings.", cmd: "ip verify source dhcp-snooping-vlan", accept: ["ip ver|ify source dhcp-snooping-vlan"], hint: "ip verify source dhcp-snooping-vlan" },
      end,
    ],
    shows: [{ match: "sh|ow ip dhcp snoop|ing bind|ing", output: "MacAddress          IpAddress        LeaseSec  Type         VLAN  Interface\n-----------------   ---------------  --------  -----------  ----  -------------\n00:50:56:a1:22:01   10.1.10.21       86213     dhcp-snoop   10    Ethernet1/1" }],
  },
  {
    id: "nxos-macsec",
    exam: "dccor",
    objective: "5.1",
    title: "MACsec on a leaf–spine link",
    hostname: "LEAF1",
    platform: "nx-os",
    brief: "Encrypt the link Ethernet1/49 to the spine with MACsec: a MACsec keychain KC with key 01 (AES-256 CMAC), a policy MP using GCM-AES-XPN-256, applied to the interface.",
    topology: `  [LEAF1] Eth1/49 ══ 802.1AE (MKA) ══ Eth1/1 [SPINE1]`,
    steps: [
      conft,
      { task: "Enable MACsec.", cmd: "feature macsec", accept: ["fea|ture macsec"], hint: "feature macsec" },
      { task: "Create MACsec keychain KC.", cmd: "key chain KC macsec", accept: ["key chain KC macsec"], enters: "config-macseckeychain", hint: "key chain KC macsec" },
      { task: "Key 01.", cmd: "key 01", accept: ["key 01"], enters: "config-macseckeychain-macseckey", hint: "key 01" },
      { task: "The 64-hex-digit CAK, AES-256-CMAC.", cmd: "key-octet-string 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef cryptographic-algorithm AES_256_CMAC", accept: ["key-oct|et-string 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef cryptographic-a|lgorithm AES_256_CMAC"], hint: "key-octet-string 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef cryptographic-algorithm AES_256_CMAC" },
      exit,
      exit,
      { task: "Create MACsec policy MP.", cmd: "macsec policy MP", accept: ["macsec pol|icy MP"], enters: "config-macsec-policy", hint: "macsec policy MP" },
      { task: "Cipher suite GCM-AES-XPN-256.", cmd: "cipher-suite GCM-AES-XPN-256", accept: ["cipher-s|uite GCM-AES-XPN-256"], hint: "cipher-suite GCM-AES-XPN-256" },
      exit,
      { task: "Configure Ethernet1/49.", cmd: "interface Ethernet1/49", accept: ["int|erface <if:eth1/49>"], enters: "config-if", hint: "interface ethernet1/49" },
      { task: "Apply keychain KC with policy MP.", cmd: "macsec keychain KC policy MP", accept: ["macsec keyc|hain KC pol|icy MP"], hint: "macsec keychain KC policy MP", output: "%MACSEC-5-MKA_SESSION_SECURED: MKA session secured on Ethernet1/49" },
      end,
    ],
    shows: [{ match: "sh|ow macsec mka sess|ion", output: "Interface           Local-TxSCI         # Peers      Status          Key-Server\n------------------  ------------------  -----------  --------------  ----------\nEthernet1/49        5c83.8f12.0a31/0001 1            Secured         Yes" }],
  },
  {
    id: "mds-port-security",
    exam: "dccor",
    objective: "5.3",
    title: "Port security and fabric binding on an MDS",
    hostname: "MDS-A",
    platform: "nx-os",
    brief: "Lock VSAN 10: only the host HBA 21:00:00:24:ff:4c:aa:01 may log in on fc1/1, and only switch 20:00:00:2a:6a:4b:12:01 (domain 2) may join the fabric.",
    topology: `  host ── fc1/1 [MDS-A domain 1] ══ ISL ══ [MDS-A2 sWWN 20:00:00:2a:6a:4b:12:01, domain 2]`,
    steps: [
      conft,
      { task: "Enable port security.", cmd: "feature port-security", accept: ["fea|ture port-sec|urity"], hint: "feature port-security" },
      { task: "Enter the port security database for VSAN 10.", cmd: "port-security database vsan 10", accept: ["port-sec|urity data|base vsan 10"], enters: "config-port-security", hint: "port-security database vsan 10" },
      { task: "Bind the host's pWWN to fc1/1.", cmd: "pwwn 21:00:00:24:ff:4c:aa:01 interface fc1/1", accept: ["pwwn 21:00:00:24:ff:4c:aa:01 int|erface fc1/1"], hint: "pwwn 21:00:00:24:ff:4c:aa:01 interface fc1/1" },
      exit,
      { task: "Activate port security in VSAN 10.", cmd: "port-security activate vsan 10", accept: ["port-sec|urity act|ivate vsan 10"], hint: "port-security activate vsan 10" },
      { task: "Enable fabric binding.", cmd: "feature fabric-binding", accept: ["fea|ture fabric-binding"], hint: "feature fabric-binding" },
      { task: "Enter the fabric binding database for VSAN 10.", cmd: "fabric-binding database vsan 10", accept: ["fabric-b|inding data|base vsan 10"], enters: "config-fabric-binding", hint: "fabric-binding database vsan 10" },
      { task: "Allow the peer switch with domain 2.", cmd: "swwn 20:00:00:2a:6a:4b:12:01 domain 2", accept: ["swwn 20:00:00:2a:6a:4b:12:01 dom|ain 2"], hint: "swwn 20:00:00:2a:6a:4b:12:01 domain 2" },
      exit,
      { task: "Activate fabric binding in VSAN 10.", cmd: "fabric-binding activate vsan 10", accept: ["fabric-b|inding act|ivate vsan 10"], hint: "fabric-binding activate vsan 10" },
      end,
    ],
    shows: [{ match: "sh|ow port-sec|urity data|base (act|ive) (vsan 10)", output: "VSAN    Logging-in Entity                  Logging-in Point    (Interface)\n--------------------------------------------------------------------------\n10      21:00:00:24:ff:4c:aa:01(pwwn)      20:01:00:2a:6a:4b:00:01(fc1/1)" }],
  },
];

export const labById = Object.fromEntries(labs.map((l) => [l.id, l]));
