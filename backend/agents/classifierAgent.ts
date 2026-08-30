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
- You must also output a \`frustration_score\` (0.0 to 1.0). 1.0 means the customer is highly likely to churn based on the context (e.g. lots of failed attempts, card declined). 0.0 means they are likely a loyal customer who will easily retry.

Respond ONLY with valid JSON, no markdown fences, no preamble, matching this structure exactly:
{"root_cause": "<one of the values above>", "confidence": <0.0-1.0>, "frustration_score": <0.0-1.0>, "reasoning": "<one sentence>", "evidence": "<point out specific fields that led to this>", "alternative_explanation": "<what else it could be, if confidence is low>"}`;;

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
    frustration_score: 0.5,
    reasoning: `Fallback heuristic mapping from failure_code (${event.failure_code}); Gemini was unavailable so this is a deterministic rule, not a model diagnosis.`,
    evidence: `failure_code is ${event.failure_code}`,
    alternative_explanation: "N/A - Fallback heuristic applied",
    source: "deterministic_fallback",
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

    const startTime = performance.now();
    const result = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `${SYSTEM_PROMPT}\n\n${buildEventPrompt(event)}`,
    });
    const endTime = performance.now();
    const latencyMs = Math.round(endTime - startTime);
    
    // Gemini 2.5 Flash pricing is roughly $0.075 per 1M input tokens and $0.30 per 1M output tokens.
    // For a blended average, ~$0.15 per 1M tokens ($0.00000015 per token)
    const tokens = result.usageMetadata?.totalTokenCount ?? 0;
    const costUsd = (tokens * 0.00000015).toFixed(5);
    const telemetryString = `[Telemetry: ${latencyMs}ms | ${tokens} tokens | ~$${costUsd}]`;

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
      frustration_score: Number(parsed.frustration_score) || 0.5,
      reasoning: `${String(parsed.reasoning || "").slice(0, 300)} ${telemetryString}`,
      evidence: String(parsed.evidence || ""),
      alternative_explanation: String(parsed.alternative_explanation || ""),
      source: "gemini",
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