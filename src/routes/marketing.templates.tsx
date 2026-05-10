import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/marketing/templates")({
  head: () => ({ meta: [{ title: "Message Templates — Comart+" }, { name: "description", content: "Reusable WhatsApp, email and SMS templates with placeholders." }] }),
  component: () => <ProtectedShell><Templates /></ProtectedShell>,
});

const PLACEHOLDERS = ["{customer_name}", "{order_number}", "{amount}", "{store_name}", "{status}"];

function Templates() {
  const { store, user } = useAuth();
  const [list, setList] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState("whatsapp");
  const [body, setBody] = useState("");

  const load = async () => {
    if (!store) return;
    const { data } = await supabase.from("message_templates").select("*").eq("store_id", store.id).order("created_at", { ascending: false });
    setList(data || []);
  };
  useEffect(() => { load(); }, [store]);

  const create = async () => {
    if (!store || !user) return;
    if (!name.trim() || !body.trim()) return toast.error("Name and body required");
    const { error } = await supabase.from("message_templates").insert({ store_id: store.id, name, channel, body, created_by: user.id });
    if (error) return toast.error(error.message);
    toast.success("Template created"); setOpen(false); setName(""); setBody(""); setChannel("whatsapp"); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete template?")) return;
    const { error } = await supabase.from("message_templates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted"); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Message Templates</h1>
          <p className="text-sm text-muted-foreground">Reusable WhatsApp, email and SMS messages with placeholders.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New Template</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Template</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Order confirmation" /></div>
              <div>
                <Label>Channel</Label>
                <Select value={channel} onValueChange={setChannel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Body *</Label>
                <Textarea rows={6} value={body} onChange={e => setBody(e.target.value)} placeholder="Hi {customer_name}, your order {order_number} for {amount} is confirmed." />
                <div className="flex flex-wrap gap-1 mt-2">
                  {PLACEHOLDERS.map(p => (
                    <Badge key={p} variant="outline" className="cursor-pointer" onClick={() => setBody(b => b + " " + p)}>{p}</Badge>
                  ))}
                </div>
              </div>
              <Button onClick={create} className="w-full">Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {list.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground col-span-full">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            No templates yet. Create one to send quick messages from orders.
          </Card>
        ) : list.map(t => (
          <Card key={t.id} className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium">{t.name}</div>
                <Badge variant="outline" className="mt-1 text-xs">{t.channel}</Badge>
              </div>
              <Button variant="ghost" size="icon" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{t.body}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
