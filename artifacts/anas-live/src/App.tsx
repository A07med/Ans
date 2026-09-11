import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, LogOut, Radio, RefreshCw, ShieldCheck, Signal, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { useAnimatedCount } from '@/hooks/use-animated-count';
import { backend, APP_MODE } from '@/lib/backend';
import { canClearRegistrations, CLEAR_REGISTRATIONS_PHRASE, participantTransitionCues, RESET_GAMES_CONFIRMATION, soundControlState, stayAlivePhase, stayAliveQuickTargets, stayAliveStartDisabledReason, wamdaResultCopy } from '@/lib/event-polish';
import { validSurvivorTarget } from '@/lib/game-rules';
import type { AdminAction, AdminIdentity, AdminLog, LiveState, ParticipantView, WamdaResult } from '@/lib/live-types';
import { registrationErrorMessage } from '@/lib/registration-errors';
import { soundEngine } from '@/lib/sound';

const PARTICIPANT_TOKEN_KEY = 'anas-participant-token-v1';

function BrandMark({ className = '' }: { className?: string }) {
  return <img className={`brand-mark ${className}`} src="/anas-wordmark.png" width="515" height="255" alt="أُنس" draggable={false} />;
}

function Atmosphere({ children, stage = false }: { children: ReactNode; stage?: boolean }) {
  return <div className={stage ? 'stage-world' : 'anas-world'} dir="rtl"><img className="carpet-backdrop" src="/anas-carpet-clean-v2.jpg" alt="" aria-hidden="true" />{children}</div>;
}

function useLiveState() {
  const [state, setState] = useState<LiveState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [realtime, setRealtime] = useState(false);
  const refresh = useCallback(async () => {
    try { setState(await backend.getState()); setError(false); } catch { setError(true); } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const subscription = backend.subscribe(() => void refresh(), setRealtime);
    const poll = window.setInterval(() => void refresh(), 15_000);
    return () => { subscription.unsubscribe(); window.clearInterval(poll); };
  }, [refresh]);
  return { state, loading, error, realtime, refresh };
}

function BackendUnavailable() {
  return <div className="glass-card mx-auto max-w-md p-8 text-center"><WifiOff className="mx-auto text-[var(--anas-red)]" size={30} /><h1 className="display-title mt-5 text-3xl">الإشارة غير متاحة</h1><p className="mt-4 text-sm leading-8 text-[var(--anas-muted)]">وضع Supabase مفعّل، لكن خدمة الحدث لا تستجيب. لم نضع أي بيانات تجريبية مكان الحقيقة.</p></div>;
}

function Loading() { return <div className="grid min-h-[60dvh] place-items-center"><span className="warm-pulse text-sm text-[var(--anas-sand)]">نستعيد اللحظة…</span></div>; }
function Pill({ children, tone = 'quiet' }: { children: ReactNode; tone?: 'quiet' | 'good' | 'warn' | 'bad' }) { return <span className={`pill pill-${tone}`}>{children}</span>; }

function SoundControl({ stage = false, onEnabled }: { stage?: boolean; onEnabled?: () => void }) {
  const [, redraw] = useState(0);
  useEffect(() => soundEngine.subscribe(() => redraw((value) => value + 1)), []);
  const unlock = async () => { await soundEngine.unlock(); onEnabled?.(); };
  const controlState = soundControlState(soundEngine.unlocked, soundEngine.isMuted);
  if (controlState === 'enable') return <button className={`sound-control ${stage ? 'stage-sound-control' : ''}`} onClick={() => void unlock()}><Volume2 size={15} />{stage ? 'تفعيل صوت العرض' : soundEngine.preferred ? 'إعادة تفعيل الصوت 🔊' : 'تفعيل الصوت 🔊'}</button>;
  return <button className={`sound-control ${stage ? 'stage-sound-control' : ''}`} aria-pressed={soundEngine.isMuted} onClick={() => soundEngine.setMuted(!soundEngine.isMuted)}>{soundEngine.isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}{soundEngine.isMuted ? 'تشغيل الصوت' : 'كتم الصوت'}</button>;
}

function PublicHome() {
  const [, navigate] = useLocation();
  useEffect(() => navigate('/join', { replace: true }), [navigate]);
  return null;
}

function JoinPage() {
  const { state, loading, error } = useLiveState();
  const [, navigate] = useLocation();
  const [form, setForm] = useState({ name: '', phone: '' });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionCheckFailed, setSessionCheckFailed] = useState(false);
  useEffect(() => {
    const token = localStorage.getItem(PARTICIPANT_TOKEN_KEY);
    if (!token) { setCheckingSession(false); return; }
    void backend.validateParticipant(token)
      .then((participant) => { if (participant) navigate('/play', { replace: true }); else { localStorage.removeItem(PARTICIPANT_TOKEN_KEY); setCheckingSession(false); } })
      .catch(() => { setSessionCheckFailed(true); setCheckingSession(false); });
  }, [navigate]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try { const session = await backend.register(form.name, form.phone); localStorage.setItem(PARTICIPANT_TOKEN_KEY, session.token); navigate('/play', { replace: true }); }
    catch (cause) { setMessage(registrationErrorMessage(cause)); }
    finally { setBusy(false); }
  };
  if (loading || checkingSession) return <Atmosphere><Loading /></Atmosphere>;
  if (sessionCheckFailed || (error && !state)) return <Atmosphere><main className="grid min-h-screen place-items-center p-6"><BackendUnavailable /></main></Atmosphere>;
  return <Atmosphere><main className="public-page"><section className="join-card fade-in">
    <BrandMark className="mx-auto w-56 sm:w-64" />
    <p className="eyebrow mt-2">الأمسية الافتتاحية</p><p className="mt-2 text-center text-xs text-[var(--anas-muted)]">جماعة الأنشطة الطلابية — كلية العلوم</p>
    <h1 className="display-title mt-8 text-center text-4xl sm:text-5xl">أهلًا بك في أُنس</h1>
    <p className="mx-auto mt-4 max-w-sm text-center text-sm leading-8 text-[var(--anas-muted)]">سجّل مرة واحدة، وخلك قريب. هذه الصفحة بترافقك طوال الأمسية.</p>
    {state?.registrationOpen ? <form className="mt-8 space-y-5" onSubmit={submit}>
      <label className="field-label">الاسم<input className="field" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoComplete="name" placeholder="كيف نناديك؟" required /></label>
      <label className="field-label">رقم الهاتف<input className="field text-left" dir="ltr" inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} autoComplete="tel" placeholder="9XXXXXXX" required /></label>
      {message && <p className="error-note" role="alert">{message}</p>}
      <button className="primary-button w-full" disabled={busy}>{busy ? 'لحظة…' : 'دخول أُنس'}</button>
      <p className="text-center text-[11px] leading-6 text-[var(--anas-muted)]">رقمك للتسجيل والتحقق فقط، ولن يظهر للجمهور أو على المسرح.</p>
    </form> : <div className="closed-note mt-8"><Radio className="mx-auto mb-4" /><strong>اكتمل التسجيل لهذه الفقرة</strong><span>إذا سجلت سابقًا، افتح نفس المتصفح للعودة تلقائيًا.</span></div>}
  </section></main></Atmosphere>;
}

function stayAliveCopy(status: ParticipantView['stayAliveStatus'], revealed: boolean) {
  if (status === 'winner' && revealed) return { title: 'أنت الفائز 🎉', copy: 'باقي معنا حتى النهاية' };
  if (status === 'winner' || status === 'finalist') return { title: 'أنت من آخر 3 🔥', copy: 'لا تقفل الصفحة' };
  if (status === 'eliminated') return { title: 'انقطعت إشارتك', copy: 'خرجت من هذا السحب\nنشوفك في وَمْضَة 👀' };
  return { title: 'باقي معنا 🟢', copy: 'استعد للجولة القادمة' };
}

function PlayPage() {
  const { state, loading, error, realtime } = useLiveState();
  const [, navigate] = useLocation();
  const [participant, setParticipant] = useState<ParticipantView | null>(null);
  const [checking, setChecking] = useState(true);
  const [tapBusy, setTapBusy] = useState(false);
  const greenStart = useRef<{ signal: string; at: number } | null>(null);
  const previousState = useRef<LiveState | null>(null);
  const previousParticipant = useRef<ParticipantView | null>(null);
  const rehydrate = useCallback(async () => {
    const token = localStorage.getItem(PARTICIPANT_TOKEN_KEY);
    if (!token) { navigate('/join', { replace: true }); return; }
    try {
      const view = await backend.validateParticipant(token);
      if (!view) { localStorage.removeItem(PARTICIPANT_TOKEN_KEY); navigate('/join', { replace: true }); return; }
      setParticipant(view);
    } catch { /* Keep the last validated view during a transient outage. */ }
    finally { setChecking(false); }
  }, [navigate]);
  useEffect(() => { void rehydrate(); }, [rehydrate, state?.updatedAt]);
  useEffect(() => {
    if (!state || !participant) return;
    if (state.wamdaSignal === 'green' && state.activeSignalId && greenStart.current?.signal !== state.activeSignalId) {
      greenStart.current = { signal: state.activeSignalId, at: performance.now() };
      soundEngine.play('wamda-start');
      navigator.vibrate?.(35);
    }
    for (const cue of participantTransitionCues(previousState.current, state, previousParticipant.current, participant)) if (cue !== 'wamda-start') soundEngine.play(cue);
    previousState.current = state;
    previousParticipant.current = participant;
  }, [state, participant]);
  const tap = async () => {
    if (!state?.activeGameSessionId || !state.activeSignalId || !participant || participant.wamdaAttempt !== 'none' || tapBusy) return;
    const token = localStorage.getItem(PARTICIPANT_TOKEN_KEY);
    if (!token) return;
    const falseStart = state.wamdaSignal !== 'green';
    const reaction = falseStart || !greenStart.current ? 0 : Math.max(1, Math.round(performance.now() - greenStart.current.at));
    setTapBusy(true);
    try { setParticipant(await backend.submitWamda(token, state.activeGameSessionId, state.activeSignalId, reaction, falseStart)); }
    catch { await rehydrate(); }
    finally { setTapBusy(false); }
  };
  if (loading || checking) return <Atmosphere><Loading /></Atmosphere>;
  if (error && !state) return <Atmosphere><main className="grid min-h-screen place-items-center p-6"><BackendUnavailable /></main></Atmosphere>;
  if (!state || !participant) return null;
  const stay = stayAliveCopy(participant.stayAliveStatus, state.gameStatus === 'revealed');
  const wamdaResult = wamdaResultCopy(participant);
  return <Atmosphere><main className={`play-page experience-${state.currentExperience}`}>
    <header className="play-header"><BrandMark className="w-32" /><div className="play-tools"><SoundControl /><span className="connection-dot">{realtime ? <Wifi size={13} /> : <WifiOff size={13} />} {realtime ? 'متصل' : 'نستعيد الاتصال'}</span></div></header>
    <section className="experience-card fade-in">
      {state.currentExperience === 'lobby' && <div className="text-center"><Check className="mx-auto text-[var(--anas-green)]" size={34} /><h1 className="display-title mt-6 text-4xl">تم تسجيلك ✓</h1><p className="mt-5 whitespace-pre-line leading-9 text-[var(--anas-muted)]">خلك قريب…{`\n`}يمكن نحتاجك بعد شوي 👀</p></div>}
      {state.currentExperience === 'intermission' && <div className="text-center"><p className="eyebrow">فاصل قصير</p><h1 className="display-title mt-6 text-5xl">خذ نفسًا</h1><p className="mt-5 text-[var(--anas-muted)]">نرجع بعد شوي. خلك قريب.</p></div>}
      {state.currentExperience === 'end' && <div className="text-center"><BrandMark className="mx-auto w-60" /><h1 className="display-title mt-6 text-4xl">شكرًا لأنك كنت معنا</h1></div>}
      {state.currentExperience === 'stay_alive' && <div className={`text-center stay-${participant.stayAliveStatus ?? 'alive'}`}><p className="eyebrow">باقي معنا؟ · الجولة {state.stayAliveRound}</p><div className="signal-orbit mx-auto mt-8"><Signal size={42} /></div><h1 className="display-title mt-8 text-5xl">{stay.title}</h1><p className="mt-5 whitespace-pre-line leading-9 text-[var(--anas-muted)]">{stay.copy}</p></div>}
      {state.currentExperience === 'wamda' && <div className="text-center"><p className="eyebrow">وَمْضَة</p><h1 className="display-title mt-5 text-4xl">جهّز إصبعك</h1>{wamdaResult ? <div className={`result-message ${wamdaResult.kind === 'false-start' ? 'bad' : 'good'} result-${wamdaResult.kind}`}><strong>{wamdaResult.title}</strong><span className={wamdaResult.kind === 'pending' || wamdaResult.kind === 'winner' ? 'latin-number' : ''}>{wamdaResult.primary}</span>{wamdaResult.secondary && <small className={wamdaResult.kind === 'winner' ? 'latin-number' : ''}>{wamdaResult.secondary}</small>}</div> : <button aria-label={state.wamdaSignal === 'green' ? 'اضغط الآن' : 'انتظر'} className={`reaction-lamp lamp-${state.wamdaSignal}`} onPointerDown={() => void tap()} disabled={tapBusy || state.wamdaSignal === 'closed'}><span>{state.wamdaSignal === 'green' ? 'اضغط!' : state.wamdaSignal === 'closed' ? 'أُغلقت الجولة' : 'انتظر...'}</span></button>}</div>}
    </section><p className="participant-name">أهلًا {participant.name}</p>
  </main></Atmosphere>;
}

function StageFrame({ children, code, onSoundEnabled }: { children: ReactNode; code: string; onSoundEnabled?: () => void }) {
  return <Atmosphere stage><main className="stage-frame"><header><BrandMark className="w-[clamp(9rem,16vw,18rem)]" /><div className="stage-tools"><SoundControl stage onEnabled={onSoundEnabled} /><span className="stage-meta">LIVE / {code}</span></div></header>{children}<footer><span>الأمسية الافتتاحية — جماعة الأنشطة الطلابية</span><span>كلية العلوم</span></footer></main></Atmosphere>;
}

function StagePage({ game }: { game: 'alive' | 'wamda' }) {
  const { state, loading } = useLiveState();
  const previousSignal = useRef<LiveState['wamdaSignal'] | null>(null);
  const previousGameStatus = useRef<LiveState['gameStatus'] | null>(null);
  const animatedCount = useAnimatedCount(state?.stayAliveRemaining ?? 0, { onStart: () => soundEngine.play('count-start'), onTick: () => soundEngine.play('count-tick'), onLand: () => soundEngine.play('count-land') });
  useEffect(() => {
    if (!state) return;
    if (game === 'wamda') {
      if (state.wamdaSignal === 'red' && previousSignal.current !== 'red') soundEngine.startTension();
      if (state.wamdaSignal !== 'red') soundEngine.stopTension();
    }
    if (previousGameStatus.current && previousGameStatus.current !== 'revealed' && state.gameStatus === 'revealed') soundEngine.play('winner');
    previousSignal.current = state.wamdaSignal;
    previousGameStatus.current = state.gameStatus;
  }, [game, state?.gameStatus, state?.wamdaSignal]);
  useEffect(() => () => soundEngine.stopTension(), []);
  if (loading) return <Atmosphere stage><Loading /></Atmosphere>;
  if (!state) return <Atmosphere stage><BackendUnavailable /></Atmosphere>;
  const onSoundEnabled = () => { if (game === 'wamda' && state.wamdaSignal === 'red') soundEngine.startTension(); };
  if (game === 'alive') return <StageFrame code="01" onSoundEnabled={onSoundEnabled}><section className={`stage-center ${animatedCount.landed ? 'count-landed' : ''} ${animatedCount.displayed === 1 ? 'stage-final-one' : ''}`}>{state.gameStatus === 'revealed' && state.stayAliveWinner ? <div className="winner-reveal-scene"><p className="stage-eyebrow">باقي معنا حتى النهاية</p><h1 className="stage-winner">{state.stayAliveWinner}</h1></div> : <><p className="stage-eyebrow">الجولة {state.stayAliveRound}</p><h1 className="stage-title">باقي معنا؟</h1><div key={animatedCount.pulseKey} className="stage-count count-step">{animatedCount.displayed}</div><p className="stage-subtitle">{animatedCount.displayed === 3 ? 'ثلاثة فقط باقي معنا' : animatedCount.displayed === 1 ? 'اللحظة الأخيرة… فائز واحد ينتظر الكشف' : 'باقي معنا'}</p></>}</section></StageFrame>;
  return <StageFrame code="02" onSoundEnabled={onSoundEnabled}><section className="stage-center">{state.gameStatus === 'revealed' && state.wamdaWinner ? <div className="winner-reveal-scene"><p className="stage-eyebrow">أسرع ومضة في أُنس</p><div className="stage-time latin-number">{((state.wamdaFastestMs ?? 0) / 1_000).toFixed(3)} ثانية</div><h1 className="stage-winner winner-delay mt-7">{state.wamdaWinner}</h1></div> : state.gameStatus === 'selection' ? <><h1 className="stage-title">وَمْضَة</h1><p className="stage-search">جارٍ البحث عن أسرع ومضة...</p><p className="stage-subtitle">{state.wamdaResponses} استجابة · {state.wamdaFalseStarts} استعجلوا 👀</p></> : <><h1 className="stage-title">وَمْضَة</h1><div className={`stage-lamp lamp-${state.wamdaSignal}`}><span>{state.wamdaSignal === 'green' ? 'الآن!' : 'انتظر الومضة...'}</span></div><p className="stage-subtitle">{state.wamdaSignal === 'idle' ? `${state.wamdaReady} جاهزين` : `${state.wamdaResponses} استجابة · ${state.wamdaFalseStarts} استعجلوا 👀`}</p></>}</section></StageFrame>;
}

function AdminLogin() {
  const [, navigate] = useLocation(); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { void backend.adminIdentity().then((identity) => { if (identity) navigate('/admin', { replace: true }); }); }, [navigate]);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { await backend.adminSignIn(email, password); navigate('/admin', { replace: true }); } catch { setError(APP_MODE === 'demo' ? 'رمز العرض غير صحيح' : 'تعذّر الدخول أو أن هذا الحساب ليس ضمن المشرفين'); } finally { setBusy(false); } };
  return <Atmosphere><main className="grid min-h-screen place-items-center p-5"><form className="glass-card w-full max-w-md p-7 sm:p-9" onSubmit={submit}><BrandMark className="w-40" /><div className="mt-5 flex items-center gap-2 text-[var(--anas-copper)]"><ShieldCheck size={18} /><span className="text-xs">مساحة المنظمين</span></div><h1 className="display-title mt-5 text-4xl">غرفة التشغيل</h1>{APP_MODE === 'demo' && <div className="demo-banner mt-5">DEMO MODE — NOT FOR EVENT USE</div>}<label className="field-label mt-7">البريد الإلكتروني<input className="field text-left" dir="ltr" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required={APP_MODE === 'supabase'} /></label><label className="field-label mt-5">{APP_MODE === 'demo' ? 'رمز العرض' : 'كلمة المرور'}<input className="field text-left" dir="ltr" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error && <p className="error-note mt-4">{error}</p>}<button className="primary-button mt-6 w-full" disabled={busy}>دخول آمن</button></form></main></Atmosphere>;
}

function Metric({ label, value, detail }: { label: string; value: ReactNode; detail: string }) { return <div className="admin-card metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>; }
function ActionButton({ children, onClick, danger = false, primary = false, disabled = false }: { children: ReactNode; onClick: () => void; danger?: boolean; primary?: boolean; disabled?: boolean }) { return <button className={`admin-action${danger ? ' danger' : ''}${primary ? ' primary' : ''}`} onClick={onClick} disabled={disabled}>{children}</button>; }
function Section({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) { return <section className={`admin-card ${className}`}><h2>{title}</h2><div className="admin-actions">{children}</div></section>; }

type StayAliveAdminProps = { state: LiveState; winnerSelected: boolean; target: string; busy: boolean; setTarget: (target: string) => void; run: (action: AdminAction, payload?: Record<string, unknown>, confirmation?: string, success?: string) => Promise<boolean>; round: (target?: number) => Promise<void> };
function StayAliveAdmin({ state, winnerSelected, target, busy, setTarget, run, round }: StayAliveAdminProps) {
  const phase = stayAlivePhase(state, winnerSelected);
  const startDisabledReason = stayAliveStartDisabledReason(state.registered);
  const requestedTarget = Number(target);
  const validTarget = validSurvivorTarget(state.stayAliveRemaining, requestedTarget);
  if (phase === 'not-started') return <Section title="باقي معنا؟" className="guided-card"><p className="operator-summary">المسجلون الآن <b>{state.registered}</b></p><ActionButton primary onClick={() => void run('start_stay_alive')} disabled={busy || Boolean(startDisabledReason)}>ابدأ باقي معنا؟</ActionButton>{startDisabledReason && <p className="disabled-reason">{startDisabledReason}</p>}</Section>;
  if (phase === 'revealed') return <Section title="باقي معنا؟" className="guided-card"><p className="operator-kicker">اكتملت اللعبة</p><h3>تم كشف الفائز</h3><p className="operator-help">استخدم «إعادة ضبط الألعاب» من منطقة الخطر قبل بروفة جديدة.</p></Section>;
  if (phase === 'selected') return <Section title="باقي معنا؟" className="guided-card"><p className="operator-kicker">تم اختيار الفائز — الاسم ما زال مخفيًا</p><ActionButton primary onClick={() => void run('reveal_stay_alive_winner')} disabled={busy}>كشف الفائز</ActionButton></Section>;
  if (phase === 'final-one') return <Section title="باقي معنا؟" className="guided-card"><p className="operator-kicker">لدينا فائز واحد</p><ActionButton primary onClick={() => void run('select_stay_alive_winner')} disabled={busy}>اختيار الفائز</ActionButton></Section>;
  if (phase === 'final-three') return <Section title="باقي معنا؟" className="guided-card"><p className="operator-kicker">🔥 آخر 3 مشاركين</p><div className="round-stats"><span>الجولة الحالية <b>{state.stayAliveRound}</b></span><span>الباقون <b>{state.stayAliveRemaining} من {state.registered}</b></span></div><ActionButton primary onClick={() => void round(1)} disabled={busy}>الانتقال إلى الفائز الواحد</ActionButton><ActionButton onClick={() => void run(state.gameStatus === 'paused' ? 'resume' : 'pause')} disabled={busy}>{state.gameStatus === 'paused' ? 'استئناف اللعبة' : 'إيقاف مؤقت'}</ActionButton></Section>;
  return <Section title="باقي معنا؟" className="guided-card"><div className="round-stats"><span>الجولة الحالية <b>{state.stayAliveRound}</b></span><span>الباقون <b>{state.stayAliveRemaining} من {state.registered}</b></span></div><label className="field-label full-row">كم شخص تريد أن يبقى في الجولة القادمة؟<input className="field" dir="ltr" type="number" min="1" max={Math.max(1, state.stayAliveRemaining - 1)} value={target} onChange={(event) => setTarget(event.target.value)} /></label><div className="quick-targets">{stayAliveQuickTargets(state.stayAliveRemaining).map((option) => <button key={option.label} onClick={() => setTarget(String(option.value))}>{option.label}</button>)}</div><p className="round-preview">{validTarget ? `سيبقى ${requestedTarget} من ${state.stayAliveRemaining}` : 'اختر عددًا أقل من الباقين وأكبر من صفر'}</p><ActionButton primary onClick={() => void round()} disabled={busy || !validTarget || state.gameStatus === 'paused'}>تنفيذ الجولة التالية</ActionButton>{state.gameStatus === 'paused' && <p className="disabled-reason">استأنف اللعبة أولًا لتنفيذ الجولة.</p>}<ActionButton onClick={() => void run(state.gameStatus === 'paused' ? 'resume' : 'pause')} disabled={busy}>{state.gameStatus === 'paused' ? 'استئناف اللعبة' : 'إيقاف مؤقت'}</ActionButton></Section>;
}

function AdminPage() {
  const live = useLiveState(); const [, navigate] = useLocation(); const [identity, setIdentity] = useState<AdminIdentity | null>(null); const [authChecked, setAuthChecked] = useState(false); const [logs, setLogs] = useState<AdminLog[]>([]); const [results, setResults] = useState<WamdaResult[]>([]); const [target, setTarget] = useState('10'); const [clearPhrase, setClearPhrase] = useState(''); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  const loadAdmin = useCallback(async () => { try { const data = await backend.getAdminData(); setLogs(data.logs); setResults(data.results); } catch { /* surfaced in status */ } }, []);
  useEffect(() => { void backend.adminIdentity().then((value) => { setIdentity(value); setAuthChecked(true); if (!value) navigate('/admin/login', { replace: true }); }); }, [navigate]);
  useEffect(() => { if (identity) void loadAdmin(); }, [identity, loadAdmin, live.state?.updatedAt]);
  const run = async (action: AdminAction, payload?: Record<string, unknown>, confirmation?: string, success?: string) => { if (confirmation && !window.confirm(confirmation)) return false; setBusy(true); setNotice(''); try { await backend.adminAction(action, payload); await Promise.all([live.refresh(), loadAdmin()]); if (success) setNotice(success); return true; } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'تعذّر تنفيذ الأمر'); return false; } finally { setBusy(false); } };
  const round = async (override?: number) => { setBusy(true); setNotice(''); try { await backend.stayAliveRound(override ?? Number(target), crypto.randomUUID()); await live.refresh(); } catch { setNotice('العدد يجب أن يكون أقل من الباقين وأكبر من صفر'); } finally { setBusy(false); } };
  const arm = async () => { setBusy(true); setNotice('تم التسليح. التوقيت العشوائي لا يظهر للمشغّل.'); try { await backend.armWamda(); await live.refresh(); } catch { setNotice('تعذّر تسليح الإشارة أو توجد إشارة فعّالة'); } finally { setBusy(false); } };
  if (!authChecked || live.loading) return <Atmosphere><Loading /></Atmosphere>; if (!identity) return null; if (!live.state) return <Atmosphere><BackendUnavailable /></Atmosphere>;
  const state = live.state; const joinUrl = import.meta.env.VITE_JOIN_URL || `${window.location.origin}/join`;
  const latestStayAction = logs.find((log) => ['select_stay_alive_winner', 'start_stay_alive', 'reset_event_state', 'clear_all_registrations'].includes(log.action));
  const stayWinnerSelected = latestStayAction?.action === 'select_stay_alive_winner';
  const wamdaWinnerSelected = results.some((result) => result.selected);
  const clearRegistrations = async () => { if (!canClearRegistrations(clearPhrase)) return; const deletedCount = state.registered; const completed = await run('clear_all_registrations', undefined, undefined, 'تم حذف جميع التسجيلات — المسجلون الآن 0'); if (completed) { setClearPhrase(''); if (deletedCount === 0) setNotice('لا توجد تسجيلات للحذف — المسجلون الآن 0'); } };
  return <div className="admin-shell" dir="rtl"><header className="admin-header"><div><BrandMark className="w-28" /><span>غرفة التشغيل</span></div><div className="flex items-center gap-3"><Pill tone={APP_MODE === 'demo' ? 'warn' : 'good'}>{APP_MODE.toUpperCase()} BACKEND</Pill><button onClick={async () => { await backend.adminSignOut(); navigate('/admin/login'); }} aria-label="خروج"><LogOut size={18} /></button></div></header>{APP_MODE === 'demo' && <div className="demo-banner sticky top-0 z-20 rounded-none text-center">DEMO MODE — NOT FOR EVENT USE</div>}<main className="admin-main"><div className="admin-title"><div><p className="eyebrow">SYSTEM STATUS</p><h1>إدارة أُنس Live</h1></div><button className="refresh-button" onClick={() => void live.refresh()}><RefreshCw size={15} /> تحديث</button></div>{notice && <div className="admin-notice" role="status">{notice}</div>}<section className="metrics"><Metric label="المسجلون" value={state.registered} detail={`${state.connected} متصل تقريبًا`} /><Metric label="التجربة الحالية" value={state.currentExperience} detail={state.gameStatus} /><Metric label="Backend" value={APP_MODE.toUpperCase()} detail={live.error ? 'DATABASE ERROR' : 'DATABASE AVAILABLE'} /><Metric label="Realtime" value={live.realtime ? 'CONNECTED' : 'DISCONNECTED'} detail={identity.email} /></section><div className="admin-grid">
    <Section title="التسجيل"><ActionButton onClick={() => void run('open_registration')} disabled={busy}>فتح التسجيل</ActionButton><ActionButton onClick={() => void run('close_registration')} disabled={busy}>إغلاق التسجيل</ActionButton><div className="qr-box"><QRCodeSVG value={joinUrl} size={150} bgColor="#f2dfc4" fgColor="#21100d" /><span dir="ltr">{joinUrl}</span></div></Section>
    <StayAliveAdmin state={state} winnerSelected={stayWinnerSelected} target={target} busy={busy} setTarget={setTarget} run={run} round={round} />
    <Section title="وَمْضَة"><ActionButton onClick={() => void run('open_wamda')} disabled={busy}>فتح وَمْضَة</ActionButton><ActionButton onClick={() => void arm()} disabled={busy || state.activeGame !== 'wamda'}>تسليح الإشارة</ActionButton><ActionButton onClick={() => void run('cancel_arm')} disabled={busy || state.wamdaSignal !== 'red'}>إلغاء التسليح</ActionButton><ActionButton onClick={() => void run('close_wamda')} disabled={busy || state.activeGame !== 'wamda'}>إغلاق الاستجابات</ActionButton><ActionButton primary onClick={() => void run('reveal_wamda_winner')} disabled={busy || !wamdaWinnerSelected}>كشف الفائز</ActionButton>{!wamdaWinnerSelected && <p className="disabled-reason">اختر نتيجة صحيحة أولًا.</p>}<div className="section-stats"><span>صحيح <b>{state.wamdaValid}</b></span><span>مبكر <b>{state.wamdaFalseStarts}</b></span><span>معلّم <b>{state.wamdaFlagged}</b></span></div></Section>
    <section className="admin-card results-card"><h2>مراجعة النتائج</h2>{results.length ? <div className="results-list">{results.map((result, index) => <div key={result.attemptId} className={result.selected ? 'selected' : ''}><span>#{index + 1} · {result.participantName}</span><b dir="ltr">{result.reactionMs} ms</b>{result.flags.length > 0 && <Pill tone="warn">{result.flags.join(', ')}</Pill>}<button onClick={() => void run('select_wamda_result', { attemptId: result.attemptId }, `اختيار ${result.participantName}؟`)}>اختيار</button></div>)}</div> : <p className="empty">لا توجد نتائج صالحة للمراجعة بعد.</p>}</section>
    <section className="admin-card log-card"><h2>EVENT LOG</h2><div>{logs.slice(0, 20).map((log) => <article key={log.id}><span>{log.action}</span><small>{log.detail}</small><time>{new Date(log.createdAt).toLocaleTimeString('ar-OM')}</time></article>)}</div></section>
    <Section title="تحكم عام"><ActionButton onClick={() => void run('return_lobby')} disabled={busy}>إعادة الجميع للردهة</ActionButton>{APP_MODE === 'demo' && <>{[20, 50, 100, 500].map((count) => <ActionButton key={count} onClick={async () => { await backend.simulateParticipants(count); await live.refresh(); }}>بيانات تجريبية: {count}</ActionButton>)}</>}</Section>
    <Section title="منطقة الخطر" className="danger-zone"><div className="danger-operation"><h3>إعادة ضبط الألعاب</h3><p>يعيد باقي معنا ووَمْضَة إلى البداية مع إبقاء التسجيلات.</p><ActionButton danger onClick={() => void run('reset_event_state', undefined, RESET_GAMES_CONFIRMATION, 'تمت إعادة ضبط الألعاب مع إبقاء جميع التسجيلات.')} disabled={busy}>إعادة ضبط الألعاب</ActionButton></div><div className="danger-operation destructive"><h3>حذف جميع التسجيلات</h3><p>سيتم حذف {state.registered} مشارك وجميع جلسات أجهزتهم.</p><label className="field-label">اكتب <b dir="ltr">{CLEAR_REGISTRATIONS_PHRASE}</b> للتأكيد<input className="field text-left" dir="ltr" autoComplete="off" value={clearPhrase} onChange={(event) => setClearPhrase(event.target.value)} /></label><ActionButton danger onClick={() => void clearRegistrations()} disabled={busy || !canClearRegistrations(clearPhrase)}>حذف جميع التسجيلات</ActionButton>{!canClearRegistrations(clearPhrase) && <p className="disabled-reason">لن يُفعّل الحذف حتى تُكتب العبارة كاملة.</p>}</div></Section>
  </div></main></div>;
}

function NotFound() { const [, navigate] = useLocation(); useEffect(() => navigate('/join', { replace: true }), [navigate]); return null; }
function Router() { const [location] = useLocation(); return <ErrorBoundary resetKey={location}><Switch><Route path="/" component={PublicHome} /><Route path="/join" component={JoinPage} /><Route path="/play" component={PlayPage} /><Route path="/admin/login" component={AdminLogin} /><Route path="/admin" component={AdminPage} /><Route path="/stage/alive"><StagePage game="alive" /></Route><Route path="/stage/wamda"><StagePage game="wamda" /></Route><Route component={NotFound} /></Switch></ErrorBoundary>; }
export default function App() { return <WouterRouter><Router /></WouterRouter>; }
