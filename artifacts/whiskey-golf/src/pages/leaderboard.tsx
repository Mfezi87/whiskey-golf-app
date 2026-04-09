import { useGetLeaderboard, useGetHeadToHead, useGetTournamentHistory, getGetLeaderboardQueryKey, getGetHeadToHeadQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { Trophy, Swords, TrendingUp } from "lucide-react";

export default function LeaderboardPage() {
  const { user } = useAuth();
  const { data: leaderboard, isLoading: lbLoading } = useGetLeaderboard({
    query: { queryKey: getGetLeaderboardQueryKey() },
  });
  const { data: h2h, isLoading: h2hLoading } = useGetHeadToHead({
    query: { queryKey: getGetHeadToHeadQueryKey() },
  });

  const lbData = (leaderboard as {
    userId: number;
    displayName: string;
    tournamentsPlayed: number;
    wins: number;
    totalScore: number;
    avgScore: number;
    winPercentage: number;
  }[] | undefined) ?? [];

  const h2hData = (h2h as {
    user1Id: number;
    user1DisplayName: string;
    user2Id: number;
    user2DisplayName: string;
    user1Wins: number;
    user2Wins: number;
    draws: number;
    tournamentsPlayed: number;
  }[] | undefined) ?? [];

  return (
    <Layout>
      <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-6 sm:space-y-8">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">All-Time Leaderboard</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">Cumulative standings across all tournaments</p>
        </div>

        {/* Main leaderboard */}
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
            <Trophy className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-foreground">Overall Standings</h2>
          </div>
          {lbLoading ? (
            <div className="space-y-2 p-4">
              {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />)}
            </div>
          ) : lbData.length === 0 ? (
            <div className="text-center py-12">
              <Trophy className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No completed tournaments yet</p>
            </div>
          ) : (
            <div>
              {/* Header */}
              <div className="grid grid-cols-5 sm:grid-cols-6 px-4 sm:px-5 py-2 text-xs text-muted-foreground border-b border-border">
                <span className="col-span-1">#</span>
                <span className="col-span-2">Player</span>
                <span className="text-center">Played</span>
                <span className="text-center">Wins</span>
                <span className="hidden sm:block text-center">Win %</span>
              </div>
              {lbData.map((entry, idx) => {
                const isMe = entry.userId === user?.id;
                const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : null;
                return (
                  <div
                    key={entry.userId}
                    className={`grid grid-cols-5 sm:grid-cols-6 items-center px-4 sm:px-5 py-3 border-b border-border last:border-0 ${
                      isMe ? "bg-primary/10" : "hover:bg-muted/20"
                    } transition-colors`}
                    data-testid={`row-leaderboard-${entry.userId}`}
                  >
                    <span className="col-span-1 text-sm font-mono">
                      {medal ?? `#${idx + 1}`}
                    </span>
                    <div className="col-span-2">
                      <p className={`text-sm font-semibold ${isMe ? "text-primary" : "text-foreground"}`}>
                        {entry.displayName}
                        {isMe && <span className="text-xs text-muted-foreground ml-1">(you)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{entry.totalScore.toFixed(1)} pts</p>
                    </div>
                    <span className="text-sm text-center text-muted-foreground">{entry.tournamentsPlayed}</span>
                    <span className="text-sm text-center font-semibold text-foreground">{entry.wins}</span>
                    <span className="hidden sm:block text-sm text-center text-muted-foreground">{entry.winPercentage.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Head to Head section */}
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
            <Swords className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-foreground">Head to Head Records</h2>
          </div>
          {h2hLoading ? (
            <div className="space-y-2 p-4">
              {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />)}
            </div>
          ) : h2hData.length === 0 ? (
            <div className="text-center py-12">
              <Swords className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Head-to-head data will appear after completed tournaments</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {h2hData.map((record, idx) => {
                const u1Leading = record.user1Wins > record.user2Wins;
                const u2Leading = record.user2Wins > record.user1Wins;
                return (
                  <div key={idx} className="px-5 py-4" data-testid={`row-h2h-${idx}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">{record.tournamentsPlayed} tournament{record.tournamentsPlayed !== 1 ? "s" : ""}</span>
                      {record.draws > 0 && <span className="text-xs text-muted-foreground">{record.draws} draw{record.draws !== 1 ? "s" : ""}</span>}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className={`flex-1 text-right ${u1Leading ? "text-primary font-semibold" : "text-foreground"}`}>
                        <p className="text-sm">{record.user1DisplayName}</p>
                      </div>
                      <div className="flex items-center gap-2 text-xl font-bold min-w-[80px] justify-center">
                        <span className={u1Leading ? "text-primary" : "text-foreground"}>{record.user1Wins}</span>
                        <span className="text-muted-foreground text-sm">vs</span>
                        <span className={u2Leading ? "text-primary" : "text-foreground"}>{record.user2Wins}</span>
                      </div>
                      <div className={`flex-1 ${u2Leading ? "text-primary font-semibold" : "text-foreground"}`}>
                        <p className="text-sm">{record.user2DisplayName}</p>
                      </div>
                    </div>
                    {/* Visual bar */}
                    <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${record.tournamentsPlayed > 0 ? (record.user1Wins / record.tournamentsPlayed) * 100 : 50}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Tournament history */}
        <TournamentHistorySection />
      </div>
    </Layout>
  );
}

function TournamentHistorySection() {
  const { data: history } = useGetTournamentHistory();
  const historyData = (history as {
    tournamentId: number;
    tournamentName: string;
    startDate: string;
    endDate: string;
    winnerId?: number | null;
    winnerName?: string | null;
    winnerScore?: number | null;
  }[] | undefined) ?? [];

  if (historyData.length === 0) return null;

  return (
    <div className="bg-card border border-card-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <TrendingUp className="w-4 h-4 text-primary" />
        <h2 className="font-semibold text-foreground">Tournament History</h2>
      </div>
      <div className="divide-y divide-border">
        {historyData.map(t => (
          <div key={t.tournamentId} className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-medium text-foreground">{t.tournamentName}</p>
              <p className="text-xs text-muted-foreground">{t.startDate} — {t.endDate}</p>
            </div>
            {t.winnerName ? (
              <div className="flex items-center gap-2 text-right">
                <Trophy className="w-4 h-4 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-primary">{t.winnerName}</p>
                  <p className="text-xs text-muted-foreground">{t.winnerScore?.toFixed(1)} pts</p>
                </div>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">No winner</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
