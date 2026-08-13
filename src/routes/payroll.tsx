import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatNaira } from "@/lib/format";
import { downloadCSV } from "@/lib/export";
import { toast } from "sonner";
import { useRowSelection, SelectAllHead, SelectCell, DeleteRowButton, BulkDeleteBar, deleteRows } from "@/components/BulkDelete";
import {
  Banknote, Plus, Play, CheckCircle2, FileSpreadsheet, Users as UsersIcon,
  Calendar, Edit2, Printer,
} from "lucide-react";

export const Route = createFileRoute("/payroll")({
  head: () => ({ meta: [{ title: "Payroll — Comart+" }, { name: "description", content: "Run payroll: periods, payslips, approvals." }] }),
  component: () => <ProtectedShell><Payroll /></ProtectedShell>,
});

const STATUS_TONES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  processing: "bg-amber-500/15 text-amber-500",
  approved: "bg-blue-500/15 text-blue-500",
  paid: "bg-emerald-500/15 text-emerald-500",
};

function Payroll() {
  const { store, user, roles } = useAuth();
  const isAdmin = roles.some(r => ["owner","admin","manager","head_of_operations","accountant"].includes(r));
  const [periods, setPeriods] = useState<any[]>([]);
  const [salaries, setSalaries] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [activePeriod, setActivePeriod] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [salOpen, setSalOpen] = useState(false);
  const [editSalary, setEditSalary] = useState<any>(null);
  const [form, setForm] = useState({ name: "", period_start: "", period_end: "" });
  const [salForm, setSalForm] = useState<any>({ user_id: "", base_salary: "", hourly_rate: "", pay_type: "monthly", allowances: "" });
  const [editPS, setEditPS] = useState<any>(null);

  const load = async () => {
    if (!store) return;
    const [{ data: pp }, { data: sal }] = await Promise.all([
      supabase.from("payroll_periods").select("*").eq("store_id", store.id).order("period_start", { ascending: false }),
      supabase.from("staff_salaries").select("*").eq("store_id", store.id),
    ]);
    setPeriods(pp || []); setSalaries(sal || []);
    // staff list via user_roles
    const { data: ur } = await supabase.from("user_roles").select("user_id").eq("store_id", store.id);
    const ids = Array.from(new Set((ur || []).map(r => r.user_id)));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      setMembers(profs || []);
    } else { setMembers([]); }
  };

  const loadPayslips = async (periodId: string) => {
    const { data } = await supabase.from("payslips").select("*").eq("period_id", periodId).order("staff_name");
    setPayslips(data || []);
  };

  useEffect(() => { load(); }, [store]);
  const sel = useRowSelection(periods);
  useEffect(() => { if (activePeriod) loadPayslips(activePeriod.id); else setPayslips([]); }, [activePeriod]);

  const createPeriod = async () => {
    if (!store) return;
    if (!form.name || !form.period_start || !form.period_end) return toast.error("All fields required");
    const { error } = await supabase.from("payroll_periods").insert({ ...form, store_id: store.id, created_by: user?.id });
    if (error) return toast.error(error.message);
    toast.success("Period created"); setOpen(false); setForm({ name: "", period_start: "", period_end: "" }); load();
  };

  const generate = async (p: any) => {
    const { data, error } = await supabase.rpc("generate_payslips", { _period_id: p.id });
    if (error) return toast.error(error.message);
    toast.success(`Generated ${data} payslips`);
    setActivePeriod({ ...p, status: "processing" }); load();
  };

  const approve = async (p: any) => {
    const { error } = await supabase.from("payroll_periods").update({ status: "approved", approved_by: user?.id, approved_at: new Date().toISOString() }).eq("id", p.id);
    if (error) return toast.error(error.message);
    await supabase.from("payslips").update({ status: "approved" }).eq("period_id", p.id);
    toast.success("Period approved"); load(); if (activePeriod?.id === p.id) loadPayslips(p.id);
  };

  const markPaid = async (p: any) => {
    const { error } = await supabase.rpc("mark_payroll_paid", { _period_id: p.id });
    if (error) return toast.error(error.message);
    toast.success("Marked as paid · expense logged"); load(); if (activePeriod?.id === p.id) loadPayslips(p.id);
  };

  const exportCSV = (p: any) => {
    if (!payslips.length) return toast.error("Open a period first");
    downloadCSV(`payroll-${p.name}`,
      ["Staff","Base","Hours","Hourly Pay","Commission","Allowances","Bonus","Deductions","Gross","Net","Status"],
      payslips.map(ps => [ps.staff_name || "—", ps.base_salary, ps.hours_worked, ps.hourly_pay, ps.commission_amount, ps.allowances, ps.bonus, ps.deductions, ps.gross_pay, ps.net_pay, ps.status]));
  };

  const saveSalary = async () => {
    if (!store || !salForm.user_id) return toast.error("Pick staff");
    const payload: any = {
      store_id: store.id, user_id: salForm.user_id,
      base_salary: Number(salForm.base_salary || 0), hourly_rate: Number(salForm.hourly_rate || 0),
      pay_type: salForm.pay_type, allowances: Number(salForm.allowances || 0),
    };
    const existing = salaries.find(s => s.user_id === salForm.user_id);
    const { error } = existing
      ? await supabase.from("staff_salaries").update(payload).eq("id", existing.id)
      : await supabase.from("staff_salaries").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Saved"); setSalOpen(false); setEditSalary(null);
    setSalForm({ user_id: "", base_salary: "", hourly_rate: "", pay_type: "monthly", allowances: "" });
    load();
  };

  const startEditSalary = (m: any) => {
    const s = salaries.find(x => x.user_id === m.id);
    setEditSalary(m);
    setSalForm({
      user_id: m.id,
      base_salary: s?.base_salary || "", hourly_rate: s?.hourly_rate || "",
      pay_type: s?.pay_type || "monthly", allowances: s?.allowances || "",
    });
    setSalOpen(true);
  };

  const updatePayslip = async () => {
    if (!editPS) return;
    const gross = Number(editPS.base_salary||0) + Number(editPS.hourly_pay||0) + Number(editPS.commission_amount||0) + Number(editPS.allowances||0) + Number(editPS.bonus||0);
    const net = gross - Number(editPS.deductions||0);
    const { error } = await supabase.from("payslips").update({
      bonus: Number(editPS.bonus||0), deductions: Number(editPS.deductions||0),
      allowances: Number(editPS.allowances||0), notes: editPS.notes,
      gross_pay: gross, net_pay: net,
    }).eq("id", editPS.id);
    if (error) return toast.error(error.message);
    // refresh period totals
    if (activePeriod) {
      const { data: ps } = await supabase.from("payslips").select("net_pay").eq("period_id", activePeriod.id);
      const total = (ps || []).reduce((s, x) => s + Number(x.net_pay || 0), 0);
      await supabase.from("payroll_periods").update({ total_amount: total }).eq("id", activePeriod.id);
    }
    toast.success("Updated"); setEditPS(null);
    if (activePeriod) loadPayslips(activePeriod.id); load();
  };

  const printPayslip = (ps: any) => {
    const w = window.open("", "_blank", "width=600,height=800");
    if (!w) return;
    w.document.write(`<html><head><title>Payslip — ${ps.staff_name}</title>
      <style>body{font-family:system-ui,sans-serif;padding:24px;max-width:520px;margin:auto}h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}table{width:100%;border-collapse:collapse}td{padding:6px 0;font-size:13px}.right{text-align:right}.tot{font-weight:700;border-top:1px solid #000;padding-top:8px}</style></head><body>
      <h1>${store?.name || "Store"}</h1><div style="font-size:12px;color:#666">Payslip · ${activePeriod?.name || ""}</div>
      <h2>${ps.staff_name || "Staff"}</h2>
      <table>
        <tr><td>Base Salary</td><td class="right">${formatNaira(Number(ps.base_salary))}</td></tr>
        <tr><td>Hours Worked</td><td class="right">${Number(ps.hours_worked).toFixed(2)} hrs</td></tr>
        <tr><td>Hourly Pay</td><td class="right">${formatNaira(Number(ps.hourly_pay))}</td></tr>
        <tr><td>Commissions</td><td class="right">${formatNaira(Number(ps.commission_amount))}</td></tr>
        <tr><td>Allowances</td><td class="right">${formatNaira(Number(ps.allowances))}</td></tr>
        <tr><td>Bonus</td><td class="right">${formatNaira(Number(ps.bonus))}</td></tr>
        <tr><td>Deductions</td><td class="right">- ${formatNaira(Number(ps.deductions))}</td></tr>
        <tr><td class="tot">Net Pay</td><td class="right tot">${formatNaira(Number(ps.net_pay))}</td></tr>
      </table>
      <div style="margin-top:24px;font-size:11px;color:#888">Period: ${activePeriod?.period_start} → ${activePeriod?.period_end}</div>
      <script>window.print();</script></body></html>`);
    w.document.close();
  };

  const totals = useMemo(() => ({
    total: payslips.reduce((s, p) => s + Number(p.net_pay || 0), 0),
    gross: payslips.reduce((s, p) => s + Number(p.gross_pay || 0), 0),
    deductions: payslips.reduce((s, p) => s + Number(p.deductions || 0), 0),
  }), [payslips]);

  if (!isAdmin) return (
    <Card className="p-8 text-center">
      <Banknote className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
      <h2 className="font-semibold">Payroll Restricted</h2>
      <p className="text-sm text-muted-foreground">Only owners, managers and accountants can run payroll.</p>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Banknote className="h-6 w-6 text-primary" />Payroll</h1>
          <p className="text-sm text-muted-foreground">Run payroll periods, generate payslips from attendance & commissions, approve & pay.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New Period</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Payroll Period</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. May 2026" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Start</Label><Input type="date" value={form.period_start} onChange={e => setForm({ ...form, period_start: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>End</Label><Input type="date" value={form.period_end} onChange={e => setForm({ ...form, period_end: e.target.value })} /></div>
              </div>
              <Button onClick={createPeriod} className="w-full">Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="periods">
        <TabsList>
          <TabsTrigger value="periods"><Calendar className="h-3 w-3 mr-1" />Periods ({periods.length})</TabsTrigger>
          <TabsTrigger value="salaries"><UsersIcon className="h-3 w-3 mr-1" />Salary Setup ({members.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="periods" className="space-y-4">
          <Card className="p-4">
            <BulkDeleteBar table="payroll_periods" ids={sel.ids} onDone={() => { sel.clear(); load(); }} noun="periods" />
            <Table>
              <TableHeader><TableRow>
                <SelectAllHead checked={sel.allChecked} onToggle={sel.toggleAll} />
                <TableHead>Period</TableHead><TableHead>Range</TableHead><TableHead>Status</TableHead>
                <TableHead className="text-right">Staff</TableHead><TableHead className="text-right">Total</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {periods.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No payroll periods yet.</TableCell></TableRow> :
                  periods.map(p => (
                    <TableRow key={p.id}>
                      <SelectCell checked={sel.isSelected(p.id)} onToggle={() => sel.toggle(p.id)} />
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-xs">{p.period_start} → {p.period_end}</TableCell>
                      <TableCell><Badge className={STATUS_TONES[p.status]}>{p.status}</Badge></TableCell>
                      <TableCell className="text-right">{p.staff_count}</TableCell>
                      <TableCell className="text-right font-semibold">{formatNaira(Number(p.total_amount))}</TableCell>
                      <TableCell>
                        <Sheet open={activePeriod?.id === p.id} onOpenChange={(v) => setActivePeriod(v ? p : null)}>
                          <SheetTrigger asChild><Button size="sm" variant="outline">Open</Button></SheetTrigger>
                          <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
                            <SheetHeader><SheetTitle>{p.name}</SheetTitle></SheetHeader>
                            <div className="mt-4 space-y-3">
                              <div className="flex flex-wrap gap-2">
                                {p.status === "draft" && <Button size="sm" onClick={() => generate(p)}><Play className="h-3 w-3 mr-1" />Generate Payslips</Button>}
                                {p.status === "processing" && <Button size="sm" onClick={() => generate(p)} variant="outline"><Play className="h-3 w-3 mr-1" />Re-generate</Button>}
                                {p.status === "processing" && <Button size="sm" onClick={() => approve(p)}><CheckCircle2 className="h-3 w-3 mr-1" />Approve</Button>}
                                {p.status === "approved" && <Button size="sm" onClick={() => markPaid(p)}><Banknote className="h-3 w-3 mr-1" />Mark Paid</Button>}
                                <Button size="sm" variant="outline" onClick={() => exportCSV(p)}><FileSpreadsheet className="h-3 w-3 mr-1" />Export CSV</Button>
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <Card className="p-3"><div className="text-xs text-muted-foreground">Gross</div><div className="text-lg font-bold">{formatNaira(totals.gross)}</div></Card>
                                <Card className="p-3"><div className="text-xs text-muted-foreground">Deductions</div><div className="text-lg font-bold text-rose-500">{formatNaira(totals.deductions)}</div></Card>
                                <Card className="p-3"><div className="text-xs text-muted-foreground">Net</div><div className="text-lg font-bold text-emerald-500">{formatNaira(totals.total)}</div></Card>
                              </div>
                              <Card className="p-2">
                                <Table>
                                  <TableHeader><TableRow>
                                    <TableHead>Staff</TableHead><TableHead className="text-right">Hours</TableHead>
                                    <TableHead className="text-right">Comm</TableHead><TableHead className="text-right">Net</TableHead><TableHead></TableHead>
                                  </TableRow></TableHeader>
                                  <TableBody>
                                    {payslips.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-6 text-xs text-muted-foreground">No payslips. Click Generate.</TableCell></TableRow> :
                                      payslips.map(ps => (
                                        <TableRow key={ps.id}>
                                          <TableCell className="text-sm">{ps.staff_name || "—"}</TableCell>
                                          <TableCell className="text-right text-xs">{Number(ps.hours_worked).toFixed(1)}</TableCell>
                                          <TableCell className="text-right text-xs">{formatNaira(Number(ps.commission_amount))}</TableCell>
                                          <TableCell className="text-right font-semibold">{formatNaira(Number(ps.net_pay))}</TableCell>
                                          <TableCell className="flex gap-1">
                                            {p.status !== "paid" && <Button size="sm" variant="ghost" onClick={() => setEditPS({ ...ps })}><Edit2 className="h-3 w-3" /></Button>}
                                            <Button size="sm" variant="ghost" onClick={() => printPayslip(ps)}><Printer className="h-3 w-3" /></Button>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                  </TableBody>
                                </Table>
                              </Card>
                            </div>
                          </SheetContent>
                        </Sheet>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="salaries">
          <Card className="p-4">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Staff</TableHead><TableHead>Type</TableHead>
                <TableHead className="text-right">Base</TableHead><TableHead className="text-right">Hourly</TableHead>
                <TableHead className="text-right">Allowances</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {members.map(m => {
                  const s = salaries.find(x => x.user_id === m.id);
                  return (
                    <TableRow key={m.id}>
                      <TableCell><div className="font-medium">{m.full_name || "—"}</div><div className="text-xs text-muted-foreground">{m.email}</div></TableCell>
                      <TableCell className="text-xs">{s?.pay_type || "—"}</TableCell>
                      <TableCell className="text-right">{s ? formatNaira(Number(s.base_salary)) : "—"}</TableCell>
                      <TableCell className="text-right">{s ? formatNaira(Number(s.hourly_rate)) : "—"}</TableCell>
                      <TableCell className="text-right">{s ? formatNaira(Number(s.allowances)) : "—"}</TableCell>
                      <TableCell><Button size="sm" variant="ghost" onClick={() => startEditSalary(m)}><Edit2 className="h-3 w-3" /></Button></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={salOpen} onOpenChange={(v) => { setSalOpen(v); if (!v) setEditSalary(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Salary — {editSalary?.full_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Pay Type</Label>
              <select className="w-full h-10 rounded-md border bg-background px-3" value={salForm.pay_type} onChange={e => setSalForm({ ...salForm, pay_type: e.target.value })}>
                <option value="monthly">Monthly Salary</option>
                <option value="hourly">Hourly</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Base Salary (₦)</Label><Input type="number" value={salForm.base_salary} onChange={e => setSalForm({ ...salForm, base_salary: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Hourly Rate (₦)</Label><Input type="number" value={salForm.hourly_rate} onChange={e => setSalForm({ ...salForm, hourly_rate: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Standard Allowances (₦)</Label><Input type="number" value={salForm.allowances} onChange={e => setSalForm({ ...salForm, allowances: e.target.value })} /></div>
            <Button onClick={saveSalary} className="w-full">Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editPS} onOpenChange={(v) => !v && setEditPS(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adjust Payslip — {editPS?.staff_name}</DialogTitle></DialogHeader>
          {editPS && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Bonus (₦)</Label><Input type="number" value={editPS.bonus} onChange={e => setEditPS({ ...editPS, bonus: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Deductions (₦)</Label><Input type="number" value={editPS.deductions} onChange={e => setEditPS({ ...editPS, deductions: e.target.value })} /></div>
              </div>
              <div className="space-y-1.5"><Label>Allowances (₦)</Label><Input type="number" value={editPS.allowances} onChange={e => setEditPS({ ...editPS, allowances: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Notes</Label><Textarea value={editPS.notes || ""} onChange={e => setEditPS({ ...editPS, notes: e.target.value })} /></div>
              <DialogFooter><Button onClick={updatePayslip}>Save</Button></DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
