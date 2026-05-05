import { createFileRoute } from "@tanstack/react-router";
import Placeholder from "@/components/Placeholder";

export const Route = createFileRoute("/inventory/waybill")({
  head: () => ({ meta: [{ title: "Waybill — Comart+" }, { name: "description", content: "Generate and manage waybills." }] }),
  component: () => <Placeholder title="Waybill" description="Generate and manage waybills." />,
});
