import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import tournamentsRouter from "./tournaments";
import participantsRouter from "./participants";
import golfersRouter from "./golfers";
import draftsRouter from "./drafts";
import resultsRouter from "./results";
import leaderboardRouter from "./leaderboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(tournamentsRouter);
router.use(participantsRouter);
router.use(golfersRouter);
router.use(draftsRouter);
router.use(resultsRouter);
router.use(leaderboardRouter);

export default router;
