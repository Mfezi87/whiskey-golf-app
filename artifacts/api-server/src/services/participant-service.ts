import { db, tournamentParticipantsTable, fantasyTeamsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { ConflictError, BadRequestError, UnauthorizedError } from "../lib/http-errors";

type ParticipantRow = typeof tournamentParticipantsTable.$inferSelect;
type Status = ParticipantRow["status"];

const VALID_TRANSITIONS: Record<Status, Status[]> = {
  invited: ["joined", "rejected", "removed"],
  requested: ["joined", "rejected"],
  joined: ["left", "removed"],
  rejected: [],
  removed: [],
  left: [],
};

function assertTransition(current: Status, next: Status): void {
  if (!VALID_TRANSITIONS[current]?.includes(next)) {
    throw new BadRequestError(`Cannot transition participant from '${current}' to '${next}'`);
  }
}

export async function getParticipant(tournamentId: number, userId: number): Promise<ParticipantRow | null> {
  const rows = await db
    .select()
    .from(tournamentParticipantsTable)
    .where(
      and(
        eq(tournamentParticipantsTable.tournamentId, tournamentId),
        eq(tournamentParticipantsTable.userId, userId),
      ),
    );
  return rows[0] ?? null;
}

export async function getParticipantById(id: number): Promise<ParticipantRow | null> {
  const rows = await db
    .select()
    .from(tournamentParticipantsTable)
    .where(eq(tournamentParticipantsTable.id, id));
  return rows[0] ?? null;
}

export async function getAllParticipants(tournamentId: number): Promise<ParticipantRow[]> {
  return db
    .select()
    .from(tournamentParticipantsTable)
    .where(eq(tournamentParticipantsTable.tournamentId, tournamentId));
}

async function ensureNoActiveParticipant(tournamentId: number, userId: number): Promise<void> {
  const existing = await getParticipant(tournamentId, userId);
  if (existing) {
    if (existing.status === "joined") {
      throw new ConflictError("User is already a participant in this tournament");
    }
    if (existing.status === "invited" || existing.status === "requested") {
      throw new ConflictError(`User already has a pending ${existing.status} record`);
    }
    if (existing.status === "rejected" || existing.status === "removed" || existing.status === "left") {
      throw new BadRequestError(`Cannot re-enter: participant was previously ${existing.status}. A new invitation is required.`);
    }
  }
}

async function createFantasyTeamIfNeeded(tournamentId: number, userId: number): Promise<void> {
  const existing = await db
    .select()
    .from(fantasyTeamsTable)
    .where(
      and(eq(fantasyTeamsTable.tournamentId, tournamentId), eq(fantasyTeamsTable.userId, userId)),
    );
  if (existing.length === 0) {
    await db.insert(fantasyTeamsTable).values({ tournamentId, userId });
  }
}

export async function createInvitedParticipant(
  tournamentId: number,
  userId: number,
  invitedByUserId: number,
): Promise<ParticipantRow> {
  await ensureNoActiveParticipant(tournamentId, userId);
  const [row] = await db
    .insert(tournamentParticipantsTable)
    .values({ tournamentId, userId, status: "invited", invitedByUserId })
    .returning();
  return row;
}

export async function createRequestedParticipant(
  tournamentId: number,
  userId: number,
): Promise<ParticipantRow> {
  await ensureNoActiveParticipant(tournamentId, userId);
  const [row] = await db
    .insert(tournamentParticipantsTable)
    .values({ tournamentId, userId, status: "requested" })
    .returning();
  return row;
}

export async function createJoinedParticipant(
  tournamentId: number,
  userId: number,
): Promise<ParticipantRow> {
  await ensureNoActiveParticipant(tournamentId, userId);
  const now = new Date();
  const [row] = await db
    .insert(tournamentParticipantsTable)
    .values({ tournamentId, userId, status: "joined", joinedAt: now })
    .returning();
  await createFantasyTeamIfNeeded(tournamentId, userId);
  return row;
}

export async function transitionParticipant(
  participant: ParticipantRow,
  newStatus: Status,
): Promise<ParticipantRow> {
  assertTransition(participant.status, newStatus);
  const now = new Date();
  const updates: Partial<ParticipantRow> = { status: newStatus };

  if (newStatus === "joined") {
    updates.joinedAt = now;
    updates.respondedAt = now;
  } else if (newStatus === "rejected" || newStatus === "left") {
    updates.respondedAt = now;
  } else if (newStatus === "removed") {
    updates.removedAt = now;
  }

  const [updated] = await db
    .update(tournamentParticipantsTable)
    .set(updates)
    .where(eq(tournamentParticipantsTable.id, participant.id))
    .returning();

  if (newStatus === "joined") {
    await createFantasyTeamIfNeeded(participant.tournamentId, participant.userId);
  }

  return updated;
}

export async function assertOwnParticipant(
  tournamentId: number,
  userId: number,
  expectedStatus: Status,
): Promise<ParticipantRow> {
  const participant = await getParticipant(tournamentId, userId);
  if (!participant) {
    throw new BadRequestError("You do not have a participant record for this tournament");
  }
  if (participant.status !== expectedStatus) {
    throw new BadRequestError(`Expected participant status '${expectedStatus}', but found '${participant.status}'`);
  }
  return participant;
}

export async function assertCommissionerParticipant(
  participantId: number,
  tournamentId: number,
): Promise<ParticipantRow> {
  const participant = await getParticipantById(participantId);
  if (!participant || participant.tournamentId !== tournamentId) {
    throw new BadRequestError("Participant not found in this tournament");
  }
  return participant;
}

export { UnauthorizedError };
