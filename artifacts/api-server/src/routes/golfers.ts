import { Router, type IRouter } from "express";
import { db, tournamentGolfersTable, tournamentConfigsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  GetTournamentGolfersParams,
  AddGolferToTournamentParams,
  AddGolferToTournamentBody,
  UpdateTournamentGolferParams,
  UpdateTournamentGolferBody,
  RemoveGolferFromTournamentParams,
  UploadGolfersCsvParams,
  UploadGolfersCsvBody,
  AutoGenerateSalariesParams,
  AutoGenerateSalariesBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

function formatGolfer(g: typeof tournamentGolfersTable.$inferSelect) {
  return {
    id: g.id,
    tournamentId: g.tournamentId,
    golferName: g.golferName,
    nationality: g.nationality,
    region: g.region as "EU" | "US" | "ROW",
    avgOdds: g.avgOdds ? Number(g.avgOdds) : null,
    worldRanking: g.worldRanking ?? null,
    marketRank: g.marketRank ?? null,
    salary: g.salary ?? null,
    outsideTop30: g.outsideTop30,
    eligibleForReplacement: g.eligibleForReplacement,
  };
}

function autoSalary(rank: number, totalGolfers: number, salaryMin: number, salaryMax: number): number {
  if (totalGolfers <= 1) return salaryMax;
  const fraction = (rank - 1) / (totalGolfers - 1);
  const salary = salaryMax - fraction * (salaryMax - salaryMin);
  return Math.round(salary * 10) / 10;
}

router.get("/tournaments/:id/golfers", async (req, res): Promise<void> => {
  const params = GetTournamentGolfersParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const golfers = await db.select().from(tournamentGolfersTable)
    .where(eq(tournamentGolfersTable.tournamentId, params.data.id))
    .orderBy(tournamentGolfersTable.marketRank);
  res.json(golfers.map(formatGolfer));
});

router.post("/tournaments/:id/golfers", async (req, res): Promise<void> => {
  const params = AddGolferToTournamentParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = AddGolferToTournamentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [golfer] = await db.insert(tournamentGolfersTable).values({
    tournamentId: params.data.id,
    golferName: body.data.golferName,
    nationality: body.data.nationality,
    region: body.data.region,
    avgOdds: body.data.avgOdds != null ? String(body.data.avgOdds) : null,
    worldRanking: body.data.worldRanking ?? null,
    marketRank: body.data.marketRank ?? null,
    salary: body.data.salary ?? null,
    outsideTop30: body.data.outsideTop30 ?? false,
  }).returning();

  res.status(201).json(formatGolfer(golfer));
});

router.post("/tournaments/:id/golfers/csv", async (req, res): Promise<void> => {
  const params = UploadGolfersCsvParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UploadGolfersCsvBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const lines = body.data.csvData.trim().split("\n").filter(l => l.trim());
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;
  const inserted: typeof tournamentGolfersTable.$inferSelect[] = [];

  if (body.data.replaceExisting) {
    await db.delete(tournamentGolfersTable).where(eq(tournamentGolfersTable.tournamentId, params.data.id));
  }

  // Get config for auto-salary later
  const [config] = await db.select().from(tournamentConfigsTable).where(eq(tournamentConfigsTable.tournamentId, params.data.id));
  const salaryMin = config?.salaryMin ?? 3;
  const salaryMax = config?.salaryMax ?? 30;

  const golfersToInsert: { name: string; nationality: string; region: string; avgOdds: number | null; worldRanking: number | null; salary: number | null; marketRank: number | null; outsideTop30: boolean }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || (i === 0 && line.toLowerCase().startsWith("golfer"))) {
      skipped++;
      continue; // skip header
    }
    const cols = line.split(",").map(c => c.trim());
    if (cols.length < 3) {
      errors.push(`Row ${i + 1}: not enough columns (got ${cols.length}, need at least 3)`);
      skipped++;
      continue;
    }
    const [golferName, nationality, regionRaw, avgOddsStr, worldRankStr, salaryStr, marketRankStr] = cols;

    // Normalize region: "USA" → "US", "EUR"/"EUROPE" → "EU", anything else → "ROW"
    const regionNorm = (regionRaw || "ROW").toUpperCase().trim();
    let region = regionNorm;
    if (regionNorm === "USA" || regionNorm === "AMERICA" || regionNorm === "AMERICAN") region = "US";
    else if (regionNorm === "EUR" || regionNorm === "EUROPE" || regionNorm === "EUROPEAN") region = "EU";
    else if (!["EU", "US", "ROW"].includes(regionNorm)) region = "ROW";

    if (!golferName || !nationality) {
      errors.push(`Row ${i + 1}: missing name or nationality`);
      skipped++;
      continue;
    }
    const avgOdds = avgOddsStr ? parseFloat(avgOddsStr) : null;
    const worldRanking = worldRankStr ? parseInt(worldRankStr, 10) : null;
    const salaryNum = salaryStr ? parseFloat(salaryStr) : null;
    const salary = salaryNum != null && !isNaN(salaryNum) ? salaryNum : null;
    // Last column may be a marketRank number or a Y/N flag — accept either
    const marketRankNum = marketRankStr ? parseInt(marketRankStr, 10) : null;
    const marketRank = (marketRankNum != null && !isNaN(marketRankNum)) ? marketRankNum : null;
    golfersToInsert.push({ name: golferName, nationality, region, avgOdds: (avgOdds != null && !isNaN(avgOdds)) ? avgOdds : null, worldRanking: (worldRanking != null && !isNaN(worldRanking)) ? worldRanking : null, salary, marketRank, outsideTop30: false });
  }

  // Sort by avgOdds ascending to assign market rank if not provided
  const sorted = [...golfersToInsert].sort((a, b) => {
    if (a.avgOdds == null && b.avgOdds == null) return 0;
    if (a.avgOdds == null) return 1;
    if (b.avgOdds == null) return -1;
    return a.avgOdds - b.avgOdds;
  });

  for (let i = 0; i < sorted.length; i++) {
    const g = sorted[i];
    const computedMarketRank = g.marketRank ?? (i + 1);
    const computedSalary = g.salary ?? autoSalary(computedMarketRank, sorted.length, salaryMin, salaryMax);
    const outsideTop30 = computedMarketRank > 30;
    const [golfer] = await db.insert(tournamentGolfersTable).values({
      tournamentId: params.data.id,
      golferName: g.name,
      nationality: g.nationality,
      region: g.region,
      avgOdds: g.avgOdds != null ? String(g.avgOdds) : null,
      worldRanking: g.worldRanking,
      marketRank: computedMarketRank,
      salary: computedSalary,
      outsideTop30,
    }).returning();
    inserted.push(golfer);
    imported++;
  }

  res.json({ imported, skipped, errors, golfers: inserted.map(formatGolfer) });
});

router.patch("/tournaments/:id/golfers/:golferId", async (req, res): Promise<void> => {
  const idParam = parseId(req.params.id);
  const golferIdParam = parseId(req.params.golferId);
  const params = UpdateTournamentGolferParams.safeParse({ id: idParam, golferId: golferIdParam });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpdateTournamentGolferBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const updateData: Record<string, unknown> = {};
  if (body.data.golferName !== undefined) updateData.golferName = body.data.golferName;
  if (body.data.nationality !== undefined) updateData.nationality = body.data.nationality;
  if (body.data.region !== undefined) updateData.region = body.data.region;
  if (body.data.avgOdds !== undefined) updateData.avgOdds = body.data.avgOdds != null ? String(body.data.avgOdds) : null;
  if (body.data.worldRanking !== undefined) updateData.worldRanking = body.data.worldRanking;
  if (body.data.salary !== undefined) updateData.salary = body.data.salary;
  if (body.data.marketRank !== undefined) updateData.marketRank = body.data.marketRank;
  if (body.data.outsideTop30 !== undefined) updateData.outsideTop30 = body.data.outsideTop30;

  const [golfer] = await db.update(tournamentGolfersTable)
    .set(updateData)
    .where(and(eq(tournamentGolfersTable.id, params.data.golferId), eq(tournamentGolfersTable.tournamentId, params.data.id)))
    .returning();
  if (!golfer) { res.status(404).json({ error: "Golfer not found" }); return; }
  res.json(formatGolfer(golfer));
});

router.delete("/tournaments/:id/golfers/:golferId", async (req, res): Promise<void> => {
  const idParam = parseId(req.params.id);
  const golferIdParam = parseId(req.params.golferId);
  const params = RemoveGolferFromTournamentParams.safeParse({ id: idParam, golferId: golferIdParam });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  await db.delete(tournamentGolfersTable)
    .where(and(eq(tournamentGolfersTable.id, params.data.golferId), eq(tournamentGolfersTable.tournamentId, params.data.id)));
  res.sendStatus(204);
});

router.post("/tournaments/:id/golfers/auto-salary", async (req, res): Promise<void> => {
  const params = AutoGenerateSalariesParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = AutoGenerateSalariesBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const golfers = await db.select().from(tournamentGolfersTable)
    .where(eq(tournamentGolfersTable.tournamentId, params.data.id))
    .orderBy(tournamentGolfersTable.marketRank);

  // Sort by avgOdds and re-assign market ranks + salaries
  const sorted = [...golfers].sort((a, b) => {
    const ao = a.avgOdds ? Number(a.avgOdds) : Infinity;
    const bo = b.avgOdds ? Number(b.avgOdds) : Infinity;
    return ao - bo;
  });

  const updated = [];
  for (let i = 0; i < sorted.length; i++) {
    const g = sorted[i];
    const rank = i + 1;
    const salary = autoSalary(rank, sorted.length, body.data.salaryMin, body.data.salaryMax);
    const [u] = await db.update(tournamentGolfersTable)
      .set({ marketRank: rank, salary, outsideTop30: rank > 30 })
      .where(eq(tournamentGolfersTable.id, g.id))
      .returning();
    updated.push(u);
  }
  res.json(updated.map(formatGolfer));
});

export default router;
