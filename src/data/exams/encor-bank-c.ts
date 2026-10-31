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
    choices: ["The destination replied", "Packets get as far as 10.0.23.3; the next hop doesn't answer (it may be down, filtering, or the return path may be broken)", "R1 has no route", "The TTL is too low"],
    answer: 1,
    explain: "Traceroute shows the last router that returned ICMP time-exceeded. Asterisks after it mean no replies: a failure, an ACL dropping probes or ICMP, or an asymmetric return path.",
  },
  {
    id: "e-302",
    objective: "4.1",
    kind: "single",
    prompt: "Which ping option finds the largest packet that can cross a path without fragmentation?",
    choices: ["repeat", "source", "size with the DF bit set", "timeout"],
    answer: 2,
    explain: "Extended ping with `df-bit` and increasing `size` (or a sweep) finds the path MTU: packets above it fail with 'M' (could not fragment).",
  },
  {
    id: "e-303",
    objective: "4.1",
    kind: "single",
    prompt: "`logging buffered 6` is configured. Which messages go to the local buffer?",
    choices: ["Only level 6", "Levels 0 to 6 (everything except debugging)", "Levels 6 and 7", "All levels"],
    answer: 1,
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
    choices: ["User-based authentication", "Encryption of the payload (authPriv)", "Faster polling", "No need for an NMS", "Traps can't be lost"],
    answer: [0, 1],
    explain: "SNMPv3 adds the user-based security model with authentication and privacy (encryption). v2c sends community strings in clear text.",
  },
  {
    id: "e-306",
    objective: "4.1",
    kind: "single",
    prompt: "What does this IOS ping output character mean: `U`?",
    choices: ["Unknown packet type", "Destination unreachable received", "Unauthorised", "Upstream timeout"],
    answer: 1,
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
    choices: ["The record has no collect fields", "The monitor is never applied to an interface", "The exporter needs a source", "NetFlow requires v5"],
    answer: 1,
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
    choices: ["Copies traffic sent and received on Gi1/0/5 to Gi1/0/48", "Copies only traffic received on Gi1/0/5 to an analyser on Gi1/0/48", "Mirrors Gi1/0/48 to Gi1/0/5", "Creates an RSPAN VLAN"],
    answer: 1,
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
    choices: ["It continues as usual", "The port stops acting as a normal switchport; by default it only sends mirrored traffic", "It becomes a trunk", "It is rate-limited"],
    answer: 1,
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
    choices: ["Both routes stay installed", "The tracked route is removed and the floating route via 198.51.100.1 is installed", "The router reloads", "Traffic is dropped"],
    answer: 1,
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
    choices: ["Template Editor", "Assurance client 360 with time travel", "Plug and Play", "Image repository"],
    answer: 1,
    explain: "Assurance keeps historical telemetry. Client 360 lets you rewind to a point in time to see onboarding, RF and application data.",
  },
  {
    id: "e-317",
    objective: "4.5",
    kind: "multi",
    prompt: "Which TWO describe the AI-powered capabilities of Catalyst Center Assurance?",
    choices: ["Machine-learned dynamic baselines that flag anomalies", "Suggested root causes and remediation for issues", "Automatic replacement of failed hardware", "Writing Python scripts for the admin", "Replacing ISE for authentication"],
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
    choices: ["The running config of the whole device", "The ietf-interfaces data for GigabitEthernet2, in JSON", "A list of YANG modules", "Interface counters in XML"],
    answer: 1,
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
    choices: ["A domain name and RSA keys", "An enable secret", "The `login` command", "AAA"],
    answer: 0,
    explain: "SSH needs `ip domain name` and `crypto key generate rsa` (2048-bit or more for SSHv2). Without keys the SSH server isn't running.",
  },
  {
    id: "e-322",
    objective: "5.1.a",
    kind: "single",
    prompt: "Why is `enable password` considered insecure compared with `enable secret`?",
    choices: ["It is limited to 8 characters", "It is stored in clear text, or as reversible type 7 with service password-encryption", "It only works on the console", "It can't be changed"],
    answer: 1,
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
    choices: ["They can't", "With the local username backup, because the server group returned an error", "With the enable secret only", "Only from the console with no password"],
    answer: 1,
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
    choices: ["It uses UDP", "It separates authorization from authentication, allowing per-command authorization, and encrypts the whole body", "It's an open standard", "It's required for 802.1X"],
    answer: 1,
    explain: "Per-command authorization and full payload encryption make TACACS+ fit admin access. RADIUS is the standard for network access (802.1X, VPN).",
  },
  {
    id: "e-329",
    objective: "5.1.b",
    kind: "multi",
    prompt: "Which TWO ports does RADIUS use (current IANA assignments)?",
    choices: ["UDP 1812 authentication", "UDP 1813 accounting", "TCP 49", "UDP 49", "TCP 1812"],
    answer: [0, 1],
    explain: "RADIUS uses UDP 1812 for authentication and authorization, and 1813 for accounting. Older 1645/1646 still appear. TACACS+ is TCP 49.",
  },
  {
    id: "e-330",
    objective: "5.1.b",
    kind: "single",
    prompt: "An admin enables `aaa new-model` on a router reached only by SSH, with no method lists and no local users. What is the risk?",
    choices: ["None", "VTY lines switch to default AAA login (local), and with no local users the admin can be locked out", "SSH keys are deleted", "The router reloads"],
    answer: 1,
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
    choices: ["Permitted by line 20", "Denied by line 10, because it matches first", "Permitted by line 30", "Denied by the implicit deny"],
    answer: 1,
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
    choices: ["Nothing: routing protocols bypass ACLs", "Routing protocol packets from the neighbour are dropped, so adjacencies go down", "Only management traffic", "Only outbound traffic"],
    answer: 1,
    explain: "Inbound ACLs filter control-plane traffic arriving on the interface too, such as OSPF (protocol 89) and BGP (TCP 179). Permit them explicitly.",
  },
  {
    id: "e-335",
    objective: "5.2.a",
    kind: "single",
    prompt: "Where do you apply an ACL that should limit traffic routed out of interface Gi0/1?",
    choices: ["ip access-group ACL in on Gi0/1", "ip access-group ACL out on Gi0/1", "access-class ACL out", "Under the routing process"],
    answer: 1,
    explain: "`out` filters packets leaving the interface. Router-generated traffic isn't filtered by outbound ACLs.",
  },
  // 5.2.b CoPP
  {
    id: "e-336",
    objective: "5.2.b",
    kind: "single",
    prompt: "A flood of ICMP to a router's own interface addresses drives the CPU to 100%. Which feature limits this without affecting transit traffic?",
    choices: ["An outbound ACL", "Control Plane Policing", "uRPF", "Storm control"],
    answer: 1,
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
    choices: ["It is queued", "It is dropped before reaching the CPU", "It is remarked", "It bypasses CoPP"],
    answer: 1,
    explain: "Traffic above the policed rate in that class is dropped, which protects the control plane even from legitimate floods.",
  },
  {
    id: "e-338",
    objective: "5.2.b",
    kind: "multi",
    prompt: "Which TWO are good practices when designing CoPP?",
    choices: ["Classify routing protocols into a generous class", "Police management traffic and ICMP with tighter limits", "Put everything in one class that is dropped", "Apply the policy outbound on every interface", "Never permit routing protocols to the CPU"],
    answer: [0, 1],
    explain: "Separate classes protect critical control traffic (routing, management) while limiting less important or abusive traffic.",
  },
  // 5.3 REST security
  {
    id: "e-339",
    objective: "5.3",
    kind: "single",
    prompt: "Which practice limits damage if an API token is stolen?",
    choices: ["Long-lived tokens", "Short-lived tokens with least-privilege scopes", "Sending tokens in URLs", "Disabling TLS for speed"],
    answer: 1,
    explain: "Short expiry and narrow scopes limit the time and the actions available to an attacker. Tokens in URLs leak through logs and proxies.",
  },
  {
    id: "e-340",
    objective: "5.3",
    kind: "single",
    prompt: "A script stores the Catalyst Center password in its Git repository. What is the better approach?",
    choices: ["Base64 encode it", "Read it from an environment variable or a secrets vault at runtime", "Put it in a comment", "Use HTTP instead of HTTPS"],
    answer: 1,
    explain: "Secrets must never be committed. Load them at runtime from a vault or environment, and rotate anything that leaked.",
  },
  {
    id: "e-341",
    objective: "5.3",
    kind: "single",
    prompt: "What does `verify=False` in a Python `requests` call do, and why is it risky?",
    choices: ["Disables JSON parsing", "Skips TLS certificate validation, which allows man-in-the-middle attacks", "Disables authentication", "Turns off retries"],
    answer: 1,
    explain: "Without certificate validation the client trusts any server. Use proper certificates (or a pinned CA bundle) in production.",
  },
  // 5.4 security design
  {
    id: "e-342",
    objective: "5.4",
    kind: "single",
    prompt: "A printer can't run an 802.1X supplicant. Which method lets the switch admit it based on identity?",
    choices: ["WebAuth", "MAB (MAC Authentication Bypass)", "EAP-TLS", "PEAP"],
    answer: 1,
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
    choices: ["Stateful port filtering", "Application visibility and control (deep packet inspection)", "NAT", "uRPF"],
    answer: 1,
    explain: "NGFWs identify applications by behaviour and signatures (AVC/OpenAppID), not just port numbers.",
  },
  {
    id: "e-345",
    objective: "5.4",
    kind: "single",
    prompt: "What is the purpose of Cisco ISE posture assessment?",
    choices: ["Assigning IP addresses", "Checking an endpoint's compliance (patches, antivirus) before granting full access", "Encrypting links", "Monitoring NetFlow"],
    answer: 1,
    explain: "Posture checks device health and moves non-compliant endpoints to remediation instead of the production network.",
  },
  {
    id: "e-346",
    objective: "5.4",
    kind: "single",
    prompt: "How does TrustSec enforce policy as traffic crosses the network?",
    choices: ["By IP-based ACLs on every router", "Packets carry the source SGT (inline tagging or SXP), and the egress device applies SGACLs based on source and destination groups", "With VLAN pruning", "With VRFs"],
    answer: 1,
    explain: "The SGT travels with the traffic. Enforcement points use a source-group × destination-group matrix, independent of IP addressing.",
  },
  {
    id: "e-347",
    objective: "5.4",
    kind: "single",
    prompt: "Which key agreement protocol does MACsec use between devices?",
    choices: ["IKEv2", "MKA (MACsec Key Agreement)", "SXP", "TLS"],
    answer: 1,
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
    choices: ["Prints ok", "Raises an HTTPError, so 'ok' isn't printed", "Returns None", "Retries automatically"],
    answer: 1,
    explain: "raise_for_status() raises an exception for 4xx and 5xx responses. Wrap it in try/except to handle errors.",
  },
  {
    id: "e-354",
    objective: "6.1",
    kind: "single",
    prompt: "What type does `(\"R1\", \"10.0.0.1\")` create in Python?",
    choices: ["list", "tuple", "dict", "set"],
    answer: 1,
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
    choices: ["Booleans must be quoted", "There is a trailing comma after the last array element", "Keys can't contain letters", "Arrays aren't allowed"],
    answer: 1,
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
    choices: ["A container", "A list keyed by name", "A leaf-list", "A grouping"],
    answer: 1,
    explain: "`list interface` with `key \"name\"` defines repeatable entries, each identified by its name. Each entry holds leaves.",
  },
  {
    id: "e-359",
    objective: "6.3",
    kind: "single",
    prompt: "Which tool displays a YANG module as a readable tree?",
    choices: ["pyang -f tree", "ncclient", "Postman", "netmiko"],
    answer: 0,
    explain: "pyang validates and renders YANG modules. Cisco YANG Suite also explores models interactively.",
  },
  {
    id: "e-360",
    objective: "6.3",
    kind: "single",
    prompt: "What is the main advantage of model-driven programmability over screen-scraping CLI output?",
    choices: ["It's faster to type", "Data is structured and validated against a schema, so scripts don't break when output formatting changes", "It needs no authentication", "It only works with SNMP"],
    answer: 1,
    explain: "Models define structure and types. Parsing human-oriented CLI output is fragile across versions.",
  },
  // 6.4 APIs
  {
    id: "e-361",
    objective: "6.4",
    kind: "single",
    prompt: "Which Catalyst Center API call returns the token used for all later requests?",
    choices: ["GET /dna/intent/api/v1/network-device", "POST /dna/system/api/v1/auth/token with HTTP Basic auth", "POST /j_security_check", "GET /dataservice/client/token"],
    answer: 1,
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
    choices: ["Raw CLI commands only", "Desired outcomes (for example, provision a site or device) that Catalyst Center translates into device configuration", "SNMP traps", "NETCONF RPCs"],
    answer: 1,
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
    choices: ["Re-authenticate", "Back off and retry later (honouring Retry-After)", "Change the URL", "Switch to HTTP"],
    answer: 1,
    explain: "429 Too Many Requests is rate limiting. Slow down, using the Retry-After header if present.",
  },
  {
    id: "e-367",
    objective: "6.5",
    kind: "single",
    prompt: "Refer to the exhibit. What does the response mean?",
    exhibit: `HTTP/1.1 202 Accepted
{"response": {"taskId": "4b1f...", "url": "/api/v1/task/4b1f..."}, "version": "1.0"}`,
    choices: ["The change failed", "The request was queued; check the task URL for the result", "Authentication is required", "The resource was deleted"],
    answer: 1,
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
    choices: ["event syslog", "event track 1 state down", "event cli", "event none"],
    answer: 1,
    explain: "`event track N state up|down|any` ties EEM to object tracking, for example an IP SLA or interface state.",
  },
  {
    id: "e-370",
    objective: "6.6",
    kind: "single",
    prompt: "How do you run an EEM applet configured with `event none`?",
    choices: ["It runs at boot", "Manually with `event manager run APPLET`", "It never runs", "On every syslog message"],
    answer: 1,
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
    choices: ["It is always faster", "Network OSes often can't run third-party agents; agentless tools use SSH, NETCONF or APIs that devices already support", "It needs no credentials", "It doesn't need an inventory"],
    answer: 1,
    explain: "Most routers and switches can't host Puppet or Chef agents, so push-based tools over existing protocols fit better.",
  },
  {
    id: "e-373",
    objective: "6.7",
    kind: "single",
    prompt: "In Puppet, what does a node's agent do periodically?",
    choices: ["Waits for SSH pushes", "Pulls its catalog from the Puppet server and enforces the desired state", "Sends syslog", "Runs Ansible playbooks"],
    answer: 1,
    explain: "Puppet is pull-based: agents check in (every 30 minutes by default), fetch a compiled catalog, and correct any drift.",
  },
  {
    id: "e-374",
    objective: "6.7",
    kind: "single",
    prompt: "Which Ansible file lists the devices and groups a playbook can target?",
    choices: ["Playbook", "Inventory", "Role", "Module"],
    answer: 1,
    explain: "The inventory (INI or YAML, static or dynamic) defines hosts, groups and their variables.",
  },
];
