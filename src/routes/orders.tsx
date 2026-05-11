import { createFileRoute, Outlet } from "@tanstack/react-router";
import ProtectedShell from "@/components/ProtectedShell";

export const Route = createFileRoute("/orders")({
  head: () => ({ meta: [{ title: "Orders — Comart+" }, { name: "description", content: "Create and manage customer orders." }] }),
  component: () => <ProtectedShell><Outlet /></ProtectedShell>,
});
