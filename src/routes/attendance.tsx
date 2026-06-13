import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import EmptyState from "@/components/EmptyState";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isWeekend, isAfter, startOfDay } from "date-fns";
import { Clock, ChevronLeft, ChevronRight, Camera, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/attendance")({
  head: () => ({ meta: [{ title: "My Attendance — Comart+" }, { name: "description", content: "Clock in and out with photo and GPS verification." }] }),
  component: () => <ProtectedShell><Attendance /></ProtectedShell>,
});

type CaptureResult = { blob: Blob; coords: { lat: number; lng: number } | null };

function Attendance() {
  const { user, store } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [active, setActive] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(new Date());
  const [policy, setPolicy] = useState<{ resumption_time: string | null; late_deadline: string | null }>({ resumption_time: null, late_deadline: null });
  const [busy, setBusy] = useState(false);

  // Camera modal
  const [camOpen, setCamOpen] = useState(false);
  const [camMode, setCamMode] = useState<"in" | "out">("in");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from("attendance").select("*").eq("user_id", user.id).order("clock_in", { ascending: false }).limit(200);
    setRecords(data || []);
    setActive((data || []).find((r: any) => !r.clock_out) || null);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  useEffect(() => {
    if (!store) return;
    supabase.from("stores").select("resumption_time, late_deadline").eq("id", store.id).maybeSingle()
      .then(({ data }) => { if (data) setPolicy(data as any); });
  }, [store]);

  // Stop the camera stream when the dialog closes
  useEffect(() => {
    if (!camOpen && stream) {
      stream.getTracks().forEach(t => t.stop());
      setStream(null);
    }
  }, [camOpen, stream]);

  const openCamera = async (mode: "in" | "out") => {
    if (!user || !store) return;
    setCamMode(mode);
    setCoords(null);
    setGeoError(null);
    setCamOpen(true);

    // GPS
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => setGeoError(err.message || "Could not get location"),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setGeoError("Geolocation not supported on this device");
    }

    // Camera
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      setStream(s);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch (e: any) {
      toast.error(e?.message || "Could not access camera");
      setCamOpen(false);
    }
  };

  const captureFrame = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const v = videoRef.current;
      const c = canvasRef.current;
      if (!v || !c) return resolve(null);
      const w = v.videoWidth || 640;
      const h = v.videoHeight || 480;
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(v, 0, 0, w, h);
      c.toBlob((b) => resolve(b), "image/jpeg", 0.82);
    });
  };

  const confirmCapture = async () => {
    if (!user || !store) return;
    setBusy(true);
    try {
      const blob = await captureFrame();
      if (!blob) { toast.error("Couldn't capture photo"); return; }
      const path = `${store.id}/${user.id}/${camMode}_${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from("attendance-photos").upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (upErr) { toast.error(upErr.message); return; }

      if (camMode === "in") {
        const { error } = await supabase.from("attendance").insert({
          user_id: user.id,
          store_id: store.id,
          clock_in_photo_url: path,
          clock_in_lat: coords?.lat ?? null,
          clock_in_lng: coords?.lng ?? null,
        });
        if (error) { toast.error(error.message); return; }
        toast.success("Clocked in");
      } else {
        if (!active) return;
        const { error } = await supabase.from("attendance").update({
          clock_out: new Date().toISOString(),
          clock_out_photo_url: path,
          clock_out_lat: coords?.lat ?? null,
          clock_out_lng: coords?.lng ?? null,
        }).eq("id", active.id);
        if (error) { toast.error(error.message); return; }
        toast.success("Clocked out");
      }
      setCamOpen(false);
      load();
    } finally {
      setBusy(false);
    }
  };

  const days = useMemo(() => eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }), [month]);
  const today = startOfDay(new Date());

  // Parse "HH:MM[:SS]" into minutes-of-day
  const parseTime = (t: string | null) => {
    if (!t) return null;
    const [h, m] = t.split(":").map(Number);
    if (isNaN(h)) return null;
    return h * 60 + (m || 0);
  };
  const lateMinute = parseTime(policy.late_deadline);

  const statusFor = (d: Date): "present" | "late" | "absent" | "off" | "future" => {
    if (isAfter(d, today)) return "future";
    if (isWeekend(d)) return "off";
    const rec = records.find((r: any) => isSameDay(new Date(r.clock_in), d));
    if (!rec) return "absent";
    const ci = new Date(rec.clock_in);
    const mins = ci.getHours() * 60 + ci.getMinutes();
    const cutoff = lateMinute ?? (9 * 60); // default 9am if not set
    return mins > cutoff ? "late" : "present";
  };

  const summary = useMemo(() => {
    let present = 0, late = 0, absent = 0;
    days.forEach(d => {
      const s = statusFor(d);
      if (s === "present") present++; else if (s === "late") late++; else if (s === "absent") absent++;
    });
    return { present, late, absent };
  }, [days, records, lateMinute]);

  const photoUrl = (path: string | null) => {
    if (!path) return null;
    const { data } = supabase.storage.from("attendance-photos").getPublicUrl(path);
    return data.publicUrl;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Attendance</h1>
        <p className="text-sm text-muted-foreground">Clock in and out — photo and GPS are captured for verification.</p>
      </div>

      <Card className="p-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{active ? "Currently clocked in since" : "You are not clocked in"}</p>
          {active && <p className="font-semibold mt-1">{format(new Date(active.clock_in), "PPp")}</p>}
          <div className="text-xs text-muted-foreground mt-2 flex gap-3 flex-wrap">
            {policy.resumption_time && <span>Resumption: <strong>{policy.resumption_time.slice(0,5)}</strong></span>}
            {policy.late_deadline && <span>Late after: <strong>{policy.late_deadline.slice(0,5)}</strong></span>}
          </div>
        </div>
        {active
          ? <Button onClick={() => openCamera("out")} variant="destructive"><Camera className="h-4 w-4 mr-2" />Clock Out</Button>
          : <Button onClick={() => openCamera("in")}><Camera className="h-4 w-4 mr-2" />Clock In</Button>}
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Present</p><p className="text-2xl font-bold text-emerald-500">{summary.present}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Late</p><p className="text-2xl font-bold text-amber-500">{summary.late}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Absent</p><p className="text-2xl font-bold text-rose-500">{summary.absent}</p></Card>
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">{format(month, "MMMM yyyy")}</h2>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setMonth(new Date())}>Today</Button>
            <Button variant="outline" size="icon" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
        {loading ? <Skeleton className="h-64 w-full" /> : (
          <>
            <div className="grid grid-cols-7 gap-2 text-center text-xs text-muted-foreground mb-2">
              {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: days[0].getDay() }).map((_, i) => <div key={"e" + i} />)}
              {days.map(d => {
                const s = statusFor(d);
                const cls = {
                  present: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
                  late: "bg-amber-500/15 text-amber-600 border-amber-500/30",
                  absent: "bg-rose-500/15 text-rose-600 border-rose-500/30",
                  off: "bg-muted text-muted-foreground border-border",
                  future: "bg-card text-muted-foreground border-border",
                }[s];
                return (
                  <div key={d.toISOString()} className={cn("aspect-square rounded-md border flex flex-col items-center justify-center text-xs", cls)}>
                    <span className="font-semibold">{format(d, "d")}</span>
                    {s !== "future" && s !== "off" && <span className="text-[10px] capitalize">{s}</span>}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-4">Recent History</h2>
        {loading ? <Skeleton className="h-32 w-full" /> : records.length === 0 ? (
          <EmptyState icon={Clock} title="No attendance records yet" description="Clock in to start tracking your attendance." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr>
                <th className="py-2">Date</th><th>Clock In</th><th>Clock Out</th><th>Photos</th><th>Location</th>
              </tr></thead>
              <tbody>
                {records.slice(0, 30).map((r: any) => {
                  const inUrl = photoUrl(r.clock_in_photo_url);
                  const outUrl = photoUrl(r.clock_out_photo_url);
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="py-2">{format(new Date(r.clock_in), "PP")}</td>
                      <td>{format(new Date(r.clock_in), "p")}</td>
                      <td>{r.clock_out ? format(new Date(r.clock_out), "p") : <Badge variant="secondary">Active</Badge>}</td>
                      <td>
                        <div className="flex gap-1">
                          {inUrl && <a href={inUrl} target="_blank" rel="noreferrer"><img src={inUrl} className="h-8 w-8 rounded object-cover border" alt="In" /></a>}
                          {outUrl && <a href={outUrl} target="_blank" rel="noreferrer"><img src={outUrl} className="h-8 w-8 rounded object-cover border" alt="Out" /></a>}
                        </div>
                      </td>
                      <td className="text-xs">
                        {r.clock_in_lat != null && (
                          <a className="text-primary inline-flex items-center gap-1" target="_blank" rel="noreferrer"
                             href={`https://www.google.com/maps?q=${r.clock_in_lat},${r.clock_in_lng}`}>
                            <MapPin className="h-3 w-3" />in
                          </a>
                        )}
                        {r.clock_out_lat != null && (
                          <a className="text-primary inline-flex items-center gap-1 ml-2" target="_blank" rel="noreferrer"
                             href={`https://www.google.com/maps?q=${r.clock_out_lat},${r.clock_out_lng}`}>
                            <MapPin className="h-3 w-3" />out
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={camOpen} onOpenChange={setCamOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{camMode === "in" ? "Clock In" : "Clock Out"} — Take Photo</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="aspect-square w-full bg-black rounded-md overflow-hidden">
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            </div>
            <canvas ref={canvasRef} className="hidden" />
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <MapPin className="h-3 w-3" />
              {coords
                ? <span>Location captured: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</span>
                : geoError
                  ? <span className="text-amber-600">No GPS: {geoError}</span>
                  : <span>Getting location…</span>}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setCamOpen(false)} disabled={busy}>Cancel</Button>
              <Button onClick={confirmCapture} disabled={busy || !stream}>
                <Camera className="h-4 w-4 mr-2" />
                {busy ? "Saving…" : "Capture & " + (camMode === "in" ? "Clock In" : "Clock Out")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
