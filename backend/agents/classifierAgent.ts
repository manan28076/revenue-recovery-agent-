import { GoogleGenAI } from "@google/genai";
import { PaymentEvent, ClassificationResult, RootCause, ActionType, OutcomeStatus } from "../types";

const MODEL_NAME = "gemini-2.5-flash";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const VALID_ROOT_CAUSES: RootCause[] = [
  "card_decline",
  "insufficient_funds",
  "checkout_drop",
  "mandate_failure",
  "receivable_overdue",
  "unrecoverable_fraud",
  "transient_error",
];

const SYSTEM_PROMPT = `You are a payment failure diagnosis agent for a fintech revenue recovery system.
Given a single payment event and customer context, classify it into EXACTLY ONE root cause from this list:
- card_decline: card was declined by issuer (not fraud, not insufficient funds)
- insufficient_funds: payment failed specifically due to low balance
- checkout_drop: customer abandoned checkout before completing payment
- mandate_failure: recurring/subscription auto-debit (e-mandate) failed
- receivable_overdue: a B2B/invoice payment is overdue, not a failed transaction attempt
- unrecoverable_fraud: fraud was suspected or flagged, this transaction should NOT be retried
- transient_error: network/gateway/timeout error, likely recoverable on retry

IMPORTANT CONFIDENCE CALIBRATION INSTRUCTIONS:
- Do NOT blindly output 0.95 or 1.0 for every event.
- Output high confidence (0.85 - 0.96) ONLY when failure_code and event signals strictly align.
- Output moderate confidence (0.55 - 0.80) when details are partial or standard retry attempts are increasing.
- Output low confidence (0.35 - 0.49) when event parameters are ambiguous, missing checkout stage, or conflicting (e.g. high attempt count with generic error code).

Respond ONLY with valid JSON, no markdown fences, no preamble, matching this structure exactly:
{"root_cause": "<one of the values above>", "confidence": <0.0-1.0>, "reasoning": "<one sentence>", "evidence": "<point out specific fields that led to this>", "alternative_explanation": "<what else it could be, if confidence is low>"}`;;

function buildEventPrompt(event: PaymentEvent): string {
  return `Payment event:
- status: ${event.status}
- failure_code: ${event.failure_code}
- payment_method: ${event.payment_method}
- attempt_count: ${event.attempt_count}
- checkout_stage: ${event.checkout_stage}
- is_subscription: ${event.is_subscription}
- days_overdue: ${event.days_overdue ?? "n/a"}
- customer_payment_history: ${event.customer_payment_history}
- previous_successful_method: ${event.previous_successful_method ?? "none"}
- previous_recovery_attempts: ${event.previous_recovery_attempts}

Classify this event, calibrate confidence accurately, and extract evidence and alternatives.`;
}


const BASE_RECOVERY_RATE_BY_CAUSE_AND_ACTION: Record<RootCause, Partial<Record<ActionType, number>>> = {
  card_decline: {
    retry_payment: 0.55,
    send_nudge: 0.30,
    nudge_with_discount: 0.65,
    reschedule_mandate: 0.20,
  },
  insufficient_funds: {
    send_nudge: 0.42,
    nudge_with_discount: 0.70,
    retry_payment: 0.07, // immediate retry on the same empty balance rarely works
    reschedule_mandate: 0.35,
  },
  checkout_drop: {
    send_nudge: 0.38,
    nudge_with_discount: 0.75,
    retry_payment: 0.15,
    reschedule_mandate: 0.10,
  },
  mandate_failure: {
    reschedule_mandate: 0.48,
    send_nudge: 0.25,
    nudge_with_discount: 0.55,
    retry_payment: 0.10,
  },
  receivable_overdue: {
    send_nudge: 0.32,
    nudge_with_discount: 0.65,
    reschedule_mandate: 0.10,
    retry_payment: 0.05,
  },
  unrecoverable_fraud: {
    escalate_human: 0.08,
  },
  transient_error: {
    retry_payment: 0.72,
    send_nudge: 0.11,
    nudge_with_discount: 0.30,
    reschedule_mandate: 0.15,
  },
};

const DEFAULT_RECOVERY_RATE = 0.30;

export function estimateBaseRecoveryProbability(
  event: PaymentEvent,
  rootCause: RootCause,
  action: ActionType
): number {
  return BASE_RECOVERY_RATE_BY_CAUSE_AND_ACTION[rootCause]?.[action] ?? DEFAULT_RECOVERY_RATE;
}


export function calculateRecoveryProbability(
  event: PaymentEvent,
  rootCause: RootCause,
  action: ActionType,
  outcome: OutcomeStatus = "pending"
): number {
  if (outcome === "skipped") return 0;

  let hash = 0;
  for (let i = 0; i < event.transaction_id.length; i++) {
    hash = (hash << 5) - hash + event.transaction_id.charCodeAt(i);
    hash |= 0;
  }
  const variance = ((Math.abs(hash) % 11) - 5) / 100;

  if (outcome === "escalated" || rootCause === "unrecoverable_fraud") {
    return Math.max(0.05, Math.min(0.12, Number((0.08 + variance * 0.5).toFixed(2))));
  }

  if (outcome === "failed") {
    const attemptPenalty = Math.min(0.08, event.attempt_count * 0.03);
    return Math.max(0.12, Math.min(0.28, Number((0.22 - attemptPenalty + variance).toFixed(2))));
  }

  if (outcome === "recovered") {
    return 1.0;
  }

  // "pending": nothing new is known yet, so the (cause, action) base rate still stands.
  return estimateBaseRecoveryProbability(event, rootCause, action);
}

export function calibrateConfidence(
  event: PaymentEvent,
  rootCause: RootCause,
  rawModelConfidence?: number
): number {
  const raw = typeof rawModelConfidence === "number" && !Number.isNaN(rawModelConfidence)
    ? rawModelConfidence
    : 0.6; // no usable number from the model - moderate default, not a guess dressed up as confidence
  return Math.max(0.05, Math.min(0.97, raw));
}


export const INTERVENTION_COST_PAISE: Record<ActionType, number> = {
  retry_payment: 800,
  send_nudge: 1500,
  nudge_with_discount: 1500,
  reschedule_mandate: 1000,
  escalate_human: 15000,
  no_action: 0,
};

export function estimateInterventionCost(action: ActionType): number {
  return INTERVENTION_COST_PAISE[action] ?? 0;
}

function fallbackHeuristic(event: PaymentEvent): ClassificationResult {

  let root_cause: RootCause = "transient_error";

  if (event.failure_code === "fraud_suspected") {
    root_cause = "unrecoverable_fraud";
  } else if (event.failure_code === "invoice_overdue") {
    root_cause = "receivable_overdue";
  } else if (event.failure_code === "checkout_abandoned") {
    root_cause = "checkout_drop";
  } else if (event.failure_code === "mandate_failed") {
    root_cause = "mandate_failure";
  } else if (event.failure_code === "insufficient_funds") {
    root_cause = "insufficient_funds";
  } else if (event.failure_code === "card_declined") {
    root_cause = "card_decline";
  } else if (event.failure_code === "network_error") {
    root_cause = "transient_error";
  }

  return {
    transaction_id: event.transaction_id,
    root_cause,

    diagnosis_confidence: 0.6,
    reasoning: `Fallback heuristic mapping from failure_code (${event.failure_code}); Gemini was unavailable so this is a deterministic rule, not a model diagnosis.`,
    evidence: `failure_code is ${event.failure_code}`,
    alternative_explanation: "N/A - Fallback heuristic applied",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryDelaySeconds(err: unknown): number | null {
  try {
    const message = (err as Error)?.message || "";
    const parsed = JSON.parse(message.startsWith("{") ? message : message.slice(message.indexOf("{")));
    const retryInfo = parsed?.error?.details?.find((d: any) => d["@type"]?.includes("RetryInfo"));
    const delayStr: string | undefined = retryInfo?.retryDelay; // e.g. "24s"
    if (delayStr) {
      const seconds = parseFloat(delayStr.replace("s", ""));
      if (!isNaN(seconds)) return seconds;
    }
  } catch {
    // message wasn't JSON or didn't have the field, fall through
  }
  return null;
}

function isQuotaError(err: unknown): boolean {
  const message = (err as Error)?.message || "";
  return /RESOURCE_EXHAUSTED|429|exceeded your current quota/i.test(message);
}

function isDailyQuotaError(err: unknown): boolean {
  const message = (err as Error)?.message || "";
  return /PerDay/i.test(message);
}

export async function classifyEvent(
  event: PaymentEvent,
  attempt = 1
): Promise<ClassificationResult> {
  try {
    if (process.env.DEMO_FORCE_FAILURE === "true") {
      throw new Error("Simulated Gemini failure");
    }

    const result = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `${SYSTEM_PROMPT}\n\n${buildEventPrompt(event)}`,
    });
    const text = (result.text || "").trim();
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!VALID_ROOT_CAUSES.includes(parsed.root_cause)) {
      throw new Error(`Invalid root_cause returned: ${parsed.root_cause}`);
    }

    const calibratedConfidence = calibrateConfidence(
      event,
      parsed.root_cause,
      Number(parsed.confidence) || 0.75
    );

    return {
      transaction_id: event.transaction_id,
      root_cause: parsed.root_cause,
      diagnosis_confidence: calibratedConfidence,
      reasoning: String(parsed.reasoning || "").slice(0, 300),
      evidence: String(parsed.evidence || ""),
      alternative_explanation: String(parsed.alternative_explanation || ""),
    };
  } catch (err) {
    if (isQuotaError(err) && !isDailyQuotaError(err) && attempt < 3) {
      const waitSeconds = parseRetryDelaySeconds(err) ?? 15;
      console.log(`Rate limited on ${event.transaction_id}, retrying in ${waitSeconds}s (${attempt}/3)`);
      await sleep(waitSeconds * 1000);
      return classifyEvent(event, attempt + 1);
    }
    console.error(`Classifier fallback for ${event.transaction_id}:`, (err as Error).message);
    return fallbackHeuristic(event);
  }
}

export async function classifyBatch(
  events: PaymentEvent[],
  concurrency = 1
): Promise<ClassificationResult[]> {
  const results: ClassificationResult[] = [];
  for (let i = 0; i < events.length; i += concurrency) {
    const chunk = events.slice(i, i + concurrency);
    const chunkResults = await Promise.all(chunk.map((e) => classifyEvent(e)));
    results.push(...chunkResults);
    console.log(`Classified ${Math.min(i + concurrency, events.length)}/${events.length}`);

    if (i + concurrency < events.length) {
      await sleep(100);
    }
  }
  return results;
}