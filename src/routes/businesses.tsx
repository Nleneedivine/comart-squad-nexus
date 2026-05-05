import { createFileRoute } from "@tanstack/react-router";
import Placeholder from "@/components/Placeholder";

export const Route = createFileRoute("/businesses")({
  head: () => ({ meta: [{ title: "Businesses — Comart+" }, { name: "description", content: "Manage business partners." }] }),
  component: () => <Placeholder title="Businesses" description="Manage business partners." />,
});
