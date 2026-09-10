import { type ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  getGetEventStateQueryKey,
  getGetEventSummaryQueryKey,
  getHealthCheckQueryKey,
  useExecuteAdminAction,
  useExecuteStayAliveRound,
  useGetEventState,
  useGetEventSummary,
  useHealthCheck,
  useRegisterParticipant,
  useSubmitWamdaAttempt,
} from '@workspace/api-client-react';
import type { AdminActionInputAction, EventState, Participant } from '@workspace/api-client-react';
import { ArrowLeft, Check, CircleHelp, Clock3, DoorOpen, LockKeyhole, Radio, RefreshCw, ShieldCheck, Signal, Sparkles, Users, Wifi } from 'lucide-react';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

const queryClient = new QueryClient();

const DEMO_STATE: EventState = {
  registrationOpen: true,
  currentExperience: 'lobby',
  activeGame: null,
  gameStatus: 'idle',
  stageMode: 'lobby',
  registered: 128,
  connected: 121,
  stayAliveRemaining: 128,
  stayAliveRound: 0,
  stayAliveWinner: null,
  wamdaReady: 0,
  wamdaResponses: 0,
  wamdaFalseStarts: 0,
  wamdaFastestMs: null,
  wamdaWinner: null,
  wamdaSignal: 'idle',
  updatedAt: new Date().toISOString(),
};

type StateWithDemo = { state: EventState; offline: boolean; loading: boolean; error: boolean };

function useLiveState(): StateWithDemo {
  const query = useGetEventState({
    query: { queryKey: getGetEventStateQueryKey(), refetchInterval: 4000 },
  });
  return { state: query.data ?? DEMO_STATE, offline: Boolean(query.error), loading: query.isLoading, error: Boolean(query.error) };
}

function Shell({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return (
    <div className="app-shell page-grid" dir="rtl">
      <header className={`mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 md:px-10 ${compact ? 'absolute left-0 right-0 top-0 z-10' : ''}`}>
        <Link href="/" className="flex items-center gap-3 text-inherit no-underline" data-testid="link-home">
          <div className="grid h-10 w-10 place-items-center rounded-full border border-[hsl(var(--primary)/.55)] text-sm text-[hsl(var(--primary))]">أ</div>
          <div>
            <div className="brand-word text-lg">أُنس</div>
            <div className="font-mono-ui text-[9px] uppercase tracking-[.2em] text-[hsl(var(--muted-foreground))]">live room</div>
          </div>
        </Link>
        <nav className="hidden items-center gap-7 text-xs text-[hsl(var(--muted-foreground))] md:flex">
          <Link href="/join" className="transition-colors hover:text-[hsl(var(--primary))]" data-testid="link-join">الانضمام</Link>
          <Link href="/play" className="transition-colors hover:text-[hsl(var(--primary))]" data-testid="link-play">غرفة الحضور</Link>
          <Link href="/admin" className="transition-colors hover:text-[hsl(var(--primary))]" data-testid="link-admin">غرفة التشغيل</Link>
        </nav>
        <div className="live-mark" data-testid="status-live">مساء الافتتاح · علوم</div>
      </header>
      {children}
    </div>
  );
}

function LoadingBlock({ label = 'نحضّر الغرفة' }: { label?: string }) {
  return <div className="flex min-h-[12rem] items-center justify-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.5)] text-sm text-[hsl(var(--muted-foreground))]" data-testid="loading-state"><span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-[hsl(var(--primary))]" />{label}</div>;
}

function StatePill({ children, tone = 'quiet' }: { children: ReactNode; tone?: 'quiet' | 'green' | 'red' | 'gold' }) {
  const tones = { quiet: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]', green: 'bg-[hsl(163_24%_42%/.18)] text-[hsl(153_48%_70%)]', red: 'bg-[hsl(var(--destructive)/.14)] text-[hsl(7_70%_72%)]', gold: 'bg-[hsl(var(--primary)/.14)] text-[hsl(var(--primary))]' };
  return <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] ${tones[tone]}`} data-testid="status-pill">{children}</span>;
}

function Home() {
  return (
    <Shell compact>
      <main className="mx-auto flex min-h-[100dvh] w-full max-w-7xl items-center px-5 pb-14 pt-28 md:px-10">
        <div className="grid w-full items-end gap-14 lg:grid-cols-[1.1fr_.9fr] lg:gap-24">
          <section className="fade-up max-w-3xl">
            <div className="live-mark mb-8">الليلة تُروى معاً</div>
            <h1 className="arabic-display max-w-2xl text-[clamp(3.8rem,10vw,9rem)] text-[hsl(var(--foreground))]">أُنس<span className="text-[hsl(var(--primary))]">.</span></h1>
            <p className="mt-7 max-w-xl text-lg leading-loose text-[hsl(var(--muted-foreground))] md:text-xl">غرفة حيّة لافتتاحية الأنشطة الطلابية في كلية العلوم. ادخل باسمك، واترك الباقي للّيلة.</p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href="/join" className="button-primary no-underline" data-testid="button-join-now">ادخل الغرفة <ArrowLeft size={16} /></Link>
              <Link href="/play" className="button-outline no-underline" data-testid="button-open-room">أنا مسجّل بالفعل</Link>
            </div>
            <div className="mt-16 flex items-center gap-8 border-t border-[hsl(var(--border))] pt-5 text-xs text-[hsl(var(--muted-foreground))]">
              <span><b className="font-mono-ui text-[hsl(var(--primary))]">16:9</b> شاشة المسرح</span>
              <span><b className="font-mono-ui text-[hsl(var(--primary))]">01</b> ليلة واحدة</span>
              <span><b className="font-mono-ui text-[hsl(var(--primary))]">∞</b> لحظات</span>
            </div>
          </section>
          <section className="fade-up-delay relative mx-auto w-full max-w-md">
            <div className="absolute -inset-8 rounded-[50%] border border-[hsl(var(--primary)/.12)]" />
            <div className="absolute -inset-16 rounded-[50%] border border-[hsl(var(--primary)/.07)]" />
            <div className="panel relative aspect-[4/5] overflow-hidden rounded-[1.4rem] p-7">
              <div className="absolute inset-0 opacity-50" style={{ background: 'linear-gradient(140deg, transparent 30%, rgba(151,76,38,.32) 30%, transparent 58%), radial-gradient(ellipse at 50% 10%, rgba(227,180,133,.2), transparent 35%)' }} />
              <div className="relative flex h-full flex-col justify-between">
                <div className="flex items-start justify-between text-[10px] text-[hsl(var(--muted-foreground))]"><span>الاثنين · ١٤ سبتمبر</span><span className="font-mono-ui">19:03</span></div>
                <div className="text-center">
                  <div className="mb-5 text-xs tracking-[.4em] text-[hsl(var(--primary))]">COLLEGE OF SCIENCE</div>
                  <div className="arabic-display text-[clamp(3rem,12vw,6rem)] text-[hsl(var(--foreground))]">أُنس</div>
                  <div className="mx-auto mt-5 h-px w-24 bg-[hsl(var(--primary)/.6)]" />
                  <p className="mt-5 text-sm text-[hsl(var(--muted-foreground))]">الأمسية التعريفية</p>
                </div>
                <div className="flex items-end justify-between text-xs text-[hsl(var(--muted-foreground))]"><span>قاعة المؤتمرات</span><span className="font-mono-ui text-[hsl(var(--primary))]">LIVE / 01</span></div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </Shell>
  );
}

function JoinPage() {
  const [form, setForm] = useState({ name: '', phone: '' });
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [demo, setDemo] = useState(false);
  const register = useRegisterParticipant();
  const { state, offline } = useLiveState();
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (form.name.trim().length < 2 || form.phone.trim().length < 6 || register.isPending) return;
    register.mutate({ data: { name: form.name.trim(), phone: form.phone.trim() } }, {
      onSuccess: (data) => { localStorage.setItem('anas-participant', JSON.stringify(data)); setParticipant(data); },
      onError: () => { const local = { id: `local-${Date.now()}`, name: form.name.trim(), token: `demo-${Date.now()}` }; localStorage.setItem('anas-participant', JSON.stringify(local)); setParticipant(local); setDemo(true); },
    });
  };
  return (
    <Shell>
      <main className="mx-auto grid min-h-[calc(100dvh-84px)] w-full max-w-6xl items-center gap-12 px-5 py-12 md:grid-cols-[.8fr_1.2fr] md:px-10">
        <section className="fade-up order-2 md:order-1">
          <div className="mb-7 inline-flex h-12 w-12 items-center justify-center rounded-full border border-[hsl(var(--primary)/.5)] text-[hsl(var(--primary))]"><Radio size={20} /></div>
          <p className="live-mark mb-5">تسجيل الحضور</p>
          <h1 className="arabic-display text-4xl leading-[1.35] md:text-6xl">خلّ اسمك<br /><span className="text-[hsl(var(--primary))]">بيننا.</span></h1>
          <p className="mt-7 max-w-sm leading-loose text-[hsl(var(--muted-foreground))]">التسجيل مرة واحدة فقط. بعد الدخول، ستبقى هذه الشاشة معك طوال الأمسية.</p>
          <div className="mt-9 flex flex-wrap gap-3"><StatePill tone={state.registrationOpen ? 'green' : 'red'}>{state.registrationOpen ? 'التسجيل مفتوح' : 'التسجيل مغلق'}</StatePill>{offline && <StatePill tone="gold">وضع العرض المحلي</StatePill>}</div>
        </section>
        <section className="panel fade-up-delay rounded-2xl p-6 md:p-10">
          {participant ? <SuccessCard participant={participant} demo={demo} /> : (
            <form onSubmit={submit} className="space-y-6" data-testid="form-register">
              <div className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-5"><div><div className="font-display text-xl">بياناتك</div><div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">لن تظهر للآخرين</div></div><span className="font-mono-ui text-xs text-[hsl(var(--primary))]">01 / 02</span></div>
              <label className="block"><span className="mb-2 block text-sm">الاسم</span><input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="كيف نناديك؟" autoComplete="name" data-testid="input-name" /></label>
              <label className="block"><span className="mb-2 block text-sm">رقم الجوال</span><input className="input-field text-left" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="05X XXX XXXX" autoComplete="tel" data-testid="input-phone" /></label>
              {register.error && !demo && <div className="rounded-lg border border-[hsl(var(--destructive)/.5)] bg-[hsl(var(--destructive)/.1)] p-3 text-sm text-[hsl(7_70%_72%)]" data-testid="error-register">تعذّر الاتصال الآن. سنحاول مرة أخرى عند الضغط.</div>}
              <button type="submit" className="button-primary w-full" disabled={!state.registrationOpen || register.isPending} data-testid="button-submit-registration">{register.isPending ? 'نفتح لك الباب…' : 'دخول الأمسية'} <ArrowLeft size={16} /></button>
              <div className="flex items-center gap-2 text-[11px] text-[hsl(var(--muted-foreground))]"><LockKeyhole size={13} /> رقمك للتسجيل فقط، ولا يُعرض على الشاشة.</div>
            </form>
          )}
        </section>
      </main>
    </Shell>
  );
}

function SuccessCard({ participant, demo }: { participant: Participant; demo: boolean }) {
  return <div className="py-8 text-center" data-testid="registration-success"><div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[hsl(var(--accent)/.2)] text-[hsl(153_48%_70%)]"><Check size={27} /></div><div className="mt-7 text-xs text-[hsl(var(--muted-foreground))]">أهلاً بك</div><h2 className="arabic-display mt-2 text-4xl text-[hsl(var(--primary))]">{participant.name}</h2><p className="mx-auto mt-5 max-w-sm leading-loose text-[hsl(var(--muted-foreground))]">تم تسجيل حضورك. احتفظ بهذه الصفحة؛ منها ستعرف متى يبدأ كل شيء.</p>{demo && <div className="mx-auto mt-5 max-w-xs rounded border border-[hsl(var(--primary)/.25)] p-2 text-[11px] text-[hsl(var(--primary))]">تم الحفظ محلياً إلى أن تعود الإشارة.</div>}<Link href="/play" className="button-primary mt-8 no-underline" data-testid="link-go-play">افتح غرفة الحضور <ArrowLeft size={16} /></Link></div>;
}

function ExperienceCopy({ state }: { state: EventState }) {
  if (state.currentExperience === 'stay_alive') return <><div className="live-mark mb-5">اللعبة الأولى</div><h1 className="arabic-display text-5xl md:text-7xl">باقي معنا؟</h1><p className="mt-5 leading-loose text-[hsl(var(--muted-foreground))]">لا تغلق الصفحة. الجولة القادمة ستظهر هنا.</p></>;
  if (state.currentExperience === 'wamda') return <><div className="live-mark mb-5">لحظة خاطفة</div><h1 className="arabic-display text-5xl md:text-7xl">وَمْضَة</h1><p className="mt-5 leading-loose text-[hsl(var(--muted-foreground))]">اضغط أخضر فقط عندما ترى الإشارة. الأحمر فخ.</p></>;
  if (state.currentExperience === 'intermission') return <><div className="live-mark mb-5">فاصل قصير</div><h1 className="arabic-display text-5xl md:text-7xl">خذ نفساً.</h1><p className="mt-5 leading-loose text-[hsl(var(--muted-foreground))]">نعود بعد قليل. ابقَ قريباً.</p></>;
  if (state.currentExperience === 'end') return <><div className="live-mark mb-5">نهاية الأمسية</div><h1 className="arabic-display text-5xl md:text-7xl">شكراً لأنك كنت هنا.</h1><p className="mt-5 leading-loose text-[hsl(var(--muted-foreground))]">بعض الليالي لا تنتهي عند خروجنا منها.</p></>;
  return <><div className="live-mark mb-5">أهلاً بك في الغرفة</div><h1 className="arabic-display text-5xl md:text-7xl">ننتظر<br /><span className="text-[hsl(var(--primary))]">الإشارة.</span></h1><p className="mt-5 leading-loose text-[hsl(var(--muted-foreground))]">اجلس في مكانك. ستبدأ الحكاية عندما تضيء الشاشة.</p></>;
}

function PlayPage() {
  const { state, offline, loading } = useLiveState();
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const attempt = useSubmitWamdaAttempt();
  const [attemptState, setAttemptState] = useState<'ready' | 'sent' | 'false'>('ready');
  useEffect(() => { const value = localStorage.getItem('anas-participant'); if (value) setParticipant(JSON.parse(value)); }, []);
  useEffect(() => { if (state.currentExperience === 'wamda' && state.wamdaSignal === 'green' && !startedAt) setStartedAt(performance.now()); }, [state.currentExperience, state.wamdaSignal, startedAt]);
  const clickWamda = () => {
    const falseStart = state.wamdaSignal !== 'green';
    const reactionMs = falseStart || !startedAt ? 0 : Math.round(performance.now() - startedAt);
    setAttemptState(falseStart ? 'false' : 'sent');
    attempt.mutate({ data: { participantToken: participant?.token ?? 'demo-token', sessionId: `session-${Date.now()}`, signalId: `signal-${Date.now()}`, reactionMs, falseStart } });
  };
  if (loading && !state) return <Shell><main className="mx-auto max-w-3xl px-5 py-32"><LoadingBlock /></main></Shell>;
  return <Shell><main className="mx-auto min-h-[calc(100dvh-82px)] w-full max-w-6xl px-5 py-10 md:px-10">
    <div className="mb-12 flex items-center justify-between"><div><div className="live-mark">غرفة الحضور</div><div className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">{participant ? `أهلاً ${participant.name}` : 'لم تسجل بعد'}</div></div><div className="flex items-center gap-3">{offline && <StatePill tone="gold">عرض محلي</StatePill>}<Link href="/join" className="text-xs text-[hsl(var(--muted-foreground))] underline underline-offset-4" data-testid="link-change-registration">تسجيل جديد</Link></div></div>
    {!participant && <div className="mb-8 flex items-center gap-3 rounded-xl border border-[hsl(var(--primary)/.3)] bg-[hsl(var(--primary)/.07)] p-4 text-sm"><CircleHelp size={16} className="text-[hsl(var(--primary))]" /><span>أدخل اسمك أولاً لتشارك في اللحظات التفاعلية.</span><Link href="/join" className="mr-auto text-[hsl(var(--primary))] underline" data-testid="link-register-prompt">التسجيل</Link></div>}
    <div className="grid gap-10 lg:grid-cols-[1fr_.72fr] lg:items-center">
      <section className="fade-up">
        <ExperienceCopy state={state} />
        {state.currentExperience === 'stay_alive' && <div className="mt-10 flex items-center gap-8"><div><div className="font-mono-ui text-5xl text-[hsl(var(--primary))]">{state.stayAliveRemaining}</div><div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">باقون</div></div><div className="h-12 w-px bg-[hsl(var(--border))]" /><div><div className="font-mono-ui text-5xl">{String(state.stayAliveRound ?? 0).padStart(2, '0')}</div><div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">الجولة</div></div></div>}
      </section>
      <section className="panel fade-up-delay rounded-2xl p-7 md:p-10">
        {state.currentExperience === 'wamda' ? <div className="text-center"><div className={`signal ${state.wamdaSignal === 'green' ? 'signal-green' : state.wamdaSignal === 'red' ? 'signal-red' : 'signal-idle'}`}><div><Signal className="mx-auto mb-4" size={27} /><div className="font-display text-2xl">{state.wamdaSignal === 'green' ? 'الآن' : state.wamdaSignal === 'red' ? 'لا تضغط' : 'انتظر'}</div><div className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">{attemptState === 'sent' ? 'وصلت استجابتك' : attemptState === 'false' ? 'إشارة مبكرة' : 'أمسك اللحظة'}</div></div></div><button className="button-primary mt-8 w-full" onClick={clickWamda} disabled={!participant || state.wamdaSignal === 'closed' || attempt.isPending || attemptState === 'sent'} data-testid="button-wamda-reaction">استجب للإشارة</button></div>
          : <div><div className="mb-5 flex items-center justify-between border-b border-[hsl(var(--border))] pb-4 text-xs text-[hsl(var(--muted-foreground))]"><span>حالة الغرفة</span><StatePill tone={state.gameStatus === 'live' ? 'green' : 'quiet'}>{state.gameStatus === 'live' ? 'مباشر الآن' : state.gameStatus === 'complete' ? 'اكتملت' : 'على الاستعداد'}</StatePill></div><div className="space-y-5 text-sm"><div className="flex items-center justify-between"><span className="text-[hsl(var(--muted-foreground))]">الحضور المتصل</span><span className="font-mono-ui text-[hsl(var(--primary))]">{state.connected}</span></div><div className="flex items-center justify-between"><span className="text-[hsl(var(--muted-foreground))]">آخر تحديث</span><span className="font-mono-ui text-xs">{new Date(state.updatedAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span></div></div><div className="mt-10 border-t border-[hsl(var(--border))] pt-5 text-xs leading-loose text-[hsl(var(--muted-foreground))]">اترك الصوت مفتوحاً. كل التغييرات تصل إلى هذه الغرفة تلقائياً.</div></div>}
      </section>
    </div>
  </main></Shell>;
}

function StageChrome({ children, label }: { children: ReactNode; label: string }) {
  return <div className="stage-screen" dir="rtl"><div className="stage-inner"><div className="flex items-center justify-between"><div className="stage-kicker">أُنس · كلية العلوم</div><div className="stage-kicker font-mono-ui">LIVE / {label}</div></div>{children}<div><div className="stage-rule mb-4" /><div className="flex justify-between text-[clamp(.5rem,1vw,.75rem)] text-[rgba(245,227,201,.46)]"><span>الأمسية التعريفية للأنشطة الطلابية</span><span>جامعة الملك سعود</span></div></div></div></div>;
}

function StagePage({ mode }: { mode: 'alive' | 'wamda' }) {
  const { state } = useLiveState();
  if (mode === 'alive') return <StageChrome label="01"><div className="flex flex-1 flex-col items-center justify-center text-center"><div className="stage-kicker mb-7">الجولة {String(state.stayAliveRound ?? 0).padStart(2, '0')}</div><div className="stage-title">باقي معنا؟</div><div className="stage-copy mt-6">{state.gameStatus === 'live' ? 'ابقَ في مكانك. لا تغادر.' : state.gameStatus === 'complete' ? `الفائز: ${state.stayAliveWinner ?? 'سيُعلن قريباً'}` : 'سنبدأ بعد لحظات'}</div><div className="mt-12 flex items-center gap-12"><div><div className="font-mono-ui text-5xl text-[#dfb78c]">{state.stayAliveRemaining}</div><div className="mt-1 text-xs text-[rgba(245,227,201,.5)]">باقون</div></div><div className="h-12 w-px bg-[rgba(245,227,201,.2)]" /><div><div className="font-mono-ui text-5xl text-[#dfb78c]">{state.registered}</div><div className="mt-1 text-xs text-[rgba(245,227,201,.5)]">دخلوا الغرفة</div></div></div></div></StageChrome>;
  const signal = state.wamdaSignal ?? 'idle';
  return <StageChrome label="02"><div className="flex flex-1 flex-col items-center justify-center text-center"><div className="stage-kicker mb-7">ردّ الفعل الأسرع</div><div className="stage-title">وَمْضَة</div><div className="stage-copy mt-5">{signal === 'green' ? 'الآن.' : signal === 'red' ? 'لا تضغط.' : 'انتظر الإشارة.'}</div><div className={`signal mt-10 ${signal === 'green' ? 'signal-green' : signal === 'red' ? 'signal-red' : 'signal-idle'}`}><div className="font-display text-3xl">{signal === 'green' ? 'أخضر' : signal === 'red' ? 'أحمر' : '—'}</div></div><div className="mt-8 font-mono-ui text-sm text-[rgba(245,227,201,.6)]">{state.wamdaResponses ?? 0} استجابة · {state.wamdaFalseStarts ?? 0} إشارة مبكرة</div></div></StageChrome>;
}

function actionState(action: AdminActionInputAction, current: EventState): EventState {
  const next = { ...current, updatedAt: new Date().toISOString() };
  if (action === 'open_registration') next.registrationOpen = true;
  if (action === 'close_registration') next.registrationOpen = false;
  if (action === 'start_stay_alive') { next.currentExperience = 'stay_alive'; next.activeGame = 'stay_alive'; next.gameStatus = 'live'; next.stageMode = 'alive'; next.stayAliveRound = 1; }
  if (action === 'pause') next.gameStatus = 'paused';
  if (action === 'return_lobby') { next.currentExperience = 'lobby'; next.activeGame = null; next.gameStatus = 'idle'; next.stageMode = 'lobby'; }
  if (action === 'open_wamda') { next.currentExperience = 'wamda'; next.activeGame = 'wamda'; next.gameStatus = 'selection'; next.stageMode = 'wamda'; next.wamdaSignal = 'idle'; }
  if (action === 'arm_wamda') { next.gameStatus = 'live'; next.wamdaSignal = 'red'; }
  if (action === 'cancel_arm') { next.gameStatus = 'selection'; next.wamdaSignal = 'idle'; }
  if (action === 'close_wamda') { next.gameStatus = 'complete'; next.wamdaSignal = 'closed'; }
  if (action === 'select_result') next.gameStatus = 'selection';
  if (action === 'reveal_winner') next.gameStatus = 'revealed';
  if (action === 'reset_game') { next.gameStatus = 'idle'; next.activeGame = null; next.currentExperience = 'lobby'; next.stageMode = 'lobby'; next.wamdaSignal = 'idle'; }
  return next;
}

function AdminLogin() {
  const [, setLocation] = useLocation();
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (code.trim().length >= 4) { localStorage.setItem('anas-admin', 'true'); setLocation('/admin'); } else setError(true); };
  return <Shell><main className="mx-auto flex min-h-[calc(100dvh-84px)] max-w-md items-center px-5 py-12"><form onSubmit={submit} className="panel w-full rounded-2xl p-7 md:p-10" data-testid="form-admin-login"><div className="mb-8 flex h-12 w-12 items-center justify-center rounded-full border border-[hsl(var(--primary)/.5)] text-[hsl(var(--primary))]"><ShieldCheck size={22} /></div><div className="live-mark mb-5">مساحة الفريق</div><h1 className="arabic-display text-4xl">غرفة التشغيل</h1><p className="mt-4 text-sm leading-loose text-[hsl(var(--muted-foreground))]">الدخول مخصص لمن يدير الإشارة على المسرح.</p><label className="mt-8 block text-sm"><span className="mb-2 block">رمز الدخول</span><input className="input-field text-left" dir="ltr" autoComplete="current-password" value={code} onChange={(e) => setCode(e.target.value)} placeholder="••••" type="password" data-testid="input-admin-code" /></label>{error && <p className="mt-3 text-xs text-[hsl(7_70%_72%)]" data-testid="error-admin-login">أدخل الرمز للمتابعة.</p>}<button className="button-primary mt-6 w-full" type="submit" data-testid="button-admin-login">دخول آمن <ArrowLeft size={16} /></button></form></main></Shell>;
}

function AdminPage() {
  const [, setLocation] = useLocation();
  const [authorized, setAuthorized] = useState(false);
  useEffect(() => setAuthorized(localStorage.getItem('anas-admin') === 'true'), []);
  if (!authorized) return <AdminLogin />;
  return <AdminDashboard onLogout={() => { localStorage.removeItem('anas-admin'); setLocation('/admin/login'); }} />;
}

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const stateQuery = useGetEventState({ query: { queryKey: getGetEventStateQueryKey(), refetchInterval: 3500 } });
  const summaryQuery = useGetEventSummary({ query: { queryKey: getGetEventSummaryQueryKey(), refetchInterval: 5000 } });
  const healthQuery = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 10000 } });
  const [local, setLocal] = useState<EventState | null>(null);
  const state = local ?? stateQuery.data ?? DEMO_STATE;
  const action = useExecuteAdminAction();
  const round = useExecuteStayAliveRound();
  const [target, setTarget] = useState('64');
  const offline = Boolean(stateQuery.error || summaryQuery.error);
  const fire = (name: AdminActionInputAction) => action.mutate({ data: { action: name } }, { onSuccess: setLocal, onError: () => setLocal(actionState(name, state)) });
  const doRound = () => round.mutate({ data: { targetSurvivors: Number(target) || 1 } }, { onSuccess: setLocal, onError: () => setLocal({ ...state, stayAliveRemaining: Number(target) || 1, stayAliveRound: (state.stayAliveRound ?? 0) + 1, updatedAt: new Date().toISOString() }) });
  const logs = summaryQuery.data?.eventLog ?? [{ id: '1', label: 'بدء العرض المحلي', detail: 'بانتظار اتصال غرفة التشغيل', time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) }];
  return <div className="app-shell" dir="rtl"><header className="border-b border-[hsl(var(--border))] bg-[hsl(var(--sidebar)/.84)]"><div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4 md:px-8"><Link href="/" className="flex items-center gap-3 no-underline" data-testid="link-admin-home"><div className="grid h-9 w-9 place-items-center rounded-full border border-[hsl(var(--primary)/.55)] text-sm text-[hsl(var(--primary))]">أ</div><div><div className="brand-word">غرفة التشغيل</div><div className="font-mono-ui text-[9px] tracking-[.17em] text-[hsl(var(--muted-foreground))]">ANAS LIVE / CONTROL</div></div></Link><div className="flex items-center gap-4"><StatePill tone={offline ? 'gold' : 'green'}>{offline ? 'عرض محلي' : 'متصل'}</StatePill><button onClick={onLogout} className="text-xs text-[hsl(var(--muted-foreground))] underline underline-offset-4" data-testid="button-admin-logout">خروج</button></div></div></header><main className="mx-auto max-w-[1500px] px-5 py-7 md:px-8"><div className="mb-8 flex flex-wrap items-end justify-between gap-5"><div><div className="live-mark mb-3">المشهد الآن</div><h1 className="arabic-display text-4xl md:text-5xl">مساء الافتتاح</h1></div><div className="font-mono-ui text-xs text-[hsl(var(--muted-foreground))]">UPDATED {new Date(state.updatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div></div><section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric icon={<Users size={17} />} label="مسجّل" value={state.registered} detail={`${state.connected} متصل الآن`} /><Metric icon={<Radio size={17} />} label="التجربة الحالية" value={state.currentExperience === 'lobby' ? 'الردهة' : state.currentExperience === 'stay_alive' ? 'باقي معنا؟' : state.currentExperience === 'wamda' ? 'وَمْضَة' : state.currentExperience} detail={state.gameStatus} /><Metric icon={<Sparkles size={17} />} label="باقي معنا؟" value={state.stayAliveRemaining} detail={`الجولة ${state.stayAliveRound ?? 0}`} /><Metric icon={<Signal size={17} />} label="وَمْضَة" value={state.wamdaResponses ?? 0} detail={`${state.wamdaFalseStarts ?? 0} إشارات مبكرة`} /></section><div className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_.8fr]"><section className="panel rounded-xl p-5 md:p-7"><div className="mb-6 flex items-center justify-between"><div><div className="font-display text-xl">لوحة الإشارة</div><div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">كل ضغط هنا يصل إلى المسرح فوراً</div></div><StatePill tone={state.gameStatus === 'live' ? 'green' : 'quiet'}>{state.stageMode}</StatePill></div><div className="grid gap-3 sm:grid-cols-2"><ControlButton label="فتح التسجيل" detail="استقبال حضور جديد" onClick={() => fire('open_registration')} active={state.registrationOpen} test="button-open-registration" /><ControlButton label="إغلاق التسجيل" detail="إيقاف الدخول" onClick={() => fire('close_registration')} test="button-close-registration" /><ControlButton label="بدء باقي معنا؟" detail="عرض الجولة الأولى" onClick={() => fire('start_stay_alive')} active={state.activeGame === 'stay_alive'} test="button-start-stay-alive" /><ControlButton label="إيقاف مؤقت" detail="تجميد التجربة" onClick={() => fire('pause')} test="button-pause-game" /><ControlButton label="عودة إلى الردهة" detail="إخفاء التجربة" onClick={() => fire('return_lobby')} test="button-return-lobby" /><ControlButton label="فتح وَمْضَة" detail="تحضير شاشة الإشارة" onClick={() => fire('open_wamda')} active={state.activeGame === 'wamda'} test="button-open-wamda" /></div></section><section className="panel rounded-xl p-5 md:p-7"><div className="mb-6 flex items-center justify-between"><div><div className="font-display text-xl">باقي معنا؟</div><div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">اختصر الدائرة إلى عدد محدد</div></div><StatePill tone="gold">الجولة {state.stayAliveRound ?? 0}</StatePill></div><div className="flex gap-3"><input className="input-field text-left" dir="ltr" type="number" min="1" value={target} onChange={(e) => setTarget(e.target.value)} data-testid="input-target-survivors" /><button className="button-primary whitespace-nowrap" onClick={doRound} disabled={round.isPending} data-testid="button-execute-round">تنفيذ الجولة</button></div><div className="mt-8 grid grid-cols-2 gap-3"><StatTile label="الباقون" value={state.stayAliveRemaining} /><StatTile label="الفائز" value={state.stayAliveWinner ?? '—'} /></div></section><section className="panel rounded-xl p-5 md:p-7"><div className="mb-6 flex items-center justify-between"><div><div className="font-display text-xl">وَمْضَة</div><div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">إدارة الإشارة والنتيجة</div></div><span className={`h-3 w-3 rounded-full ${state.wamdaSignal === 'green' ? 'bg-[hsl(153_48%_70%)]' : state.wamdaSignal === 'red' ? 'bg-[hsl(7_70%_72%)]' : 'bg-[hsl(var(--muted-foreground))]'}`} /></div><div className="grid grid-cols-2 gap-3"><ControlButton label="تسليح الإشارة" detail="بدء العد الخاطف" onClick={() => fire('arm_wamda')} active={state.wamdaSignal === 'red'} test="button-arm-wamda" /><ControlButton label="إلغاء التسليح" detail="العودة إلى الانتظار" onClick={() => fire('cancel_arm')} test="button-cancel-wamda" /><ControlButton label="اختيار النتيجة" detail="تثبيت الأسرع" onClick={() => fire('select_result')} test="button-select-result" /><ControlButton label="كشف الفائز" detail="إظهار الاسم" onClick={() => fire('reveal_winner')} test="button-reveal-winner" /><ControlButton label="إغلاق وَمْضَة" detail="إنهاء اللعبة" onClick={() => fire('close_wamda')} test="button-close-wamda" /></div><div className="mt-5 flex items-center justify-between border-t border-[hsl(var(--border))] pt-4 text-xs"><span className="text-[hsl(var(--muted-foreground))]">الأسرع</span><span className="font-mono-ui text-[hsl(var(--primary))]">{state.wamdaFastestMs ? `${state.wamdaFastestMs} ms` : '—'}</span></div></section><section className="panel rounded-xl p-5 md:p-7"><div className="mb-5 flex items-center justify-between"><div className="font-display text-xl">سجل الأمسية</div><Clock3 size={17} className="text-[hsl(var(--muted-foreground))]" /></div><div className="space-y-4">{logs.slice(0, 6).map((log) => <div key={log.id} className="flex gap-3 border-b border-[hsl(var(--border)/.6)] pb-3 last:border-0"><div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--primary))]" /><div className="min-w-0"><div className="text-sm">{log.label}</div><div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{log.detail}</div></div><span className="mr-auto shrink-0 font-mono-ui text-[10px] text-[hsl(var(--muted-foreground))]">{log.time}</span></div>)}</div></section></div><div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-[hsl(var(--border))] pt-5 text-xs text-[hsl(var(--muted-foreground))]"><div className="flex items-center gap-5"><span className="flex items-center gap-2"><Wifi size={14} className="text-[hsl(153_48%_70%)]" /> API {healthQuery.data?.status ?? 'local'}</span><span className="flex items-center gap-2"><DoorOpen size={14} /> المسرح /{state.stageMode}</span></div><button className="button-outline min-h-8 px-3 py-1 text-xs" onClick={() => { stateQuery.refetch(); summaryQuery.refetch(); healthQuery.refetch(); }} data-testid="button-refresh-admin"><RefreshCw size={13} /> تحديث</button></div></main></div>;
}

function Metric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string | number; detail: string }) { return <div className="panel rounded-xl p-5"><div className="flex items-center justify-between text-[hsl(var(--muted-foreground))]"><span className="text-xs">{label}</span><span className="text-[hsl(var(--primary))]">{icon}</span></div><div className="mt-4 font-mono-ui text-2xl text-[hsl(var(--foreground))]">{value}</div><div className="mt-2 text-[11px] text-[hsl(var(--muted-foreground))]">{detail}</div></div>; }
function StatTile({ label, value }: { label: string; value: string | number }) { return <div className="rounded-lg bg-[hsl(var(--muted)/.7)] p-4"><div className="text-xs text-[hsl(var(--muted-foreground))]">{label}</div><div className="mt-2 font-mono-ui text-xl">{value}</div></div>; }
function ControlButton({ label, detail, onClick, active = false, test }: { label: string; detail: string; onClick: () => void; active?: boolean; test: string }) { return <button onClick={onClick} className={`rounded-lg border p-4 text-right transition-transform hover:-translate-y-0.5 ${active ? 'border-[hsl(var(--primary)/.7)] bg-[hsl(var(--primary)/.1)]' : 'border-[hsl(var(--border))] bg-[hsl(var(--muted)/.4)]'}`} data-testid={test}><div className="flex items-center justify-between gap-2 text-sm"><span>{label}</span>{active && <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]" />}</div><div className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">{detail}</div></button>; }

function NotFound() {
  return <Shell><main className="mx-auto flex min-h-[calc(100dvh-84px)] max-w-xl flex-col items-center justify-center px-5 text-center"><div className="font-mono-ui text-7xl text-[hsl(var(--primary))]">404</div><h1 className="arabic-display mt-6 text-4xl">هذه الصفحة خارج الغرفة</h1><p className="mt-4 text-[hsl(var(--muted-foreground))]">ربما انتهت اللحظة، أو كُتب العنوان بشكل مختلف.</p><Link href="/" className="button-outline mt-8 no-underline" data-testid="link-notfound-home">العودة إلى أُنس <ArrowLeft size={16} /></Link></main></Shell>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Switch><Route path="/" component={Home} /><Route path="/join" component={JoinPage} /><Route path="/play" component={PlayPage} /><Route path="/admin/login" component={AdminLogin} /><Route path="/admin" component={AdminPage} /><Route path="/stage/alive"><StagePage mode="alive" /></Route><Route path="/stage/wamda"><StagePage mode="wamda" /></Route><Route component={NotFound} /></Switch></ErrorBoundary>;
}

export default function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}