import type { Question } from "../types";

// DCAI bank E: brings every objective to at least 16 questions, leaning on exhibits, CLI and sizing maths.

export const dcaiBankE: Question[] = [
  // 1.1 AI/ML workloads
  { id: "d-901", objective: "1.1", kind: "single", prompt: "A team fine-tunes a 7B-parameter model with LoRA instead of full fine-tuning. What is the main infrastructure effect?", choices: ["Much less GPU memory and compute", "More GPUs than full fine-tuning", "A larger training dataset", "Higher inference latency"], answer: 0, explain: "LoRA trains small adapter matrices while base weights stay frozen, so gradients and optimizer state exist for a tiny fraction of parameters. Merged adapters add no inference latency." },
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
    choices: ["Inter-token latency, in the memory-bound decode phase", "TTFT, in the compute-bound prefill phase", "Inter-token latency, in the compute-bound prefill phase", "TTFT, in the memory-bound decode phase"],
    answer: 0,
    explain: "TTFT is fine. Each token takes ~95 ms because decode reads weights and the KV cache from HBM for every token.",
  },
  { id: "d-903", objective: "1.1", kind: "multi", prompt: "Which TWO statements about the KV cache in LLM inference are true?", choices: ["It stores keys and values for tokens already processed", "Its size grows with context length and concurrency", "It holds a copy of the model weights in FP8", "It's shared across all GPUs in the node through NVLink", "It lives in host memory unless the model is small"], answer: [0, 1], explain: "KV cache pressure is why long contexts and high concurrency need more GPU memory. It's per GPU in HBM unless explicitly offloaded." },

  // 1.2 AI lifecycle
  { id: "d-904", objective: "1.2", kind: "single", prompt: "What is the difference between a validation set and a test set?", choices: ["Validation guides tuning; the test set is kept for a final check", "Validation is kept for a final check; the test set guides tuning", "They're two equal halves of the original training data", "Validation is only used after the model is in production"], answer: 0, explain: "Tuning against the test set leaks information and overstates real-world accuracy." },
  { id: "d-905", objective: "1.2", kind: "single", prompt: "A new model version is rolled out to 5% of live traffic while its metrics are compared with the current version. What is this?", choices: ["A canary deployment", "A blue/green deployment", "A shadow deployment", "A rolling update"], answer: 0, explain: "A canary sends a small share of live traffic to the new version. Blue/green switches all traffic at once, and shadow mirrors traffic without serving its responses." },
  { id: "d-906", objective: "1.2", kind: "single", prompt: "Which MLOps practice records which dataset version, code commit and hyperparameters produced each model?", choices: ["Experiment tracking and lineage", "A model registry with versioning", "A feature store for training data", "Dataset versioning on its own"], answer: 0, explain: "Tracking ties dataset, code and hyperparameters to each run. A registry stores the resulting models, and a feature store serves features." },
  { id: "d-907", objective: "1.2", kind: "multi", prompt: "Which TWO are signals that a production model may need retraining?", choices: ["Input features have drifted from the training data", "Accuracy on newly labelled samples is falling", "Inference latency has risen at peak traffic", "GPU utilisation on the serving nodes has dropped", "The serving cluster was scaled out last month"], answer: [0, 1], explain: "Drift and falling accuracy say the model is wrong. Latency, utilisation and scaling are serving concerns." },

  // 1.3 Use cases
  { id: "d-908", objective: "1.3", kind: "single", prompt: "A contact centre wants live transcripts of calls and a summary for the agent when the call ends. Which combination fits?", choices: ["Speech-to-text inference feeding an LLM", "An LLM transcribing audio directly", "A recommendation model and a vector database", "Fine-tuning an LLM on past calls"], answer: 0, explain: "Both stages are inference, and transcription must keep up in real time. Fine-tuning isn't needed for summarisation." },
  { id: "d-909", objective: "1.3", kind: "single", prompt: "A security team uses ML to spot unusual traffic patterns that signature-based tools miss. Which approach is typical?", choices: ["Anomaly detection against a learned baseline", "Supervised classification of known attacks", "Retrieval-augmented generation", "Generative models of normal traffic only"], answer: 0, explain: "Anomaly detection flags deviations without labelling every attack in advance; supervised models only find what they were trained on." },
  { id: "d-910", objective: "1.3", kind: "single", prompt: "Developers want an AI code assistant, but source code may not leave the company. Which design fits best?", choices: ["A code model on private infrastructure as an internal API", "A public assistant under a no-training data agreement", "A small model running on each developer's laptop CPU", "Pre-training a new code model from scratch in house"], answer: 0, explain: "It's latency-sensitive generative inference with a data-privacy constraint. Agreements still send code out; laptops are too slow; pre-training is unnecessary." },
  { id: "d-911", objective: "1.3", kind: "single", prompt: "What is a digital twin used for in AI-driven operations?", choices: ["Simulating a physical system to test changes safely", "Keeping a hot replica of production for failover", "Mirroring live traffic to test a new model version", "Storing a backup copy of the training data offsite"], answer: 0, explain: "A twin is a virtual model of a factory or network that AI runs against to predict the effect of a change." },

  // 1.4 Infrastructure types
  { id: "d-912", objective: "1.4", kind: "single", prompt: "Data must stay inside one country, but the company doesn't want to buy hardware. Which option fits?", choices: ["An in-country cloud region or sovereign cloud", "A global region with encryption at rest enabled", "A multi-region deployment for extra resilience", "Edge devices in each office with no central copy"], answer: 0, explain: "Residency is about where data is stored and processed; encryption doesn't change location." },
  { id: "d-913", objective: "1.4", kind: "single", prompt: "A model trained centrally must run in 300 retail stores with unreliable WAN links. Where should inference run?", choices: ["Edge servers in each store, managed centrally", "A central cloud region with local result caching", "Store PCs running CPU-only inference locally", "The nearest regional data centre over the WAN"], answer: 0, explain: "Edge inference keeps working when the WAN is down and avoids backhauling video or sensor data." },
  { id: "d-914", objective: "1.4", kind: "multi", prompt: "Which TWO favour public cloud GPUs over buying on-premises infrastructure?", choices: ["Short-lived or bursty demand", "New GPU generations without capital expense", "Steady 24×7 use over three years", "Strict residency with no in-country region", "Large datasets already on premises"], answer: [0, 1], explain: "Steady use, strict residency and data gravity push toward on-premises." },
  { id: "d-915", objective: "1.4", kind: "single", prompt: "An enterprise's own data centre can't supply 40 kW racks. Which option keeps ownership of the GPU servers?", choices: ["Colocation in a third-party facility", "GPU-as-a-service from a neocloud", "Power-capping the servers to fit", "Edge deployment in branch offices"], answer: 0, explain: "Colocation separates owning the hardware from owning the facility. Neoclouds rent you their GPUs." },

  // 1.5 Environment components
  { id: "d-916", objective: "1.5", kind: "single", prompt: "A 16-node training job is submitted to Kubernetes. Twelve of its pods start and hold their GPUs while the other four wait for capacity, and no other work can use those twelve nodes. What prevents this?", choices: ["Gang scheduling, which starts all of the pods or none", "Pod priority, which pre-empts lower-priority pods", "A horizontal pod autoscaler on the training job", "Node affinity that pins the pods to a single rack"], answer: 0, explain: "Distributed training can't progress until every rank is up. Gang (co-)scheduling, as in Volcano or Kueue, admits the whole group at once so partial jobs don't hoard GPUs." },
  { id: "d-917", objective: "1.5", kind: "single", prompt: "What does the NVIDIA GPU Operator do on a Kubernetes cluster?", choices: ["Installs and manages the GPU software stack on nodes", "Schedules GPU jobs in place of the kube-scheduler", "Partitions every GPU into MIG instances on demand", "Exports GPU metrics to Prometheus and nothing else"], answer: 0, explain: "The GPU Operator automates drivers, the container toolkit, the device plugin and the DCGM exporter. It can configure MIG and does export metrics, but its job is the whole stack, not scheduling." },

  // 1.6 Cisco AI solutions
  { id: "d-918", objective: "1.6", kind: "single", prompt: "Which combination best describes a Cisco AI POD?", choices: ["UCS GPU servers, Nexus switching, partner storage and a validated software stack", "UCS GPU servers on a Hyperfabric-managed fabric, with no storage or software layer", "A converged appliance with GPUs, storage and networking in a single chassis", "Nexus switching sized to connect a customer's existing GPU servers and storage"], answer: 0, explain: "AI PODs combine compute, network, storage and software (such as OpenShift and NVIDIA AI Enterprise), managed with Intersight, pre-validated for specific workloads." },
  { id: "d-919", objective: "1.6", kind: "single", prompt: "What does Hyperfabric's design-first workflow give the deployment team?", choices: ["A BOM, a cabling plan and switches checked against the design", "Day-0 CLI templates to paste into each switch's console", "A Terraform plan that configures the switches remotely", "An on-premises controller cluster to install and manage"], answer: 0, explain: "The cloud design is the source of truth; switches are claimed and configured from it, and miscabling shows up as a mismatch against the plan." },
  { id: "d-920", objective: "1.6", kind: "single", prompt: "What is Cisco AI Defense focused on?", choices: ["Securing AI applications, from model validation to runtime guardrails", "Detecting anomalies in AI fabric telemetry and alerting operations", "Protecting GPU servers from firmware tampering and supply-chain risk", "Encrypting RoCE traffic between GPU nodes on the back-end fabric"], answer: 0, explain: "AI Defense discovers AI use, validates models and enforces guardrails against prompt injection and data leakage; it isn't infrastructure telemetry or link encryption." },
  { id: "d-921", objective: "1.6", kind: "single", prompt: "Which Cisco server is an 8-GPU, HGX-class platform aimed at large-scale training?", choices: ["UCS C885A M8", "UCS C845A M8", "UCS C240 M8", "UCS X210c M7"], answer: 0, explain: "The C885A M8 is the 8-GPU HGX-class (or AMD OAM) platform. The C845A is a PCIe-GPU server, the C240 supports a few GPUs, and the X210c is a blade." },

  // 2.1 Network design
  {
    id: "d-922",
    objective: "2.1",
    kind: "single",
    prompt: "A non-blocking two-tier back-end fabric connects 1,024 GPUs, one 400G port each, using 64-port 400G switches as both leaves and spines. How many leaves and spines are needed?",
    choices: ["32 leaves and 16 spines", "16 leaves and 32 spines", "32 leaves and 32 spines", "16 leaves and 16 spines"],
    answer: 0,
    explain: "Each leaf has 32 ports down and 32 up, so 1,024 / 32 = 32 leaves. That gives 1,024 uplinks, and 1,024 / 64 = 16 spines.",
  },
  { id: "d-923", objective: "2.1", kind: "single", prompt: "What is the difference between scale-up and scale-out networking in an AI cluster?", choices: ["Scale-up links GPUs within a node or rack; scale-out links nodes", "Scale-up adds GPUs per node; scale-out adds faster NICs per node", "Scale-up is the front-end network; scale-out is the back-end fabric", "Scale-up runs over Ethernet; scale-out runs over NVLink switches"], answer: 0, explain: "Scale-up is NVLink/NVSwitch; scale-out is the Ethernet or InfiniBand fabric. Tensor parallelism stays in scale-up; data and pipeline parallelism span scale-out." },

  // 2.2 Compute design
  { id: "d-924", objective: "2.2", kind: "single", prompt: "Approximately how much GPU memory do the weights alone of a 13-billion-parameter model need in FP16?", choices: ["About 26 GB", "About 13 GB", "About 52 GB", "About 7 GB"], answer: 0, explain: "FP16 is 2 bytes per parameter: 13 × 10⁹ × 2 ≈ 26 GB. 13 GB would be FP8, 52 GB FP32." },
  { id: "d-925", objective: "2.2", kind: "single", prompt: "A 7B model's weights take about 14 GB in FP16. Mixed-precision training with Adam needs roughly 16 bytes per parameter before activations. About how much memory does training need?", choices: ["About 112 GB, so it must be sharded or offloaded", "About 28 GB, which fits on one 80 GB GPU", "About 14 GB, the same as serving the model", "About 56 GB, which fits on one 80 GB GPU"], answer: 0, explain: "7B × 16 bytes = 112 GB for weights, gradients, FP32 master weights and Adam states, plus activations. That's why training is sharded (ZeRO/FSDP) even when inference fits one GPU." },
  { id: "d-926", objective: "2.2", kind: "single", prompt: "A 400G NIC is installed in a PCIe Gen4 x16 slot. ib_write_bw between two such hosts tops out around 200–220 Gb/s. What is the limit?", choices: ["The slot: Gen4 x16 carries only about 250 Gb/s raw", "The optic: 400G needs DR4 rather than FR4 modules", "The MTU: a 4096-byte RoCE MTU caps out near 220 Gb/s", "The switch: one QP is limited to half of a 400G port"], answer: 0, explain: "PCIe Gen4 x16 is about 32 GB/s (roughly 256 Gb/s) raw, less after overhead. A 400G NIC needs Gen5 x16 (about 512 Gb/s raw)." },

  // 2.3 Storage design
  { id: "d-927", objective: "2.3", kind: "single", prompt: "100 GPU servers each read training data at 2 GB/s during an epoch. What aggregate read throughput must storage sustain?", choices: ["200 GB/s", "20 GB/s", "100 GB/s", "2 TB/s"], answer: 0, explain: "100 × 2 GB/s = 200 GB/s, plus headroom for checkpoints." },
  { id: "d-928", objective: "2.3", kind: "single", prompt: "A dataset of 50 million small image files makes training I/O-bound even though throughput looks low. What is the usual fix?", choices: ["Pack samples into large shard files", "Add more storage capacity", "Use a faster network to the storage", "Raise the data loader's prefetch depth only"], answer: 0, explain: "Each small file costs metadata operations that dominate before bandwidth. Shards (WebDataset, TFRecord) turn them into large sequential reads; more bandwidth or prefetch doesn't fix metadata load." },
  { id: "d-929", objective: "2.3", kind: "single", prompt: "What fraction of raw capacity is usable with 8+2 erasure coding?", choices: ["80%", "67%", "50%", "90%"], answer: 0, explain: "8 data fragments out of 10 total survive two failures with 80% usable, against 33% for three-way replication." },

  // 2.4 Power and cooling
  { id: "d-930", objective: "2.4", kind: "single", prompt: "A rack holds four GPU servers at 10.2 kW each and 1.5 kW of switching. With 2N (A+B) power feeds, what must each feed carry?", choices: ["About 42.3 kW", "About 21.2 kW", "About 40.8 kW", "About 84.6 kW"], answer: 0, explain: "4 × 10.2 + 1.5 = 42.3 kW. In 2N, either feed must carry the full load alone." },
  { id: "d-931", objective: "2.4", kind: "single", prompt: "What does WUE (water usage effectiveness) measure?", choices: ["Litres of water per kWh of IT energy", "Litres of water per kWh of total energy", "Cooling capacity per litre of water", "Water returned to source as a percentage"], answer: 0, explain: "WUE is annual site water use divided by IT energy, complementing PUE." },
  { id: "d-932", objective: "2.4", kind: "single", prompt: "Why can running GPUs with a power cap slightly below maximum improve efficiency?", choices: ["Performance drops less than power near the top of the curve", "Capped GPUs boost their memory clocks to compensate", "Capping the GPUs lowers the facility's PUE directly", "Capped GPUs never reach the point of thermal throttling"], answer: 0, explain: "The last few hundred watts buy little performance, so work per watt improves. PUE measures facility overhead, not IT efficiency." },

  // 2.5 Hybrid AI
  { id: "d-933", objective: "2.5", kind: "single", prompt: "Which technique trains a shared model across several sites without moving their raw data?", choices: ["Federated learning", "Cloud bursting", "Distributed data parallelism", "Transfer learning"], answer: 0, explain: "Federated learning trains locally and aggregates only model updates. Data parallelism still needs the data where the GPUs are; transfer learning reuses a model." },
  { id: "d-934", objective: "2.5", kind: "single", prompt: "An LLM runs in the cloud but retrieves documents from an on-premises vector database for every query. What is the biggest latency risk?", choices: ["WAN round trips on every retrieval", "Embedding computation in the cloud", "Vector index size", "TLS handshakes per query"], answer: 0, explain: "RAG adds a retrieval step per query, so keep the retriever close to the model or the model close to the data." },
  { id: "d-935", objective: "2.5", kind: "single", prompt: "Which approach provisions matching GPU infrastructure on-premises and in the cloud from the same code?", choices: ["Infrastructure as code with providers for both", "Golden images for every server", "A shared CMDB of both environments", "Configuration backups restored in each environment"], answer: 0, explain: "Declarative definitions (for example Terraform) keep environments consistent and reviewable; images and backups don't provision cloud resources." },

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
    choices: ["Mode auto and DCBX didn't agree with the host", "PFC is configured for the wrong priority here", "Ethernet1/1 is sending too many pause frames", "PFC only operates on port-channel members"],
    answer: 0,
    explain: "Ethernet1/2 has PFC on for bitmap 0x08 (CoS 3). Ethernet1/1 relies on DCBX and is operationally off; set mode on or fix the host.",
  },

  // 3.1.b RoCE
  { id: "d-937", objective: "3.1.b", kind: "single", prompt: "Which RDMA transport do AI collective libraries normally use over RoCE?", choices: ["Reliable Connected (RC)", "Unreliable Datagram (UD)", "Unreliable Connected (UC)", "Extended Reliable Connected (XRC)"], answer: 0, explain: "NCCL uses RC queue pairs for ordered, reliable delivery handled by the NIC, which is why loss and reordering are costly." },
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
    choices: ["RoCE MTU is 1024 because the interface MTU is small", "The NIC negotiated a lower link speed than 400G", "The NIC is running RoCEv1 rather than RoCEv2", "The port's max MTU is too low for RoCE to work"],
    answer: 0,
    explain: "RoCE picks the largest of 256–4096 that fits the IP MTU. With 1500 it uses 1024; raise the NIC and fabric MTU to get 4096. max_mtu is already 4096.",
  },
  { id: "d-939", objective: "3.1.b", kind: "single", prompt: "What does a RoCE packet sequence number (PSN) let the receiver do?", choices: ["Detect lost or out-of-order packets in a QP", "Pick the ECMP path for each RoCE packet", "Match the packet to its target memory region", "Order completions across several queue pairs"], answer: 0, explain: "A gap in PSNs triggers a NAK; go-back-N NICs resend from the missing packet. Memory regions are matched by keys, not PSNs." },

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
    choices: ["One QP is one 5-tuple, so ECMP uses one path", "Three of the spine links are down or isolated", "PFC is pausing three of the four uplinks", "DLB is pinning the whole flow to one spine"],
    answer: 0,
    explain: "Entropy, not capacity: one elephant flow can't be spread by per-flow hashing. Add QPs (source ports) or use DLB.",
  },
  { id: "d-944", objective: "3.1.d", kind: "single", prompt: "Why does using several queue pairs per connection (for example NCCL_IB_QPS_PER_CONNECTION) help on an Ethernet fabric?", choices: ["Each QP uses a different UDP source port", "Each QP gets its own PFC priority", "Each QP uses a different destination port", "Each QP is pinned to a different NIC port"], answer: 0, explain: "More flows give ECMP more to spread; the destination port stays 4791." },
  { id: "d-945", objective: "3.1.d", kind: "single", prompt: "Path latency between leaves differs by up to 8 µs depending on which spine is used. Which flowlet inactivity gap avoids reordering?", choices: ["Larger than the 8 µs skew, for example 16 µs", "Smaller than the skew, for example 4 µs, to rebalance faster", "Zero, so that every packet can be rebalanced", "Equal to one MTU's serialisation time at 400G"], answer: 0, explain: "A flow can only move safely once its last packet on the old path has arrived, so the gap must exceed the worst-case latency difference between paths." },
  { id: "d-946", objective: "3.1.d", kind: "multi", prompt: "Which TWO are drawbacks of per-packet spraying in a RoCEv2 fabric?", choices: ["Out-of-order arrival triggers go-back-N on many NICs", "It needs NIC support for out-of-order placement", "It lowers overall link utilisation across paths", "It increases hash polarisation between tiers", "It needs PFC enabled on every traffic priority"], answer: [0, 1], explain: "Spraying gives the best balance only when endpoints tolerate reordering; it increases utilisation and avoids hashing entirely." },

  // 3.3 Orchestration
  { id: "d-947", objective: "3.3", kind: "single", prompt: "In Nexus Dashboard's fabric controller, which fabric template builds a VXLAN EVPN data centre fabric from scratch?", choices: ["Data Center VXLAN EVPN", "Enhanced Classic LAN", "External Connectivity Network", "Multi-Site Interconnect Network"], answer: 0, explain: "It generates underlay, overlay and BGP EVPN from fabric-wide settings. Enhanced Classic LAN is three-tier, external networks are edge/core, and multi-site joins fabrics." },
  { id: "d-948", objective: "3.3", kind: "single", prompt: "After editing fabric intent in Nexus Dashboard's fabric controller, what happens at 'Recalculate and Deploy'?", choices: ["It computes per-switch config and previews it before pushing", "It pushes the saved intent immediately to all switches", "It validates the intent without generating any config", "It rolls the switches back to the last deployed intent"], answer: 0, explain: "The preview of pending config is the safety step before anything changes on the switches." },
  { id: "d-949", objective: "3.3", kind: "single", prompt: "Which Intersight construct pushes one set of policies to dozens of GPU servers and flags any that drift?", choices: ["A server profile template with derived profiles", "A resource group containing the GPU servers", "An organisation scoped to the AI platform team", "A policy bucket attached to the UCS domain"], answer: 0, explain: "Derived profiles stay linked to the template, so changes roll out and drift shows. Resource groups and organisations scope access." },

  // 4.1 Benchmarking
  { id: "d-950", objective: "4.1", kind: "single", prompt: "An NCCL all-reduce test across 16 ranks reports an algbw of 100 GB/s. What busbw does it report?", choices: ["187.5 GB/s", "100 GB/s", "200 GB/s", "93.75 GB/s"], answer: 0, explain: "For all-reduce, busbw = algbw × 2(n−1)/n = 100 × 30/16 = 187.5 GB/s." },
  { id: "d-951", objective: "4.1", kind: "single", prompt: "Which tool measures RDMA latency between two hosts?", choices: ["ib_write_lat", "ib_write_bw", "qperf over TCP", "nccl-tests sendrecv_perf"], answer: 0, explain: "perftest has bandwidth (ib_*_bw) and latency (ib_*_lat) variants; NCCL tests add the GPU stack." },
  { id: "d-952", objective: "4.1", kind: "single", prompt: "Refer to the exhibit (NCCL all-reduce, 16 ranks). A manager points to the 8 KB row as proof the fabric is slow. What is the right reading?", exhibit: `   size     algbw   busbw  (GB/s)
   8 KB      0.4     0.7
   1 MB     18.0    33.8
  64 MB     44.1    82.7
   1 GB     48.0    90.0`, choices: ["Small messages are latency-bound; judge bandwidth at large sizes", "The fabric is slow; busbw should be flat across message sizes", "busbw above algbw shows the test is configured incorrectly", "The 1 GB row is served from GPU cache and should be ignored"], answer: 0, explain: "At small sizes fixed latency dominates, so bandwidth looks low. Peak busbw at large sizes shows what the fabric can carry. busbw = algbw × 2(n−1)/n, so it's always higher." },

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
    choices: ["GPU 3 is thermally throttling", "GPU 3 hit a software power cap", "GPU 3 is idle between steps", "GPU 3 has ECC errors"],
    answer: 0,
    explain: "HW Thermal Slowdown is active and SW Power Cap isn't. In synchronous training the slowest GPU sets the pace; check airflow and cooling.",
  },
  { id: "d-954", objective: "4.2", kind: "single", prompt: "With a valid support contract, what can Intersight do when it detects certain hardware failures?", choices: ["Open a support case automatically (proactive RMA)", "Fail the workload over to a spare server profile", "Power the server off to protect the failing part", "Roll the server back to its previous firmware"], answer: 0, explain: "Proactive RMA opens the case with diagnostics attached, shortening repair time for DIMMs, drives and similar parts." },
  { id: "d-955", objective: "4.2", kind: "multi", prompt: "Which TWO point to a GPU node problem rather than a fabric problem?", choices: ["XID errors on one GPU", "One GPU clocking well below its peers", "Pauses on spine ports", "ECN marks on many leaves", "CRC errors on uplinks"], answer: [0, 1], explain: "Fabric symptoms appear across switches; node symptoms on one host." },

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
    choices: ["The optic and cable on Ethernet1/49", "OSPF timers on Ethernet1/49", "The PFC configuration on Ethernet1/49", "The interface's speed setting"],
    answer: 0,
    explain: "Repeated link failures on one port are almost always physical; check DOM light levels and FEC/CRC errors.",
  },
  { id: "d-958", objective: "4.3", kind: "single", prompt: "Why use on-change (event-driven) telemetry for interface state?", choices: ["Changes reach the collector immediately", "It reduces CPU use for counter sampling", "It provides finer counter resolution", "It's required for gNMI subscriptions"], answer: 0, explain: "Periodic sampling suits counters; on-change suits state such as link up/down. gNMI supports both." },

  // 4.4 Troubleshooting
  {
    id: "d-959",
    objective: "4.4",
    kind: "single",
    prompt: "Refer to the exhibit. The hosts' NICs send RoCE traffic with PFC on priority 4. What happens under congestion?",
    exhibit: `LEAF2# show interface priority-flow-control
Port               Mode Oper(VL bmap)  RxPPP      TxPPP
Ethernet1/10       On   On  (8)        0          0`,
    choices: ["RoCE isn't protected: the switch pauses CoS 3, not 4", "Traffic is protected because PFC is on", "The switch remaps priority 4 to 3 automatically", "Both priorities are paused"],
    answer: 0,
    explain: "The bitmap 0x08 is CoS 3. Zero pause frames despite RoCE traffic is the clue; align NIC priority and DSCP with the switch.",
  },
];
