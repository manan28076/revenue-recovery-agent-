import "dotenv/config";
import express from "express";
import cors from "cors";
import Razorpay from "razorpay";
import { Prisma } from "@prisma/client";
import { prisma } from "./db/prismaClient";
import { askQuestion } from "./agents/qaAgent";
import { getCacheStats } from "./agents/cacheStats";


const RECOGNIZED_WEBHOOK_EVENTS = new Set([
  "payment_link.paid",
  "payment_link.expired",
  "payment_link.cancelled",
  "payment.failed",
]);

type OutcomeStatus = "pending" | "recovered" | "failed" | "escalated" | "skipped";


export function evaluateOutcomeTransition(
  currentOutcome: OutcomeStatus,
  incoming: "recovered" | "failed"
): { allowed: boolean; noop?: boolean; reason: string } {
  if (incoming === "recovered") {
    if (currentOutcome === "pending") return { allowed: true, reason: "pending -> recovered" };
    if (currentOutcome === "recovered") return { allowed: true, noop: true, reason: "already recovered, no-op" };
    if (currentOutcome === "failed") {
      return { allowed: false, reason: 'failed -> recovered requires a human decision (use the "Mark Recovered" override for a confirmed late payment), not an automatic webhook transition' };
    }
    return { allowed: false, reason: `${currentOutcome} is a terminal human-owned state - use an override to change it, not an automatic webhook` };
  } else {
    if (currentOutcome === "pending") return { allowed: true, reason: "pending -> failed" };
    if (currentOutcome === "failed") return { allowed: true, noop: true, reason: "already failed, no-op" };
    if (currentOutcome === "recovered") {
      return { allowed: false, reason: "cannot un-recover a confirmed payment via webhook - a failure event arriving after confirmation is either out-of-order delivery or a data problem, and either way needs human review, not an automatic state change" };
    }
    return { allowed: false, reason: `${currentOutcome} is a terminal human-owned state - use an override to change it, not an automatic webhook` };
  }
}

const app = express();
// DEMO ONLY: Unrestricted CORS is enabled for hackathon demo purposes.
// In production, this would be locked down to specific trusted origins (e.g., the exact frontend domain).
app.use(cors());

let authWarningLogged = false;

// Auth middleware for mutating/admin endpoints
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const secret = process.env.ADMIN_API_SECRET;
  
  if (!secret) {
    if (!authWarningLogged) {
      console.warn("WARN: ADMIN_API_SECRET is not set. Auth is bypassed. Do not do this in production!");
      authWarningLogged = true;
    }
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized: Invalid or missing Bearer token" });
  }
  next();
}

async function resolveAuditEntryForWebhook(tx: Prisma.TransactionClient, paymentLinkEntity: any) {
  const linkId: string | undefined = paymentLinkEntity?.id;
  if (linkId) {
    const byLinkId = await tx.auditLogEntry.findUnique({
      where: { recoveryLinkId: linkId },
      include: { paymentEvent: true },
    });
    if (byLinkId) return byLinkId;
  }

  const transactionId: string | undefined = paymentLinkEntity?.notes?.source_transaction_id;
  if (transactionId) {
    return tx.auditLogEntry.findUnique({
      where: { transactionId },
      include: { paymentEvent: true },
    });
  }

  return null;
}
app.post(
  "/webhooks/razorpay",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"] as string | undefined;
    const rawBody = req.body as Buffer;

    if (!secret) {
      console.error("RAZORPAY_WEBHOOK_SECRET not set - refusing webhook, can't verify it's really from Razorpay");
      return res.status(500).json({ error: "webhook secret not configured" });
    }
    if (!signature) {
      return res.status(400).json({ error: "missing x-razorpay-signature header" });
    }

    const isValid = Razorpay.validateWebhookSignature(rawBody.toString(), signature, secret);
    if (!isValid) {
      console.warn("Webhook signature mismatch - rejecting, this request did not come from Razorpay");
      return res.status(400).json({ error: "invalid signature" });
    }

    let body: any;
    try {
      body = JSON.parse(rawBody.toString());
    } catch {
      return res.status(400).json({ error: "malformed JSON body" });
    }

    const razorpayEventId = req.headers["x-razorpay-event-id"] as string | undefined;

    if (!RECOGNIZED_WEBHOOK_EVENTS.has(body.event)) {
      console.log(`Ignoring unrecognized/unhandled webhook event type: ${body.event}`);
      return res.status(200).json({ status: "ignored_unrecognized_event_type" });
    }

    try {

      await prisma.$transaction(async (tx) => {
        if (razorpayEventId) {
          await tx.webhookEvent.create({
            data: { razorpayEventId, eventType: body.event, payload: body },
          });
        }

        const { estimateRecoveryProbability: calculateRecoveryProbability } = await import("./agents/probabilityEstimator");

        if (body.event === "payment_link.paid") {
          const paymentLink = body.payload?.payment_link?.entity;
          const payment = body.payload?.payment?.entity;
          if (
            typeof paymentLink?.amount === "number" &&
            typeof paymentLink?.amount_paid === "number" &&
            paymentLink.amount_paid < paymentLink.amount
          ) {
            console.warn(
              `payment_link.paid for ${paymentLink?.id} reports amount_paid (${paymentLink.amount_paid}) < amount (${paymentLink.amount}) - partial payments aren't supported, ignoring rather than marking as fully recovered`
            );
            return;
          }

          const existing = await resolveAuditEntryForWebhook(tx, paymentLink);
          if (!existing) return; // unknown transaction - understood, nothing to retry

          const transition = evaluateOutcomeTransition(existing.outcome as OutcomeStatus, "recovered");
          if (!transition.allowed) {
            console.warn(`Rejected webhook transition for ${existing.transactionId}: ${transition.reason}`);
            return;
          }
          if (transition.noop) {
            console.log(`No-op for ${existing.transactionId}: ${transition.reason}`);
            return;
          }

          const newRecoveryProbability = calculateRecoveryProbability(existing.paymentEvent as any, { root_cause: existing.rootCause, diagnosis_confidence: existing.diagnosisConfidence, frustration_score: 0.5 } as any, existing.actionTaken as any, "recovered");
          await tx.auditLogEntry.update({
            where: { transactionId: existing.transactionId },
            data: {
              outcome: "recovered",
              amountRecovered: payment?.amount || 0,
              predictedRecoveryAmount: 0,
              recoveryProbability: newRecoveryProbability,
              recoverySource: "webhook_confirmed",
            },
          });
          console.log(`Recovery confirmed via webhook for ${existing.transactionId} - payment ${payment?.id}`);
        } else {
          const paymentLink = body.payload?.payment_link?.entity || body.payload?.payment?.entity;

          const existing = await resolveAuditEntryForWebhook(tx, paymentLink);
          if (!existing) return;

          const transition = evaluateOutcomeTransition(existing.outcome as OutcomeStatus, "failed");
          if (!transition.allowed) {
            console.warn(`Rejected webhook transition for ${existing.transactionId}: ${transition.reason}`);
            return;
          }
          if (transition.noop) {
            console.log(`No-op for ${existing.transactionId}: ${transition.reason}`);
            return;
          }

          const newRecoveryProbability = calculateRecoveryProbability(existing.paymentEvent as any, { root_cause: existing.rootCause, diagnosis_confidence: existing.diagnosisConfidence, frustration_score: 0.5 } as any, existing.actionTaken as any, "failed");
          await tx.auditLogEntry.update({
            where: { transactionId: existing.transactionId },
            data: {
              outcome: "failed",
              amountRecovered: 0,
              predictedRecoveryAmount: 0,
              recoveryProbability: newRecoveryProbability,
              recoverySource: null,
            },
          });
          console.log(`Link failure/expiry recorded via webhook for ${existing.transactionId} - event: ${body.event}`);
        }
      });

      res.status(200).json({ status: "ok" });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        console.log(`Webhook ${razorpayEventId} already claimed by a concurrent/earlier delivery - skipping (idempotent)`);
        return res.status(200).json({ status: "already_processed" });
      }

      console.error("Webhook processing failed:", err);

      res.status(500).json({ error: "internal error, please retry" });
    }
  }
);

app.use(express.json());

const askRateLimits = new Map<string, { count: number; resetAt: number }>();
const MAX_ASK_PER_MINUTE = 10;

app.post("/api/ask", async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const now = Date.now();
  const rateLimit = askRateLimits.get(ip);
  if (rateLimit && now < rateLimit.resetAt) {
    if (rateLimit.count >= MAX_ASK_PER_MINUTE) {
      return res.status(429).json({ error: "Rate limit exceeded. Please try again later." });
    }
    rateLimit.count++;
  } else {
    askRateLimits.set(ip, { count: 1, resetAt: now + 60 * 1000 });
  }

  const question = req.body?.question;
  if (typeof question !== "string" || question.trim().length === 0) {
    return res.status(400).json({ error: "question is required" });
  }
  if (question.length > 500) {
    return res.status(400).json({ error: "question too long" });
  }

  try {
    const result = await askQuestion(question.trim());
    res.json(result);
  } catch (err) {
    console.error("Q&A endpoint failed:", err);
    res.status(500).json({ error: "failed to answer question" });
  }
});

app.get("/api/cache-stats", (_req, res) => {
  res.json(getCacheStats());
});

// Interactive Demo Endpoint: Simulate Payment Failure & Run Pipeline
app.post("/api/simulate-failure", requireAuth, async (req, res) => {
  try {
    const failureCode = req.body?.failureCode || "checkout_abandoned";
    
    // Dynamic random amount based on scenario (in paise)
    const baseAmounts: Record<string, number[]> = {
      checkout_abandoned: [149900, 249900, 399900, 89900, 199900],
      insufficient_funds: [450000, 750000, 1200000, 320000],
      card_declined: [185000, 299000, 540000, 149000],
      invoice_overdue: [1500000, 2800000, 4500000, 9500000],
      fraud_suspected: [800000, 1500000, 2500000, 500000],
    };
    const choices = baseAmounts[failureCode] || [249900, 199900, 349900];
    const amount = req.body?.amount ? Number(req.body.amount) : choices[Math.floor(Math.random() * choices.length)];

    const txnId = `sim_${Date.now().toString().slice(-6)}`;
    const randomDaysOverdue = 5 + Math.floor(Math.random() * 45);

    // Create payment event in DB
    const event = await prisma.paymentEvent.create({
      data: {
        transactionId: txnId,
        amount,
        currency: "INR",
        status: "failed",
        failureCode,
        paymentMethod: failureCode === "checkout_abandoned" ? "upi" : "card",
        customerId: `cust_sim_${Math.floor(Math.random() * 900 + 100)}`,
        attemptCount: 1,
        checkoutStage: failureCode === "checkout_abandoned" ? "payment_method_selected" : "authorization",
        isSubscription: false,
        daysOverdue: failureCode === "invoice_overdue" ? randomDaysOverdue : null,
        isRealRazorpayObject: false,
      },
    });

    const { classifyEvent } = await import("./agents/classifierAgent");
    const { decideBatch } = await import("./agents/strategyAgent");
    const { executeBatch } = await import("./agents/executionAgent");

    const paymentEvent: any = {
      transaction_id: event.transactionId,
      amount: event.amount,
      currency: "INR",
      status: "failed",
      failure_code: event.failureCode as any,
      payment_method: event.paymentMethod as any,
      customer_id: event.customerId,
      attempt_count: event.attemptCount,
      checkout_stage: "payment_selection",
      timestamp: event.createdAt.toISOString(),
      is_subscription: event.isSubscription,
      days_overdue: event.daysOverdue ?? undefined,
      is_real_razorpay_object: false,
    };

    const classification = await classifyEvent(paymentEvent);
    const [decision] = decideBatch([paymentEvent], [classification]);
    const [auditEntry] = await executeBatch([paymentEvent], [classification], [decision]);

    await prisma.auditLogEntry.create({
      data: {
        transactionId: auditEntry.transaction_id,
        rootCause: auditEntry.root_cause,
        diagnosisConfidence: auditEntry.diagnosis_confidence,
        recoveryProbability: auditEntry.recovery_probability,
        classifierReasoning: auditEntry.classifier_reasoning,
        actionTaken: auditEntry.action_taken,
        strategyReasoning: auditEntry.strategy_reasoning,
        outcome: auditEntry.outcome,
        amountRecovered: auditEntry.amount_recovered,
        predictedRecoveryAmount: auditEntry.predicted_recovery_amount ?? 0,
        recoverySource: auditEntry.recovery_source ?? null,
        expectedRecoveryValue: auditEntry.expected_recovery_value ?? null,
        interventionCost: auditEntry.intervention_cost ?? null,
        expectedNetValue: auditEntry.expected_net_value ?? null,
        recoveryLinkId: auditEntry.recovery_link_id ?? null,
        recoveryLinkUrl: auditEntry.recovery_link_url ?? null,
        aiSource: auditEntry.ai_source ?? null,
      },
    });

    res.json({ success: true, transactionId: txnId, auditEntry });
  } catch (err) {
    console.error("Failure simulation failed:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});
app.post("/api/simulate-webhook-event", requireAuth, async (req, res) => {
  try {
    const { transactionId, eventType = "payment_link.paid" } = req.body;
    if (!transactionId) {
      return res.status(400).json({ error: "transactionId required" });
    }
    if (!RECOGNIZED_WEBHOOK_EVENTS.has(eventType)) {
      return res.status(400).json({
        error: `Invalid event type: "${eventType}". Must be one of: ${Array.from(RECOGNIZED_WEBHOOK_EVENTS).join(", ")}`,
      });
    }

    const auditLog = await prisma.auditLogEntry.findUnique({
      where: { transactionId },
      include: { paymentEvent: true },
    });

    if (!auditLog) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    const { estimateRecoveryProbability: calculateRecoveryProbability } = await import("./agents/probabilityEstimator");
    const newOutcome: "recovered" | "failed" = eventType === "payment_link.paid" ? "recovered" : "failed";

    const transition = evaluateOutcomeTransition(auditLog.outcome as OutcomeStatus, newOutcome);
    if (!transition.allowed) {
      return res.status(409).json({ error: `Transition rejected: ${transition.reason}` });
    }
    if (transition.noop) {
      return res.json({ success: true, eventType, updated: auditLog, note: transition.reason });
    }

    const amountRecovered = newOutcome === "recovered" ? auditLog.paymentEvent.amount : 0;

    const newRecoveryProbability = calculateRecoveryProbability(auditLog.paymentEvent as any, { root_cause: auditLog.rootCause, diagnosis_confidence: auditLog.diagnosisConfidence, frustration_score: 0.5 } as any, auditLog.actionTaken as any, newOutcome);

    const updated = await prisma.auditLogEntry.update({
      where: { transactionId },
      data: {
        outcome: newOutcome,
        amountRecovered,
        predictedRecoveryAmount: 0,
        recoveryProbability: newRecoveryProbability,
        recoverySource: newOutcome === "recovered" ? "demo_confirmed" : null,
      },
    });

    res.json({ success: true, eventType, updated });
  } catch (err) {
    console.error("Webhook simulation failed:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/api/simulate-webhook-pay", requireAuth, async (req, res) => {
  req.body.eventType = "payment_link.paid";
  return app._router.handle(req, res, () => {});
});

// Endpoint to generate a live Razorpay test link to manually trigger a real payment.failed webhook
app.post("/api/generate-test-link", requireAuth, async (req, res) => {
  try {
    const razorpay = require("./services/razorpayClient").getRazorpayClient();
    const link = await razorpay.paymentLink.create({
      amount: 10000, // ₹100
      currency: "INR",
      description: "Live Webhook Test Link",
      customer: {
        name: "Test Customer",
        email: "test@example.com",
        contact: "9999999999",
      },
      notify: { sms: false, email: false },
      reminder_enable: false,
    });
    res.json({ success: true, linkUrl: link.short_url, linkId: link.id });
  } catch (error) {
    console.error("OVERRIDE ERROR:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Human-in-the-loop Override Action Endpoint
app.post("/api/override", requireAuth, async (req, res) => {
  try {
    const { transactionId, overrideAction, reason } = req.body;
    if (!transactionId || !overrideAction) {
      return res.status(400).json({ error: "transactionId and overrideAction required" });
    }
    if (typeof reason !== "string" || reason.trim().length < 5) {
      return res.status(400).json({ error: "reason is required (minimum 5 characters) - explain why this override is being made" });
    }
    const trimmedReason = reason.trim().slice(0, 500);

    const auditLog = await prisma.auditLogEntry.findUnique({
      where: { transactionId },
      include: { paymentEvent: true },
    });

    if (!auditLog) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    const previousOutcome = auditLog.outcome;

    let updatedOutcome = auditLog.outcome;
    let amountRecovered = auditLog.amountRecovered;
    let predictedRecoveryAmount = auditLog.predictedRecoveryAmount;
    let recoveryLinkUrl = auditLog.recoveryLinkUrl;
    let recoveryLinkId = auditLog.recoveryLinkId;
    let recoverySource: "webhook_confirmed" | "demo_confirmed" | "human_override" | null = auditLog.recoverySource as any;
    let strategyReasoning = `${auditLog.strategyReasoning} [Merchant Action: ${overrideAction} - "${trimmedReason}"]`;

    const { estimateRecoveryProbability: calculateRecoveryProbability } = await import("./agents/probabilityEstimator");

    if (overrideAction === "discount_link") {
      const { createRecoveryLink } = await import("./services/recoveryLinkService");
      const discountedAmount = Math.round(auditLog.paymentEvent.amount * 0.9);
      const discountedEvent: any = {
        transaction_id: auditLog.transactionId,
        amount: discountedAmount,
        currency: auditLog.paymentEvent.currency,
        customer_id: auditLog.paymentEvent.customerId,
      };
      const link = await createRecoveryLink(discountedEvent, "merchant-issued 10% discount override", "send_nudge");

      updatedOutcome = "pending";
      amountRecovered = 0;
      const probability = calculateRecoveryProbability(auditLog.paymentEvent as any, { root_cause: auditLog.rootCause, diagnosis_confidence: auditLog.diagnosisConfidence, frustration_score: 0.5 } as any, auditLog.actionTaken as any, "pending");
      predictedRecoveryAmount = Math.round(discountedAmount * probability);
      recoveryLinkUrl = link.short_url;
      recoveryLinkId = link.razorpay_payment_link_id;
      recoverySource = null;
    } else if (overrideAction === "mark_uncollectible") {
      updatedOutcome = "skipped";
      amountRecovered = 0;
      predictedRecoveryAmount = 0;
      recoverySource = null;
    } else if (overrideAction === "mark_still_failed") {
      updatedOutcome = "failed";
      amountRecovered = 0;
      predictedRecoveryAmount = 0;
      recoverySource = null;
    } else if (overrideAction === "mark_recovered") {
      // An explicit merchant assertion that this was collected (e.g. offline
      // payment, bank transfer) IS a real, human-confirmed recovery.
      updatedOutcome = "recovered";
      amountRecovered = auditLog.paymentEvent.amount;
      predictedRecoveryAmount = 0;
      recoverySource = "human_override";
    } else if (overrideAction === "manual_reminder") {
      // Intent logged in strategy reasoning; no state change
    }

    const updatedRecoveryProbability = calculateRecoveryProbability(auditLog.paymentEvent as any, { root_cause: auditLog.rootCause, diagnosis_confidence: auditLog.diagnosisConfidence, frustration_score: 0.5 } as any, auditLog.actionTaken as any, updatedOutcome as any);

    const [updated] = await prisma.$transaction([
      prisma.auditLogEntry.update({
        where: { transactionId },
        data: {
          outcome: updatedOutcome,
          amountRecovered,
          predictedRecoveryAmount,
          recoveryLinkUrl,
          recoveryLinkId,
          recoverySource,
          strategyReasoning,
          recoveryProbability: updatedRecoveryProbability,
        },
      }),
      prisma.overrideAudit.create({
        data: {
          transactionId,
          overrideAction,
          reason: trimmedReason,
          previousOutcome,
          newOutcome: updatedOutcome,
        },
      }),
    ]);

    res.json({ success: true, updated });
  } catch (err) {
    console.error("OVERRIDE ERROR:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/api/override-history/:transactionId", async (req, res) => {
  try {
    const history = await prisma.overrideAudit.findMany({
      where: { transactionId: req.params.transactionId },
      orderBy: { createdAt: "desc" },
    });
    res.json(history);
  } catch (err) {
    console.error("Override history lookup failed:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/api/audit-log", async (_req, res) => {
  const entries = await prisma.auditLogEntry.findMany({
    include: { paymentEvent: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(entries);
});

const ACTIVE_RECOVERY_ACTIONS = new Set(["retry_payment", "send_nudge", "reschedule_mandate"]);

app.get("/api/report", async (_req, res) => {
  const entries = await prisma.auditLogEntry.findMany({ include: { paymentEvent: true } });

  const total_amount_at_risk = entries.reduce((sum, e) => sum + e.paymentEvent.amount, 0);

  const outcome_breakdown: Record<string, number> = {};
  const root_cause_breakdown: Record<string, number> = {};
  const action_breakdown: Record<string, number> = {};
  const recovery_source_breakdown: Record<string, number> = {};

  const action_recovered_breakdown: Record<string, number> = {};

  let total_amount_actions_initiated = 0;
  let total_amount_pending_confirmation = 0;
  let total_amount_confirmed_recovered = 0;
  let total_amount_predicted_recovered = 0;
  let total_verified_revenue_recovered = 0;
  let total_simulated_recovery = 0;
  let total_expected_recovery_potential = 0;

  let total_expected_net_value = 0;

  for (const e of entries) {
    outcome_breakdown[e.outcome] = (outcome_breakdown[e.outcome] || 0) + 1;
    root_cause_breakdown[e.rootCause] = (root_cause_breakdown[e.rootCause] || 0) + 1;
    action_breakdown[e.actionTaken] = (action_breakdown[e.actionTaken] || 0) + 1;

    if (ACTIVE_RECOVERY_ACTIONS.has(e.actionTaken)) {
      total_amount_actions_initiated += e.paymentEvent.amount;
    }

    if (e.expectedNetValue != null) {
      total_expected_net_value += e.expectedNetValue;
    }
    if (e.expectedNetValue != null && e.expectedNetValue > 0) {
      total_expected_recovery_potential += e.expectedNetValue;
    }

    if (e.outcome === "pending") {
      total_amount_pending_confirmation += e.paymentEvent.amount;
      total_amount_predicted_recovered += e.predictedRecoveryAmount;
    } else if (e.outcome === "recovered") {
      const source = e.recoverySource ?? "webhook_confirmed";
      recovery_source_breakdown[source] = (recovery_source_breakdown[source] || 0) + 1;
      total_amount_confirmed_recovered += e.amountRecovered;
      
      // Breakdown by action
      action_recovered_breakdown[e.actionTaken] = (action_recovered_breakdown[e.actionTaken] || 0) + e.amountRecovered;
      
      if (source === "webhook_confirmed" || source === "human_override") {
        total_verified_revenue_recovered += e.amountRecovered;
      } else if (source === "demo_confirmed") {
        total_simulated_recovery += e.amountRecovered;
      }
    }
  }

  const real_object_count = entries.filter((e) => e.paymentEvent.isRealRazorpayObject).length;
  const synthetic_event_count = entries.length - real_object_count;
  const confirmed_payment_count = entries.filter(
    (e) => e.outcome === "recovered" && (e.recoverySource === "webhook_confirmed" || e.recoverySource === "human_override")
  ).length;

  const { getBudgetStats } = await import("./agents/strategyAgent");
  const budgetStats = getBudgetStats();

  let eval_metrics = null;
  try {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const path = join(__dirname, "..", "data", "eval_metrics.json");
    eval_metrics = JSON.parse(readFileSync(path, "utf-8"));
  } catch (err) {
    // silently ignore if not found yet
  }

  res.json({
    total_events: entries.length,
    total_amount_at_risk,
    total_amount_actions_initiated,
    total_amount_pending_confirmation,
    total_amount_confirmed_recovered,
    total_verified_revenue_recovered,
    total_simulated_recovery,
    total_expected_recovery_potential,
    confirmed_recovery_rate: total_amount_at_risk > 0 ? total_amount_confirmed_recovered / total_amount_at_risk : 0,
    total_amount_predicted_recovered,
    total_expected_net_value,
    intervention_budget_used: budgetStats.used,
    intervention_budget_limit: budgetStats.limit,
    recovery_source_breakdown,
    outcome_breakdown,
    root_cause_breakdown,
    action_breakdown,
    action_recovered_breakdown,
    real_object_count,
    synthetic_event_count,
    confirmed_payment_count,
    eval_metrics,
  });
});

app.get("/api/eval-metrics", async (_req, res) => {
  try {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const path = join(__dirname, "..", "data", "eval_metrics.json");
    const raw = readFileSync(path, "utf-8");
    res.json(JSON.parse(raw));
  } catch (err) {
    res.status(404).json({ error: "No eval metrics yet - run `npm run evaluate` first." });
  }
});

app.get("/api/baseline-report", async (_req, res) => {
  try {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const path = join(__dirname, "..", "data", "baseline_report.json");
    const raw = readFileSync(path, "utf-8");
    res.json(JSON.parse(raw));
  } catch (err) {
    res.status(404).json({ error: "No baseline report yet - run `npm run eval:baseline` first." });
  }
});

const PORT = process.env.PORT || 4000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
}