import type { Question } from "../types";

// ENCOR question bank, part C: 4.0 Network Assurance, 5.0 Security, 6.0 Automation and AI.

export const encorBankC: Question[] = [
  // 4.1 diagnostics
  {
    id: "e-301",
    objective: "4.1",
    kind: "single",
    prompt: "Refer to the exhibit. What does the output tell you?",
    exhibit: `R1# traceroute 192.0.2.10
  1 10.0.12.2 1 msec 1 msec 1 msec
  2 10.0.23.3 2 msec 1 msec 2 msec
  3  *  *  *
  4  *  *  *`,
    choices: ["Packets reach 10.0.23.3; the next hop doesn't answer", "The destination host replied to every single probe", "R1 has no route to the destination address at all", "The initial TTL is set too low to reach the target"],
    answer: 0,
    explain: "Traceroute shows the last router that returned ICMP time-exceeded. Asterisks after it mean no replies: a failure, an ACL dropping probes or ICMP, or an asymmetric return path.",
  },
  {
    id: "e-302",
    objective: "4.1",
    kind: "single",
    prompt: "Which ping option finds the largest packet that can cross a path without fragmentation?",
    choices: ["size with the DF bit set", "repeat with a large count", "source from a loopback", "timeout set to zero"],
    answer: 0,
    explain: "Extended ping with `df-bit` and increasing `size` (or a sweep) finds the path MTU: packets above it fail with 'M' (could not fragment).",
  },
  {
    id: "e-303",
    objective: "4.1",
    kind: "single",
    prompt: "`logging buffered 6` is configured. Which messages go to the local buffer?",
    choices: ["Levels 0 to 6", "Only level 6", "Levels 6 and 7", "All levels 0 to 7"],
    answer: 0,
    explain: "A logging threshold includes that level and every more severe (lower-numbered) one. 6 = informational, so only debugging (7) is excluded.",
  },
  {
    id: "e-304",
    objective: "4.1",
    kind: "single",
    prompt: "An engineer is connected by SSH and enables a debug, but sees no output. What is missing?",
    choices: ["logging console", "terminal monitor", "service timestamps", "debug all"],
    answer: 1,
    explain: "Log and debug messages go to the console by default. `terminal monitor` copies them to the current VTY session.",
  },
  {
    id: "e-305",
    objective: "4.1",
    kind: "multi",
    prompt: "Which TWO are advantages of SNMPv3 over SNMPv2c?",
    choices: ["User-based authentication", "Encryption of the payload", "Faster polling of counters", "No need for an NMS", "Traps that can't be lost"],
    answer: [0, 1],
    explain: "SNMPv3 adds the user-based security model with authentication and privacy (encryption). v2c sends community strings in clear text.",
  },
  {
    id: "e-306",
    objective: "4.1",
    kind: "single",
    prompt: "What does this IOS ping output character mean: `U`?",
    choices: ["Destination unreachable received", "Unknown packet type was received", "Unauthorised by an ACL on the path", "Upstream router timed out the probe"],
    answer: 0,
    explain: "U = an ICMP unreachable came back. ! is a reply, . is a timeout, M is could-not-fragment, and Q is source quench.",
  },
  // 4.2 NetFlow
  {
    id: "e-307",
    objective: "4.2",
    kind: "single",
    prompt: "Refer to the exhibit. Why does the collector receive no flows?",
    exhibit: `flow record REC
 match ipv4 source address
 match ipv4 destination address
 collect counter bytes
flow exporter EXP
 destination 10.0.0.50
flow monitor MON
 record REC
 exporter EXP
interface Gi0/1
 ip address 10.1.1.1 255.255.255.0`,
    choices: ["The monitor isn't applied to an interface", "The record doesn't have any collect fields", "The exporter has no source interface set", "NetFlow export requires version 5 format"],
    answer: 0,
    explain: "Records, exporters and monitors do nothing until `ip flow monitor MON input` (or output) is applied to an interface.",
  },
  {
    id: "e-308",
    objective: "4.2",
    kind: "single",
    prompt: "Which export format is the IETF standard based on NetFlow v9?",
    choices: ["sFlow", "IPFIX", "NetFlow v5", "jFlow"],
    answer: 1,
    explain: "IPFIX (sometimes called NetFlow v10) standardises the template-based v9 format.",
  },
  {
    id: "e-309",
    objective: "4.2",
    kind: "cli",
    prompt: "View the cached flows of monitor MON.",
    context: "R1#",
    accept: ["sh|ow fl|ow mon|itor MON ca|che"],
    canonical: "show flow monitor MON cache",
    explain: "The cache shows the flows before export. Use `show flow exporter statistics` to confirm packets are being sent.",
  },
  // 4.3 SPAN
  {
    id: "e-310",
    objective: "4.3",
    kind: "single",
    prompt: "Refer to the exhibit. What does this configuration do?",
    exhibit: `monitor session 1 source interface Gi1/0/5 rx
monitor session 1 destination interface Gi1/0/48`,
    choices: ["Copies traffic received on Gi1/0/5 to Gi1/0/48", "Copies traffic sent and received on Gi1/0/5 to Gi1/0/48", "Mirrors Gi1/0/48's traffic over to Gi1/0/5", "Creates an RSPAN VLAN for capture on another switch"],
    answer: 0,
    explain: "rx = ingress only (tx = egress, both = both). The destination port sends mirrored copies to the analyser.",
  },
  {
    id: "e-311",
    objective: "4.3",
    kind: "single",
    prompt: "Which protocol carries ERSPAN mirrored traffic?",
    choices: ["VXLAN", "GRE", "IPsec", "802.1Q"],
    answer: 1,
    explain: "ERSPAN puts mirrored frames in GRE (with an ERSPAN header), so they can be routed across Layer 3 to a remote analyser.",
  },
  {
    id: "e-312",
    objective: "4.3",
    kind: "single",
    prompt: "What happens to normal traffic on a port configured as a SPAN destination?",
    choices: ["It stops acting as a normal switchport", "It keeps forwarding traffic as usual", "It becomes a trunk for all VLANs", "It's rate-limited to the SPAN rate"],
    answer: 0,
    explain: "A SPAN destination is dedicated to the analyser and doesn't participate in normal forwarding or STP unless ingress is explicitly enabled.",
  },
  // 4.4 IP SLA
  {
    id: "e-313",
    objective: "4.4",
    kind: "single",
    prompt: "Refer to the exhibit. The IP SLA target stops answering. What happens to the default route?",
    exhibit: `ip sla 1
 icmp-echo 8.8.8.8 source-interface Gi0/0
ip sla schedule 1 life forever start-time now
track 1 ip sla 1 reachability
ip route 0.0.0.0 0.0.0.0 203.0.113.1 track 1
ip route 0.0.0.0 0.0.0.0 198.51.100.1 250`,
    choices: ["The tracked route goes; the floating route is installed", "Both default routes stay installed in the routing table", "The router reloads itself to recover the tracked route", "Traffic is dropped until the IP SLA target answers again"],
    answer: 0,
    explain: "When track 1 goes down, the tracked static route is withdrawn and the floating static (AD 250) takes over. When the probe recovers, the primary returns.",
  },
  {
    id: "e-314",
    objective: "4.4",
    kind: "single",
    prompt: "Which IP SLA operation measures one-way jitter and packet loss for voice-quality monitoring?",
    choices: ["icmp-echo", "udp-jitter", "tcp-connect", "dns"],
    answer: 1,
    explain: "UDP jitter (with a responder on the far end) measures latency, jitter and loss in each direction. Use the voice codec option for MOS-style results.",
  },
  // 4.5 Catalyst Center
  {
    id: "e-315",
    objective: "4.5",
    kind: "single",
    prompt: "In Catalyst Center, which workflow section defines the site hierarchy, IP address pools and network settings such as DNS and NTP?",
    choices: ["Policy", "Design", "Provision", "Assurance"],
    answer: 1,
    explain: "Design holds the hierarchy and shared settings. Policy defines virtual networks and group-based access, Provision pushes it to devices, and Assurance monitors.",
  },
  {
    id: "e-316",
    objective: "4.5",
    kind: "single",
    prompt: "A user reports slow Wi-Fi at 10:05 yesterday. Which Catalyst Center capability lets you see that client's health and connection events at that time?",
    choices: ["Assurance client 360 with time travel", "Template Editor with change history", "Plug and Play device history", "Image repository compliance view"],
    answer: 0,
    explain: "Assurance keeps historical telemetry. Client 360 lets you rewind to a point in time to see onboarding, RF and application data.",
  },
  {
    id: "e-317",
    objective: "4.5",
    kind: "multi",
    prompt: "Which TWO describe the AI-powered capabilities of Catalyst Center Assurance?",
    choices: ["Machine-learned baselines that flag anomalies", "Suggested root causes and remediation", "Automatic replacement of failed hardware", "Writing Python scripts for the admin", "Replacing ISE for authentication"],
    answer: [0, 1],
    explain: "AI Network Analytics learns what is normal for your network, raises deviations, and correlates data to suggest causes and fixes.",
  },
  // 4.6 NETCONF/RESTCONF
  {
    id: "e-318",
    objective: "4.6",
    kind: "single",
    prompt: "Which NETCONF datastore allows staging changes and applying them all at once with a commit?",
    choices: ["running", "startup", "candidate", "operational"],
    answer: 2,
    explain: "Changes to the candidate datastore don't affect the device until `<commit>`. Not all platforms support candidate (IOS XE can, when enabled).",
  },
  {
    id: "e-319",
    objective: "4.6",
    kind: "single",
    prompt: "Refer to the exhibit. What does this RESTCONF request return?",
    exhibit: `GET https://10.0.0.1/restconf/data/ietf-interfaces:interfaces/interface=GigabitEthernet2
Accept: application/yang-data+json`,
    choices: ["ietf-interfaces data for GigabitEthernet2 in JSON", "The running configuration of the whole device in JSON", "A list of every YANG module the device supports", "Interface counters for every port, encoded in XML"],
    answer: 0,
    explain: "The URI points at one list entry (`interface=GigabitEthernet2`) in the ietf-interfaces model. The Accept header asks for JSON.",
  },
  {
    id: "e-320",
    objective: "4.6",
    kind: "single",
    prompt: "Which NETCONF operation retrieves only configuration data (not operational state)?",
    choices: ["<get>", "<get-config>", "<edit-config>", "<lock>"],
    answer: 1,
    explain: "<get-config> returns configuration from a named datastore. <get> returns configuration and operational state.",
  },
  // 5.1.a lines and local auth
  {
    id: "e-321",
    objective: "5.1.a",
    kind: "single",
    prompt: "Refer to the exhibit. SSH logins fail with 'connection refused'. What is missing?",
    exhibit: `hostname R1
username admin privilege 15 secret S3cret!
line vty 0 4
 login local
 transport input ssh`,
    choices: ["A domain name and RSA keys", "An enable secret on the router", "The login local command on the VTYs", "An AAA authentication method list"],
    answer: 0,
    explain: "SSH needs `ip domain name` and `crypto key generate rsa` (2048-bit or more for SSHv2). Without keys the SSH server isn't running.",
  },
  {
    id: "e-322",
    objective: "5.1.a",
    kind: "single",
    prompt: "Why is `enable password` considered insecure compared with `enable secret`?",
    choices: ["It's clear text or reversible type 7", "It's limited to 8 characters in length", "It only works for console line access", "It can't be changed once it has been set"],
    answer: 0,
    explain: "Type 7 is a trivially reversible obfuscation. `enable secret` uses a one-way hash (type 5, 8 or 9).",
  },
  {
    id: "e-323",
    objective: "5.1.a",
    kind: "cli",
    prompt: "Disconnect idle sessions on these lines after 10 minutes.",
    context: "R1(config-line)#",
    accept: ["exec-t|imeout 10 (0)"],
    canonical: "exec-timeout 10 0",
    explain: "exec-timeout takes minutes then seconds. `0 0` disables the timeout, which is a bad idea on VTYs.",
  },
  {
    id: "e-324",
    objective: "5.1.a",
    kind: "single",
    prompt: "How do you restrict which source addresses can SSH to a router's VTY lines?",
    choices: ["ip access-group on every interface", "access-class ACL in under line vty", "ip ssh source-interface", "transport input ssh"],
    answer: 1,
    explain: "`access-class` applies a standard ACL to VTY sessions, regardless of which interface they arrive on.",
  },
  {
    id: "e-325",
    objective: "5.1.a",
    kind: "single",
    prompt: "A user logs in with privilege level 1. Which prompt do they see?",
    choices: ["R1#", "R1>", "R1(config)#", "R1$"],
    answer: 1,
    explain: "Level 1 is user EXEC (>). Level 15 is privileged EXEC (#). Custom levels 2 to 14 also show #.",
  },
  // 5.1.b AAA
  {
    id: "e-326",
    objective: "5.1.b",
    kind: "single",
    prompt: "Refer to the exhibit. Both TACACS+ servers are unreachable. How can an admin log in?",
    exhibit: `aaa new-model
aaa authentication login default group TAC local
username backup privilege 15 secret B4ckup!`,
    choices: ["With the local username, after the servers error", "With the enable secret only, at the user prompt", "From the console with no password required", "They can't log in until a server is reachable"],
    answer: 0,
    explain: "When the servers don't respond (an ERROR), AAA moves to the next method, `local`. A FAIL (wrong password) would not fall through.",
  },
  {
    id: "e-327",
    objective: "5.1.b",
    kind: "single",
    prompt: "Which AAA function logs which commands an admin ran and when?",
    choices: ["Authentication", "Authorization", "Accounting", "Auditing (not part of AAA)"],
    answer: 2,
    explain: "`aaa accounting commands 15 default start-stop group TAC` sends command records to the server.",
  },
  {
    id: "e-328",
    objective: "5.1.b",
    kind: "single",
    prompt: "Why is TACACS+ usually preferred over RADIUS for device administration?",
    choices: ["Separate authorisation per command, and a fully encrypted body", "It uses UDP transport, which is faster for authentication", "It's an open IETF standard that every vendor implements", "It's required for 802.1X port authentication on switches"],
    answer: 0,
    explain: "Per-command authorization and full payload encryption make TACACS+ fit admin access. RADIUS is the standard for network access (802.1X, VPN).",
  },
  {
    id: "e-329",
    objective: "5.1.b",
    kind: "multi",
    prompt: "Which TWO ports does RADIUS use (current IANA assignments)?",
    choices: ["UDP 1812 for authentication", "UDP 1813 for accounting", "TCP 49 for authentication", "UDP 49 for accounting", "TCP 1812 for authentication"],
    answer: [0, 1],
    explain: "RADIUS uses UDP 1812 for authentication and authorization, and 1813 for accounting. Older 1645/1646 still appear. TACACS+ is TCP 49.",
  },
  {
    id: "e-330",
    objective: "5.1.b",
    kind: "single",
    prompt: "An admin enables `aaa new-model` on a router reached only by SSH, with no method lists and no local users. What is the risk?",
    choices: ["VTY lines switch to local AAA login with no users: lockout", "None: existing SSH sessions keep working until they time out", "The router deletes its RSA keys, so SSH stops working", "The router reloads to apply the new AAA configuration"],
    answer: 0,
    explain: "After `aaa new-model`, line authentication uses the default list (local by default). Create a local user and keep a session open before enabling it.",
  },
  // 5.2.a ACLs
  {
    id: "e-331",
    objective: "5.2.a",
    kind: "single",
    prompt: "Refer to the exhibit. Which traffic from 10.1.1.50 to 10.2.2.10 on TCP 22 is permitted?",
    exhibit: `ip access-list extended IN
 10 deny   tcp 10.1.1.0 0.0.0.255 any eq 22
 20 permit tcp host 10.1.1.50 host 10.2.2.10 eq 22
 30 permit ip any any`,
    choices: ["Denied by line 10, which matches first", "Permitted by line 20, which is more specific", "Permitted by line 30, the last explicit entry", "Denied by the implicit deny at the end"],
    answer: 0,
    explain: "ACLs stop at the first match. 10.1.1.50 is inside 10.1.1.0/24, so line 10 denies it before line 20 is reached. Move the specific permit above the deny.",
  },
  {
    id: "e-332",
    objective: "5.2.a",
    kind: "single",
    prompt: "Which wildcard mask matches all hosts 172.16.0.0 to 172.16.15.255?",
    choices: ["0.0.15.255", "0.0.16.255", "255.255.240.0", "0.0.0.15"],
    answer: 0,
    explain: "That's a /20. The wildcard is the inverse of 255.255.240.0, which is 0.0.15.255.",
  },
  {
    id: "e-333",
    objective: "5.2.a",
    kind: "cli",
    prompt: "In named ACL mode, insert a permit for host 10.1.1.50 to any destination at sequence 5.",
    context: "R1(config-ext-nacl)#",
    accept: ["5 per|mit ip host 10.1.1.50 any"],
    canonical: "5 permit ip host 10.1.1.50 any",
    explain: "Sequence numbers let you insert entries without retyping the ACL. `ip access-list resequence` renumbers them.",
  },
  {
    id: "e-334",
    objective: "5.2.a",
    kind: "single",
    prompt: "An inbound ACL on a WAN interface ends with `deny ip any any` and has no other entries for routing protocols. What breaks?",
    choices: ["Routing protocol packets are dropped, so adjacencies fail", "Nothing, because routing protocols bypass interface ACLs", "Only management traffic to the router is affected", "Only traffic leaving the interface is affected"],
    answer: 0,
    explain: "Inbound ACLs filter control-plane traffic arriving on the interface too, such as OSPF (protocol 89) and BGP (TCP 179). Permit them explicitly.",
  },
  {
    id: "e-335",
    objective: "5.2.a",
    kind: "single",
    prompt: "Where do you apply an ACL that should limit traffic routed out of interface Gi0/1?",
    choices: ["ip access-group ACL out on Gi0/1", "ip access-group ACL in on Gi0/1", "access-class ACL out on the VTY", "A distribute-list under the routing process"],
    answer: 0,
    explain: "`out` filters packets leaving the interface. Router-generated traffic isn't filtered by outbound ACLs.",
  },
  // 5.2.b CoPP
  {
    id: "e-336",
    objective: "5.2.b",
    kind: "single",
    prompt: "A flood of ICMP to a router's own interface addresses drives the CPU to 100%. Which feature limits this without affecting transit traffic?",
    choices: ["Control Plane Policing", "An outbound interface ACL", "Unicast RPF", "Storm control"],
    answer: 0,
    explain: "CoPP polices traffic punted to the route processor. Transit traffic is forwarded in hardware and isn't affected.",
  },
  {
    id: "e-337",
    objective: "5.2.b",
    kind: "single",
    prompt: "Refer to the exhibit. What happens to SSH traffic to the router above 128 kb/s?",
    exhibit: `class-map match-all MGMT
 match access-group name SSH
policy-map COPP
 class MGMT
  police 128000 conform-action transmit exceed-action drop
control-plane
 service-policy input COPP`,
    choices: ["It's dropped before reaching the CPU", "It's queued until the rate drops again", "It's remarked to a lower-priority class", "It bypasses CoPP because it's management"],
    answer: 0,
    explain: "Traffic above the policed rate in that class is dropped, which protects the control plane even from legitimate floods.",
  },
  {
    id: "e-338",
    objective: "5.2.b",
    kind: "multi",
    prompt: "Which TWO are good practices when designing CoPP?",
    choices: ["A generous class for routing protocols", "Tighter policing for management and ICMP", "One class for everything, set to drop", "The policy applied outbound on interfaces", "Routing protocols blocked from the CPU"],
    answer: [0, 1],
    explain: "Separate classes protect critical control traffic (routing, management) while limiting less important or abusive traffic.",
  },
  // 5.3 REST security
  {
    id: "e-339",
    objective: "5.3",
    kind: "single",
    prompt: "Which practice limits damage if an API token is stolen?",
    choices: ["Short-lived tokens with least-privilege scopes", "Long-lived tokens that are rotated once a year", "Tokens passed as URL query parameters", "One shared token for every automation script"],
    answer: 0,
    explain: "Short expiry and narrow scopes limit the time and the actions available to an attacker. Tokens in URLs leak through logs and proxies.",
  },
  {
    id: "e-340",
    objective: "5.3",
    kind: "single",
    prompt: "A script stores the Catalyst Center password in its Git repository. What is the better approach?",
    choices: ["Read it from an environment variable or vault", "Base64-encode it in the script before committing", "Keep it in a separate file in the same repository", "Store it in a private branch of the repository"],
    answer: 0,
    explain: "Secrets must never be committed. Load them at runtime from a vault or environment, and rotate anything that leaked.",
  },
  {
    id: "e-341",
    objective: "5.3",
    kind: "single",
    prompt: "What does `verify=False` in a Python `requests` call do, and why is it risky?",
    choices: ["Skips TLS certificate checks, allowing MITM attacks", "Disables JSON parsing of the API's response bodies", "Disables the authentication headers on the request", "Turns off automatic retries when the connection fails"],
    answer: 0,
    explain: "Without certificate validation the client trusts any server. Use proper certificates (or a pinned CA bundle) in production.",
  },
  // 5.4 security design
  {
    id: "e-342",
    objective: "5.4",
    kind: "single",
    prompt: "A printer can't run an 802.1X supplicant. Which method lets the switch admit it based on identity?",
    choices: ["MAB", "WebAuth", "EAP-TLS", "PEAP"],
    answer: 0,
    explain: "MAB sends the device's MAC address to RADIUS (ISE) as the identity. It is weaker than 802.1X, so pair it with profiling and limited access.",
  },
  {
    id: "e-343",
    objective: "5.4",
    kind: "single",
    prompt: "In 802.1X, which role does the switch play?",
    choices: ["Supplicant", "Authenticator", "Authentication server", "Certificate authority"],
    answer: 1,
    explain: "The client is the supplicant, the switch (or WLC) is the authenticator relaying EAP, and RADIUS/ISE is the authentication server.",
  },
  {
    id: "e-344",
    objective: "5.4",
    kind: "single",
    prompt: "Which feature would let an NGFW block a specific application (for example, BitTorrent) regardless of the port it uses?",
    choices: ["Application visibility and control", "Stateful port and protocol filtering", "NAT with port address translation", "Unicast reverse path forwarding"],
    answer: 0,
    explain: "NGFWs identify applications by behaviour and signatures (AVC/OpenAppID), not just port numbers.",
  },
  {
    id: "e-345",
    objective: "5.4",
    kind: "single",
    prompt: "What is the purpose of Cisco ISE posture assessment?",
    choices: ["Checking endpoint compliance before full access", "Assigning addresses to endpoints after login", "Encrypting traffic between endpoint and switch", "Profiling endpoints from their NetFlow data"],
    answer: 0,
    explain: "Posture checks device health and moves non-compliant endpoints to remediation instead of the production network.",
  },
  {
    id: "e-346",
    objective: "5.4",
    kind: "single",
    prompt: "How does TrustSec enforce policy as traffic crosses the network?",
    choices: ["Packets carry the SGT; egress devices apply SGACLs by group", "IP-based ACLs are pushed to every router along the path", "VLAN pruning keeps the groups apart on every trunk link", "Each group is placed in its own VRF from end to end"],
    answer: 0,
    explain: "The SGT travels with the traffic. Enforcement points use a source-group × destination-group matrix, independent of IP addressing.",
  },
  {
    id: "e-347",
    objective: "5.4",
    kind: "single",
    prompt: "Which key agreement protocol does MACsec use between devices?",
    choices: ["MKA", "IKEv2", "SXP", "EAP-TLS"],
    answer: 0,
    explain: "MKA (802.1X-2010) negotiates and rotates MACsec keys between peers, either switch-to-switch or switch-to-host.",
  },
  {
    id: "e-348",
    objective: "5.4",
    kind: "single",
    prompt: "Which Cisco product provides DNS-layer security, blocking requests to malicious domains before a connection is made?",
    choices: ["Secure Endpoint", "Umbrella", "Duo", "Secure Network Analytics"],
    answer: 1,
    explain: "Umbrella resolves DNS and blocks known-bad domains at the lookup stage, both on and off network.",
  },
  {
    id: "e-349",
    objective: "5.4",
    kind: "single",
    prompt: "Which product focuses on multi-factor authentication and device trust for application access?",
    choices: ["Duo", "ISE", "Umbrella", "Stealthwatch"],
    answer: 0,
    explain: "Duo provides MFA and device health checks for applications and VPN (part of zero-trust access).",
  },
  // 6.1 Python
  {
    id: "e-350",
    objective: "6.1",
    kind: "single",
    prompt: "Refer to the exhibit. What does the script print?",
    exhibit: `devices = [
    {"name": "R1", "up": True},
    {"name": "R2", "up": False},
    {"name": "R3", "up": True},
]
print([d["name"] for d in devices if d["up"]])`,
    choices: ["['R1', 'R2', 'R3']", "['R1', 'R3']", "['R2']", "2"],
    answer: 1,
    explain: "The list comprehension keeps the names of devices whose 'up' value is True.",
  },
  {
    id: "e-351",
    objective: "6.1",
    kind: "single",
    prompt: "Refer to the exhibit. What is printed?",
    exhibit: `import json
data = json.loads('{"interfaces": [{"name": "Gi1", "mtu": 1500}, {"name": "Gi2", "mtu": 9000}]}')
print(data["interfaces"][1]["mtu"])`,
    choices: ["1500", "9000", "Gi2", "KeyError"],
    answer: 1,
    explain: "json.loads makes a dict. interfaces is a list, index 1 is the second entry, and its mtu is 9000.",
  },
  {
    id: "e-352",
    objective: "6.1",
    kind: "single",
    prompt: "Which Python library is designed for SSH-based CLI automation on network devices?",
    choices: ["requests", "netmiko", "ncclient", "flask"],
    answer: 1,
    explain: "Netmiko wraps Paramiko for CLI-over-SSH. ncclient is for NETCONF, and requests is for REST/HTTP.",
  },
  {
    id: "e-353",
    objective: "6.1",
    kind: "single",
    prompt: "Refer to the exhibit. What happens when the API returns 401?",
    exhibit: `r = requests.get(url, headers=h)
r.raise_for_status()
print("ok")`,
    choices: ["An HTTPError is raised, so 'ok' isn't printed", "It prints 'ok' because the call returned", "The call returns None without raising", "The library retries the request automatically"],
    answer: 0,
    explain: "raise_for_status() raises an exception for 4xx and 5xx responses. Wrap it in try/except to handle errors.",
  },
  {
    id: "e-354",
    objective: "6.1",
    kind: "single",
    prompt: "What type does `(\"R1\", \"10.0.0.1\")` create in Python?",
    choices: ["tuple", "list", "dict", "set"],
    answer: 0,
    explain: "Parentheses with commas make a tuple, which is immutable. Square brackets make a list, and braces make a dict or set.",
  },
  // 6.2 JSON
  {
    id: "e-355",
    objective: "6.2",
    kind: "single",
    prompt: "Refer to the exhibit. Why is this JSON invalid?",
    exhibit: `{
  "hostname": "R1",
  "interfaces": ["Gi1", "Gi2",],
  "enabled": true
}`,
    choices: ["A trailing comma after the last array element", "Booleans must be quoted as strings in JSON", "Keys must be written without double quotes", "Arrays can't contain nested objects in JSON"],
    answer: 0,
    explain: "JSON doesn't allow trailing commas. Remove the comma after \"Gi2\".",
  },
  {
    id: "e-356",
    objective: "6.2",
    kind: "single",
    prompt: "Which JSON value represents an empty or absent value?",
    choices: ["None", "null", "undefined", "nil"],
    answer: 1,
    explain: "JSON uses lowercase null. Python's json module converts it to None.",
  },
  {
    id: "e-357",
    objective: "6.2",
    kind: "multi",
    prompt: "Which TWO are valid JSON data types?",
    choices: ["Object", "Array", "Date", "Tuple", "Comment"],
    answer: [0, 1],
    explain: "JSON has object, array, string, number, boolean and null. Dates are just strings, and there are no tuples or comments.",
  },
  // 6.3 YANG
  {
    id: "e-358",
    objective: "6.3",
    kind: "single",
    prompt: "Refer to the exhibit. Which YANG statement defines `interface` here?",
    exhibit: `container interfaces {
  list interface {
    key "name";
    leaf name { type string; }
    leaf mtu { type uint16; }
  }
}`,
    choices: ["A list keyed by name", "A container of leaves", "A leaf-list of names", "A grouping of nodes"],
    answer: 0,
    explain: "`list interface` with `key \"name\"` defines repeatable entries, each identified by its name. Each entry holds leaves.",
  },
  {
    id: "e-359",
    objective: "6.3",
    kind: "single",
    prompt: "Which tool displays a YANG module as a readable tree?",
    choices: ["pyang -f tree", "pyang -f yin", "ncclient", "yanglint --validate"],
    answer: 0,
    explain: "pyang validates and renders YANG modules. Cisco YANG Suite also explores models interactively.",
  },
  {
    id: "e-360",
    objective: "6.3",
    kind: "single",
    prompt: "What is the main advantage of model-driven programmability over screen-scraping CLI output?",
    choices: ["Structured, schema-validated data that doesn't break on format changes", "Commands are shorter and quicker to type than their CLI equivalents", "No authentication is needed to read data from the device's models", "It uses SNMP underneath, which every network device already supports"],
    answer: 0,
    explain: "Models define structure and types. Parsing human-oriented CLI output is fragile across versions.",
  },
  // 6.4 APIs
  {
    id: "e-361",
    objective: "6.4",
    kind: "single",
    prompt: "Which Catalyst Center API call returns the token used for all later requests?",
    choices: ["POST /dna/system/api/v1/auth/token", "GET /dna/intent/api/v1/network-device", "POST /j_security_check", "GET /dataservice/client/token"],
    answer: 0,
    explain: "POST to the auth endpoint with Basic credentials. The JSON response contains the token, which goes in X-Auth-Token on later calls.",
  },
  {
    id: "e-362",
    objective: "6.4",
    kind: "single",
    prompt: "Which SD-WAN Manager API path returns the list of devices in the fabric?",
    choices: ["/dna/intent/api/v1/network-device", "/dataservice/device", "/restconf/data/devices", "/api/v1/inventory"],
    answer: 1,
    explain: "SD-WAN Manager REST endpoints live under /dataservice. /dna/intent is Catalyst Center.",
  },
  {
    id: "e-363",
    objective: "6.4",
    kind: "single",
    prompt: "What does a Catalyst Center 'Intent API' let you express?",
    choices: ["Desired outcomes that it turns into device configuration", "Raw CLI commands that are sent to devices exactly as typed", "SNMP traps to forward on to an external trap receiver", "NETCONF RPCs to run directly on each managed device"],
    answer: 0,
    explain: "Intent APIs are business-level, northbound REST calls. Catalyst Center works out the device-level changes and pushes them southbound.",
  },
  // 6.5 REST codes
  {
    id: "e-364",
    objective: "6.5",
    kind: "single",
    prompt: "A POST that creates a new resource succeeds. Which status code is most appropriate?",
    choices: ["200", "201", "204", "302"],
    answer: 1,
    explain: "201 Created, often with a Location header that points to the new resource.",
  },
  {
    id: "e-365",
    objective: "6.5",
    kind: "single",
    prompt: "A script sends malformed JSON in a POST body. Which status code should it expect?",
    choices: ["400", "401", "404", "500"],
    answer: 0,
    explain: "400 Bad Request means the server couldn't parse or validate the request. 500 would be a server-side failure.",
  },
  {
    id: "e-366",
    objective: "6.5",
    kind: "single",
    prompt: "A script receives 429 from an API. What should it do?",
    choices: ["Back off and retry, honouring Retry-After", "Re-authenticate and request a new token", "Retry immediately in a tight loop until it works", "Switch to a different API endpoint path"],
    answer: 0,
    explain: "429 Too Many Requests is rate limiting. Slow down, using the Retry-After header if present.",
  },
  {
    id: "e-367",
    objective: "6.5",
    kind: "single",
    prompt: "Refer to the exhibit. What does the response mean?",
    exhibit: `HTTP/1.1 202 Accepted
{"response": {"taskId": "4b1f...", "url": "/api/v1/task/4b1f..."}, "version": "1.0"}`,
    choices: ["Queued; check the task URL for the result", "The change failed and was rolled back", "Authentication is required before the change", "The resource was deleted successfully"],
    answer: 0,
    explain: "Catalyst Center runs many operations asynchronously. Poll the task until it reports success or failure.",
  },
  // 6.6 EEM
  {
    id: "e-368",
    objective: "6.6",
    kind: "single",
    prompt: "Refer to the exhibit. When does this applet run?",
    exhibit: `event manager applet SAVE-CONFIG
 event timer cron cron-entry "0 23 * * *"
 action 1.0 cli command "enable"
 action 2.0 cli command "write memory"`,
    choices: ["Every 23 minutes", "Every day at 23:00", "At 00:23", "On every config change"],
    answer: 1,
    explain: "Cron fields are minute hour day month weekday: '0 23 * * *' is 23:00 daily.",
  },
  {
    id: "e-369",
    objective: "6.6",
    kind: "single",
    prompt: "Which EEM event detector fires when a tracked object changes state?",
    choices: ["event track 1 state down", "event syslog pattern TRACK", "event cli pattern track", "event timer watchdog"],
    answer: 0,
    explain: "`event track N state up|down|any` ties EEM to object tracking, for example an IP SLA or interface state.",
  },
  {
    id: "e-370",
    objective: "6.6",
    kind: "single",
    prompt: "How do you run an EEM applet configured with `event none`?",
    choices: ["Manually with `event manager run APPLET`", "Automatically, once, every time the router boots", "Never, because the applet has no trigger at all", "On every syslog message the router generates"],
    answer: 0,
    explain: "`event none` means the applet only runs when invoked manually, which is useful for on-demand scripts.",
  },
  // 6.7 agent/agentless
  {
    id: "e-371",
    objective: "6.7",
    kind: "single",
    prompt: "Refer to the exhibit. Which tool uses this file format?",
    exhibit: `- name: Configure NTP
  hosts: routers
  gather_facts: no
  tasks:
    - name: Set NTP server
      cisco.ios.ios_ntp_global:
        config:
          servers:
            - server: 10.0.0.10`,
    choices: ["Puppet", "Chef", "Ansible", "SaltStack"],
    answer: 2,
    explain: "A YAML playbook with hosts, tasks and modules is Ansible. Puppet uses a declarative DSL, and Chef uses Ruby.",
  },
  {
    id: "e-372",
    objective: "6.7",
    kind: "single",
    prompt: "Why is an agentless tool often easier to use with network devices?",
    choices: ["Devices can't run agents; it uses SSH, NETCONF or APIs", "It's always faster than tools that use an agent", "It doesn't need any credentials for the devices", "It doesn't need an inventory of the target devices"],
    answer: 0,
    explain: "Most routers and switches can't host Puppet or Chef agents, so push-based tools over existing protocols fit better.",
  },
  {
    id: "e-373",
    objective: "6.7",
    kind: "single",
    prompt: "In Puppet, what does a node's agent do periodically?",
    choices: ["Pulls its catalog and enforces the desired state", "Waits for the server to push changes over SSH", "Sends its collected facts to the server by syslog", "Runs any Ansible playbooks that it downloads"],
    answer: 0,
    explain: "Puppet is pull-based: agents check in (every 30 minutes by default), fetch a compiled catalog, and correct any drift.",
  },
  {
    id: "e-374",
    objective: "6.7",
    kind: "single",
    prompt: "Which Ansible file lists the devices and groups a playbook can target?",
    choices: ["Inventory", "Playbook", "Role", "Module"],
    answer: 0,
    explain: "The inventory (INI or YAML, static or dynamic) defines hosts, groups and their variables.",
  },
];
