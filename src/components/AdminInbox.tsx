// Inbox tile for store admins/owners — shows messages received from the Super Admin.
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Inbox, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";

type AdminMessage = {
  id: string; subject: string | null; body: string; from_superadmin: boolean;
  read_at: string | null; created_at: string; sender_id: string | null; store_id: string | null; parent_id: string | null;
};

export default function AdminInbox() {
  const { user, store } = useAuth();
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [active, setActive] = useState<AdminMessage | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("admin_messages")
      .select("*").eq("recipient_user_id", user.id)
      .order("created_at", { ascending: false }).limit(20);
    setMessages(data || []);
  };

  useEffect(() => { load(); }, [user]);

  const open = async (m: AdminMessage) => {
    setActive(m);
    if (!m.read_at) {
      await supabase.rpc("mark_admin_message_read", { _id: m.id });
      load();
    }
  };

  const sendReply = async () => {
    if (!reply.trim() || !active || !user) return;
    setSending(true);
    // Find original sender (the superadmin) — reply goes back to them
    const recipient = active.sender_id;
    if (!recipient) { toast.error("Cannot reply — no sender"); setSending(false); return; }
    const { error } = await supabase.from("admin_messages").insert({
      store_id: active.store_id, sender_id: user.id, recipient_user_id: recipient,
      subject: active.subject ? `Re: ${active.subject}` : null,
      body: reply.trim(), parent_id: active.id, from_superadmin: false,
    });
    setSending(false);
    if (error) return toast.error(error.message);
    toast.success("Reply sent");
    setReply("");
    setActive(null);
    load();
  };

  const unread = messages.filter(m => !m.read_at).length;
  if (messages.length === 0) return null;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Messages from Platform</h3>
        </div>
        {unread > 0 && <Badge variant="default">{unread} new</Badge>}
      </div>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {messages.map(m => (
          <button key={m.id} onClick={() => open(m)}
            className={`w-full text-left p-2 rounded-md hover:bg-accent border ${!m.read_at ? "border-primary/40 bg-primary/5" : "border-transparent"}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium truncate">{m.subject || "Platform message"}</div>
              <div className="text-xs text-muted-foreground whitespace-nowrap">{new Date(m.created_at).toLocaleDateString()}</div>
            </div>
            <div className="text-xs text-muted-foreground line-clamp-2 mt-1">{m.body}</div>
          </button>
        ))}
      </div>
      {active && (
        <div className="mt-3 border-t pt-3 space-y-2">
          <div className="text-xs font-semibold flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {active.subject || "Message"}</div>
          <div className="text-sm whitespace-pre-wrap bg-muted/30 rounded p-2">{active.body}</div>
          <Textarea value={reply} onChange={e => setReply(e.target.value)} placeholder="Reply…" rows={2} />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setActive(null); setReply(""); }}>Close</Button>
            <Button size="sm" onClick={sendReply} disabled={sending || !reply.trim()}>
              <Send className="h-3 w-3 mr-1" /> Send Reply
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
