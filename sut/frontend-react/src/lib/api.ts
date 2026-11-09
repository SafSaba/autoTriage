/// <reference types="vite/client" />
import type { Product, CartItem, Order, ShippingAddress, UserProfile } from './types';

const TOKEN_KEY = 'e_automate_jwt';

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

const metaEnv = (import.meta as any).env || {};

export function resolveApiBase(): string {
  if (metaEnv.VITE_API_URL !== undefined && metaEnv.VITE_API_URL !== '') {
    return metaEnv.VITE_API_URL;
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host.includes('white-pebble')) {
      return 'https://autotriage-backend-dev.graytree-645df5bf.eastus.azurecontainerapps.io';
    }
    if (host.includes('jolly-sky')) {
      return 'https://autotriage-backend-qa.graytree-645df5bf.eastus.azurecontainerapps.io';
    }
    if (host.includes('happy-coast')) {
      return 'https://autotriage-backend-prod.graytree-645df5bf.eastus.azurecontainerapps.io';
    }
  }
  return metaEnv.DEV ? '' : 'https://autotriage-backend-dev.graytree-645df5bf.eastus.azurecontainerapps.io';
}

export const API_BASE = resolveApiBase();

export let lastTraceparent: string = 'None';
export let lastOperationId: string = 'None';

function generateW3CTraceparent(): { traceparent: string; traceId: string } {
  try {
    const traceId = Array.from(window.crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const spanId = Array.from(window.crypto.getRandomValues(new Uint8Array(8)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const traceparent = `00-${traceId}-${spanId}-01`;
    lastTraceparent = traceparent;
    lastOperationId = traceId;
    return { traceparent, traceId };
  } catch {
    const fallbackId = Math.random().toString(16).substring(2, 18).padEnd(32, '0');
    lastTraceparent = `00-${fallbackId}-1122334455667788-01`;
    lastOperationId = fallbackId;
    return { traceparent: lastTraceparent, traceId: fallbackId };
  }
}

export function getTelemetryState() {
  return {
    traceparent: lastTraceparent,
    operationId: lastOperationId,
    apiBase: resolveApiBase(),
    env: typeof window !== 'undefined' && window.location.hostname.includes('happy-coast')
      ? 'PROD'
      : typeof window !== 'undefined' && window.location.hostname.includes('jolly-sky')
      ? 'QA'
      : 'DEV',
  };
}

export async function apiFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const { traceparent } = generateW3CTraceparent();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'traceparent': traceparent,
    'x-ms-request-root-id': lastOperationId,
    ...((init.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const base = resolveApiBase();
  const url = path.startsWith('http') ? path : `${base}${path}`;
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const message = data?.message || data?.error || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}

export interface AuthResponse {
  token: string;
  user: UserProfile & { role?: string };
}

export interface ContactMessage {
  id: string;
  email: string;
  subject: string;
  message: string;
  status: string;
  createdAt: number;
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      apiFetch<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    signup: (payload: { email: string; password: string; firstName?: string; lastName?: string; displayName?: string }) =>
      apiFetch<AuthResponse>('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    forgotPassword: (email: string) =>
      apiFetch<{ success: boolean; message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    getMe: () => apiFetch<UserProfile & { role?: string }>('/api/me'),
    updateMe: (payload: Partial<UserProfile>) =>
      apiFetch<UserProfile & { role?: string }>('/api/me', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
  },
  products: {
    list: (params?: { category?: string; q?: string; sort?: string }) => {
      const qs = new URLSearchParams();
      if (params?.category) qs.set('category', params.category);
      if (params?.q) qs.set('q', params.q);
      if (params?.sort) qs.set('sort', params.sort);
      const queryStr = qs.toString() ? `?${qs.toString()}` : '';
      return apiFetch<Product[]>(`/api/products${queryStr}`);
    },
    getById: (id: string) => apiFetch<Product>(`/api/products/${encodeURIComponent(id)}`),
    categories: () => apiFetch<string[]>('/api/products/categories'),
    create: (product: Partial<Product>) =>
      apiFetch<Product>('/api/products', {
        method: 'POST',
        body: JSON.stringify(product),
      }),
    update: (id: string, product: Partial<Product>) =>
      apiFetch<Product>(`/api/products/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(product),
      }),
    delete: (id: string) =>
      apiFetch<{ success: boolean; id: string }>(`/api/products/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    reset: () =>
      apiFetch<Product[]>('/api/products/reset', {
        method: 'POST',
      }),
  },
  cart: {
    get: () =>
      apiFetch<{ items: CartItem[]; subtotal: number; tax: number; total: number }>('/api/cart'),
    sync: (items: { productId: string; quantity: number }[]) =>
      apiFetch<{ items: CartItem[]; subtotal: number; tax: number; total: number }>('/api/cart/sync', {
        method: 'POST',
        body: JSON.stringify(items),
      }),
    addItem: (productId: string, quantity: number) =>
      apiFetch<{ success: boolean; cart: { items: CartItem[]; subtotal: number; tax: number; total: number } }>(
        '/api/cart/items',
        {
          method: 'POST',
          body: JSON.stringify({ productId, quantity }),
        }
      ),
    updateItem: (productId: string, quantity: number) =>
      apiFetch<{ items: CartItem[]; subtotal: number; tax: number; total: number }>(
        `/api/cart/items/${encodeURIComponent(productId)}`,
        {
          method: 'PUT',
          body: JSON.stringify({ quantity }),
        }
      ),
    removeItem: (productId: string) =>
      apiFetch<{ items: CartItem[]; subtotal: number; tax: number; total: number }>(
        `/api/cart/items/${encodeURIComponent(productId)}`,
        {
          method: 'DELETE',
        }
      ),
    clear: () =>
      apiFetch<{ success: boolean; message: string }>('/api/cart', {
        method: 'DELETE',
      }),
  },
  orders: {
    create: (payload: {
      items: { productId: string; quantity: number }[];
      shippingAddress: ShippingAddress;
      paymentDetails?: Record<string, unknown>;
    }) =>
      apiFetch<Order>('/api/orders', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    list: () => apiFetch<Order[]>('/api/orders'),
    getById: (orderId: string) => apiFetch<Order>(`/api/orders/${encodeURIComponent(orderId)}`),
    adminList: () => apiFetch<Order[]>('/api/admin/orders'),
    adminUpdateStatus: (orderId: string, status: string) =>
      apiFetch<Order>(`/api/admin/orders/${encodeURIComponent(orderId)}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      }),
  },
  contact: {
    submit: (payload: { email: string; subject: string; message: string }) =>
      apiFetch<ContactMessage>('/api/contact', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    adminList: () => apiFetch<ContactMessage[]>('/api/admin/messages'),
  },
  bugs: {
    getFlags: () => apiFetch<Record<string, boolean>>('/api/admin/bugs'),
    updateFlags: (updates: Record<string, boolean>) =>
      apiFetch<Record<string, boolean>>('/api/admin/bugs', {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
  },
  fde: {
    createSession: async () => {
      const data = await apiFetch<FdeSessionResponse>('/api/fde/session', {
        method: 'POST',
        body: JSON.stringify({ operator: 'fde-sandbox-operator' }),
      });
      if (data?.token) {
        setAuthToken(data.token);
      }
      return data;
    },
    attack: (payload: FdeAttackRequest) =>
      apiFetch<FdeAttackResponse>('/api/fde/attack', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    heal: () =>
      apiFetch<FdeHealResponse>('/api/fde/heal', {
        method: 'POST',
      }),
    healSandbox: (): Promise<FdeHealSandboxResponse> =>
      apiFetch<FdeHealSandboxResponse>('/api/fde/heal', {
        method: 'POST',
      }),
    getReleases: async (): Promise<FdeReleasesResponse> => {
      const res = await apiFetch<FdeReleasesResponse>('/api/fde/releases');
      if (res.environments) {
        if (!res.dev && res.environments.dev) res.dev = res.environments.dev;
        if (!res.qa && res.environments.qa) res.qa = res.environments.qa;
        if (!res.prod && res.environments.prod) res.prod = res.environments.prod;
      }
      return res;
    },
    getSelfRelease: (): Promise<FdeReleaseEnvInfo> =>
      apiFetch<FdeReleaseEnvInfo>('/api/fde/releases/self'),
    runScenario: (id: string, target: 'dev' | 'qa' = 'dev'): Promise<FdeScenarioRunResponse> =>
      apiFetch<FdeScenarioRunResponse>(`/api/fde/scenarios/${encodeURIComponent(id)}/run`, {
        method: 'POST',
        body: JSON.stringify({ target }),
      }),
    compareScenario: async (id: string): Promise<FdeScenarioCompareResponse> => {
      const res = await apiFetch<FdeScenarioCompareResponse>(`/api/fde/compare/${encodeURIComponent(id)}`, {
        method: 'POST',
      });
      if (!res.devResult && res.dev) res.devResult = res.dev;
      if (!res.qaResult && res.qa) res.qaResult = res.qa;
      return res;
    },
    getAdoLive: () => apiFetch<FdeAdoLiveResponse>('/api/fde/ado/live'),
    createAdoBug: (payload: FdeAdoBugRequest) =>
      apiFetch<FdeAdoBugResponse>('/api/fde/ado/bugs', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    inviteStakeholder: (payload: FdeAdoInviteRequest) =>
      apiFetch<FdeAdoInviteResponse>('/api/fde/ado/invite', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    retrieveRag: (q: string) =>
      apiFetch<FdeRagResponse>(`/api/fde/rag/retrieve?q=${encodeURIComponent(q)}`),
    getMemoryEpisodes: () =>
      apiFetch<FdeMemoryEpisode[]>('/api/fde/memory/episodes'),
    getHistory: (limit = 20) =>
      apiFetch<{
        totalAttackRuns: number;
        totalHealingMissions: number;
        attackRuns: any[];
        healingMissions: any[];
      }>(`/api/fde/history?limit=${limit}`),
    triage: (payload: { query: string; attackType?: string }) =>
      apiFetch<FdeRagTriageResponse>('/api/fde/rag-triage', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    solveWithAgent: (payload: { ticketId?: string; subject: string; body: string; scenarioId?: string; headed?: boolean }) =>
      apiFetch<FdeAgentSolveResponse>('/api/fde/agent/solve', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },
};

export interface FdeSessionResponse {
  token: string;
  userId: string;
  email: string;
  role: string;
  environment: string;
  expiresInSeconds: number;
}

export interface FdeAttackRequest {
  attackType: string;
  payload?: any;
  concurrency?: number;
}

export interface FdeAttackResponse {
  attackType: string;
  success: boolean;
  timestamp: string;
  traceparent: string;
  preSnapshot: any;
  postSnapshot: any;
  delta: any;
  blastRadius: {
    instantDollarLoss: number;
    unfulfillableUnits: number;
    annualProjectedLoss: number;
    affectedCustomers: number;
    riskSummary: string;
  };
  details: string;
}

export interface FdeHealResponse {
  success: boolean;
  timestamp: string;
  mttrMs: number;
  restoredEntities: {
    ordersCancelled: number;
    productsRestored: number;
    cartItemsCleared: number;
    bugFlagsDisengaged: number;
  };
  details: string;
}

export interface FdeAdoWorkItem {
  id: number;
  title: string;
  type: string;
  state: string;
  assignedTo: string;
  storyPoints?: number;
  url?: string;
  iteration?: string;
  severity?: string;
  priority?: number;
}

export interface FdeAdoPullRequest {
  pullRequestId: number;
  title: string;
  sourceBranch: string;
  targetBranch: string;
  status: string;
  createdBy: string;
  url: string;
}

export interface FdeAdoTestSuite {
  planId?: number;
  planName?: string;
  suiteId?: number;
  suiteName?: string;
  runCount?: number;
  passRate?: string;
  id?: number;
  title?: string;
  type?: string;
  state?: string;
}

export interface FdeAdoLiveResponse {
  organization: string;
  project: string;
  repoId?: string;
  connected?: boolean;
  message?: string;
  count?: number;
  timestamp?: number;
  workItems?: FdeAdoWorkItem[];
  sprints?: Record<string, any> | Array<{
    id: string;
    name: string;
    startDate?: string;
    finishDate?: string;
    itemsCount?: number;
    items: FdeAdoWorkItem[];
  }>;
  pullRequests: FdeAdoPullRequest[];
  testSuites?: FdeAdoTestSuite[];
  testRuns?: Array<{
    id?: number;
    name?: string;
    state?: string;
    totalTests?: number;
    passedTests?: number;
  }>;
}

export interface FdeAdoBugRequest {
  title: string;
  description: string;
  severity?: string;
  gherkinSnippet?: string;
  tags?: string[];
}

export interface FdeAdoBugResponse {
  success: boolean;
  workItemId: number;
  title: string;
  url: string;
  createdTime: string;
}

export interface FdeAdoInviteRequest {
  email: string;
  projectRole?: string;
}

export interface FdeAdoInviteResponse {
  success: boolean;
  email: string;
  status: string;
  message: string;
}

export interface FdeRagChunk {
  chunkId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  methodName: string;
  className: string;
  snippet: string;
  similarityScore: number;
  grounded: boolean;
  commitSha: string;
}

export interface FdeRagResponse {
  query: string;
  chunksCount: number;
  topGroundingScore: number;
  chunks: FdeRagChunk[];
  groundingProof: {
    grounded: boolean;
    activeCommitSha: string;
    sourceVerified: boolean;
  };
}

export interface FdeMemoryEpisode {
  episodeId: string;
  attackType: string;
  symptomPattern: string;
  rootCauseClass: string;
  rootCauseMethod: string;
  lineRange: string;
  patchDiff: string;
  gherkinRegression: string;
  recallLatencyMs: number;
  criticScore: number;
}

export interface FdeRagTriageResponse {
  query: string;
  attackType: string;
  episodicRecall: {
    hit: boolean;
    latencyMs: number;
    episode?: FdeMemoryEpisode;
  };
  ragContext: FdeRagResponse;
}

export interface FdeReleaseEnvInfo {
  environment?: string;
  version: string;
  gitSha: string | null;
  gitBranch: string | null;
  buildTime: string | null;
  flywayVersion: string | null;
  flywayInstalledOn?: string | null;
  activeBugFlags?: Record<string, boolean>;
}

export interface FdeEnvironmentProbe {
  name: string;
  url: string;
  readOnly: boolean;
  reachable: boolean;
  data: FdeReleaseEnvInfo | null;
  error: string | null;
}

export interface FdeReleasesResponse {
  self: FdeReleaseEnvInfo;
  environments?: {
    dev: FdeEnvironmentProbe;
    qa: FdeEnvironmentProbe;
    prod: FdeEnvironmentProbe;
  };
  dev?: FdeEnvironmentProbe;
  qa?: FdeEnvironmentProbe;
  prod?: FdeEnvironmentProbe;
}

export interface FdeScenarioRunResponse {
  scenarioId: string;
  attackType?: string;
  target: 'dev' | 'qa' | string;
  status: string;
  httpStatus: number;
  latencyMs: number;
  financialBlastRadius: {
    dollarLoss: number;
    unfulfillableUnits: number;
    annualProjectedLoss: number;
  };
  executionMessage: string;
  executionDetails: Record<string, any>;
  preState?: any;
  postState?: any;
  delta?: any;
  runId?: string;
}

export interface FdeScenarioCompareResponse {
  scenarioId: string;
  dev: FdeScenarioRunResponse;
  qa: FdeScenarioRunResponse;
  devResult?: FdeScenarioRunResponse;
  qaResult?: FdeScenarioRunResponse;
  driftDetected: boolean;
  driftSummary: Array<{
    field: string;
    dev: any;
    qa: any;
    description: string;
  }>;
}

export interface FdeHealSandboxResponse {
  healed: boolean;
  type: string;
  message: string;
  mttrMs?: number;
  restoredEntities?: Record<string, any>;
  missionId?: string;
}

export interface FdeAgentSolveResponse {
  success: boolean;
  durationMs: number;
  agentState: {
    ticket_id: string;
    subject: string;
    body: string;
    sanitized_body?: string;
    injection_score?: number;
    is_quarantined?: boolean;
    quarantine_reason?: string | null;
    is_working_as_designed?: boolean;
    wad_spec?: string;
    wad_rationale?: string;
    rag_citations?: string[];
    rag_context?: string;
    test_to_run?: string;
    repro_status?: string;
    repro_error_summary?: string;
    repro_duration_sec?: number;
    repro_screenshot?: string;
    screenshot_url?: string;
    screenshot_base64?: string;
    repro_steps?: any[];
    headed?: boolean;
    classification?: string;
    action_path?: string;
    assigned_owner?: string;
    owner_status?: string;
    suspect_file?: string;
    suspect_start_line?: number;
    suspect_end_line?: number;
    grounding_verified?: boolean;
    reasoning_mode?: string;
    tokens_consumed?: number;
    llm_latency_sec?: number;
    created_work_item_id?: string | number;
    jira_url?: string;
    ado_url?: string;
    patch_status?: string;
    patch_diff?: string;
    pr_url?: string;
    pr_id?: string | number;
    self_heal_verified?: boolean;
    adversarial_critic_badge?: string;
    finops_receipt?: {
      tokens_consumed: number;
      autonomous_mttr_sec: number;
      reasoning_mode: string;
    };
    triage_notes?: string;
    wall_clock_sec?: number;
  };
  stdoutLogs: string;
  activeBugFlagsAfter: Record<string, boolean>;
}
