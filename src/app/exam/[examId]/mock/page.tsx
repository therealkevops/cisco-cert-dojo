import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Mock } from "@/components/Mock";
import { exams } from "@/data/catalog";

export function generateStaticParams() {
  return Object.keys(exams).map((examId) => ({ examId }));
}

export async function generateMetadata({ params }: { params: Promise<{ examId: string }> }): Promise<Metadata> {
  const exam = exams[(await params).examId];
  return { title: exam ? `Mock · ${exam.short} · Cert Dojo` : "Cert Dojo" };
}

export default async function MockPage({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  if (!exams[examId]) notFound();
  return <Mock examId={examId} />;
}
