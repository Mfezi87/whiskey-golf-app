import { Router, type IRouter } from "express";
import { asyncHandler } from "../middlewares/error-handler";
import { BadRequestError, ConflictError, UnauthorizedError } from "../lib/http-errors";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { RegisterBody, LoginBody } from "@workspace/api-zod";

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

const router: IRouter = Router();

router.post("/auth/register", asyncHandler(async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    throw new BadRequestError("Invalid registration payload", parsed.error.flatten());
  }
  const { username, password, displayName } = parsed.data;

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.username, username.toLowerCase()));
  if (existing) {
    throw new ConflictError("Username already taken");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(usersTable)
    .values({ username: username.toLowerCase(), displayName, passwordHash })
    .returning();

  req.session.userId = user.id;
  res.status(201).json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      createdAt: user.createdAt.toISOString(),
    },
  });
}));

router.post("/auth/login", asyncHandler(async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    throw new BadRequestError("Invalid login payload", parsed.error.flatten());
  }
  const { username, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username.toLowerCase()));
  if (!user) {
    throw new UnauthorizedError("Invalid username or password");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError("Invalid username or password");
  }

  req.session.userId = user.id;
  res.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      createdAt: user.createdAt.toISOString(),
    },
  });
}));

router.post("/auth/logout", asyncHandler(async (req, res): Promise<void> => {
  req.session.destroy(() => {});
  res.json({ message: "Logged out" });
}));

router.get("/auth/me", asyncHandler(async (req, res): Promise<void> => {
  if (!req.session.userId) {
    throw new UnauthorizedError("Not authenticated");
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId));
  if (!user) {
    throw new UnauthorizedError("Not authenticated");
  }
  res.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
  });
}));

export default router;
