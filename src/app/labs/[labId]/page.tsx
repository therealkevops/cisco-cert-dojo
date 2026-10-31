import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LabTerminal } from "@/components/LabTerminal";
import { labById, labs } from "@/data/labs";

export function generateStaticParams() {
  return labs.map((l) => ({ labId: l.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ labId: string }> }): Promise<Metadata> {
  const lab = labById[(await params).labId];
  return { title: lab ? `${lab.title} · Cert Dojo` : "Cert Dojo" };
}

export default async function LabPage({ params }: { params: Promise<{ labId: string }> }) {
  const { labId } = await params;
  if (!labById[labId]) notFound();
  return <LabTerminal labId={labId} />;
}
