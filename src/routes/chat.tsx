import { createFileRoute } from "@tanstack/react-router";
import Placeholder from "@/components/Placeholder";

export const Route = createFileRoute("/chat")({
  head: () => ({ meta: [{ title: "Chat Room — Comart+" }, { name: "description", content: "Internal chat for your team." }] }),
  component: () => <Placeholder title="Chat Room" description="Internal chat for your team." />,
});
