import { createFileRoute } from "@tanstack/react-router";
import Placeholder from "@/components/Placeholder";

export const Route = createFileRoute("/agents")({
  head: () => ({ meta: [{ title: "Agents — Comart+" }, { name: "description", content: "Manage your sales agents." }] }),
  component: () => <Placeholder title="Agents" description="Manage your sales agents." />,
});
