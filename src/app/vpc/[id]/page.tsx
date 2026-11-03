import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VpcLab } from "@/components/vpc/VpcLab";
import { vpcById, vpcScenarios } from "@/data/vpc";

export function generateStaticParams() {
  return vpcScenarios.map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: vpcById[id] ? `${vpcById[id].title} · vPC Lab` : "vPC Lab" };
}

export default async function VpcScenarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scenario = vpcById[id];
  if (!scenario) notFound();
  return <VpcLab key={id} scenario={scenario} />;
}
