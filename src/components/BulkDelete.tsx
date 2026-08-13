import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TableCell, TableHead } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

/** Selection state for a list of rows that have an `id`. */
export function useRowSelection<T extends { id: string }>(rows: T[]) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const ids = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);
  const visibleIds = rows.map((r) => r.id);
  const allChecked = visibleIds.length > 0 && visibleIds.every((id) => selected[id]);
  const toggle = (id: string) => setSelected((s) => ({ ...s, [id]: !s[id] }));
  const toggleAll = () => {
    if (allChecked) return setSelected({});
    const next: Record<string, boolean> = {};
    visibleIds.forEach((id) => { next[id] = true; });
    setSelected(next);
  };
  const clear = () => setSelected({});
  const isSelected = (id: string) => !!selected[id];
  return { ids, allChecked, toggle, toggleAll, clear, isSelected, count: ids.length };
}

export function SelectAllHead({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <TableHead className="w-8">
      <Checkbox checked={checked} onCheckedChange={onToggle} aria-label="Select all" />
    </TableHead>
  );
}

export function SelectCell({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <TableCell className="w-8">
      <Checkbox checked={checked} onCheckedChange={onToggle} aria-label="Select row" />
    </TableCell>
  );
}

export function DeleteRowButton({ onConfirm, label = "Delete this item?" }: { onConfirm: () => void | Promise<void>; label?: string }) {
  return (
    <Button
      size="icon"
      variant="ghost"
      title="Delete"
      onClick={async () => { if (confirm(label)) await onConfirm(); }}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}

/** Deletes rows by id from a table and reports the result. */
export async function deleteRows(table: string, ids: string[]) {
  if (ids.length === 0) return false;
  const { error } = await supabase.from(table as any).delete().in("id", ids);
  if (error) { toast.error(error.message); return false; }
  toast.success(ids.length === 1 ? "Deleted" : `${ids.length} items deleted`);
  return true;
}

/** Toolbar shown above a table when rows are selected. */
export function BulkDeleteBar({
  table, ids, onDone, noun = "items",
}: { table: string; ids: string[]; onDone: () => void; noun?: string }) {
  const [busy, setBusy] = useState(false);
  if (ids.length === 0) return null;
  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
      <span className="text-sm">{ids.length} {noun} selected</span>
      <Button
        size="sm"
        variant="destructive"
        disabled={busy}
        onClick={async () => {
          if (!confirm(`Delete ${ids.length} selected ${noun}? This cannot be undone.`)) return;
          setBusy(true);
          await deleteRows(table, ids);
          setBusy(false);
          onDone();
        }}
      >
        <Trash2 className="h-4 w-4 mr-1" /> Delete selected
      </Button>
    </div>
  );
}
