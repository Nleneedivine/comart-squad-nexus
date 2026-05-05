import { createFileRoute } from "@tanstack/react-router";
import Placeholder from "@/components/Placeholder";

export const Route = createFileRoute("/reports/export")({
  head: () => ({ meta: [{ title: "Data Export — Comart+" }, { name: "description", content: "Export your store data." }] }),
  component: () => <Placeholder title="Data Export" description="Export your store data." />,
});
