import type { Metadata } from "next";
import { ClusterBuilder } from "@/components/sizing/ClusterBuilder";

export const metadata: Metadata = { title: "Cluster builder · Sizing Desk" };

export default function BuilderPage() {
  return <ClusterBuilder />;
}
