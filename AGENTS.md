# AutoTriage Enterprise Operating Policy — SAFe Agile & Board-First Agent Harness

> **MANDATORY POLICY FOR ALL AGENTS AND SESSIONS:**
> AutoTriage is managed and operated as an enterprise production system under the **Scaled Agile Framework (SAFe)**.
> **Rule 0: No Code, No Infra, No Triage Without an Azure Boards Work Item.**
> Every task, bug fix, deployment, or configuration change MUST be traced to an active Azure Boards Work Item under the current sprint iteration.

---

## 1. Organization & Engineering Personas

All work in this repository is delegated to one of the **5 specialized engineering personas** registered in Microsoft Entra ID and Azure DevOps:

| Persona | Entra ID UPN | Role | Responsibilities | Scope |
| :--- | :--- | :--- | :--- | :--- |
| **Safwan Saba** | `isafwan@outlook.com` | **RTE / Principal Architect** | Program governance, PI planning, budget guardrails | All |
| **Safwan-dev** | `safwan-dev@isafwanoutlook.onmicrosoft.com` | **Senior Full-Stack Engineer** | Spring Boot APIs, React UI, bug fixes, SUT development | DEV, QA |
| **Safwan-qa** | `safwan-qa@isafwanoutlook.onmicrosoft.com` | **Lead SDET / QA Automation** | Python Playwright E2E suite (`sut/e2e`), smoke runs, bug reproduction | QA |
| **Safwan-devops** | `safwan-devops@isafwanoutlook.onmicrosoft.com` | **DevSecOps & Cloud Infra** | Azure Container Apps, App Insights, CI/CD pipelines, Entra ID RBAC | DEV, QA, PROD |
| **Safwan-mlops** | `safwan-mlops@isafwanoutlook.onmicrosoft.com` | **AI / MLOps Engineer** | LangGraph triage graph, FastMCP tool servers, Promptfoo evaluations | DEV, QA, PROD |
| **Safwan-fde** | `safwan-fde@isafwanoutlook.onmicrosoft.com` | **Forward Deployed Engineer (FDE)** | Customer delivery, Production deployment sign-off, SLOs | PROD, QA, DEV |

---

## 2. Board-First Operating Protocol (5 Golden Steps)

Whenever an instruction, bug report, or feature request is received:

1. **Query Active Sprint:** Check the current active iteration on Azure Boards (`az boards iteration team list --team "AutoTriage Team"`).
2. **Find or Create Work Item:** 
   - Check if an existing User Story or Bug covers the task.
   - If not, create a new Story or Bug under the active Sprint and parent Feature.
   - Title MUST prefix the Persona name: `[Safwan-<role>] US-XXX: <Title>`.
3. **Mandatory Gherkin BDD Formatting (Given / When / Then):**
   - **ALL Features and PBIs (Product Backlog Items / User Stories)** MUST be specified using step-by-step Gherkin BDD scenarios:
     * `Given` <system preconditions, user role, authentication, baseline state>
     * `When` <concrete action, API call, user interaction, payload, or concurrency trigger>
     * `Then` <expected or vulnerable outcome, response code, state change, and boundary assertions>
     * `And` <additional telemetry, audit logs, or downstream side effects>
   - **ALL Test Cases** MUST contain concrete, step-by-step reproduction runbooks in Gherkin BDD format (`Given`, `When`, `Then`, `And`) detailing the exact curl commands, HTTP parameters, concurrency levels, and expected observable evidence so every vulnerability or defect can be demonstrated as a reproducible showcase.
4. **Set State to Active:** Move the work item state from `New` $\rightarrow$ `Active`.
5. **Execute & Commit with `AB#<ID>`:**
   - Follow strict testing rules: Python pytest for all E2E tests, Maven for backend, Vite for frontend.
   - Every git commit message MUST include `AB#<WorkItemID>` (e.g. `feat(infra): provision 3 app insights AB#39`).
6. **Attach Evidence & Resolve:**
   - Post execution logs, test outputs, or URLs as a discussion comment on the work item.
   - Move state from `Active` $\rightarrow$ `Resolved` or `Closed`.

---

## 3. Strict Budget Guardrail ($0.00 / Zero-Cost)

- **NEVER** create Azure Container Registry (ACR) — push images to GitHub Container Registry (`ghcr.io`) or Docker Hub.
- **NEVER** provision paid databases — use Neon Serverless PostgreSQL (Always Free).
- **ALWAYS** enforce `minReplicas: 0` on Azure Container Apps (scale-to-zero when idle).
- **ALWAYS** share the 5 GB/month free Log Analytics workspace (`law-autotriage`) across all App Insights instances.
- **NEVER** exceed the 5 Free Basic User licenses in Azure DevOps (assign Stakeholder for additional users).
