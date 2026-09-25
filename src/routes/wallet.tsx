import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatNaira } from "@/lib/format";
import { toast } from "sonner";
import { Eye, EyeOff, ArrowUpRight, ArrowDownLeft, Settings as SettingsIcon, AlertTriangle, Search } from "lucide-react";
import { initFundWallet, verifyFunding, requestWithdrawal, setWalletPin } from "@/lib/paystack.functions";

export const Route = createFileRoute("/wallet")({
  head: () => ({ meta: [{ title: "Wallet — Comart+" }, { name: "description", content: "Wallet powered by Paystack." }] }),
  component: () => <ProtectedShell><Wallet /></ProtectedShell>,
});

function Wallet() {
  const { store, user } = useAuth();
  const [wallet, setWallet] = useState<any>(null);
  const [tx, setTx] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [tab, setTab] = useState<"all" | "sale" | "funding" | "withdrawal">("all");
  const [search, setSearch] = useState("");
  const [fundOpen, setFundOpen] = useState(false);
  const [wdOpen, setWdOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [bank, setBank] = useState({ bank_name: "", bank_account_number: "", bank_account_name: "" });
  const [pin, setPin] = useState("");

  const load = async () => {
    if (!store) return;
    const { data: w } = await supabase.from("wallets").select("id,store_id,balance,bank_name,bank_account_number,bank_account_name,created_at,updated_at").eq("store_id", store.id).maybeSingle();
    let walletRow = w;
    if (!walletRow) {
      const { data: created } = await supabase.from("wallets").insert({ store_id: store.id }).select("id,store_id,balance,bank_name,bank_account_number,bank_account_name,created_at,updated_at").single();
      walletRow = created;
    }
    setWallet(walletRow);
    setBank({
      bank_name: walletRow?.bank_name || "",
      bank_account_number: walletRow?.bank_account_number || "",
      bank_account_name: walletRow?.bank_account_name || "",
    });
    const { data: txs } = await supabase.from("wallet_transactions").select("*")
      .eq("store_id", store.id).order("created_at", { ascending: false });
    setTx(txs || []);
  };
  useEffect(() => { load(); }, [store]);

  // Verify Paystack callback ?reference=xxx
  useEffect(() => {
    if (typeof window === "undefined") return;
    const ref = new URL(window.location.href).searchParams.get("reference");
    if (!ref) return;
    (async () => {
      try {
        const r = await verifyFunding({ data: { reference: ref } });
        if (r.ok) toast.success("Wallet funded successfully");
        else toast.error(r.message || "Funding failed");
      } catch (e: any) { toast.error(e.message); }
      window.history.replaceState({}, "", window.location.pathname);
      load();
    })();
  }, []);

  const totals = useMemo(() => {
    const inSum = tx.filter(t => t.kind !== "withdrawal" && t.status === "success").reduce((s, t) => s + Number(t.amount), 0);
    const outSum = tx.filter(t => t.kind === "withdrawal").reduce((s, t) => s + Number(t.amount), 0);
    return { inSum, outSum };
  }, [tx]);

  const filtered = tx.filter(t => {
    if (tab !== "all" && t.kind !== tab) return false;
    if (search && !(`${t.reference} ${t.description}`.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  });

  const fund = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Enter amount");
    if (!user?.email) return toast.error("Email required");
    try {
      const r = await initFundWallet({ data: { amount: amt, email: user.email } });
      window.location.href = r.authorization_url;
    } catch (e: any) { toast.error(e.message); }
  };

  const [wdPin, setWdPin] = useState("");
  const withdraw = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Enter amount");
    if (!/^\d{4,6}$/.test(wdPin)) return toast.error("Enter your PIN");
    try {
      await requestWithdrawal({
        data: {
          amount: amt,
          pin: wdPin,
          idempotency_key: crypto.randomUUID(),
        },
      });
      toast.success("Withdrawal requested");
      setWdOpen(false); setAmount(""); setWdPin(""); load();
    } catch (e: any) { toast.error(e.message); }
  };

  const saveBank = async () => {
    if (!wallet) return;
    const { error } = await supabase.from("wallets").update(bank).eq("id", wallet.id);
    if (error) return toast.error(error.message);
    toast.success("Bank account saved"); setBankOpen(false); load();
  };

  const savePin = async () => {
    if (!/^\d{4,6}$/.test(pin)) return toast.error("PIN must be 4-6 digits");
    try {
      await setWalletPin({ data: { pin } });
      toast.success("PIN set");
      setPinOpen(false); setPin("");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const noBank = wallet && !wallet.bank_account_number;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Wallet</h1>
          <p className="text-sm text-muted-foreground">Powered by Paystack.</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline"><SettingsIcon className="h-4 w-4 mr-1" />Wallet Settings</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setPinOpen(true)}>Set PIN</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setBankOpen(true)}>Bank Account Details</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {noBank && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Bank account required before you can withdraw. <button className="underline" onClick={() => setBankOpen(true)}>Add bank account</button></AlertDescription>
        </Alert>
      )}

      <Card className="p-6 bg-gradient-to-br from-primary/15 to-transparent border-primary/30">
        <p className="text-sm text-muted-foreground">Available Balance</p>
        <div className="flex items-center gap-3 mt-2">
          <p className="text-3xl font-bold">{show ? formatNaira(Number(wallet?.balance || 0)) : "₦••••••"}</p>
          <Button variant="ghost" size="sm" onClick={() => setShow(!show)}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
        </div>
        <div className="flex gap-2 mt-4">
          <Dialog open={fundOpen} onOpenChange={setFundOpen}>
            <DialogTrigger asChild><Button>Fund Wallet</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Fund Wallet via Paystack</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5"><Label>Amount (₦)</Label><Input type="number" value={amount} onChange={e => setAmount(e.target.value)} /></div>
                <Button onClick={fund} className="w-full">Continue to Paystack</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={wdOpen} onOpenChange={setWdOpen}>
            <DialogTrigger asChild><Button variant="outline" disabled={noBank}>Withdraw</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Request Withdrawal</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">To: {wallet?.bank_name} • {wallet?.bank_account_number}</p>
                <div className="space-y-1.5"><Label>Amount (₦)</Label><Input type="number" value={amount} onChange={e => setAmount(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Wallet PIN</Label><Input type="password" inputMode="numeric" maxLength={6} value={wdPin} onChange={e => setWdPin(e.target.value)} placeholder="Enter PIN" /></div>
                <Button onClick={withdraw} className="w-full">Request Withdrawal</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4"><div className="flex items-center gap-3"><div className="h-9 w-9 rounded-md bg-emerald-500/10 text-emerald-500 flex items-center justify-center"><ArrowDownLeft className="h-4 w-4" /></div><div><p className="text-xs text-muted-foreground">Total In</p><p className="text-lg font-bold">{formatNaira(totals.inSum)}</p></div></div></Card>
        <Card className="p-4"><div className="flex items-center gap-3"><div className="h-9 w-9 rounded-md bg-rose-500/10 text-rose-500 flex items-center justify-center"><ArrowUpRight className="h-4 w-4" /></div><div><p className="text-xs text-muted-foreground">Total Out</p><p className="text-lg font-bold">{formatNaira(totals.outSum)}</p></div></div></Card>
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Tabs value={tab} onValueChange={(v: any) => setTab(v)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="sale">Sales</TabsTrigger>
              <TabsTrigger value="funding">Funding</TabsTrigger>
              <TabsTrigger value="withdrawal">Withdrawals</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative w-64"><Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search reference..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Description</TableHead><TableHead>Reference</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No transactions.</TableCell></TableRow> :
              filtered.map(t => (
                <TableRow key={t.id}>
                  <TableCell>{new Date(t.created_at).toLocaleDateString()}</TableCell>
                  <TableCell><Badge variant="outline">{t.kind}</Badge></TableCell>
                  <TableCell className="max-w-xs truncate">{t.description || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{t.reference || "—"}</TableCell>
                  <TableCell><Badge variant={t.status === "success" ? "default" : t.status === "failed" ? "destructive" : "secondary"}>{t.status}</Badge></TableCell>
                  <TableCell className={"text-right font-medium " + (t.kind === "withdrawal" ? "text-rose-500" : "text-emerald-500")}>
                    {t.kind === "withdrawal" ? "−" : "+"}{formatNaira(Number(t.amount))}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={bankOpen} onOpenChange={setBankOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Bank Account Details</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Bank Name</Label><Input value={bank.bank_name} onChange={e => setBank({ ...bank, bank_name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Account Number</Label><Input value={bank.bank_account_number} onChange={e => setBank({ ...bank, bank_account_number: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Account Name</Label><Input value={bank.bank_account_name} onChange={e => setBank({ ...bank, bank_account_name: e.target.value })} /></div>
            <Button onClick={saveBank} className="w-full">Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={pinOpen} onOpenChange={setPinOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Set Wallet PIN</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>PIN (4-6 digits)</Label><Input type="password" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))} /></div>
            <Button onClick={savePin} className="w-full">Save PIN</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
