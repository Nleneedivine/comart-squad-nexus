import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Zap, Target, ListChecks, ClipboardList, Sparkles } from "lucide-react";
import { suggestTodos } from "@/lib/suggest-todos.functions";

export const Route = createFileRoute("/productivity")({
  head: () => ({ meta: [{ title: "Productivity — Comart+" }, { name: "description", content: "Todos, tasks, and goals to keep your team productive." }] }),
  component: () => <ProtectedShell><Productivity /></ProtectedShell>,
});

function Productivity() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Zap className="h-6 w-6 text-primary" />Productivity Tools</h1>
        <p className="text-muted-foreground text-sm mt-1">Stay on top of todos, assigned tasks and business goals.</p>
      </div>
      <Tabs defaultValue="todos">
        <TabsList>
          <TabsTrigger value="todos"><ListChecks className="h-4 w-4 mr-2" />Todos</TabsTrigger>
          <TabsTrigger value="tasks"><ClipboardList className="h-4 w-4 mr-2" />Tasks</TabsTrigger>
          <TabsTrigger value="goals"><Target className="h-4 w-4 mr-2" />Goals</TabsTrigger>
        </TabsList>
        <TabsContent value="todos" className="mt-6"><Todos /></TabsContent>
        <TabsContent value="tasks" className="mt-6"><Tasks /></TabsContent>
        <TabsContent value="goals" className="mt-6"><Goals /></TabsContent>
      </Tabs>
    </div>
  );
}

const PRIORITY_COLOR: Record<string, string> = { low: "bg-blue-500/10 text-blue-600", medium: "bg-amber-500/10 text-amber-600", high: "bg-red-500/10 text-red-600" };

function Todos() {
  const { store, user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ title: "", description: "", priority: "medium", due_date: "" });

  const load = async () => {
    if (!store || !user) return;
    const { data } = await supabase.from("todos").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setRows(data || []);
  };
  useEffect(() => { load(); }, [store, user]);

  const save = async () => {
    if (!store || !user || !form.title) return toast.error("Title required");
    const { error } = await supabase.from("todos").insert({ ...form, due_date: form.due_date || null, store_id: store.id, user_id: user.id });
    if (error) return toast.error(error.message);
    toast.success("Todo added");
    setOpen(false);
    setForm({ title: "", description: "", priority: "medium", due_date: "" });
    load();
  };
  const toggle = async (t: any) => {
    await supabase.from("todos").update({ completed: !t.completed }).eq("id", t.id);
    load();
  };
  const remove = async (id: string) => {
    await supabase.from("todos").delete().eq("id", id); load();
  };

  const suggestFn = useServerFn(suggestTodos);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const [suggesting, setSuggesting] = useState(false);

  const runSuggest = async () => {
    setSuggesting(true);
    try {
      const r = await suggestFn();
      setSuggestions(r.items || []);
      const sel: Record<number, boolean> = {};
      (r.items || []).forEach((_: any, i: number) => { sel[i] = true; });
      setPicked(sel);
      setSuggestOpen(true);
    } catch (e: any) { toast.error(e.message || "AI suggestion failed"); }
    finally { setSuggesting(false); }
  };

  const insertPicked = async () => {
    if (!store || !user) return;
    const chosen = suggestions.filter((_, i) => picked[i]);
    if (!chosen.length) return setSuggestOpen(false);
    const rows = chosen.map(s => ({
      store_id: store.id, user_id: user.id,
      title: s.title, priority: s.priority || "medium",
      description: s.rationale || s.time_of_day ? `${s.time_of_day || ""}${s.rationale ? " · " + s.rationale : ""}` : null,
    }));
    const { error } = await supabase.from("todos").insert(rows);
    if (error) return toast.error(error.message);
    toast.success(`Added ${rows.length} to-do(s)`);
    setSuggestOpen(false);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold">My Todos</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={runSuggest} disabled={suggesting}>
            <Sparkles className="h-4 w-4 mr-2" />{suggesting ? "Thinking…" : "Suggest my day"}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add Todo</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Todo</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
                <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Priority</Label>
                    <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div><Label>Due Date</Label><Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
                </div>
                <Button onClick={save} className="w-full">Save Todo</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Dialog open={suggestOpen} onOpenChange={setSuggestOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>AI suggestions for today</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {suggestions.length === 0 && <p className="text-sm text-muted-foreground">No suggestions returned.</p>}
            {suggestions.map((s, i) => (
              <label key={i} className="flex items-start gap-3 p-3 rounded-md border hover:bg-muted cursor-pointer">
                <Checkbox checked={!!picked[i]} onCheckedChange={(v) => setPicked({ ...picked, [i]: !!v })} className="mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium text-sm">{s.title}</div>
                  <div className="flex gap-2 mt-1 text-xs">
                    <Badge className={PRIORITY_COLOR[s.priority] || ""} variant="secondary">{s.priority || "medium"}</Badge>
                    {s.time_of_day && <span className="text-muted-foreground capitalize">{s.time_of_day}</span>}
                  </div>
                  {s.rationale && <div className="text-xs text-muted-foreground mt-1">{s.rationale}</div>}
                </div>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setSuggestOpen(false)}>Dismiss</Button>
            <Button className="flex-1" onClick={insertPicked}>Add selected</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid gap-2">
        {rows.map(t => (
          <Card key={t.id} className="p-4 flex items-start gap-3">
            <Checkbox checked={t.completed} onCheckedChange={() => toggle(t)} className="mt-1" />
            <div className="flex-1 min-w-0">
              <div className={`font-medium ${t.completed && "line-through text-muted-foreground"}`}>{t.title}</div>
              {t.description && <div className="text-sm text-muted-foreground mt-0.5">{t.description}</div>}
              <div className="flex gap-2 mt-2 text-xs">
                <Badge className={PRIORITY_COLOR[t.priority]} variant="secondary">{t.priority}</Badge>
                {t.due_date && <span className="text-muted-foreground">Due {new Date(t.due_date).toLocaleDateString()}</span>}
              </div>
            </div>
            <Button size="icon" variant="ghost" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </Card>
        ))}
        {rows.length === 0 && <Card className="p-12 text-center text-muted-foreground">No todos yet. Add your first one.</Card>}
      </div>
    </div>
  );
}

function Tasks() {
  const { store, user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ title: "", description: "", assigned_to: "", deadline: "", priority: "medium" });

  const load = async () => {
    if (!store) return;
    const { data } = await supabase.from("tasks").select("*").eq("store_id", store.id).order("created_at", { ascending: false });
    setRows(data || []);
  };
  const loadStaff = async () => {
    if (!store) return;
    const { data } = await supabase.from("user_roles").select("user_id,profiles!inner(full_name,email)").eq("store_id", store.id);
    setStaff(data || []);
  };
  useEffect(() => { load(); loadStaff(); }, [store]);

  const save = async () => {
    if (!store || !user || !form.title || !form.assigned_to) return toast.error("Title and assignee required");
    const { error } = await supabase.from("tasks").insert({ ...form, deadline: form.deadline || null, store_id: store.id, assigned_by: user.id });
    if (error) return toast.error(error.message);
    toast.success("Task created"); setOpen(false);
    setForm({ title: "", description: "", assigned_to: "", deadline: "", priority: "medium" });
    load();
  };
  const setStatus = async (t: any, status: string) => {
    await supabase.from("tasks").update({ status }).eq("id", t.id); load();
  };

  const nameOf = (uid: string) => staff.find((s: any) => s.user_id === uid)?.profiles?.full_name || "—";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Team Tasks</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Assign Task</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div><Label>Assign To *</Label>
                <Select value={form.assigned_to} onValueChange={v => setForm({ ...form, assigned_to: v })}>
                  <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                  <SelectContent>{staff.map((s: any) => <SelectItem key={s.user_id} value={s.user_id}>{s.profiles?.full_name || s.profiles?.email}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Priority</Label>
                  <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label>Deadline</Label><Input type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} /></div>
              </div>
              <Button onClick={save} className="w-full">Create Task</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <div className="grid gap-2">
        {rows.map(t => (
          <Card key={t.id} className="p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="font-medium">{t.title}</div>
                {t.description && <div className="text-sm text-muted-foreground mt-0.5">{t.description}</div>}
                <div className="flex flex-wrap gap-2 mt-2 text-xs items-center">
                  <Badge variant="secondary">Assigned to: {nameOf(t.assigned_to)}</Badge>
                  <Badge className={PRIORITY_COLOR[t.priority]} variant="secondary">{t.priority}</Badge>
                  {t.deadline && <span className="text-muted-foreground">Due {new Date(t.deadline).toLocaleDateString()}</span>}
                </div>
              </div>
              <Select value={t.status} onValueChange={(v) => setStatus(t, v)}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Card>
        ))}
        {rows.length === 0 && <Card className="p-12 text-center text-muted-foreground">No tasks assigned yet.</Card>}
      </div>
    </div>
  );
}

function Goals() {
  const { store, user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ title: "", description: "", target_value: "", current_value: "0", unit: "", deadline: "" });

  const load = async () => {
    if (!store) return;
    const { data } = await supabase.from("goals").select("*").eq("store_id", store.id).order("created_at", { ascending: false });
    setRows(data || []);
  };
  useEffect(() => { load(); }, [store]);

  const save = async () => {
    if (!store || !user || !form.title || !form.target_value) return toast.error("Title and target required");
    const { error } = await supabase.from("goals").insert({
      ...form, target_value: Number(form.target_value), current_value: Number(form.current_value || 0),
      deadline: form.deadline || null, store_id: store.id, created_by: user.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Goal created"); setOpen(false);
    setForm({ title: "", description: "", target_value: "", current_value: "0", unit: "", deadline: "" });
    load();
  };
  const updateCurrent = async (g: any, v: string) => {
    await supabase.from("goals").update({ current_value: Number(v) }).eq("id", g.id); load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Business Goals</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New Goal</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Goal</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Target *</Label><Input type="number" value={form.target_value} onChange={e => setForm({ ...form, target_value: e.target.value })} /></div>
                <div><Label>Unit</Label><Input placeholder="₦, orders, units" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} /></div>
              </div>
              <div><Label>Deadline</Label><Input type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} /></div>
              <Button onClick={save} className="w-full">Create Goal</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map(g => {
          const pct = g.target_value > 0 ? Math.min(100, (g.current_value / g.target_value) * 100) : 0;
          return (
            <Card key={g.id} className="p-5 space-y-3">
              <div>
                <div className="font-semibold">{g.title}</div>
                {g.description && <div className="text-sm text-muted-foreground">{g.description}</div>}
              </div>
              <Progress value={pct} />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{g.current_value} / {g.target_value} {g.unit}</span>
                <span className="font-medium text-primary">{pct.toFixed(0)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <Input type="number" defaultValue={g.current_value} className="h-8" onBlur={e => updateCurrent(g, e.target.value)} />
                {g.deadline && <span className="text-xs text-muted-foreground whitespace-nowrap">By {new Date(g.deadline).toLocaleDateString()}</span>}
              </div>
            </Card>
          );
        })}
        {rows.length === 0 && <Card className="p-12 text-center text-muted-foreground md:col-span-2">No goals yet. Set your first business goal.</Card>}
      </div>
    </div>
  );
}
