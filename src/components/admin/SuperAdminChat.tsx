import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { superAdminChat } from "@/lib/admin-ai.functions";
import { supabase } from "@/integrations/supabase/client";
import { APP_PAGES } from "@/lib/page-registry";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Send, Loader2, ChevronDown, ChevronUp, Sparkles, Store as StoreIcon, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

type Msg = { role: "user" | "assistant"; content: string; tools?: { name: string; args: any; result: any }[] };
type StoreRow = { id: string; name: string; owner_id: string | null };

export default function SuperAdminChat() {
  const chat = useServerFn(superAdminChat);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [mention, setMention] = useState<{ type: "@" | "/"; query: string; pos: number } | null>(null);
  const [storeRefs, setStoreRefs] = useState<Record<string, string>>({}); // name -> id
  const [pageRefs, setPageRefs] = useState<Record<string, string>>({}); // label -> path
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const taRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from("stores").select("id, name, owner_id").order("name").then(({ data }) => setStores(data || []));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setInput(v);
    const caret = e.target.selectionStart;
    // Detect trigger
    const before = v.slice(0, caret);
    const m = before.match(/(?:^|\s)([@/])([\w-]*)$/);
    if (m) setMention({ type: m[1] as "@" | "/", query: m[2].toLowerCase(), pos: caret });
    else setMention(null);
  };

  const insertMention = (label: string, ref: string) => {
    if (!mention) return;
    const trigger = mention.type;
    const before = input.slice(0, mention.pos);
    const after = input.slice(mention.pos);
    const replaced = before.replace(/([@/])([\w-]*)$/, `${trigger}${label} `);
    const newVal = replaced + after;
    setInput(newVal);
    if (trigger === "@") setStoreRefs(prev => ({ ...prev, [label]: ref }));
    else setPageRefs(prev => ({ ...prev, [label]: ref }));
    setMention(null);
    setTimeout(() => taRef.current?.focus(), 0);
  };

  const filtered = (() => {
    if (!mention) return [];
    if (mention.type === "@") return stores.filter(s => s.name.toLowerCase().includes(mention.query)).slice(0, 8);
    return APP_PAGES.filter(p => p.label.toLowerCase().includes(mention.query) || p.path.toLowerCase().includes(mention.query)).slice(0, 8);
  })();

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    // Resolve mentions in current message
    const storeContext: string[] = [];
    const pageContext: string[] = [];
    Object.entries(storeRefs).forEach(([name, id]) => { if (text.includes(`@${name}`)) storeContext.push(id); });
    Object.entries(pageRefs).forEach(([label, path]) => { if (text.includes(`/${label}`)) pageContext.push(path); });

    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await chat({ data: { messages: next.map(({ role, content }) => ({ role, content })), storeContext, pageContext } });
      setMessages([...next, { role: "assistant", content: res.text || "(no response)", tools: res.tools }]);
    } catch (e: any) {
      setMessages([...next, { role: "assistant", content: `⚠️ ${e?.message || "Error"}` }]);
    } finally {
      setLoading(false);
      setTimeout(() => taRef.current?.focus(), 0);
    }
  };

  return (
    <Card className="flex flex-col h-[640px] overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center gap-2 bg-muted/30">
        <Bot className="h-5 w-5 text-primary" />
        <div>
          <div className="font-semibold text-sm">Super Admin Assistant</div>
          <div className="text-xs text-muted-foreground">Type <kbd className="px-1 bg-background rounded border">@</kbd> for stores · <kbd className="px-1 bg-background rounded border">/</kbd> for pages</div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-12 space-y-2">
            <Sparkles className="h-8 w-8 mx-auto text-primary/50" />
            <div>Ask me to inspect a store, message an admin, or change a setting.</div>
            <div className="text-xs">e.g. <em>"Message @AcmeStore asking if their orders are syncing"</em></div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] rounded-lg px-3 py-2 text-sm",
              m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted")}>
              {m.role === "assistant" ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              ) : (
                <div className="whitespace-pre-wrap">{m.content}</div>
              )}
              {m.tools && m.tools.length > 0 && (
                <button
                  onClick={() => setExpanded(p => ({ ...p, [i]: !p[i] }))}
                  className="mt-2 text-xs flex items-center gap-1 opacity-70 hover:opacity-100"
                >
                  {expanded[i] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {m.tools.length} action{m.tools.length > 1 ? "s" : ""} performed
                </button>
              )}
              {expanded[i] && m.tools && (
                <div className="mt-2 space-y-1">
                  {m.tools.map((t, j) => (
                    <div key={j} className="text-xs bg-background/50 rounded p-2 font-mono overflow-x-auto">
                      <div className="font-semibold text-primary">{t.name}</div>
                      <div className="opacity-70 truncate">args: {JSON.stringify(t.args)}</div>
                      <div className="opacity-70 truncate">→ {JSON.stringify(t.result).slice(0, 200)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start"><div className="bg-muted rounded-lg px-3 py-2 text-sm flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Thinking…</div></div>
        )}
      </div>

      <div className="border-t p-3 relative">
        {mention && filtered.length > 0 && (
          <div className="absolute bottom-full left-3 right-3 mb-2 bg-popover border rounded-md shadow-lg max-h-64 overflow-y-auto z-10">
            <div className="px-3 py-1.5 text-xs uppercase tracking-wide text-muted-foreground border-b bg-muted/50">
              {mention.type === "@" ? "Stores" : "Pages"}
            </div>
            {filtered.map((item: any) => {
              const label = mention.type === "@" ? item.name : item.label;
              const ref = mention.type === "@" ? item.id : item.path;
              const safeLabel = label.replace(/\s+/g, "_");
              return (
                <button
                  key={ref}
                  onClick={() => insertMention(safeLabel, ref)}
                  className="w-full text-left px-3 py-2 hover:bg-accent flex items-center gap-2 text-sm"
                >
                  {mention.type === "@" ? <StoreIcon className="h-3.5 w-3.5 text-muted-foreground" /> : <Hash className="h-3.5 w-3.5 text-muted-foreground" />}
                  <span className="flex-1">{label}</span>
                  {mention.type === "/" && <span className="text-xs text-muted-foreground">{item.path}</span>}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex gap-2">
          <Textarea
            ref={taRef}
            value={input}
            onChange={handleChange}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !mention) { e.preventDefault(); send(); }
              if (e.key === "Escape") setMention(null);
            }}
            placeholder="Ask the assistant… use @ to reference a store, / for a page"
            rows={2}
            className="resize-none"
            disabled={loading}
          />
          <Button onClick={send} disabled={loading || !input.trim()} size="icon" className="h-auto">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
