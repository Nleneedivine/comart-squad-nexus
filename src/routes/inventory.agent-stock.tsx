import { createFileRoute } from "@tanstack/react-router";
import Placeholder from "@/components/Placeholder";

export const Route = createFileRoute("/inventory/agent-stock")({
  head: () => ({ meta: [{ title: "Agent Stock Table — Comart+" }, { name: "description", content: "Stock allocated to your agents." }] }),
  component: () => <Placeholder title="Agent Stock Table" description="Stock allocated to your agents." />,
});
