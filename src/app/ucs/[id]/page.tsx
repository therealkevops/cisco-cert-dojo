import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UcsLab } from "@/components/ucs/UcsLab";
import { ucsById, ucsScenarios } from "@/data/ucs";

export function generateStaticParams() {
  return ucsScenarios.map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: ucsById[id] ? `${ucsById[id].title} · UCS Profile Lab` : "UCS Profile Lab" };
}

export default async function UcsScenarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scenario = ucsById[id];
  if (!scenario) notFound();
  return <UcsLab key={id} scenario={scenario} />;
}
