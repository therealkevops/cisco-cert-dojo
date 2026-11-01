import type { Metadata } from "next";
import { UcsList } from "@/components/ucs/UcsList";

export const metadata: Metadata = { title: "UCS Profile Lab · Cert Dojo" };

export default function UcsPage() {
  return <UcsList />;
}
