import type { Metadata } from "next";
import { SizingList } from "@/components/sizing/SizingList";

export const metadata: Metadata = { title: "Sizing Desk · Cert Dojo" };

export default function SizingPage() {
  return <SizingList />;
}
