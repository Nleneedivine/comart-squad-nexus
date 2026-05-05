import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

// Friendly /order/:formId URL — looks up the slug and redirects to /f/:slug
export const Route = createFileRoute("/order/$formId")({
  beforeLoad: async ({ params }) => {
    const { data } = await supabase.from("sales_forms").select("slug").eq("id", params.formId).eq("status", "active").maybeSingle();
    if (data?.slug) throw redirect({ to: "/f/$slug", params: { slug: data.slug } });
    throw redirect({ to: "/" });
  },
});
