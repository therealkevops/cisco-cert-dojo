import type { Metadata } from "next";
import { WireList } from "@/components/wire/WireList";

export const metadata: Metadata = { title: "Wire Room · Cert Dojo" };

export default function WirePage() {
  return <WireList />;
}
