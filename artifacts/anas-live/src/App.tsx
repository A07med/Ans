import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { AlertTriangle, Check, Clock3, LogOut, Radio, RefreshCw, ShieldCheck, Signal, Sparkles, Users, Wifi, WifiOff } from 'lucide-react';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { backend, APP_MODE } from '@/lib/backend';
import type { AdminAction, AdminIdentity, AdminLog, LiveState, ParticipantView, WamdaResult } from '@/lib/live-types';
import { registrationErrorMessage } from '@/lib/registration-errors';

const PARTICIPANT_TOKEN_KEY = 'anas-participant-token-v1';

function BrandMark({ className = '' }: { className?: string }) {
  return <svg className={`brand-mark ${className}`} viewBox="130 340 765 320" role="img" aria-label="أُنس"><image href="/anas-brand-source.jpg" width="1024" height="1280" /></svg>;
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
    void refresh(); const subscription = backend.subscribe(() => void refresh(), setRealtime);
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

function PublicHome() {
  const [, navigate] = useLocation(); useEffect(() => navigate('/join', { replace: true }), [navigate]); return null;
}

function JoinPage() {
  const { state, loading, error } = useLiveState(); const [, navigate] = useLocation();
  const [form, setForm] = useState({ name: '', phone: '' }); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true); const [sessionCheckFailed, setSessionCheckFailed] = useState(false);
  useEffect(() => {
    const token = localStorage.getItem(PARTICIPANT_TOKEN_KEY); if (!token) { setCheckingSession(false); return; }
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
  if (sessionCheckFailed) return <Atmosphere><main className="grid min-h-screen place-items-center p-6"><BackendUnavailable /></main></Atmosphere>;
  if (error && !state) return <Atmosphere><main className="grid min-h-screen place-items-center p-6"><BackendUnavailable /></main></Atmosphere>;
  return <Atmosphere><main className="public-page">
    <section className="join-card fade-in">
      <BrandMark className="mx-auto w-56 sm:w-64" />
      <p className="eyebrow mt-2">الأمسية الافتتاحية</p><p className="mt-2 text-center text-xs text-[var(--anas-muted)]">جماعة الأنشطة الطلابية — كلية العلوم</p>
      <h1 className="display-title mt-8 text-center text-4xl sm:text-5xl">أهلًا بك في أُنس</h1>
      <p className="mx-auto mt-4 max-w-sm text-center text-sm leading-8 text-[var(--anas-muted)]">سجّل مرة واحدة، وخلك قريب. هذه الصفحة بترافقك طوال الأمسية.</p>
      {state?.registrationOpen ? <form className="mt-8 space-y-5" onSubmit={submit}>
        <label className="field-label">الاسم<input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" placeholder="كيف نناديك؟" required /></label>
        <label className="field-label">رقم الهاتف<input className="field text-left" dir="ltr" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" placeholder="9XXXXXXX" required /></label>
        {message && <p className="error-note" role="alert">{message}</p>}
        <button className="primary-button w-full" disabled={busy}>{busy ? 'لحظة…' : 'دخول أُنس'}</button>
        <p className="text-center text-[11px] leading-6 text-[var(--anas-muted)]">رقمك للتسجيل والتحقق فقط، ولن يظهر للجمهور أو على المسرح.</p>
      </form> : <div className="closed-note mt-8"><Radio className="mx-auto mb-4" /><strong>اكتمل التسجيل لهذه الفقرة</strong><span>إذا سجلت سابقًا، افتح نفس المتصفح للعودة تلقائيًا.</span></div>}
    </section>
  </main></Atmosphere>;
}

function stayAliveCopy(status: ParticipantView['stayAliveStatus'], revealed: boolean) {
  if (status === 'winner' && revealed) return { title: 'أنت الفائز 🎉', copy: 'باقي معنا حتى النهاية' };
  if (status === 'winner' || status === 'finalist') return { title: 'أنت من آخر 3 🔥', copy: 'لا تقفل الصفحة' };
  if (status === 'eliminated') return { title: 'انقطعت إشارتك', copy: 'خرجت من هذا السحب\nنشوفك في وَمْضَة 👀' };
  return { title: 'باقي معنا 🟢', copy: 'استعد للجولة القادمة' };
}

function PlayPage() {
  const { state, loading, error, realtime } = useLiveState(); const [, navigate] = useLocation();
  const [participant, setParticipant] = useState<ParticipantView | null>(null); const [checking, setChecking] = useState(true); const [tapBusy, setTapBusy] = useState(false); const greenStart = useRef<{ signal: string; at: number } | null>(null);
  const rehydrate = useCallback(async () => {
    const token = localStorage.getItem(PARTICIPANT_TOKEN_KEY); if (!token) { navigate('/join', { replace: true }); return; }
    try { const view = await backend.validateParticipant(token); if (!view) { localStorage.removeItem(PARTICIPANT_TOKEN_KEY); navigate('/join', { replace: true }); return; } setParticipant(view); }
    catch { /* Keep the last validated view during a transient outage. */ } finally { setChecking(false); }
  }, [navigate]);
  useEffect(() => { void rehydrate(); }, [rehydrate, state?.updatedAt]);
  useEffect(() => { if (state?.wamdaSignal === 'green' && state.activeSignalId && greenStart.current?.signal !== state.activeSignalId) greenStart.current = { signal: state.activeSignalId, at: performance.now() }; }, [state?.wamdaSignal, state?.activeSignalId]);
  const tap = async () => {
    if (!state?.activeGameSessionId || !state.activeSignalId || !participant || participant.wamdaAttempt !== 'none' || tapBusy) return;
    const token = localStorage.getItem(PARTICIPANT_TOKEN_KEY); if (!token) return;
    const falseStart = state.wamdaSignal !== 'green'; const reaction = falseStart || !greenStart.current ? 0 : Math.max(1, Math.round(performance.now() - greenStart.current.at));
    setTapBusy(true); try { setParticipant(await backend.submitWamda(token, state.activeGameSessionId, state.activeSignalId, reaction, falseStart)); } catch { await rehydrate(); } finally { setTapBusy(false); }
  };
  if (loading || checking) return <Atmosphere><Loading /></Atmosphere>;
  if (error && !state) return <Atmosphere><main className="grid min-h-screen place-items-center p-6"><BackendUnavailable /></main></Atmosphere>;
  if (!state || !participant) return null;
  const stay = stayAliveCopy(participant.stayAliveStatus, state.gameStatus === 'revealed');
  return <Atmosphere><main className={`play-page experience-${state.currentExperience}`}>
    <header className="play-header"><BrandMark className="w-32" /><span className="connection-dot">{realtime ? <Wifi size={13} /> : <WifiOff size={13} />} {realtime ? 'متصل' : 'نستعيد الاتصال'}</span></header>
    <section className="experience-card fade-in">
      {state.currentExperience === 'lobby' && <div className="text-center"><Check className="mx-auto text-[var(--anas-green)]" size={34} /><h1 className="display-title mt-6 text-4xl">تم تسجيلك ✓</h1><p className="mt-5 whitespace-pre-line leading-9 text-[var(--anas-muted)]">خلك قريب…{`\n`}يمكن نحتاجك بعد شوي 👀</p></div>}
      {state.currentExperience === 'intermission' && <div className="text-center"><p className="eyebrow">فاصل قصير</p><h1 className="display-title mt-6 text-5xl">خذ نفسًا</h1><p className="mt-5 text-[var(--anas-muted)]">نرجع بعد شوي. خلك قريب.</p></div>}
      {state.currentExperience === 'end' && <div className="text-center"><BrandMark className="mx-auto w-60" /><h1 className="display-title mt-6 text-4xl">شكرًا لأنك كنت معنا</h1></div>}
      {state.currentExperience === 'stay_alive' && <div className={`text-center stay-${participant.stayAliveStatus ?? 'alive'}`}><p className="eyebrow">باقي معنا؟ · الجولة {state.stayAliveRound}</p><div className="signal-orbit mx-auto mt-8"><Signal size={42} /></div><h1 className="display-title mt-8 text-5xl">{stay.title}</h1><p className="mt-5 whitespace-pre-line leading-9 text-[var(--anas-muted)]">{stay.copy}</p></div>}
      {state.currentExperience === 'wamda' && <div className="text-center"><p className="eyebrow">وَمْضَة</p><h1 className="display-title mt-5 text-4xl">جهّز إصبعك</h1>
        {participant.wamdaAttempt === 'false_start' ? <div className="result-message bad"><strong>استعجلت! 😭</strong><span>ضغطت قبل الومضة<br />خرجت من هذه الجولة</span></div>
          : participant.wamdaAttempt === 'valid' || participant.wamdaAttempt === 'flagged' ? <div className="result-message good"><strong>تم تسجيل وقتك</strong><span className="latin-number">{((participant.reactionMs ?? 0) / 1000).toFixed(3)} ثانية</span><small>الترتيب ما زال سرًا</small></div>
          : <button aria-label={state.wamdaSignal === 'green' ? 'اضغط الآن' : 'انتظر'} className={`reaction-lamp lamp-${state.wamdaSignal}`} onPointerDown={() => void tap()} disabled={tapBusy || state.wamdaSignal === 'closed'}><span>{state.wamdaSignal === 'green' ? 'اضغط!' : state.wamdaSignal === 'closed' ? 'أُغلقت الجولة' : 'انتظر...'}</span></button>}
      </div>}
    </section><p className="participant-name">أهلًا {participant.name}</p>
  </main></Atmosphere>;
}

function StageFrame({ children, code }: { children: ReactNode; code: string }) {
  return <Atmosphere stage><main className="stage-frame"><header><BrandMark className="w-[clamp(9rem,16vw,18rem)]" /><span className="stage-meta">LIVE / {code}</span></header>{children}<footer><span>الأمسية الافتتاحية — جماعة الأنشطة الطلابية</span><span>كلية العلوم</span></footer></main></Atmosphere>;
}
function StagePage({ game }: { game: 'alive' | 'wamda' }) {
  const { state, loading } = useLiveState(); if (loading) return <Atmosphere stage><Loading /></Atmosphere>; if (!state) return <Atmosphere stage><BackendUnavailable /></Atmosphere>;
  if (game === 'alive') return <StageFrame code="01"><section className="stage-center">
    {state.gameStatus === 'revealed' && state.stayAliveWinner ? <><p className="stage-eyebrow">باقي معنا حتى النهاية</p><h1 className="stage-winner">{state.stayAliveWinner}</h1><BrandMark className="mt-7 w-[clamp(12rem,24vw,28rem)]" /></> : <><p className="stage-eyebrow">الجولة {state.stayAliveRound}</p><h1 className="stage-title">باقي معنا؟</h1><div className="stage-count">{state.stayAliveRemaining}</div><p className="stage-subtitle">{state.stayAliveRemaining === 3 ? 'ثلاثة فقط باقي معنا' : 'باقي معنا'}</p></>}
  </section></StageFrame>;
  return <StageFrame code="02"><section className="stage-center">
    {state.gameStatus === 'revealed' && state.wamdaWinner ? <><p className="stage-eyebrow">أسرع ومضة في أُنس</p><div className="stage-time latin-number">{((state.wamdaFastestMs ?? 0) / 1000).toFixed(3)} ثانية</div><h1 className="stage-winner winner-delay mt-7">{state.wamdaWinner}</h1><BrandMark className="winner-delay mt-4 w-[clamp(9rem,16vw,18rem)]" /></> : state.gameStatus === 'selection' ? <><h1 className="stage-title">وَمْضَة</h1><p className="stage-search">جارٍ البحث عن أسرع ومضة...</p><p className="stage-subtitle">{state.wamdaResponses} استجابة · {state.wamdaFalseStarts} استعجلوا 👀</p></> : <><h1 className="stage-title">وَمْضَة</h1><div className={`stage-lamp lamp-${state.wamdaSignal}`}><span>{state.wamdaSignal === 'green' ? 'الآن!' : 'انتظر الومضة...'}</span></div><p className="stage-subtitle">{state.wamdaSignal === 'idle' ? `${state.wamdaReady} جاهزين` : `${state.wamdaResponses} استجابة · ${state.wamdaFalseStarts} استعجلوا 👀`}</p></>}
  </section></StageFrame>;
}

function AdminLogin() {
  const [, navigate] = useLocation(); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { void backend.adminIdentity().then((identity) => { if (identity) navigate('/admin', { replace: true }); }); }, [navigate]);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { await backend.adminSignIn(email, password); navigate('/admin', { replace: true }); } catch { setError(APP_MODE === 'demo' ? 'رمز العرض غير صحيح' : 'تعذّر الدخول أو أن هذا الحساب ليس ضمن المشرفين'); } finally { setBusy(false); } };
  return <Atmosphere><main className="grid min-h-screen place-items-center p-5"><form className="glass-card w-full max-w-md p-7 sm:p-9" onSubmit={submit}><BrandMark className="w-40" /><div className="mt-5 flex items-center gap-2 text-[var(--anas-copper)]"><ShieldCheck size={18} /><span className="text-xs">مساحة المنظمين</span></div><h1 className="display-title mt-5 text-4xl">غرفة التشغيل</h1>
    {APP_MODE === 'demo' && <div className="demo-banner mt-5">DEMO MODE — NOT FOR EVENT USE</div>}
    <label className="field-label mt-7">البريد الإلكتروني<input className="field text-left" dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required={APP_MODE === 'supabase'} /></label>
    <label className="field-label mt-5">{APP_MODE === 'demo' ? 'رمز العرض' : 'كلمة المرور'}<input className="field text-left" dir="ltr" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>{error && <p className="error-note mt-4">{error}</p>}<button className="primary-button mt-6 w-full" disabled={busy}>دخول آمن</button></form></main></Atmosphere>;
}

function Metric({ label, value, detail }: { label: string; value: ReactNode; detail: string }) { return <div className="admin-card metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>; }
function ActionButton({ children, onClick, danger = false, disabled = false }: { children: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) { return <button className={danger ? 'admin-action danger' : 'admin-action'} onClick={onClick} disabled={disabled}>{children}</button>; }
function Section({ title, children }: { title: string; children: ReactNode }) { return <section className="admin-card"><h2>{title}</h2><div className="admin-actions">{children}</div></section>; }

function AdminPage() {
  const live = useLiveState(); const [, navigate] = useLocation(); const [identity, setIdentity] = useState<AdminIdentity | null>(null); const [authChecked, setAuthChecked] = useState(false); const [logs, setLogs] = useState<AdminLog[]>([]); const [results, setResults] = useState<WamdaResult[]>([]); const [target, setTarget] = useState('10'); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  const loadAdmin = useCallback(async () => { try { const data = await backend.getAdminData(); setLogs(data.logs); setResults(data.results); } catch { /* surfaced in status */ } }, []);
  useEffect(() => { void backend.adminIdentity().then((value) => { setIdentity(value); setAuthChecked(true); if (!value) navigate('/admin/login', { replace: true }); }); }, [navigate]);
  useEffect(() => { if (identity) void loadAdmin(); }, [identity, loadAdmin, live.state?.updatedAt]);
  const run = async (action: AdminAction, payload?: Record<string, unknown>, confirmation?: string) => {
    if (confirmation && !window.confirm(confirmation)) return; setBusy(true); setNotice(''); try { await backend.adminAction(action, payload); await Promise.all([live.refresh(), loadAdmin()]); } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'تعذّر تنفيذ الأمر'); } finally { setBusy(false); }
  };
  const round = async () => { setBusy(true); try { await backend.stayAliveRound(Number(target), crypto.randomUUID()); await live.refresh(); } catch { setNotice('العدد يجب أن يكون أقل من الباقين وأكبر من صفر'); } finally { setBusy(false); } };
  const arm = async () => { setBusy(true); setNotice('تم التسليح. التوقيت العشوائي لا يظهر للمشغّل.'); try { await backend.armWamda(); await live.refresh(); } catch { setNotice('تعذّر تسليح الإشارة أو توجد إشارة فعّالة'); } finally { setBusy(false); } };
  const fullReset = async () => { const text = window.prompt('اكتب RESET ANAS لتأكيد حذف بيانات المشاركين'); if (text === 'RESET ANAS') await run('full_reset'); };
  if (!authChecked || live.loading) return <Atmosphere><Loading /></Atmosphere>; if (!identity) return null; if (!live.state) return <Atmosphere><BackendUnavailable /></Atmosphere>;
  const state = live.state; const joinUrl = import.meta.env.VITE_JOIN_URL || `${window.location.origin}/join`;
  return <div className="admin-shell" dir="rtl"><header className="admin-header"><div><BrandMark className="w-28" /><span>غرفة التشغيل</span></div><div className="flex items-center gap-3"><Pill tone={APP_MODE === 'demo' ? 'warn' : 'good'}>{APP_MODE.toUpperCase()} BACKEND</Pill><button onClick={async () => { await backend.adminSignOut(); navigate('/admin/login'); }} aria-label="خروج"><LogOut size={18} /></button></div></header>
    {APP_MODE === 'demo' && <div className="demo-banner sticky top-0 z-20 rounded-none text-center">DEMO MODE — NOT FOR EVENT USE</div>}
    <main className="admin-main"><div className="admin-title"><div><p className="eyebrow">SYSTEM STATUS</p><h1>إدارة أُنس Live</h1></div><button className="refresh-button" onClick={() => void live.refresh()}><RefreshCw size={15} /> تحديث</button></div>
      {notice && <div className="admin-notice">{notice}</div>}
      <section className="metrics"><Metric label="المسجلون" value={state.registered} detail={`${state.connected} متصل تقريبًا`} /><Metric label="التجربة الحالية" value={state.currentExperience} detail={state.gameStatus} /><Metric label="Backend" value={APP_MODE.toUpperCase()} detail={live.error ? 'DATABASE ERROR' : 'DATABASE AVAILABLE'} /><Metric label="Realtime" value={live.realtime ? 'CONNECTED' : 'DISCONNECTED'} detail={identity.email} /></section>
      <div className="admin-grid">
        <Section title="التسجيل"><ActionButton onClick={() => void run('open_registration')} disabled={busy}>فتح التسجيل</ActionButton><ActionButton onClick={() => void run('close_registration')} disabled={busy}>إغلاق التسجيل</ActionButton><div className="qr-box"><QRCodeSVG value={joinUrl} size={150} bgColor="#f2dfc4" fgColor="#21100d" /><span dir="ltr">{joinUrl}</span></div></Section>
        <Section title="باقي معنا؟"><ActionButton onClick={() => void run('start_stay_alive')} disabled={busy || state.registered === 0}>بدء اللعبة</ActionButton><ActionButton onClick={() => void run('pause')} disabled={busy}>إيقاف مؤقت</ActionButton><div className="target-row"><input className="field" dir="ltr" type="number" min="1" max={state.stayAliveRemaining - 1} value={target} onChange={(e) => setTarget(e.target.value)} /><ActionButton onClick={() => void round()} disabled={busy}>الجولة التالية</ActionButton></div><div className="quick-targets">{[.75,.5,.25].map((ratio) => <button key={ratio} onClick={() => setTarget(String(Math.max(1,Math.floor(state.stayAliveRemaining*ratio))))}>إبقاء {ratio*100}%</button>)}</div><ActionButton onClick={() => void run('select_stay_alive_winner')} disabled={busy || state.stayAliveRemaining !== 1}>اختيار الفائز</ActionButton><ActionButton onClick={() => void run('reveal_stay_alive_winner')} disabled={busy}>كشف الفائز</ActionButton><ActionButton danger onClick={() => void run('reset_stay_alive', undefined, 'إعادة ضبط باقي معنا؟ مع إبقاء التسجيلات؟')} disabled={busy}>إعادة ضبط باقي معنا؟</ActionButton><div className="section-stats"><span>الباقون <b>{state.stayAliveRemaining}</b></span><span>الجولة <b>{state.stayAliveRound}</b></span></div></Section>
        <Section title="وَمْضَة"><ActionButton onClick={() => void run('open_wamda')} disabled={busy}>فتح وَمْضَة</ActionButton><ActionButton onClick={() => void arm()} disabled={busy || state.activeGame !== 'wamda'}>تسليح الإشارة</ActionButton><ActionButton onClick={() => void run('cancel_arm')} disabled={busy}>إلغاء التسليح</ActionButton><ActionButton onClick={() => void run('close_wamda')} disabled={busy}>إغلاق الاستجابات</ActionButton><ActionButton onClick={() => void run('reveal_wamda_winner')} disabled={busy}>كشف الفائز</ActionButton><ActionButton danger onClick={() => void run('reset_wamda', undefined, 'إعادة ضبط وَمْضَة؟')} disabled={busy}>إعادة ضبط وَمْضَة</ActionButton><div className="section-stats"><span>صحيح <b>{state.wamdaValid}</b></span><span>مبكر <b>{state.wamdaFalseStarts}</b></span><span>معلّم <b>{state.wamdaFlagged}</b></span></div></Section>
        <section className="admin-card results-card"><h2>مراجعة النتائج</h2>{results.length ? <div className="results-list">{results.map((result, index) => <div key={result.attemptId} className={result.selected ? 'selected' : ''}><span>#{index+1} · {result.participantName}</span><b dir="ltr">{result.reactionMs} ms</b>{result.flags.length > 0 && <Pill tone="warn">{result.flags.join(', ')}</Pill>}<button onClick={() => void run('select_wamda_result', { attemptId: result.attemptId }, `اختيار ${result.participantName}؟`)}>اختيار</button></div>)}</div> : <p className="empty">لا توجد نتائج صالحة للمراجعة بعد.</p>}</section>
        <section className="admin-card log-card"><h2>EVENT LOG</h2><div>{logs.slice(0,20).map((log) => <article key={log.id}><span>{log.action}</span><small>{log.detail}</small><time>{new Date(log.createdAt).toLocaleTimeString('ar-OM')}</time></article>)}</div></section>
        <Section title="تحكم عام"><ActionButton onClick={() => void run('return_lobby')} disabled={busy}>إعادة الجميع للردهة</ActionButton>{APP_MODE === 'demo' && <>{[20,50,100,500].map((count) => <ActionButton key={count} onClick={async () => { await backend.simulateParticipants(count); await live.refresh(); }}>بيانات تجريبية: {count}</ActionButton>)}</>}<ActionButton danger onClick={() => void fullReset()} disabled={busy}>FULL EVENT RESET</ActionButton></Section>
      </div>
    </main></div>;
}

function NotFound() { const [, navigate] = useLocation(); useEffect(() => navigate('/join', { replace: true }), [navigate]); return null; }
function Router() { const [location] = useLocation(); return <ErrorBoundary resetKey={location}><Switch><Route path="/" component={PublicHome} /><Route path="/join" component={JoinPage} /><Route path="/play" component={PlayPage} /><Route path="/admin/login" component={AdminLogin} /><Route path="/admin" component={AdminPage} /><Route path="/stage/alive"><StagePage game="alive" /></Route><Route path="/stage/wamda"><StagePage game="wamda" /></Route><Route component={NotFound} /></Switch></ErrorBoundary>; }
export default function App() { return <WouterRouter><Router /></WouterRouter>; }
