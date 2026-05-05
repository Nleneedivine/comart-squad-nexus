import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useTheme() {
  const { user } = useAuth();
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("theme") === "dark";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    if (typeof window !== "undefined") localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("theme_preference").eq("id", user.id).maybeSingle();
      if (data?.theme_preference) setDark(data.theme_preference === "dark");
    })();
  }, [user]);

  const toggle = async () => {
    const next = !dark;
    setDark(next);
    if (user) await supabase.from("profiles").update({ theme_preference: next ? "dark" : "light" }).eq("id", user.id);
  };
  return { dark, toggle };
}
