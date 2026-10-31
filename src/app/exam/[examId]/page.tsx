import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Blueprint } from "@/components/Blueprint";
import { exams } from "@/data/catalog";

export function generateStaticParams() {
  return Object.keys(exams).map((examId) => ({ examId }));
}

export async function generateMetadata({ params }: { params: Promise<{ examId: string }> }): Promise<Metadata> {
  const exam = exams[(await params).examId];
  return { title: exam ? `${exam.short} ${exam.code} · Cert Dojo` : "Cert Dojo" };
}

export default async function ExamPage({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  if (!exams[examId]) notFound();
  return (
    <Suspense>
      <Blueprint examId={examId} />
    </Suspense>
  );
}
