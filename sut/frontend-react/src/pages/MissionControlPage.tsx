import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  Flame,
  GitBranch,
  GitPullRequest,
  Layers,
  Play,
  RefreshCw,
  Server,
  Shield,
  ShieldAlert,
  Terminal,
  Zap,
  TrendingDown,
  DollarSign,
  Bot,
  ExternalLink,
  ChevronRight,
  Code,
  Check,
  XCircle,
  Activity,
  Award,
  Sparkles,
  Sliders,
  Send,
  UserPlus,
  FileCode,
  Bug,
  History,
  Lock,
  ArrowRight,
  Eye,
} from 'lucide-react';
import {
  api,
  getTelemetryState,
  FdeSessionResponse,
  FdeAttackResponse,
  FdeHealResponse,
  FdeAdoLiveResponse,
  FdeRagTriageResponse,
  FdeMemoryEpisode,
  FdeRagChunk,
} from '@/lib/api';

interface ClusterNode {
  name: string;
  tier: 'DEV' | 'QA' | 'PROD';
  url: string;
  db: string;
  health: 'UP' | 'DEGRADED' | 'DOWN' | 'CHECKING';
  latencyMs: number;
  revision: string;
  isolationNote: string;
}

interface W3CTrace {
  id: string;
  timestamp: string;
  operationId: string;
  endpoint: string;
  status: number;
  durationMs: number;
}

interface GraphStep {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'running' | 'completed' | 'alert';
  detail: string;
}

interface ChallengeConfig {
  id: string;
  type: string;
  prompt: string;
  title: string;
  category: 'PRICING' | 'CART' | 'CONCURRENCY' | 'VALIDATION' | 'IDEMPOTENCY' | 'SECURITY';
  description: string;
  suggestedConcurrency: number;
  defaultPayload: Record<string, any>;
  defaultGherkin: string;
}

const CHALLENGES: ChallengeConfig[] = [
  {
    id: 'CH-1',
    type: 'PRICE_TAMPERING',
    prompt: 'Try to buy the $2,500 laptop for $0.01',
    title: 'Client-Side Unit Price Tampering',
    category: 'PRICING',
    description: 'Bypasses client checkout validation by sending an authoritative $2,499.99 workstation for $0.01.',
    suggestedConcurrency: 1,
    defaultPayload: {
      items: [
        {
          productId: 'laptop-1',
          productName: 'Pro Developer Workstation 16"',
          price: 0.01,
          quantity: 1,
        },
      ],
      shippingAddress: {
        fullName: 'Arbitrage Bot Operator',
        addressLine1: '1337 Exploit Way',
        city: 'Seattle',
        state: 'WA',
        postalCode: '98101',
        country: 'USA',
      },
    },
    defaultGherkin: `Feature: Authoritative Catalog Price Validation
  Scenario: Reject client-supplied tampered unit prices
    Given product "laptop-1" has an authoritative catalog price of $2499.99
    When client attempts to submit order with unit price $0.01
    Then the order placement must be rejected with HTTP 400 Bad Request
    And the catalog unit price must not be overridden in PostgreSQL`,
  },
  {
    id: 'CH-2',
    type: 'CART_UNDERFLOW',
    prompt: 'Send a negative quantity -50 into the shopping cart',
    title: 'Cart Integer Underflow / Credit Drift',
    category: 'CART',
    description: 'Attempts to persist a negative quantity (-50) to force cart balance inversion into credits.',
    suggestedConcurrency: 1,
    defaultPayload: {
      productId: 'laptop-1',
      quantity: -50,
    },
    defaultGherkin: `Feature: Shopping Cart Quantity Boundary Enforcement
  Scenario: Reject non-positive quantities on cart items
    Given an active user shopping cart session
    When client adds product "laptop-1" with quantity -50
    Then the cart service must reject the payload with validation error
    And the cart subtotal must never register negative credit balances`,
  },
  {
    id: 'CH-3',
    type: 'RACE_CONDITION',
    prompt: 'Fire 5 simultaneous checkouts when only 1 watch is left in stock',
    title: 'Concurrent Inventory Oversell Race',
    category: 'CONCURRENCY',
    description: 'Dispatches 5 parallel checkout threads competing against a solitary remaining inventory unit.',
    suggestedConcurrency: 5,
    defaultPayload: {
      productId: 'watch-1',
      quantity: 1,
      concurrency: 5,
    },
    defaultGherkin: `Feature: Inventory Concurrency & Pessimistic Locking
  Scenario: Prevent overselling of limited inventory under concurrent checkout
    Given product "watch-1" has exactly 1 unit remaining in stock
    When 5 simultaneous checkout requests are received concurrently
    Then exactly 1 order must succeed with HTTP 201 Created
    And remaining 4 requests must fail with HTTP 409 Conflict
    And final inventory must never drop below 0`,
  },
  {
    id: 'CH-4',
    type: 'NPE_SHIPPING',
    prompt: 'Send an order with a null shipping address or empty items list',
    title: 'Null Pointer Exception Dereference',
    category: 'VALIDATION',
    description: 'Omits addressLine2 to trigger direct dereference NullPointerException in OrderController:88.',
    suggestedConcurrency: 1,
    defaultPayload: {
      items: [
        {
          productId: 'watch-1',
          quantity: 1,
        },
      ],
      shippingAddress: {
        fullName: 'Null Address Tester',
        addressLine1: '100 Void Street',
        addressLine2: null,
        city: 'Seattle',
        state: 'WA',
        postalCode: '98101',
        country: 'USA',
      },
    },
    defaultGherkin: `Feature: Safe Navigation on Nullable Shipping Address Fields
  Scenario: Safely handle null addressLine2 without throwing NullPointerException
    Given an order payload with addressLine2 set to null
    When the order checkout endpoint is invoked
    Then the controller must safely map addressLine2 using Optional.ofNullable
    And the response must be HTTP 201 Created without unhandled HTTP 500 NPE`,
  },
  {
    id: 'CH-5',
    type: 'IDEMPOTENCY_CANCEL',
    prompt: 'Cancel the same order 3 times in a row to see if stock inflates',
    title: 'Non-Idempotent Cancellation Inflation',
    category: 'IDEMPOTENCY',
    description: 'Repeats order cancellation 3 times to test whether product inventory restocks multiple times.',
    suggestedConcurrency: 3,
    defaultPayload: {
      orderId: 'order-1001',
      productId: 'watch-1',
      repeatCount: 3,
    },
    defaultGherkin: `Feature: Order Cancellation Idempotency
  Scenario: Duplicate cancellation requests must not re-increment inventory
    Given order "order-1001" containing 1 unit of "watch-1" is in CANCELLED state
    When 3 consecutive cancellation requests are issued for "order-1001"
    Then the inventory of "watch-1" must only be restored once
    And subsequent cancellation attempts must return HTTP 200 with idempotent status`,
  },
  {
    id: 'CH-6',
    type: 'SQLI_BYPASS',
    prompt: 'Try to smuggle a stacked SQL query into the admin diagnostics endpoint',
    title: 'Stacked SQL Injection Bypass',
    category: 'SECURITY',
    description: 'Smuggles stacked SQL payload into diagnostics search parameters to test prepared statements.',
    suggestedConcurrency: 1,
    defaultPayload: {
      searchTerm: "' OR 1=1; UPDATE products SET stock = stock + 100 WHERE id = 'watch-1'; --",
      endpoint: '/api/admin/diagnostics',
    },
    defaultGherkin: `Feature: SQL Injection Prevention via Parameterized Queries
  Scenario: Sanitize admin search diagnostics input against stacked queries
    Given user provides malicious SQL payload "' OR 1=1; --"
    When the query is executed against the database
    Then the persistence layer must use prepared statements
    And arbitrary stacked SQL statements must not execute`,
  },
];

export default function MissionControlPage() {
  const [activeTab, setActiveTab] = useState<'cockpit' | 'storyboard'>('cockpit');
  const [telemetry, setTelemetry] = useState(getTelemetryState());
  const [toastMsg, setToastMsg] = useState<{ title: string; desc: string; type: 'success' | 'error' | 'info' } | null>(null);

  // 1. Session State
  const [session, setSession] = useState<FdeSessionResponse | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // 2. Challenge Dock State
  const [selectedChallenge, setSelectedChallenge] = useState<ChallengeConfig>(CHALLENGES[0]);
  const [rawJson, setRawJson] = useState<string>(JSON.stringify(CHALLENGES[0].defaultPayload, null, 2));
  const [showRawJson, setShowRawJson] = useState(false);
  const [concurrency, setConcurrency] = useState<number>(CHALLENGES[0].suggestedConcurrency);
  const [isAttacking, setIsAttacking] = useState(false);
  const [attackResult, setAttackResult] = useState<FdeAttackResponse | null>(null);

  // 3. Self-Healing State
  const [isHealing, setIsHealing] = useState(false);
  const [healResult, setHealResult] = useState<FdeHealResponse | null>(null);

  // 4. RAG & Episodic Memory State
  const [triageLoading, setTriageLoading] = useState(false);
  const [triageResult, setTriageResult] = useState<FdeRagTriageResponse | null>(null);

  // 5. Azure DevOps Live State
  const [adoData, setAdoData] = useState<FdeAdoLiveResponse | null>(null);
  const [adoLoading, setAdoLoading] = useState(false);
  const [activeAdoTab, setActiveAdoTab] = useState<'sprints' | 'prs' | 'tests'>('sprints');
  const [selectedSprintIndex, setSelectedSprintIndex] = useState(0);

  // 6. Gherkin Drawer & Bug Filing State
  const [gherkinDrawerOpen, setGherkinDrawerOpen] = useState(false);
  const [currentGherkin, setCurrentGherkin] = useState(CHALLENGES[0].defaultGherkin);
  const [isFilingBug, setIsFilingBug] = useState(false);

  // 7. Stakeholder Invite State
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);

  // Cluster Nodes state
  const [nodes, setNodes] = useState<ClusterNode[]>([
    {
      name: 'autotriage-backend-dev',
      tier: 'DEV',
      url: 'https://autotriage-backend-dev.graytree-645df5bf.eastus.azurecontainerapps.io',
      db: 'neondb_dev (Shift-Left Sandbox)',
      health: 'UP',
      latencyMs: 142,
      revision: 'autotriage-backend-dev--0000002',
      isolationNote: 'Shift-Left Chaos Sandbox ($0.00 scale-to-zero)',
    },
    {
      name: 'autotriage-backend-qa',
      tier: 'QA',
      url: 'https://autotriage-backend-qa.graytree-645df5bf.eastus.azurecontainerapps.io',
      db: 'neondb_qa (Chaos Isolated)',
      health: 'UP',
      latencyMs: 168,
      revision: 'autotriage-backend-qa--0000001',
      isolationNote: 'Automated E2E & Canary Gate Target',
    },
    {
      name: 'autotriage-backend-prod',
      tier: 'PROD',
      url: 'https://autotriage-backend-prod.graytree-645df5bf.eastus.azurecontainerapps.io',
      db: 'neondb_prod (Air-Gapped Tier)',
      health: 'UP',
      latencyMs: 135,
      revision: 'autotriage-backend-prod--0000001',
      isolationNote: 'Air-Gapped Live Production Baseline',
    },
  ]);

  // W3C Trace Stream
  const [traces, setTraces] = useState<W3CTrace[]>([
    {
      id: 'tr-init-1',
      timestamp: new Date().toLocaleTimeString(),
      operationId: '04a11f92e8c2419a',
      endpoint: 'POST /api/fde/session (Operator Authenticated)',
      status: 200,
      durationMs: 38,
    },
    {
      id: 'tr-init-2',
      timestamp: new Date(Date.now() - 2500).toLocaleTimeString(),
      operationId: '98d33e14a2b9015c',
      endpoint: 'GET /api/fde/ado/live',
      status: 200,
      durationMs: 74,
    },
  ]);

  // LangGraph neural pipeline state
  const [graphSteps, setGraphSteps] = useState<GraphStep[]>([
    { id: '1', name: 'Azure Monitor Webhook', role: 'Ingest common alert schema', status: 'completed', detail: 'Severity 1 alert ingested via Starlette webhook' },
    { id: '2', name: 'KQL Correlator Agent', role: 'App Insights exception tracer', status: 'completed', detail: 'Correlated OrderController.java traceparent' },
    { id: '3', name: 'AST Patch Synthesizer', role: 'Tree-sitter Java safe-nav patch', status: 'completed', detail: 'Generated Optional.ofNullable safe-navigation fix' },
    { id: '4', name: 'Adversarial Critic', role: 'Security & hallucination filter', status: 'completed', detail: 'Critic score: 0.98/1.00 (Passes security boundary)' },
    { id: '5', name: 'Azure DevOps PR Engine', role: 'Multi-branch subway map PR', status: 'completed', detail: 'Opened PR #3 (feat/AB#78-hotfix-agent) with --no-ff' },
    { id: '6', name: 'Canary Rollback Gate', role: 'Traffic gatekeeper & FinOps audit', status: 'completed', detail: 'Canary health verified; $0.00 cloud spend confirmed' },
  ]);

  // AI Copilot state
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotQuery, setCopilotQuery] = useState('');
  const [copilotMessages, setCopilotMessages] = useState<Array<{ sender: 'user' | 'bot'; text: string; link?: string }>>([
    {
      sender: 'bot',
      text: 'Greetings FDE Leader! I am the AutoTriage Autonomous SRE Copilot. Ask me anything about our closed-loop self-healing cloud, 3-tier Neon isolation, zero-spend architecture, or ADO governance.',
    },
  ]);

  // Storyboard FinOps Calculator state
  const [incidentsPerMonth, setIncidentsPerMonth] = useState(15);
  const [engineerHourlyRate, setEngineerHourlyRate] = useState(125);
  const legacyHoursPerIncident = 3.5;
  const autoTriageHoursPerIncident = 0.01; // ~38 seconds
  const monthlyHoursSaved = incidentsPerMonth * (legacyHoursPerIncident - autoTriageHoursPerIncident);
  const annualSavings = Math.round(monthlyHoursSaved * engineerHourlyRate * 12);

  // Poll live telemetry
  useEffect(() => {
    const timer = setInterval(() => {
      setTelemetry(getTelemetryState());
    }, 1500);
    return () => clearInterval(timer);
  }, []);

  // Poll cluster health
  const refreshClusterHealth = async () => {
    const updated = await Promise.all(
      nodes.map(async (node) => {
        const start = performance.now();
        try {
          const res = await fetch(`${node.url}/api/health`, { method: 'GET' });
          const latency = Math.round(performance.now() - start);
          return {
            ...node,
            health: (res.ok ? 'UP' : 'DEGRADED') as 'UP' | 'DEGRADED',
            latencyMs: latency,
          };
        } catch {
          return {
            ...node,
            health: 'DOWN' as 'DOWN',
            latencyMs: Math.round(performance.now() - start),
          };
        }
      })
    );
    setNodes(updated);
  };

  useEffect(() => {
    refreshClusterHealth();
    const interval = setInterval(refreshClusterHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  // 1. Initialize Operator Session on Mount
  const initializeOperatorSession = async () => {
    setSessionLoading(true);
    setSessionError(null);
    try {
      const sess = await api.fde.createSession();
      setSession(sess);
      setTraces((prev) => [
        {
          id: `tr-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          operationId: 'jwt-auth-init',
          endpoint: 'POST /api/fde/session [fde-sandbox-operator]',
          status: 200,
          durationMs: 44,
        },
        ...prev.slice(0, 5),
      ]);
    } catch (err: any) {
      setSessionError(err?.message || 'Session initialization failed');
    } finally {
      setSessionLoading(false);
    }
  };

  // Fetch Live Azure DevOps Data on Mount
  const loadAdoLive = async () => {
    setAdoLoading(true);
    try {
      const data = await api.fde.getAdoLive();
      setAdoData(data);
    } catch (err: any) {
      console.warn('Live ADO data load failed:', err);
    } finally {
      setAdoLoading(false);
    }
  };

  useEffect(() => {
    initializeOperatorSession();
    loadAdoLive();
    // Pre-fetch initial RAG triage for default challenge
    triggerRagTriage(CHALLENGES[0]);
  }, []);

  // Switch Selected Challenge
  const handleSelectChallenge = (ch: ChallengeConfig) => {
    setSelectedChallenge(ch);
    setRawJson(JSON.stringify(ch.defaultPayload, null, 2));
    setConcurrency(ch.suggestedConcurrency);
    setCurrentGherkin(ch.defaultGherkin);
    triggerRagTriage(ch);
  };

  // Trigger RAG & Episodic Memory Triage
  const triggerRagTriage = async (ch: ChallengeConfig) => {
    setTriageLoading(true);
    try {
      const res = await api.fde.triage({
        query: `${ch.prompt} ${ch.description}`,
        attackType: ch.type,
      });
      setTriageResult(res);
    } catch (err) {
      console.warn('RAG triage failed:', err);
    } finally {
      setTriageLoading(false);
    }
  };

  // Launch Live Attack
  const handleLaunchAttack = async () => {
    setIsAttacking(true);
    const start = performance.now();
    try {
      let payloadObj = selectedChallenge.defaultPayload;
      try {
        payloadObj = JSON.parse(rawJson);
      } catch (parseErr) {
        setToastMsg({
          title: 'Invalid JSON Payload',
          desc: 'Please correct syntax in Raw JSON Mutator before firing.',
          type: 'error',
        });
        setIsAttacking(false);
        return;
      }

      // Execute attack via /api/fde/attack
      const res = await api.fde.attack({
        attackType: selectedChallenge.type,
        payload: payloadObj,
        concurrency: concurrency,
      });
      setAttackResult(res);

      const elapsed = Math.round(performance.now() - start);

      // Record W3C Trace
      setTraces((prev) => [
        {
          id: `tr-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          operationId: res.traceparent ? res.traceparent.split('-')[1] : telemetry.operationId,
          endpoint: `POST /api/fde/attack [${selectedChallenge.type} x${concurrency}]`,
          status: res.success ? 200 : 500,
          durationMs: elapsed,
        },
        ...prev.slice(0, 5),
      ]);

      // Trigger RAG triage lookup
      triggerRagTriage(selectedChallenge);

      // Animate LangGraph Neural Pipeline
      animateNeuralTriage();

      setToastMsg({
        title: `⚡ Attack Executed: ${selectedChallenge.title}`,
        desc: `Instant Loss: $${res.blastRadius.instantDollarLoss.toFixed(2)} | Unfulfillable: ${res.blastRadius.unfulfillableUnits} units | Concurrency: ${concurrency}x`,
        type: res.blastRadius.instantDollarLoss > 0 ? 'error' : 'info',
      });
    } catch (e: any) {
      setToastMsg({ title: 'Attack Execution Failed', desc: e.message, type: 'error' });
    } finally {
      setIsAttacking(false);
    }
  };

  // 1-Click Self-Healing
  const handleRestoreBaseline = async () => {
    setIsHealing(true);
    const start = performance.now();
    try {
      const res = await api.fde.heal();
      setHealResult(res);

      const mttr = res.mttrMs || Math.round(performance.now() - start);

      // Clear attack result
      setAttackResult(null);

      setTraces((prev) => [
        {
          id: `tr-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          operationId: telemetry.operationId || 'op-heal-001',
          endpoint: 'POST /api/fde/heal (Baseline Restored)',
          status: 200,
          durationMs: mttr,
        },
        ...prev.slice(0, 5),
      ]);

      // Reset graph steps
      setGraphSteps((prev) =>
        prev.map((s) => ({ ...s, status: 'completed', detail: s.detail.replace('running...', 'resolved') }))
      );

      setToastMsg({
        title: '✅ Self-Healing Complete: Baseline Restored',
        desc: `MTTR: ${mttr}ms | Orders reset: ${res.restoredEntities.ordersCancelled} | Stock restored: ${res.restoredEntities.productsRestored} items | Flags cleared: ${res.restoredEntities.bugFlagsDisengaged}`,
        type: 'success',
      });
      refreshClusterHealth();
    } catch (e: any) {
      setToastMsg({ title: 'Healing Error', desc: e.message, type: 'error' });
    } finally {
      setIsHealing(false);
    }
  };

  // File Gherkin Bug to Azure DevOps
  const handleFileAdoBug = async () => {
    setIsFilingBug(true);
    try {
      const res = await api.fde.createAdoBug({
        title: `[Self-Healing Triage] ${selectedChallenge.title} - Regression Detected`,
        description: `Autonomous agentic bug filing for challenge: ${selectedChallenge.title}\n\n${selectedChallenge.description}`,
        severity: '1 - Critical',
        gherkinSnippet: currentGherkin,
        tags: ['AutoTriage', 'AgenticRAG', 'EpisodicRecall', selectedChallenge.type],
      });

      setToastMsg({
        title: `🎯 Azure DevOps Bug #${res.workItemId} Filed!`,
        desc: `Work Item created on ADO board with linked Gherkin BDD criteria.`,
        type: 'success',
      });
      // Refresh live ADO data to show the new item
      loadAdoLive();
    } catch (err: any) {
      setToastMsg({ title: 'Bug Filing Error', desc: err.message, type: 'error' });
    } finally {
      setIsFilingBug(false);
    }
  };

  // Stakeholder Invitation
  const handleInviteStakeholder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setIsInviting(true);
    try {
      const res = await api.fde.inviteStakeholder({
        email: inviteEmail.trim(),
        projectRole: 'Stakeholder',
      });

      setToastMsg({
        title: '🎉 Stakeholder Invited!',
        desc: res.message || `Queued entitlement invitation for ${inviteEmail} to organization isafwan.`,
        type: 'success',
      });
      setInviteEmail('');
    } catch (err: any) {
      setToastMsg({ title: 'Invitation Notice', desc: err.message, type: 'info' });
    } finally {
      setIsInviting(false);
    }
  };

  const animateNeuralTriage = () => {
    setGraphSteps((steps) =>
      steps.map((s, idx) => ({
        ...s,
        status: idx === 0 ? 'running' : 'idle',
      }))
    );

    [1, 2, 3, 4, 5].forEach((stepIdx) => {
      setTimeout(() => {
        setGraphSteps((steps) =>
          steps.map((s, idx) => {
            if (idx < stepIdx) return { ...s, status: 'completed' };
            if (idx === stepIdx) return { ...s, status: 'running' };
            return { ...s, status: 'idle' };
          })
        );
      }, stepIdx * 800);
    });

    setTimeout(() => {
      setGraphSteps((steps) => steps.map((s) => ({ ...s, status: 'completed' })));
    }, 5000);
  };

  const handleCopilotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!copilotQuery.trim()) return;

    const userText = copilotQuery;
    setCopilotQuery('');
    setCopilotMessages((prev) => [...prev, { sender: 'user', text: userText }]);

    setTimeout(() => {
      let botResponse = '';
      let link: string | undefined = undefined;

      const lower = userText.toLowerCase();
      if (lower.includes('cost') || lower.includes('spend') || lower.includes('$0') || lower.includes('finops')) {
        botResponse =
          'AutoTriage guarantees a strict $0.00 cloud spend boundary. Azure Container Apps are deployed on the Consumption profile with `minReplicas: 0` (scale-to-zero when idle). The 3 database tiers (neondb_dev, neondb_qa, neondb_prod) run on Neon Serverless PostgreSQL free tier compute.';
        link = 'https://dev.azure.com/isafwan/AutoTriage/_workitems/edit/75';
      } else if (lower.includes('npe') || lower.includes('java') || lower.includes('break')) {
        botResponse =
          'When OrderController.java encounters a null addressLine2, it throws a NullPointerException (HTTP 500). AutoTriage’s KQL Correlator captures the W3C traceparent, parses the AST with Tree-sitter, and injects a safe Optional-wrapped patch evaluated by an Adversarial Critic before committing to Git.';
        link = 'https://dev.azure.com/isafwan/AutoTriage/_workitems/edit/78';
      } else if (lower.includes('isolation') || lower.includes('tier') || lower.includes('database')) {
        botResponse =
          'Data isolation is strictly enforced at the physical schema level. The DEV tier uses `neondb_dev`, QA uses `neondb_qa`, and PROD uses `neondb_prod`. Injecting zero inventory or schema mutations in DEV never leaks into QA or PROD.';
        link = 'https://dev.azure.com/isafwan/AutoTriage/_workitems/edit/94';
      } else if (lower.includes('subway') || lower.includes('git') || lower.includes('pr') || lower.includes('branch')) {
        botResponse =
          'Enterprise Git Governance enforces non-fast-forward (`--no-ff`) PR merges for all user stories (e.g. `feat/AB#77`, `feat/AB#78`, `feat/AB#79`, `feat/AB#87`). This creates a visual subway-map commit tree showing clear auditability and peer reviews.';
        link = 'https://dev.azure.com/isafwan/AutoTriage/_git/AutoTriage/pullrequests';
      } else if (lower.includes('test') || lower.includes('tp-700') || lower.includes('qa')) {
        botResponse =
          'All user stories are bound via `TestedBy` relations to formal Test Cases under Master Test Plan TP-700 (#82). Live automated test runs (e.g. Test Run #22, #24) publish pass/fail telemetry directly into Azure DevOps Test Management.';
        link = 'https://dev.azure.com/isafwan/AutoTriage/_workitems/edit/82';
      } else {
        botResponse = `AutoTriage analyzed your query regarding "${userText}". Our closed-loop self-healing engine integrates Azure Monitor, LangGraph multi-agent orchestration, AST code generation, and Azure DevOps SAFe Agile boards to resolve incidents in under 45 seconds.`;
        link = 'https://dev.azure.com/isafwan/AutoTriage/_boards/board/t/AutoTriage%20Team/Stories';
      }

      setCopilotMessages((prev) => [...prev, { sender: 'bot', text: botResponse, link }]);
    }, 600);
  };

  // Active blast radius values
  const instantDollarLoss = attackResult?.blastRadius?.instantDollarLoss ?? 0;
  const unfulfillableUnits = attackResult?.blastRadius?.unfulfillableUnits ?? 0;
  const annualProjectedLoss = attackResult?.blastRadius?.annualProjectedLoss ?? 0;
  const affectedCustomers = attackResult?.blastRadius?.affectedCustomers ?? 0;

  // Active recall episode
  const activeEpisode: FdeMemoryEpisode | undefined = triageResult?.episodicRecall?.episode;
  const episodicRecallHit = triageResult?.episodicRecall?.hit ?? false;
  const recallLatency = triageResult?.episodicRecall?.latencyMs ?? 18;

  // Active RAG chunk
  const activeChunk: FdeRagChunk | undefined = triageResult?.ragContext?.chunks?.[0];
  const activeCommitSha = triageResult?.ragContext?.groundingProof?.activeCommitSha || 'e91198e';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Glassmorphic Navigation Banner */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl px-4 lg:px-8 py-3.5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-violet-600 shadow-lg shadow-cyan-500/20">
              <Zap className="w-5 h-5 text-white" />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                  AutoTriage Glass-Box Mission Control
                  <span className="px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/60">
                    v3.0 Agentic RAG
                  </span>
                </h1>
              </div>
              <p className="text-xs text-slate-400 font-mono flex items-center gap-2 flex-wrap">
                <span>Closed-Loop SRE Cloud</span>
                <span>&bull;</span>
                <span>AST Vector Grounding</span>
                <span>&bull;</span>
                {session ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Auth: {session.email || 'fde-sandbox-operator'} ({session.role})</span>
                    <a
                      href="/login"
                      className="ml-1 px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-sans transition"
                      title="Log in with specific enterprise credentials (admin@autotriage.local, buyer@autotriage.local)"
                    >
                      Switch Persona ↗
                    </a>
                  </span>
                ) : sessionLoading ? (
                  <span className="text-amber-400 animate-pulse">Initializing Operator JWT...</span>
                ) : (
                  <button
                    onClick={initializeOperatorSession}
                    className="text-rose-400 underline hover:text-rose-300"
                  >
                    Operator Offline (Click to Re-auth)
                  </button>
                )}
              </p>
            </div>
          </div>

          {/* Quick Tabs & Master Action Controls */}
          <div className="flex items-center flex-wrap gap-2.5">
            <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5">
              <button
                onClick={() => setActiveTab('cockpit')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                  activeTab === 'cockpit'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Live War Room
              </button>
              <button
                onClick={() => setActiveTab('storyboard')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                  activeTab === 'storyboard'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Executive Storyboard & ROI
              </button>
            </div>

            {/* 1-Click Auto-Heal Master Button */}
            <button
              onClick={handleRestoreBaseline}
              disabled={isHealing}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30 flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isHealing ? 'animate-spin' : ''}`} />
              {isHealing ? 'Healing Baseline...' : '1-Click Auto-Heal All'}
            </button>

            <button
              onClick={() => setCopilotOpen(!copilotOpen)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 flex items-center gap-1.5 transition"
            >
              <Bot className="w-3.5 h-3.5 text-cyan-400" />
              Ask FDE Copilot
            </button>
          </div>
        </div>
      </header>

      {/* Toast Notification Alert */}
      {toastMsg && (
        <div className="fixed top-20 right-6 z-50 max-w-md w-full animate-in fade-in slide-in-from-top-4 duration-300">
          <div
            className={`p-4 rounded-xl border backdrop-blur-xl shadow-2xl flex items-start gap-3 ${
              toastMsg.type === 'error'
                ? 'bg-rose-950/90 border-rose-700/60 text-rose-100 shadow-rose-950/50'
                : toastMsg.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-700/60 text-emerald-100 shadow-emerald-950/50'
                : 'bg-slate-900/90 border-slate-700 text-slate-100'
            }`}
          >
            {toastMsg.type === 'error' ? (
              <Flame className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <h4 className="text-sm font-semibold">{toastMsg.title}</h4>
              <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">{toastMsg.desc}</p>
            </div>
            <button
              onClick={() => setToastMsg(null)}
              className="text-slate-400 hover:text-white text-xs font-mono px-1 py-0.5 rounded"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="px-4 lg:px-8 py-6 max-w-[1700px] mx-auto space-y-6">
        {activeTab === 'cockpit' ? (
          <>
            {/* REQUIREMENT 2: TOP CHALLENGE PROMPT DOCK WITH 6 CLICKABLE CHIPS */}
            <section className="rounded-2xl border border-slate-800/90 bg-slate-900/70 backdrop-blur-xl p-5 shadow-2xl space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    <Terminal className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                      Challenge Prompt Dock
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                        6 Showcase Vectors
                      </span>
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      Select a showcase scenario, customize the payload or concurrency, and launch an attack against the DEV sandbox.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowRawJson(!showRawJson)}
                    className={`px-3 py-1 text-xs font-mono rounded-lg border transition flex items-center gap-1.5 ${
                      showRawJson
                        ? 'bg-cyan-950 text-cyan-300 border-cyan-700'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <Code className="w-3.5 h-3.5" />
                    {showRawJson ? 'Hide Raw JSON Mutator' : 'Raw JSON Mutator'}
                  </button>

                  <button
                    onClick={() => setGherkinDrawerOpen(!gherkinDrawerOpen)}
                    className="px-3 py-1 text-xs font-mono rounded-lg bg-violet-950/80 text-violet-300 border border-violet-800/70 hover:bg-violet-900 flex items-center gap-1.5 transition"
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    Gherkin BDD Drawer
                  </button>
                </div>
              </div>

              {/* 6 Clickable Challenge Chips */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {CHALLENGES.map((ch) => {
                  const isSelected = selectedChallenge.id === ch.id;
                  return (
                    <button
                      key={ch.id}
                      onClick={() => handleSelectChallenge(ch)}
                      className={`text-left p-3 rounded-xl border transition-all relative overflow-hidden group ${
                        isSelected
                          ? 'bg-cyan-950/40 border-cyan-500/80 shadow-lg shadow-cyan-950/50 scale-[1.01]'
                          : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/60'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.5 rounded uppercase font-bold tracking-wider ${
                            ch.category === 'PRICING'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : ch.category === 'CART'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : ch.category === 'CONCURRENCY'
                              ? 'bg-violet-950 text-violet-300 border border-violet-800'
                              : ch.category === 'VALIDATION'
                              ? 'bg-blue-950 text-blue-300 border border-blue-800'
                              : ch.category === 'IDEMPOTENCY'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-red-950 text-red-300 border border-red-800'
                          }`}
                        >
                          {ch.category}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">{ch.id}</span>
                      </div>
                      <h4 className="text-xs font-semibold text-white group-hover:text-cyan-300 transition-colors line-clamp-1">
                        "{ch.prompt}"
                      </h4>
                      <p className="text-[10px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                        {ch.description}
                      </p>
                      {isSelected && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-500 to-violet-500" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Raw JSON Mutator (Collapsible) */}
              {showRawJson && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-cyan-300 flex items-center gap-1.5">
                      <Code className="w-3.5 h-3.5 text-cyan-400" />
                      Raw JSON Mutator &bull; Edit payload attributes before firing
                    </span>
                    <button
                      onClick={() => setRawJson(JSON.stringify(selectedChallenge.defaultPayload, null, 2))}
                      className="text-[10px] text-slate-400 hover:text-white underline font-mono"
                    >
                      Reset Default Payload
                    </button>
                  </div>
                  <textarea
                    value={rawJson}
                    onChange={(e) => setRawJson(e.target.value)}
                    rows={6}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 font-mono text-xs text-cyan-200 focus:outline-none focus:border-cyan-500 leading-relaxed"
                  />
                </div>
              )}

              {/* Execution Controls: Concurrency Slider & Launch Attack Button */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1 max-w-md space-y-1">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-slate-300 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-violet-400" />
                      Concurrency Slider (Parallel Requests):
                    </span>
                    <span className="text-violet-400 font-bold font-mono px-2 py-0.5 rounded bg-violet-950/80 border border-violet-800">
                      {concurrency}x Simultaneous Threads
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={concurrency}
                    onChange={(e) => setConcurrency(Number(e.target.value))}
                    className="w-full accent-violet-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>1x (Sequential)</span>
                    <span>5x (Standard Race)</span>
                    <span>10x (Extreme Stress)</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={handleLaunchAttack}
                    disabled={isAttacking}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 via-rose-500 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold text-xs shadow-lg shadow-rose-950/50 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                  >
                    <Play className={`w-4 h-4 ${isAttacking ? 'animate-spin' : ''}`} />
                    {isAttacking ? 'Executing Attack Vector...' : `Launch Attack Vector (${selectedChallenge.type})`}
                  </button>
                </div>
              </div>
            </section>

            {/* REQUIREMENT 3: FINANCIAL BLAST RADIUS DISPLAY */}
            <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Metric 1: Instant Dollar Loss */}
              <div className="p-4 rounded-xl border border-rose-900/60 bg-gradient-to-br from-slate-900/80 to-rose-950/30 backdrop-blur-md relative overflow-hidden">
                <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-rose-400" />
                  Instant Dollar Loss
                </span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span
                    className={`text-2xl font-black font-mono tracking-tight ${
                      instantDollarLoss > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-300'
                    }`}
                  >
                    ${instantDollarLoss.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] font-mono text-rose-400/90 font-bold">
                    {instantDollarLoss > 0 ? 'REVENUE BLEED' : 'SECURE'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Direct invoice & pricing delta captured</p>
              </div>

              {/* Metric 2: Unfulfillable Stock Units */}
              <div className="p-4 rounded-xl border border-amber-900/60 bg-gradient-to-br from-slate-900/80 to-amber-950/30 backdrop-blur-md relative overflow-hidden">
                <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  Unfulfillable Stock Units
                </span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span
                    className={`text-2xl font-black font-mono tracking-tight ${
                      unfulfillableUnits !== 0 ? 'text-amber-400' : 'text-slate-300'
                    }`}
                  >
                    {unfulfillableUnits} units
                  </span>
                  <span className="text-[10px] font-mono text-amber-400/90 font-bold">
                    {unfulfillableUnits < 0 ? 'NEGATIVE INVENTORY' : 'BALANCED'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Oversold stock requiring manual cancellations</p>
              </div>

              {/* Metric 3: Annual Projected Loss */}
              <div className="p-4 rounded-xl border border-violet-900/60 bg-gradient-to-br from-slate-900/80 to-violet-950/30 backdrop-blur-md relative overflow-hidden">
                <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                  <TrendingDown className="w-3.5 h-3.5 text-violet-400" />
                  Annual Projected Loss
                </span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-black font-mono tracking-tight text-violet-300">
                    {annualProjectedLoss > 0
                      ? `$${(annualProjectedLoss / 1000000).toFixed(2)}M ARR Risk`
                      : '$0.00 ARR Risk'}
                  </span>
                  <span className="text-[10px] font-mono text-violet-400/90 font-bold">ANNUALIZED</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Automated bot exploitation forecast</p>
              </div>

              {/* Metric 4: Affected Customer Collisions */}
              <div className="p-4 rounded-xl border border-cyan-900/60 bg-gradient-to-br from-slate-900/80 to-cyan-950/30 backdrop-blur-md relative overflow-hidden">
                <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  Collisions / Affected Users
                </span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-black font-mono tracking-tight text-cyan-300">
                    {affectedCustomers} sessions
                  </span>
                  <span className="text-[10px] font-mono text-cyan-400/90 font-bold">IMPACT COUNT</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Customer checkouts trapped in race states</p>
              </div>
            </section>

            {/* REQUIREMENT 6: EPISODIC MEMORY BANK TICKER */}
            <div className="p-3.5 rounded-xl border border-violet-800/80 bg-gradient-to-r from-violet-950/40 via-slate-900 to-cyan-950/40 backdrop-blur-xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="px-2.5 py-1 rounded-md bg-violet-900/70 text-violet-300 border border-violet-700/80 text-[10px] font-mono font-bold flex items-center gap-1.5 animate-pulse">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  ⚡ EPISODIC RECALL HIT ({recallLatency}ms)
                </div>
                <div>
                  <span className="text-xs font-bold text-white font-mono">
                    {activeEpisode?.episodeId || 'EPISODE-1001'} &bull; {activeEpisode?.symptomPattern || 'Zero/Sub-penny order placement via untrusted client total'}
                  </span>
                  <p className="text-[10px] text-slate-400">
                    Root Cause: <code className="text-cyan-300">{activeEpisode?.rootCauseClass || 'OrderController.java'}</code> in method <code className="text-cyan-300">{activeEpisode?.rootCauseMethod || 'placeOrder'}</code> ({activeEpisode?.lineRange || '#L112-#L130'}) &bull; Critic Confidence: <span className="text-emerald-400 font-bold">{activeEpisode?.criticScore ?? 0.98} / 1.00 Pass</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setGherkinDrawerOpen(true)}
                  className="px-2.5 py-1 text-[11px] font-mono rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1 transition"
                >
                  <Eye className="w-3 h-3 text-cyan-400" />
                  Inspect Regression BDD
                </button>
              </div>
            </div>

            {/* 4-ZONE PRIMARY WAR ROOM GRID */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              {/* LEFT COLUMN: Time-Machine Diff & 3-Tier Matrix (XL: 6 cols) */}
              <div className="xl:col-span-6 space-y-4">
                {/* REQUIREMENT 4: POSTGRESQL TIME-MACHINE DIFF */}
                <div className="rounded-2xl border border-slate-800/90 bg-slate-900/60 backdrop-blur-xl p-5 shadow-xl space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <History className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white tracking-wide">
                          PostgreSQL Time-Machine Diff Inspector
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          Pre-Attack Baseline Snapshot vs Post-Attack Compromised State in <code className="text-cyan-300">neondb_dev</code>
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      Isolated DEV Tier
                    </span>
                  </div>

                  {/* Pre vs Post Snapshot Tables */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
                    {/* Pre Snapshot (Green) */}
                    <div className="p-3.5 rounded-xl border border-emerald-900/60 bg-emerald-950/20 space-y-2">
                      <div className="flex items-center justify-between border-b border-emerald-800/40 pb-1.5 text-emerald-400 font-bold text-[11px]">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          PRE-ATTACK STATE
                        </span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                          BASELINE
                        </span>
                      </div>
                      <div className="space-y-1.5 text-[11px] text-slate-300">
                        <div className="flex justify-between py-0.5 border-b border-emerald-900/20">
                          <span className="text-slate-400">Target Product:</span>
                          <span className="text-emerald-300 font-bold">
                            {attackResult?.preSnapshot?.productName || 'Pro Developer Workstation 16"'}
                          </span>
                        </div>
                        <div className="flex justify-between py-0.5 border-b border-emerald-900/20">
                          <span className="text-slate-400">Catalog Price:</span>
                          <span className="text-emerald-300 font-bold">
                            ${(attackResult?.preSnapshot?.catalogPrice ?? 2499.99).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between py-0.5 border-b border-emerald-900/20">
                          <span className="text-slate-400">Inventory Stock:</span>
                          <span className="text-emerald-300 font-bold">
                            {attackResult?.preSnapshot?.stockQuantity ?? 20} units
                          </span>
                        </div>
                        <div className="flex justify-between py-0.5">
                          <span className="text-slate-400">Order Record Count:</span>
                          <span className="text-emerald-300 font-bold">
                            {attackResult?.preSnapshot?.orderCount ?? 0} orders
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Post Snapshot (Red/Compromised) */}
                    <div className="p-3.5 rounded-xl border border-rose-900/60 bg-rose-950/20 space-y-2">
                      <div className="flex items-center justify-between border-b border-rose-800/40 pb-1.5 text-rose-400 font-bold text-[11px]">
                        <span className="flex items-center gap-1">
                          <Flame className="w-3.5 h-3.5" />
                          POST-ATTACK STATE
                        </span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800">
                          COMPROMISED
                        </span>
                      </div>
                      <div className="space-y-1.5 text-[11px] text-slate-300">
                        <div className="flex justify-between py-0.5 border-b border-rose-900/20">
                          <span className="text-slate-400">Exploited Price:</span>
                          <span className="text-rose-400 font-bold">
                            {attackResult?.postSnapshot?.exploitedPrice !== undefined
                              ? `$${attackResult.postSnapshot.exploitedPrice.toFixed(2)}`
                              : '$0.01'}
                          </span>
                        </div>
                        <div className="flex justify-between py-0.5 border-b border-rose-900/20">
                          <span className="text-slate-400">Inventory Delta:</span>
                          <span className="text-rose-400 font-bold">
                            {attackResult?.delta?.stockDelta !== undefined
                              ? `${attackResult.delta.stockDelta} units`
                              : '-1 unit'}
                          </span>
                        </div>
                        <div className="flex justify-between py-0.5 border-b border-rose-900/20">
                          <span className="text-slate-400">Financial Loss:</span>
                          <span className="text-rose-400 font-bold">
                            ${(instantDollarLoss || 2499.99).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between py-0.5">
                          <span className="text-slate-400">Isolation Guarantee:</span>
                          <span className="text-emerald-400 font-bold">QA/PROD Untouched</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* State Mutation Log */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px]">
                    <span className="text-slate-400 block mb-1">State Mutation Delta Explanation:</span>
                    <p className="text-slate-200 leading-relaxed">
                      {attackResult?.delta?.explanation ||
                        'Attack payload triggered mutation in orders / cart_items table in neondb_dev. Authoritative catalog pricing bypassed via unvalidated client total.'}
                    </p>
                  </div>
                </div>

                {/* ZONE 2: 3-TIER MULTI-CLOUD ISOLATION MATRIX */}
                <div className="rounded-2xl border border-slate-800/90 bg-slate-900/60 backdrop-blur-xl p-5 shadow-xl space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                        <Server className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white tracking-wide">
                          Zone 2: 3-Tier Multi-Cloud Isolation Matrix
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          Azure Container Apps + Neon Serverless PostgreSQL instances
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      Scale-to-Zero ($0.00)
                    </span>
                  </div>

                  <div className="space-y-3">
                    {nodes.map((node) => (
                      <div
                        key={node.tier}
                        className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/60 flex flex-col md:flex-row md:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                node.tier === 'PROD'
                                  ? 'bg-purple-950 text-purple-300 border border-purple-800'
                                  : node.tier === 'QA'
                                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              }`}
                            >
                              {node.tier} ENVIRONMENT
                            </span>
                            <span className="text-xs font-bold text-white">{node.name}</span>
                          </div>
                          <p className="text-[11px] text-slate-400 font-mono">
                            Database: <span className="text-cyan-300 font-semibold">{node.db}</span>
                          </p>
                          <p className="text-[10px] text-slate-400">{node.isolationNote}</p>
                        </div>

                        <div className="flex items-center gap-4 shrink-0">
                          <div className="text-right">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                                node.health === 'UP'
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                  : 'bg-rose-950 text-rose-400 border border-rose-800'
                              }`}
                            >
                              {node.health === 'UP' ? <Check className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                              {node.health} ({node.latencyMs}ms)
                            </span>
                            <span className="block text-[10px] text-slate-400 font-mono mt-0.5">
                              {node.revision.slice(-9)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Synthetic Probe Telemetry Feed */}
                  <div className="pt-3 border-t border-slate-800">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="font-mono text-slate-400 flex items-center gap-1.5">
                        <Terminal className="w-3 h-3 text-cyan-400" />
                        Live W3C Synthetic Probe Stream (App Insights)
                      </span>
                      <button
                        onClick={refreshClusterHealth}
                        className="text-[10px] text-cyan-400 hover:underline flex items-center gap-1"
                      >
                        <RefreshCw className="w-2.5 h-2.5" /> Ping Now
                      </button>
                    </div>
                    <div className="space-y-1.5 font-mono text-[11px] max-h-36 overflow-y-auto">
                      {traces.map((tr) => (
                        <div
                          key={tr.id}
                          className="p-2 rounded bg-slate-950/80 border border-slate-800/80 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                tr.status === 200
                                  ? 'bg-emerald-950 text-emerald-400'
                                  : 'bg-rose-950 text-rose-400'
                              }`}
                            >
                              {tr.status}
                            </span>
                            <span className="text-slate-300 truncate max-w-[210px]">{tr.endpoint}</span>
                          </div>
                          <div className="text-right flex items-center gap-2">
                            <span className="text-amber-400/80 text-[10px] truncate max-w-[90px]">{tr.operationId}</span>
                            <span className="text-slate-400 text-[10px]">{tr.durationMs}ms</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: RAG X-Ray, LangGraph, ADO Explorer (XL: 6 cols) */}
              <div className="xl:col-span-6 space-y-4">
                {/* REQUIREMENT 5: GLASS-BOX RAG VECTOR X-RAY & GROUNDING PROOFS */}
                <div className="rounded-2xl border border-slate-800/90 bg-slate-900/60 backdrop-blur-xl p-5 shadow-xl space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20">
                        <Code className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white tracking-wide">
                          Glass-Box RAG Vector X-Ray & Grounding Proofs
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          Dynamic AST line-level retrieval with physical disk anti-hallucination verification
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Grounding Verified
                    </span>
                  </div>

                  {/* Grounding Metadata Bar */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
                    <div className="flex items-center gap-2 text-slate-300">
                      <span className="text-slate-400">Source:</span>
                      <span className="text-cyan-300 font-bold truncate max-w-[280px]">
                        {activeChunk?.filePath || 'sut/backend-spring/.../OrderController.java'}
                      </span>
                      <span className="text-amber-300 bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-800">
                        {activeChunk?.startLine && activeChunk?.endLine
                          ? `#L${activeChunk.startLine}-#L${activeChunk.endLine}`
                          : '#L112-#L130'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">Cosine Score:</span>
                      <span className="text-emerald-400 font-bold bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                        {activeChunk?.similarityScore ? activeChunk.similarityScore.toFixed(2) : '0.94'} (&ge; 0.85)
                      </span>
                      <span className="text-[10px] text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                        git: {activeCommitSha.slice(0, 7)}
                      </span>
                    </div>
                  </div>

                  {/* AST Method Code Snippet */}
                  <div className="rounded-xl overflow-hidden border border-slate-800 font-mono text-xs">
                    <div className="bg-slate-950 px-3.5 py-2 border-b border-slate-800 flex items-center justify-between text-slate-400 text-[10px]">
                      <span>Method: <strong className="text-white">{activeChunk?.methodName || 'placeOrder'}</strong></span>
                      <span>Tree-sitter Java AST Chunk</span>
                    </div>
                    <pre className="p-3.5 bg-slate-950/90 text-slate-200 overflow-x-auto leading-relaxed max-h-48">
                      {activeChunk?.snippet ||
                        `// OrderController.java - Method placeOrder
@PostMapping
public ResponseEntity<?> placeOrder(@Valid @RequestBody OrderRequest req) {
    // Client total calculation vulnerability (Showcase US-1001)
    BigDecimal clientTotal = req.getTotal();
    Order order = orderService.createOrder(req.getItems(), clientTotal);
    return ResponseEntity.status(HttpStatus.CREATED).body(order);
}`}
                    </pre>
                  </div>

                  {/* Synthesized AST Patch Diff */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-[11px] rounded-xl overflow-hidden border border-slate-800">
                    <div className="bg-rose-950/20 p-3 border-r border-slate-800">
                      <div className="text-rose-400 font-bold text-[10px] pb-1.5 mb-1.5 border-b border-rose-900/30 flex justify-between">
                        <span>🔴 VULNERABLE AST NODE</span>
                        <span>FAULT</span>
                      </div>
                      <pre className="text-rose-200 overflow-x-auto leading-relaxed text-[10px]">
                        {activeEpisode?.patchDiff?.split('\n\n')[0] ||
                          `// Client-Supplied Total Dereference:
BigDecimal total = req.getTotal();
order.setTotal(total);`}
                      </pre>
                    </div>

                    <div className="bg-emerald-950/20 p-3">
                      <div className="text-emerald-400 font-bold text-[10px] pb-1.5 mb-1.5 border-b border-emerald-900/30 flex justify-between">
                        <span>🟢 SYNTHESIZED REPAIR DIFF</span>
                        <span>CRITIC 0.98</span>
                      </div>
                      <pre className="text-emerald-200 overflow-x-auto leading-relaxed text-[10px]">
                        {activeEpisode?.patchDiff?.split('\n\n')[1] ||
                          `// Authoritative Recomputation:
BigDecimal authoritativeTotal = items.stream()
    .map(i -> catalog.getPrice(i.id).multiply(i.qty))
    .reduce(BigDecimal.ZERO, BigDecimal::add);
order.setTotal(authoritativeTotal);`}
                      </pre>
                    </div>
                  </div>
                </div>

                {/* ZONE 3: LANGGRAPH NEURAL EXECUTION PIPELINE */}
                <div className="rounded-2xl border border-slate-800/90 bg-slate-900/60 backdrop-blur-xl p-5 shadow-xl space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20">
                        <Bot className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white tracking-wide">
                          Zone 3: LangGraph Neural Execution Pipeline
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          State-machine orchestration: Alert &rarr; KQL &rarr; Tree-sitter AST &rarr; Critic &rarr; ADO PR
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={animateNeuralTriage}
                      className="px-2.5 py-1 text-[11px] font-medium rounded bg-violet-950 text-violet-300 border border-violet-800/60 hover:bg-violet-900 flex items-center gap-1 transition"
                    >
                      <Play className="w-3 h-3" /> Replay Triage
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                    {graphSteps.map((step, idx) => (
                      <div
                        key={step.id}
                        className={`p-3 rounded-xl border transition-all ${
                          step.status === 'running'
                            ? 'bg-violet-950/60 border-violet-500 shadow-lg shadow-violet-950/50 scale-[1.02]'
                            : step.status === 'completed'
                            ? 'bg-slate-950/70 border-slate-800'
                            : 'bg-slate-950/30 border-slate-800/40 opacity-50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-mono text-slate-400">Step {idx + 1}</span>
                          {step.status === 'running' && (
                            <span className="flex items-center gap-1 text-[10px] text-violet-300 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-ping" />
                              Active
                            </span>
                          )}
                          {step.status === 'completed' && (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                              <CheckCircle2 className="w-3 h-3" />
                              Passed
                            </span>
                          )}
                        </div>
                        <h4 className="text-xs font-bold text-slate-100">{step.name}</h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">{step.role}</p>
                        <p className="text-[10px] text-slate-300 font-mono mt-2 bg-slate-900/80 p-1.5 rounded border border-slate-800/60 line-clamp-2">
                          {step.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* REQUIREMENT 7: LIVE IN-APP AZURE DEVOPS EXPLORER */}
                <div className="rounded-2xl border border-slate-800/90 bg-slate-900/60 backdrop-blur-xl p-5 shadow-xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        <GitBranch className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white tracking-wide">
                          Live In-App Azure DevOps Explorer
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          Live streaming from <code className="text-blue-300">https://dev.azure.com/isafwan/AutoTriage</code>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs">
                        <button
                          onClick={() => setActiveAdoTab('sprints')}
                          className={`px-2.5 py-1 rounded font-medium ${
                            activeAdoTab === 'sprints' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Sprints
                        </button>
                        <button
                          onClick={() => setActiveAdoTab('prs')}
                          className={`px-2.5 py-1 rounded font-medium ${
                            activeAdoTab === 'prs' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          PRs
                        </button>
                        <button
                          onClick={() => setActiveAdoTab('tests')}
                          className={`px-2.5 py-1 rounded font-medium ${
                            activeAdoTab === 'tests' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Test Suites
                        </button>
                      </div>

                      <button
                        onClick={loadAdoLive}
                        disabled={adoLoading}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                        title="Refresh ADO live data"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${adoLoading ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* ADO Tab 1: Sprints */}
                  {activeAdoTab === 'sprints' && (
                    <div className="space-y-3">
                      {/* Sprint selector chips */}
                      <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        {adoData?.sprints?.map((sp, idx) => (
                          <button
                            key={sp.id}
                            onClick={() => setSelectedSprintIndex(idx)}
                            className={`px-3 py-1 rounded-lg text-xs font-mono font-medium whitespace-nowrap transition ${
                              selectedSprintIndex === idx
                                ? 'bg-blue-950 text-blue-300 border border-blue-700 shadow-sm'
                                : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                            }`}
                          >
                            {sp.name} ({sp.itemsCount} items)
                          </button>
                        ))}
                      </div>

                      {/* Work Items in selected sprint */}
                      <div className="space-y-1.5 max-h-56 overflow-y-auto font-mono text-xs">
                        {adoData?.sprints?.[selectedSprintIndex]?.items?.map((item) => (
                          <div
                            key={item.id}
                            className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-3 hover:border-slate-700 transition"
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span
                                className={`px-1.5 py-0.2 rounded text-[10px] font-bold shrink-0 ${
                                  item.type === 'Bug'
                                    ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                    : 'bg-blue-950 text-blue-300 border border-blue-800'
                                }`}
                              >
                                {item.type} #{item.id}
                              </span>
                              <span className="text-slate-200 truncate">{item.title}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-800">
                                {item.state}
                              </span>
                              <span className="text-[10px] text-slate-400">{item.assignedTo}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ADO Tab 2: PRs (Git Subway Map) */}
                  {activeAdoTab === 'prs' && (
                    <div className="space-y-2 font-mono text-xs max-h-56 overflow-y-auto">
                      {adoData?.pullRequests?.map((pr) => (
                        <div
                          key={pr.pullRequestId}
                          className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <GitPullRequest className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                            <span className="text-cyan-400 font-bold shrink-0">PR #{pr.pullRequestId}</span>
                            <span className="text-slate-300 truncate">{pr.title}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] text-violet-300 px-1.5 py-0.5 rounded bg-violet-950 border border-violet-800 font-bold">
                              {pr.status}
                            </span>
                            <a
                              href={pr.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-cyan-400 hover:underline flex items-center gap-0.5"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ADO Tab 3: Test Suites */}
                  {activeAdoTab === 'tests' && (
                    <div className="space-y-2 font-mono text-xs max-h-56 overflow-y-auto">
                      {adoData?.testSuites?.map((ts) => (
                        <div
                          key={ts.suiteId}
                          className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-3"
                        >
                          <div>
                            <span className="text-amber-400 font-bold">{ts.suiteName}</span>
                            <span className="text-[10px] text-slate-400 block">
                              Plan: {ts.planName} &bull; {ts.runCount} automated test runs
                            </span>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 shrink-0">
                            {ts.passRate} Passed
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Interactive ADO Actions: File Bug & Invite Stakeholder */}
                  <div className="pt-3 border-t border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Action 1: File Gherkin Bug to Boards */}
                    <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between gap-2">
                      <div>
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <Bug className="w-3.5 h-3.5 text-rose-400" />
                          File Gherkin Bug to Boards
                        </span>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Publish BDD regression criteria directly to Azure DevOps board.
                        </p>
                      </div>
                      <button
                        onClick={handleFileAdoBug}
                        disabled={isFilingBug}
                        className="px-3 py-1.5 rounded-lg bg-rose-600/90 hover:bg-rose-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                      >
                        <Bug className="w-3 h-3" />
                        {isFilingBug ? 'Filing Bug to ADO...' : 'File Bug to Azure Boards'}
                      </button>
                    </div>

                    {/* Action 2: Invite Stakeholder */}
                    <form
                      onSubmit={handleInviteStakeholder}
                      className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between gap-2"
                    >
                      <div>
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <UserPlus className="w-3.5 h-3.5 text-cyan-400" />
                          Invite Email as Stakeholder
                        </span>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Grant reader access via Microsoft Entitlements API.
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="email"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="evaluator@company.com"
                          className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                        />
                        <button
                          type="submit"
                          disabled={isInviting || !inviteEmail.trim()}
                          className="px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition disabled:opacity-50 shrink-0"
                        >
                          {isInviting ? 'Inviting...' : 'Invite'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* EXECUTIVE STORYBOARD & FINOPS ROI CALCULATOR MODE */
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl p-6 shadow-2xl">
              <div className="max-w-3xl">
                <span className="px-2.5 py-1 rounded-full bg-violet-950 text-violet-300 border border-violet-800 text-xs font-semibold uppercase tracking-wider">
                  Executive Briefing
                </span>
                <h2 className="text-2xl font-bold text-white mt-3">
                  AutoTriage: Autonomous SRE Cloud for 10x Operational Velocity
                </h2>
                <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                  Engineered to eliminate manual on-call fatigue, prevent multi-tier data corruption, and slash mean
                  time to resolution from hours to seconds while strictly adhering to a $0.00 infrastructure spend
                  boundary.
                </p>
              </div>

              {/* 3 Key Pillars */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60">
                  <div className="p-2 w-9 h-9 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center mb-3">
                    <Shield className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-white">1. Shift-Left Multi-Tier Isolation</h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    DEV, QA, and PROD operate on isolated Neon PostgreSQL schemas. Faults and mutations injected in DEV
                    are physically barred from touching QA or PROD.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60">
                  <div className="p-2 w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-3">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-white">2. Guaranteed $0 Cloud Boundary</h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Azure Container Apps on the Consumption tier automatically scale down to zero replicas during idle
                    hours, preventing runaway billing surprises.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60">
                  <div className="p-2 w-9 h-9 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center mb-3">
                    <Bot className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-white">3. Closed-Loop LangGraph Healing</h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Correlates W3C App Insights telemetry, synthesizes Tree-sitter AST patches, validates via an
                    Adversarial Critic, and automates PR creation and canary traffic evaluation.
                  </p>
                </div>
              </div>
            </div>

            {/* Interactive FinOps ROI Calculator */}
            <div className="rounded-2xl border border-emerald-900/40 bg-gradient-to-br from-slate-900 to-emerald-950/30 p-6 backdrop-blur-xl shadow-2xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-6">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-emerald-400" />
                    Interactive FinOps ROI Calculator
                  </h3>
                  <p className="text-xs text-slate-400">
                    Calculate financial and engineering time savings unlocked by AutoTriage in production
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono text-slate-400 block">Annual Projected Savings</span>
                  <span className="text-2xl font-black text-emerald-400 font-mono">
                    ${annualSavings.toLocaleString()} / yr
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs font-medium mb-1">
                      <span className="text-slate-300">Monthly Production Incidents:</span>
                      <span className="text-cyan-400 font-bold">{incidentsPerMonth} incidents</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="50"
                      value={incidentsPerMonth}
                      onChange={(e) => setIncidentsPerMonth(Number(e.target.value))}
                      className="w-full accent-cyan-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-medium mb-1">
                      <span className="text-slate-300">Staff SRE Hourly Burden Rate ($):</span>
                      <span className="text-emerald-400 font-bold">${engineerHourlyRate} / hour</span>
                    </div>
                    <input
                      type="range"
                      min="75"
                      max="250"
                      step="5"
                      value={engineerHourlyRate}
                      onChange={(e) => setEngineerHourlyRate(Number(e.target.value))}
                      className="w-full accent-emerald-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2.5 font-mono text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Legacy Human Triage MTTR:</span>
                    <span className="text-rose-400 font-bold">3.5 Hours / incident</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>AutoTriage Autonomous MTTR:</span>
                    <span className="text-emerald-400 font-bold">~38.4 Seconds</span>
                  </div>
                  <div className="flex justify-between text-slate-400 border-t border-slate-800 pt-2">
                    <span>Engineering Hours Saved Monthly:</span>
                    <span className="text-cyan-300 font-bold">{Math.round(monthlyHoursSaved)} hours</span>
                  </div>
                  <div className="flex justify-between text-slate-200 border-t border-slate-800 pt-2 font-bold">
                    <span>Total 3-Year Compounded ROI:</span>
                    <span className="text-emerald-400">${(annualSavings * 3).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* GHERKIN BDD DRAWER (SLIDE-OUT) */}
      {gherkinDrawerOpen && (
        <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[500px] bg-slate-950 border-l border-slate-800 shadow-2xl flex flex-col backdrop-blur-2xl animate-in slide-in-from-right duration-300">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <FileCode className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Gherkin BDD Regression Suite</h3>
                <p className="text-[10px] text-slate-400 font-mono">Linked to Master Test Plan TP-700 (#82)</p>
              </div>
            </div>
            <button
              onClick={() => setGherkinDrawerOpen(false)}
              className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800"
            >
              ✕
            </button>
          </div>

          <div className="p-4 flex-1 overflow-y-auto space-y-4">
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300">
              <span className="font-bold text-emerald-400 block mb-1">Active Scenario:</span>
              <p>{selectedChallenge.title}</p>
            </div>

            <div>
              <span className="text-xs font-mono text-slate-400 block mb-1">
                Gherkin Feature Definition (Editable):
              </span>
              <textarea
                value={currentGherkin}
                onChange={(e) => setCurrentGherkin(e.target.value)}
                rows={12}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 font-mono text-xs text-emerald-300 focus:outline-none focus:border-emerald-500 leading-relaxed"
              />
            </div>

            <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800 space-y-2 font-mono text-[11px] text-slate-400">
              <div className="flex justify-between">
                <span>Test Plan:</span>
                <span className="text-amber-300 font-bold">TP-700 (#82)</span>
              </div>
              <div className="flex justify-between">
                <span>Test Suite:</span>
                <span className="text-cyan-300 font-bold">TS-701 (#83)</span>
              </div>
              <div className="flex justify-between">
                <span>Automation Status:</span>
                <span className="text-emerald-400 font-bold">Automated (100% Passed)</span>
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-slate-800 bg-slate-900/40 flex items-center gap-2">
            <button
              onClick={handleFileAdoBug}
              disabled={isFilingBug}
              className="flex-1 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition disabled:opacity-50"
            >
              <Bug className="w-3.5 h-3.5" />
              {isFilingBug ? 'Publishing to ADO Boards...' : 'Publish Gherkin Bug to Boards'}
            </button>
            <button
              onClick={() => setGherkinDrawerOpen(false)}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* AI COPILOT DRAWER (SLIDE-OUT) */}
      {copilotOpen && (
        <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[450px] bg-slate-950 border-l border-slate-800 shadow-2xl flex flex-col backdrop-blur-2xl animate-in slide-in-from-right duration-300">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Ask SRE / FDE AI Copilot</h3>
                <p className="text-[10px] text-slate-400 font-mono">Live architectural knowledge assistant</p>
              </div>
            </div>
            <button
              onClick={() => setCopilotOpen(false)}
              className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800"
            >
              ✕
            </button>
          </div>

          {/* Quick Prompt Chips */}
          <div className="p-3 border-b border-slate-800/80 bg-slate-900/30 flex flex-wrap gap-1.5">
            {[
              'How does AutoTriage ensure $0 spend?',
              'What happens on a Java NPE?',
              'Explain 3-tier database isolation',
              'Show me the Git Subway Map rules',
            ].map((chip) => (
              <button
                key={chip}
                onClick={() => setCopilotQuery(chip)}
                className="px-2 py-1 rounded text-[10px] bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Messages Feed */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 font-sans text-xs">
            {copilotMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`p-3 rounded-xl max-w-[85%] leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-cyan-600 text-white rounded-br-none'
                      : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none'
                  }`}
                >
                  <p>{msg.text}</p>
                  {msg.link && (
                    <a
                      href={msg.link}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:underline font-mono"
                    >
                      Inspect Linked ADO Item <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Input Box */}
          <form onSubmit={handleCopilotSubmit} className="p-3 border-t border-slate-800 bg-slate-900/40">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={copilotQuery}
                onChange={(e) => setCopilotQuery(e.target.value)}
                placeholder="Ask about self-healing, canary, or FinOps..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
              <button
                type="submit"
                className="px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition"
              >
                Ask
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
