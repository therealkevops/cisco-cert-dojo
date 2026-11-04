import type { Metadata } from "next";
import { EvpnList } from "@/components/evpn/EvpnList";

export const metadata: Metadata = { title: "VXLAN EVPN Lab · Cert Dojo" };

export default function EvpnPage() {
  return <EvpnList />;
}
