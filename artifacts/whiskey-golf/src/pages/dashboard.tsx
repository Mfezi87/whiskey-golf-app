import { useGetDashboardSummary, useGetHeadToHead, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Trophy, Plus, Calendar, TrendingUp, Users, Star, Swords, Clock, Zap } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    draft: "bg-muted text-muted-foreground border-muted-border",
    live: "bg-green-900/40 text-green-400 border-green-700/50",
    completed: "bg-primary/20 text-primary border-primary/30",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${variants[status] ?? variants.draft}`}>
      {status === "live" && <span className="w-1.5 h-1.5 rounded-full bg-green-400 mr-1.5 animate-pulse" />}
      {status}
    </span>
  );
}

type ActiveTournamentCard = {
  id: number;
  name: string;
  courseName?: string | null;
  startDate: string;
  endDate: string;
  status: "draft" | "live" | "completed";
  currentTurnUserId?: number | null;
  currentTurnUserName?: string | null;
  userHasTeam: boolean;
  userIsCurrentTurn: boolean;
  participantCount: number;
  standings: { userId: number; displayName: string; totalScore: number | null }[];
};

function ActiveTournamentCard({ card }: { card: ActiveTournamentCard }) {
  return (
    <div className={`bg-card border rounded-xl overflow-hidden ${card.userIsCurrentTurn ? "border-primary/60 shadow-[0_0_0_1px_hsl(var(--primary)/0.3)]" : "border-card-border"}`}>
      {card.userIsCurrentTurn && (
        <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 border-b border-primary/20">
          <Zap className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold text-primary">It's your turn to pick!</span>
        </div>
      )}
      <div className="flex items-start justify-between px-5 py-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-foreground">{card.name}</h3>
            <StatusBadge status={card.status} />
          </div>
          {card.courseName && <p className="text-xs text-muted-foreground">{card.courseName}</p>}
          <p className="text-xs text-muted-foreground mt-0.5">{card.startDate} — {card.endDate}</p>
        </div>
        <Link href={`/tournaments/${card.id}`}>
          <Button variant="outline" size="sm" data-testid={`button-view-tournament-${card.id}`}>
            View
          </Button>
        </Link>
      </div>

      <div className="px-5 pb-4 space-y-3">
        {/* Draft turn info */}
        {card.status === "draft" && (
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            {card.currentTurnUserName ? (
              <span className="text-muted-foreground">
                Waiting for <span className={`font-medium ${card.userIsCurrentTurn ? "text-primary" : "text-foreground"}`}>{card.currentTurnUserName}</span> to pick
              </span>
            ) : (
              <span className="text-muted-foreground">Draft complete — ready to lock</span>
            )}
          </div>
        )}

        {/* Participants */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="w-3.5 h-3.5" />
          <span>{card.participantCount} participant{card.participantCount !== 1 ? "s" : ""}</span>
          {!card.userHasTeam && card.status === "draft" && (
            <span className="text-green-400 font-medium">· You haven't joined yet</span>
          )}
        </div>

        {/* Standings for live tournaments */}
        {card.status === "live" && card.standings.length > 0 && (
          <div className="border-t border-border pt-3 space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">Current Standings</p>
            {card.standings.map((s, idx) => (
              <div key={s.userId} className="flex items-center gap-2 text-sm">
                <span className="w-4 text-xs text-muted-foreground font-mono">#{idx + 1}</span>
                <span className="flex-1 text-foreground">{s.displayName}</span>
                <span className="text-primary font-semibold text-xs">{s.totalScore?.toFixed(1)} pts</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: summary, isLoading } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() },
  });
  const { data: h2h } = useGetHeadToHead();

  if (isLoading) {
    return (
      <Layout>
        <div className="p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-48" />
            <div className="grid grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-muted rounded-lg" />)}
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  const s = summary as {
    totalTournaments: number;
    totalUsers: number;
    activeTournaments: ActiveTournamentCard[];
    recentTournaments: { tournamentId: number; tournamentName: string; startDate: string; endDate: string; winnerId?: number | null; winnerName?: string | null; winnerScore?: number | null }[];
    leaderboardSnapshot: { userId: number; displayName: string; tournamentsPlayed: number; wins: number; totalScore: number; winPercentage: number }[];
  } | undefined;

  const h2hData = h2h as { user1Id: number; user1DisplayName: string; user2Id: number; user2DisplayName: string; user1Wins: number; user2Wins: number; draws: number; tournamentsPlayed: number }[] | undefined;

  const activeTournaments = s?.activeTournaments ?? [];
  const myTurnTournaments = activeTournaments.filter(t => t.userIsCurrentTurn);
  const myWins = s?.leaderboardSnapshot?.find(e => e.userId === user?.id)?.wins ?? 0;

  return (
    <Layout>
      <div className="p-4 sm:p-8 max-w-6xl mx-auto space-y-6 sm:space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">
              Welcome back, {user?.displayName}
            </h1>
            <p className="text-muted-foreground mt-0.5 text-sm">Your fantasy golf command centre</p>
          </div>
          <Link href="/tournaments/new">
            <Button data-testid="button-new-tournament" size="sm" className="sm:text-sm">
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">New Tournament</span>
            </Button>
          </Link>
        </div>

        {/* Your turn alert */}
        {myTurnTournaments.length > 0 && (
          <div className="bg-primary/10 border border-primary/30 rounded-xl px-5 py-4 flex items-center gap-3">
            <Zap className="w-5 h-5 text-primary flex-shrink-0" />
            <div>
              <p className="font-semibold text-foreground text-sm">
                {myTurnTournaments.length === 1
                  ? `It's your turn to pick in ${myTurnTournaments[0].name}!`
                  : `You have ${myTurnTournaments.length} draft picks waiting!`}
              </p>
              {myTurnTournaments.length === 1 && (
                <Link href={`/tournaments/${myTurnTournaments[0].id}`} className="text-xs text-primary hover:underline">
                  Go to draft →
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <div className="bg-card border border-card-border rounded-xl p-4 sm:p-5">
            <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-primary/20 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-primary" />
              </div>
              <span className="text-xs sm:text-sm text-muted-foreground">Tournaments</span>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-foreground">{s?.totalTournaments ?? 0}</p>
          </div>
          <div className="bg-card border border-card-border rounded-xl p-4 sm:p-5">
            <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-primary/20 flex items-center justify-center">
                <Users className="w-4 h-4 text-primary" />
              </div>
              <span className="text-xs sm:text-sm text-muted-foreground">Players</span>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-foreground">{s?.totalUsers ?? 0}</p>
          </div>
          <div className="bg-card border border-card-border rounded-xl p-4 sm:p-5">
            <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-primary/20 flex items-center justify-center">
                <Trophy className="w-4 h-4 text-primary" />
              </div>
              <span className="text-xs sm:text-sm text-muted-foreground">Your Wins</span>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-foreground">{myWins}</p>
          </div>
        </div>

        {/* Active & Draft Tournaments */}
        {activeTournaments.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-foreground">Active Tournaments</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {activeTournaments.map(card => (
                <ActiveTournamentCard key={card.id} card={card} />
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Leaderboard snapshot */}
          <div className="bg-card border border-card-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Star className="w-4 h-4 text-primary" />
                Standings
              </h2>
              <Link href="/leaderboard" className="text-xs text-primary hover:underline">Full leaderboard</Link>
            </div>
            <div className="space-y-2">
              {(s?.leaderboardSnapshot ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No completed tournaments yet</p>
              ) : (
                s?.leaderboardSnapshot.map((entry, idx) => (
                  <div key={entry.userId} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                    <span className="text-sm font-mono text-muted-foreground w-4">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{entry.displayName}</p>
                      <p className="text-xs text-muted-foreground">{entry.tournamentsPlayed} played · {entry.wins} won</p>
                    </div>
                    <span className="text-sm font-semibold text-primary">{entry.totalScore.toFixed(1)}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Head to Head */}
          <div className="bg-card border border-card-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Swords className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-foreground">Head to Head</h2>
            </div>
            <div className="space-y-3">
              {!h2hData || h2hData.length === 0 ? (
                <p className="text-sm text-muted-foreground">No head-to-head history yet</p>
              ) : (
                h2hData.map((record, idx) => (
                  <div key={idx} className="border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">{record.tournamentsPlayed} tournaments</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground flex-1 truncate">{record.user1DisplayName}</span>
                      <div className="flex items-center gap-1 text-sm font-bold flex-shrink-0">
                        <span className={record.user1Wins > record.user2Wins ? "text-primary" : "text-foreground"}>{record.user1Wins}</span>
                        <span className="text-muted-foreground">-</span>
                        <span className={record.user2Wins > record.user1Wins ? "text-primary" : "text-foreground"}>{record.user2Wins}</span>
                      </div>
                      <span className="text-sm font-medium text-foreground flex-1 text-right truncate">{record.user2DisplayName}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Recent tournaments */}
        <div className="bg-card border border-card-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Recent Tournaments</h2>
            <Link href="/tournaments" className="text-xs text-primary hover:underline">All tournaments</Link>
          </div>
          {(s?.recentTournaments ?? []).length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No tournaments completed yet.</p>
              <Link href="/tournaments/new">
                <Button variant="outline" size="sm" className="mt-3" data-testid="button-create-first-tournament">
                  Create your first tournament
                </Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {s?.recentTournaments.map(t => (
                <div key={t.tournamentId} className="flex items-center justify-between py-3">
                  <div className="min-w-0 mr-3">
                    <Link href={`/tournaments/${t.tournamentId}`} className="font-medium text-foreground hover:text-primary transition-colors truncate block">{t.tournamentName}</Link>
                    <p className="text-xs text-muted-foreground">{t.startDate} — {t.endDate}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {t.winnerName ? (
                      <>
                        <p className="text-sm font-medium text-primary flex items-center gap-1">
                          <Trophy className="w-3 h-3" />{t.winnerName}
                        </p>
                        <p className="text-xs text-muted-foreground">{t.winnerScore?.toFixed(1)} pts</p>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">No winner</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
