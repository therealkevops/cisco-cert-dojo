import type { Metadata } from "next";
import { WireList } from "@/components/wire/WireList";

export const metadata: Metadata = { title: "Wire Room challenges · Cert Dojo" };

export default function WireChallengesPage() {
  return <WireList />;
}
