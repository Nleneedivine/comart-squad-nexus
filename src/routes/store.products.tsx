import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/store/products")({
  beforeLoad: () => { throw redirect({ to: "/StoreManagement" }); },
});
