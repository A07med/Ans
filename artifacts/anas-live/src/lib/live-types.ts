export type Experience = 'lobby' | 'stay_alive' | 'intermission' | 'wamda' | 'end';
export type Game = 'stay_alive' | 'wamda';
export type GameStatus = 'idle' | 'live' | 'paused' | 'selection' | 'revealed' | 'complete';
export type WamdaSignal = 'idle' | 'red' | 'green' | 'closed';
export type StayAliveStatus = 'alive' | 'eliminated' | 'finalist' | 'winner' | null;

export type LiveState = {
  registrationOpen: boolean;
  currentExperience: Experience;
  activeGame: Game | null;
  activeGameSessionId: string | null;
  activeSignalId: string | null;
  gameStatus: GameStatus;
  stageMode: 'lobby' | 'alive' | 'wamda' | 'end';
  registered: number;
  connected: number;
  stayAliveRemaining: number;
  stayAliveRound: number;
  stayAliveWinner: string | null;
  wamdaReady: number;
  wamdaResponses: number;
  wamdaFalseStarts: number;
  wamdaValid: number;
  wamdaFlagged: number;
  wamdaFastestMs: number | null;
  wamdaWinner: string | null;
  wamdaSignal: WamdaSignal;
  updatedAt: string;
};

export type ParticipantSession = { token: string; participantId: string; name: string };
export type ParticipantView = {
  participantId: string;
  name: string;
  stayAliveStatus: StayAliveStatus;
  wamdaAttempt: 'none' | 'false_start' | 'valid' | 'flagged';
  reactionMs: number | null;
  wamdaRank: number | null;
  wamdaTotalRanked: number | null;
  wamdaIsWinner: boolean | null;
  winnerRevealed: boolean;
};
export type AdminIdentity = { id: string; email: string };
export type AdminLog = { id: string; action: string; detail: string; createdAt: string };
export type WamdaResult = {
  attemptId: string;
  participantName: string;
  reactionMs: number;
  submissionReceivedAt?: string;
  flags: string[];
  selected: boolean;
};

export type AdminAction =
  | 'open_registration' | 'close_registration' | 'start_stay_alive' | 'pause' | 'resume'
  | 'return_lobby' | 'select_stay_alive_winner' | 'reveal_stay_alive_winner'
  | 'reset_stay_alive' | 'open_wamda' | 'cancel_arm' | 'close_wamda'
  | 'select_wamda_result' | 'reveal_wamda_winner' | 'reset_wamda'
  | 'reset_event_state' | 'clear_all_registrations';

export type Subscription = { unsubscribe: () => void };
export interface LiveBackend {
  readonly mode: 'demo' | 'supabase';
  getState(): Promise<LiveState>;
  subscribe(onChange: () => void, onStatus: (connected: boolean) => void): Subscription;
  register(name: string, phone: string): Promise<ParticipantSession>;
  validateParticipant(token: string): Promise<ParticipantView | null>;
  submitWamda(token: string, sessionId: string, signalId: string, reactionMs: number, falseStart: boolean): Promise<ParticipantView>;
  adminSignIn(email: string, password: string): Promise<AdminIdentity>;
  adminIdentity(): Promise<AdminIdentity | null>;
  adminSignOut(): Promise<void>;
  getAdminData(): Promise<{ logs: AdminLog[]; results: WamdaResult[] }>;
  adminAction(action: AdminAction, payload?: Record<string, unknown>): Promise<LiveState>;
  stayAliveRound(target: number, requestId: string): Promise<LiveState>;
  armWamda(): Promise<LiveState>;
  simulateParticipants(count: number): Promise<LiveState>;
}
