import type { Question } from "../types";

// DCAI bank E: brings every objective to at least 16 questions, leaning on exhibits, CLI and sizing maths.

export const dcaiBankE: Question[] = [
  // 1.1 AI/ML workloads
  { id: "d-901", objective: "1.1", kind: "single", prompt: "A team fine-tunes a 7B-parameter model with LoRA instead of full fine-tuning. What is the main infrastructure effect?", choices: ["Far less GPU memory and compute: the base weights stay frozen and only small adapter matrices are trained", "The model needs more GPUs than full fine-tuning", "Training data no longer needs to be stored", "Inference latency doubles"], answer: 0, explain: "LoRA trains low-rank adapters, so gradients and optimizer state exist only for a tiny fraction of the parameters." },
  {
    id: "d-902",
    objective: "1.1",
    kind: "single",
    prompt: "Refer to the exhibit. Users say answers start quickly but then stream slowly. Which metric explains it, and which inference phase does it belong to?",
    exhibit: `model: chat-70b   concurrency: 64
TTFT p50 / p99 ............ 180 ms / 410 ms
inter-token latency p50 .... 95 ms
output tokens/s per user ... 10.5
GPU memory used ............ 97%`,
    choices: ["Inter-token latency, in the decode phase, which is memory-bandwidth-bound", "TTFT, in the prefill phase, which is compute-bound", "Output tokens/s, in the training phase", "GPU memory, in the embedding phase"],
    answer: 0,
    explain: "TTFT is fine. Each new token takes ~95 ms because decode reads the weights and KV cache from HBM for every token; high concurrency and a full KV cache make it worse.",
  },
  { id: "d-903", objective: "1.1", kind: "multi", prompt: "Which TWO statements about the KV cache in LLM inference are true?", choices: ["It stores attention keys and values for tokens already processed, so they aren't recomputed for each new token", "Its size grows with context length and the number of concurrent sequences", "It stores the model weights in FP8", "It lives on the shared storage array"], answer: [0, 1], explain: "KV cache pressure is why long contexts and high concurrency need more GPU memory per model." },

  // 1.2 AI lifecycle
  { id: "d-904", objective: "1.2", kind: "single", prompt: "What is the difference between a validation set and a test set?", choices: ["The validation set guides tuning during development; the test set is held back for one final, unbiased evaluation", "They are the same data", "The test set is used for training", "The validation set is only used in production"], answer: 0, explain: "Tuning against the test set leaks information and overstates real-world accuracy." },
  { id: "d-905", objective: "1.2", kind: "single", prompt: "A new model version is rolled out to 5% of live traffic while its metrics are compared with the current version. What is this?", choices: ["A canary (or A/B) deployment", "Data drift", "Quantisation", "Checkpointing"], answer: 0, explain: "If the canary's metrics hold up, traffic shifts gradually; if not, it is rolled back with little impact." },
  { id: "d-906", objective: "1.2", kind: "single", prompt: "Which MLOps practice records which dataset version, code commit and hyperparameters produced each model?", choices: ["Experiment tracking and lineage", "Load balancing", "Data augmentation", "Pruning"], answer: 0, explain: "Lineage makes models reproducible and auditable, and links a production problem back to its training run." },
  { id: "d-907", objective: "1.2", kind: "multi", prompt: "Which TWO are signals that a production model may need retraining?", choices: ["The distribution of input features has drifted from the training data", "Accuracy on newly labelled production samples is falling", "GPU utilisation was 90% during the original training run", "The inference server's CPU sits at 30%"], answer: [0, 1], explain: "Monitoring feeds the retraining decision; infrastructure utilisation alone doesn't say the model is wrong." },

  // 1.3 Use cases
  { id: "d-908", objective: "1.3", kind: "single", prompt: "A contact centre wants live transcripts of calls and a summary for the agent when the call ends. Which combination fits?", choices: ["Speech-to-text inference feeding an LLM that summarises the transcript", "A recommendation model and a vector database only", "Large-scale pre-training on call audio", "Computer vision at the edge"], answer: 0, explain: "Both stages are inference; transcription must keep up with the call in real time." },
  { id: "d-909", objective: "1.3", kind: "single", prompt: "A security team uses ML to spot unusual traffic patterns that signature-based tools miss. Which approach is typical?", choices: ["Anomaly detection against a learned baseline of normal behaviour", "Generative image models", "Supervised training on labels that don't exist yet", "Retrieval-augmented generation"], answer: 0, explain: "Unsupervised or semi-supervised anomaly detection flags deviations without needing every attack labelled in advance." },
  { id: "d-910", objective: "1.3", kind: "single", prompt: "Developers want an AI code assistant, but source code may not leave the company. Which design fits best?", choices: ["Host a code model on private infrastructure (on-prem or a private cloud tenancy) and serve it as an internal inference API", "Send code to any public chatbot", "Train a model from scratch on public code only", "Run the model on each developer's laptop CPU"], answer: 0, explain: "It's a latency-sensitive generative inference workload with a data-privacy constraint." },
  { id: "d-911", objective: "1.3", kind: "single", prompt: "What is a digital twin used for in AI-driven operations?", choices: ["A virtual model of a physical system (a factory, a network) used to simulate and test changes before applying them", "A backup copy of a training dataset", "A second GPU running the same job", "A duplicate VLAN"], answer: 0, explain: "AI models run against the twin to predict the effect of a change safely." },

  // 1.4 Infrastructure types
  { id: "d-912", objective: "1.4", kind: "single", prompt: "Data must stay inside one country, but the company doesn't want to buy hardware. Which option fits?", choices: ["A cloud region or sovereign cloud offering operated inside that country", "Any public cloud region", "Edge devices only", "Training on laptops"], answer: 0, explain: "Data residency is about where data is stored and processed, which in-country regions or sovereign clouds can satisfy." },
  { id: "d-913", objective: "1.4", kind: "single", prompt: "A model trained centrally must run in 300 retail stores with unreliable WAN links. Where should inference run?", choices: ["On small edge servers in each store, with models distributed and updated centrally", "Only in a central cloud region", "On the training cluster", "On the WAN routers' control plane"], answer: 0, explain: "Edge inference keeps working when the WAN is down and avoids backhauling video or sensor data." },
  { id: "d-914", objective: "1.4", kind: "multi", prompt: "Which TWO favour public cloud GPUs over buying on-premises infrastructure?", choices: ["Short-lived or bursty demand", "Access to new GPU generations without capital expense", "Steady 24×7 utilisation planned for three years", "Strict residency rules with no in-country cloud region"], answer: [0, 1], explain: "Steady, high utilisation and strict residency push toward on-premises." },
  { id: "d-915", objective: "1.4", kind: "single", prompt: "An enterprise's own data centre can't supply 40 kW racks. Which option keeps ownership of the GPU servers?", choices: ["Colocation in a third-party facility that provides the power, cooling and space", "Moving all workloads to SaaS", "Running the servers at 25% power", "Edge deployment in branch offices"], answer: 0, explain: "Colocation separates owning the hardware from owning the facility." },

  // 1.5 Environment components
  { id: "d-916", objective: "1.5", kind: "single", prompt: "Why do multi-node training jobs need gang scheduling?", choices: ["All workers must start together or not at all; a partly started job holds GPUs idle waiting for the rest", "To run every job on one node", "To encrypt traffic between pods", "To reduce storage capacity"], answer: 0, explain: "Slurm does this natively; on Kubernetes, schedulers such as Volcano or Kueue add it." },
  { id: "d-917", objective: "1.5", kind: "single", prompt: "What does the NVIDIA GPU Operator do on a Kubernetes cluster?", choices: ["Automates GPU drivers, the container toolkit, the device plugin and the DCGM exporter on GPU nodes", "Replaces the Kubernetes scheduler", "Configures the switch QoS", "Partitions storage volumes"], answer: 0, explain: "It turns GPU node preparation into a managed, repeatable operator instead of hand-installed packages." },

  // 1.6 Cisco AI solutions
  { id: "d-918", objective: "1.6", kind: "single", prompt: "Which combination best describes a Cisco AI POD?", choices: ["UCS GPU servers, Nexus networking, partner storage and a validated software stack (such as OpenShift and NVIDIA AI Enterprise), managed with Intersight", "A single GPU appliance with no network", "A public cloud service only", "A storage array with built-in GPUs"], answer: 0, explain: "AI PODs are pre-validated, pre-sized building blocks for specific AI workloads." },
  { id: "d-919", objective: "1.6", kind: "single", prompt: "What does Hyperfabric's design-first workflow give the deployment team?", choices: ["A cloud-generated design with a bill of materials and cabling plan, and switches that are claimed, configured and cable-checked against that design", "A CLI script per switch", "A spreadsheet of VLANs only", "An on-premises controller cluster to install"], answer: 0, explain: "The design is the source of truth; miscabling shows up as a mismatch against the plan." },
  { id: "d-920", objective: "1.6", kind: "single", prompt: "What is Cisco AI Defense focused on?", choices: ["Securing AI applications: discovering AI use, validating models and enforcing runtime guardrails against threats such as prompt injection and data leakage", "Cooling GPU servers", "Load balancing RoCE traffic", "Backing up training data"], answer: 0, explain: "It addresses risks specific to AI applications rather than the infrastructure underneath." },
  { id: "d-921", objective: "1.6", kind: "single", prompt: "Which Cisco server is an 8-GPU, HGX-class platform aimed at large-scale training?", choices: ["UCS C885A M8", "UCS C220 M7", "UCS X210c M7", "Catalyst 9300"], answer: 0, explain: "Dense 8-GPU servers pair each GPU with its own back-end NIC for the scale-out fabric." },

  // 2.1 Network design
  {
    id: "d-922",
    objective: "2.1",
    kind: "single",
    prompt: "A non-blocking two-tier back-end fabric connects 1,024 GPUs, one 400G port each, using 64-port 400G switches as both leaves and spines. How many leaves and spines are needed?",
    choices: ["32 leaves and 16 spines", "16 leaves and 32 spines", "64 leaves and 64 spines", "32 leaves and 32 spines"],
    answer: 0,
    explain: "Non-blocking: each leaf has 32 ports down and 32 up, so 1,024 / 32 = 32 leaves. That makes 32 × 32 = 1,024 uplinks, and 1,024 / 64 = 16 spines.",
  },
  { id: "d-923", objective: "2.1", kind: "single", prompt: "What is the difference between scale-up and scale-out networking in an AI cluster?", choices: ["Scale-up is the very high-bandwidth GPU interconnect inside a server or rack (NVLink/NVSwitch); scale-out is the Ethernet or InfiniBand fabric between nodes", "They are two names for the front-end network", "Scale-up means adding spines; scale-out means faster optics", "Scale-out is only used for storage"], answer: 0, explain: "Parallelism strategies are mapped to the domains: tensor parallelism inside scale-up, data and pipeline parallelism across scale-out." },

  // 2.2 Compute design
  { id: "d-924", objective: "2.2", kind: "single", prompt: "Approximately how much GPU memory do the weights alone of a 13-billion-parameter model need in FP16?", choices: ["About 26 GB", "About 13 GB", "About 52 GB", "About 6.5 GB"], answer: 0, explain: "FP16 is 2 bytes per parameter: 13 × 10⁹ × 2 B ≈ 26 GB, before the KV cache and activations." },
  { id: "d-925", objective: "2.2", kind: "single", prompt: "Why does full training need far more GPU memory than inference for the same model?", choices: ["Gradients, optimizer states (such as Adam's two moments) and FP32 master weights add roughly 16 bytes per parameter, against about 2 for FP16 weights alone", "Training uses larger GPUs", "Inference stores the dataset in GPU memory", "Training disables memory compression"], answer: 0, explain: "That's before activations, which is why large models are sharded across GPUs for training." },
  { id: "d-926", objective: "2.2", kind: "single", prompt: "Why does a 400G back-end NIC need a PCIe Gen5 x16 slot?", choices: ["Gen4 x16 carries only about 32 GB/s (~256 Gb/s) per direction, less than 400G; Gen5 x16 doubles that", "Gen4 doesn't support RDMA", "Gen5 is required for jumbo frames", "PCIe generation doesn't matter for NICs"], answer: 0, explain: "A NIC in an undersized slot never reaches line rate, whatever the switch does." },

  // 2.3 Storage design
  { id: "d-927", objective: "2.3", kind: "single", prompt: "100 GPU servers each read training data at 2 GB/s during an epoch. What aggregate read throughput must storage sustain?", choices: ["200 GB/s", "20 GB/s", "2 GB/s", "2 TB/s"], answer: 0, explain: "100 × 2 GB/s. Size for the peak of all nodes reading at once, plus headroom for checkpoint writes." },
  { id: "d-928", objective: "2.3", kind: "single", prompt: "A dataset of 50 million small image files makes training I/O-bound even though throughput looks low. What is the usual fix?", choices: ["Pack samples into large shard files (for example WebDataset or TFRecord) so reads become large and sequential, cutting metadata operations", "Buy higher-capacity disks", "Lower the MTU", "Turn off caching"], answer: 0, explain: "Every small file costs metadata operations (open, stat) that dominate before bandwidth does." },
  { id: "d-929", objective: "2.3", kind: "single", prompt: "What fraction of raw capacity is usable with 8+2 erasure coding?", choices: ["80%", "50%", "33%", "90%"], answer: 0, explain: "8 data fragments out of 10 total; it survives two failures, against 33% usable for three-way replication." },

  // 2.4 Power and cooling
  { id: "d-930", objective: "2.4", kind: "single", prompt: "A rack holds four GPU servers at 10.2 kW each and 1.5 kW of switching. With 2N (A+B) power feeds, what must each feed carry?", choices: ["About 42.3 kW, the whole rack, so either feed can run it alone", "About 21.2 kW", "About 10.6 kW", "About 84.6 kW"], answer: 0, explain: "4 × 10.2 + 1.5 = 42.3 kW. In 2N, each feed must carry the full load if the other fails." },
  { id: "d-931", objective: "2.4", kind: "single", prompt: "What does WUE (water usage effectiveness) measure?", choices: ["Litres of water used per kWh of IT energy", "Water temperature at the CDU", "Cooling capacity per rack", "The share of renewable energy"], answer: 0, explain: "Liquid and evaporative cooling trade water use against energy use, so WUE complements PUE." },
  { id: "d-932", objective: "2.4", kind: "single", prompt: "Why can running GPUs with a power cap slightly below maximum improve efficiency?", choices: ["Performance falls less than power does near the top of the curve, so work per watt improves", "It makes GPUs faster", "It disables cooling", "It increases memory capacity"], answer: 0, explain: "The last few hundred watts buy relatively little performance." },

  // 2.5 Hybrid AI
  { id: "d-933", objective: "2.5", kind: "single", prompt: "Which technique trains a shared model across several sites without moving their raw data?", choices: ["Federated learning: each site trains locally and only model updates are aggregated", "Cloud bursting", "Data replication", "Quantisation"], answer: 0, explain: "It suits privacy-sensitive data spread across hospitals, branches or devices." },
  { id: "d-934", objective: "2.5", kind: "single", prompt: "An LLM runs in the cloud but retrieves documents from an on-premises vector database for every query. What is the biggest latency risk?", choices: ["WAN round trips on every retrieval; keep retrieval close to the model, or the model close to the data", "GPU memory in the cloud", "The embedding dimension", "TLS certificates"], answer: 0, explain: "RAG adds a retrieval step per query, so placement of the retriever matters." },
  { id: "d-935", objective: "2.5", kind: "single", prompt: "Which approach provisions matching GPU infrastructure on-premises and in the cloud from the same code?", choices: ["Infrastructure as code (for example Terraform, with providers for both environments)", "Manual console clicks", "Separate spreadsheets", "SNMP"], answer: 0, explain: "Declarative definitions keep environments consistent and reviewable." },

  // 3.1.a PFC/ECN/ETS
  {
    id: "d-936",
    objective: "3.1.a",
    kind: "single",
    prompt: "Refer to the exhibit. Why isn't Ethernet1/1 doing PFC?",
    exhibit: `LEAF1# show interface priority-flow-control
============================================================
Port               Mode Oper(VL bmap)  RxPPP      TxPPP
============================================================
Ethernet1/1        Auto Off            0          0
Ethernet1/2        On   On  (8)        21034      15`,
    choices: ["Mode auto relies on DCBX negotiation, and the host didn't agree PFC; set the port to mode on or fix the host's DCBX", "PFC is running on CoS 3 on Ethernet1/1", "Ethernet1/1 is receiving too many pause frames", "PFC only works on port-channels"],
    answer: 0,
    explain: "Ethernet1/2 has PFC on for bitmap 0x08 (CoS 3). Ethernet1/1 is operationally off.",
  },

  // 3.1.b RoCE
  { id: "d-937", objective: "3.1.b", kind: "single", prompt: "Which RDMA transport do AI collective libraries normally use over RoCE?", choices: ["Reliable Connected (RC) queue pairs", "Unreliable Datagram only", "TCP sockets", "UDP multicast"], answer: 0, explain: "RC gives ordered, reliable delivery handled by the NIC, which is why loss and reordering are costly." },
  {
    id: "d-938",
    objective: "3.1.b",
    kind: "single",
    prompt: "Refer to the exhibit (host output, trimmed). What limits RoCE efficiency on this NIC?",
    exhibit: `$ ibv_devinfo -d mlx5_0
        port:   1
                state:          PORT_ACTIVE (4)
                max_mtu:        4096 (5)
                active_mtu:     1024 (3)
                link_layer:     Ethernet`,
    choices: ["The RoCE MTU is only 1024 bytes because the interface MTU is small; raise the NIC and fabric MTU (e.g. 9000/9216) to get 4096", "The port is down", "The link layer should be InfiniBand", "max_mtu must be lowered"],
    answer: 0,
    explain: "RoCE picks the largest of 256–4096 that fits the IP MTU. With 1500 it uses 1024, quadrupling per-packet overhead.",
  },
  { id: "d-939", objective: "3.1.b", kind: "single", prompt: "What does a RoCE packet sequence number (PSN) let the receiver do?", choices: ["Detect loss or out-of-order packets within a queue pair and request retransmission", "Choose an ECMP path", "Set the DSCP value", "Identify the VLAN"], answer: 0, explain: "A gap in PSNs triggers a NAK; go-back-N NICs resend everything from the missing packet." },

  // 3.1.c QoS
  { id: "d-940", objective: "3.1.c", kind: "cli", prompt: "In this network-qos class, enable PFC (no-drop) for CoS 3.", context: "N9K(config-pmap-nqos-c)#", accept: ["pau|se pfc-cos 3"], canonical: "pause pfc-cos 3", explain: "The network-qos policy (applied under system qos) defines which classes are lossless." },
  { id: "d-941", objective: "3.1.c", kind: "cli", prompt: "In the same network-qos class, set the MTU to 9216.", context: "N9K(config-pmap-nqos-c)#", accept: ["mtu 9216"], canonical: "mtu 9216", explain: "The no-drop class MTU also sizes the buffer headroom." },
  { id: "d-942", objective: "3.1.c", kind: "cli", prompt: "In the egress queuing class that carries CNPs, make it a strict-priority queue.", context: "N9K(config-pmap-c-que)#", accept: ["prio|rity level 1", "prio|rity"], canonical: "priority level 1", explain: "CNPs must reach senders fast for DCQCN to react before PFC triggers." },

  // 3.1.d Load distribution
  {
    id: "d-943",
    objective: "3.1.d",
    kind: "single",
    prompt: "Refer to the exhibit. Two GPU nodes run an all-reduce over four equal-cost spines. What explains the pattern?",
    exhibit: `LEAF7 uplinks, 30 s average during the job
Eth1/49 -> SPINE1   Tx 396 Gb/s
Eth1/50 -> SPINE2   Tx   2 Gb/s
Eth1/51 -> SPINE3   Tx   1 Gb/s
Eth1/52 -> SPINE4   Tx   3 Gb/s
RoCE QPs between the two nodes: 1`,
    choices: ["One queue pair is one 5-tuple, so static ECMP puts the whole flow on one path; add QPs (more UDP source ports) or use DLB", "SPINE2-4 are down", "PFC is pausing three uplinks", "The MTU is mismatched on three uplinks"],
    answer: 0,
    explain: "Entropy, not capacity, is the problem: a single elephant flow can't be spread by per-flow hashing.",
  },
  { id: "d-944", objective: "3.1.d", kind: "single", prompt: "Why does using several queue pairs per connection (for example NCCL_IB_QPS_PER_CONNECTION) help on an Ethernet fabric?", choices: ["Each QP uses a different UDP source port, giving ECMP more flows to spread", "It reduces the MTU", "It disables PFC", "It compresses traffic"], answer: 0, explain: "More flows means a better statistical spread across equal-cost paths." },
  { id: "d-945", objective: "3.1.d", kind: "single", prompt: "In flowlet-based dynamic load balancing, how must the inactivity gap be chosen?", choices: ["Longer than the maximum latency difference between paths, so a flowlet moved to a new path can't overtake the previous one", "Shorter than one packet time", "Equal to the PFC pause quanta", "It doesn't matter"], answer: 0, explain: "That guarantees in-order delivery while still letting flows move between paths." },
  { id: "d-946", objective: "3.1.d", kind: "multi", prompt: "Which TWO are drawbacks of per-packet spraying in a RoCEv2 fabric?", choices: ["Packets arrive out of order, which triggers go-back-N retransmissions on NICs that can't handle reordering", "It needs NIC support for out-of-order placement or selective retransmission", "It reduces link utilisation", "It increases hash polarisation"], answer: [0, 1], explain: "Spraying gives the best balance only when the endpoints tolerate reordering." },

  // 3.3 Orchestration
  { id: "d-947", objective: "3.3", kind: "single", prompt: "In Nexus Dashboard's fabric controller, which fabric template builds a VXLAN EVPN data centre fabric from scratch?", choices: ["Data Center VXLAN EVPN", "External Connectivity Network", "LAN Classic", "Multi-Site Domain"], answer: 0, explain: "It generates underlay, overlay and BGP EVPN configuration from a few fabric-wide settings." },
  { id: "d-948", objective: "3.3", kind: "single", prompt: "After editing fabric intent in Nexus Dashboard's fabric controller, what happens at 'Recalculate and Deploy'?", choices: ["It computes the configuration each switch needs, shows the pending changes for review, and pushes them on confirmation", "It reloads every switch", "It deletes the fabric", "It only saves a local file"], answer: 0, explain: "The preview of pending config is the safety step before anything changes on the switches." },
  { id: "d-949", objective: "3.3", kind: "single", prompt: "Which Intersight construct pushes one set of policies to dozens of GPU servers and flags any that drift?", choices: ["A server profile template, with profiles derived from it", "A chassis", "An organisation", "A VLAN pool"], answer: 0, explain: "Derived profiles stay linked to the template, so changes roll out and differences show up." },

  // 4.1 Benchmarking
  { id: "d-950", objective: "4.1", kind: "single", prompt: "An NCCL all-reduce test across 16 ranks reports an algbw of 100 GB/s. What busbw does it report?", choices: ["187.5 GB/s", "100 GB/s", "200 GB/s", "50 GB/s"], answer: 0, explain: "For all-reduce, busbw = algbw × 2(n−1)/n = 100 × 30/16 = 187.5 GB/s, comparable to link speed regardless of rank count." },
  { id: "d-951", objective: "4.1", kind: "single", prompt: "Which tool measures RDMA latency between two hosts?", choices: ["ib_write_lat (or ib_send_lat) from perftest", "iperf with TCP", "fio", "dcgmi diag"], answer: 0, explain: "The perftest suite has bandwidth (ib_*_bw) and latency (ib_*_lat) variants." },
  { id: "d-952", objective: "4.1", kind: "single", prompt: "Why run collective benchmarks across a sweep of message sizes?", choices: ["Small messages show latency limits and large messages show bandwidth limits, and real training uses both", "Large messages are invalid", "It's required to enable PFC", "To fill the storage"], answer: 0, explain: "A fabric can look fine at 1 GB messages and still hurt jobs dominated by small collectives." },

  // 4.2 Monitoring
  {
    id: "d-953",
    objective: "4.2",
    kind: "single",
    prompt: "Refer to the exhibit (trimmed). One node is consistently slower in every training step. What does it show?",
    exhibit: `$ nvidia-smi -q -i 3 -d PERFORMANCE,TEMPERATURE
    Clocks Event Reasons
        Idle                        : Not Active
        SW Power Cap                : Not Active
        HW Slowdown                 : Active
            HW Thermal Slowdown     : Active
    Temperature
        GPU Current Temp            : 91 C`,
    choices: ["GPU 3 is thermally throttling; check airflow, fans or the cooling loop", "GPU 3 is idle", "The GPU hit a software power cap", "The network is congested"],
    answer: 0,
    explain: "In synchronous training the slowest GPU sets the pace for all of them.",
  },
  { id: "d-954", objective: "4.2", kind: "single", prompt: "With a valid support contract, what can Intersight do when it detects certain hardware failures?", choices: ["Open a support case automatically (proactive RMA) with the diagnostic data attached", "Replace the part itself", "Reboot the data centre", "Disable the server's NICs"], answer: 0, explain: "It shortens time to repair for failed DIMMs, drives and similar components." },
  { id: "d-955", objective: "4.2", kind: "multi", prompt: "Which TWO point to a GPU node problem rather than a fabric problem?", choices: ["DCGM reports XID errors on one GPU", "One GPU runs at much lower clocks than its peers", "PFC pause counters rising on spine ports", "ECN marks on many leaves"], answer: [0, 1], explain: "Fabric symptoms show up on many switches; node symptoms on one host." },

  // 4.3 Telemetry and logs
  { id: "d-956", objective: "4.3", kind: "cli", prompt: "Show the last 20 log messages on this Nexus switch.", context: "LEAF1#", accept: ["sh|ow logg|ing last 20"], canonical: "show logging last 20", explain: "`show logging logfile` shows the whole local log." },
  {
    id: "d-957",
    objective: "4.3",
    kind: "single",
    prompt: "Refer to the exhibit. What should be checked first?",
    exhibit: `2026 Nov 04 02:11:07 LEAF4 %ETHPORT-5-IF_DOWN_LINK_FAILURE: Interface Ethernet1/49 is down (Link failure)
2026 Nov 04 02:11:09 LEAF4 %ETHPORT-5-IF_UP: Interface Ethernet1/49 is up in mode routed
2026 Nov 04 02:26:41 LEAF4 %ETHPORT-5-IF_DOWN_LINK_FAILURE: Interface Ethernet1/49 is down (Link failure)
2026 Nov 04 02:26:43 LEAF4 %ETHPORT-5-IF_UP: Interface Ethernet1/49 is up in mode routed`,
    choices: ["The optic and cable on Ethernet1/49 (DOM light levels, FEC/CRC errors): the link is flapping", "BGP timers", "The VLAN database", "NTP"],
    answer: 0,
    explain: "Repeated link failures on one port are almost always physical. Every flap disrupts collectives on that path.",
  },
  { id: "d-958", objective: "4.3", kind: "single", prompt: "Why use on-change (event-driven) telemetry for interface state?", choices: ["The collector learns of a change immediately, without waiting for the next sample and without streaming unchanged data", "It's required for SNMP", "It samples faster than line rate", "It encrypts logs"], answer: 0, explain: "Periodic sampling suits counters; on-change suits state such as link up/down." },

  // 4.4 Troubleshooting
  {
    id: "d-959",
    objective: "4.4",
    kind: "single",
    prompt: "Refer to the exhibit. The hosts' NICs send RoCE traffic with PFC on priority 4. What happens under congestion?",
    exhibit: `LEAF2# show interface priority-flow-control
Port               Mode Oper(VL bmap)  RxPPP      TxPPP
Ethernet1/10       On   On  (8)        0          0`,
    choices: ["The switch protects CoS 3 (bitmap 0x08), not 4, so RoCE isn't lossless and drops under congestion; align the NIC priority and DSCP mapping with the switch", "Traffic is protected on CoS 4", "PFC is off", "The switch pauses all priorities"],
    answer: 0,
    explain: "Zero pause frames in both directions despite RoCE traffic is the clue that the priorities don't line up.",
  },
];
