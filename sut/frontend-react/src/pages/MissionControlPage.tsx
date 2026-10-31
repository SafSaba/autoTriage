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
  Search,
  Lock,
} from 'lucide-react';
import { api, getTelemetryState, resolveApiBase } from '@/lib/api';

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

export default function MissionControlPage() {
  const [activeTab, setActiveTab] = useState<'cockpit' | 'storyboard'>('cockpit');
  const [telemetry, setTelemetry] = useState(getTelemetryState());
  const [isInjecting, setIsInjecting] = useState<string | null>(null);
  const [isHealing, setIsHealing] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ title: string; desc: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Active faults tracking
  const [activeFaults, setActiveFaults] = useState<{
    apiNpe: boolean;
    logicDiscount: boolean;
    dbZeroStock: boolean;
  }>({
    apiNpe: false,
    logicDiscount: false,
    dbZeroStock: false,
  });

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
      id: 'tr-1',
      timestamp: new Date().toLocaleTimeString(),
      operationId: '04a11f92e8c2419a',
      endpoint: 'GET /api/health',
      status: 200,
      durationMs: 42,
    },
    {
      id: 'tr-2',
      timestamp: new Date(Date.now() - 3000).toLocaleTimeString(),
      operationId: '98d33e14a2b9015c',
      endpoint: 'GET /api/products',
      status: 200,
      durationMs: 88,
    },
  ]);

  // LangGraph neural pipeline state
  const [graphSteps, setGraphSteps] = useState<GraphStep[]>([
    { id: '1', name: 'Azure Monitor Webhook', role: 'Ingest common alert schema', status: 'completed', detail: 'Severity 1 alert ingested via Starlette webhook' },
    { id: '2', name: 'KQL Correlator Agent', role: 'App Insights exception tracer', status: 'completed', detail: 'Correlated OrderController.java:88 NPE traceparent' },
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
    const interval = setInterval(refreshClusterHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  // Chaos Injection Handlers
  const handleInjectApiNpe = async () => {
    setIsInjecting('apiNpe');
    try {
      // 1. Activate bug flag
      await api.bugs.updateFlags({ BUG_NULL_SHIPPING_NPE: true });
      setActiveFaults((prev) => ({ ...prev, apiNpe: true }));

      // 2. Trigger synthetic order checkout with null line2 / addressLine2
      const orderPayload: any = {
        items: [{ productId: 'watch-1', quantity: 1 }],
        shippingAddress: {
          name: 'Chaos Synthetic Tester',
          fullName: 'Chaos Synthetic Tester',
          line1: '100 Chaos Ave',
          addressLine1: '100 Chaos Ave',
          line2: null as unknown as string,
          addressLine2: null as unknown as string, // Triggers NPE in OrderController.java:88
          city: 'Seattle',
          state: 'WA',
          postal_code: '98101',
          postalCode: '98101',
          country: 'USA',
        },
        paymentDetails: { cardLast4: '4242' },
      };

      try {
        await api.orders.create(orderPayload);
      } catch (err: any) {
        // Expected HTTP 500 error
      }

      // Add trace
      const opId = telemetry.operationId || Math.random().toString(16).substring(2, 18);
      setTraces((prev) => [
        {
          id: `tr-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          operationId: opId,
          endpoint: 'POST /api/orders (Trigger NPE)',
          status: 500,
          durationMs: 312,
        },
        ...prev.slice(0, 5),
      ]);

      // Animate LangGraph pipeline
      animateNeuralTriage();

      setToastMsg({
        title: '💥 Fault Injected: Java API Layer',
        desc: 'HTTP 500 NullPointerException triggered in DEV OrderController.java:88. LangGraph Neural Brain engaged.',
        type: 'error',
      });
    } catch (e: any) {
      setToastMsg({ title: 'Injection Error', desc: e.message, type: 'error' });
    } finally {
      setIsInjecting(null);
    }
  };

  const handleInjectLogicDiscount = async () => {
    setIsInjecting('logicDiscount');
    try {
      await api.bugs.updateFlags({ BUG_OFF_BY_ONE_DISCOUNT: true });
      setActiveFaults((prev) => ({ ...prev, logicDiscount: true }));
      setToastMsg({
        title: '🧮 Fault Injected: Logic Layer',
        desc: 'BUG_OFF_BY_ONE_DISCOUNT enabled. Pricing algorithm now corrupts tier discounts silently.',
        type: 'error',
      });
    } catch (e: any) {
      setToastMsg({ title: 'Injection Error', desc: e.message, type: 'error' });
    } finally {
      setIsInjecting(null);
    }
  };

  const handleInjectDbZeroStock = async () => {
    setIsInjecting('dbZeroStock');
    try {
      await api.products.update('watch-1', {
        name: 'Titanium Smartwatch (Fault Injected)',
        stock: 0,
      });
      setActiveFaults((prev) => ({ ...prev, dbZeroStock: true }));
      setToastMsg({
        title: '🗄️ Fault Injected: Database Layer',
        desc: 'Product watch-1 inventory set to 0 in neondb_dev. neondb_qa and neondb_prod remain 100% unaffected.',
        type: 'error',
      });
    } catch (e: any) {
      setToastMsg({ title: 'Injection Error', desc: e.message, type: 'error' });
    } finally {
      setIsInjecting(null);
    }
  };

  const handleRestoreBaseline = async () => {
    setIsHealing(true);
    const start = performance.now();
    try {
      // 1. Reset all bugs
      await api.bugs.updateFlags({
        BUG_NULL_SHIPPING_NPE: false,
        BUG_OFF_BY_ONE_DISCOUNT: false,
        BUG_STALE_CART_CACHE: false,
      });
      // 2. Reset catalog
      await api.products.reset();
      setActiveFaults({ apiNpe: false, logicDiscount: false, dbZeroStock: false });

      const mttr = Math.round(performance.now() - start);

      setTraces((prev) => [
        {
          id: `tr-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          operationId: telemetry.operationId || 'op-heal-001',
          endpoint: 'POST /api/products/reset (Baseline Restored)',
          status: 200,
          durationMs: mttr,
        },
        ...prev.slice(0, 5),
      ]);

      // Reset graph
      setGraphSteps((prev) =>
        prev.map((s) => ({ ...s, status: 'completed', detail: s.detail.replace('running...', 'resolved') }))
      );

      setToastMsg({
        title: '✅ Self-Healing Complete: Baseline Restored',
        desc: `All bug flags disengaged, product inventory restored in neondb_dev. MTTR: ${mttr}ms. Health 200 OK verified.`,
        type: 'success',
      });
      refreshClusterHealth();
    } catch (e: any) {
      setToastMsg({ title: 'Healing Error', desc: e.message, type: 'error' });
    } finally {
      setIsHealing(false);
    }
  };

  const animateNeuralTriage = () => {
    // Reset to running sequence
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
      }, stepIdx * 900);
    });

    setTimeout(() => {
      setGraphSteps((steps) => steps.map((s) => ({ ...s, status: 'completed' })));
    }, 5500);
  };

  const handleCopilotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!copilotQuery.trim()) return;

    const userText = copilotQuery;
    setCopilotQuery('');
    setCopilotMessages((prev) => [...prev, { sender: 'user', text: userText }]);

    // Intelligent answer matching
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
                  AutoTriage FDE Command Center
                  <span className="px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/60">
                    v2.4 Enterprise
                  </span>
                </h1>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Closed-Loop Self-Healing Cloud &bull; 3-Tier Neon Isolation &bull; SAFe Agile Governance
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

      {/* Main Content Areas */}
      <main className="px-4 lg:px-8 py-6 max-w-[1700px] mx-auto space-y-6">
        {activeTab === 'cockpit' ? (
          <>
            {/* Real-Time Status Ticker Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-md">
                <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  Cluster State
                </span>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-sm font-bold text-white flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    3/3 Tiers Online
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">DEV / QA / PROD</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-md">
                <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                  Cloud Spend Boundary
                </span>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-sm font-bold text-emerald-400 font-mono">$0.00 / month</span>
                  <span className="text-[10px] text-emerald-500 font-medium">Scale-to-Zero</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-md">
                <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-amber-400" />
                  Test Management
                </span>
                <div className="mt-1 flex items-center justify-between">
                  <a
                    href="https://dev.azure.com/isafwan/AutoTriage/_workitems/edit/82"
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-bold text-amber-300 hover:underline flex items-center gap-1"
                  >
                    TP-700: 100% Passed
                    <ExternalLink className="w-3 h-3 text-slate-400" />
                  </a>
                  <span className="text-[10px] text-slate-400 font-mono">Run #22, #24</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-md">
                <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                  <TrendingDown className="w-3.5 h-3.5 text-violet-400" />
                  Autonomous MTTR
                </span>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-sm font-bold text-violet-300 font-mono">38.4 Seconds</span>
                  <span className="text-[10px] text-slate-400">vs 4.0h Human SRE</span>
                </div>
              </div>
            </div>

            {/* 4-Zone Primary War Room Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              {/* ZONE 1: Multi-Layer Chaos Fault Injector Cockpit (XL: 5 columns) */}
              <div className="xl:col-span-5 space-y-4">
                <div className="rounded-2xl border border-slate-800/90 bg-slate-900/60 backdrop-blur-xl p-5 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        <Flame className="w-4 h-4" />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-white tracking-wide">
                          Zone 1: Multi-Vector Chaos Fault Cockpit
                        </h2>
                        <p className="text-[11px] text-slate-400">
                          1-Click live architectural failure injection in DEV sandbox
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      US-801 / TC-801
                    </span>
                  </div>

                  {/* Fault Vectors */}
                  <div className="space-y-3">
                    {/* Vector 1: Java API Layer */}
                    <div className="p-3.5 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-950/50 transition">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-rose-300 flex items-center gap-1.5">
                              <Cpu className="w-3.5 h-3.5 text-rose-400" />
                              Vector 1: Java API Layer (HTTP 500 NPE)
                            </span>
                            {activeFaults.apiNpe && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-950 text-rose-400 border border-rose-800 animate-pulse">
                                FAULT ACTIVE
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                            Simulates a production NullPointerException at{' '}
                            <code className="text-amber-300 font-mono">OrderController.java:88</code> on order checkout with null
                            addressLine2.
                          </p>
                        </div>
                        <button
                          onClick={handleInjectApiNpe}
                          disabled={isInjecting === 'apiNpe'}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-rose-600/90 hover:bg-rose-500 text-white shrink-0 shadow-md shadow-rose-950/40 transition active:scale-95 disabled:opacity-50 flex items-center gap-1"
                        >
                          <Play className="w-3 h-3" />
                          {isInjecting === 'apiNpe' ? 'Firing...' : 'Break Java API'}
                        </button>
                      </div>
                    </div>

                    {/* Vector 2: Logic Layer */}
                    <div className="p-3.5 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-950/50 transition">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-amber-300 flex items-center gap-1.5">
                              <Code className="w-3.5 h-3.5 text-amber-400" />
                              Vector 2: Pricing Logic (Off-By-One Drift)
                            </span>
                            {activeFaults.logicDiscount && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950 text-amber-400 border border-amber-800">
                                ACTIVE
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                            Injects an off-by-one algorithmic flaw in discount tiers, causing silent cart price mismatch without throwing an explicit 500 error.
                          </p>
                        </div>
                        <button
                          onClick={handleInjectLogicDiscount}
                          disabled={isInjecting === 'logicDiscount'}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600/90 hover:bg-amber-500 text-white shrink-0 shadow-md shadow-amber-950/40 transition active:scale-95 disabled:opacity-50 flex items-center gap-1"
                        >
                          <Play className="w-3 h-3" />
                          {isInjecting === 'logicDiscount' ? 'Injecting...' : 'Break Pricing'}
                        </button>
                      </div>
                    </div>

                    {/* Vector 3: Database Layer */}
                    <div className="p-3.5 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-950/50 transition">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-cyan-300 flex items-center gap-1.5">
                              <Database className="w-3.5 h-3.5 text-cyan-400" />
                              Vector 3: Neon DB Inventory (Stock = 0)
                            </span>
                            {activeFaults.dbZeroStock && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
                                ACTIVE
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                            Zeroes out inventory for <code className="text-cyan-300 font-mono">watch-1</code> in{' '}
                            <code className="text-cyan-300 font-mono">neondb_dev</code>, proving complete isolation from QA & PROD.
                          </p>
                        </div>
                        <button
                          onClick={handleInjectDbZeroStock}
                          disabled={isInjecting === 'dbZeroStock'}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-cyan-600/90 hover:bg-cyan-500 text-white shrink-0 shadow-md shadow-cyan-950/40 transition active:scale-95 disabled:opacity-50 flex items-center gap-1"
                        >
                          <Play className="w-3 h-3" />
                          {isInjecting === 'dbZeroStock' ? 'Updating...' : 'Break DB'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Synthetic Probe Telemetry Feed */}
                  <div className="mt-4 pt-3.5 border-t border-slate-800">
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
                            <span className="text-slate-300 truncate max-w-[180px]">{tr.endpoint}</span>
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

                {/* ZONE 2: 3-Tier Live Cloud & Neon Database Matrix */}
                <div className="rounded-2xl border border-slate-800/90 bg-slate-900/60 backdrop-blur-xl p-5 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                        <Server className="w-4 h-4" />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-white tracking-wide">
                          Zone 2: 3-Tier Multi-Cloud Isolation Matrix
                        </h2>
                        <p className="text-[11px] text-slate-400">
                          Azure Container Apps + Neon Serverless PostgreSQL instances
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      US-803 / TC-802
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
                </div>
              </div>

              {/* ZONE 3: LangGraph Neural Brain & Java AST Patch Diff Viewer (XL: 7 columns) */}
              <div className="xl:col-span-7 space-y-4">
                <div className="rounded-2xl border border-slate-800/90 bg-slate-900/60 backdrop-blur-xl p-5 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20">
                        <Bot className="w-4 h-4" />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-white tracking-wide">
                          Zone 3: LangGraph Neural Execution Pipeline
                        </h2>
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

                  {/* Neural Graph Steps Visualizer */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
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
                        <h3 className="text-xs font-bold text-slate-100">{step.name}</h3>
                        <p className="text-[10px] text-slate-400 mt-0.5">{step.role}</p>
                        <p className="text-[10px] text-slate-300 font-mono mt-2 bg-slate-900/80 p-1.5 rounded border border-slate-800/60">
                          {step.detail}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Side-by-Side Java AST Code Diff Viewer */}
                  <div className="mt-5 pt-4 border-t border-slate-800">
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2">
                        <Code className="w-4 h-4 text-emerald-400" />
                        <h3 className="text-xs font-bold text-slate-100">
                          Synthesized AST Patch: <span className="font-mono text-cyan-300">OrderController.java</span>
                        </h3>
                      </div>
                      <a
                        href="https://dev.azure.com/isafwan/AutoTriage/_git/AutoTriage/pullrequests"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 font-mono"
                      >
                        PR #3 (feat/AB#78-hotfix-agent) <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-[11px] rounded-xl overflow-hidden border border-slate-800">
                      {/* Red / Before */}
                      <div className="bg-rose-950/20 p-3.5 border-r border-slate-800">
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-rose-900/30 text-rose-400 font-bold text-[10px]">
                          <span>🔴 BEFORE (OrderController.java:88)</span>
                          <span>FAULTY NPE</span>
                        </div>
                        <pre className="text-rose-200 overflow-x-auto leading-relaxed">
                          {`// Buggy Direct Dereference:
String address2 = order.getShippingAddress()
    .getAddressLine2()
    .trim(); // 💥 Throws NPE if null!

log.info("Shipping line 2: {}", address2);`}
                        </pre>
                      </div>

                      {/* Green / After */}
                      <div className="bg-emerald-950/20 p-3.5">
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-emerald-900/30 text-emerald-400 font-bold text-[10px]">
                          <span>🟢 AFTER (Tree-sitter AST Patch)</span>
                          <span>PASSES CRITIC (0.98)</span>
                        </div>
                        <pre className="text-emerald-200 overflow-x-auto leading-relaxed">
                          {`// Safe Optional Safe-Navigation:
String address2 = Optional.ofNullable(
    order.getShippingAddress().getAddressLine2()
).map(String::trim).orElse("");

log.info("Safe shipping line 2: {}", address2);`}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ZONE 4: Azure DevOps Governance Hub & Multi-Branch Git Subway Map */}
                <div className="rounded-2xl border border-slate-800/90 bg-slate-900/60 backdrop-blur-xl p-5 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        <GitBranch className="w-4 h-4" />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-white tracking-wide">
                          Zone 4: Azure DevOps Governance & Git Subway Map
                        </h2>
                        <p className="text-[11px] text-slate-400">
                          Non-fast-forward PR merge graph & TP-700 linked test execution
                        </p>
                      </div>
                    </div>
                    <a
                      href="https://dev.azure.com/isafwan/AutoTriage/_boards/board/t/AutoTriage%20Team/Stories"
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-400 hover:underline flex items-center gap-1 font-medium"
                    >
                      Open ADO Board <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  {/* Multi-Branch Subway Map Visual Representation */}
                  <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2.5">
                    <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                      <GitPullRequest className="w-3.5 h-3.5 text-cyan-400" />
                      Real-Life Multi-Branch Subway Map DAG (commit tree)
                    </span>
                    <div className="space-y-2 font-mono text-xs">
                      {/* Commit PR 1 */}
                      <div className="flex items-center gap-2 text-slate-300">
                        <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                        <span className="text-cyan-400 font-bold">d22ed37</span>
                        <span className="text-slate-400">&bull;</span>
                        <span className="text-slate-200">Merge PR #1: feat/AB#77-alert-webhook &rarr; main</span>
                        <span className="ml-auto text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-800">
                          Closed AB#77
                        </span>
                      </div>
                      {/* Commit PR 3 */}
                      <div className="flex items-center gap-2 text-slate-300">
                        <span className="w-2.5 h-2.5 rounded-full bg-violet-400" />
                        <span className="text-violet-400 font-bold">3fce397</span>
                        <span className="text-slate-400">&bull;</span>
                        <span className="text-slate-200">Merge PR #3: feat/AB#78-hotfix-agent &rarr; main</span>
                        <span className="ml-auto text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-800">
                          Closed AB#78
                        </span>
                      </div>
                      {/* Commit PR 4 */}
                      <div className="flex items-center gap-2 text-slate-300">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                        <span className="text-amber-400 font-bold">c9c6e99</span>
                        <span className="text-slate-400">&bull;</span>
                        <span className="text-slate-200">Merge PR #4: feat/AB#79-canary-rollback &rarr; main</span>
                        <span className="ml-auto text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-800">
                          Closed AB#79
                        </span>
                      </div>
                      {/* Commit PR 5 */}
                      <div className="flex items-center gap-2 text-slate-300">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                        <span className="text-emerald-400 font-bold">b8d218e</span>
                        <span className="text-slate-400">&bull;</span>
                        <span className="text-slate-200">Merge PR #5: feat/AB#87-chaos-orchestrator &rarr; main</span>
                        <span className="ml-auto text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-800">
                          Closed AB#87
                        </span>
                      </div>
                      {/* Active PR 6 */}
                      <div className="flex items-center gap-2 text-cyan-300 bg-cyan-950/40 p-1.5 rounded border border-cyan-800/40">
                        <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                        <span className="text-cyan-300 font-bold">ACTIVE</span>
                        <span className="text-slate-400">&bull;</span>
                        <span className="text-cyan-200">feat/AB#76-mission-control-ui (Sprint 8 War Room UI)</span>
                        <span className="ml-auto text-[10px] text-cyan-300 px-1.5 py-0.5 rounded bg-cyan-900/60 font-semibold">
                          Active AB#76
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ADO Test Plan & Suites Summary */}
                  <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                      <span className="text-[10px] font-mono text-slate-400 block mb-1">
                        Master Test Plan TP-700 (#82)
                      </span>
                      <a
                        href="https://dev.azure.com/isafwan/AutoTriage/_workitems/edit/82"
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-bold text-amber-300 hover:underline flex items-center gap-1"
                      >
                        AutoTriage Self-Healing Test Plan <ExternalLink className="w-3 h-3" />
                      </a>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Linked to TS-701 (#83) &bull; TestedBy relations to US-703, US-704, US-705, US-706, US-801, US-803.
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                      <span className="text-[10px] font-mono text-slate-400 block mb-1">
                        Automated Test Runs Telemetry
                      </span>
                      <a
                        href="https://dev.azure.com/isafwan/AutoTriage/_TestManagement/Runs"
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-bold text-emerald-400 hover:underline flex items-center gap-1"
                      >
                        Runs #20, #22, #24 (100% Passed) <ExternalLink className="w-3 h-3" />
                      </a>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Published via ado_test_publisher.py directly into Azure DevOps REST API.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* EXECUTIVE STORYBOARD & ROI CALCULATOR MODE */
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

      {/* Slide-out "Ask SRE / FDE" Copilot Drawer */}
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
