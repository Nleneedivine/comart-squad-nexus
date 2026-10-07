import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

// Friendly /order/:formId URL — looks up the slug and redirects to /f/:slug
export const Route = createFileRoute("/order/$formId")({
  beforeLoad: async ({ params }) => {
    const { data: raw } = await supabase.rpc("get_public_sales_form", { _key: params.formId }); const data = (raw as any)?.form ?? null;
    if (data?.slug) throw redirect({ to: "/f/$slug", params: { slug: data.slug } });
    throw redirect({ to: "/" });
  },
});
