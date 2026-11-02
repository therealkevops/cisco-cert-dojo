import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AciLab } from "@/components/aci/AciLab";
import { aciById, aciScenarios } from "@/data/aci";

export function generateStaticParams() {
  return aciScenarios.map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: aciById[id] ? `${aciById[id].title} · ACI Policy Lab` : "ACI Policy Lab" };
}

export default async function AciScenarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scenario = aciById[id];
  if (!scenario) notFound();
  return <AciLab key={id} scenario={scenario} />;
}
