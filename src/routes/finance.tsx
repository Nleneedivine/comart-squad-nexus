import { createFileRoute } from "@tanstack/react-router";
import Placeholder from "@/components/Placeholder";

export const Route = createFileRoute("/finance")({
  head: () => ({ meta: [{ title: "Finance — Comart+" }, { name: "description", content: "Track income and expenses in ₦." }] }),
  component: () => <Placeholder title="Finance" description="Track income and expenses in ₦." />,
});
