import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Bench } from "@/components/bench/Bench";
import { scenarioById, scenarios } from "@/data/wire";

export function generateStaticParams() {
  return scenarios.map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const sc = scenarioById[(await params).id];
  return { title: sc ? `${sc.title} · Wire Room` : "Wire Room" };
}

export default async function WireScenarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scenario = scenarioById[id];
  if (!scenario) notFound();
  return <Bench key={id} scenario={scenario} />;
}
