import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SanLab } from "@/components/san/SanLab";
import { sanById, sanScenarios } from "@/data/san";

export function generateStaticParams() {
  return sanScenarios.map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: sanById[id] ? `${sanById[id].title} · SAN Lab` : "SAN Lab" };
}

export default async function SanScenarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scenario = sanById[id];
  if (!scenario) notFound();
  return <SanLab key={id} scenario={scenario} />;
}
