import type { Metadata } from "next";
import { DeskList } from "@/components/sizing/DeskList";

export const metadata: Metadata = { title: "Design & Automation Desk · Cert Dojo" };

export default function DeskPage() {
  return <DeskList />;
}
