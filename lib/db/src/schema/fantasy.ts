import { pgTable, text, serial, integer, boolean, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tournamentsTable } from "./tournaments";
import { usersTable } from "./users";
import { tournamentGolfersTable } from "./golfers";

export const fantasyTeamsTable = pgTable("fantasy_teams", {
  id: serial("id").primaryKey(),
  tournamentId: integer("tournament_id").notNull().references(() => tournamentsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  totalSalary: integer("total_salary"),
  totalScore: numeric("total_score", { precision: 8, scale: 2 }),
  isWinner: boolean("is_winner").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fantasyTeamPicksTable = pgTable("fantasy_team_picks", {
  id: serial("id").primaryKey(),
  fantasyTeamId: integer("fantasy_team_id").notNull().references(() => fantasyTeamsTable.id, { onDelete: "cascade" }),
  golferPoolId: integer("golfer_pool_id").notNull().references(() => tournamentGolfersTable.id),
  slotNumber: integer("slot_number").notNull(),
  isCaptain: boolean("is_captain").notNull().default(false),
  missedCut: boolean("missed_cut").notNull().default(false),
  replacementGolferPoolId: integer("replacement_golfer_pool_id").references(() => tournamentGolfersTable.id),
  slotScorePreMultiplier: numeric("slot_score_pre_multiplier", { precision: 8, scale: 2 }),
  slotScorePostMultiplier: numeric("slot_score_post_multiplier", { precision: 8, scale: 2 }),
});

export const golferResultsTable = pgTable("golfer_results", {
  id: serial("id").primaryKey(),
  tournamentId: integer("tournament_id").notNull().references(() => tournamentsTable.id, { onDelete: "cascade" }),
  golferPoolId: integer("golfer_pool_id").notNull().references(() => tournamentGolfersTable.id),
  finishPosition: integer("finish_position"),
  birdies: integer("birdies"),
  eagles: integer("eagles"),
  bogeys: integer("bogeys"),
  missedCut: boolean("missed_cut").notNull().default(false),
});

export const replacementResultsTable = pgTable("replacement_results", {
  id: serial("id").primaryKey(),
  tournamentId: integer("tournament_id").notNull().references(() => tournamentsTable.id, { onDelete: "cascade" }),
  originalPickId: integer("original_pick_id").notNull().references(() => fantasyTeamPicksTable.id, { onDelete: "cascade" }),
  replacementGolferPoolId: integer("replacement_golfer_pool_id").notNull().references(() => tournamentGolfersTable.id),
  finishPosition: integer("finish_position"),
  birdies: integer("birdies"),
  eagles: integer("eagles"),
  bogeys: integer("bogeys"),
  replacementScore: numeric("replacement_score", { precision: 8, scale: 2 }),
});

export const insertFantasyTeamSchema = createInsertSchema(fantasyTeamsTable).omit({ id: true, createdAt: true });
export type InsertFantasyTeam = z.infer<typeof insertFantasyTeamSchema>;
export type FantasyTeam = typeof fantasyTeamsTable.$inferSelect;

export const insertFantasyTeamPickSchema = createInsertSchema(fantasyTeamPicksTable).omit({ id: true });
export type InsertFantasyTeamPick = z.infer<typeof insertFantasyTeamPickSchema>;
export type FantasyTeamPick = typeof fantasyTeamPicksTable.$inferSelect;
