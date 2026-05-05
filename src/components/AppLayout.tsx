import { Link, useLocation, useNavigate, Outlet } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { formatNaira } from "@/lib/format";
import {
  LayoutDashboard, Clock, Store, ShoppingCart, Building2, Headphones,
  Megaphone, Wallet, Boxes, Users, Banknote, UserCog, MessageSquare,
  BarChart3, Zap, Plug, Webhook, Settings, Bell, Search, ChevronDown,
  ChevronRight, Maximize2, LogOut, Sun, Moon, Calculator, BookOpen, LifeBuoy,
  User as UserIcon, Menu, X,
} from "lucide-react";
import { useAuth, ROLE_LABELS } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { canAccess } from "@/lib/rbac";

type Item = { label: string; to?: string; icon: any; children?: { label: string; to: string }[] };

const NAV: Item[] = [
  { label: "Dashboard", to: "/Dashboard", icon: LayoutDashboard },
  { label: "My Attendance", to: "/attendance", icon: Clock },
  { label: "My Store", to: "/StoreManagement", icon: Store },
  { label: "Orders", to: "/orders", icon: ShoppingCart },
  { label: "Businesses", to: "/businesses", icon: Building2 },
  { label: "Customers", to: "/customer-service", icon: Headphones },
  { label: "Marketing", icon: Megaphone, children: [
    { label: "Sales Forms", to: "/marketing/sales-forms" },
  ]},
  { label: "Wallet", to: "/wallet", icon: Wallet },
  { label: "Inventory", icon: Boxes, children: [
    { label: "Products", to: "/inventory/products" },
    { label: "Buy Stock", to: "/inventory/buy-stock" },
    { label: "Stock Record", to: "/inventory/stock-record" },
    { label: "Faulty Stocks", to: "/inventory/faulty" },
    { label: "Agent Stock Table", to: "/inventory/agent-stock" },
    { label: "Waybill", to: "/inventory/waybill" },
  ]},
  { label: "Agents", to: "/agents", icon: Users },
  { label: "Finance", icon: Banknote, children: [
    { label: "Records", to: "/finance" },
  ]},
  { label: "Staff Management", to: "/staff", icon: UserCog },
  { label: "Chat Room", to: "/chat", icon: MessageSquare },
  { label: "Reports", icon: BarChart3, children: [
    { label: "Data Export", to: "/reports/export" },
    { label: "Store Activity Log", to: "/reports/activity" },
  ]},
  { label: "Productivity", to: "/productivity", icon: Zap },
  { label: "Integrations", to: "/integrations", icon: Plug },
  { label: "Webhook Logs", to: "/webhooks", icon: Webhook },
  { label: "Settings", to: "/Settings", icon: Settings },
];

export default function AppLayout({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { dark, toggle: toggleDark } = useTheme();
  const loc = useLocation();
  const nav = useNavigate();
  const { store, roles, user } = useAuth();

  const logout = async () => { await supabase.auth.signOut(); nav({ to: "/auth" }); };

  // Global realtime: new-order toast notification
  const mountedAt = useRef<number>(Date.now());
  useEffect(() => {
    if (!store) return;
    const ch = supabase.channel("notify-orders-" + store.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders", filter: `store_id=eq.${store.id}` }, (payload: any) => {
        const o = payload.new || {};
        if (new Date(o.created_at).getTime() < mountedAt.current - 2000) return;
        toast.success(`New order from ${o.customer_name || "Customer"} — ${formatNaira(Number(o.amount || 0))}`);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [store]);

  // Filter NAV by role. If no roles loaded yet (or user has none), show all
  // items — matches ProtectedShell behavior and avoids an empty sidebar.
  const noRoles = !roles || roles.length === 0;
  const filteredNav = NAV.flatMap(item => {
    if (item.children) {
      const kids = noRoles ? item.children : item.children.filter(c => canAccess(roles, c.to));
      if (kids.length === 0) return [];
      return [{ ...item, children: kids }];
    }
    return noRoles || canAccess(roles, item.to!) ? [item] : [];
  });

  const sidebarContent = (
    <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5 text-sm">
      {filteredNav.map(item => {
        const Icon = item.icon;
        const active = item.to && loc.pathname.toLowerCase() === item.to.toLowerCase();
        if (item.children) {
          const isOpen = open[item.label];
          const childActive = item.children.some(c => loc.pathname.toLowerCase() === c.to.toLowerCase());
          return (
            <div key={item.label}>
              <button onClick={() => setOpen({ ...open, [item.label]: !isOpen })}
                className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-white/5", childActive && "bg-white/5")}>
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <><span className="flex-1 text-left">{item.label}</span><ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} /></>}
              </button>
              {!collapsed && isOpen && (
                <div className="ml-9 mt-0.5 space-y-0.5">
                  {item.children.map(c => (
                    <Link key={c.to} to={c.to} onClick={() => setMobileOpen(false)}
                      className={cn("block px-3 py-1.5 rounded-md text-xs hover:bg-white/5",
                      loc.pathname.toLowerCase() === c.to.toLowerCase() && "text-primary font-medium")}>
                      {c.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        }
        return (
          <Link key={item.label} to={item.to!} onClick={() => setMobileOpen(false)}
            className={cn("flex items-center gap-3 px-3 py-2 rounded-md hover:bg-white/5",
            active && "bg-primary/15 text-primary border-l-2 border-primary")}>
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className={cn("hidden lg:flex flex-col bg-sidebar text-sidebar-foreground transition-all", collapsed ? "w-16" : "w-64")}>
        <div className="flex items-center justify-between px-4 h-16 border-b border-sidebar-border">
          {!collapsed && <Link to="/Dashboard" className="text-xl font-bold"><span className="text-primary">Comart</span>+</Link>}
          <button onClick={() => setCollapsed(!collapsed)} className="p-1.5 rounded hover:bg-white/5">
            <ChevronRight className={cn("h-4 w-4 transition-transform", !collapsed && "rotate-180")} />
          </button>
        </div>
        {sidebarContent}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex flex-col w-64 bg-sidebar text-sidebar-foreground">
            <div className="flex items-center justify-between px-4 h-16 border-b border-sidebar-border">
              <span className="text-xl font-bold"><span className="text-primary">Comart</span>+</span>
              <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded hover:bg-white/5"><X className="h-4 w-4" /></button>
            </div>
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b bg-card flex items-center gap-2 md:gap-4 px-4 md:px-6">
          <button className="lg:hidden p-2 hover:bg-muted rounded-md" onClick={() => setMobileOpen(true)}><Menu className="h-5 w-5" /></button>
          <div className="relative flex-1 max-w-md hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input className="w-full pl-9 pr-3 h-9 rounded-md bg-muted text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Search..." />
          </div>
          <div className="hidden xl:block text-xs text-muted-foreground max-w-sm truncate ml-auto">
            <span className="font-medium text-foreground">Staff of {store?.name || "—"}</span>
            <span className="ml-2">{roles.map(r => ROLE_LABELS[r] || r).join(", ")}</span>
          </div>
          <button onClick={toggleDark} className="p-2 hover:bg-muted rounded-md ml-auto lg:ml-0" aria-label="Toggle theme">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button className="p-2 hover:bg-muted rounded-md hidden sm:block"><Maximize2 className="h-4 w-4" /></button>
          <button className="p-2 hover:bg-muted rounded-md relative">
            <Bell className="h-4 w-4" />
            <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 bg-primary rounded-full" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted">
              <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center"><UserIcon className="h-4 w-4 text-primary" /></div>
              <span className="text-sm font-medium hidden md:inline">{store?.name || "My Store"}</span>
              <ChevronDown className="h-3.5 w-3.5 hidden md:inline" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => nav({ to: "/Settings" })}><Settings className="h-4 w-4 mr-2" />Settings</DropdownMenuItem>
              <DropdownMenuItem onClick={() => nav({ to: "/StoreManagement" })}><Store className="h-4 w-4 mr-2" />My Store</DropdownMenuItem>
              <DropdownMenuItem><BookOpen className="h-4 w-4 mr-2" />Documentation</DropdownMenuItem>
              <DropdownMenuItem><Calculator className="h-4 w-4 mr-2" />Calculator</DropdownMenuItem>
              <DropdownMenuItem><LifeBuoy className="h-4 w-4 mr-2" />Support</DropdownMenuItem>
              <DropdownMenuItem onClick={toggleDark}>{dark ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}{dark ? "Light Mode" : "Dark Mode"}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive"><LogOut className="h-4 w-4 mr-2" />Logout</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children ?? <Outlet />}</main>
      </div>
    </div>
  );
}
