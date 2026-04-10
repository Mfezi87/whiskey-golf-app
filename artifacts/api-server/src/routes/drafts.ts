import { Router, type IRouter } from "express";
import { db, tournamentsTable, tournamentGolfersTable, fantasyTeamsTable, fantasyTeamPicksTable, tournamentConfigsTable, usersTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import {
  GetDraftStateParams,
  MakeDraftPickParams,
  MakeDraftPickBody,
  RemoveDraftPickParams,
  RemoveDraftPickBody,
  SetCaptainParams,
  SetCaptainBody,
  LockDraftParams,
  JoinTournamentParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

async function buildDraftState(tournamentId: number) {
  const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, tournamentId));
  if (!tournament) return null;

  const [config] = await db.select().from(tournamentConfigsTable).where(eq(tournamentConfigsTable.tournamentId, tournamentId));

  const teams = await db.select({ team: fantasyTeamsTable, user: usersTable })
    .from(fantasyTeamsTable)
    .innerJoin(usersTable, eq(fantasyTeamsTable.userId, usersTable.id))
    .where(eq(fantasyTeamsTable.tournamentId, tournamentId));

  const allGolfers = await db.select().from(tournamentGolfersTable).where(eq(tournamentGolfersTable.tournamentId, tournamentId)).orderBy(tournamentGolfersTable.marketRank);

  const teamsWithPicks = await Promise.all(teams.map(async ({ team, user }) => {
    const picks = await db.select({ pick: fantasyTeamPicksTable, golfer: tournamentGolfersTable })
      .from(fantasyTeamPicksTable)
      .innerJoin(tournamentGolfersTable, eq(fantasyTeamPicksTable.golferPoolId, tournamentGolfersTable.id))
      .where(eq(fantasyTeamPicksTable.fantasyTeamId, team.id))
      .orderBy(fantasyTeamPicksTable.slotNumber);

    const formattedPicks = await Promise.all(picks.map(async ({ pick, golfer }) => {
      let replacementGolferName: string | null = null;
      if (pick.replacementGolferPoolId) {
        const [repGolfer] = await db.select().from(tournamentGolfersTable).where(eq(tournamentGolfersTable.id, pick.replacementGolferPoolId));
        replacementGolferName = repGolfer?.golferName ?? null;
      }
      return {
        id: pick.id,
        fantasyTeamId: pick.fantasyTeamId,
        golferPoolId: pick.golferPoolId,
        golferName: golfer.golferName,
        region: golfer.region as "EU" | "US" | "ROW",
        salary: golfer.salary ?? null,
        slotNumber: pick.slotNumber,
        isCaptain: pick.isCaptain,
        missedCut: pick.missedCut,
        replacementGolferPoolId: pick.replacementGolferPoolId ?? null,
        replacementGolferName,
        slotScorePreMultiplier: pick.slotScorePreMultiplier ? Number(pick.slotScorePreMultiplier) : null,
        slotScorePostMultiplier: pick.slotScorePostMultiplier ? Number(pick.slotScorePostMultiplier) : null,
        isWinner: team.isWinner,
      };
    }));

    const totalSalary = formattedPicks.reduce((sum, p) => sum + (p.salary ?? 0), 0);

    return {
      id: team.id,
      tournamentId: team.tournamentId,
      userId: team.userId,
      userName: user.username,
      userDisplayName: user.displayName,
      totalSalary,
      totalScore: team.totalScore ? Number(team.totalScore) : null,
      isWinner: team.isWinner,
      picks: formattedPicks,
    };
  }));

  // Determine whose turn it is
  const pickedGolferIds = new Set(teamsWithPicks.flatMap(t => t.picks.map(p => p.golferPoolId)));
  const availableGolfers = allGolfers.filter(g => !pickedGolferIds.has(g.id)).map(g => ({
    id: g.id, tournamentId: g.tournamentId, golferName: g.golferName, nationality: g.nationality,
    region: g.region as "EU" | "US" | "ROW",
    avgOdds: g.avgOdds ? Number(g.avgOdds) : null,
    worldRanking: g.worldRanking, marketRank: g.marketRank, salary: g.salary,
    outsideTop30: g.outsideTop30, eligibleForReplacement: g.eligibleForReplacement,
  }));

  let currentTurnUserId: number | null = null;
  if (tournament.status === "draft" && teamsWithPicks.length > 0) {
    const rosterSize = config?.rosterSize ?? 4;
    const draftType = config?.draftType ?? "alternate";
    const totalPicksMade = teamsWithPicks.reduce((sum, t) => sum + t.picks.length, 0);
    const maxPossiblePicks = teamsWithPicks.length * rosterSize;

    if (totalPicksMade < maxPossiblePicks) {
      if (draftType === "snake") {
        // Snake: round-robin, reverses each round
        // Teams ordered by insertion (join) time
        const n = teamsWithPicks.length;
        const round = Math.floor(totalPicksMade / n);
        const posInRound = totalPicksMade % n;
        const idx = round % 2 === 0 ? posInRound : n - 1 - posInRound;
        currentTurnUserId = teamsWithPicks[idx]?.userId ?? null;
      } else {
        // Alternate: team with fewest picks goes next; tie broken by join order
        const minPicks = Math.min(...teamsWithPicks.map(t => t.picks.length));
        const nextTeam = teamsWithPicks.find(t => t.picks.length === minPicks);
        currentTurnUserId = nextTeam?.userId ?? null;
      }
    }
  }

  // Validate each team
  const validations: { teamId: number | null; type: string; message: string; valid: boolean }[] = [];
  for (const team of teamsWithPicks) {
    const picks = team.picks;
    const rosterSize = config?.rosterSize ?? 4;

    if (picks.length < rosterSize) {
      validations.push({ teamId: team.id, type: "roster_incomplete", message: `${team.userDisplayName} needs ${rosterSize - picks.length} more pick(s)`, valid: false });
    }
    if (config?.requireAmerican && !picks.some(p => p.region === "US")) {
      validations.push({ teamId: team.id, type: "missing_american", message: `${team.userDisplayName} must include at least 1 American golfer`, valid: false });
    }
    if (config?.requireEuropean && !picks.some(p => p.region === "EU")) {
      validations.push({ teamId: team.id, type: "missing_european", message: `${team.userDisplayName} must include at least 1 European golfer`, valid: false });
    }
    if (config?.requireRow && !picks.some(p => p.region === "ROW")) {
      validations.push({ teamId: team.id, type: "missing_row", message: `${team.userDisplayName} must include at least 1 Rest of World golfer`, valid: false });
    }
    if (config?.requireOutsideTop30 && !picks.some(p => {
      const g = allGolfers.find(ag => ag.id === p.golferPoolId);
      return g?.outsideTop30;
    })) {
      validations.push({ teamId: team.id, type: "missing_outside_top30", message: `${team.userDisplayName} must include at least 1 golfer outside top 30`, valid: false });
    }
    const captains = picks.filter(p => p.isCaptain);
    if (captains.length === 0) {
      validations.push({ teamId: team.id, type: "no_captain", message: `${team.userDisplayName} has no captain selected`, valid: false });
    } else if (captains.length > 1) {
      validations.push({ teamId: team.id, type: "too_many_captains", message: `${team.userDisplayName} has more than 1 captain`, valid: false });
    }
    const totalSalary = picks.reduce((sum, p) => sum + (p.salary ?? 0), 0);
    if (config && totalSalary > config.salaryCap) {
      validations.push({ teamId: team.id, type: "salary_exceeded", message: `${team.userDisplayName} exceeds salary cap (${totalSalary}/${config.salaryCap})`, valid: false });
    }
  }

  // Check for duplicate picks across teams
  const allPickIds = teamsWithPicks.flatMap(t => t.picks.map(p => p.golferPoolId));
  const seen = new Set<number>();
  for (const pid of allPickIds) {
    if (seen.has(pid)) {
      const g = allGolfers.find(ag => ag.id === pid);
      validations.push({ teamId: null, type: "duplicate_pick", message: `${g?.golferName ?? "A golfer"} is on multiple teams`, valid: false });
    }
    seen.add(pid);
  }

  const currentTurnTeam = teamsWithPicks.find(t => t.userId === currentTurnUserId);
  const isLocked = tournament.status !== "draft";

  return {
    tournamentId,
    status: tournament.status as "draft" | "live" | "completed",
    isLocked,
    currentTurnUserId,
    currentTurnUserName: currentTurnTeam?.userDisplayName ?? null,
    teams: teamsWithPicks,
    availableGolfers,
    validation: validations,
  };
}

router.get("/tournaments/:id/draft/state", async (req, res): Promise<void> => {
  const params = GetDraftStateParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const state = await buildDraftState(params.data.id);
  if (!state) { res.status(404).json({ error: "Tournament not found" }); return; }
  res.json(state);
});

router.post("/tournaments/:id/draft/pick", async (req, res): Promise<void> => {
  const params = MakeDraftPickParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = MakeDraftPickBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, params.data.id));
  if (!tournament || tournament.status !== "draft") {
    res.status(400).json({ error: "Tournament is not in draft state" });
    return;
  }

  // Verify golfer exists in pool
  const [golfer] = await db.select().from(tournamentGolfersTable)
    .where(and(eq(tournamentGolfersTable.id, body.data.golferPoolId), eq(tournamentGolfersTable.tournamentId, params.data.id)));
  if (!golfer) { res.status(400).json({ error: "Golfer not found in tournament pool" }); return; }

  // Check not already picked
  const existingTeams = await db.select().from(fantasyTeamsTable).where(eq(fantasyTeamsTable.tournamentId, params.data.id));
  for (const t of existingTeams) {
    const [existingPick] = await db.select().from(fantasyTeamPicksTable)
      .where(and(eq(fantasyTeamPicksTable.fantasyTeamId, t.id), eq(fantasyTeamPicksTable.golferPoolId, body.data.golferPoolId)));
    if (existingPick) {
      res.status(400).json({ error: `${golfer.golferName} is already picked` });
      return;
    }
  }

  // Get the team
  const [team] = await db.select().from(fantasyTeamsTable).where(eq(fantasyTeamsTable.id, body.data.teamId));
  if (!team || team.tournamentId !== params.data.id) {
    res.status(400).json({ error: "Team not found" });
    return;
  }

  const existingPicks = await db.select({ pick: fantasyTeamPicksTable, golfer: tournamentGolfersTable })
    .from(fantasyTeamPicksTable)
    .innerJoin(tournamentGolfersTable, eq(fantasyTeamPicksTable.golferPoolId, tournamentGolfersTable.id))
    .where(eq(fantasyTeamPicksTable.fantasyTeamId, body.data.teamId));
  const [config] = await db.select().from(tournamentConfigsTable).where(eq(tournamentConfigsTable.tournamentId, params.data.id));
  if (existingPicks.length >= (config?.rosterSize ?? 4)) {
    res.status(400).json({ error: "Team roster is full" });
    return;
  }

  // Enforce salary cap
  if (config && golfer.salary != null) {
    const currentSalary = existingPicks.reduce((sum, { golfer: g }) => sum + (g.salary ?? 0), 0);
    if (currentSalary + golfer.salary > config.salaryCap) {
      res.status(400).json({ error: `Adding ${golfer.golferName} ($${golfer.salary}M) would exceed the salary cap of $${config.salaryCap}M (current: $${currentSalary}M)` });
      return;
    }
  }

  await db.insert(fantasyTeamPicksTable).values({
    fantasyTeamId: body.data.teamId,
    golferPoolId: body.data.golferPoolId,
    slotNumber: existingPicks.length + 1,
    isCaptain: false,
    missedCut: false,
  });

  const state = await buildDraftState(params.data.id);
  res.json(state);
});

router.post("/tournaments/:id/draft/remove-pick", async (req, res): Promise<void> => {
  const params = RemoveDraftPickParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = RemoveDraftPickBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, params.data.id));
  if (!tournament || tournament.status !== "draft") {
    res.status(400).json({ error: "Tournament is not in draft state" });
    return;
  }

  await db.delete(fantasyTeamPicksTable).where(eq(fantasyTeamPicksTable.id, body.data.pickId));
  const state = await buildDraftState(params.data.id);
  res.json(state);
});

router.post("/tournaments/:id/draft/set-captain", async (req, res): Promise<void> => {
  const params = SetCaptainParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = SetCaptainBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  // Clear all captains on this team first
  const teamPicks = await db.select().from(fantasyTeamPicksTable).where(eq(fantasyTeamPicksTable.fantasyTeamId, body.data.teamId));
  for (const pick of teamPicks) {
    await db.update(fantasyTeamPicksTable).set({ isCaptain: false }).where(eq(fantasyTeamPicksTable.id, pick.id));
  }
  // Set the new captain
  await db.update(fantasyTeamPicksTable).set({ isCaptain: true }).where(eq(fantasyTeamPicksTable.id, body.data.pickId));

  const state = await buildDraftState(params.data.id);
  res.json(state);
});

async function handleDraftJoin(req: import("express").Request, res: import("express").Response): Promise<void> {
  const params = JoinTournamentParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const userId = (req.session as { userId?: number }).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, params.data.id));
  if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
  if (!["draft", "pending"].includes(tournament.status)) {
    res.status(400).json({ error: "Can only join tournaments in draft status" });
    return;
  }

  // Check if user already has a team in this tournament
  const [existing] = await db.select().from(fantasyTeamsTable)
    .where(and(eq(fantasyTeamsTable.tournamentId, params.data.id), eq(fantasyTeamsTable.userId, userId)));
  if (existing) {
    res.status(400).json({ error: "You have already joined this tournament" });
    return;
  }

  await db.insert(fantasyTeamsTable).values({ tournamentId: params.data.id, userId });

  const state = await buildDraftState(params.data.id);
  res.json(state);
}

router.post("/tournaments/:id/draft/join", handleDraftJoin);

router.post("/tournaments/:id/draft/lock", async (req, res): Promise<void> => {
  const params = LockDraftParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const state = await buildDraftState(params.data.id);
  if (!state) { res.status(404).json({ error: "Tournament not found" }); return; }

  // Only lock if no validation errors
  const invalidMessages = state.validation.filter(v => !v.valid);
  if (invalidMessages.length > 0) {
    res.status(400).json({ error: `Cannot lock draft: ${invalidMessages.map(v => v.message).join("; ")}` });
    return;
  }

  const [tournament] = await db.update(tournamentsTable)
    .set({ status: "live" })
    .where(eq(tournamentsTable.id, params.data.id))
    .returning();

  res.json({
    id: tournament.id,
    name: tournament.name,
    courseName: tournament.courseName ?? null,
    startDate: tournament.startDate,
    endDate: tournament.endDate,
    status: tournament.status,
    notes: tournament.notes ?? null,
    winnerId: tournament.winnerId ?? null,
    createdAt: tournament.createdAt.toISOString(),
    completedAt: tournament.completedAt ? tournament.completedAt.toISOString() : null,
  });
});

export default router;
