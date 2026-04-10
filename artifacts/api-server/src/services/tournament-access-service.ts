import { db, tournamentsTable, tournamentParticipantsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { UnauthorizedError, BadRequestError } from "../lib/http-errors";

export type TournamentRow = typeof tournamentsTable.$inferSelect;

export async function getTournamentOrThrow(id: number): Promise<TournamentRow> {
  const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, id));
  if (!tournament) {
    throw new BadRequestError("Tournament not found");
  }
  return tournament;
}

export function assertCommissioner(tournament: TournamentRow, userId: number): void {
  if (tournament.commissionerUserId === null) {
    throw new UnauthorizedError("This tournament has no commissioner set (legacy tournament)");
  }
  if (tournament.commissionerUserId !== userId) {
    throw new UnauthorizedError("Only the tournament commissioner can perform this action");
  }
}

export function assertJoinModeAllows(tournament: TournamentRow, action: "open_join" | "approval_required" | "link_only"): void {
  if (tournament.joinMode !== action) {
    const labels: Record<string, string> = {
      open_join: "This tournament requires approval to join",
      approval_required: "This tournament does not require a join request",
      link_only: "This tournament does not use invite links for joining",
    };
    throw new BadRequestError(labels[action] ?? "Join mode mismatch");
  }
}

export function validateInviteLinkToken(tournament: TournamentRow, token: string): void {
  if (!tournament.inviteLinkEnabled) {
    throw new BadRequestError("Invite link is not enabled for this tournament");
  }
  if (!tournament.inviteLinkToken || tournament.inviteLinkToken !== token) {
    throw new BadRequestError("Invalid or expired invite link token");
  }
}

export async function canViewTournament(tournament: TournamentRow, userId: number | null): Promise<boolean> {
  if (tournament.visibility === "public") return true;
  if (!userId) return false;
  const [participant] = await db
    .select()
    .from(tournamentParticipantsTable)
    .where(
      and(
        eq(tournamentParticipantsTable.tournamentId, tournament.id),
        eq(tournamentParticipantsTable.userId, userId),
      ),
    );
  return !!participant;
}

export async function getParticipantForUser(tournamentId: number, userId: number) {
  const [participant] = await db
    .select()
    .from(tournamentParticipantsTable)
    .where(eq(tournamentParticipantsTable.tournamentId, tournamentId))
    .then((rows) => rows.filter((r) => r.userId === userId));
  return participant ?? null;
}
