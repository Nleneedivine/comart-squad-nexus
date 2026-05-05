import { Link, useLocation, useNavigate, Outlet } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard, Clock, Store, ShoppingCart, Building2, Headphones,
  Megaphone, Wallet, Boxes, Users, Banknote, UserCog, MessageSquare,
  BarChart3, Zap, Plug, Webhook, Settings, Bell, Search, ChevronDown,
  ChevronRight, Maximize2, LogOut, Sun, Moon, Calculator, BookOpen, LifeBuoy, User as UserIcon
} from "lucide-react";
import { useAuth, ROLE_LABELS } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Item = { label: string; to?: string; icon: any; children?: { label: string; to: string }[] };

const NAV: Item[] = [
  { label: "Dashboard", to: "/Dashboard", icon: LayoutDashboard },
  { label: "My Attendance", to: "/attendance", icon: Clock },
  { label: "My Store", icon: Store, children: [
    { label: "Products", to: "/store/products" },
    { label: "Orders", to: "/store/orders" },
  ]},
  { label: "Orders", to: "/orders", icon: ShoppingCart },
  { label: "Businesses", to: "/businesses", icon: Building2 },
  { label: "Customer Service", to: "/customer-service", icon: Headphones },
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
  { label: "Finance", to: "/finance", icon: Banknote },
  { label: "Staff Management", to: "/staff", icon: UserCog },
  { label: "Chat Room", to: "/chat", icon: MessageSquare },
  { label: "Reports", icon: BarChart3, children: [
    { label: "Data Export", to: "/reports/export" },
    { label: "Store Activity Log", to: "/reports/activity" },
  ]},
  { label: "Productivity", to: "/productivity", icon: Zap },
  { label: "Integrations", to: "/integrations", icon: Plug },
  { label: "Webhooks", to: "/webhooks", icon: Webhook },
  { label: "Settings", to: "/Settings", icon: Settings },
];

export default function AppLayout({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ "My Store": true });
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  const { store, roles, user } = useAuth();

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  };

  const logout = async () => { await supabase.auth.signOut(); nav({ to: "/auth" }); };

  return (
    <div className="flex min-h-screen bg-background">
      <aside className={cn("flex flex-col bg-sidebar text-sidebar-foreground transition-all", collapsed ? "w-16" : "w-64")}>
        <div className="flex items-center justify-between px-4 h-16 border-b border-sidebar-border">
          {!collapsed && (
            <Link to="/Dashboard" className="text-xl font-bold">
              <span className="text-primary">Comart</span>+
            </Link>
          )}
          <button onClick={() => setCollapsed(!collapsed)} className="p-1.5 rounded hover:bg-white/5">
            <ChevronRight className={cn("h-4 w-4 transition-transform", !collapsed && "rotate-180")} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5 text-sm">
          {NAV.map(item => {
            const Icon = item.icon;
            const active = item.to && loc.pathname.toLowerCase() === item.to.toLowerCase();
            if (item.children) {
              const isOpen = open[item.label];
              const childActive = item.children.some(c => loc.pathname.toLowerCase() === c.to.toLowerCase());
              return (
                <div key={item.label}>
                  <button
                    onClick={() => setOpen({ ...open, [item.label]: !isOpen })}
                    className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-white/5",
                      childActive && "bg-white/5")}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <><span className="flex-1 text-left">{item.label}</span><ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} /></>}
                  </button>
                  {!collapsed && isOpen && (
                    <div className="ml-9 mt-0.5 space-y-0.5">
                      {item.children.map(c => (
                        <Link key={c.to} to={c.to} className={cn("block px-3 py-1.5 rounded-md text-xs hover:bg-white/5",
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
              <Link key={item.label} to={item.to!} className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md hover:bg-white/5",
                active && "bg-primary/15 text-primary border-l-2 border-primary"
              )}>
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b bg-card flex items-center gap-4 px-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input className="w-full pl-9 pr-3 h-9 rounded-md bg-muted text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Search anything... (Ctrl+K)" />
          </div>
          <div className="hidden md:block text-xs text-muted-foreground max-w-sm truncate">
            <span className="font-medium text-foreground">Staff of {store?.name || "—"}</span>
            <span className="ml-2">{roles.map(r => ROLE_LABELS[r] || r).join(", ")}</span>
          </div>
          <button className="p-2 hover:bg-muted rounded-md"><Maximize2 className="h-4 w-4" /></button>
          <button className="p-2 hover:bg-muted rounded-md relative">
            <Bell className="h-4 w-4" />
            <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 bg-primary rounded-full" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted">
              <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center"><UserIcon className="h-4 w-4 text-primary" /></div>
              <span className="text-sm font-medium">{store?.name || "My Store"}</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => nav({ to: "/Settings" })}><Settings className="h-4 w-4 mr-2" />Settings</DropdownMenuItem>
              <DropdownMenuItem><BarChart3 className="h-4 w-4 mr-2" />Performance</DropdownMenuItem>
              <DropdownMenuItem><BookOpen className="h-4 w-4 mr-2" />Account Walkthrough</DropdownMenuItem>
              <DropdownMenuItem><BookOpen className="h-4 w-4 mr-2" />Documentation</DropdownMenuItem>
              <DropdownMenuItem><Calculator className="h-4 w-4 mr-2" />Calculator</DropdownMenuItem>
              <DropdownMenuItem><LifeBuoy className="h-4 w-4 mr-2" />Support</DropdownMenuItem>
              <DropdownMenuItem onClick={toggleDark}>{dark ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}{dark ? "Light Mode" : "Dark Mode"}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive"><LogOut className="h-4 w-4 mr-2" />Logout</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children ?? <Outlet />}</main>
      </div>
    </div>
  );
}
