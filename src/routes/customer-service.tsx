import { createFileRoute } from "@tanstack/react-router";
import Placeholder from "@/components/Placeholder";

export const Route = createFileRoute("/customer-service")({
  head: () => ({ meta: [{ title: "Customer Service — Comart+" }, { name: "description", content: "Handle customer support tickets." }] }),
  component: () => <Placeholder title="Customer Service" description="Handle customer support tickets." />,
});
