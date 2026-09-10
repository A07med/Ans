import { Router, type IRouter } from "express";
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

type Experience = "lobby" | "stay_alive" | "intermission" | "wamda" | "end";
type GameStatus = "idle" | "live" | "paused" | "selection" | "revealed" | "complete";
type StageMode = "lobby" | "alive" | "wamda" | "end";
type WamdaSignal = "idle" | "red" | "green" | "closed";

type LiveState = {
  registrationOpen: boolean;
  currentExperience: Experience;
  activeGame: "stay_alive" | "wamda" | null;
  gameStatus: GameStatus;
  stageMode: StageMode;
  registered: number;
  connected: number;
  stayAliveRemaining: number;
  stayAliveRound: number;
  stayAliveWinner: string | null;
  wamdaReady: number;
  wamdaResponses: number;
  wamdaFalseStarts: number;
  wamdaFastestMs: number | null;
  wamdaWinner: string | null;
  wamdaSignal: WamdaSignal;
  updatedAt: string;
};

type LogEntry = {
  id: string;
  label: string;
  detail: string;
  time: string;
};

const state: LiveState = {
  registrationOpen: true,
  currentExperience: "lobby",
  activeGame: null,
  gameStatus: "idle",
  stageMode: "lobby",
  registered: 487,
  connected: 421,
  stayAliveRemaining: 487,
  stayAliveRound: 0,
  stayAliveWinner: null,
  wamdaReady: 398,
  wamdaResponses: 0,
  wamdaFalseStarts: 0,
  wamdaFastestMs: null,
  wamdaWinner: null,
  wamdaSignal: "idle",
  updatedAt: new Date().toISOString(),
};

const eventLog: LogEntry[] = [
  {
    id: crypto.randomUUID(),
    label: "النظام جاهز",
    detail: "أُنس Live يعمل في وضع المعاينة",
    time: "الآن",
  },
  {
    id: crypto.randomUUID(),
    label: "التسجيل مفتوح",
    detail: "رمز الدخول جاهز للمشاركة",
    time: "قبل 3 دقائق",
  },
];

function touch() {
  state.updatedAt = new Date().toISOString();
}

function addLog(label: string, detail: string) {
  eventLog.unshift({
    id: crypto.randomUUID(),
    label,
    detail,
    time: "الآن",
  });
  eventLog.splice(8);
}

function currentState() {
  return GetEventStateResponse.parse(state);
}

const router: IRouter = Router();

router.get("/event/state", (_req, res) => {
  res.json(GetEventStateResponse.parse(currentState()));
});

router.get("/event/summary", (_req, res) => {
  res.json(
    GetEventSummaryResponse.parse({
      ...currentState(),
      eventLog,
    }),
  );
});

router.post("/participants", (req, res) => {
  const parsed = RegisterParticipantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  state.registered += 1;
  state.connected += 1;
  if (state.currentExperience === "lobby") {
    state.stayAliveRemaining = state.registered;
  }
  touch();
  addLog("مشارك جديد", "تم تسجيل مشارك في أُنس");
  res.status(201).json(
    RegisterParticipantResponse.parse({
      id: crypto.randomUUID(),
      name: parsed.data.name,
      token: crypto.randomUUID(),
    }),
  );
});

router.post("/admin/actions", (req, res) => {
  const parsed = ExecuteAdminActionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { action } = parsed.data;
  switch (action) {
    case "open_registration":
      state.registrationOpen = true;
      addLog("التسجيل مفتوح", "الـ QR جاهز للاستقبال");
      break;
    case "close_registration":
      state.registrationOpen = false;
      addLog("التسجيل مغلق", "تم تثبيت قائمة المشاركين");
      break;
    case "start_stay_alive":
      state.currentExperience = "stay_alive";
      state.activeGame = "stay_alive";
      state.gameStatus = "live";
      state.stageMode = "alive";
      state.stayAliveRemaining = state.registered;
      state.stayAliveRound = 0;
      state.stayAliveWinner = null;
      addLog("باقي معنا؟ بدأت", "كل المشاركين داخل الجولة الأولى");
      break;
    case "pause":
      state.gameStatus = "paused";
      addLog("اللعبة متوقفة", "يمكن استئنافها من لوحة التحكم");
      break;
    case "return_lobby":
      state.currentExperience = "lobby";
      state.activeGame = null;
      state.gameStatus = "idle";
      state.stageMode = "lobby";
      state.wamdaSignal = "idle";
      addLog("عودة إلى الانتظار", "الهواتف جاهزة للفقرة التالية");
      break;
    case "open_wamda":
      state.currentExperience = "wamda";
      state.activeGame = "wamda";
      state.gameStatus = "live";
      state.stageMode = "wamda";
      state.wamdaSignal = "red";
      state.wamdaResponses = 0;
      state.wamdaFalseStarts = 0;
      state.wamdaFastestMs = null;
      state.wamdaWinner = null;
      addLog("وَمْضَة مفتوحة", "الجميع مؤهلون من جديد");
      break;
    case "arm_wamda":
      state.wamdaSignal = "red";
      state.gameStatus = "live";
      addLog("وَمْضَة مسلحة", "بانتظار الإشارة");
      break;
    case "cancel_arm":
      state.wamdaSignal = "idle";
      state.gameStatus = "paused";
      addLog("تم إلغاء التسليح", "لم تُحتسب أي استجابة");
      break;
    case "close_wamda":
      state.wamdaSignal = "closed";
      state.gameStatus = "selection";
      addLog("الجولة مغلقة", `${state.wamdaResponses} استجابة مسجلة`);
      break;
    case "select_result":
      state.gameStatus = "selection";
      state.wamdaFastestMs = state.wamdaFastestMs ?? 198;
      addLog("تم اختيار النتيجة", "النتيجة جاهزة للكشف");
      break;
    case "reveal_winner":
      state.gameStatus = "revealed";
      state.wamdaWinner = state.wamdaWinner ?? "سارة";
      addLog("تم كشف الفائز", "أسرع ومضة في أُنس");
      break;
    case "reset_game":
      state.currentExperience = "lobby";
      state.activeGame = null;
      state.gameStatus = "idle";
      state.stageMode = "lobby";
      state.stayAliveRemaining = state.registered;
      state.stayAliveRound = 0;
      state.stayAliveWinner = null;
      state.wamdaSignal = "idle";
      state.wamdaResponses = 0;
      state.wamdaFalseStarts = 0;
      state.wamdaFastestMs = null;
      state.wamdaWinner = null;
      addLog("تمت إعادة الضبط", "البيانات محفوظة والجولة جاهزة");
      break;
  }

  touch();
  res.json(ExecuteAdminActionResponse.parse(currentState()));
});

router.post("/games/stay-alive/round", (req, res) => {
  const parsed = ExecuteStayAliveRoundBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const target = Math.max(
    1,
    Math.min(state.stayAliveRemaining, parsed.data.targetSurvivors),
  );
  state.stayAliveRound += 1;
  state.stayAliveRemaining = target;
  state.gameStatus = target <= 3 ? "selection" : "live";
  if (target === 1) {
    state.stayAliveWinner = "محمد";
    state.gameStatus = "selection";
  }
  addLog(
    `الجولة ${String(state.stayAliveRound).padStart(2, "0")}`,
    `${target} مشارك باقي معنا`,
  );
  touch();
  res.json(ExecuteStayAliveRoundResponse.parse(currentState()));
});

router.post("/games/wamda/attempt", (req, res) => {
  const parsed = SubmitWamdaAttemptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.falseStart) {
    state.wamdaFalseStarts += 1;
  } else {
    state.wamdaResponses += 1;
    if (state.wamdaSignal === "green") {
      state.wamdaFastestMs = Math.min(
        state.wamdaFastestMs ?? parsed.data.reactionMs,
        parsed.data.reactionMs,
      );
    }
  }
  touch();
  res.json(SubmitWamdaAttemptResponse.parse(currentState()));
});

export default router;