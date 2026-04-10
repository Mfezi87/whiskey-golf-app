import { Router, type IRouter } from "express";
import * as zod from "zod";
import { db, tournamentsTable, usersTable, tournamentParticipantsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { asyncHandler } from "../middlewares/error-handler";
import { BadRequestError, UnauthorizedError } from "../lib/http-errors";
import {
  getTournamentOrThrow,
  assertCommissioner,
  assertJoinModeAllows,
  validateInviteLinkToken,
  canViewTournament,
} from "../services/tournament-access-service";
import {
  getParticipant,
  getParticipantById,
  getAllParticipants,
  createInvitedParticipant,
  createRequestedParticipant,
  createJoinedParticipant,
  transitionParticipant,
  assertOwnParticipant,
  assertCommissionerParticipant,
} from "../services/participant-service";
import crypto from "crypto";

const router: IRouter = Router();

function parseId(raw: string): number {
  const n = parseInt(raw, 10);
  if (isNaN(n)) throw new BadRequestError("Invalid id");
  return n;
}

function requireAuth(session: Record<string, unknown>): number {
  const userId = session.userId as number | undefined;
  if (!userId) throw new UnauthorizedError("Must be logged in");
  return userId;
}

async function formatParticipant(p: typeof tournamentParticipantsTable.$inferSelect) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, p.userId));
  return {
    id: p.id,
    tournamentId: p.tournamentId,
    userId: p.userId,
    username: user?.username ?? "",
    displayName: user?.displayName ?? "",
    status: p.status,
    invitedByUserId: p.invitedByUserId ?? null,
    respondedAt: p.respondedAt ? p.respondedAt.toISOString() : null,
    joinedAt: p.joinedAt ? p.joinedAt.toISOString() : null,
    removedAt: p.removedAt ? p.removedAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
  };
}

async function formatParticipants(rows: (typeof tournamentParticipantsTable.$inferSelect)[]) {
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const users = userIds.length > 0
    ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  return rows.map((p) => {
    const user = userMap.get(p.userId);
    return {
      id: p.id,
      tournamentId: p.tournamentId,
      userId: p.userId,
      username: user?.username ?? "",
      displayName: user?.displayName ?? "",
      status: p.status,
      invitedByUserId: p.invitedByUserId ?? null,
      respondedAt: p.respondedAt ? p.respondedAt.toISOString() : null,
      joinedAt: p.joinedAt ? p.joinedAt.toISOString() : null,
      removedAt: p.removedAt ? p.removedAt.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
    };
  });
}

router.get("/tournaments/:id/participants", asyncHandler(async (req, res): Promise<void> => {
  const tournamentId = parseId(req.params.id);
  const userId = (req.session as Record<string, unknown>).userId as number | undefined ?? null;

  const tournament = await getTournamentOrThrow(tournamentId);
  const isCommissioner = userId !== null && tournament.commissionerUserId === userId;

  if (!isCommissioner) {
    const allowed = await canViewTournament(tournament, userId);
    if (!allowed) {
      throw new UnauthorizedError("You do not have access to this tournament");
    }
  }

  const allParticipants = await getAllParticipants(tournamentId);

  let visibleParticipants: typeof allParticipants;
  if (isCommissioner) {
    visibleParticipants = allParticipants;
  } else {
    const joinedParticipants = allParticipants.filter((p) => p.status === "joined");
    const myRecord = userId ? allParticipants.find((p) => p.userId === userId) : undefined;
    const myRecordNotJoined = myRecord && myRecord.status !== "joined" ? [myRecord] : [];
    visibleParticipants = [...joinedParticipants, ...myRecordNotJoined];
  }

  const myParticipant = userId ? allParticipants.find((p) => p.userId === userId) ?? null : null;

  const formatted = await formatParticipants(visibleParticipants);
  const myFormatted = myParticipant ? await formatParticipant(myParticipant) : null;

  res.json({
    participants: formatted,
    myParticipant: myFormatted,
    isCommissioner,
    tournamentJoinMode: tournament.joinMode,
    tournamentVisibility: tournament.visibility,
    commissionerUserId: tournament.commissionerUserId ?? null,
  });
}));

router.post("/tournaments/:id/request-join", asyncHandler(async (req, res): Promise<void> => {
  const tournamentId = parseId(req.params.id);
  const userId = requireAuth(req.session as Record<string, unknown>);
  const tournament = await getTournamentOrThrow(tournamentId);
  assertJoinModeAllows(tournament, "approval_required");
  const participant = await createRequestedParticipant(tournamentId, userId);
  res.status(201).json(await formatParticipant(participant));
}));

router.post("/tournaments/:id/open-join", asyncHandler(async (req, res): Promise<void> => {
  const tournamentId = parseId(req.params.id);
  const userId = requireAuth(req.session as Record<string, unknown>);
  const tournament = await getTournamentOrThrow(tournamentId);
  assertJoinModeAllows(tournament, "open_join");
  const participant = await createJoinedParticipant(tournamentId, userId);
  res.status(201).json(await formatParticipant(participant));
}));

router.post("/tournaments/:id/join-via-link", asyncHandler(async (req, res): Promise<void> => {
  const tournamentId = parseId(req.params.id);
  const userId = requireAuth(req.session as Record<string, unknown>);
  const tournament = await getTournamentOrThrow(tournamentId);
  assertJoinModeAllows(tournament, "link_only");

  const body = zod.object({ token: zod.string().min(1) }).safeParse(req.body);
  if (!body.success) throw new BadRequestError("token is required");
  validateInviteLinkToken(tournament, body.data.token);

  const participant = await createJoinedParticipant(tournamentId, userId);
  res.status(201).json(await formatParticipant(participant));
}));

router.post("/tournaments/:id/invite", asyncHandler(async (req, res): Promise<void> => {
  const tournamentId = parseId(req.params.id);
  const userId = requireAuth(req.session as Record<string, unknown>);
  const tournament = await getTournamentOrThrow(tournamentId);
  assertCommissioner(tournament, userId);

  const body = zod.object({
    username: zod.string().min(1).optional(),
    userId: zod.number().int().positive().optional(),
  }).refine(d => d.username || d.userId, { message: "Either username or userId is required" }).safeParse(req.body);
  if (!body.success) throw new BadRequestError(body.error.issues[0]?.message ?? "username or userId required");

  let targetUser: typeof usersTable.$inferSelect | undefined;
  if (body.data.userId) {
    const rows = await db.select().from(usersTable).where(eq(usersTable.id, body.data.userId));
    targetUser = rows[0];
  } else if (body.data.username) {
    const rows = await db.select().from(usersTable).where(eq(usersTable.username, body.data.username.toLowerCase()));
    targetUser = rows[0];
  }
  if (!targetUser) throw new BadRequestError("User not found");

  const participant = await createInvitedParticipant(tournamentId, targetUser.id, userId);
  res.status(201).json(await formatParticipant(participant));
}));

router.post("/tournaments/:id/accept-invite", asyncHandler(async (req, res): Promise<void> => {
  const tournamentId = parseId(req.params.id);
  const userId = requireAuth(req.session as Record<string, unknown>);
  const participant = await assertOwnParticipant(tournamentId, userId, "invited");
  const updated = await transitionParticipant(participant, "joined");
  res.json(await formatParticipant(updated));
}));

router.post("/tournaments/:id/decline-invite", asyncHandler(async (req, res): Promise<void> => {
  const tournamentId = parseId(req.params.id);
  const userId = requireAuth(req.session as Record<string, unknown>);
  const participant = await assertOwnParticipant(tournamentId, userId, "invited");
  const updated = await transitionParticipant(participant, "rejected");
  res.json(await formatParticipant(updated));
}));

router.post("/tournaments/:id/participants/:participantId/approve", asyncHandler(async (req, res): Promise<void> => {
  const tournamentId = parseId(req.params.id);
  const participantId = parseId(req.params.participantId);
  const userId = requireAuth(req.session as Record<string, unknown>);
  const tournament = await getTournamentOrThrow(tournamentId);
  assertCommissioner(tournament, userId);

  const participant = await assertCommissionerParticipant(participantId, tournamentId);
  if (participant.status !== "requested") {
    throw new BadRequestError(`Cannot approve a participant with status '${participant.status}'`);
  }
  const updated = await transitionParticipant(participant, "joined");
  res.json(await formatParticipant(updated));
}));

router.post("/tournaments/:id/participants/:participantId/reject", asyncHandler(async (req, res): Promise<void> => {
  const tournamentId = parseId(req.params.id);
  const participantId = parseId(req.params.participantId);
  const userId = requireAuth(req.session as Record<string, unknown>);
  const tournament = await getTournamentOrThrow(tournamentId);
  assertCommissioner(tournament, userId);

  const participant = await assertCommissionerParticipant(participantId, tournamentId);
  if (participant.status !== "requested" && participant.status !== "invited") {
    throw new BadRequestError(`Cannot reject a participant with status '${participant.status}'`);
  }
  const updated = await transitionParticipant(participant, "rejected");
  res.json(await formatParticipant(updated));
}));

router.post("/tournaments/:id/participants/:participantId/remove", asyncHandler(async (req, res): Promise<void> => {
  const tournamentId = parseId(req.params.id);
  const participantId = parseId(req.params.participantId);
  const userId = requireAuth(req.session as Record<string, unknown>);
  const tournament = await getTournamentOrThrow(tournamentId);
  assertCommissioner(tournament, userId);

  const participant = await assertCommissionerParticipant(participantId, tournamentId);
  if (participant.status !== "joined") {
    throw new BadRequestError(`Can only remove a joined participant, current status: '${participant.status}'`);
  }
  const updated = await transitionParticipant(participant, "removed");
  res.json(await formatParticipant(updated));
}));

router.post("/tournaments/:id/leave", asyncHandler(async (req, res): Promise<void> => {
  const tournamentId = parseId(req.params.id);
  const userId = requireAuth(req.session as Record<string, unknown>);
  const participant = await assertOwnParticipant(tournamentId, userId, "joined");
  const updated = await transitionParticipant(participant, "left");
  res.json(await formatParticipant(updated));
}));

router.post("/tournaments/:id/invite-link", asyncHandler(async (req, res): Promise<void> => {
  const tournamentId = parseId(req.params.id);
  const userId = requireAuth(req.session as Record<string, unknown>);
  const tournament = await getTournamentOrThrow(tournamentId);
  assertCommissioner(tournament, userId);

  const token = crypto.randomUUID();
  await db
    .update(tournamentsTable)
    .set({ inviteLinkToken: token, inviteLinkEnabled: true })
    .where(eq(tournamentsTable.id, tournamentId));

  const origin = (req.headers.origin as string | undefined) ?? `${req.protocol}://${req.get("host")}`;
  const link = `${origin}/tournaments/${tournamentId}?invite=${token}`;
  res.json({ token, enabled: true, link });
}));

export default router;
