import { createFileRoute } from "@tanstack/react-router";
import Placeholder from "@/components/Placeholder";

export const Route = createFileRoute("/reports/activity")({
  head: () => ({ meta: [{ title: "Store Activity Log — Comart+" }, { name: "description", content: "Audit log of store activity." }] }),
  component: () => <Placeholder title="Store Activity Log" description="Audit log of store activity." />,
});
