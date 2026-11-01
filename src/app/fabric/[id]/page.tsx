import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FabricLab } from "@/components/fabric/FabricLab";
import { fabricById, fabricScenarios } from "@/data/fabric";

export function generateStaticParams() {
  return fabricScenarios.map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const sc = fabricById[(await params).id];
  return { title: sc ? `${sc.title} · Fabric Lab` : "Fabric Lab" };
}

export default async function FabricScenarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scenario = fabricById[id];
  if (!scenario) notFound();
  return <FabricLab key={id} scenario={scenario} />;
}
