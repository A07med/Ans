import { Router, type IRouter, type Request, type Response } from "express";
import {
  isSupabaseMode,
  supabaseErrorResponse,
  supabaseRequest,
} from "../lib/supabase";

const router: IRouter = Router();
const ADMIN_COOKIE = "anas_admin_access";

type AdminIdentity = { userId: string; email: string | null };

function cookieValue(req: Request, name: string) {
  const header = req.header("cookie") ?? "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function getAdminIdentity(req: Request): Promise<AdminIdentity | null> {
  if (!isSupabaseMode()) return null;
  const accessToken = cookieValue(req, ADMIN_COOKIE);
  if (!accessToken) return null;
  try {
    const user = (await supabaseRequest("/auth/v1/user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })) as { id?: string; email?: string };
    if (!user.id) return null;
    const rows = (await supabaseRequest(
      `/rest/v1/admin_profiles?select=user_id&user_id=eq.${encodeURIComponent(user.id)}&active=eq.true&limit=1`,
    )) as Array<{ user_id: string }>;
    return rows[0]?.user_id
      ? { userId: rows[0].user_id, email: user.email ?? null }
      : null;
  } catch {
    return null;
  }
}

export async function requireSupabaseAdmin(
  req: Request,
  res: Response,
): Promise<AdminIdentity | null> {
  const identity = await getAdminIdentity(req);
  if (!identity) {
    res.status(401).json({ error: "admin_auth_required" });
    return null;
  }
  return identity;
}

router.post("/auth/admin/login", async (req, res) => {
  if (!isSupabaseMode()) {
    res.status(409).json({ error: "demo_mode", message: "Use the demo access code." });
    return;
  }
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";
  if (!email || !password) {
    res.status(400).json({ error: "email_and_password_required" });
    return;
  }
  try {
    const session = (await supabaseRequest("/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })) as { access_token?: string; user?: { id?: string } };
    if (!session.access_token || !session.user?.id) {
      res.status(401).json({ error: "invalid_admin_credentials" });
      return;
    }
    const admins = (await supabaseRequest(
      `/rest/v1/admin_profiles?select=user_id&user_id=eq.${encodeURIComponent(session.user.id)}&active=eq.true&limit=1`,
    )) as Array<{ user_id: string }>;
    if (!admins.length) {
      res.status(403).json({ error: "not_an_authorized_admin" });
      return;
    }
    res.cookie(ADMIN_COOKIE, session.access_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env["NODE_ENV"] === "production",
      maxAge: 8 * 60 * 60 * 1000,
      path: "/",
    });
    res.json({ ok: true });
  } catch (error) {
    const failure = supabaseErrorResponse(error);
    res.status(failure.status).json(failure.body);
  }
});

router.get("/auth/admin/me", async (req, res) => {
  if (!isSupabaseMode()) {
    res.status(200).json({ ok: true, mode: "demo" });
    return;
  }
  const identity = await getAdminIdentity(req);
  if (!identity) {
    res.status(401).json({ error: "admin_auth_required" });
    return;
  }
  res.json({ ok: true, mode: "supabase", email: identity.email });
});

router.post("/auth/admin/logout", (_req, res) => {
  res.clearCookie(ADMIN_COOKIE, { httpOnly: true, sameSite: "lax", path: "/" });
  res.status(204).end();
});

export default router;