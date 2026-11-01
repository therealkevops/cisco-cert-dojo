import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SizingSheet } from "@/components/sizing/SizingSheet";
import { deskExercises } from "@/data/desk";

export function generateStaticParams() {
  return deskExercises.map((e) => ({ id: e.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const ex = deskExercises.find((e) => e.id === id);
  return { title: ex ? `${ex.title} · Design & Automation Desk` : "Design & Automation Desk" };
}

export default async function DeskExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ex = deskExercises.find((e) => e.id === id);
  if (!ex) notFound();
  return <SizingSheet key={id} ex={ex} />;
}
