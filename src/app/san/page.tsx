import type { Metadata } from "next";
import { SanList } from "@/components/san/SanList";

export const metadata: Metadata = { title: "SAN Lab · Cert Dojo" };

export default function SanPage() {
  return <SanList />;
}
