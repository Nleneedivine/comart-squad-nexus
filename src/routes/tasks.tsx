import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, Clock, Plus } from "lucide-react";

export const Route = createFileRoute("/tasks")({
  head: () => ({ meta: [{ title: "Tasks — Comart+" }, { name: "description", content: "Assign and track tasks for your store team." }] }),
  component: () => <ProtectedShell><Tasks /></ProtectedShell>,
});

const PRIORITY = ["low", "medium", "high"] as const;
const STATUS = ["pending", "in_progress", "done"] as const;

function Tasks() {
  const { store, user, roles } = useAuth();
  const isAdmin = roles.some(r => ["owner","admin","manager","head_of_operations"].includes(r));
  const [mine, setMine] = useState<any[]>([]);
  const [all, setAll] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", assigned_to: "", priority: "medium", deadline: "" });

  const load = async () => {
    if (!store || !user) return;
    const [{ data: m }, { data: a }, { data: mem }] = await Promise.all([
      supabase.from("tasks").select("*").eq("store_id", store.id).eq("assigned_to", user.id).order("created_at", { ascending: false }),
      isAdmin ? supabase.from("tasks").select("*").eq("store_id", store.id).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as any[] }),
      supabase.from("user_roles").select("user_id, profiles(full_name,email)").eq("store_id", store.id).eq("is_suspended", false),
    ]);
    setMine(m || []);
    const seen = new Set<string>();
    const memList = (mem || []).filter((r: any) => { if (seen.has(r.user_id)) return false; seen.add(r.user_id); return true; });
    setMembers(memList);
    const profMap: Record<string, any> = {};
    memList.forEach((r: any) => { profMap[r.user_id] = r.profiles; });
    setAll((a || []).map((t: any) => ({ ...t, profiles: t.assigned_to ? profMap[t.assigned_to] : null })));
  };
  useEffect(() => { load(); }, [store, user, isAdmin]);

  const create = async () => {
    if (!store || !user || !form.title.trim()) { toast.error("Title required"); return; }
    const { error } = await supabase.from("tasks").insert({
      store_id: store.id, assigned_by: user.id,
      assigned_to: form.assigned_to || null,
      title: form.title.trim(), description: form.description || null,
      priority: form.priority, deadline: form.deadline || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Task created"); setOpen(false);
    setForm({ title: "", description: "", assigned_to: "", priority: "medium", deadline: "" });
    load();
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const TaskCard = ({ t, showAssignee }: { t: any; showAssignee?: boolean }) => (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium truncate">{t.title}</div>
          {t.description && <div className="text-xs text-muted-foreground line-clamp-2">{t.description}</div>}
          {showAssignee && <div className="text-xs text-muted-foreground mt-1">Assigned to: {t.profiles?.full_name || t.profiles?.email || "—"}</div>}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant={t.priority === "high" ? "destructive" : t.priority === "low" ? "outline" : "secondary"}>{t.priority}</Badge>
          {t.deadline && <span className="text-xs text-muted-foreground">{new Date(t.deadline).toLocaleDateString()}</span>}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Badge variant={t.status === "done" ? "default" : "secondary"}>{t.status}</Badge>
        {t.assigned_to === user?.id && t.status !== "done" && (
          <div className="flex gap-1">
            {t.status === "pending" && <Button size="sm" variant="outline" onClick={() => updateStatus(t.id, "in_progress")}><Clock className="h-3 w-3 mr-1" />Start</Button>}
            <Button size="sm" onClick={() => updateStatus(t.id, "done")}><CheckCircle2 className="h-3 w-3 mr-1" />Done</Button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="text-sm text-muted-foreground">Personal and team task management.</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Assign Task</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Assign a new task</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Title</Label><Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} /></div>
                <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Assign to</Label>
                    <Select value={form.assigned_to} onValueChange={v => setForm({...form, assigned_to: v})}>
                      <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                      <SelectContent>{members.map((m: any) => <SelectItem key={m.user_id} value={m.user_id}>{m.profiles?.full_name || m.profiles?.email}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Priority</Label>
                    <Select value={form.priority} onValueChange={v => setForm({...form, priority: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{PRIORITY.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Deadline</Label><Input type="date" value={form.deadline} onChange={e => setForm({...form, deadline: e.target.value})} /></div>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={create}>Create</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">My Tasks ({mine.length})</TabsTrigger>
          {isAdmin && <TabsTrigger value="all">All Tasks ({all.length})</TabsTrigger>}
        </TabsList>
        <TabsContent value="mine">
          <Card className="p-4 space-y-3">
            {mine.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No tasks assigned to you.</p>
              : mine.map(t => <TaskCard key={t.id} t={t} />)}
          </Card>
        </TabsContent>
        {isAdmin && (
          <TabsContent value="all">
            <Card className="p-4 space-y-3">
              {all.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No tasks yet.</p>
                : all.map(t => <TaskCard key={t.id} t={t} showAssignee />)}
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
