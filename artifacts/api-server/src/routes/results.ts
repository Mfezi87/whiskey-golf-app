import { Router, type IRouter } from "express";
import { db, tournamentsTable, tournamentGolfersTable, fantasyTeamsTable, fantasyTeamPicksTable, golferResultsTable, replacementResultsTable, tournamentConfigsTable, tournamentPositionPointsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  GetTournamentResultsParams,
  UpsertGolferResultParams,
  UpsertGolferResultBody,
  UpsertReplacementResultParams,
  UpsertReplacementResultBody,
  GetTournamentScoresParams,
  CompleteTournamentParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

function formatResult(r: typeof golferResultsTable.$inferSelect, golferName: string) {
  return {
    id: r.id, tournamentId: r.tournamentId, golferPoolId: r.golferPoolId,
    golferName, finishPosition: r.finishPosition ?? null,
    birdies: r.birdies ?? null, eagles: r.eagles ?? null,
    bogeys: r.bogeys ?? null, missedCut: r.missedCut,
  };
}

router.get("/tournaments/:id/results", async (req, res): Promise<void> => {
  const params = GetTournamentResultsParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const results = await db.select({ result: golferResultsTable, golfer: tournamentGolfersTable })
    .from(golferResultsTable)
    .innerJoin(tournamentGolfersTable, eq(golferResultsTable.golferPoolId, tournamentGolfersTable.id))
    .where(eq(golferResultsTable.tournamentId, params.data.id));

  res.json(results.map(({ result, golfer }) => formatResult(result, golfer.golferName)));
});

router.put("/tournaments/:id/results/:golferPoolId", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const golferPoolId = parseId(req.params.golferPoolId);
  const params = UpsertGolferResultParams.safeParse({ id, golferPoolId });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpsertGolferResultBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [golfer] = await db.select().from(tournamentGolfersTable).where(eq(tournamentGolfersTable.id, golferPoolId));
  if (!golfer) { res.status(404).json({ error: "Golfer not found" }); return; }

  const [existing] = await db.select().from(golferResultsTable)
    .where(and(eq(golferResultsTable.tournamentId, id), eq(golferResultsTable.golferPoolId, golferPoolId)));

  let result;
  if (existing) {
    [result] = await db.update(golferResultsTable)
      .set({
        finishPosition: body.data.finishPosition ?? null,
        birdies: body.data.birdies ?? null,
        eagles: body.data.eagles ?? null,
        bogeys: body.data.bogeys ?? null,
        missedCut: body.data.missedCut ?? false,
      })
      .where(eq(golferResultsTable.id, existing.id))
      .returning();
  } else {
    [result] = await db.insert(golferResultsTable).values({
      tournamentId: id,
      golferPoolId,
      finishPosition: body.data.finishPosition ?? null,
      birdies: body.data.birdies ?? null,
      eagles: body.data.eagles ?? null,
      bogeys: body.data.bogeys ?? null,
      missedCut: body.data.missedCut ?? false,
    }).returning();
  }

  // Update missed cut flag on picks if applicable
  if (body.data.missedCut !== undefined) {
    const teamPicks = await db.select().from(fantasyTeamPicksTable)
      .where(eq(fantasyTeamPicksTable.golferPoolId, golferPoolId));
    for (const pick of teamPicks) {
      await db.update(fantasyTeamPicksTable).set({ missedCut: body.data.missedCut ?? false }).where(eq(fantasyTeamPicksTable.id, pick.id));
    }
  }

  res.json(formatResult(result, golfer.golferName));
});

router.put("/tournaments/:id/results/:golferPoolId/replacement", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const golferPoolId = parseId(req.params.golferPoolId);
  const params = UpsertReplacementResultParams.safeParse({ id, golferPoolId });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpsertReplacementResultBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  // Find the pick with this golfer
  const teams = await db.select().from(fantasyTeamsTable).where(eq(fantasyTeamsTable.tournamentId, id));
  let originalPick: typeof fantasyTeamPicksTable.$inferSelect | null = null;
  for (const team of teams) {
    const [pick] = await db.select().from(fantasyTeamPicksTable)
      .where(and(eq(fantasyTeamPicksTable.fantasyTeamId, team.id), eq(fantasyTeamPicksTable.golferPoolId, golferPoolId)));
    if (pick) { originalPick = pick; break; }
  }

  if (!originalPick) { res.status(404).json({ error: "Original pick not found" }); return; }

  const [repGolfer] = await db.select().from(tournamentGolfersTable).where(eq(tournamentGolfersTable.id, body.data.replacementGolferPoolId));
  if (!repGolfer) { res.status(404).json({ error: "Replacement golfer not found" }); return; }

  // Calculate replacement score
  const [config] = await db.select().from(tournamentConfigsTable).where(eq(tournamentConfigsTable.tournamentId, id));
  const posPoints = await db.select().from(tournamentPositionPointsTable).where(eq(tournamentPositionPointsTable.tournamentId, id)).orderBy(tournamentPositionPointsTable.position);
  const posPointsMap: Record<number, number> = {};
  for (const pp of posPoints) { posPointsMap[pp.position] = Number(pp.points); }

  let repScore = 0;
  if (body.data.finishPosition && posPointsMap[body.data.finishPosition]) {
    repScore += posPointsMap[body.data.finishPosition];
  }
  if (body.data.birdies) repScore += body.data.birdies * Number(config?.birdiePoints ?? 1);
  if (body.data.eagles) repScore += body.data.eagles * Number(config?.eaglePoints ?? 3);
  if (body.data.bogeys) repScore -= body.data.bogeys * Number(config?.bogeyPenalty ?? 0.5);

  // Update the pick with the replacement golfer ID
  await db.update(fantasyTeamPicksTable)
    .set({ replacementGolferPoolId: body.data.replacementGolferPoolId })
    .where(eq(fantasyTeamPicksTable.id, originalPick.id));

  const [existing] = await db.select().from(replacementResultsTable)
    .where(eq(replacementResultsTable.originalPickId, originalPick.id));

  let repResult;
  if (existing) {
    [repResult] = await db.update(replacementResultsTable).set({
      replacementGolferPoolId: body.data.replacementGolferPoolId,
      finishPosition: body.data.finishPosition ?? null,
      birdies: body.data.birdies ?? null,
      eagles: body.data.eagles ?? null,
      bogeys: body.data.bogeys ?? null,
      replacementScore: String(repScore),
    }).where(eq(replacementResultsTable.id, existing.id)).returning();
  } else {
    [repResult] = await db.insert(replacementResultsTable).values({
      tournamentId: id,
      originalPickId: originalPick.id,
      replacementGolferPoolId: body.data.replacementGolferPoolId,
      finishPosition: body.data.finishPosition ?? null,
      birdies: body.data.birdies ?? null,
      eagles: body.data.eagles ?? null,
      bogeys: body.data.bogeys ?? null,
      replacementScore: String(repScore),
    }).returning();
  }

  res.json({
    id: repResult.id,
    tournamentId: repResult.tournamentId,
    originalPickId: repResult.originalPickId,
    replacementGolferPoolId: repResult.replacementGolferPoolId,
    replacementGolferName: repGolfer.golferName,
    finishPosition: repResult.finishPosition ?? null,
    birdies: repResult.birdies ?? null,
    eagles: repResult.eagles ?? null,
    bogeys: repResult.bogeys ?? null,
    replacementScore: repResult.replacementScore ? Number(repResult.replacementScore) : null,
  });
});

async function calculateTournamentScores(tournamentId: number) {
  const [config] = await db.select().from(tournamentConfigsTable).where(eq(tournamentConfigsTable.tournamentId, tournamentId));
  const posPoints = await db.select().from(tournamentPositionPointsTable).where(eq(tournamentPositionPointsTable.tournamentId, tournamentId)).orderBy(tournamentPositionPointsTable.position);
  const posPointsMap: Record<number, number> = {};
  for (const pp of posPoints) { posPointsMap[pp.position] = Number(pp.points); }

  const teams = await db.select({ team: fantasyTeamsTable, user: usersTable })
    .from(fantasyTeamsTable)
    .innerJoin(usersTable, eq(fantasyTeamsTable.userId, usersTable.id))
    .where(eq(fantasyTeamsTable.tournamentId, tournamentId));

  const teamScores = await Promise.all(teams.map(async ({ team, user }) => {
    const picks = await db.select({ pick: fantasyTeamPicksTable, golfer: tournamentGolfersTable })
      .from(fantasyTeamPicksTable)
      .innerJoin(tournamentGolfersTable, eq(fantasyTeamPicksTable.golferPoolId, tournamentGolfersTable.id))
      .where(eq(fantasyTeamPicksTable.fantasyTeamId, team.id))
      .orderBy(fantasyTeamPicksTable.slotNumber);

    let totalScore = 0;
    const slots = await Promise.all(picks.map(async ({ pick, golfer }) => {
      const [result] = await db.select().from(golferResultsTable)
        .where(and(eq(golferResultsTable.tournamentId, tournamentId), eq(golferResultsTable.golferPoolId, pick.golferPoolId)));
      const [repResult] = await db.select().from(replacementResultsTable)
        .where(eq(replacementResultsTable.originalPickId, pick.id));

      const birdiePoints = Number(config?.birdiePoints ?? 1);
      const eaglePoints = Number(config?.eaglePoints ?? 3);
      const bogeyPenalty = Number(config?.bogeyPenalty ?? 0.5);
      const mcPenalty = Number(config?.missedCutPenalty ?? 5);
      const captainMult = Number(config?.captainMultiplier ?? 2);

      let finishPoints = 0;
      let birdieBonus = 0;
      let eagleBonus = 0;
      let bogeyPen = 0;
      let mcPen = 0;
      let repScore = 0;

      const isMissedCut = result?.missedCut ?? pick.missedCut ?? false;

      if (result && !isMissedCut) {
        // Only count play stats for golfers who made the cut
        if (result.finishPosition && posPointsMap[result.finishPosition]) finishPoints = posPointsMap[result.finishPosition];
        if (result.birdies) birdieBonus = result.birdies * birdiePoints;
        if (result.eagles) eagleBonus = result.eagles * eaglePoints;
        if (result.bogeys) bogeyPen = result.bogeys * bogeyPenalty;
      }
      if (isMissedCut) mcPen = mcPenalty;
      if (repResult && repResult.replacementScore) repScore = Number(repResult.replacementScore);

      // Get replacement golfer name if applicable
      let replacementGolferName: string | null = null;
      if (repResult?.replacementGolferPoolId) {
        const [repGolfer] = await db.select().from(tournamentGolfersTable)
          .where(eq(tournamentGolfersTable.id, repResult.replacementGolferPoolId));
        replacementGolferName = repGolfer?.golferName ?? null;
      }

      const pre = finishPoints + birdieBonus + eagleBonus - bogeyPen - mcPen + repScore;
      const final = pick.isCaptain ? pre * captainMult : pre;
      totalScore += final;

      return {
        pickId: pick.id,
        golferName: golfer.golferName,
        isCaptain: pick.isCaptain,
        missedCut: isMissedCut,
        finishPoints,
        birdiePoints: birdieBonus,
        eaglePoints: eagleBonus,
        bogeyPenalty: bogeyPen,
        missedCutPenalty: mcPen,
        replacementScore: repScore,
        replacementGolferName,
        preMultiplierScore: pre,
        finalScore: final,
      };
    }));

    return { teamId: team.id, userId: team.userId, userDisplayName: user.displayName, totalScore, slots };
  }));

  const maxScore = Math.max(...teamScores.map(t => t.totalScore));
  const winnerId = teamScores.find(t => t.totalScore === maxScore)?.userId ?? null;

  return { tournamentId, teams: teamScores, winnerId };
}

router.get("/tournaments/:id/scores", async (req, res): Promise<void> => {
  const params = GetTournamentScoresParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const scores = await calculateTournamentScores(params.data.id);
  res.json(scores);
});

router.post("/tournaments/:id/complete", async (req, res): Promise<void> => {
  const params = CompleteTournamentParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const scores = await calculateTournamentScores(params.data.id);

  // Update all team scores and winner flags
  for (const teamScore of scores.teams) {
    const isWinner = teamScore.userId === scores.winnerId;
    await db.update(fantasyTeamsTable)
      .set({ totalScore: String(teamScore.totalScore), isWinner })
      .where(eq(fantasyTeamsTable.id, teamScore.teamId));

    // Update slot scores on picks
    for (const slot of teamScore.slots) {
      await db.update(fantasyTeamPicksTable).set({
        slotScorePreMultiplier: String(slot.preMultiplierScore),
        slotScorePostMultiplier: String(slot.finalScore),
      }).where(eq(fantasyTeamPicksTable.id, slot.pickId));
    }
  }

  const [tournament] = await db.update(tournamentsTable)
    .set({ status: "completed", winnerId: scores.winnerId, completedAt: new Date() })
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
