import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateTournament, getListTournamentsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { ArrowLeft } from "lucide-react";

const schema = z.object({
  name: z.string().min(2, "Tournament name required"),
  courseName: z.string().optional(),
  startDate: z.string().min(1, "Start date required"),
  endDate: z.string().min(1, "End date required"),
  notes: z.string().optional(),
  salaryCap: z.coerce.number().min(1).default(100),
  salaryMax: z.coerce.number().min(1).default(30),
  salaryMin: z.coerce.number().min(1).default(3),
  captainMultiplier: z.coerce.number().min(1).default(2),
  birdiePoints: z.coerce.number().min(0).default(1),
  eaglePoints: z.coerce.number().min(0).default(3),
  bogeyPenalty: z.coerce.number().min(0).default(0.5),
  missedCutPenalty: z.coerce.number().min(0).default(5),
  replacementTopRankLockout: z.coerce.number().min(0).default(10),
  scoringPlaces: z.coerce.number().min(1).default(50),
  firstPlacePoints: z.coerce.number().min(1).default(50),
  requireAmerican: z.boolean().default(true),
  requireEuropean: z.boolean().default(true),
  requireRow: z.boolean().default(true),
  requireOutsideTop30: z.boolean().default(true),
  visibility: z.enum(["public", "private"]).default("private"),
  joinMode: z.enum(["open_join", "approval_required", "invite_only", "link_only"]).default("invite_only"),
});
type FormValues = z.infer<typeof schema>;

export default function NewTournamentPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createMutation = useCreateTournament();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "", courseName: "", startDate: "", endDate: "", notes: "",
      salaryCap: 100, salaryMax: 30, salaryMin: 3,
      captainMultiplier: 2, birdiePoints: 1, eaglePoints: 3, bogeyPenalty: 0.5,
      missedCutPenalty: 5, replacementTopRankLockout: 10,
      scoringPlaces: 50, firstPlacePoints: 50,
      requireAmerican: true, requireEuropean: true, requireRow: true, requireOutsideTop30: true,
      visibility: "private" as const,
      joinMode: "invite_only" as const,
    },
  });

  const onSubmit = (values: FormValues) => {
    createMutation.mutate({
      data: {
        name: values.name,
        courseName: values.courseName || null,
        startDate: values.startDate,
        endDate: values.endDate,
        notes: values.notes || null,
        visibility: values.visibility,
        joinMode: values.joinMode,
        config: {
          salaryCap: values.salaryCap,
          salaryMax: values.salaryMax,
          salaryMin: values.salaryMin,
          captainMultiplier: values.captainMultiplier,
          birdiePoints: values.birdiePoints,
          eaglePoints: values.eaglePoints,
          bogeyPenalty: values.bogeyPenalty,
          missedCutPenalty: values.missedCutPenalty,
          replacementTopRankLockout: values.replacementTopRankLockout,
          scoringPlaces: values.scoringPlaces,
          firstPlacePoints: values.firstPlacePoints,
          requireAmerican: values.requireAmerican,
          requireEuropean: values.requireEuropean,
          requireRow: values.requireRow,
          requireOutsideTop30: values.requireOutsideTop30,
          rosterSize: 4,
        },
      },
    }, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListTournamentsQueryKey() });
        const t = data as { id: number };
        setLocation(`/tournaments/${t.id}`);
      },
      onError: (err) => {
        const msg = (err as { data?: { error?: string } }).data?.error ?? "Failed to create tournament";
        form.setError("name", { message: msg });
      },
    });
  };

  return (
    <Layout>
      <div className="p-8 max-w-2xl mx-auto">
        <div className="mb-6">
          <Link href="/tournaments" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Tournaments
          </Link>
        </div>

        <h1 className="text-2xl font-bold text-foreground mb-6">New Tournament</h1>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Tournament details */}
            <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
              <h2 className="font-semibold text-foreground">Tournament Details</h2>
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Tournament Name</FormLabel>
                  <FormControl><Input {...field} data-testid="input-name" placeholder="e.g. The Masters 2025" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="courseName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Course Name (optional)</FormLabel>
                  <FormControl><Input {...field} data-testid="input-course" placeholder="e.g. Augusta National" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="startDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl><Input {...field} type="date" data-testid="input-start-date" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="endDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date</FormLabel>
                    <FormControl><Input {...field} type="date" data-testid="input-end-date" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl><Textarea {...field} data-testid="input-notes" placeholder="Any notes about this tournament..." rows={2} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Salary config */}
            <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
              <h2 className="font-semibold text-foreground">Salary Settings</h2>
              <div className="grid grid-cols-3 gap-4">
                <FormField control={form.control} name="salaryCap" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Salary Cap</FormLabel>
                    <FormControl><Input {...field} type="number" data-testid="input-salary-cap" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="salaryMax" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Salary</FormLabel>
                    <FormControl><Input {...field} type="number" data-testid="input-salary-max" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="salaryMin" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Min Salary</FormLabel>
                    <FormControl><Input {...field} type="number" data-testid="input-salary-min" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            {/* Scoring config */}
            <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
              <h2 className="font-semibold text-foreground">Scoring Settings</h2>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="scoringPlaces" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scoring Places</FormLabel>
                    <FormDescription className="text-xs">Number of finishing positions that score</FormDescription>
                    <FormControl><Input {...field} type="number" data-testid="input-scoring-places" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="firstPlacePoints" render={({ field }) => (
                  <FormItem>
                    <FormLabel>1st Place Points</FormLabel>
                    <FormDescription className="text-xs">Auto-calculates curve down to 1pt</FormDescription>
                    <FormControl><Input {...field} type="number" data-testid="input-first-place-points" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="captainMultiplier" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Captain Multiplier</FormLabel>
                    <FormControl><Input {...field} type="number" step="0.5" data-testid="input-captain-mult" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="missedCutPenalty" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Missed Cut Penalty</FormLabel>
                    <FormControl><Input {...field} type="number" step="0.5" data-testid="input-mc-penalty" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="birdiePoints" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Birdie Points</FormLabel>
                    <FormControl><Input {...field} type="number" step="0.5" data-testid="input-birdie-points" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="eaglePoints" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Eagle Points</FormLabel>
                    <FormControl><Input {...field} type="number" step="0.5" data-testid="input-eagle-points" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="bogeyPenalty" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bogey Penalty</FormLabel>
                    <FormControl><Input {...field} type="number" step="0.5" data-testid="input-bogey-penalty" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="replacementTopRankLockout" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Replacement Lockout (top N)</FormLabel>
                    <FormDescription className="text-xs">Replacements can't be from top N ranked</FormDescription>
                    <FormControl><Input {...field} type="number" data-testid="input-lockout" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            {/* Team constraints */}
            <div className="bg-card border border-card-border rounded-xl p-6 space-y-3">
              <h2 className="font-semibold text-foreground">Team Constraints</h2>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { name: "requireAmerican" as const, label: "Require 1 American (US)" },
                  { name: "requireEuropean" as const, label: "Require 1 European (EU)" },
                  { name: "requireRow" as const, label: "Require 1 Rest of World (ROW)" },
                  { name: "requireOutsideTop30" as const, label: "Require 1 outside Top 30" },
                ] as const).map(({ name, label }) => (
                  <FormField key={name} control={form.control} name={name} render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={field.onChange}
                          data-testid={`checkbox-${name}`}
                          className="w-4 h-4 rounded border-border bg-background text-primary focus:ring-primary"
                        />
                      </FormControl>
                      <FormLabel className="font-normal text-sm cursor-pointer">{label}</FormLabel>
                    </FormItem>
                  )} />
                ))}
              </div>
            </div>

            {/* Access Settings */}
            <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
              <h2 className="font-semibold text-foreground">Access Settings</h2>
              <FormField control={form.control} name="visibility" render={({ field }) => (
                <FormItem>
                  <FormLabel>Visibility</FormLabel>
                  <FormDescription className="text-xs">Who can see this tournament in the list</FormDescription>
                  <div className="flex gap-3 mt-2">
                    {([
                      { value: "private" as const, label: "Private", desc: "Only invited members can see it" },
                      { value: "public" as const, label: "Public", desc: "Anyone can discover it" },
                    ]).map(({ value, label, desc }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => field.onChange(value)}
                        data-testid={`visibility-${value}`}
                        className={`flex-1 py-2.5 px-4 rounded-lg border text-sm text-left transition-all ${field.value === value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
                      >
                        <div className="font-medium">{label}</div>
                        <div className="text-xs opacity-75 mt-0.5">{desc}</div>
                      </button>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="joinMode" render={({ field }) => (
                <FormItem>
                  <FormLabel>Join Mode</FormLabel>
                  <FormDescription className="text-xs">How new players can enter the tournament</FormDescription>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    {([
                      { value: "invite_only" as const, label: "Invite Only", desc: "Commissioner invites each player" },
                      { value: "approval_required" as const, label: "Approval Required", desc: "Players request; commissioner approves" },
                      { value: "open_join" as const, label: "Open Join", desc: "Anyone can join immediately" },
                      { value: "link_only" as const, label: "Link Only", desc: "Join via secret invite link" },
                    ]).map(({ value, label, desc }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => field.onChange(value)}
                        data-testid={`join-mode-${value}`}
                        className={`py-2.5 px-4 rounded-lg border text-sm text-left transition-all ${field.value === value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
                      >
                        <div className="font-medium">{label}</div>
                        <div className="text-xs opacity-75 mt-0.5">{desc}</div>
                      </button>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="flex gap-3">
              <Button variant="outline" type="button" onClick={() => setLocation("/tournaments")}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-tournament">
                {createMutation.isPending ? "Creating..." : "Create Tournament"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </Layout>
  );
}
