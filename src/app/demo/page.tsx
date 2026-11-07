import type { Metadata } from "next";
import { Dashboard } from "@/components/Dashboard";

export const metadata: Metadata = { title: "Kinetix demo — AI chief of staff" };

export default function DemoPage() {
  return <Dashboard mode="demo" />;
}
