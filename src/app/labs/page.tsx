import type { Metadata } from "next";
import { LabList } from "@/components/LabList";

export const metadata: Metadata = { title: "Labs · Cert Dojo" };

export default function LabsPage() {
  return <LabList />;
}
