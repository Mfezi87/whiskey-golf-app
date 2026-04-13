import { Router, type IRouter } from "express";
import { db, tournamentsTable, tournamentConfigsTable, tournamentPositionPointsTable, fantasyTeamsTable, tournamentGolfersTable, usersTable, tournamentParticipantsTable } from "@workspace/db";
import { eq, or, inArray, and } from "drizzle-orm";
import {
  UpdateTournamentConfigBody,
  SetPositionPointsBody,
  GetTournamentParams,
  UpdateTournamentParams,
  GetTournamentConfigParams,
  UpdateTournamentConfigParams,
  GetPositionPointsParams,
  SetPositionPointsParams,
  CreateTournamentBody as GeneratedCreateTournamentBody,
  UpdateTournamentBody as GeneratedUpdateTournamentBody,
  CreateTournamentAccessBody,
  UpdateTournamentAccessBody,
} from "@workspace/api-zod";
import { asyncHandler } from "../middlewares/error-handler";
import { BadRequestError, UnauthorizedError } from "../lib/http-errors";
import { assertCommissioner, getTournamentOrThrow, canViewTournament, validateInviteLinkToken } from "../services/tournament-access-service";

const router: IRouter = Router();

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

const CreateTournamentBody = GeneratedCreateTournamentBody.merge(CreateTournamentAccessBody);
const UpdateTournamentBody = GeneratedUpdateTournamentBody.merge(UpdateTournamentAccessBody);

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
    commissionerUserId: t.commissionerUserId ?? null,
    visibility: t.visibility,
    joinMode: t.joinMode,
    inviteLinkEnabled: t.inviteLinkEnabled,
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

router.get("/tournaments", asyncHandler(async (req, res): Promise<void> => {
  const userId: number | null = (req.session as { userId?: number }).userId ?? null;

  let tournaments: (typeof tournamentsTable.$inferSelect)[];

  if (userId) {
    const myParticipations = await db
      .select({ tournamentId: tournamentParticipantsTable.tournamentId })
      .from(tournamentParticipantsTable)
      .where(
        and(
          eq(tournamentParticipantsTable.userId, userId),
          inArray(tournamentParticipantsTable.status, ["joined", "invited", "requested"]),
        ),
      );

    const myTournamentIds = myParticipations.map((p) => p.tournamentId);

    const conditions = [
      eq(tournamentsTable.visibility, "public"),
      eq(tournamentsTable.commissionerUserId, userId),
      ...(myTournamentIds.length > 0 ? [inArray(tournamentsTable.id, myTournamentIds)] : []),
    ];

    tournaments = await db
      .select()
      .from(tournamentsTable)
      .where(or(...conditions))
      .orderBy(tournamentsTable.createdAt);
  } else {
    tournaments = await db
      .select()
      .from(tournamentsTable)
      .where(eq(tournamentsTable.visibility, "public"))
      .orderBy(tournamentsTable.createdAt);
  }

  res.json(tournaments.map(formatTournament));
}));

router.post("/tournaments", asyncHandler(async (req, res): Promise<void> => {
  const userId = (req.session as { userId?: number }).userId;
  if (!userId) throw new UnauthorizedError("Must be logged in to create a tournament");

  const parsed = CreateTournamentBody.safeParse(req.body);
  if (!parsed.success) {
    throw new BadRequestError("Invalid tournament data", parsed.error.flatten());
  }
  const { name, courseName, startDate, endDate, notes, config, visibility, joinMode } = parsed.data;

  const [tournament] = await db
    .insert(tournamentsTable)
    .values({
      name,
      courseName,
      startDate,
      endDate,
      notes,
      commissionerUserId: userId,
      visibility: visibility ?? "private",
      joinMode: joinMode ?? "invite_only",
    })
    .returning();

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

  const pts = generatePositionPoints(configValues.scoringPlaces, configValues.firstPlacePoints);
  if (pts.length > 0) {
    await db.insert(tournamentPositionPointsTable).values(
      pts.map((p) => ({ tournamentId: tournament.id, position: p.position, points: String(p.points) })),
    );
  }

  res.status(201).json(formatTournament(tournament));
}));

router.get("/tournaments/:id", asyncHandler(async (req, res): Promise<void> => {
  const params = GetTournamentParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) throw new BadRequestError("Invalid tournament id");

  const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, params.data.id));
  if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }

  const userId: number | null = (req.session as { userId?: number }).userId ?? null;
  const isCommissioner = userId !== null && tournament.commissionerUserId === userId;
  if (!isCommissioner) {
    const allowed = await canViewTournament(tournament, userId);
    if (!allowed) {
      if (tournament.joinMode === "link_only" && userId !== null) {
        const inviteToken = req.query.invite as string | undefined;
        if (!inviteToken) throw new UnauthorizedError("You do not have access to this tournament");
        validateInviteLinkToken(tournament, inviteToken);
      } else {
        throw new UnauthorizedError("You do not have access to this tournament");
      }
    }
  }

  const [config] = await db.select().from(tournamentConfigsTable).where(eq(tournamentConfigsTable.tournamentId, tournament.id));
  const golfers = await db.select().from(tournamentGolfersTable).where(eq(tournamentGolfersTable.tournamentId, tournament.id)).orderBy(tournamentGolfersTable.marketRank);
  const teams = await db
    .select({ team: fantasyTeamsTable, user: usersTable })
    .from(fantasyTeamsTable)
    .innerJoin(usersTable, eq(fantasyTeamsTable.userId, usersTable.id))
    .where(eq(fantasyTeamsTable.tournamentId, tournament.id));

  const formattedGolfers = golfers.map((g) => ({
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
}));

router.delete("/tournaments/:id", asyncHandler(async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) throw new BadRequestError("Invalid tournament id");
  const [deleted] = await db.delete(tournamentsTable).where(eq(tournamentsTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Tournament not found" }); return; }
  res.json({ ok: true });
}));

router.patch("/tournaments/:id", asyncHandler(async (req, res): Promise<void> => {
  const params = UpdateTournamentParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) throw new BadRequestError("Invalid tournament id");

  const body = UpdateTournamentBody.safeParse(req.body);
  if (!body.success) throw new BadRequestError("Invalid update data", body.error.flatten());

  const userId = (req.session as { userId?: number }).userId;

  const tournament = await getTournamentOrThrow(params.data.id);

  const isChangingAccess = body.data.visibility !== undefined || body.data.joinMode !== undefined;
  if (isChangingAccess) {
    if (!userId) throw new UnauthorizedError("Must be logged in");
    assertCommissioner(tournament, userId);

    // Prevent visibility/joinMode changes after participants have joined
    const hasJoinedParticipants = await db
      .select({ id: tournamentParticipantsTable.id })
      .from(tournamentParticipantsTable)
      .where(
        and(
          eq(tournamentParticipantsTable.tournamentId, params.data.id),
          inArray(tournamentParticipantsTable.status, ["joined", "invited", "requested"])
        )
      )
      .limit(1);

    if (hasJoinedParticipants.length > 0) {
      throw new BadRequestError("Cannot change visibility or join mode after participants have joined the tournament");
    }
  }

  const updateData: Record<string, unknown> = {};
  if (body.data.name !== undefined) updateData.name = body.data.name;
  if (body.data.courseName !== undefined) updateData.courseName = body.data.courseName;
  if (body.data.startDate !== undefined) updateData.startDate = body.data.startDate;
  if (body.data.endDate !== undefined) updateData.endDate = body.data.endDate;
  if (body.data.status !== undefined) updateData.status = body.data.status;
  if (body.data.notes !== undefined) updateData.notes = body.data.notes;
  if (body.data.visibility !== undefined) updateData.visibility = body.data.visibility;
  if (body.data.joinMode !== undefined) updateData.joinMode = body.data.joinMode;

  const [updated] = await db.update(tournamentsTable).set(updateData).where(eq(tournamentsTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Tournament not found" }); return; }
  res.json(formatTournament(updated));
}));

router.get("/tournaments/:id/config", asyncHandler(async (req, res): Promise<void> => {
  const params = GetTournamentConfigParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) throw new BadRequestError("Invalid tournament id");
  const [config] = await db.select().from(tournamentConfigsTable).where(eq(tournamentConfigsTable.tournamentId, params.data.id));
  if (!config) { res.status(404).json({ error: "Config not found" }); return; }
  res.json(formatConfig(config));
}));

router.patch("/tournaments/:id/config", asyncHandler(async (req, res): Promise<void> => {
  const params = UpdateTournamentConfigParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) throw new BadRequestError("Invalid tournament id");
  const body = UpdateTournamentConfigBody.safeParse(req.body);
  if (!body.success) throw new BadRequestError("Invalid config data", body.error.flatten());

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
}));

router.get("/tournaments/:id/position-points", asyncHandler(async (req, res): Promise<void> => {
  const params = GetPositionPointsParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) throw new BadRequestError("Invalid tournament id");
  const pts = await db.select().from(tournamentPositionPointsTable).where(eq(tournamentPositionPointsTable.tournamentId, params.data.id)).orderBy(tournamentPositionPointsTable.position);
  res.json(pts.map((p) => ({ position: p.position, points: Number(p.points) })));
}));

router.post("/tournaments/:id/position-points", asyncHandler(async (req, res): Promise<void> => {
  const params = SetPositionPointsParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) throw new BadRequestError("Invalid tournament id");
  const body = SetPositionPointsBody.safeParse(req.body);
  if (!body.success) throw new BadRequestError("Invalid position points data", body.error.flatten());

  await db.delete(tournamentPositionPointsTable).where(eq(tournamentPositionPointsTable.tournamentId, params.data.id));
  if (body.data.points.length > 0) {
    await db.insert(tournamentPositionPointsTable).values(
      body.data.points.map((p) => ({
        tournamentId: params.data.id,
        position: p.position,
        points: String(p.points),
      })),
    );
  }
  const pts = await db.select().from(tournamentPositionPointsTable).where(eq(tournamentPositionPointsTable.tournamentId, params.data.id)).orderBy(tournamentPositionPointsTable.position);
  res.json(pts.map((p) => ({ position: p.position, points: Number(p.points) })));
}));

function generatePositionPoints(scoringPlaces: number, firstPlacePoints: number): { position: number; points: number }[] {
  const pts: { position: number; points: number }[] = [];
  for (let i = 1; i <= scoringPlaces; i++) {
    const fraction = (i - 1) / (scoringPlaces - 1);
    const points = Math.round((firstPlacePoints * Math.pow(1 - fraction, 1.5)) * 10) / 10;
    pts.push({ position: i, points: Math.max(points, 1) });
  }
  return pts;
}

export default router;
