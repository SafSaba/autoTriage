# AutoTriage Design System & Communication Standards

## 1. Typography

* **Headings and Body Text**: Inter, system sans-serif (`font-sans`).
* **Code, Numbers, and Identifiers**: JetBrains Mono, monospace (`font-mono`). Used consistently for AST line ranges, W3C trace IDs, git commit SHAs, SQL queries, and error tokens.

---

## 2. Semantic Color Palette

The interface uses a deliberate, high-contrast palette tailored for observability cockpits and data-dense dashboards:

| Semantic Role | Color Name | Hex Code | Purpose & Context |
| :--- | :--- | :--- | :--- |
| **Healthy / Healed** | Emerald | `#10B981` | Clean test runs, healthy cluster state, successful self-healing execution. |
| **Warning / Drift** | Amber | `#F59E0B` | Environment drift quarantine, transient retry in progress, canary evaluating. |
| **Critical / Breach** | Crimson | `#EF4444` | Active attack vector triggered, reproducible code defect confirmed, elevated error rate. |
| **Telemetry / RAG** | Cyan | `#06B6D4` | Physical AST line grounding, W3C trace span correlation, vector similarity metrics. |
| **Information / Neutral** | Slate Light | `#94A3B8` | Structural labels, timestamps, metadata keys, and secondary guidance. |

---

## 3. Surfaces & Layout

* **Dark Theme Surfaces (Mission Control)**:
  * Application Background: Slate 950 (`#020617`).
  * Card / Panel Surfaces: Slate 900 (`#0F172A`) with subtle Slate 800 (`#1E293B`) borders.
  * Interactive Hover States: Slate 800 (`#1E293B`) transition.
* **Light Theme Surfaces (Public Storefront)**:
  * Background: Slate 50 (`#F8FAFC`).
  * Cards / Containers: Pure White (`#FFFFFF`) with Slate 200 (`#E2E8F0`) borders.
* **Component Styling**:
  * Rounded corners (`rounded-lg`, `rounded-xl`) for cards and chips.
  * Clear visual hierarchy with monospace data callouts.
  * High-contrast badge tags for status indicators.

---

## 4. Anti-Patterns to Avoid

* **No one-sided borders**: Avoid colored stripes or borders on a single edge of a container.
* **No heavy gradients**: Avoid multi-color decorative gradient backgrounds that obscure telemetry data.
* **No ungrounded visual clutter**: Every element on the dashboard must represent a real metric, state, or actionable command.

---

## 5. Copywriting & Communication Tone

* **Language**: Plain, objective technical English (US spelling).
* **Labels**: Direct, concise noun or verb phrases (e.g., `Execute Self-Healing`, `Isolate Environment Drift`, `Verified Root Cause`).
* **No hype or exclamation marks**: State facts, latencies, and verdicts without exaggeration.
* **Formatting**: Currency values are formatted with exact decimals (e.g., `$1,399.00`, `$0.01`).
