import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/store/orders")({
  beforeLoad: () => { throw redirect({ to: "/StoreManagement" }); },
});
