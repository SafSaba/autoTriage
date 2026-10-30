---
name: safe-agile-board-harness
description: Enforces SAFe Agile board-first protocol for all engineering actions in AutoTriage. Queries and updates Azure Boards work items, associates commits with AB# IDs, and attributes tasks to Safwan-dev, Safwan-qa, Safwan-fde, Safwan-devops, or Safwan-mlops.
---

# SAFe Agile Board-First Agent Skill

Use this skill whenever processing any engineering, testing, cloud infrastructure, or triage instruction.

## Mandatory Steps

1. **Verify Board State:**
   ```bash
   az boards iteration team list --org https://dev.azure.com/isafwan --project AutoTriage --team "AutoTriage Team" --timeframe current -o table
   ```

2. **Attribute to Persona:**
   - Spring Boot / React / Code changes $\rightarrow$ `Safwan-dev`
   - Playwright / Pytest / Test suites $\rightarrow$ `Safwan-qa`
   - Azure Infra / Container Apps / Pipelines / Entra $\rightarrow$ `Safwan-devops`
   - LangGraph / FastMCP / Observability / Evals $\rightarrow$ `Safwan-mlops`
   - Production Releases / Customer Demos / Sign-off $\rightarrow$ `Safwan-fde`

3. **Link Work Items to Git:**
   Always include `AB#<ID>` in git commits:
   ```bash
   git commit -m "feat(scope): description AB#<work-item-id>"
   ```

4. **Update Story State:**
   ```bash
   az boards work-item update --org https://dev.azure.com/isafwan --id <id> --state "Resolved"
   ```
