import type { Metadata } from "next";
import { Bench } from "@/components/bench/Bench";

export const metadata: Metadata = { title: "Wire Room · Cert Dojo" };

export default function WirePage() {
  return <Bench />;
}
