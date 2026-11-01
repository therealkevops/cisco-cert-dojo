import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SizingSheet } from "@/components/sizing/SizingSheet";
import { sizingById, sizingExercises } from "@/data/sizing";

export function generateStaticParams() {
  return sizingExercises.map((e) => ({ id: e.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const ex = sizingById[(await params).id];
  return { title: ex ? `${ex.title} · Sizing Desk` : "Sizing Desk" };
}

export default async function SizingExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ex = sizingById[id];
  if (!ex) notFound();
  return <SizingSheet key={id} ex={ex} />;
}
