---
name: gherkin-bdd-specification
description: Enforces strict Gherkin BDD specification format (Given, When, Then, And) for all Azure DevOps Epics, Features, Product Backlog Items (PBIs/Stories), and QA Test Cases. Guarantees step-by-step reproduction runbooks for vulnerabilities and showcase defects.
---

# Gherkin BDD Specification & Test Case Reproduction Skill

This skill enforces the mandatory standard for defining all requirements, user stories, and test cases in the AutoTriage platform using Behavior-Driven Development (BDD) Gherkin syntax.

## Mandatory Format Rules

### 1. Features & PBIs (Product Backlog Items)
Every Feature and PBI must include:
```gherkin
Feature: [Capability Name]
  As a [Role]
  I want [Functionality]
  So that [Business Value or Showcase Goal]

  Scenario: [Primary Successful or Showcase Path]
    Given [Initial system state, active user session, and seed data]
    When [Specific action, API request with HTTP method and path, or user interaction occurs]
    Then [Observable response status, data mutation, or error occurs]
    And [System invariants, telemetry tags, or side effects verified]
```

### 2. Test Cases (Reproduction Runbooks)
Every Test Case linked to a PBI via `TestedBy` must include a concrete step-by-step reproduction runbook:
```gherkin
Scenario Outline: Reproduce and verify [Vulnerability or Behavior]
  Given Preconditions:
    | Parameter | Value |
    | Endpoint  | https://autotriage-backend-dev.../api/orders |
    | Role      | Authenticated Customer |
    | Header    | Authorization: Bearer <TOKEN> |
  When The client executes the following reproduction request:
    """
    curl -X POST <Endpoint> \
      -H "Authorization: Bearer <TOKEN>" \
      -H "Content-Type: application/json" \
      -d '<PAYLOAD>'
    """
  Then The server responds with status code <EXPECTED_HTTP_STATUS>
  And The database records state:
    | Field | Expected State |
    | Stock | <OBSERVED_VALUE> |
  And The vulnerability or defect is confirmed for demonstration.
```
