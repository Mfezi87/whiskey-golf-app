import { pgTable, text, serial, integer, boolean, numeric, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tournamentsTable } from "./tournaments";

export const tournamentGolfersTable = pgTable("tournament_golfers", {
  id: serial("id").primaryKey(),
  tournamentId: integer("tournament_id").notNull().references(() => tournamentsTable.id, { onDelete: "cascade" }),
  golferName: text("golfer_name").notNull(),
  nationality: text("nationality").notNull(),
  region: text("region").notNull().default("ROW"), // EU | US | ROW
  avgOdds: numeric("avg_odds", { precision: 8, scale: 2 }),
  worldRanking: integer("world_ranking"),
  marketRank: integer("market_rank"),
  salary: real("salary"),
  outsideTop30: boolean("outside_top_30").notNull().default(false),
  eligibleForReplacement: boolean("eligible_for_replacement").notNull().default(true),
});

export const insertTournamentGolferSchema = createInsertSchema(tournamentGolfersTable).omit({ id: true });
export type InsertTournamentGolfer = z.infer<typeof insertTournamentGolferSchema>;
export type TournamentGolfer = typeof tournamentGolfersTable.$inferSelect;
