import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Kata } from "@/components/Kata";
import { exams } from "@/data/catalog";

export function generateStaticParams() {
  return Object.keys(exams).map((examId) => ({ examId }));
}

export async function generateMetadata({ params }: { params: Promise<{ examId: string }> }): Promise<Metadata> {
  const exam = exams[(await params).examId];
  return { title: exam ? `Kata · ${exam.short} · Cert Dojo` : "Cert Dojo" };
}

export default async function KataPage({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  if (!exams[examId]) notFound();
  return (
    <Suspense>
      <Kata examId={examId} />
    </Suspense>
  );
}
