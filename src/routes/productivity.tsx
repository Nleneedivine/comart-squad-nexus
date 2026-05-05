import { createFileRoute } from "@tanstack/react-router";
import Placeholder from "@/components/Placeholder";

export const Route = createFileRoute("/productivity")({
  head: () => ({ meta: [{ title: "Productivity — Comart+" }, { name: "description", content: "Productivity tools for your team." }] }),
  component: () => <Placeholder title="Productivity" description="Productivity tools for your team." />,
});
