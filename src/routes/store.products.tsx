import { createFileRoute } from "@tanstack/react-router";
import Placeholder from "@/components/Placeholder";

export const Route = createFileRoute("/store/products")({
  head: () => ({ meta: [{ title: "Products — Comart+" }, { name: "description", content: "Manage products in your store." }] }),
  component: () => <Placeholder title="Products" description="Manage products in your store." />,
});
