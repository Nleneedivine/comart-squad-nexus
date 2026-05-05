import { createFileRoute } from "@tanstack/react-router";
import Placeholder from "@/components/Placeholder";

export const Route = createFileRoute("/webhooks")({
  head: () => ({ meta: [{ title: "Webhooks — Comart+" }, { name: "description", content: "Configure outbound webhooks." }] }),
  component: () => <Placeholder title="Webhooks" description="Configure outbound webhooks." />,
});
