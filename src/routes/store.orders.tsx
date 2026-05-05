import { createFileRoute } from "@tanstack/react-router";
import Placeholder from "@/components/Placeholder";

export const Route = createFileRoute("/store/orders")({
  head: () => ({ meta: [{ title: "Store Orders — Comart+" }, { name: "description", content: "Orders received in your store." }] }),
  component: () => <Placeholder title="Store Orders" description="Orders received in your store." />,
});
