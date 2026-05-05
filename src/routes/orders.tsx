import { createFileRoute } from "@tanstack/react-router";
import Placeholder from "@/components/Placeholder";

export const Route = createFileRoute("/orders")({
  head: () => ({ meta: [{ title: "Orders — Comart+" }, { name: "description", content: "All store orders across channels." }] }),
  component: () => <Placeholder title="Orders" description="All store orders across channels." />,
});
