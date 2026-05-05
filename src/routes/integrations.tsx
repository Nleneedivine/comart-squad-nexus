import { createFileRoute } from "@tanstack/react-router";
import Placeholder from "@/components/Placeholder";

export const Route = createFileRoute("/integrations")({
  head: () => ({ meta: [{ title: "Integrations — Comart+" }, { name: "description", content: "Connect Comart+ to other tools." }] }),
  component: () => <Placeholder title="Integrations" description="Connect Comart+ to other tools." />,
});
