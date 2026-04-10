import * as zod from "zod";

export const TournamentVisibility = zod.enum(["public", "private"]);
export type TournamentVisibility = zod.infer<typeof TournamentVisibility>;

export const TournamentJoinMode = zod.enum(["open_join", "approval_required", "invite_only", "link_only"]);
export type TournamentJoinMode = zod.infer<typeof TournamentJoinMode>;

export const TournamentParticipantStatus = zod.enum(["invited", "requested", "joined", "rejected", "removed", "left"]);
export type TournamentParticipantStatus = zod.infer<typeof TournamentParticipantStatus>;

export const CreateTournamentAccessBody = zod.object({
  visibility: TournamentVisibility.optional().default("private"),
  joinMode: TournamentJoinMode.optional().default("invite_only"),
});
export type CreateTournamentAccessBody = zod.infer<typeof CreateTournamentAccessBody>;

export const UpdateTournamentAccessBody = zod.object({
  visibility: TournamentVisibility.optional(),
  joinMode: TournamentJoinMode.optional(),
});
export type UpdateTournamentAccessBody = zod.infer<typeof UpdateTournamentAccessBody>;

export const ParticipantRecord = zod.object({
  id: zod.number(),
  tournamentId: zod.number(),
  userId: zod.number(),
  username: zod.string(),
  displayName: zod.string(),
  status: TournamentParticipantStatus,
  invitedByUserId: zod.number().nullable(),
  respondedAt: zod.string().nullable(),
  joinedAt: zod.string().nullable(),
  removedAt: zod.string().nullable(),
  createdAt: zod.string(),
});
export type ParticipantRecord = zod.infer<typeof ParticipantRecord>;

export const ParticipantListResponse = zod.object({
  participants: zod.array(ParticipantRecord),
  myParticipant: ParticipantRecord.nullable(),
  isCommissioner: zod.boolean(),
});
export type ParticipantListResponse = zod.infer<typeof ParticipantListResponse>;

export const JoinViaLinkBody = zod.object({
  token: zod.string().min(1),
});
export type JoinViaLinkBody = zod.infer<typeof JoinViaLinkBody>;

export const InviteParticipantBody = zod.object({
  username: zod.string().min(1),
});
export type InviteParticipantBody = zod.infer<typeof InviteParticipantBody>;

export const InviteLinkResponse = zod.object({
  token: zod.string(),
  enabled: zod.boolean(),
});
export type InviteLinkResponse = zod.infer<typeof InviteLinkResponse>;
