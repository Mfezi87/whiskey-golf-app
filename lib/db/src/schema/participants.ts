import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { tournamentsTable } from "./tournaments";
import { usersTable } from "./users";

export const tournamentParticipantsTable = pgTable(
  "tournament_participants",
  {
    id: serial("id").primaryKey(),
    tournamentId: integer("tournament_id")
      .notNull()
      .references(() => tournamentsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    status: text("status").notNull(), // invited | requested | joined | rejected | removed | left
    invitedByUserId: integer("invited_by_user_id").references(() => usersTable.id),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("tournament_participants_unique").on(table.tournamentId, table.userId)],
);

export type TournamentParticipant = typeof tournamentParticipantsTable.$inferSelect;
export type InsertTournamentParticipant = typeof tournamentParticipantsTable.$inferInsert;
