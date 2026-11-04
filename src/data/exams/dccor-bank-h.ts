import type { Question } from "../types";

// DCCOR bank H: 2.0 Compute, 3.0 Storage, 4.0 Automation, 5.0 Security, bringing every objective to at least 16.

export const dccorBankH: Question[] = [
  // 2.1 C-Series
  { id: "c-955", objective: "2.1", kind: "single", prompt: "What does the CIMC 'Shared LOM' NIC mode do?", choices: ["Management shares the LOM ports with host traffic", "Management uses only the dedicated management port", "Management traffic runs over the VIC's own ports", "Management is reachable only through the FIs"], answer: 0, explain: "Dedicated mode uses the separate management port, which keeps management out of band." },
  { id: "c-956", objective: "2.1", kind: "single", prompt: "Which CIMC feature mounts an ISO image so you can install an OS remotely?", choices: ["Virtual media (vMedia)", "Serial over LAN", "Host Upgrade Utility", "PXE boot policy"], answer: 0, explain: "vMedia mappings can also be configured to persist for automated installs." },
  { id: "c-957", objective: "2.1", kind: "single", prompt: "Which CIMC power restore policy returns the server to the power state it had before an outage?", choices: ["Last state", "Power off", "Power on", "Power cap"], answer: 0, explain: "Power on always boots the server when power returns; power off leaves it off." },
  { id: "c-958", objective: "2.1", kind: "single", prompt: "Why disable unused CIMC services such as IPMI over LAN or HTTP?", choices: ["They widen the management attack surface", "They slow down the CIMC's web interface", "They conflict with Redfish API sessions", "They disable the KVM console when enabled"], answer: 0, explain: "Keep HTTPS and Redfish (or XML API) if you use them, with strong credentials." },

  // 2.2 UCS Manager
  { id: "c-959", objective: "2.2", kind: "single", prompt: "What does an 'updating' vNIC template do?", choices: ["Template changes propagate to bound vNICs", "Settings are copied once at creation", "Bound vNICs can override the template", "Changes apply only to new vNICs"], answer: 0, explain: "Initial templates only seed vNICs; updating templates keep them in line, which can trigger reboots per the maintenance policy." },
  { id: "c-960", objective: "2.2", kind: "single", prompt: "How does a fabric interconnect in end-host mode avoid loops without running STP to the LAN?", choices: ["Pins vNICs to uplinks and never forwards between uplinks", "Blocks every uplink except the one elected as root port", "Runs Rapid PVST+ toward the upstream LAN switches", "Uses LACP to bundle all uplinks into one logical link"], answer: 0, explain: "To the upstream LAN it looks like a host with many MACs, not a switch." },

  // 2.3 X-Series / IMM
  { id: "c-961", objective: "2.3", kind: "single", prompt: "In IMM, where are the VLANs available on the fabric interconnects defined?", choices: ["In the domain profile's VLAN policy", "In the server profile's LAN policy", "In the chassis profile", "In the Ethernet network group policy"], answer: 0, explain: "The domain profile's VLAN policy creates VLANs on the FIs. Ethernet network group policies pick which of those a vNIC carries." },
  { id: "c-962", objective: "2.3", kind: "single", prompt: "What is a derived server profile in Intersight?", choices: ["A profile created from a template and linked to it", "A profile cloned from another server's profile", "A profile for a chassis", "A profile for a fabric interconnect pair"], answer: 0, explain: "Detach a derived profile only for a deliberate exception." },
  { id: "c-963", objective: "2.3", kind: "single", prompt: "What does an Ethernet network group policy define in IMM?", choices: ["The allowed and native VLANs for a vNIC", "The QoS class and MTU used by a vNIC", "The adapter queues and RSS for a vNIC", "The MAC address pool used by a vNIC"], answer: 0, explain: "It's attached to vNICs in the LAN connectivity policy." },
  { id: "c-964", objective: "2.3", kind: "single", prompt: "You change a policy used by 40 deployed server profiles in IMM. What happens?", choices: ["Profiles show pending changes until redeployed", "All 40 servers apply and reboot immediately", "Only profiles deployed later pick up the change", "The change is rejected while profiles are deployed"], answer: 0, explain: "Redeploy in batches to control impact." },

  // 2.4 Firmware
  { id: "c-965", objective: "2.4", kind: "single", prompt: "During a UCS Manager infrastructure Auto Install, which component is upgraded first?", choices: ["UCS Manager", "The primary fabric interconnect", "The subordinate fabric interconnect", "The IOMs"], answer: 0, explain: "Then the IOMs are staged, the subordinate FI is upgraded, and the primary FI waits for your acknowledgement." },
  { id: "c-966", objective: "2.4", kind: "single", prompt: "What does the UCS Manager firmware auto-sync server policy do?", choices: ["Brings new servers to the default host firmware", "Keeps both FIs' firmware in step across the pair", "Syncs server firmware between UCS domains", "Syncs adapter firmware with the FI versions"], answer: 0, explain: "It keeps replacement blades consistent with the rest of the domain." },
  { id: "c-967", objective: "2.4", kind: "single", prompt: "Where does Intersight get firmware images for a server upgrade?", choices: ["The Cisco repository, or a local one for appliances", "The UCS Manager firmware library in the domain", "Each server's own CIMC flash storage", "The fabric interconnects' bootflash partition"], answer: 0, explain: "The Connected and Private Virtual Appliances support local repositories." },
  { id: "c-968", objective: "2.4", kind: "single", prompt: "Why does the primary fabric interconnect wait for user acknowledgement during an infrastructure upgrade?", choices: ["To confirm traffic recovered on the subordinate first", "Because the primary must download the image again", "Because servers must reboot before the primary", "Because the primary needs a licence check"], answer: 0, explain: "Check host multipathing and NIC teaming recovered on the upgraded side first." },

  // 2.5 Backup and restore
  { id: "c-969", objective: "2.5", kind: "single", prompt: "Which UCS Manager backup type contains administrative settings such as users, roles and locales?", choices: ["System configuration", "Logical configuration", "Full state", "All configuration"], answer: 0, explain: "Logical configuration holds service profiles, VLANs, pools and policies." },
  { id: "c-970", objective: "2.5", kind: "single", prompt: "Which UCS Manager backup type combines the system and logical configuration in one XML file?", choices: ["All configuration", "Full state", "Logical configuration", "System configuration"], answer: 0, explain: "Full state is a binary snapshot used for disaster recovery during setup." },
  { id: "c-971", objective: "2.5", kind: "single", prompt: "Where should UCS Manager backups be kept?", choices: ["On a remote server, on a schedule", "On the FI's own bootflash", "On a blade's local disk drive", "In UCS Central and nowhere else"], answer: 0, explain: "A backup that lives on the failed system can't help restore it." },
  { id: "c-972", objective: "2.5", kind: "single", prompt: "How can UCS Manager take full state and all configuration backups automatically?", choices: ["Scheduled backup and export policies", "A Smart Call Home profile for backups", "A maintenance policy with a schedule", "SNMP-triggered configuration exports"], answer: 0, explain: "Set a remote destination and frequency (daily, weekly or bi-weekly)." },

  // 2.6 Compute monitoring
  { id: "c-973", objective: "2.6", kind: "order", prompt: "Order UCS Manager fault severities from most to least severe.", items: ["critical", "major", "minor", "warning"], explain: "Info and cleared sit below warning." },
  { id: "c-974", objective: "2.6", kind: "single", prompt: "What does acknowledging a fault do in UCS Manager?", choices: ["Marks it seen; it stays until the condition clears", "Clears the fault and the underlying condition", "Deletes the fault permanently from the history", "Suppresses the fault from view for 24 hours"], answer: 0, explain: "Acknowledging helps teams track which faults someone is already working on." },
  { id: "c-975", objective: "2.6", kind: "multi", prompt: "Which TWO can be sources of a UCS traffic monitoring session?", choices: ["A vNIC", "An uplink Ethernet port", "The CIMC management port", "The FI's console port", "A KVM session"], answer: [0, 1], explain: "VLANs, port-channels and vHBAs can also be sources." },
  { id: "c-976", objective: "2.6", kind: "single", prompt: "What does the UCS Manager core file exporter do?", choices: ["Sends core dumps to a TFTP server for TAC", "Exports the configuration on a schedule", "Exports the fault history to syslog", "Exports firmware images to a share"], answer: 0, explain: "Without it, cores stay on the FI where they may be overwritten." },

  // 3.2 Network storage
  { id: "c-977", objective: "3.2", kind: "single", prompt: "Which is a correctly formed iSCSI qualified name?", choices: ["iqn.2026-01.com.example:storage.array1", "iqn.com.example.2026-01:storage.array1", "iqn:2026-01.example.com/storage.array1", "eui.example.com:storage.array1"], answer: 0, explain: "IQN format is iqn.yyyy-mm.reversed-domain:unique-name. The date comes before the reversed domain; eui. names use a 16-hex-digit EUI-64." },
  { id: "c-978", objective: "3.2", kind: "single", prompt: "What does iSCSI multipathing (MPIO) provide?", choices: ["Several sessions over separate paths", "Encryption of the iSCSI sessions", "A larger queue depth for each LUN", "Automatic discovery of new LUNs"], answer: 0, explain: "Use separate subnets or VLANs and NICs per path, rather than NIC teaming." },
  { id: "c-979", objective: "3.2", kind: "single", prompt: "Which NFS version uses a single well-known port (TCP 2049) and no separate mount protocol or portmapper?", choices: ["NFSv4", "NFSv3", "NFSv2", "pNFS (NFSv4.1) only"], answer: 0, explain: "That makes NFSv4 easier to pass through firewalls." },
  { id: "c-980", objective: "3.2", kind: "single", prompt: "On a Nexus switch, which interface represents a server's FCoE connection on the FC side?", choices: ["A virtual Fibre Channel (vfc) interface", "A virtual Ethernet (veth) interface", "An SVI in the FCoE VLAN", "An FC port-channel"], answer: 0, explain: "The vfc goes into a VSAN, and the FCoE VLAN maps to that VSAN." },

  // 3.3 Storage updates
  { id: "c-981", objective: "3.3", kind: "cli", prompt: "Check the progress of an `install all` that is running on this MDS switch.", context: "MDS#", accept: ["sh|ow ins|tall all stat|us"], canonical: "show install all status", explain: "It shows each step and whether the upgrade completed." },
  { id: "c-982", objective: "3.3", kind: "single", prompt: "What should you do just before upgrading an MDS switch?", choices: ["Save the config and copy a backup off the switch", "Delete unused zones to speed up the upgrade", "Disable port security for the duration", "Shut all ISLs to isolate the switch"], answer: 0, explain: "Also check the release notes and run `show install all impact`." },
  { id: "c-983", objective: "3.3", kind: "single", prompt: "Why read the release notes' supported upgrade paths before upgrading MDS?", choices: ["Some releases need an intermediate hop", "To check the new release's zoning limits", "To confirm the domain ID stays the same", "To find the new image's file names"], answer: 0, explain: "Skipping a required hop can make the upgrade disruptive or fail." },
  { id: "c-984", objective: "3.3", kind: "single", prompt: "During a non-disruptive upgrade of an MDS fabric switch, what happens to existing FC logins and traffic?", choices: ["They stay up while the control plane restarts", "All devices log out and back in", "ISLs flap while the control plane restarts", "Traffic pauses for the reload"], answer: 0, explain: "Avoid fabric changes during the upgrade window." },

  // 3.4 Storage monitoring
  {
    id: "c-985",
    objective: "3.4",
    kind: "single",
    prompt: "Refer to the exhibit. What does the output suggest about the device on fc1/5?",
    exhibit: `MDS# show interface fc1/5 counters
fc1/5
    ...
    0 credit loss
    184392 Transmit B2B credit transitions to zero
    76841 Receive B2B credit transitions to zero
    Tx  wait time: 12.4% of the last 60 s`,
    choices: ["It's a slow-drain device", "The port has a failing optic", "The device is in the wrong VSAN", "Zoning is blocking the device"],
    answer: 0,
    explain: "Credits stuck at zero toward one device back up traffic into the fabric and hurt other hosts.",
  },
  { id: "c-986", objective: "3.4", kind: "cli", prompt: "Create SPAN session 1 on this MDS switch.", context: "MDS(config)#", accept: ["span sess|ion 1"], canonical: "span session 1", explain: "Then add `destination interface` (an SD port) and `source interface`." },
  { id: "c-987", objective: "3.4", kind: "cli", prompt: "In SPAN session 1, mirror the traffic fc1/1 receives.", context: "MDS(config-span)#", accept: ["sou|rce int|erface fc1/1 rx"], canonical: "source interface fc1/1 rx", explain: "Use tx for transmitted traffic; omit the direction for both where supported." },
  { id: "c-988", objective: "3.4", kind: "single", prompt: "Which MDS feature can flap or error-disable a port that crosses a credit-loss or TX-wait threshold?", choices: ["Port monitor with port-guard actions", "Fabric binding with strict mode", "Port security with auto-learn", "The congestion drop timeout"], answer: 0, explain: "Port-guard actions (flap, error-disable, congestion isolation) act on port-monitor thresholds. The congestion drop timeout discards frames held too long; it doesn't act on the port." },

  // 4.1 On-box automation
  {
    id: "c-989",
    objective: "4.1",
    kind: "single",
    prompt: "Refer to the exhibit. What does the applet do?",
    exhibit: `event manager applet BGP-DOWN
  event syslog pattern "BGP-5-ADJCHANGE.*Down"
  action 1.0 syslog priority critical msg "BGP neighbour down on LEAF1"
  action 2.0 cli command "show bgp ipv4 unicast summary > bootflash:bgp-down.txt"`,
    choices: ["Logs a critical message and saves the BGP summary", "Shuts down the BGP process after a neighbour drops", "Runs every minute to check the BGP neighbour table", "Restarts the BGP process to recover the session"],
    answer: 0,
    explain: "Capturing state when the event happens saves guesswork later.",
  },
  { id: "c-990", objective: "4.1", kind: "single", prompt: "Which NX-API CLI message type returns show output as plain text?", choices: ["cli_show_ascii", "cli_show", "cli_conf", "bash"], answer: 0, explain: "cli_show returns structured JSON or XML, which scripts should prefer." },

  // 4.2 Automation tools
  { id: "c-991", objective: "4.2", kind: "single", prompt: "What does running an Ansible playbook with `--check` do?", choices: ["Dry run: reports changes without making them", "Checks the playbook's YAML syntax only", "Runs the play against one host as a canary", "Validates the inventory's credentials only"], answer: 0, explain: "Combine with `--diff` to see the differences." },
  { id: "c-992", objective: "4.2", kind: "single", prompt: "What does `terraform import` do?", choices: ["Brings an existing resource into the state", "Downloads the providers in the configuration", "Generates configuration from a live device", "Copies state from another workspace"], answer: 0, explain: "You still need matching configuration so the next plan shows no changes." },

  // 4.3 AI networking
  { id: "c-993", objective: "4.3", kind: "single", prompt: "What does ETS provide in a RoCE fabric?", choices: ["Bandwidth shares per traffic class", "Lossless delivery for one class", "ECN marking per traffic class", "Path selection across the fabric"], answer: 0, explain: "PFC makes a class lossless; ETS decides how much bandwidth it gets." },
  {
    id: "c-994",
    objective: "4.3",
    kind: "single",
    prompt: "Refer to the exhibit. What does the RxPPP count on Ethernet1/2 mean?",
    exhibit: `LEAF1# show interface priority-flow-control
Port               Mode Oper(VL bmap)  RxPPP      TxPPP
Ethernet1/2        On   On  (8)        918344     12`,
    choices: ["The device on Eth1/2 is pausing the switch", "The switch is pausing the device on Eth1/2", "PFC is operationally off on Eth1/2", "The link on Eth1/2 has CRC errors"],
    answer: 0,
    explain: "Rx = pause frames received from the peer. Look at that host's NIC and its ability to drain traffic.",
  },
  { id: "c-995", objective: "4.3", kind: "single", prompt: "Why classify RoCEv2 by DSCP rather than CoS in a routed spine-leaf fabric?", choices: ["CoS is lost at routed hops; DSCP survives", "RoCE NICs can't set CoS", "DSCP allows more traffic classes for PFC", "CoS is reserved for FCoE"], answer: 0, explain: "Map the DSCP to the no-drop qos-group on every switch." },
  { id: "c-996", objective: "4.3", kind: "single", prompt: "What does PFC buffer headroom absorb?", choices: ["Data in flight after the pause is sent", "Bursts of traffic in the lossy classes", "Packets that were marked with ECN", "Packets being retransmitted by senders"], answer: 0, explain: "It depends on cable length, link speed and MTU." },

  // 5.1 Network security
  { id: "c-997", objective: "5.1", kind: "cli", prompt: "Give local user alice the role NETOPS.", context: "N9K(config)#", accept: ["user|name alice role NETOPS"], canonical: "username alice role NETOPS", explain: "A user can hold several roles; permissions are combined." },
  { id: "c-998", objective: "5.1", kind: "single", prompt: "In an ACI contract subject, what do 'apply both directions' with 'reverse filter ports' achieve?", choices: ["The filter's traffic plus the return traffic with ports swapped", "Either side may start sessions to the filter's port", "The filter applies in both VRFs of a shared service", "The contract is enforced on both ingress and egress leaves"], answer: 0, explain: "The reverse rule matches the provider's source port, so the provider still can't open sessions to the consumer on that destination port." },

  // 5.2 Compute security
  { id: "c-999", objective: "5.2", kind: "single", prompt: "How are LDAP users given UCS Manager roles?", choices: ["LDAP group maps assign roles and locales", "Every LDAP user gets the admin role", "Roles are chosen by the user at login", "Roles come from the LDAP user's OU name only"], answer: 0, explain: "Alternatively an LDAP attribute can carry the role." },
  { id: "c-1000", objective: "5.2", kind: "single", prompt: "What can the built-in UCS Manager 'aaa' role do?", choices: ["Manage users, roles and AAA settings", "Configure and associate service profiles", "Configure LAN uplinks and VLANs", "Manage host firmware packages"], answer: 0, explain: "It separates user administration from server and network administration." },
  { id: "c-1001", objective: "5.2", kind: "single", prompt: "Which built-in Intersight role can view an account's resources without changing them?", choices: ["Read-Only", "Device Technician", "Server Administrator", "User Access Administrator"], answer: 0, explain: "Custom roles can narrow privileges further per organisation." },
  { id: "c-1002", objective: "5.2", kind: "single", prompt: "Where does Intersight record who changed a policy and when?", choices: ["Audit logs", "Advisories", "Alarms", "Requests"], answer: 0, explain: "Audit logs can also be pulled through the API for a SIEM." },

  // 5.3 Storage security
  { id: "c-1003", objective: "5.3", kind: "cli", prompt: "Enable fabric binding on this MDS switch.", context: "MDS(config)#", accept: ["fea|ture fabric-bind|ing"], canonical: "feature fabric-binding", explain: "Then build `fabric-binding database vsan N` and activate it." },
  { id: "c-1004", objective: "5.3", kind: "cli", prompt: "In the port security database, bind pWWN 21:00:00:e0:8b:05:76:28 to interface fc1/3.", context: "MDS(config-port-security)#", accept: ["pwwn 21:00:00:e0:8b:05:76:28 int|erface fc1/3"], canonical: "pwwn 21:00:00:e0:8b:05:76:28 interface fc1/3", explain: "Edits go to the config database; reactivate to apply them." },
  {
    id: "c-1005",
    objective: "5.3",
    kind: "single",
    prompt: "Refer to the exhibit. A server's HBA was replaced this morning. What fixes it while keeping port security?",
    exhibit: `MDS# show port-security violations
VSAN Interface     Logging-in Entity                          Last-Time                [Repeat count]
------------------------------------------------------------------------------------------------
10   fc1/3         21:00:00:e0:8b:05:76:28(pwwn)              Tue Nov  4 08:12:44 2026  [37]
[Total 1 entries]`,
    choices: ["Rebind fc1/3 to the new pWWN, then reactivate", "Enable auto-learn and leave it on", "Move fc1/3 to a VSAN without port security", "Add the new pWWN to the zone only"],
    answer: 0,
    explain: "Also update device-aliases or zones that reference the old pWWN.",
  },
  { id: "c-1006", objective: "5.3", kind: "single", prompt: "What must be configured for DHCHAP between an MDS switch and a device?", choices: ["Compatible DHCHAP modes and a shared secret", "A zone that contains both of the devices", "NPIV enabled on the core switch first", "Port security bindings for both devices"], answer: 0, explain: "DHCHAP authenticates switches and devices at login using challenge-response." },
];
