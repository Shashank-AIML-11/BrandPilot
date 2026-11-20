import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { getAutomationSettings, setAutomationSetting } from "@/lib/admin.functions";
import { Switch } from "@/components/ui/switch";

type Key = "auto_generate_enabled" | "autopost_enabled";

/** Admin Portal tab: master on/off switches for the daily automatic jobs. */
export function AdminAutomation() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-automation"],
    queryFn: () => getAutomationSettings(),
  });

  const save = useMutation({
    mutationFn: (v: { key: Key; value: boolean }) => setAutomationSetting({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(`${v.key === "auto_generate_enabled" ? "Auto-generate" : "Autopost"} switched ${v.value ? "ON" : "OFF"}`);
      void queryClient.invalidateQueries({ queryKey: ["admin-automation"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  if (error || !data) {
    return <p className="text-sm text-destructive">Could not load the automation settings. Has the app_settings migration been run?</p>;
  }

  const rows: Array<{ key: Key; title: string; text: string; on: boolean }> = [
    {
      key: "auto_generate_enabled",
      title: "Auto-generate content",
      text: "The daily 1:00 AM IST job that writes the next 7 days of content for every active subscriber. OFF = nothing is generated automatically (users can still press Generate Content themselves).",
      on: data.autoGenerate,
    },
    {
      key: "autopost_enabled",
      title: "Autopost (automatic posting)",
      text: "The daily 7:00 AM IST job that posts to connected social accounts. OFF = nothing is posted automatically for anyone. Manual Post now still works.",
      on: data.autopost,
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        These switches apply to this environment only and take effect on the very next run, with no redeploy.
        {!data.canEdit && " Only root can change them."}
      </p>
      {rows.map((r) => (
        <div key={r.key} className="surface flex items-start justify-between gap-4 p-5">
          <div>
            <h3 className="text-sm font-semibold">{r.title}</h3>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">{r.text}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold ${r.on ? "text-success" : "text-muted-foreground"}`}>{r.on ? "ON" : "OFF"}</span>
            <Switch
              checked={r.on}
              disabled={!data.canEdit || save.isPending}
              onCheckedChange={(value) => save.mutate({ key: r.key, value })}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
