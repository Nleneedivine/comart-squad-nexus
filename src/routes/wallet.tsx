import { createFileRoute } from "@tanstack/react-router";
import Placeholder from "@/components/Placeholder";

export const Route = createFileRoute("/wallet")({
  head: () => ({ meta: [{ title: "Wallet — Comart+" }, { name: "description", content: "Track your store wallet balance in ₦." }] }),
  component: () => <Placeholder title="Wallet" description="Track your store wallet balance in ₦." />,
});
