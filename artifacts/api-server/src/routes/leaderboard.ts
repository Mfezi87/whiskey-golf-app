import { Router, type IRouter } from "express";
import { db, tournamentsTable, fantasyTeamsTable, fantasyTeamPicksTable, usersTable, tournamentConfigsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

router.get("/leaderboard", async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable);
  const completedTournaments = await db.select().from(tournamentsTable).where(eq(tournamentsTable.status, "completed"));

  const entries = await Promise.all(users.map(async (user) => {
    const teams = await db.select().from(fantasyTeamsTable)
      .where(and(eq(fantasyTeamsTable.userId, user.id)));

    const completedTeams = teams.filter(t =>
      completedTournaments.some(ct => ct.id === t.tournamentId) && t.totalScore != null
    );

    if (completedTeams.length === 0) {
      return {
        userId: user.id,
        displayName: user.displayName,
        tournamentsPlayed: 0,
        wins: 0,
        winPercentage: 0,
        totalScore: 0,
        avgScore: 0,
        highestScore: 0,
        lowestScore: 0,
      };
    }

    const scores = completedTeams.map(t => Number(t.totalScore));
    const wins = completedTeams.filter(t => t.isWinner).length;

    return {
      userId: user.id,
      displayName: user.displayName,
      tournamentsPlayed: completedTeams.length,
      wins,
      winPercentage: completedTeams.length > 0 ? (wins / completedTeams.length) * 100 : 0,
      totalScore: scores.reduce((a, b) => a + b, 0),
      avgScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
      highestScore: Math.max(...scores, 0),
      lowestScore: scores.length > 0 ? Math.min(...scores) : 0,
    };
  }));

  res.json(entries.sort((a, b) => b.totalScore - a.totalScore));
});

router.get("/leaderboard/head-to-head", async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable);
  const completedTournaments = await db.select().from(tournamentsTable).where(eq(tournamentsTable.status, "completed"));

  const records: { user1Id: number; user1DisplayName: string; user2Id: number; user2DisplayName: string; user1Wins: number; user2Wins: number; draws: number; tournamentsPlayed: number }[] = [];

  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < users.length; j++) {
      const u1 = users[i];
      const u2 = users[j];
      let u1Wins = 0;
      let u2Wins = 0;
      let draws = 0;
      let played = 0;

      for (const tournament of completedTournaments) {
        const [t1] = await db.select().from(fantasyTeamsTable).where(and(eq(fantasyTeamsTable.tournamentId, tournament.id), eq(fantasyTeamsTable.userId, u1.id)));
        const [t2] = await db.select().from(fantasyTeamsTable).where(and(eq(fantasyTeamsTable.tournamentId, tournament.id), eq(fantasyTeamsTable.userId, u2.id)));
        if (!t1 || !t2 || t1.totalScore == null || t2.totalScore == null) continue;
        played++;
        const s1 = Number(t1.totalScore);
        const s2 = Number(t2.totalScore);
        if (s1 > s2) u1Wins++;
        else if (s2 > s1) u2Wins++;
        else draws++;
      }

      records.push({ user1Id: u1.id, user1DisplayName: u1.displayName, user2Id: u2.id, user2DisplayName: u2.displayName, user1Wins: u1Wins, user2Wins: u2Wins, draws, tournamentsPlayed: played });
    }
  }
  res.json(records);
});

router.get("/leaderboard/tournament-history", async (_req, res): Promise<void> => {
  const tournaments = await db.select().from(tournamentsTable).where(eq(tournamentsTable.status, "completed")).orderBy(tournamentsTable.completedAt);

  const history = await Promise.all(tournaments.map(async (t) => {
    let winnerName: string | null = null;
    let winnerScore: number | null = null;
    if (t.winnerId) {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, t.winnerId));
      winnerName = user?.displayName ?? null;
      const [team] = await db.select().from(fantasyTeamsTable).where(and(eq(fantasyTeamsTable.tournamentId, t.id), eq(fantasyTeamsTable.userId, t.winnerId)));
      winnerScore = team?.totalScore ? Number(team.totalScore) : null;
    }
    return {
      tournamentId: t.id,
      tournamentName: t.name,
      courseName: t.courseName ?? null,
      startDate: t.startDate,
      endDate: t.endDate,
      winnerId: t.winnerId ?? null,
      winnerName,
      winnerScore,
    };
  }));

  res.json(history);
});

router.get("/leaderboard/score-progression", async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable);
  const completedTournaments = await db.select().from(tournamentsTable).where(eq(tournamentsTable.status, "completed")).orderBy(tournamentsTable.completedAt);

  const progression: { userId: number; displayName: string; tournamentId: number; tournamentName: string; score: number; cumulativeScore: number }[] = [];

  for (const user of users) {
    let cumulative = 0;
    for (const t of completedTournaments) {
      const [team] = await db.select().from(fantasyTeamsTable).where(and(eq(fantasyTeamsTable.tournamentId, t.id), eq(fantasyTeamsTable.userId, user.id)));
      if (!team || team.totalScore == null) continue;
      const score = Number(team.totalScore);
      cumulative += score;
      progression.push({ userId: user.id, displayName: user.displayName, tournamentId: t.id, tournamentName: t.name, score, cumulativeScore: cumulative });
    }
  }

  res.json(progression);
});

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const userId = (req.session as { userId?: number }).userId ?? null;
  const totalTournaments = await db.select().from(tournamentsTable);
  const totalUsers = await db.select().from(usersTable);
  const completedTournaments = totalTournaments.filter(t => t.status === "completed");
  const activeTournaments = totalTournaments.filter(t => t.status === "live" || t.status === "draft");

  const recentTournaments = await Promise.all(completedTournaments.slice(-5).reverse().map(async t => {
    let winnerName: string | null = null;
    let winnerScore: number | null = null;
    if (t.winnerId) {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, t.winnerId));
      winnerName = user?.displayName ?? null;
      const [team] = await db.select().from(fantasyTeamsTable).where(and(eq(fantasyTeamsTable.tournamentId, t.id), eq(fantasyTeamsTable.userId, t.winnerId)));
      winnerScore = team?.totalScore ? Number(team.totalScore) : null;
    }
    return { tournamentId: t.id, tournamentName: t.name, courseName: t.courseName ?? null, startDate: t.startDate, endDate: t.endDate, winnerId: t.winnerId ?? null, winnerName, winnerScore };
  }));

  const users = await db.select().from(usersTable);
  const leaderboardEntries = await Promise.all(users.map(async (user) => {
    const teams = await db.select().from(fantasyTeamsTable).where(eq(fantasyTeamsTable.userId, user.id));
    const completedTeams = teams.filter(t => completedTournaments.some(ct => ct.id === t.tournamentId) && t.totalScore != null);
    const scores = completedTeams.map(t => Number(t.totalScore));
    const wins = completedTeams.filter(t => t.isWinner).length;
    return {
      userId: user.id,
      displayName: user.displayName,
      tournamentsPlayed: completedTeams.length,
      wins,
      winPercentage: completedTeams.length > 0 ? (wins / completedTeams.length) * 100 : 0,
      totalScore: scores.reduce((a, b) => a + b, 0),
      avgScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
      highestScore: Math.max(...scores, 0),
      lowestScore: scores.length > 0 ? Math.min(...scores) : 0,
    };
  }));

  // Build active tournament cards with current standings and draft turn info
  const activeTournamentCards = await Promise.all(activeTournaments.map(async t => {
    const [config] = await db.select().from(tournamentConfigsTable).where(eq(tournamentConfigsTable.tournamentId, t.id));
    const teams = await db.select({ team: fantasyTeamsTable, user: usersTable })
      .from(fantasyTeamsTable)
      .innerJoin(usersTable, eq(fantasyTeamsTable.userId, usersTable.id))
      .where(eq(fantasyTeamsTable.tournamentId, t.id));

    // Compute current turn for draft tournaments
    let currentTurnUserId: number | null = null;
    let currentTurnUserName: string | null = null;
    if (t.status === "draft" && teams.length > 0) {
      const rosterSize = config?.rosterSize ?? 4;
      const draftType = config?.draftType ?? "alternate";
      const teamPickCounts = await Promise.all(teams.map(async ({ team, user }) => {
        const picks = await db.select().from(fantasyTeamPicksTable).where(eq(fantasyTeamPicksTable.fantasyTeamId, team.id));
        return { team, user, pickCount: picks.length };
      }));
      const totalPicksMade = teamPickCounts.reduce((sum, tc) => sum + tc.pickCount, 0);
      const maxPossible = teams.length * rosterSize;
      if (totalPicksMade < maxPossible) {
        if (draftType === "snake") {
          const n = teams.length;
          const round = Math.floor(totalPicksMade / n);
          const posInRound = totalPicksMade % n;
          const idx = round % 2 === 0 ? posInRound : n - 1 - posInRound;
          currentTurnUserId = teamPickCounts[idx]?.team.userId ?? null;
          currentTurnUserName = teamPickCounts[idx]?.user.displayName ?? null;
        } else {
          const minPicks = Math.min(...teamPickCounts.map(tc => tc.pickCount));
          const next = teamPickCounts.find(tc => tc.pickCount === minPicks);
          currentTurnUserId = next?.team.userId ?? null;
          currentTurnUserName = next?.user.displayName ?? null;
        }
      }
    }

    // Current standings (for live tournaments)
    const standings = teams
      .map(({ team, user }) => ({
        userId: team.userId,
        displayName: user.displayName,
        totalScore: team.totalScore ? Number(team.totalScore) : null,
      }))
      .filter(s => s.totalScore != null)
      .sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0));

    const userHasTeam = teams.some(({ team }) => team.userId === userId);
    const userIsCurrentTurn = currentTurnUserId === userId;

    return {
      id: t.id,
      name: t.name,
      courseName: t.courseName ?? null,
      startDate: t.startDate,
      endDate: t.endDate,
      status: t.status as "draft" | "live" | "completed",
      currentTurnUserId,
      currentTurnUserName,
      userHasTeam,
      userIsCurrentTurn,
      standings,
      participantCount: teams.length,
    };
  }));

  res.json({
    totalTournaments: totalTournaments.length,
    activeTournaments: activeTournamentCards,
    recentTournaments,
    leaderboardSnapshot: leaderboardEntries.sort((a, b) => b.totalScore - a.totalScore).slice(0, 5),
    totalUsers: totalUsers.length,
  });
});

export default router;
