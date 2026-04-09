import { Router, type IRouter } from "express";
import { db, tournamentsTable, tournamentConfigsTable, tournamentPositionPointsTable, fantasyTeamsTable, tournamentGolfersTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreateTournamentBody,
  UpdateTournamentBody,
  UpdateTournamentConfigBody,
  SetPositionPointsBody,
  GetTournamentParams,
  UpdateTournamentParams,
  GetTournamentConfigParams,
  UpdateTournamentConfigParams,
  GetPositionPointsParams,
  SetPositionPointsParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

function formatTournament(t: typeof tournamentsTable.$inferSelect) {
  return {
    id: t.id,
    name: t.name,
    courseName: t.courseName ?? null,
    startDate: t.startDate,
    endDate: t.endDate,
    status: t.status,
    notes: t.notes ?? null,
    winnerId: t.winnerId ?? null,
    createdAt: t.createdAt.toISOString(),
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
  };
}

function formatConfig(c: typeof tournamentConfigsTable.$inferSelect) {
  return {
    id: c.id,
    tournamentId: c.tournamentId,
    draftType: (c.draftType ?? "alternate") as "alternate" | "snake",
    salaryCap: c.salaryCap,
    rosterSize: c.rosterSize,
    captainMultiplier: Number(c.captainMultiplier),
    birdiePoints: Number(c.birdiePoints),
    eaglePoints: Number(c.eaglePoints),
    bogeyPenalty: Number(c.bogeyPenalty),
    missedCutPenalty: Number(c.missedCutPenalty),
    replacementTopRankLockout: c.replacementTopRankLockout,
    requireAmerican: c.requireAmerican,
    requireEuropean: c.requireEuropean,
    requireRow: c.requireRow,
    requireOutsideTop30: c.requireOutsideTop30,
    salaryMin: c.salaryMin,
    salaryMax: c.salaryMax,
    scoringPlaces: c.scoringPlaces,
    firstPlacePoints: c.firstPlacePoints,
  };
}

router.get("/tournaments", async (_req, res): Promise<void> => {
  const tournaments = await db.select().from(tournamentsTable).orderBy(tournamentsTable.createdAt);
  res.json(tournaments.map(formatTournament));
});

router.post("/tournaments", async (req, res): Promise<void> => {
  const parsed = CreateTournamentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, courseName, startDate, endDate, notes, config } = parsed.data;
  const [tournament] = await db.insert(tournamentsTable).values({ name, courseName, startDate, endDate, notes }).returning();

  // Create default config
  const configValues = {
    tournamentId: tournament.id,
    draftType: config?.draftType ?? "alternate",
    salaryCap: config?.salaryCap ?? 100,
    rosterSize: config?.rosterSize ?? 4,
    captainMultiplier: String(config?.captainMultiplier ?? 2),
    birdiePoints: String(config?.birdiePoints ?? 1),
    eaglePoints: String(config?.eaglePoints ?? 3),
    bogeyPenalty: String(config?.bogeyPenalty ?? 0.5),
    missedCutPenalty: String(config?.missedCutPenalty ?? 5),
    replacementTopRankLockout: config?.replacementTopRankLockout ?? 10,
    requireAmerican: config?.requireAmerican ?? true,
    requireEuropean: config?.requireEuropean ?? true,
    requireRow: config?.requireRow ?? true,
    requireOutsideTop30: config?.requireOutsideTop30 ?? true,
    salaryMin: config?.salaryMin ?? 3,
    salaryMax: config?.salaryMax ?? 30,
    scoringPlaces: config?.scoringPlaces ?? 50,
    firstPlacePoints: config?.firstPlacePoints ?? 50,
  };
  await db.insert(tournamentConfigsTable).values(configValues);

  // Generate default position points
  const pts = generatePositionPoints(configValues.scoringPlaces, configValues.firstPlacePoints);
  if (pts.length > 0) {
    await db.insert(tournamentPositionPointsTable).values(pts.map(p => ({ tournamentId: tournament.id, position: p.position, points: String(p.points) })));
  }

  res.status(201).json(formatTournament(tournament));
});

router.get("/tournaments/:id", async (req, res): Promise<void> => {
  const params = GetTournamentParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, params.data.id));
  if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }

  const [config] = await db.select().from(tournamentConfigsTable).where(eq(tournamentConfigsTable.tournamentId, tournament.id));
  const golfers = await db.select().from(tournamentGolfersTable).where(eq(tournamentGolfersTable.tournamentId, tournament.id)).orderBy(tournamentGolfersTable.marketRank);
  const teams = await db.select({ team: fantasyTeamsTable, user: usersTable }).from(fantasyTeamsTable).innerJoin(usersTable, eq(fantasyTeamsTable.userId, usersTable.id)).where(eq(fantasyTeamsTable.tournamentId, tournament.id));

  const formattedGolfers = golfers.map(g => ({
    id: g.id, tournamentId: g.tournamentId, golferName: g.golferName, nationality: g.nationality,
    region: g.region as "EU" | "US" | "ROW", avgOdds: g.avgOdds ? Number(g.avgOdds) : null,
    worldRanking: g.worldRanking, marketRank: g.marketRank, salary: g.salary,
    outsideTop30: g.outsideTop30, eligibleForReplacement: g.eligibleForReplacement,
  }));

  const formattedTeams = teams.map(({ team, user }) => ({
    id: team.id, tournamentId: team.tournamentId, userId: team.userId,
    userName: user.username, userDisplayName: user.displayName,
    totalSalary: team.totalSalary, totalScore: team.totalScore ? Number(team.totalScore) : null,
    isWinner: team.isWinner, picks: [],
  }));

  res.json({
    ...formatTournament(tournament),
    config: config ? formatConfig(config) : null,
    golfers: formattedGolfers,
    teams: formattedTeams,
  });
});

router.delete("/tournaments/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid tournament id" }); return; }
  const [deleted] = await db.delete(tournamentsTable).where(eq(tournamentsTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Tournament not found" }); return; }
  res.json({ ok: true });
});

router.patch("/tournaments/:id", async (req, res): Promise<void> => {
  const params = UpdateTournamentParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpdateTournamentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [tournament] = await db.update(tournamentsTable).set(body.data).where(eq(tournamentsTable.id, params.data.id)).returning();
  if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
  res.json(formatTournament(tournament));
});

router.get("/tournaments/:id/config", async (req, res): Promise<void> => {
  const params = GetTournamentConfigParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [config] = await db.select().from(tournamentConfigsTable).where(eq(tournamentConfigsTable.tournamentId, params.data.id));
  if (!config) { res.status(404).json({ error: "Config not found" }); return; }
  res.json(formatConfig(config));
});

router.patch("/tournaments/:id/config", async (req, res): Promise<void> => {
  const params = UpdateTournamentConfigParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpdateTournamentConfigBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const updateData: Record<string, unknown> = {};
  if (body.data.draftType !== undefined) updateData.draftType = body.data.draftType;
  if (body.data.salaryCap !== undefined) updateData.salaryCap = body.data.salaryCap;
  if (body.data.rosterSize !== undefined) updateData.rosterSize = body.data.rosterSize;
  if (body.data.captainMultiplier !== undefined) updateData.captainMultiplier = String(body.data.captainMultiplier);
  if (body.data.birdiePoints !== undefined) updateData.birdiePoints = String(body.data.birdiePoints);
  if (body.data.eaglePoints !== undefined) updateData.eaglePoints = String(body.data.eaglePoints);
  if (body.data.bogeyPenalty !== undefined) updateData.bogeyPenalty = String(body.data.bogeyPenalty);
  if (body.data.missedCutPenalty !== undefined) updateData.missedCutPenalty = String(body.data.missedCutPenalty);
  if (body.data.replacementTopRankLockout !== undefined) updateData.replacementTopRankLockout = body.data.replacementTopRankLockout;
  if (body.data.requireAmerican !== undefined) updateData.requireAmerican = body.data.requireAmerican;
  if (body.data.requireEuropean !== undefined) updateData.requireEuropean = body.data.requireEuropean;
  if (body.data.requireRow !== undefined) updateData.requireRow = body.data.requireRow;
  if (body.data.requireOutsideTop30 !== undefined) updateData.requireOutsideTop30 = body.data.requireOutsideTop30;
  if (body.data.salaryMin !== undefined) updateData.salaryMin = body.data.salaryMin;
  if (body.data.salaryMax !== undefined) updateData.salaryMax = body.data.salaryMax;
  if (body.data.scoringPlaces !== undefined) updateData.scoringPlaces = body.data.scoringPlaces;
  if (body.data.firstPlacePoints !== undefined) updateData.firstPlacePoints = body.data.firstPlacePoints;

  const [config] = await db.update(tournamentConfigsTable).set(updateData).where(eq(tournamentConfigsTable.tournamentId, params.data.id)).returning();
  if (!config) { res.status(404).json({ error: "Config not found" }); return; }
  res.json(formatConfig(config));
});

router.get("/tournaments/:id/position-points", async (req, res): Promise<void> => {
  const params = GetPositionPointsParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const pts = await db.select().from(tournamentPositionPointsTable).where(eq(tournamentPositionPointsTable.tournamentId, params.data.id)).orderBy(tournamentPositionPointsTable.position);
  res.json(pts.map(p => ({ position: p.position, points: Number(p.points) })));
});

router.post("/tournaments/:id/position-points", async (req, res): Promise<void> => {
  const params = SetPositionPointsParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = SetPositionPointsBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  await db.delete(tournamentPositionPointsTable).where(eq(tournamentPositionPointsTable.tournamentId, params.data.id));
  if (body.data.points.length > 0) {
    await db.insert(tournamentPositionPointsTable).values(body.data.points.map(p => ({
      tournamentId: params.data.id,
      position: p.position,
      points: String(p.points),
    })));
  }
  const pts = await db.select().from(tournamentPositionPointsTable).where(eq(tournamentPositionPointsTable.tournamentId, params.data.id)).orderBy(tournamentPositionPointsTable.position);
  res.json(pts.map(p => ({ position: p.position, points: Number(p.points) })));
});

function generatePositionPoints(scoringPlaces: number, firstPlacePoints: number): { position: number; points: number }[] {
  const pts: { position: number; points: number }[] = [];
  for (let i = 1; i <= scoringPlaces; i++) {
    // Exponential decay curve: more points at top, taper to 1
    const fraction = (i - 1) / (scoringPlaces - 1);
    const points = Math.round((firstPlacePoints * Math.pow(1 - fraction, 1.5)) * 10) / 10;
    pts.push({ position: i, points: Math.max(points, 1) });
  }
  return pts;
}

export default router;
