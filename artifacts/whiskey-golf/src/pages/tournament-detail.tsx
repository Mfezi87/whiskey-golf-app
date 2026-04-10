import { useState, useRef, useEffect } from "react";
import { useRoute, Link, useLocation } from "wouter";
import {
  useGetTournament,
  useGetTournamentConfig,
  useGetTournamentGolfers,
  useGetDraftState,
  useGetTournamentResults,
  useGetTournamentScores,
  useGetPositionPoints,
  useUploadGolfersCsv,
  useAutoGenerateSalaries,
  useMakeDraftPick,
  useRemoveDraftPick,
  useSetCaptain,
  useLockDraft,
  useUpdateTournament,
  useUpsertGolferResult,
  useCompleteTournament,
  useJoinTournament,
  useUpdateTournamentConfig,
  useSetPositionPoints,
  useUpsertReplacementResult,
  getGetTournamentQueryKey,
  getGetDraftStateQueryKey,
  getGetTournamentGolfersQueryKey,
  getGetTournamentResultsQueryKey,
  getGetTournamentScoresQueryKey,
  getGetTournamentConfigQueryKey,
  getGetPositionPointsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Upload, RefreshCw, Trophy, User, Star, Lock, CheckCircle2, Plus, Minus, AlertTriangle, Trash2 } from "lucide-react";
import { useInterval } from "@/hooks/useInterval";

type Tab = "golfers" | "draft" | "results" | "scores" | "participants" | "settings";

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    draft: "bg-muted text-muted-foreground border-muted-border",
    live: "bg-green-900/40 text-green-400 border-green-700/50",
    completed: "bg-primary/20 text-primary border-primary/30",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${variants[status] ?? variants.draft}`}>
      {status === "live" && <span className="w-1.5 h-1.5 rounded-full bg-green-400 mr-1.5 animate-pulse" />}
      {status}
    </span>
  );
}

export default function TournamentDetailPage() {
  const [, params] = useRoute("/tournaments/:id");
  const id = Number(params?.id);
  const [tab, setTab] = useState<Tab>("golfers");
  const [manageMode, setManageMode] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: tournament, isLoading: tLoading } = useGetTournament(id, {
    query: { queryKey: getGetTournamentQueryKey(id), enabled: !isNaN(id) },
  });
  const t = tournament as { id: number; name: string; courseName?: string | null; startDate: string; endDate: string; status: string; notes?: string | null; winnerId?: number | null; commissionerUserId?: number | null; visibility?: string; joinMode?: string } | undefined;

  const { data: tournamentConfig } = useGetTournamentConfig(id, {
    query: { queryKey: getGetTournamentConfigQueryKey(id), enabled: !isNaN(id) },
  });
  const config = tournamentConfig as {
    id: number; tournamentId: number;
    draftType: "alternate" | "snake";
    salaryCap: number; rosterSize: number; captainMultiplier: number;
    birdiePoints: number; eaglePoints: number; bogeyPenalty: number;
    missedCutPenalty: number; replacementTopRankLockout: number;
    requireAmerican: boolean; requireEuropean: boolean; requireRow: boolean;
    requireOutsideTop30: boolean; salaryMin: number; salaryMax: number;
    scoringPlaces: number; firstPlacePoints: number;
  } | undefined;

  const { data: positionPointsData } = useGetPositionPoints(id, {
    query: { queryKey: getGetPositionPointsQueryKey(id), enabled: !isNaN(id) },
  });
  const positionPoints = (positionPointsData as { position: number; points: number }[] | undefined) ?? [];
  const setPositionPointsMutation = useSetPositionPoints();
  const invalidatePositionPoints = () => queryClient.invalidateQueries({ queryKey: getGetPositionPointsQueryKey(id) });

  const { data: golfers, isLoading: gLoading } = useGetTournamentGolfers(id, {
    query: { queryKey: getGetTournamentGolfersQueryKey(id), enabled: !isNaN(id) },
  });
  const golferList = (golfers as { id: number; golferName: string; nationality?: string | null; region?: string | null; worldRanking?: number | null; salary: number; isCaptainEligible?: boolean }[] | undefined) ?? [];

  const { data: draftState, isLoading: dLoading } = useGetDraftState(id, {
    query: { queryKey: getGetDraftStateQueryKey(id), enabled: !isNaN(id) },
  });

  type DraftPick = {
    id: number;
    fantasyTeamId: number;
    golferPoolId: number;
    golferName: string;
    region: string;
    salary: number | null;
    isCaptain: boolean;
    slotNumber: number;
  };
  type DraftTeam = {
    id: number;
    userId: number;
    userName: string;
    userDisplayName: string;
    totalSalary: number;
    isWinner: boolean;
    picks: DraftPick[];
  };
  type DraftStateShape = {
    tournamentId: number;
    status: string;
    isLocked: boolean;
    currentTurnUserId: number | null;
    currentTurnUserName: string | null;
    teams: DraftTeam[];
    availableGolfers: { id: number; golferName: string; salary: number | null; region: string }[];
    validation: { teamId: number | null; type: string; message: string; valid: boolean }[];
  };
  const draft = draftState as DraftStateShape | undefined;

  const { data: results } = useGetTournamentResults(id, {
    query: { queryKey: getGetTournamentResultsQueryKey(id), enabled: !isNaN(id) },
  });
  const resultList = (results as { golferPoolId: number; golferName: string; finishPosition?: number | null; birdies?: number | null; eagles?: number | null; bogeys?: number | null; missedCut: boolean }[] | undefined) ?? [];

  const { data: scores } = useGetTournamentScores(id, {
    query: { queryKey: getGetTournamentScoresQueryKey(id), enabled: !isNaN(id) },
  });
  const scoreList = ((scores as {
    teams?: {
      userId: number;
      userDisplayName: string;
      totalScore: number;
      slots: { pickId: number; golferName: string; isCaptain: boolean; missedCut: boolean; finalScore: number; finishPoints: number; birdiePoints: number; eaglePoints: number; bogeyPenalty: number; missedCutPenalty: number; replacementScore: number; replacementGolferName?: string | null }[];
    }[]
  } | undefined)?.teams) ?? [];

  // Poll draft state every 5s when on draft tab, scores every 15s on scores tab
  useInterval(() => {
    if (tab === "draft") queryClient.invalidateQueries({ queryKey: getGetDraftStateQueryKey(id) });
    if (tab === "scores") { queryClient.invalidateQueries({ queryKey: getGetTournamentScoresQueryKey(id) }); queryClient.invalidateQueries({ queryKey: getGetTournamentResultsQueryKey(id) }); }
  }, (tab === "draft" || tab === "scores") ? 15000 : null);

  const uploadCsvMutation = useUploadGolfersCsv();
  const autoSalaryMutation = useAutoGenerateSalaries();
  const pickMutation = useMakeDraftPick();
  const removeMutation = useRemoveDraftPick();
  const captainMutation = useSetCaptain();
  const lockMutation = useLockDraft();
  const resultMutation = useUpsertGolferResult();
  const completeMutation = useCompleteTournament();
  const updateMutation = useUpdateTournament();
  const joinMutation = useJoinTournament();
  const updateConfigMutation = useUpdateTournamentConfig();
  const replacementMutation = useUpsertReplacementResult();

  const invalidateDraft = () => queryClient.invalidateQueries({ queryKey: getGetDraftStateQueryKey(id) });
  const invalidateGolfers = () => queryClient.invalidateQueries({ queryKey: getGetTournamentGolfersQueryKey(id) });
  const invalidateResults = () => { queryClient.removeQueries({ queryKey: getGetTournamentResultsQueryKey(id) }); queryClient.invalidateQueries({ queryKey: getGetTournamentResultsQueryKey(id) }); };
  const invalidateScores = () => { queryClient.removeQueries({ queryKey: getGetTournamentScoresQueryKey(id) }); queryClient.invalidateQueries({ queryKey: getGetTournamentScoresQueryKey(id) }); };
  const invalidateConfig = () => queryClient.invalidateQueries({ queryKey: getGetTournamentConfigQueryKey(id) });

  // Persist results edit state at parent level so it survives tab switches
  const [resultsEditState, setResultsEditState] = useState<Record<number, ResultEditEntry>>({});
  const [resultsRepState, setResultsRepState] = useState<Record<number, ResultRepEntry>>({});

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const csvData = evt.target?.result as string;
      if (!csvData) return;
      uploadCsvMutation.mutate(
        { id, data: { csvData, replaceExisting: true } },
        {
          onSuccess: (data) => {
            invalidateGolfers();
            e.target.value = "";
            const d = data as { imported?: number; skipped?: number; errors?: string[] };
            toast({
              title: `Uploaded ${d.imported ?? 0} golfers`,
              description: d.errors && d.errors.length > 0 ? `${d.skipped ?? 0} skipped: ${d.errors.slice(0, 3).join("; ")}` : d.skipped ? `${d.skipped} row(s) skipped (header)` : undefined,
            });
          },
          onError: (err) => {
            e.target.value = "";
            toast({ title: "Upload failed", description: (err as Error).message, variant: "destructive" });
          },
        }
      );
    };
    reader.readAsText(file, "windows-1252");
  };

  const handleAutoSalary = () => {
    autoSalaryMutation.mutate(
      { id, data: { salaryMin: config?.salaryMin ?? 3, salaryMax: config?.salaryMax ?? 30 } },
      { onSuccess: invalidateGolfers }
    );
  };

  const handlePick = (golferPoolId: number, teamId: number) => {
    pickMutation.mutate(
      { id, data: { golferPoolId, teamId } },
      {
        onSuccess: invalidateDraft,
        onError: (err) => toast({ title: "Pick failed", description: (err as Error).message, variant: "destructive" }),
      }
    );
  };

  const handleRemovePick = (pickId: number) => {
    removeMutation.mutate({ id, data: { pickId } }, { onSuccess: invalidateDraft });
  };

  const handleCaptain = (pickId: number, teamId: number) => {
    captainMutation.mutate({ id, data: { pickId, teamId } }, { onSuccess: invalidateDraft });
  };

  const handleJoin = () => {
    joinMutation.mutate({ id }, {
      onSuccess: () => { invalidateDraft(); toast({ title: "Joined tournament!", description: "You're now in the draft." }); },
      onError: (err) => toast({ title: "Could not join", description: (err as Error).message, variant: "destructive" }),
    });
  };

  const handleLockDraft = () => {
    lockMutation.mutate({ id }, {
      onSuccess: () => {
        invalidateDraft();
        updateMutation.mutate({ id, data: { status: "live" } }, {
          onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetTournamentQueryKey(id) }),
        });
      },
    });
  };

  const handleComplete = () => {
    completeMutation.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTournamentQueryKey(id) });
        invalidateScores();
      },
    });
  };

  const myTeam = draft?.teams?.find(t => t.userId === user?.id);
  const hasJoined = !!myTeam;
  const isMyTurn = draft?.currentTurnUserId === user?.id;
  const currentTurnTeam = draft?.teams?.find(t => t.userId === draft?.currentTurnUserId);
  const pickedGolferIds = new Set(draft?.teams?.flatMap(t => t.picks.map(p => p.golferPoolId)) ?? []);
  // In manage mode, we pick for the team whose turn it is
  const activeTeamForPick = manageMode ? currentTurnTeam : myTeam;
  const canPick = !draft?.isLocked && (isMyTurn || manageMode) && !!activeTeamForPick;

  // Only show drafted golfers in the results tab
  const draftedGolferList = pickedGolferIds.size > 0
    ? golferList.filter(g => pickedGolferIds.has(g.id))
    : golferList;

  // Validation helpers for draft rules
  const draftValidation = draft?.validation ?? [];
  const allDraftErrors = draftValidation.filter(v => !v.valid);
  const activeTeamErrors = draftValidation.filter(v => !v.valid && v.teamId === (activeTeamForPick as { id?: number } | undefined)?.id);
  const needsAmerican = activeTeamErrors.some(w => w.type === "missing_american");
  const needsEuropean = activeTeamErrors.some(w => w.type === "missing_european");
  const needsRow = activeTeamErrors.some(w => w.type === "missing_row");
  const needsOutsideTop30 = activeTeamErrors.some(w => w.type === "missing_outside_top30");
  const getNeededBadge = (g: { region?: string | null; worldRanking?: number | null }) => {
    if (needsAmerican && g.region === "US") return "🇺🇸 Needed";
    if (needsEuropean && g.region === "EU") return "🇪🇺 Needed";
    if (needsRow && g.region === "ROW") return "🌏 Needed";
    if (needsOutsideTop30 && (g.worldRanking == null || g.worldRanking > 30)) return "🎯 Needed";
    return null;
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "golfers", label: "Golfers" },
    { key: "draft", label: "Draft Room" },
    { key: "results", label: "Results" },
    { key: "scores", label: "Scores" },
    { key: "participants", label: "Participants" },
    { key: "settings", label: "Settings" },
  ];

  if (tLoading) {
    return (
      <Layout>
        <div className="p-8 space-y-4">
          <div className="h-8 bg-muted rounded w-64 animate-pulse" />
          <div className="h-40 bg-muted rounded-xl animate-pulse" />
        </div>
      </Layout>
    );
  }

  if (!t) {
    return <Layout><div className="p-8 text-muted-foreground">Tournament not found</div></Layout>;
  }

  return (
    <Layout>
      <div className="p-4 sm:p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-4 sm:mb-6">
          <Link href="/tournaments" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Tournaments
          </Link>
        </div>

        <div className="flex items-start justify-between mb-4 sm:mb-6 gap-4">
          <div className="min-w-0">
            <div className="flex items-center flex-wrap gap-2 mb-1">
              <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">{t.name}</h1>
              <StatusBadge status={t.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {t.startDate} — {t.endDate}
              {t.courseName && ` · ${t.courseName}`}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {t.status === "draft" && !draft?.isLocked && (
              <Button variant="outline" size="sm" onClick={handleLockDraft} disabled={lockMutation.isPending} data-testid="button-lock-draft">
                <Lock className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Lock Draft & Go Live</span>
              </Button>
            )}
            {t.status === "live" && (
              <Button size="sm" onClick={handleComplete} disabled={completeMutation.isPending} data-testid="button-complete">
                <CheckCircle2 className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">{completeMutation.isPending ? "Completing..." : "Complete Tournament"}</span>
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-border mb-4 sm:mb-6 overflow-x-auto">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              data-testid={`tab-${key}`}
              className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                tab === key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* GOLFERS TAB */}
        {tab === "golfers" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="file"
                ref={fileRef}
                accept=".csv"
                className="hidden"
                onChange={handleCsvUpload}
                data-testid="input-csv"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploadCsvMutation.isPending}
                data-testid="button-upload-csv"
              >
                <Upload className="w-4 h-4 mr-2" />
                {uploadCsvMutation.isPending ? "Uploading..." : "Upload CSV"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAutoSalary}
                disabled={autoSalaryMutation.isPending}
                data-testid="button-auto-salary"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                {autoSalaryMutation.isPending ? "Generating..." : "Auto-generate Salaries"}
              </Button>
              <span className="text-xs text-muted-foreground">
                CSV: golferName, nationality, region (EU/US/ROW), avgOdds, worldRanking, salary (opt), marketRank (opt)
              </span>
            </div>

            {gLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />)}
              </div>
            ) : golferList.length === 0 ? (
              <div className="text-center py-12 bg-card border border-card-border rounded-xl">
                <User className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No golfers yet. Upload a CSV to add them.</p>
              </div>
            ) : (
              <div className="bg-card border border-card-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="border-b border-border">
                    <tr className="text-left">
                      <th className="px-4 py-3 text-muted-foreground font-medium">Golfer</th>
                      <th className="px-4 py-3 text-muted-foreground font-medium">Region</th>
                      <th className="px-4 py-3 text-muted-foreground font-medium">Ranking</th>
                      <th className="px-4 py-3 text-muted-foreground font-medium text-right">Salary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {golferList.map(g => (
                      <tr key={g.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground">{g.golferName}</td>
                        <td className="px-4 py-3 text-muted-foreground">{g.region ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">#{g.worldRanking ?? "—"}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-primary">${g.salary}M</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* DRAFT TAB */}
        {tab === "draft" && (
          <div className="space-y-4">
            {/* Join banner / Manage draft controls */}
            {!draft?.isLocked && (
              <div className="flex items-center justify-between bg-card border border-card-border rounded-xl px-5 py-3">
                <div>
                  {!hasJoined ? (
                    <p className="text-sm text-muted-foreground">You haven't joined this tournament yet.</p>
                  ) : manageMode ? (
                    <p className="text-sm text-green-400 font-medium">
                      Manage mode: picking for <span className="font-bold">{activeTeamForPick?.userDisplayName ?? "..."}</span>
                    </p>
                  ) : isMyTurn ? (
                    <p className="text-sm text-green-400 font-medium flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                      It's your turn to pick
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Waiting for <span className="text-foreground font-medium">{draft?.currentTurnUserName ?? "..."}</span> to pick
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {!hasJoined && (
                    <Button size="sm" onClick={handleJoin} disabled={joinMutation.isPending}>
                      {joinMutation.isPending ? "Joining..." : "Join Tournament"}
                    </Button>
                  )}
                  {hasJoined && (
                    <Button
                      size="sm"
                      variant={manageMode ? "default" : "outline"}
                      onClick={() => setManageMode(m => !m)}
                    >
                      {manageMode ? "Exit Manage Mode" : "Manage Draft"}
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
              {/* Pick panel */}
              <div className="space-y-4 lg:col-span-1">
                <div className="bg-card border border-card-border rounded-xl overflow-hidden">
                  <div className="p-3 sm:p-4 border-b border-border">
                    <h3 className="font-semibold text-foreground">
                      {draft?.isLocked
                        ? "Draft Locked"
                        : canPick
                        ? manageMode
                          ? `Picking for ${activeTeamForPick?.userDisplayName ?? "..."}`
                          : "Your Pick"
                        : !hasJoined
                        ? "Join to draft"
                        : `${draft?.currentTurnUserName ?? "..."}'s turn`}
                    </h3>
                    {canPick && (needsAmerican || needsEuropean || needsRow || needsOutsideTop30) && (
                      <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                        Golfers marked "Needed" satisfy your remaining requirements
                      </p>
                    )}
                  </div>
                  <div className="divide-y divide-border max-h-[22rem] sm:max-h-[28rem] overflow-y-auto">
                    {golferList.map(g => {
                      const isPicked = pickedGolferIds.has(g.id);
                      const needed = canPick ? getNeededBadge(g) : null;
                      return (
                        <div
                          key={g.id}
                          className={`flex items-center justify-between gap-3 px-3 py-2 sm:px-4 sm:py-2.5 ${isPicked ? "opacity-35" : ""} ${needed && !isPicked ? "bg-green-950/10" : ""}`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{g.golferName}</p>
                              {needed && !isPicked && (
                                <span className="text-xs text-green-400 font-medium">{needed}</span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{g.region} · #{g.worldRanking ?? "—"} · ${g.salary}M</p>
                          </div>
                          {!isPicked && canPick && (
                            <Button
                              size="sm"
                              variant={needed ? "default" : "ghost"}
                              onClick={() => handlePick(g.id, activeTeamForPick!.id)}
                              disabled={pickMutation.isPending}
                              data-testid={`button-pick-${g.id}`}
                              className="shrink-0"
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Teams */}
              <div className="space-y-4 lg:col-span-2">
                {dLoading ? (
                  <div className="space-y-3">
                    {[...Array(2)].map((_, i) => <div key={i} className="h-40 bg-muted rounded-xl animate-pulse" />)}
                  </div>
                ) : !draft?.teams?.length ? (
                  <div className="text-center py-12 bg-card border border-card-border rounded-xl">
                    <User className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No players have joined yet.</p>
                  </div>
                ) : (
                  draft.teams.map(team => {
                    const isThisMyTeam = team.userId === user?.id;
                    const isThisTeamsTurn = draft.currentTurnUserId === team.userId && !draft.isLocked;
                    const canEditThisTeam = !draft.isLocked && (isThisMyTeam || manageMode);
                    return (
                      <div key={team.userId} className={`bg-card border rounded-xl overflow-hidden ${isThisTeamsTurn ? "border-primary/60" : "border-card-border"}`}>
                        <div className="flex items-start sm:items-center justify-between gap-2 px-4 py-3 border-b border-border">
                          <div className="flex items-center gap-2 min-w-0">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <h3 className="font-semibold text-foreground truncate">{team.userDisplayName}</h3>
                            {isThisMyTeam && <span className="text-xs text-muted-foreground">(you)</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground text-right leading-tight">
                              ${team.totalSalary?.toFixed(1) ?? 0}M
                              {config?.salaryCap ? (
                                <span className={`ml-1 font-medium ${(config.salaryCap - (team.totalSalary ?? 0)) < 5 ? "text-green-400" : "text-muted-foreground"} block sm:inline`}>
                                  / ${config.salaryCap}M cap ({((config.salaryCap ?? 0) - (team.totalSalary ?? 0)).toFixed(1)} left)
                                </span>
                              ) : null}
                            </span>
                            {isThisTeamsTurn && (
                              <span className="text-xs text-primary font-medium animate-pulse">picking...</span>
                            )}
                          </div>
                        </div>
                        <div className="divide-y divide-border">
                          {team.picks.length === 0 ? (
                            <p className="px-4 py-3 text-sm text-muted-foreground">No picks yet</p>
                          ) : (
                            team.picks.map((pick) => (
                              <div key={pick.id} className="flex items-start sm:items-center justify-between gap-2 px-4 py-2.5">
                                <div className="flex items-center gap-2 min-w-0">
                                  {pick.isCaptain && <Star className="w-3.5 h-3.5 text-primary fill-primary" />}
                                  <span className="text-sm font-medium text-foreground truncate">{pick.golferName}</span>
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">${pick.salary}M · {pick.region}</span>
                                </div>
                                {canEditThisTeam && (
                                  <div className="flex gap-1">
                                    {!pick.isCaptain && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleCaptain(pick.id, team.id)}
                                        disabled={captainMutation.isPending}
                                        title="Set as captain"
                                        data-testid={`button-captain-${pick.id}`}
                                      >
                                        <Star className="w-3.5 h-3.5" />
                                      </Button>
                                    )}
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleRemovePick(pick.id)}
                                      disabled={removeMutation.isPending}
                                      title="Remove pick"
                                      data-testid={`button-remove-${pick.id}`}
                                    >
                                      <Minus className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                        {/* Per-team validation warnings */}
                        {(() => {
                          const teamWarnings = draft.validation.filter(v => !v.valid && v.teamId === team.id);
                          if (teamWarnings.length === 0) return null;
                          return (
                            <div className="px-4 py-2.5 border-t border-border bg-green-950/20 flex flex-wrap gap-2">
                              {teamWarnings.map(w => (
                                <span
                                  key={w.type}
                                  className="inline-flex items-center gap-1 text-xs text-green-300 bg-green-900/30 border border-green-700/40 rounded-full px-2.5 py-0.5"
                                >
                                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                                  {w.type === "missing_american" ? "Needs 1 American" :
                                   w.type === "missing_european" ? "Needs 1 European" :
                                   w.type === "missing_row" ? "Needs 1 Rest of World" :
                                   w.type === "missing_outside_top30" ? "Needs 1 outside top 30" :
                                   w.type === "no_captain" ? "No captain set" :
                                   w.type === "roster_incomplete" ? `${(config?.rosterSize ?? 0) - team.picks.length} more pick(s) needed` :
                                   w.type === "salary_exceeded" ? "Over salary cap" :
                                   w.message}
                                </span>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Global draft validation warnings */}
            {!draft?.isLocked && t.status === "draft" && allDraftErrors.length > 0 && (
              <div className="bg-green-950/20 border border-green-700/40 rounded-xl px-5 py-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-green-300 mb-1">Draft cannot be locked yet</p>
                    <ul className="text-xs text-green-400/80 space-y-0.5 list-disc list-inside">
                      {allDraftErrors.map(e => <li key={`${e.teamId}-${e.type}`}>{e.message}</li>)}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* RESULTS TAB */}
        {tab === "results" && (
          <ResultsTab
            tournamentId={id}
            draftedGolferList={draftedGolferList}
            golferList={golferList}
            resultList={resultList}
            onSaved={() => { invalidateResults(); invalidateScores(); }}
            resultMutation={resultMutation}
            replacementMutation={replacementMutation}
            config={config}
            positionPoints={positionPoints}
            editState={resultsEditState}
            setEditState={setResultsEditState}
            repState={resultsRepState}
            setRepState={setResultsRepState}
          />
        )}

        {/* PARTICIPANTS TAB */}
        {tab === "participants" && (
          <ParticipantsTab
            tournamentId={id}
            userId={user?.id ?? null}
            commissionerUserId={t?.commissionerUserId ?? null}
          />
        )}

        {/* SETTINGS TAB */}
        {tab === "settings" && (
          <ConfigTab
            tournamentId={id}
            tournament={t}
            config={config}
            positionPoints={positionPoints}
            updateConfigMutation={updateConfigMutation}
            setPositionPointsMutation={setPositionPointsMutation}
            updateTournamentMutation={updateMutation}
            userId={user?.id ?? null}
            onSaved={() => { invalidateConfig(); invalidatePositionPoints(); queryClient.invalidateQueries({ queryKey: getGetTournamentQueryKey(id) }); }}
            onDeleteTournament={async () => {
              const res = await fetch(`/api/tournaments/${id}`, { method: "DELETE" });
              if (!res.ok) throw new Error(await res.text());
              queryClient.invalidateQueries({ queryKey: ["listTournaments"] });
              navigate("/tournaments");
            }}
          />
        )}

        {/* SCORES TAB */}
        {tab === "scores" && (
          <ScoresTab scoreList={scoreList} />
        )}
      </div>
    </Layout>
  );
}

type ResultEditEntry = { finishPosition?: string; birdies?: string; eagles?: string; bogeys?: string; missedCut?: boolean; dirty?: boolean };
type ResultRepEntry = { replacementGolferPoolId?: string; finishPosition?: string; birdies?: string; eagles?: string; bogeys?: string; dirty?: boolean };

interface ResultRow {
  golferPoolId: number;
  golferName: string;
  finishPosition?: number | null;
  birdies?: number | null;
  eagles?: number | null;
  bogeys?: number | null;
  missedCut: boolean;
}

function ResultsTab({
  tournamentId,
  draftedGolferList,
  golferList,
  resultList,
  onSaved,
  resultMutation,
  replacementMutation,
  config,
  positionPoints,
  editState,
  setEditState,
  repState,
  setRepState,
}: {
  tournamentId: number;
  draftedGolferList: { id: number; golferName: string }[];
  golferList: { id: number; golferName: string }[];
  resultList: ResultRow[];
  onSaved: () => void;
  resultMutation: ReturnType<typeof useUpsertGolferResult>;
  replacementMutation: ReturnType<typeof useUpsertReplacementResult>;
  config: { birdiePoints: number; eaglePoints: number; bogeyPenalty: number; missedCutPenalty: number } | undefined;
  positionPoints: { position: number; points: number }[];
  editState: Record<number, ResultEditEntry>;
  setEditState: React.Dispatch<React.SetStateAction<Record<number, ResultEditEntry>>>;
  repState: Record<number, ResultRepEntry>;
  setRepState: React.Dispatch<React.SetStateAction<Record<number, ResultRepEntry>>>;
}) {
  const { toast } = useToast();

  const posPointsMap = Object.fromEntries(positionPoints.map(p => [p.position, Number(p.points)]));

  const getSaved = (golferPoolId: number) => resultList.find(r => r.golferPoolId === golferPoolId);
  const getEdit = (golferPoolId: number, field: keyof ResultEditEntry, fallback: string | boolean | null | undefined) => {
    const e = editState[golferPoolId];
    if (e && e[field] !== undefined) return e[field];
    const s = getSaved(golferPoolId);
    if (s && (s as Record<string, unknown>)[field] !== undefined) return (s as Record<string, unknown>)[field];
    return fallback;
  };
  const setEdit = (golferPoolId: number, field: keyof ResultEditEntry, value: string | boolean) => {
    setEditState(prev => ({ ...prev, [golferPoolId]: { ...prev[golferPoolId], [field]: value, dirty: true } }));
  };

  const estimatePoints = (golferPoolId: number, isMC: boolean): number | null => {
    if (isMC) return -(config?.missedCutPenalty ?? 5);
    const pos = Number(getEdit(golferPoolId, "finishPosition", "")) || null;
    const bi = Number(getEdit(golferPoolId, "birdies", "")) || 0;
    const ea = Number(getEdit(golferPoolId, "eagles", "")) || 0;
    const bo = Number(getEdit(golferPoolId, "bogeys", "")) || 0;
    if (!pos && !bi && !ea && !bo) return null;
    const pp = pos ? (posPointsMap[pos] ?? 0) : 0;
    return pp + bi * (config?.birdiePoints ?? 1) + ea * (config?.eaglePoints ?? 3) - bo * (config?.bogeyPenalty ?? 0.5);
  };

  const saveResult = (golferPoolId: number) => {
    const s = getSaved(golferPoolId);
    const e = editState[golferPoolId] ?? {};
    const isMC = Boolean(e.missedCut !== undefined ? e.missedCut : s?.missedCut ?? false);
    resultMutation.mutate(
      {
        id: tournamentId,
        golferPoolId,
        data: {
          finishPosition: isMC ? null : (Number(e.finishPosition ?? s?.finishPosition ?? 0) || null),
          birdies: isMC ? null : (Number(e.birdies ?? s?.birdies ?? 0) || null),
          eagles: isMC ? null : (Number(e.eagles ?? s?.eagles ?? 0) || null),
          bogeys: isMC ? null : (Number(e.bogeys ?? s?.bogeys ?? 0) || null),
          missedCut: isMC,
        },
      },
      {
        onSuccess: () => {
          setEditState(prev => { const n = { ...prev }; if (n[golferPoolId]) n[golferPoolId].dirty = false; return n; });
          onSaved();
          toast({ title: "Result saved!" });
        },
        onError: (err) => toast({ title: "Save failed", description: (err as Error).message, variant: "destructive" }),
      }
    );
  };

  const saveReplacement = (originalGolferPoolId: number) => {
    const rep = repState[originalGolferPoolId] ?? {};
    const replacementGolferPoolId = Number(rep.replacementGolferPoolId);
    if (!replacementGolferPoolId) { toast({ title: "Select a replacement golfer first", variant: "destructive" }); return; }
    replacementMutation.mutate(
      {
        id: tournamentId,
        golferPoolId: originalGolferPoolId,
        data: {
          replacementGolferPoolId,
          finishPosition: Number(rep.finishPosition) || null,
          birdies: Number(rep.birdies) || null,
          eagles: Number(rep.eagles) || null,
          bogeys: Number(rep.bogeys) || null,
        },
      },
      {
        onSuccess: () => {
          setRepState(prev => { const n = { ...prev }; if (n[originalGolferPoolId]) n[originalGolferPoolId].dirty = false; return n; });
          onSaved();
          toast({ title: "Replacement saved!" });
        },
        onError: (err) => toast({ title: "Save failed", description: (err as Error).message, variant: "destructive" }),
      }
    );
  };

  const mcDraftedGolfers = draftedGolferList.filter(g => {
    const e = editState[g.id];
    const s = getSaved(g.id);
    return Boolean(e?.missedCut !== undefined ? e.missedCut : s?.missedCut ?? false);
  });
  // Golfers in the full pool who made the cut (for replacement selection)
  const madeTheCutPool = golferList.filter(gl => !resultList.find(r => r.golferPoolId === gl.id && r.missedCut));

  return (
    <div className="space-y-4">
      {draftedGolferList.length === 0 && (
        <div className="text-center py-12 bg-card border border-card-border rounded-xl">
          <p className="text-sm text-muted-foreground">No golfers drafted yet. Complete the draft first.</p>
        </div>
      )}
      {draftedGolferList.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">Tournament Results</span>
            <span className="text-xs text-muted-foreground">Showing {draftedGolferList.length} drafted golfer{draftedGolferList.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr className="text-left">
                  <th className="px-4 py-3 text-muted-foreground font-medium">Golfer</th>
                  <th className="px-4 py-3 text-muted-foreground font-medium text-center">Position</th>
                  <th className="px-4 py-3 text-muted-foreground font-medium text-center">Birdies</th>
                  <th className="px-4 py-3 text-muted-foreground font-medium text-center">Eagles</th>
                  <th className="px-4 py-3 text-muted-foreground font-medium text-center">Bogeys</th>
                  <th className="px-4 py-3 text-muted-foreground font-medium text-center">MC</th>
                  <th className="px-4 py-3 text-muted-foreground font-medium text-right">Est. Pts</th>
                  <th className="px-4 py-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {draftedGolferList.map(g => {
                  const dirty = editState[g.id]?.dirty ?? false;
                  const isMC = Boolean(getEdit(g.id, "missedCut", getSaved(g.id)?.missedCut ?? false));
                  const est = estimatePoints(g.id, isMC);
                  return (
                    <tr key={g.id} className={`${dirty ? "bg-primary/5" : isMC ? "bg-red-950/20" : "hover:bg-muted/20"} transition-colors`}>
                      <td className="px-4 py-2.5 font-medium">
                        <span className={isMC ? "line-through text-muted-foreground" : "text-foreground"}>{g.golferName}</span>
                        {isMC && <span className="ml-2 text-xs text-red-400 font-medium">MC</span>}
                      </td>
                      {(["finishPosition", "birdies", "eagles", "bogeys"] as const).map(field => (
                        <td key={field} className="px-2 py-2 text-center">
                          <Input
                            type="number"
                            min="0"
                            value={String(getEdit(g.id, field, getSaved(g.id)?.[field] ?? "") ?? "")}
                            onChange={e => setEdit(g.id, field, e.target.value)}
                            data-testid={`input-${field}-${g.id}`}
                            className="w-16 h-8 text-center text-xs mx-auto"
                            disabled={isMC}
                            placeholder="—"
                          />
                        </td>
                      ))}
                      <td className="px-4 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={isMC}
                          onChange={e => setEdit(g.id, "missedCut", e.target.checked)}
                          data-testid={`checkbox-mc-${g.id}`}
                          className="w-4 h-4 rounded border-border bg-background text-primary cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {est !== null ? (
                          <span className={`text-sm font-semibold ${est < 0 ? "text-red-400" : est > 0 ? "text-green-400" : "text-muted-foreground"}`}>
                            {est > 0 ? "+" : ""}{est.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <Button
                          size="sm"
                          variant={dirty ? "default" : "ghost"}
                          onClick={() => saveResult(g.id)}
                          disabled={resultMutation.isPending}
                          data-testid={`button-save-result-${g.id}`}
                        >
                          Save
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Missed Cut Replacements */}
      {mcDraftedGolfers.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-red-950/20">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <div>
              <span className="text-sm font-semibold text-red-400">Missed Cut Replacements</span>
              <span className="text-xs text-muted-foreground ml-2">— MC players only receive the missed cut penalty. Assign a replacement golfer to earn additional points.</span>
            </div>
          </div>
          <div className="divide-y divide-border">
            {mcDraftedGolfers.map(g => {
              const rep = repState[g.id] ?? {};
              const repDirty = rep.dirty ?? false;
              return (
                <div key={g.id} className="px-5 py-4 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-red-400 line-through">{g.golferName}</span>
                    <span className="text-xs text-green-400 bg-green-900/30 border border-green-700/40 rounded-full px-2 py-0.5">
                      MC penalty: -{config?.missedCutPenalty ?? 5} pts
                    </span>
                    <span className="text-xs text-muted-foreground">→ replacement scores added to team total</span>
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-muted-foreground font-medium">Replacement Golfer</label>
                      <select
                        value={rep.replacementGolferPoolId ?? ""}
                        onChange={e => setRepState(prev => ({ ...prev, [g.id]: { ...prev[g.id], replacementGolferPoolId: e.target.value, dirty: true } }))}
                        className="h-9 px-2 rounded-md border border-input bg-background text-sm text-foreground min-w-[200px]"
                        data-testid={`select-replacement-${g.id}`}
                      >
                        <option value="">— Select golfer —</option>
                        {madeTheCutPool.filter(gl => gl.id !== g.id).map(gl => (
                          <option key={gl.id} value={gl.id}>{gl.golferName}</option>
                        ))}
                      </select>
                    </div>
                    {(["finishPosition", "birdies", "eagles", "bogeys"] as const).map(field => (
                      <div key={field} className="flex flex-col gap-1">
                        <label className="text-xs text-muted-foreground">{field === "finishPosition" ? "Position" : field.charAt(0).toUpperCase() + field.slice(1)}</label>
                        <Input
                          type="number"
                          min="0"
                          value={rep[field] ?? ""}
                          onChange={e => setRepState(prev => ({ ...prev, [g.id]: { ...prev[g.id], [field]: e.target.value, dirty: true } }))}
                          className="w-16 h-9 text-center text-xs"
                          placeholder="—"
                          data-testid={`input-rep-${field}-${g.id}`}
                        />
                      </div>
                    ))}
                    <Button
                      size="sm"
                      variant={repDirty ? "default" : "outline"}
                      onClick={() => saveReplacement(g.id)}
                      disabled={replacementMutation.isPending}
                      data-testid={`button-save-replacement-${g.id}`}
                    >
                      {replacementMutation.isPending ? "Saving..." : "Save Replacement"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ScoresTab({ scoreList }: {
  scoreList: {
    userId: number; userDisplayName: string; totalScore: number;
    slots: { pickId: number; golferName: string; isCaptain: boolean; missedCut: boolean; finalScore: number; finishPoints: number; birdiePoints: number; eaglePoints: number; bogeyPenalty: number; missedCutPenalty: number; replacementScore: number; replacementGolferName?: string | null }[];
  }[]
}) {
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null);

  if (scoreList.length === 0) {
    return (
      <div className="text-center py-12 bg-card border border-card-border rounded-xl">
        <Trophy className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No scores yet. Enter results first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-green-950/20 border border-green-700/30 rounded-lg px-4 py-2.5 flex items-center gap-2">
        <RefreshCw className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
        <p className="text-xs text-green-400">Live scores — updates automatically as results are entered</p>
      </div>
      {scoreList.map((entry, idx) => (
        <div key={entry.userId} className="bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <span className="text-xl font-bold text-muted-foreground w-6">#{idx + 1}</span>
              <h3 className="font-semibold text-foreground">{entry.userDisplayName}</h3>
            </div>
            <span className="text-2xl font-bold text-primary">{(entry.totalScore ?? 0).toFixed(1)} pts</span>
          </div>
          <div className="divide-y divide-border">
            {entry.slots.length === 0 ? (
              <p className="px-5 py-3 text-sm text-muted-foreground">No picks made</p>
            ) : entry.slots.map(slot => {
              const isExpanded = expandedSlot === slot.pickId;
              return (
                <div key={slot.pickId}>
                  <button
                    className="w-full flex items-center justify-between px-5 py-2.5 hover:bg-muted/20 transition-colors text-left"
                    onClick={() => setExpandedSlot(isExpanded ? null : slot.pickId)}
                  >
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      {slot.isCaptain && <Star className="w-3.5 h-3.5 text-primary fill-primary flex-shrink-0" />}
                      <span className={`text-sm ${slot.missedCut ? "line-through text-muted-foreground" : "text-foreground"}`}>{slot.golferName}</span>
                      {slot.isCaptain && <span className="text-xs text-primary font-medium">(C)</span>}
                      {slot.missedCut && <span className="text-xs text-red-400 font-medium bg-red-950/30 rounded px-1.5 py-0.5">MC</span>}
                      {slot.missedCut && slot.replacementGolferName && (
                        <span className="text-xs text-green-400 font-medium">→ {slot.replacementGolferName}</span>
                      )}
                      <span className="text-xs text-muted-foreground ml-1">{isExpanded ? "▲" : "▼"}</span>
                    </div>
                    <span className={`text-sm font-semibold flex-shrink-0 ml-2 ${slot.finalScore < 0 ? "text-red-400" : "text-foreground"}`}>{(slot.finalScore ?? 0).toFixed(1)}</span>
                  </button>
                  {isExpanded && (
                    <div className="px-5 pb-3 bg-muted/10 border-t border-border space-y-3 pt-3">
                      {/* MC player breakdown */}
                      {slot.missedCut ? (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{slot.golferName} (MC)</p>
                          <div className="flex gap-6">
                            <div className="text-center">
                              <p className="text-xs text-muted-foreground mb-1">MC Penalty</p>
                              <p className="text-sm font-semibold text-red-400">-{slot.missedCutPenalty.toFixed(1)}</p>
                            </div>
                          </div>
                          {slot.replacementGolferName && (
                            <>
                              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide border-t border-border pt-2">{slot.replacementGolferName} (replacement)</p>
                              <div className="text-center">
                                <p className="text-xs text-muted-foreground mb-1">Replacement Score</p>
                                <p className={`text-sm font-semibold ${slot.replacementScore > 0 ? "text-green-400" : "text-muted-foreground"}`}>
                                  {slot.replacementScore > 0 ? "+" : ""}{slot.replacementScore.toFixed(1)}
                                </p>
                              </div>
                            </>
                          )}
                        </div>
                      ) : (
                        /* Regular player breakdown */
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                          {[
                            { label: "Finish Pts", value: slot.finishPoints, color: slot.finishPoints > 0 ? "text-green-400" : "text-muted-foreground" },
                            { label: "Birdies", value: slot.birdiePoints, color: slot.birdiePoints > 0 ? "text-green-400" : "text-muted-foreground" },
                            { label: "Eagles", value: slot.eaglePoints, color: slot.eaglePoints > 0 ? "text-green-400" : "text-muted-foreground" },
                            { label: "Bogeys", value: -slot.bogeyPenalty, color: slot.bogeyPenalty > 0 ? "text-red-400" : "text-muted-foreground" },
                          ].map(({ label, value, color }) => (
                            <div key={label} className="text-center">
                              <p className="text-xs text-muted-foreground mb-1">{label}</p>
                              <p className={`text-sm font-semibold ${color}`}>{value > 0 ? "+" : ""}{value.toFixed(1)}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {slot.isCaptain && (
                        <p className="text-xs text-primary/80 text-center border-t border-border pt-2">★ Captain — score doubled</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

type ParticipantRecord = {
  id: number;
  tournamentId: number;
  userId: number;
  username: string;
  displayName: string;
  status: string;
  invitedByUserId: number | null;
  respondedAt: string | null;
  joinedAt: string | null;
  removedAt: string | null;
  createdAt: string;
};

type ParticipantsResponse = {
  participants: ParticipantRecord[];
  myParticipant: ParticipantRecord | null;
  isCommissioner: boolean;
  tournamentJoinMode: string;
  tournamentVisibility: string;
  commissionerUserId: number | null;
};

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    invited: "Invited",
    requested: "Requested",
    joined: "Joined",
    rejected: "Declined",
    removed: "Removed",
    left: "Left",
  };
  return map[status] ?? status;
}

function statusColor(status: string): string {
  const map: Record<string, string> = {
    invited: "text-yellow-400 bg-yellow-900/30 border-yellow-700/40",
    requested: "text-blue-400 bg-blue-900/30 border-blue-700/40",
    joined: "text-green-400 bg-green-900/30 border-green-700/40",
    rejected: "text-muted-foreground bg-muted/30 border-muted/40",
    removed: "text-red-400 bg-red-900/30 border-red-700/40",
    left: "text-muted-foreground bg-muted/30 border-muted/40",
  };
  return map[status] ?? "text-muted-foreground";
}

async function participantsFetch<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function ParticipantsTab({ tournamentId, userId, commissionerUserId }: { tournamentId: number; userId: number | null; commissionerUserId: number | null }) {
  const { toast } = useToast();
  const qk = ["participants", tournamentId];

  const { data, isLoading, refetch } = useQuery<ParticipantsResponse>({
    queryKey: qk,
    queryFn: () => participantsFetch<ParticipantsResponse>(`/api/tournaments/${tournamentId}/participants`),
    retry: 1,
  });

  const [inviteUsername, setInviteUsername] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);

  const invalidate = () => { refetch(); };

  const invite = useMutation({
    mutationFn: (username: string) => participantsFetch(`/api/tournaments/${tournamentId}/invite`, "POST", { username }),
    onSuccess: () => { toast({ title: "Invitation sent!" }); setInviteUsername(""); setInviteError(null); invalidate(); },
    onError: (err: Error) => { setInviteError(err.message); },
  });

  const approve = useMutation({
    mutationFn: (participantId: number) => participantsFetch(`/api/tournaments/${tournamentId}/participants/${participantId}/approve`, "POST"),
    onSuccess: () => { toast({ title: "Approved!" }); invalidate(); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const reject = useMutation({
    mutationFn: (participantId: number) => participantsFetch(`/api/tournaments/${tournamentId}/participants/${participantId}/reject`, "POST"),
    onSuccess: () => { toast({ title: "Rejected" }); invalidate(); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (participantId: number) => participantsFetch(`/api/tournaments/${tournamentId}/participants/${participantId}/remove`, "POST"),
    onSuccess: () => { toast({ title: "Removed from tournament" }); invalidate(); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const accept = useMutation({
    mutationFn: () => participantsFetch(`/api/tournaments/${tournamentId}/accept-invite`, "POST"),
    onSuccess: () => { toast({ title: "You've joined the tournament!" }); invalidate(); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const decline = useMutation({
    mutationFn: () => participantsFetch(`/api/tournaments/${tournamentId}/decline-invite`, "POST"),
    onSuccess: () => { toast({ title: "Invitation declined" }); invalidate(); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const leave = useMutation({
    mutationFn: () => participantsFetch(`/api/tournaments/${tournamentId}/leave`, "POST"),
    onSuccess: () => { toast({ title: "You've left the tournament" }); invalidate(); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const requestJoin = useMutation({
    mutationFn: () => participantsFetch(`/api/tournaments/${tournamentId}/request-join`, "POST"),
    onSuccess: () => { toast({ title: "Join request sent!" }); invalidate(); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const generateLink = useMutation({
    mutationFn: () => participantsFetch<{ token: string; enabled: boolean }>(`/api/tournaments/${tournamentId}/invite-link`, "POST"),
    onSuccess: (d) => {
      const link = `${window.location.origin}/tournaments/${tournamentId}?invite=${(d as { token: string }).token}`;
      navigator.clipboard.writeText(link).catch(() => {});
      toast({ title: "Invite link copied!", description: link });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />)}
      </div>
    );
  }

  if (!data) {
    return <div className="text-center py-12 text-muted-foreground text-sm">Could not load participants</div>;
  }

  const { participants, myParticipant, isCommissioner, tournamentJoinMode } = data;
  const isLegacyTournament = commissionerUserId === null;

  const joinedParticipants = participants.filter(p => p.status === "joined");
  const pendingParticipants = participants.filter(p => p.status === "invited" || p.status === "requested");
  const inactiveParticipants = participants.filter(p => ["rejected", "removed", "left"].includes(p.status));

  const joinModeLabel: Record<string, string> = {
    invite_only: "Invite Only",
    approval_required: "Approval Required",
    open_join: "Open Join",
    link_only: "Link Only",
  };

  return (
    <div className="space-y-4">
      {/* Legacy tournament notice */}
      {isLegacyTournament && (
        <div className="bg-muted/30 border border-border rounded-xl px-5 py-4">
          <p className="text-sm text-muted-foreground font-medium">This is a legacy tournament created before participant management was added.</p>
          <p className="text-xs text-muted-foreground mt-1">No commissioner is set — management controls are unavailable.</p>
        </div>
      )}

      {/* My status banner */}
      {userId && !isCommissioner && !isLegacyTournament && myParticipant && myParticipant.status === "invited" && (
        <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-xl px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-yellow-300">You have a pending invitation to this tournament</p>
            <p className="text-xs text-muted-foreground mt-0.5">Accept to join the draft</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" onClick={() => accept.mutate()} disabled={accept.isPending}>Accept</Button>
            <Button size="sm" variant="outline" onClick={() => decline.mutate()} disabled={decline.isPending}>Decline</Button>
          </div>
        </div>
      )}

      {userId && !isCommissioner && myParticipant && myParticipant.status === "joined" && (
        <div className="bg-card border border-card-border rounded-xl px-5 py-4 flex items-center justify-between gap-4">
          <p className="text-sm text-green-400 font-medium">You are a member of this tournament</p>
          {!isLegacyTournament && (
            <Button size="sm" variant="outline" onClick={() => leave.mutate()} disabled={leave.isPending}>Leave</Button>
          )}
        </div>
      )}

      {userId && !isCommissioner && !myParticipant && !isLegacyTournament && tournamentJoinMode === "open_join" && (
        <div className="bg-card border border-card-border rounded-xl px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">This tournament is open to anyone</p>
            <p className="text-xs text-muted-foreground mt-0.5">Join now to participate in the draft</p>
          </div>
          <Button size="sm" onClick={() => requestJoin.mutate()} disabled={requestJoin.isPending}>Join Tournament</Button>
        </div>
      )}

      {userId && !isCommissioner && !myParticipant && !isLegacyTournament && tournamentJoinMode === "approval_required" && (
        <div className="bg-card border border-card-border rounded-xl px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Request to join this tournament</p>
            <p className="text-xs text-muted-foreground mt-0.5">Commissioner will approve or reject</p>
          </div>
          <Button size="sm" onClick={() => requestJoin.mutate()} disabled={requestJoin.isPending}>Request to Join</Button>
        </div>
      )}

      {userId && !isCommissioner && !myParticipant && !isLegacyTournament && tournamentJoinMode === "link_only" && (
        <div className="bg-card border border-card-border rounded-xl px-5 py-4">
          <p className="text-sm text-muted-foreground">This tournament requires an invite link to join.</p>
          <p className="text-xs text-muted-foreground mt-1">Ask the commissioner for the invite link.</p>
        </div>
      )}

      {userId && !isCommissioner && !myParticipant && !isLegacyTournament && tournamentJoinMode === "invite_only" && (
        <div className="bg-card border border-card-border rounded-xl px-5 py-4">
          <p className="text-sm text-muted-foreground">This tournament is invite-only. Wait for the commissioner to invite you.</p>
        </div>
      )}

      {userId && !isCommissioner && myParticipant && myParticipant.status === "requested" && (
        <div className="bg-blue-900/20 border border-blue-700/40 rounded-xl px-5 py-3">
          <p className="text-sm text-blue-300 font-medium">Your join request is pending commissioner approval</p>
        </div>
      )}

      {/* Commissioner: Invite panel */}
      {isCommissioner && (
        <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground text-sm">Manage Participants</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground px-2 py-1 rounded border border-border">
                {joinModeLabel[tournamentJoinMode] ?? tournamentJoinMode}
              </span>
              {(tournamentJoinMode === "link_only" || tournamentJoinMode === "invite_only" || tournamentJoinMode === "approval_required") && (
                <Button size="sm" variant="outline" onClick={() => generateLink.mutate()} disabled={generateLink.isPending}>
                  Generate Invite Link
                </Button>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Enter username to invite"
              value={inviteUsername}
              onChange={e => { setInviteUsername(e.target.value); setInviteError(null); }}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); invite.mutate(inviteUsername.trim()); } }}
              className="h-9 text-sm flex-1"
              data-testid="input-invite-username"
            />
            <Button size="sm" onClick={() => invite.mutate(inviteUsername.trim())} disabled={invite.isPending || !inviteUsername.trim()} data-testid="button-invite">
              Invite
            </Button>
          </div>
          {inviteError && <p className="text-xs text-destructive">{inviteError}</p>}
        </div>
      )}

      {/* Pending participants (commissioner view) */}
      {isCommissioner && pendingParticipants.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Pending ({pendingParticipants.length})</h3>
          </div>
          <div className="divide-y divide-border">
            {pendingParticipants.map(p => (
              <div key={p.id} className="px-5 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{p.displayName || p.username}</p>
                  <p className="text-xs text-muted-foreground">@{p.username}</p>
                </div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${statusColor(p.status)}`}>{statusLabel(p.status)}</span>
                {p.status === "requested" && (
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" onClick={() => approve.mutate(p.id)} disabled={approve.isPending}>Approve</Button>
                    <Button size="sm" variant="outline" onClick={() => reject.mutate(p.id)} disabled={reject.isPending}>Reject</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Joined members */}
      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Members ({joinedParticipants.length})</h3>
        </div>
        {joinedParticipants.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <User className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No members yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {joinedParticipants.map(p => (
              <div key={p.id} className="px-5 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold shrink-0">
                  {(p.displayName || p.username)[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{p.displayName || p.username}</p>
                  <p className="text-xs text-muted-foreground">@{p.username}</p>
                </div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${statusColor(p.status)}`}>{statusLabel(p.status)}</span>
                {isCommissioner && p.userId !== userId && (
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive shrink-0" onClick={() => remove.mutate(p.id)} disabled={remove.isPending}>
                    Remove
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inactive (commissioner view) */}
      {isCommissioner && inactiveParticipants.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h3 className="text-sm font-medium text-muted-foreground">History ({inactiveParticipants.length})</h3>
          </div>
          <div className="divide-y divide-border">
            {inactiveParticipants.map(p => (
              <div key={p.id} className="px-5 py-3 flex items-center gap-3 opacity-60">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{p.displayName || p.username}</p>
                  <p className="text-xs text-muted-foreground">@{p.username}</p>
                </div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${statusColor(p.status)}`}>{statusLabel(p.status)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ConfigTab({
  tournamentId,
  tournament,
  config,
  positionPoints,
  updateConfigMutation,
  setPositionPointsMutation,
  updateTournamentMutation,
  userId,
  onSaved,
  onDeleteTournament,
}: {
  tournamentId: number;
  tournament: { id: number; name: string; courseName?: string | null; startDate: string; endDate: string; status?: string; notes?: string | null; commissionerUserId?: number | null; visibility?: string; joinMode?: string } | undefined;
  config: {
    draftType: "alternate" | "snake";
    salaryCap: number; rosterSize: number; captainMultiplier: number;
    birdiePoints: number; eaglePoints: number; bogeyPenalty: number;
    missedCutPenalty: number; replacementTopRankLockout: number;
    requireAmerican: boolean; requireEuropean: boolean; requireRow: boolean;
    requireOutsideTop30: boolean; salaryMin: number; salaryMax: number;
    scoringPlaces: number; firstPlacePoints: number;
  } | undefined;
  positionPoints: { position: number; points: number }[];
  updateConfigMutation: ReturnType<typeof useUpdateTournamentConfig>;
  setPositionPointsMutation: ReturnType<typeof useSetPositionPoints>;
  updateTournamentMutation: ReturnType<typeof useUpdateTournament>;
  userId: number | null;
  onSaved: () => void;
  onDeleteTournament: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isCommissioner = tournament?.commissionerUserId != null && userId === tournament.commissionerUserId;
  const isDraftStatus = tournament?.status === "draft" || tournament?.status === undefined;

  type ConfigFields = {
    draftType: "alternate" | "snake";
    salaryCap: string; rosterSize: string; captainMultiplier: string;
    birdiePoints: string; eaglePoints: string; bogeyPenalty: string;
    missedCutPenalty: string; replacementTopRankLockout: string;
    requireAmerican: boolean; requireEuropean: boolean; requireRow: boolean;
    requireOutsideTop30: boolean; salaryMin: string; salaryMax: string;
    scoringPlaces: string; firstPlacePoints: string;
  };
  const [form, setForm] = useState<ConfigFields | null>(null);
  const [tournamentForm, setTournamentForm] = useState<{ name: string; courseName: string; startDate: string; endDate: string; notes: string } | null>(null);
  const [accessForm, setAccessForm] = useState<{ visibility: string; joinMode: string } | null>(null);
  const [accessSaving, setAccessSaving] = useState(false);
  const [posPoints, setPosPoints] = useState<{ position: number; points: string }[]>([]);
  const [posPointsDirty, setPosPointsDirty] = useState(false);

  useEffect(() => {
    if (config && !form) {
      setForm({
        draftType: config.draftType ?? "alternate",
        salaryCap: String(config.salaryCap),
        rosterSize: String(config.rosterSize),
        captainMultiplier: String(config.captainMultiplier),
        birdiePoints: String(config.birdiePoints),
        eaglePoints: String(config.eaglePoints),
        bogeyPenalty: String(config.bogeyPenalty),
        missedCutPenalty: String(config.missedCutPenalty),
        replacementTopRankLockout: String(config.replacementTopRankLockout),
        requireAmerican: config.requireAmerican,
        requireEuropean: config.requireEuropean,
        requireRow: config.requireRow,
        requireOutsideTop30: config.requireOutsideTop30,
        salaryMin: String(config.salaryMin),
        salaryMax: String(config.salaryMax),
        scoringPlaces: String(config.scoringPlaces),
        firstPlacePoints: String(config.firstPlacePoints),
      });
    }
  }, [config, form]);

  useEffect(() => {
    if (tournament && !tournamentForm) {
      setTournamentForm({
        name: tournament.name,
        courseName: tournament.courseName ?? "",
        startDate: tournament.startDate,
        endDate: tournament.endDate,
        notes: tournament.notes ?? "",
      });
    }
  }, [tournament, tournamentForm]);

  useEffect(() => {
    if (tournament && !accessForm) {
      setAccessForm({
        visibility: tournament.visibility ?? "private",
        joinMode: tournament.joinMode ?? "invite_only",
      });
    }
  }, [tournament, accessForm]);

  useEffect(() => {
    if (positionPoints.length > 0 && posPoints.length === 0) {
      setPosPoints(positionPoints.map(p => ({ position: p.position, points: String(p.points) })));
    }
  }, [positionPoints, posPoints.length]);

  if (!form || !tournamentForm) return <div className="text-center py-12 text-muted-foreground text-sm">Loading config...</div>;

  const numField = (label: string, key: keyof ConfigFields, step = "1") => (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground font-medium">{label}</label>
      <Input
        type="number"
        step={step}
        value={form[key] as string}
        onChange={e => setForm(f => f ? { ...f, [key]: e.target.value } : f)}
        className="w-28 h-9 text-sm"
        data-testid={`config-${key}`}
      />
    </div>
  );

  const boolField = (label: string, key: keyof ConfigFields) => (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={form[key] as boolean}
        onChange={e => setForm(f => f ? { ...f, [key]: e.target.checked } : f)}
        className="w-4 h-4 rounded border-border bg-background text-primary"
        data-testid={`config-${key}`}
      />
      <span className="text-sm text-foreground">{label}</span>
    </label>
  );

  const handleSaveConfig = () => {
    updateConfigMutation.mutate(
      {
        id: tournamentId,
        data: {
          draftType: form.draftType,
          salaryCap: Number(form.salaryCap),
          rosterSize: Number(form.rosterSize),
          captainMultiplier: Number(form.captainMultiplier),
          birdiePoints: Number(form.birdiePoints),
          eaglePoints: Number(form.eaglePoints),
          bogeyPenalty: Number(form.bogeyPenalty),
          missedCutPenalty: Number(form.missedCutPenalty),
          replacementTopRankLockout: Number(form.replacementTopRankLockout),
          requireAmerican: form.requireAmerican,
          requireEuropean: form.requireEuropean,
          requireRow: form.requireRow,
          requireOutsideTop30: form.requireOutsideTop30,
          salaryMin: Number(form.salaryMin),
          salaryMax: Number(form.salaryMax),
          scoringPlaces: Number(form.scoringPlaces),
          firstPlacePoints: Number(form.firstPlacePoints),
        },
      },
      {
        onSuccess: () => { onSaved(); toast({ title: "Settings saved!" }); },
        onError: (err) => toast({ title: "Save failed", description: (err as Error).message, variant: "destructive" }),
      }
    );
  };

  const handleSaveTournament = () => {
    updateTournamentMutation.mutate(
      { id: tournamentId, data: { name: tournamentForm.name, courseName: tournamentForm.courseName || undefined, startDate: tournamentForm.startDate, endDate: tournamentForm.endDate, notes: tournamentForm.notes || undefined } },
      {
        onSuccess: () => { onSaved(); toast({ title: "Tournament details saved!" }); },
        onError: (err) => toast({ title: "Save failed", description: (err as Error).message, variant: "destructive" }),
      }
    );
  };

  const handleSaveAccess = async () => {
    if (!accessForm) return;
    setAccessSaving(true);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: accessForm.visibility, joinMode: accessForm.joinMode }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      onSaved();
      toast({ title: "Access settings saved!" });
    } catch (err) {
      toast({ title: "Save failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setAccessSaving(false);
    }
  };

  const handleSavePositionPoints = () => {
    setPositionPointsMutation.mutate(
      { id: tournamentId, data: { points: posPoints.map(p => ({ position: p.position, points: Number(p.points) })) } },
      {
        onSuccess: () => { onSaved(); setPosPointsDirty(false); toast({ title: "Position points saved!" }); },
        onError: (err) => toast({ title: "Save failed", description: (err as Error).message, variant: "destructive" }),
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Tournament Details */}
      <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-foreground text-sm uppercase tracking-wide text-muted-foreground">Tournament Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className="text-xs text-muted-foreground font-medium">Tournament Name</label>
            <Input value={tournamentForm.name} onChange={e => setTournamentForm(f => f ? { ...f, name: e.target.value } : f)} className="h-9 text-sm" data-testid="config-name" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Start Date</label>
            <Input type="date" value={tournamentForm.startDate} onChange={e => setTournamentForm(f => f ? { ...f, startDate: e.target.value } : f)} className="h-9 text-sm" data-testid="config-startDate" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">End Date</label>
            <Input type="date" value={tournamentForm.endDate} onChange={e => setTournamentForm(f => f ? { ...f, endDate: e.target.value } : f)} className="h-9 text-sm" data-testid="config-endDate" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Course Name (optional)</label>
            <Input value={tournamentForm.courseName} onChange={e => setTournamentForm(f => f ? { ...f, courseName: e.target.value } : f)} placeholder="e.g. Augusta National" className="h-9 text-sm" data-testid="config-courseName" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Notes (optional)</label>
            <Input value={tournamentForm.notes} onChange={e => setTournamentForm(f => f ? { ...f, notes: e.target.value } : f)} placeholder="Any notes..." className="h-9 text-sm" data-testid="config-notes" />
          </div>
        </div>
        <div className="flex justify-end pt-1">
          <Button size="sm" onClick={handleSaveTournament} disabled={updateTournamentMutation.isPending} data-testid="button-save-tournament">
            {updateTournamentMutation.isPending ? "Saving..." : "Save Details"}
          </Button>
        </div>
      </div>

      {/* Access Settings — commissioner only, only in draft status */}
      {isCommissioner && isDraftStatus && accessForm && (
        <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground text-sm uppercase tracking-wide text-muted-foreground">Access Settings</h2>
            <span className="text-xs text-muted-foreground border border-border rounded px-2 py-0.5">Commissioner only</span>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground font-medium">Visibility</label>
              <div className="flex gap-3">
                {([
                  { value: "private", label: "Private", desc: "Only invited members can see it" },
                  { value: "public", label: "Public", desc: "Anyone can discover it" },
                ] as const).map(({ value, label, desc }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAccessForm(f => f ? { ...f, visibility: value } : f)}
                    data-testid={`visibility-${value}`}
                    className={`flex-1 py-2.5 px-4 rounded-lg border text-sm text-left transition-all ${accessForm.visibility === value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
                  >
                    <div className="font-medium">{label}</div>
                    <div className="text-xs opacity-75 mt-0.5">{desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground font-medium">Join Mode</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: "invite_only", label: "Invite Only", desc: "Commissioner invites each player" },
                  { value: "approval_required", label: "Approval Required", desc: "Players request; commissioner approves" },
                  { value: "open_join", label: "Open Join", desc: "Anyone can join immediately" },
                  { value: "link_only", label: "Link Only", desc: "Join via secret invite link" },
                ] as const).map(({ value, label, desc }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAccessForm(f => f ? { ...f, joinMode: value } : f)}
                    data-testid={`join-mode-${value}`}
                    className={`py-2.5 px-4 rounded-lg border text-sm text-left transition-all ${accessForm.joinMode === value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
                  >
                    <div className="font-medium">{label}</div>
                    <div className="text-xs opacity-75 mt-0.5">{desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <Button size="sm" onClick={handleSaveAccess} disabled={accessSaving} data-testid="button-save-access">
              {accessSaving ? "Saving..." : "Save Access Settings"}
            </Button>
          </div>
        </div>
      )}

      {/* Salary & Roster */}
      <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
        <h2 className="font-semibold text-foreground text-sm uppercase tracking-wide text-muted-foreground">Salary & Roster</h2>
        <div className="flex flex-wrap gap-4">
          {numField("Salary Cap ($M)", "salaryCap", "0.5")}
          {numField("Roster Size", "rosterSize")}
          {numField("Salary Min ($M)", "salaryMin", "0.5")}
          {numField("Salary Max ($M)", "salaryMax", "0.5")}
        </div>
      </div>

      {/* Scoring */}
      <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
        <h2 className="font-semibold text-foreground text-sm uppercase tracking-wide text-muted-foreground">Scoring</h2>
        <div className="flex flex-wrap gap-4">
          {numField("Captain Multiplier (×)", "captainMultiplier", "0.5")}
          {numField("Birdie Points", "birdiePoints", "0.5")}
          {numField("Eagle Points", "eaglePoints", "0.5")}
          {numField("Bogey Penalty (pts deducted)", "bogeyPenalty", "0.5")}
          {numField("Missed Cut Penalty", "missedCutPenalty", "0.5")}
          {numField("Scoring Places", "scoringPlaces")}
          {numField("1st Place Points", "firstPlacePoints", "0.5")}
        </div>
      </div>

      {/* Draft Settings */}
      <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
        <h2 className="font-semibold text-foreground text-sm uppercase tracking-wide text-muted-foreground">Draft Settings</h2>
        <div className="space-y-3">
          <label className="text-xs text-muted-foreground font-medium">Draft Type</label>
          <div className="flex gap-3">
            {(["alternate", "snake"] as const).map(dt => (
              <button
                key={dt}
                onClick={() => setForm(f => f ? { ...f, draftType: dt } : f)}
                data-testid={`config-draftType-${dt}`}
                className={`flex-1 py-2.5 px-4 rounded-lg border text-sm font-medium transition-all ${form.draftType === dt ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
              >
                {dt === "alternate" ? "🔄 Alternate (1-2-1-2)" : "🐍 Snake (1-2-2-1)"}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {form.draftType === "snake" ? "Snake draft: pick order reverses each round (1→2→2→1→1→2...)" : "Alternate: same pick order every round (1→2→1→2...)"}
          </p>
        </div>
        <div className="flex flex-wrap gap-6 pt-1">
          {boolField("Require 1 American", "requireAmerican")}
          {boolField("Require 1 European", "requireEuropean")}
          {boolField("Require 1 Rest of World", "requireRow")}
          {boolField("Require 1 Outside Top 30", "requireOutsideTop30")}
        </div>
        <div className="flex flex-wrap gap-4 pt-2">
          {numField("Replacement Rank Lockout (top N)", "replacementTopRankLockout")}
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSaveConfig} disabled={updateConfigMutation.isPending} data-testid="button-save-config">
          {updateConfigMutation.isPending ? "Saving..." : "Save Settings"}
        </Button>
      </div>

      {/* Position Points Table */}
      <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground text-sm uppercase tracking-wide text-muted-foreground">Position → Points Table</h2>
          <p className="text-xs text-muted-foreground">How many points each finishing position earns</p>
        </div>
        {posPoints.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No position points configured. Save scoring settings first to auto-generate.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 max-h-72 overflow-y-auto">
              {posPoints.map((p, idx) => (
                <div key={p.position} className="flex items-center gap-2 bg-muted/20 rounded-lg px-3 py-1.5">
                  <span className="text-xs text-muted-foreground w-6 font-mono">#{p.position}</span>
                  <Input
                    type="number"
                    step="0.5"
                    value={p.points}
                    onChange={e => {
                      setPosPoints(prev => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], points: e.target.value };
                        return next;
                      });
                      setPosPointsDirty(true);
                    }}
                    className="h-7 text-xs text-right px-1 flex-1 min-w-0"
                    data-testid={`pos-points-${p.position}`}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleSavePositionPoints}
                disabled={setPositionPointsMutation.isPending || !posPointsDirty}
                variant={posPointsDirty ? "default" : "outline"}
                data-testid="button-save-position-points"
              >
                {setPositionPointsMutation.isPending ? "Saving..." : "Save Position Points"}
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Danger Zone */}
      <div className="bg-card border border-red-800/40 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <h2 className="font-semibold text-red-400 text-sm uppercase tracking-wide">Danger Zone</h2>
        </div>
        {!showDeleteConfirm ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Delete this tournament</p>
              <p className="text-xs text-muted-foreground mt-0.5">Permanently removes all golfers, picks, results, and scores. Cannot be undone.</p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              data-testid="button-delete-tournament"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete tournament
            </Button>
          </div>
        ) : (
          <div className="bg-red-950/30 border border-red-800/40 rounded-lg p-4 space-y-3">
            <p className="text-sm font-medium text-red-300">
              Are you sure? This will permanently delete <span className="font-bold">"{tournament?.name}"</span> and all its data.
            </p>
            <div className="flex gap-3">
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  setIsDeleting(true);
                  try {
                    await onDeleteTournament();
                  } catch (err) {
                    toast({ title: "Delete failed", description: (err as Error).message, variant: "destructive" });
                    setIsDeleting(false);
                    setShowDeleteConfirm(false);
                  }
                }}
                disabled={isDeleting}
                data-testid="button-confirm-delete-tournament"
              >
                {isDeleting ? "Deleting..." : "Yes, delete permanently"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
