# Revenue Recovery Agent

[![CI](https://github.com/yourusername/revenue-recovery-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/yourusername/revenue-recovery-agent/actions/workflows/ci.yml)

> **Evaluation Results:** The agent achieved a net value of **₹7,20,185.12 (+39.5%)** compared to a "blind retry" baseline across 75 simulated transactions, while making 25 fewer unsafe retries.

An autonomous, mathematically-driven recovery pipeline for failed payments, abandoned checkouts, and overdue receivables. Built for the Razorpay Buildathon.

The system orchestrates three distinct processes: it uses an LLM to accurately diagnose the root cause of a payment failure from contextual data, calculates the expected mathematical net value of potential recovery interventions, and executes the optimal strategy directly against the Razorpay API.

## System Architecture

The pipeline is entirely decoupled, bounded, and auditable.

```text
Payment Events (Real + Synthetic)
      │
      ▼
[ Classifier Agent ] ── Gemini 2.5 Flash + Deterministic Heuristic Fallback
      │                 Diagnoses root cause, outputs confidence & evidence
      ▼
[ Strategy Agent ]   ── Action Selection Engine
      │                 Calculates Expected Net Value (ENV = P(success) * Amount - Cost)
      ▼
[ Execution Agent ]  ── Razorpay API Integration
      │                 Issues test-mode Payment Links, respects API rate limits
      ▼
[ Persistence ]      ── PostgreSQL (Prisma)
      │                 Idempotent audit trail & execution logs
      ▼
[ Webhook Listener ] ── Validates signatures & updates recovery status asynchronously
```

## Core Engineering Decisions

We built this agent to mimic a production-grade enterprise system rather than a fragile hackathon prototype. Key technical constraints handled include:

- **Mathematical Decision-Making:** Instead of hardcoded rules, the agent evaluates the economic viability of interventions. It calculates the expected net value (ENV) based on the AI's confidence score, preventing the system from spending $15 on human escalation to recover a $10 payment.
- **Circuit Breaker & Spend Caps:** A safety mechanism actively monitors accumulated intervention costs during a batch. If the daily automated spend cap is hit, the system triggers a circuit breaker and automatically routes all remaining transactions to human escalation, protecting API budgets.
- **Differentiated Execution:** The system physically distinguishes interventions via the Razorpay API. For example, a `retry_payment` action creates a link with a short 24-hour expiry to create urgency, whereas a `send_nudge` action generates a link with a 7-day expiry to give the customer time to resolve issues.
- **Idempotent Execution:** The pipeline checks PostgreSQL before executing any recovery action to guarantee that duplicate Razorpay payment links are never created for the same transaction failure.
- **Resilient Fallbacks:** The classifier handles API rate limits (HTTP 429) via exponential backoff and gracefully degrades to a deterministic heuristic if the LLM becomes entirely unavailable.
- **Independent Evaluation:** The agent's performance is graded against an independent counterfactual outcome matrix. This decouples the agent's internal assumptions from the evaluation framework, providing scientifically valid proof of recovered revenue against a "blind retry" baseline. The evaluator probabilities are synthetic ground-truth assumptions for counterfactual benchmarking; production deployment would calibrate them from historical merchant outcomes.
- **Bounded Q&A:** The dashboard features a natural language interface over the database. Rather than allowing raw text-to-SQL, it uses a whitelisted filter extractor (`qaFilterGuard.ts`) mapped to safe Prisma aggregates, ensuring zero risk of injection or hallucination of financial totals.

## Integration Matrix

| Category | Status | Details |
|---|---|---|
| Abandoned Checkouts | Live | Razorpay Orders |
| Overdue Invoices | Live | Razorpay Invoices |
| Recovery Execution | Live | Razorpay Payment Links API |
| Payment Confirmation | Live | Razorpay Webhooks (`payment_link.paid`) |
| Card Declines | Simulated | Browser 3DS/OTP flow requires simulation |
| Subscription Failures | Simulated | Backend simulation |

## Known Limitations / What I'd Build Next

Engineering maturity means knowing your own edges. Here is where the current system is constrained and what we'd build next for a production release:

1. **Card Decline Simulation:** Card decline simulation stands in for Razorpay's 3DS/OTP flow, which requires real card entry to trigger — a production version would need direct frontend integration to capture real-time drop-offs during the 3DS step.
2. **Subscription Webhooks:** Subscription failure handling is currently simulated at the backend level. A production version would require setting up live listeners for `subscription.charged` and `subscription.halted` Razorpay webhooks.
3. **Probability Calibration:** The expected net value (ENV) calculations currently use synthetic ground-truth assumptions for counterfactual benchmarking. For production, these probability models would need to be continuously calibrated from historical merchant outcome data.

## Local Development Setup

Requirements: Node.js, Docker (for PostgreSQL), and a Razorpay Test Mode account.

```bash
npm install
npm run db:up
cp .env.example .env
npm run db:generate
npm run db:push
```

*Note: Ensure you add a valid `GEMINI_API_KEY` (with access to Gemini 2.5 Flash) and your Razorpay test-mode keys to the `.env` file.*

### Running the Pipeline

The pipeline is split into distinct steps to allow for independent testing and evaluation.

```bash
npm run seed-real-data     # Creates real Orders + Invoices via Razorpay API
npm run classify           # Diagnoses root causes via Gemini 2.5 Flash
npm run run-pipeline       # Computes strategy, issues Payment Links, and generates report
npm run db:load            # Persists the audit log to PostgreSQL

### Confidence Outcome Analysis

You can independently verify that the AI's self-reported confidence correlates with reality.
```bash
npm run eval:confidence-outcome   # Analyzes whether higher model-confidence buckets correlate with successful outcomes; this is not statistical probability calibration.
```
```

### Running the Application

To start the backend API and the React dashboard concurrently:

```bash
npm run api
```
In a separate terminal:
```bash
cd dashboard
npm install
cp .env.example .env
npm run dev
```
The dashboard will be available at `http://localhost:5173`.

### Webhook Configuration (Live Demo)

To test the live confirmation of recovered payments:
1. Expose your local API: `ngrok http 4000`
2. Add the HTTPS URL + `/webhooks/razorpay` to your Razorpay Dashboard Webhook settings.
3. Subscribe to the `payment_link.paid` event.
4. Add the generated webhook secret to your `.env` as `RAZORPAY_WEBHOOK_SECRET`.
5. Pay one of the generated test links using a Razorpay test card to watch the dashboard update live.

## Tech Stack

- **Frontend:** React, TypeScript, Vite
- **Backend:** Node.js, Express, TypeScript
- **Storage:** PostgreSQL, Prisma ORM
- **Intelligence:** Google GenAI SDK (Gemini 2.5 Flash)
- **Payments:** Razorpay Node SDK
