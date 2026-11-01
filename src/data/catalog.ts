import type { Exam, Track } from "./types";
import { encor } from "./exams/encor";
import { dcai } from "./exams/dcai";
import { dccor } from "./exams/dccor";

export const exams: Record<string, Exam> = { encor, dccor, dcai };
export const examList: Exam[] = Object.values(exams);

// The rack. "racked" tracks have content; "planned" ones show as blank slots
// so the roadmap to every Cisco cert is visible from day one.
export const tracks: Track[] = [
  {
    id: "ccnp-enterprise",
    name: "CCNP Enterprise",
    level: "Professional",
    exams: ["encor"],
    rule: "Pass the ENCOR core plus one Enterprise concentration. ENCOR also qualifies you for the CCIE Enterprise lab.",
    status: "racked",
  },
  {
    id: "ccnp-datacenter",
    name: "CCNP Data Center",
    level: "Professional",
    exams: ["dccor", "dcai"],
    rule: "Pass the 350-601 DCCOR core plus one concentration, here 300-640 DCAI. Each passed exam also earns a Specialist certification, and DCCOR qualifies you for the CCIE Data Center lab.",
    status: "racked",
  },
  {
    id: "ccna",
    name: "CCNA",
    level: "Associate",
    exams: [],
    rule: "Single exam: 200-301.",
    status: "planned",
  },
  {
    id: "ccnp-security",
    name: "CCNP Security",
    level: "Professional",
    exams: [],
    rule: "350-701 SCOR core plus one concentration.",
    status: "planned",
  },
  {
    id: "ccnp-wireless",
    name: "CCNP Wireless",
    level: "Professional",
    exams: [],
    rule: "New wireless track. Wireless topics moved here from ENCOR in v1.2.",
    status: "planned",
  },
  {
    id: "ccie-enterprise",
    name: "CCIE Enterprise Infrastructure",
    level: "Expert",
    exams: [],
    rule: "ENCOR qualifier plus the 8-hour lab.",
    status: "planned",
  },
];

export function objectiveIndex(exam: Exam) {
  const map = new Map<string, { domain: Exam["domains"][number]; objective: Exam["domains"][number]["objectives"][number] }>();
  for (const domain of exam.domains) for (const objective of domain.objectives) map.set(objective.id, { domain, objective });
  return map;
}
