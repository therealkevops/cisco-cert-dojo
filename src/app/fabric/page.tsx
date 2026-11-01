import type { Metadata } from "next";
import { FabricList } from "@/components/fabric/FabricList";

export const metadata: Metadata = { title: "Fabric Lab · Cert Dojo" };

export default function FabricPage() {
  return <FabricList />;
}
