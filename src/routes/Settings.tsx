import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, isAfter } from "date-fns";

export const Route = createFileRoute("/Settings")({
  head: () => ({ meta: [{ title: "Settings — Comart+" }, { name: "description", content: "Manage your Comart+ profile and account settings." }] }),
  component: () => <ProtectedShell><SettingsPage /></ProtectedShell>,
});

function SettingsPage() {
  const { user, refresh } = useAuth();
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }) => setProfile(data));
  }, [user]);

  const lockedUntil = profile?.avatar_locked_until ? new Date(profile.avatar_locked_until) : null;
  const isLocked = lockedUntil && isAfter(lockedUntil, new Date());

  const save = async () => {
    if (!user || !profile) return;
    const { error } = await supabase.from("profiles").update({
      full_name: profile.full_name, phone: profile.phone, community_name: profile.community_name,
    }).eq("id", user.id);
    if (error) return toast.error(error.message);
    toast.success("Profile updated"); refresh();
  };

  const onAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user || !profile) return;
    if (isLocked) { toast.error(`Profile picture locked until ${format(lockedUntil!, "PP")}`); return; }
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Image must be under 5MB");
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/avatar_${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, cacheControl: "3600" });
    if (upErr) return toast.error(upErr.message);
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    const lock = new Date(); lock.setDate(lock.getDate() + 30);
    const { error } = await supabase.from("profiles").update({ avatar_url: pub.publicUrl, avatar_locked_until: lock.toISOString() }).eq("id", user.id);
    if (error) return toast.error(error.message);
    setProfile({ ...profile, avatar_url: pub.publicUrl, avatar_locked_until: lock.toISOString() });
    toast.success("Avatar updated. Locked for 30 days.");
  };

  if (!profile) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile and account preferences.</p>
      </div>
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">My Profile</TabsTrigger>
          <TabsTrigger value="general">General Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <Card className="p-6 space-y-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20"><AvatarImage src={profile.avatar_url || undefined} /><AvatarFallback>{(profile.full_name || "U")[0]}</AvatarFallback></Avatar>
              <div>
                <Label htmlFor="avatar" className="cursor-pointer text-primary text-sm font-medium">Upload new avatar</Label>
                <Input id="avatar" type="file" accept="image/*" onChange={onAvatar} className="hidden" />
                <p className="text-xs text-muted-foreground mt-1">
                  ⚠️ Profile pictures are locked for 30 days after upload.
                  {isLocked && <> Locked until <strong>{format(lockedUntil!, "PP")}</strong>.</>}
                </p>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Full name</Label><Input value={profile.full_name || ""} onChange={e => setProfile({ ...profile, full_name: e.target.value })} /></div>
              <div className="space-y-2"><Label>Email</Label><Input value={profile.email || ""} disabled /></div>
              <div className="space-y-2"><Label>Phone</Label><Input value={profile.phone || ""} onChange={e => setProfile({ ...profile, phone: e.target.value })} placeholder="+234..." /></div>
              <div className="space-y-2"><Label>Community display name</Label><Input value={profile.community_name || ""} onChange={e => setProfile({ ...profile, community_name: e.target.value })} /></div>
            </div>
            <Button onClick={save}>Save changes</Button>
          </Card>
        </TabsContent>
        <TabsContent value="general">
          <Card className="p-6 text-sm text-muted-foreground">General settings will appear here.</Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
