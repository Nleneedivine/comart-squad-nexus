import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";

export default function Placeholder({ title, description }: { title: string; description?: string }) {
  return (
    <ProtectedShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">This module is part of the Comart+ roadmap. Coming soon.</p>
        </Card>
      </div>
    </ProtectedShell>
  );
}
