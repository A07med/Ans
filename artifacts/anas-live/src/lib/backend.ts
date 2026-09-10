import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { AdminAction, AdminIdentity, AdminLog, LiveBackend, LiveState, ParticipantSession, ParticipantView, Subscription, WamdaResult } from './live-types';
import { normalizeOmanPhone, validateDisplayName } from './phone';
import { classifyReaction, compareWamdaResults, validSurvivorTarget } from './game-rules';

export const APP_MODE = import.meta.env.VITE_APP_MODE === 'supabase' ? 'supabase' : 'demo';

const INITIAL_STATE: LiveState = {
  registrationOpen: true, currentExperience: 'lobby', activeGame: null,
  activeGameSessionId: null, activeSignalId: null, gameStatus: 'idle', stageMode: 'lobby',
  registered: 20, connected: 0, stayAliveRemaining: 20, stayAliveRound: 0,
  stayAliveWinner: null, wamdaReady: 20, wamdaResponses: 0, wamdaFalseStarts: 0,
  wamdaValid: 0, wamdaFlagged: 0, wamdaFastestMs: null, wamdaWinner: null,
  wamdaSignal: 'idle', updatedAt: new Date().toISOString(),
};

type DemoStore = {
  state: LiveState;
  participants: Record<string, ParticipantSession & { phone: string; stayAliveStatus: ParticipantView['stayAliveStatus']; wamdaAttempt: ParticipantView['wamdaAttempt']; reactionMs: number | null }>;
  logs: AdminLog[];
  results: WamdaResult[];
  usedRequests: string[];
};

const DEMO_KEY = 'anas-demo-backend-v3';
const DEMO_EVENT = 'anas-demo-change';
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

function initialDemo(): DemoStore {
  const store: DemoStore = { state: clone(INITIAL_STATE), participants: {}, results: [], usedRequests: [], logs: [{ id: uuid(), action: 'system_ready', detail: 'DEMO BACKEND جاهز للبروفة', createdAt: now() }] };
  for (let index = 0; index < 20; index += 1) { const token = uuid(); store.participants[token] = { token, participantId: uuid(), name: `مشارك ${index + 1}`, phone: `+9689${String(index).padStart(7, '0')}`, stayAliveStatus: null, wamdaAttempt: 'none', reactionMs: null }; }
  return store;
}

class DemoBackend implements LiveBackend {
  readonly mode = 'demo' as const;
  private read(): DemoStore {
    try { return JSON.parse(localStorage.getItem(DEMO_KEY) ?? '') as DemoStore; } catch { const value = initialDemo(); this.write(value); return value; }
  }
  private write(store: DemoStore) {
    store.state.updatedAt = now();
    localStorage.setItem(DEMO_KEY, JSON.stringify(store));
    window.dispatchEvent(new Event(DEMO_EVENT));
  }
  private log(store: DemoStore, action: string, detail: string) {
    store.logs.unshift({ id: uuid(), action, detail, createdAt: now() });
    store.logs = store.logs.slice(0, 80);
  }
  async getState() { return clone(this.read().state); }
  subscribe(onChange: () => void, onStatus: (connected: boolean) => void): Subscription {
    const handle = () => onChange();
    window.addEventListener('storage', handle); window.addEventListener(DEMO_EVENT, handle); onStatus(true);
    return { unsubscribe: () => { window.removeEventListener('storage', handle); window.removeEventListener(DEMO_EVENT, handle); } };
  }
  async register(nameInput: string, phoneInput: string) {
    const name = validateDisplayName(nameInput); const phone = normalizeOmanPhone(phoneInput);
    if (!name || !phone) throw new Error('invalid_registration');
    const store = this.read();
    const existing = Object.values(store.participants).find((entry) => entry.phone === phone);
    if (existing) throw new Error('already_registered');
    if (!store.state.registrationOpen) throw new Error('registration_closed');
    const session: ParticipantSession = { token: uuid() + uuid(), participantId: uuid(), name };
    store.participants[session.token] = { ...session, phone, stayAliveStatus: null, wamdaAttempt: 'none', reactionMs: null };
    store.state.registered += 1; store.state.stayAliveRemaining += 1; store.state.wamdaReady += 1;
    this.log(store, 'participant_registered', 'تم تسجيل مشارك جديد'); this.write(store); return session;
  }
  async validateParticipant(token: string) {
    const entry = this.read().participants[token];
    return entry ? { participantId: entry.participantId, name: entry.name, stayAliveStatus: entry.stayAliveStatus, wamdaAttempt: entry.wamdaAttempt, reactionMs: entry.reactionMs } : null;
  }
  async submitWamda(token: string, sessionId: string, signalId: string, reactionMs: number, falseStart: boolean) {
    const store = this.read(); const entry = store.participants[token]; const state = store.state;
    if (!entry || sessionId !== state.activeGameSessionId || signalId !== state.activeSignalId || entry.wamdaAttempt !== 'none') throw new Error('attempt_rejected');
    const verdict = classifyReaction(falseStart ? 'red' : state.wamdaSignal, reactionMs, entry.wamdaAttempt !== 'none');
    if (!verdict.accepted) throw new Error(verdict.flags[0] ?? 'attempt_rejected');
    if (verdict.falseStart) {
      entry.wamdaAttempt = 'false_start'; entry.reactionMs = null; state.wamdaFalseStarts += 1;
    } else {
      const flagged = verdict.flags.length > 0; entry.wamdaAttempt = flagged ? 'flagged' : 'valid'; entry.reactionMs = reactionMs;
      state.wamdaResponses += 1; state.wamdaValid += 1; if (flagged) state.wamdaFlagged += 1;
      state.wamdaFastestMs = Math.min(state.wamdaFastestMs ?? reactionMs, reactionMs);
      store.results.push({ attemptId: uuid(), participantName: entry.name, reactionMs, flags: verdict.flags, selected: false });
    }
    this.write(store); return (await this.validateParticipant(token))!;
  }
  async adminSignIn(email: string, password: string) {
    if (password !== (import.meta.env.VITE_DEMO_ADMIN_CODE || 'anas-demo')) throw new Error('invalid_credentials');
    const identity = { id: 'demo-admin', email: email || 'demo@anas.local' }; sessionStorage.setItem('anas-demo-admin', JSON.stringify(identity)); return identity;
  }
  async adminIdentity() { try { return JSON.parse(sessionStorage.getItem('anas-demo-admin') ?? '') as AdminIdentity; } catch { return null; } }
  async adminSignOut() { sessionStorage.removeItem('anas-demo-admin'); }
  async getAdminData() { const store = this.read(); return { logs: clone(store.logs), results: clone(store.results.sort(compareWamdaResults)) }; }
  async adminAction(action: AdminAction, payload: Record<string, unknown> = {}) {
    if (!(await this.adminIdentity())) throw new Error('not_admin');
    const store = this.read(); const state = store.state;
    const gameId = () => uuid();
    if (action === 'open_registration') state.registrationOpen = true;
    if (action === 'close_registration') state.registrationOpen = false;
    if (action === 'start_stay_alive') {
      state.currentExperience = 'stay_alive'; state.activeGame = 'stay_alive'; state.activeGameSessionId = gameId(); state.gameStatus = 'live'; state.stageMode = 'alive'; state.stayAliveRound = 0; state.stayAliveWinner = null;
      Object.values(store.participants).forEach((entry) => { entry.stayAliveStatus = 'alive'; }); state.stayAliveRemaining = state.registered;
    }
    if (action === 'pause') state.gameStatus = 'paused';
    if (action === 'return_lobby') { state.currentExperience = 'lobby'; state.activeGame = null; state.gameStatus = 'idle'; state.stageMode = 'lobby'; state.wamdaSignal = 'idle'; }
    if (action === 'select_stay_alive_winner') {
      const finalists = Object.values(store.participants).filter((entry) => entry.stayAliveStatus === 'alive' || entry.stayAliveStatus === 'finalist');
      const winner = finalists[0]; if (!winner || finalists.length !== 1) throw new Error('winner_requires_one_survivor'); winner.stayAliveStatus = 'winner'; state.stayAliveWinner = winner.name; state.gameStatus = 'selection';
    }
    if (action === 'reveal_stay_alive_winner') { if (!state.stayAliveWinner) throw new Error('winner_not_selected'); state.gameStatus = 'revealed'; }
    if (action === 'reset_stay_alive') { state.stayAliveRound = 0; state.stayAliveRemaining = state.registered; state.stayAliveWinner = null; Object.values(store.participants).forEach((entry) => { entry.stayAliveStatus = null; }); }
    if (action === 'open_wamda') {
      state.currentExperience = 'wamda'; state.activeGame = 'wamda'; state.activeGameSessionId = gameId(); state.activeSignalId = null; state.gameStatus = 'live'; state.stageMode = 'wamda'; state.wamdaSignal = 'idle'; state.wamdaResponses = 0; state.wamdaFalseStarts = 0; state.wamdaValid = 0; state.wamdaFlagged = 0; state.wamdaFastestMs = null; state.wamdaWinner = null; store.results = []; Object.values(store.participants).forEach((entry) => { entry.wamdaAttempt = 'none'; entry.reactionMs = null; });
    }
    if (action === 'cancel_arm') { state.wamdaSignal = 'idle'; state.activeSignalId = null; }
    if (action === 'close_wamda') { state.wamdaSignal = 'closed'; state.gameStatus = 'selection'; }
    if (action === 'select_wamda_result') {
      const result = store.results.find((item) => item.attemptId === payload.attemptId); if (!result) throw new Error('result_not_found'); store.results.forEach((item) => { item.selected = item === result; }); state.wamdaWinner = result.participantName; state.wamdaFastestMs = result.reactionMs; state.gameStatus = 'selection';
    }
    if (action === 'reveal_wamda_winner') { if (!state.wamdaWinner) throw new Error('winner_not_selected'); state.gameStatus = 'revealed'; }
    if (action === 'reset_wamda') { state.wamdaSignal = 'idle'; state.activeSignalId = null; state.wamdaResponses = 0; state.wamdaFalseStarts = 0; state.wamdaValid = 0; state.wamdaFlagged = 0; state.wamdaFastestMs = null; state.wamdaWinner = null; store.results = []; Object.values(store.participants).forEach((entry) => { entry.wamdaAttempt = 'none'; entry.reactionMs = null; }); }
    if (action === 'full_reset') { const replacement = initialDemo(); replacement.state.registrationOpen = false; this.write(replacement); return clone(replacement.state); }
    this.log(store, action, `Admin: ${action}`); this.write(store); return clone(state);
  }
  async stayAliveRound(target: number, requestId: string) {
    const store = this.read(); if (store.usedRequests.includes(requestId)) return clone(store.state);
    const alive = Object.values(store.participants).filter((entry) => entry.stayAliveStatus === 'alive' || entry.stayAliveStatus === 'finalist');
    if (!validSurvivorTarget(alive.length, target)) throw new Error('invalid_target');
    store.usedRequests.push(requestId); const survivors = new Set(alive.slice(0, target).map((entry) => entry.participantId));
    alive.forEach((entry) => { entry.stayAliveStatus = survivors.has(entry.participantId) ? (target <= 3 ? 'finalist' : 'alive') : 'eliminated'; });
    store.state.stayAliveRemaining = target; store.state.stayAliveRound += 1; this.log(store, 'stay_alive_round', `${alive.length} → ${target}`); this.write(store); return clone(store.state);
  }
  async armWamda() {
    const store = this.read(); if (store.state.activeGame !== 'wamda') throw new Error('wamda_not_open');
    store.state.activeSignalId = uuid(); store.state.wamdaSignal = 'red'; this.log(store, 'wamda_armed', 'تم تسليح الإشارة بتأخير عشوائي'); this.write(store);
    const delay = 2_000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 5_001);
    window.setTimeout(() => { const fresh = this.read(); if (fresh.state.wamdaSignal === 'red' && fresh.state.activeSignalId === store.state.activeSignalId) { fresh.state.wamdaSignal = 'green'; this.log(fresh, 'wamda_green', 'أطلقت الإشارة'); this.write(fresh); } }, delay);
    return clone(store.state);
  }
  async simulateParticipants(count: number) {
    const store = initialDemo(); store.state.registered = count; store.state.stayAliveRemaining = count; store.state.wamdaReady = count;
    for (let index = 0; index < count; index += 1) { const token = uuid(); store.participants[token] = { token, participantId: uuid(), name: `مشارك ${index + 1}`, phone: `+9689${String(index).padStart(7, '0')}`, stayAliveStatus: null, wamdaAttempt: 'none', reactionMs: null }; }
    this.log(store, 'demo_seeded', `${count} مشارك تجريبي`); this.write(store); return clone(store.state);
  }
}

class SupabaseBackend implements LiveBackend {
  readonly mode = 'supabase' as const;
  private client: SupabaseClient;
  private configMissing = false;
  private channels: RealtimeChannel[] = [];
  private presenceCount = 0;
  constructor() {
    const url = import.meta.env.VITE_SUPABASE_URL || 'https://missing-config.invalid'; const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'missing';
    this.configMissing = !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY;
    this.client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  }
  private async rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    if (this.configMissing) throw new Error('missing_supabase_config');
    const { data, error } = await this.client.rpc(name, args); if (error) throw error; return data as T;
  }
  async getState() { const state = await this.rpc<LiveState>('get_public_event_state'); return { ...state, connected: this.presenceCount || state.connected }; }
  subscribe(onChange: () => void, onStatus: (connected: boolean) => void): Subscription {
    if (this.configMissing) { onStatus(false); return { unsubscribe: () => undefined }; }
    const changes = this.client.channel('anas-public-events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_state' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wamda_public_signals' }, onChange)
      .subscribe((status) => onStatus(status === 'SUBSCRIBED'));
    const presence = this.client.channel('anas-presence', { config: { presence: { key: uuid() } } })
      .on('presence', { event: 'sync' }, () => { this.presenceCount = Object.keys(presence.presenceState()).length; onChange(); })
      .subscribe(async (status) => { if (status === 'SUBSCRIBED') await presence.track({ online_at: now() }); });
    this.channels = [changes, presence];
    return { unsubscribe: () => { this.channels.forEach((channel) => void this.client.removeChannel(channel)); this.channels = []; } };
  }
  register(nameInput: string, phoneInput: string) { const name = validateDisplayName(nameInput); const phone = normalizeOmanPhone(phoneInput); if (!name || !phone) return Promise.reject(new Error('invalid_registration')); return this.rpc<ParticipantSession>('register_participant', { p_name: name, p_phone: phone }); }
  validateParticipant(token: string) { return this.rpc<ParticipantView | null>('get_participant_state', { p_token: token }); }
  submitWamda(token: string, sessionId: string, signalId: string, reactionMs: number, falseStart: boolean) { return this.rpc<ParticipantView>('submit_wamda_attempt', { p_token: token, p_game_session_id: sessionId, p_signal_id: signalId, p_reaction_ms: reactionMs, p_false_start: falseStart }); }
  async adminSignIn(email: string, password: string) { const { data, error } = await this.client.auth.signInWithPassword({ email, password }); if (error || !data.user) throw error ?? new Error('invalid_credentials'); const admin = await this.adminIdentity(); if (!admin) { await this.client.auth.signOut(); throw new Error('not_admin'); } return admin; }
  async adminIdentity() { const { data } = await this.client.auth.getUser(); if (!data.user) return null; const allowed = await this.rpc<boolean>('is_admin'); return allowed ? { id: data.user.id, email: data.user.email ?? '' } : null; }
  async adminSignOut() { await this.client.auth.signOut(); }
  getAdminData() { return this.rpc<{ logs: AdminLog[]; results: WamdaResult[] }>('get_admin_dashboard'); }
  adminAction(action: AdminAction, payload: Record<string, unknown> = {}) { return this.rpc<LiveState>('admin_action', { p_action: action, p_payload: payload, p_request_id: uuid() }); }
  stayAliveRound(target: number, requestId: string) { return this.rpc<LiveState>('execute_stay_alive_round', { p_target_survivors: target, p_request_id: requestId }); }
  async armWamda() { const { error } = await this.client.functions.invoke('wamda-signal', { body: { requestId: uuid() } }); if (error) throw error; return this.getState(); }
  simulateParticipants() { return Promise.reject(new Error('demo_only')); }
}

export const backend: LiveBackend = APP_MODE === 'supabase' ? new SupabaseBackend() : new DemoBackend();
