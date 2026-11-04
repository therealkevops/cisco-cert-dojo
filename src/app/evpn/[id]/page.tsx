import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EvpnLab } from "@/components/evpn/EvpnLab";
import { evpnById, evpnScenarios } from "@/data/evpn";

export function generateStaticParams() {
  return evpnScenarios.map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: evpnById[id] ? `${evpnById[id].title} · VXLAN EVPN Lab` : "VXLAN EVPN Lab" };
}

export default async function EvpnScenarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scenario = evpnById[id];
  if (!scenario) notFound();
  return <EvpnLab key={id} scenario={scenario} />;
}
