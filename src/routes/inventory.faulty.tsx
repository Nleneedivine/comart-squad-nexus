import { createFileRoute } from "@tanstack/react-router";
import Placeholder from "@/components/Placeholder";

export const Route = createFileRoute("/inventory/faulty")({
  head: () => ({ meta: [{ title: "Faulty Stocks — Comart+" }, { name: "description", content: "Track damaged or faulty inventory." }] }),
  component: () => <Placeholder title="Faulty Stocks" description="Track damaged or faulty inventory." />,
});
