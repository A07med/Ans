import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  ExecuteAdminActionBody,
  ExecuteAdminActionResponse,
  ExecuteStayAliveRoundBody,
  ExecuteStayAliveRoundResponse,
  GetEventStateResponse,
  GetEventSummaryResponse,
  RegisterParticipantBody,
  RegisterParticipantResponse,
  SubmitWamdaAttemptBody,
  SubmitWamdaAttemptResponse,
} from "@workspace/api-zod";
import { requireSupabaseAdmin } from "./supabase-auth";
import {
  isSupabaseMode,
  supabaseErrorResponse,
  supabaseRequest,
  supabaseRpc,
} from "../lib/supabase";

const router: IRouter = Router();
const PARTICIPANT_COOKIE = "anas_participant";

function normalizeOmanPhone(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  const local = digits.startsWith("968") ? digits.slice(3) : digits.startsWith("0") ? digits.slice(1) : digits;
  if (!/^[79]\d{7}$/.test(local)) return null;
  return `+968${local}`;
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function eventState() {
  return GetEventStateResponse.parse(await supabaseRpc("get_event_state", {}));
}

async function requireParticipant(req: Request, res: Response) {
  const token = req.cookies?.[PARTICIPANT_COOKIE] as string | undefined;
  if (!token) {
    res.status(401).json({ error: "participant_session_required" });
    return null;
  }
  try {
    const rows = (await supabaseRequest(
      `/rest/v1/participants?select=id,name&participant_session_hash=eq.${hashSessionToken(token)}&limit=1`,
    )) as Array<{ id: string; name: string }>;
    if (!rows[0]) {
      res.status(401).json({ error: "participant_session_invalid" });
      return null;
    }
    return rows[0];
  } catch (error) {
    const failure = supabaseErrorResponse(error);
    res.status(failure.status).json(failure.body);
    return null;
  }
}

router.get("/event/state", async (_req, res) => {
  if (!isSupabaseMode()) return;
  try {
    res.json(await eventState());
  } catch (error) {
    const failure = supabaseErrorResponse(error);
    res.status(failure.status).json(failure.body);
  }
});

router.get("/event/summary", async (_req, res) => {
  if (!isSupabaseMode()) return;
  try {
    res.json(GetEventSummaryResponse.parse(await supabaseRpc("get_event_summary", {})));
  } catch (error) {
    const failure = supabaseErrorResponse(error);
    res.status(failure.status).json(failure.body);
  }
});

router.post("/participants", async (req, res) => {
  if (!isSupabaseMode()) return;
  const parsed = RegisterParticipantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const phone = normalizeOmanPhone(parsed.data.phone);
  if (!phone) {
    res.status(400).json({ error: "invalid_oman_phone" });
    return;
  }
  const sessionToken = randomBytes(32).toString("base64url");
  try {
    const result = (await supabaseRpc("register_participant", {
      p_name: parsed.data.name.trim(),
      p_phone_normalized: phone,
      p_session_hash: hashSessionToken(sessionToken),
    })) as { id: string; name: string; is_new: boolean };
    res.cookie(PARTICIPANT_COOKIE, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env["NODE_ENV"] === "production",
      maxAge: 12 * 60 * 60 * 1000,
      path: "/",
    });
    res.status(result.is_new ? 201 : 200).json(
      RegisterParticipantResponse.parse({
        id: result.id,
        name: result.name,
        token: sessionToken,
      }),
    );
  } catch (error) {
    const failure = supabaseErrorResponse(error);
    res.status(failure.status).json(failure.body);
  }
});

router.post("/admin/actions", async (req, res) => {
  if (!isSupabaseMode()) return;
  const admin = await requireSupabaseAdmin(req, res);
  if (!admin) return;
  const parsed = ExecuteAdminActionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const next = await supabaseRpc("admin_action", {
      p_action: parsed.data.action,
      p_admin_user_id: admin.userId,
    });
    res.json(ExecuteAdminActionResponse.parse(next));
  } catch (error) {
    const failure = supabaseErrorResponse(error);
    res.status(failure.status).json(failure.body);
  }
});

router.post("/games/stay-alive/round", async (req, res) => {
  if (!isSupabaseMode()) return;
  const admin = await requireSupabaseAdmin(req, res);
  if (!admin) return;
  const parsed = ExecuteStayAliveRoundBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const next = await supabaseRpc("execute_stay_alive_round", {
      p_target_survivors: parsed.data.targetSurvivors,
      p_idempotency_key: req.header("idempotency-key") ?? randomUUID(),
      p_admin_user_id: admin.userId,
    });
    res.json(ExecuteStayAliveRoundResponse.parse(next));
  } catch (error) {
    const failure = supabaseErrorResponse(error);
    res.status(failure.status).json(failure.body);
  }
});

router.post("/games/wamda/attempt", async (req, res) => {
  if (!isSupabaseMode()) return;
  const participant = await requireParticipant(req, res);
  if (!participant) return;
  const parsed = SubmitWamdaAttemptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const next = await supabaseRpc("submit_wamda_attempt", {
      p_participant_id: participant.id,
      p_session_id: parsed.data.sessionId,
      p_signal_id: parsed.data.signalId,
      p_reaction_ms: parsed.data.reactionMs,
      p_false_start: parsed.data.falseStart,
    });
    res.json(SubmitWamdaAttemptResponse.parse(next));
  } catch (error) {
    const failure = supabaseErrorResponse(error);
    res.status(failure.status).json(failure.body);
  }
});

export default router;