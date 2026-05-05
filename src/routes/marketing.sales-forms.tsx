import { createFileRoute } from "@tanstack/react-router";
import Placeholder from "@/components/Placeholder";

export const Route = createFileRoute("/marketing/sales-forms")({
  head: () => ({ meta: [{ title: "Sales Forms — Comart+" }, { name: "description", content: "Create and share sales forms." }] }),
  component: () => <Placeholder title="Sales Forms" description="Create and share sales forms." />,
});
