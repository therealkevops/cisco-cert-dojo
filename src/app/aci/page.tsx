import type { Metadata } from "next";
import { AciList } from "@/components/aci/AciList";

export const metadata: Metadata = { title: "ACI Policy Lab · Cert Dojo" };

export default function AciPage() {
  return <AciList />;
}
