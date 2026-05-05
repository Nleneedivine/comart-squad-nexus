import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Send, Search, Crown, Users, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/chat")({
  head: () => ({ meta: [{ title: "Chat Room — Comart+" }, { name: "description", content: "Internal real-time chat for your team." }] }),
  component: () => <ProtectedShell><Chat /></ProtectedShell>,
});

function Chat() {
  const { store, user } = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [owner, setOwner] = useState<any>(null);
  const [active, setActive] = useState<{ kind: "channel" | "dm"; id: string; name: string } | null>({ kind: "channel", id: "general", name: "General" });
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load members + owner
  useEffect(() => {
    if (!store) return;
    (async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id,role,profiles!inner(id,full_name,email,avatar_url)").eq("store_id", store.id);
      const seen = new Set();
      const list = (roles || []).filter((r: any) => !seen.has(r.user_id) && seen.add(r.user_id));
      setMembers(list);
      const own = list.find((r: any) => r.role === "owner");
      setOwner(own);
    })();
  }, [store]);

  // Load messages for active conversation
  const loadMessages = async () => {
    if (!store || !active || !user) return;
    let q = supabase.from("chat_messages").select("*").eq("store_id", store.id).order("created_at", { ascending: true }).limit(200);
    if (active.kind === "channel") {
      q = q.eq("channel", active.id).is("recipient_id", null);
    } else {
      q = q.or(`and(sender_id.eq.${user.id},recipient_id.eq.${active.id}),and(sender_id.eq.${active.id},recipient_id.eq.${user.id})`);
    }
    const { data } = await q;
    setMessages(data || []);
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);

    // Mark as read
    if (active.kind === "dm") {
      await supabase.from("chat_messages").update({ read_at: new Date().toISOString() }).eq("recipient_id", user.id).eq("sender_id", active.id).is("read_at", null);
    }
  };
  useEffect(() => { loadMessages(); }, [store, active, user]);

  // Realtime
  useEffect(() => {
    if (!store) return;
    const ch = supabase.channel("chat-" + store.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `store_id=eq.${store.id}` }, () => loadMessages())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [store, active, user]);

  const send = async () => {
    if (!store || !user || !active || !text.trim()) return;
    const payload: any = { store_id: store.id, sender_id: user.id, body: text.trim() };
    if (active.kind === "channel") { payload.channel = active.id; payload.recipient_id = null; }
    else { payload.recipient_id = active.id; payload.channel = "dm"; }
    setText("");
    await supabase.from("chat_messages").insert(payload);
  };

  const filteredMembers = useMemo(() =>
    members.filter((m: any) => m.user_id !== user?.id && (m.profiles?.full_name || m.profiles?.email || "").toLowerCase().includes(search.toLowerCase())),
    [members, user, search]);

  const isOwner = user?.id === owner?.user_id;
  const nameOf = (uid: string) => members.find((m: any) => m.user_id === uid)?.profiles?.full_name || members.find((m: any) => m.user_id === uid)?.profiles?.email || "User";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><MessageSquare className="h-6 w-6 text-primary" />Chat Room</h1>
        <p className="text-muted-foreground text-sm mt-1">Real-time messaging with your team.</p>
      </div>
      <Card className="grid grid-cols-12 h-[640px] overflow-hidden">
        {/* Sidebar */}
        <div className="col-span-4 border-r flex flex-col">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9 h-9" placeholder="Search contacts" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {!isOwner && owner && (
              <Button className="w-full mt-3" size="sm" onClick={() => setActive({ kind: "dm", id: owner.user_id, name: nameOf(owner.user_id) })}>
                <Crown className="h-3.5 w-3.5 mr-2" />Message Store Owner
              </Button>
            )}
          </div>
          <Tabs defaultValue="messages" className="flex-1 flex flex-col">
            <TabsList className="mx-3 mt-3 grid grid-cols-2">
              <TabsTrigger value="messages">Messages</TabsTrigger>
              <TabsTrigger value="groups">Groups</TabsTrigger>
            </TabsList>
            <TabsContent value="messages" className="flex-1 overflow-y-auto m-0 p-2">
              <div className="text-xs uppercase text-muted-foreground px-2 py-1.5 font-semibold">Direct Messages</div>
              {filteredMembers.map((m: any) => (
                <button key={m.user_id} onClick={() => setActive({ kind: "dm", id: m.user_id, name: nameOf(m.user_id) })}
                  className={cn("w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted text-left", active?.kind === "dm" && active.id === m.user_id && "bg-muted")}>
                  <div className="h-8 w-8 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center">
                    {(m.profiles?.full_name || m.profiles?.email || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate flex items-center gap-1">
                      {m.profiles?.full_name || m.profiles?.email}
                      {m.user_id === owner?.user_id && <Crown className="h-3 w-3 text-amber-500" />}
                    </div>
                    <div className="text-xs text-muted-foreground capitalize">{m.role}</div>
                  </div>
                </button>
              ))}
            </TabsContent>
            <TabsContent value="groups" className="flex-1 overflow-y-auto m-0 p-2">
              <button onClick={() => setActive({ kind: "channel", id: "general", name: "General" })}
                className={cn("w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted text-left", active?.kind === "channel" && active.id === "general" && "bg-muted")}>
                <div className="h-8 w-8 rounded-full bg-primary/15 text-primary flex items-center justify-center"><Users className="h-4 w-4" /></div>
                <div><div className="text-sm font-medium">General</div><div className="text-xs text-muted-foreground">All staff</div></div>
              </button>
            </TabsContent>
          </Tabs>
        </div>

        {/* Conversation */}
        <div className="col-span-8 flex flex-col">
          <div className="h-14 border-b px-4 flex items-center font-semibold">{active?.name || "Select a conversation"}</div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
            {messages.map(m => {
              const mine = m.sender_id === user?.id;
              return (
                <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[70%] rounded-2xl px-4 py-2", mine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-card border rounded-bl-sm")}>
                    {!mine && <div className="text-[10px] font-semibold text-primary mb-0.5">{nameOf(m.sender_id)}</div>}
                    <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>
                    <div className={cn("text-[10px] mt-1 flex items-center gap-1", mine ? "text-primary-foreground/70 justify-end" : "text-muted-foreground")}>
                      {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      {mine && active?.kind === "dm" && <span>{m.read_at ? "✓✓" : "✓"}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
            {messages.length === 0 && <div className="text-center text-sm text-muted-foreground py-12">No messages yet. Say hi!</div>}
          </div>
          <div className="p-3 border-t flex gap-2">
            <Input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Type a message..." disabled={!active} />
            <Button onClick={send} disabled={!active || !text.trim()}><Send className="h-4 w-4" /></Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
