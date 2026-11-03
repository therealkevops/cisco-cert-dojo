import type { Metadata } from "next";
import { VpcList } from "@/components/vpc/VpcList";

export const metadata: Metadata = { title: "vPC Lab · Cert Dojo" };

export default function VpcPage() {
  return <VpcList />;
}
