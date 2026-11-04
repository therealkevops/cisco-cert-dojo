import type { Question } from "../types";

// DCCOR bank H: 2.0 Compute, 3.0 Storage, 4.0 Automation, 5.0 Security, bringing every objective to at least 16.

export const dccorBankH: Question[] = [
  // 2.1 C-Series
  { id: "c-955", objective: "2.1", kind: "single", prompt: "What does the CIMC 'Shared LOM' NIC mode do?", choices: ["Management traffic shares the server's LAN-on-motherboard ports with host traffic", "Management uses the dedicated port only", "Management is disabled", "Management runs over the VIC only"], answer: 0, explain: "Dedicated mode uses the separate management port, which keeps management out of band." },
  { id: "c-956", objective: "2.1", kind: "single", prompt: "Which CIMC feature mounts an ISO image so you can install an OS remotely?", choices: ["Virtual media (vMedia), from the KVM console or a mapped share", "Serial over LAN", "SNMP", "Smart Call Home"], answer: 0, explain: "vMedia mappings can also be configured to persist for automated installs." },
  { id: "c-957", objective: "2.1", kind: "single", prompt: "Which CIMC power restore policy returns the server to the power state it had before an outage?", choices: ["Last state", "Power off", "Power on", "Power cap"], answer: 0, explain: "Power on always boots the server when power returns; power off leaves it off." },
  { id: "c-958", objective: "2.1", kind: "single", prompt: "Why disable unused CIMC services such as IPMI over LAN or HTTP?", choices: ["They widen the attack surface of out-of-band management", "They slow down the CPU", "They're needed for KVM", "They break the VIC"], answer: 0, explain: "Keep HTTPS and Redfish (or XML API) if you use them, with strong credentials." },

  // 2.2 UCS Manager
  { id: "c-959", objective: "2.2", kind: "single", prompt: "What does an 'updating' vNIC template do?", choices: ["Changes to the template propagate to every vNIC bound to it", "It copies settings once at creation", "It updates firmware", "It renames vNICs automatically"], answer: 0, explain: "Initial templates only seed vNICs; updating templates keep them in line, which can trigger reboots per the maintenance policy." },
  { id: "c-960", objective: "2.2", kind: "single", prompt: "How does a fabric interconnect in end-host mode avoid loops without running STP to the LAN?", choices: ["It pins server vNICs to uplinks, never forwards between uplinks, and receives broadcasts on one designated uplink per VLAN", "It blocks all uplinks but one", "It runs Rapid PVST+ on server ports", "It uses VTP"], answer: 0, explain: "To the upstream LAN it looks like a host with many MACs, not a switch." },

  // 2.3 X-Series / IMM
  { id: "c-961", objective: "2.3", kind: "single", prompt: "In IMM, where are the VLANs available on the fabric interconnects defined?", choices: ["In the VLAN policy of the UCS domain profile", "In each server's BIOS policy", "In the chassis profile", "In the boot order policy"], answer: 0, explain: "vNICs can only use VLANs that the domain profile has deployed to the FIs." },
  { id: "c-962", objective: "2.3", kind: "single", prompt: "What is a derived server profile in Intersight?", choices: ["A profile created from a template that inherits its policies and stays linked for updates", "A profile copied by hand", "A profile for a chassis", "A profile for a fabric interconnect"], answer: 0, explain: "Detach a derived profile only for a deliberate exception." },
  { id: "c-963", objective: "2.3", kind: "single", prompt: "What does an Ethernet network group policy define in IMM?", choices: ["The allowed VLANs (and native VLAN) for a vNIC", "QoS classes", "Adapter queue settings", "Boot order"], answer: 0, explain: "It's attached to vNICs in the LAN connectivity policy." },
  { id: "c-964", objective: "2.3", kind: "single", prompt: "You change a policy used by 40 deployed server profiles in IMM. What happens?", choices: ["The profiles show pending changes and apply them when you redeploy (some changes need a reboot)", "All 40 servers reboot immediately", "Nothing ever changes", "The policy is copied to new profiles only"], answer: 0, explain: "Redeploy in batches to control impact." },

  // 2.4 Firmware
  { id: "c-965", objective: "2.4", kind: "single", prompt: "During a UCS Manager infrastructure Auto Install, which component is upgraded first?", choices: ["UCS Manager itself", "The primary fabric interconnect", "The server BIOS", "The adapters"], answer: 0, explain: "Then the IOMs are staged, the subordinate FI is upgraded, and the primary FI waits for your acknowledgement." },
  { id: "c-966", objective: "2.4", kind: "single", prompt: "What does the UCS Manager firmware auto-sync server policy do?", choices: ["Brings a newly discovered server's firmware to the version in the default host firmware package", "Upgrades the FIs", "Syncs NTP", "Copies configs between domains"], answer: 0, explain: "It keeps replacement blades consistent with the rest of the domain." },
  { id: "c-967", objective: "2.4", kind: "single", prompt: "Where does Intersight get firmware images for a server upgrade?", choices: ["From the Cisco repository through Intersight, or from a local software repository for air-gapped appliances", "From the server's USB port only", "From UCS Manager", "From the switch bootflash"], answer: 0, explain: "The Connected and Private Virtual Appliances support local repositories." },
  { id: "c-968", objective: "2.4", kind: "single", prompt: "Why does the primary fabric interconnect wait for user acknowledgement during an infrastructure upgrade?", choices: ["So you can confirm the upgraded subordinate is back and traffic has recovered before the primary reboots", "Because the primary can't be upgraded", "To download the image", "To reboot all servers"], answer: 0, explain: "Check host multipathing and NIC teaming recovered on the upgraded side first." },

  // 2.5 Backup and restore
  { id: "c-969", objective: "2.5", kind: "single", prompt: "Which UCS Manager backup type contains administrative settings such as users, roles and locales?", choices: ["System configuration", "Logical configuration", "Full state", "Firmware bundle"], answer: 0, explain: "Logical configuration holds service profiles, VLANs, pools and policies." },
  { id: "c-970", objective: "2.5", kind: "single", prompt: "Which UCS Manager backup type combines the system and logical configuration in one XML file?", choices: ["All configuration", "Full state", "Logical configuration", "Core dump"], answer: 0, explain: "Full state is a binary snapshot used for disaster recovery during setup." },
  { id: "c-971", objective: "2.5", kind: "single", prompt: "Where should UCS Manager backups be kept?", choices: ["Off the system on a remote server (SCP, SFTP, FTP or TFTP), ideally on a schedule", "Only on the FI's bootflash", "Inside a service profile", "On a blade's local disk"], answer: 0, explain: "A backup that lives on the failed system can't help restore it." },
  { id: "c-972", objective: "2.5", kind: "single", prompt: "How can UCS Manager take full state and all configuration backups automatically?", choices: ["With scheduled backup and configuration export policies", "Only by hand", "Through SNMP traps", "Through the boot policy"], answer: 0, explain: "Set a remote destination and frequency (daily, weekly or bi-weekly)." },

  // 2.6 Compute monitoring
  { id: "c-973", objective: "2.6", kind: "order", prompt: "Order UCS Manager fault severities from most to least severe.", items: ["critical", "major", "minor", "warning"], explain: "Info and cleared sit below warning." },
  { id: "c-974", objective: "2.6", kind: "single", prompt: "What does acknowledging a fault do in UCS Manager?", choices: ["Marks it as seen; it stays until the underlying condition clears", "Clears the condition", "Deletes the fault permanently", "Reboots the server"], answer: 0, explain: "Acknowledging helps teams track which faults someone is already working on." },
  { id: "c-975", objective: "2.6", kind: "multi", prompt: "Which TWO can be sources of a UCS traffic monitoring session?", choices: ["A vNIC", "An uplink Ethernet port", "The CIMC management port", "A KVM session"], answer: [0, 1], explain: "VLANs, port-channels and vHBAs can also be sources." },
  { id: "c-976", objective: "2.6", kind: "single", prompt: "What does the UCS Manager core file exporter do?", choices: ["Sends process core dumps to a TFTP server so TAC can analyse crashes", "Exports the configuration", "Exports firmware", "Exports fault history to syslog"], answer: 0, explain: "Without it, cores stay on the FI where they may be overwritten." },

  // 3.2 Network storage
  { id: "c-977", objective: "3.2", kind: "single", prompt: "Which is a correctly formed iSCSI qualified name?", choices: ["iqn.2026-01.com.example:storage.array1", "iqn:array1@example.com", "21:00:00:24:ff:4c:aa:01", "example.com/iscsi/array1"], answer: 0, explain: "iqn.yyyy-mm.reversed-domain:unique-name. The WWN format is Fibre Channel." },
  { id: "c-978", objective: "3.2", kind: "single", prompt: "What does iSCSI multipathing (MPIO) provide?", choices: ["Several sessions over separate paths for redundancy and load balancing", "Encryption", "Deduplication", "Thin provisioning"], answer: 0, explain: "Use separate subnets or VLANs and NICs per path, rather than NIC teaming." },
  { id: "c-979", objective: "3.2", kind: "single", prompt: "Which NFS version uses a single well-known port (TCP 2049) and no separate mount protocol or portmapper?", choices: ["NFSv4", "NFSv3", "NFSv2", "All versions"], answer: 0, explain: "That makes NFSv4 easier to pass through firewalls." },
  { id: "c-980", objective: "3.2", kind: "single", prompt: "On a Nexus switch, which interface represents a server's FCoE connection on the FC side?", choices: ["A virtual Fibre Channel (vfc) interface bound to the Ethernet port or its MAC", "A port-channel", "An SVI", "A loopback"], answer: 0, explain: "The vfc goes into a VSAN, and the FCoE VLAN maps to that VSAN." },

  // 3.3 Storage updates
  { id: "c-981", objective: "3.3", kind: "cli", prompt: "Check the progress of an `install all` that is running on this MDS switch.", context: "MDS#", accept: ["sh|ow ins|tall all stat|us"], canonical: "show install all status", explain: "It shows each step and whether the upgrade completed." },
  { id: "c-982", objective: "3.3", kind: "single", prompt: "What should you do just before upgrading an MDS switch?", choices: ["Save the running config to startup and copy a backup off the switch", "Delete all zones", "Disable port security", "Shut down every ISL"], answer: 0, explain: "Also check the release notes and run `show install all impact`." },
  { id: "c-983", objective: "3.3", kind: "single", prompt: "Why read the release notes' supported upgrade paths before upgrading MDS?", choices: ["Some releases can't be reached directly and need an intermediate release", "To find the zoning syntax", "To choose a VSAN", "To change domain IDs"], answer: 0, explain: "Skipping a required hop can make the upgrade disruptive or fail." },
  { id: "c-984", objective: "3.3", kind: "single", prompt: "During a non-disruptive upgrade of an MDS fabric switch, what happens to existing FC logins and traffic?", choices: ["They stay up and frames keep forwarding; only control-plane operations such as new logins or zoning changes pause briefly", "All hosts log out", "All ISLs flap", "The VSAN database is erased"], answer: 0, explain: "Avoid fabric changes during the upgrade window." },

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
    choices: ["It's a slow-drain device: it returns buffer credits slowly, so the switch often waits to transmit to it", "The port is down", "The device is in the wrong VSAN", "Zoning blocks it"],
    answer: 0,
    explain: "Credits stuck at zero toward one device back up traffic into the fabric and hurt other hosts.",
  },
  { id: "c-986", objective: "3.4", kind: "cli", prompt: "Create SPAN session 1 on this MDS switch.", context: "MDS(config)#", accept: ["span sess|ion 1"], canonical: "span session 1", explain: "Then add `destination interface` (an SD port) and `source interface`." },
  { id: "c-987", objective: "3.4", kind: "cli", prompt: "In SPAN session 1, mirror the traffic fc1/1 receives.", context: "MDS(config-span)#", accept: ["sou|rce int|erface fc1/1 rx"], canonical: "source interface fc1/1 rx", explain: "Use tx for transmitted traffic; omit the direction for both where supported." },
  { id: "c-988", objective: "3.4", kind: "single", prompt: "Which MDS feature can flap or error-disable a port that crosses a credit-loss or TX-wait threshold?", choices: ["Port monitor with port-guard actions", "Fabric binding", "Device-alias", "NPIV"], answer: 0, explain: "Congestion isolation and congestion drop timeouts are other slow-drain tools." },

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
    choices: ["When a BGP neighbour goes down, it logs a critical message and saves the BGP summary to bootflash", "It shuts down BGP", "It runs every minute", "It restarts the BGP process"],
    answer: 0,
    explain: "Capturing state when the event happens saves guesswork later.",
  },
  { id: "c-990", objective: "4.1", kind: "single", prompt: "Which NX-API CLI message type returns show output as plain text?", choices: ["cli_show_ascii", "cli_show", "cli_conf", "bash"], answer: 0, explain: "cli_show returns structured JSON or XML, which scripts should prefer." },

  // 4.2 Automation tools
  { id: "c-991", objective: "4.2", kind: "single", prompt: "What does running an Ansible playbook with `--check` do?", choices: ["A dry run: it reports what would change without changing anything (for modules that support check mode)", "Checks the YAML syntax only", "Runs it twice", "Deletes the inventory"], answer: 0, explain: "Combine with `--diff` to see the differences." },
  { id: "c-992", objective: "4.2", kind: "single", prompt: "What does `terraform import` do?", choices: ["Brings an existing resource under Terraform management by recording it in the state", "Downloads providers", "Deletes resources", "Converts Ansible playbooks"], answer: 0, explain: "You still need matching configuration so the next plan shows no changes." },

  // 4.3 AI networking
  { id: "c-993", objective: "4.3", kind: "single", prompt: "What does ETS provide in a RoCE fabric?", choices: ["Guaranteed bandwidth shares per traffic class, so RoCE and other traffic each get their portion under load", "Lossless delivery", "ECN marking", "Path selection"], answer: 0, explain: "PFC makes a class lossless; ETS decides how much bandwidth it gets." },
  {
    id: "c-994",
    objective: "4.3",
    kind: "single",
    prompt: "Refer to the exhibit. What does the RxPPP count on Ethernet1/2 mean?",
    exhibit: `LEAF1# show interface priority-flow-control
Port               Mode Oper(VL bmap)  RxPPP      TxPPP
Ethernet1/2        On   On  (8)        918344     12`,
    choices: ["The device on Ethernet1/2 keeps sending pause frames: it is congested and asking the switch to stop sending CoS 3", "The switch is pausing the device", "PFC is off", "The link has CRC errors"],
    answer: 0,
    explain: "Rx = pause frames received from the peer. Look at that host's NIC and its ability to drain traffic.",
  },
  { id: "c-995", objective: "4.3", kind: "single", prompt: "Why classify RoCEv2 by DSCP rather than CoS in a routed spine-leaf fabric?", choices: ["CoS lives in the 802.1Q tag and is lost at each routed hop; DSCP is in the IP header and survives routing", "CoS is not supported by RoCE", "DSCP gives more bandwidth", "CoS is only for FCoE"], answer: 0, explain: "Map the DSCP to the no-drop qos-group on every switch." },
  { id: "c-996", objective: "4.3", kind: "single", prompt: "What does PFC buffer headroom absorb?", choices: ["Data already in flight on the link after the switch sends a pause, until the sender stops", "Bursts of management traffic", "ECN-marked packets", "Dropped packets"], answer: 0, explain: "It depends on cable length, link speed and MTU." },

  // 5.1 Network security
  { id: "c-997", objective: "5.1", kind: "cli", prompt: "Give local user alice the role NETOPS.", context: "N9K(config)#", accept: ["user|name alice role NETOPS"], canonical: "username alice role NETOPS", explain: "A user can hold several roles; permissions are combined." },
  { id: "c-998", objective: "5.1", kind: "single", prompt: "In an ACI contract subject, what do 'apply both directions' with 'reverse filter ports' achieve?", choices: ["Consumer-to-provider traffic matching the filter is allowed, plus the return traffic with source and destination ports swapped", "Either side may start sessions on the filter's port", "Traffic is encrypted", "The contract applies to all VRFs"], answer: 0, explain: "The reverse rule matches the provider's source port, so the provider still can't open sessions to the consumer on that destination port." },

  // 5.2 Compute security
  { id: "c-999", objective: "5.2", kind: "single", prompt: "How are LDAP users given UCS Manager roles?", choices: ["LDAP group maps assign roles and locales to members of LDAP groups", "Every LDAP user is admin", "Roles are typed at login", "Through SNMP"], answer: 0, explain: "Alternatively an LDAP attribute can carry the role." },
  { id: "c-1000", objective: "5.2", kind: "single", prompt: "What can the built-in UCS Manager 'aaa' role do?", choices: ["Manage users, roles and AAA settings", "Configure service profiles", "Configure LAN uplinks", "Upgrade firmware"], answer: 0, explain: "It separates user administration from server and network administration." },
  { id: "c-1001", objective: "5.2", kind: "single", prompt: "Which built-in Intersight role can view an account's resources without changing them?", choices: ["Read-Only", "Account Administrator", "Server Administrator", "Device Technician"], answer: 0, explain: "Custom roles can narrow privileges further per organisation." },
  { id: "c-1002", objective: "5.2", kind: "single", prompt: "Where does Intersight record who changed a policy and when?", choices: ["Audit logs", "Advisories", "HCL status", "Alarms"], answer: 0, explain: "Audit logs can also be pulled through the API for a SIEM." },

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
    choices: ["Replace the old pWWN binding for fc1/3 with the new one in the config database, then run `port-security activate vsan 10`", "Disable port security", "Move fc1/3 to VSAN 1", "Delete the zone"],
    answer: 0,
    explain: "Also update device-aliases or zones that reference the old pWWN.",
  },
  { id: "c-1006", objective: "5.3", kind: "single", prompt: "What must be configured for DHCHAP between an MDS switch and a device?", choices: ["DHCHAP enabled with a compatible mode on both ends, and a shared secret for each", "Only a zone", "NPIV", "A VSAN trunk"], answer: 0, explain: "DHCHAP authenticates switches and devices at login using challenge-response." },
];
