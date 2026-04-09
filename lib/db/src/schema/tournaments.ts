import { pgTable, text, serial, timestamp, integer, boolean, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const tournamentsTable = pgTable("tournaments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  courseName: text("course_name"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status").notNull().default("draft"), // draft | live | completed
  notes: text("notes"),
  winnerId: integer("winner_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const tournamentConfigsTable = pgTable("tournament_configs", {
  id: serial("id").primaryKey(),
  tournamentId: integer("tournament_id").notNull().references(() => tournamentsTable.id, { onDelete: "cascade" }),
  draftType: text("draft_type").notNull().default("alternate"),
  salaryCap: integer("salary_cap").notNull().default(100),
  rosterSize: integer("roster_size").notNull().default(4),
  captainMultiplier: numeric("captain_multiplier", { precision: 4, scale: 2 }).notNull().default("2"),
  birdiePoints: numeric("birdie_points", { precision: 4, scale: 2 }).notNull().default("1"),
  eaglePoints: numeric("eagle_points", { precision: 4, scale: 2 }).notNull().default("3"),
  bogeyPenalty: numeric("bogey_penalty", { precision: 4, scale: 2 }).notNull().default("0.5"),
  missedCutPenalty: numeric("missed_cut_penalty", { precision: 4, scale: 2 }).notNull().default("5"),
  replacementTopRankLockout: integer("replacement_top_rank_lockout").notNull().default(10),
  requireAmerican: boolean("require_american").notNull().default(true),
  requireEuropean: boolean("require_european").notNull().default(true),
  requireRow: boolean("require_row").notNull().default(true),
  requireOutsideTop30: boolean("require_outside_top_30").notNull().default(true),
  salaryMin: integer("salary_min").notNull().default(3),
  salaryMax: integer("salary_max").notNull().default(30),
  scoringPlaces: integer("scoring_places").notNull().default(50),
  firstPlacePoints: integer("first_place_points").notNull().default(50),
});

export const tournamentPositionPointsTable = pgTable("tournament_position_points", {
  id: serial("id").primaryKey(),
  tournamentId: integer("tournament_id").notNull().references(() => tournamentsTable.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  points: numeric("points", { precision: 6, scale: 2 }).notNull(),
});

export const insertTournamentSchema = createInsertSchema(tournamentsTable).omit({ id: true, createdAt: true, completedAt: true });
export type InsertTournament = z.infer<typeof insertTournamentSchema>;
export type Tournament = typeof tournamentsTable.$inferSelect;

export const insertTournamentConfigSchema = createInsertSchema(tournamentConfigsTable).omit({ id: true });
export type InsertTournamentConfig = z.infer<typeof insertTournamentConfigSchema>;
export type TournamentConfig = typeof tournamentConfigsTable.$inferSelect;
