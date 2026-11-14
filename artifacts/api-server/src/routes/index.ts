import { Router, type IRouter } from "express";
import healthRouter from "./health";
import liveRouter from "./live";
import supabaseAuthRouter from "./supabase-auth";
import supabaseLiveRouter from "./supabase-live";
import { isSupabaseMode } from "../lib/supabase";

const router: IRouter = Router();

router.use(healthRouter);
router.use(supabaseAuthRouter);
router.use(isSupabaseMode() ? supabaseLiveRouter : liveRouter);

export default router;
