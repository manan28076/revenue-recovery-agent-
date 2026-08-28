import { writeFileSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import {PaymentEvent,ClassificationResult,StrategyDecision,ExecutionOutcome,AuditLogEntry,} from "../types";
import { decideBatch } from "./strategyAgent";
import { createRecoveryLink } from "../services/recoveryLinkService";
import { prisma } from "../db/prismaClient";

async function executeAction(
  event: PaymentEvent,
  decision: StrategyDecision,
  existingLink?: {
    recoveryLinkId: string | null;
    recoveryLinkUrl: string | null;
    outcome: string;
    recoverySource?: string | null;
  }
): Promise<ExecutionOutcome & { recovery_link_id?: string; recovery_link_url?: string }> {

  if (existingLink && existingLink.outcome !== "pending") {
    return {
      transaction_id: event.transaction_id,
      action_taken: decision.action,
      outcome: existingLink.outcome as ExecutionOutcome["outcome"],
      amount_recovered: existingLink.outcome === "recovered" ? event.amount : 0,
      predicted_recovery_amount: 0,
      timestamp: new Date().toISOString(),
      recovery_source: (existingLink.recoverySource as ExecutionOutcome["recovery_source"]) ?? undefined,
      recovery_link_id: existingLink.recoveryLinkId ?? undefined,
      recovery_link_url: existingLink.recoveryLinkUrl ?? undefined,
    };
  }

  let outcome: ExecutionOutcome["outcome"] = "pending";
  let recovery_link_id = existingLink?.recoveryLinkId ?? undefined;
  let recovery_link_url = existingLink?.recoveryLinkUrl ?? undefined;
  let linkCreationFailed = false;
  let execution_note: string | undefined;

  const needsLink =
    decision.action === "retry_payment" ||
    decision.action === "send_nudge" ||
    decision.action === "reschedule_mandate";

  if (needsLink && !recovery_link_id) {
    try {
      const link = await createRecoveryLink(event, decision.reasoning, decision.action);
      recovery_link_id = link.razorpay_payment_link_id;
      recovery_link_url = link.short_url;
    } catch (err) {

      const message =
        (err as any)?.error?.description ||
        (err as Error)?.message ||
        String(err);
      console.error(`Recovery link creation failed for ${event.transaction_id}:`, message);
      linkCreationFailed = true;
      execution_note = `Recovery link creation failed (${message}) - escalated for manual follow-up rather than left stuck as "pending" with no link and no way to ever resolve.`;
    }
  } else if (needsLink && recovery_link_id) {
    console.log(`Reusing existing recovery link for ${event.transaction_id} (idempotency guard)`);
  }

  let predicted_recovery_amount = 0;

  if (needsLink && linkCreationFailed) {
    outcome = "escalated";
  } else if (needsLink) {
    outcome = "pending";
    const probability = decision.recovery_probability ?? 0;
    predicted_recovery_amount = Math.round(event.amount * probability);
  } else if (decision.action === "escalate_human") {
    outcome = "escalated";
  } else {
    outcome = "skipped";
  }

  return {
    transaction_id: event.transaction_id,
    action_taken: decision.action,
    outcome,
    amount_recovered: 0,
    predicted_recovery_amount,
    timestamp: new Date().toISOString(),
    recovery_source: undefined,
    execution_note,
    recovery_link_id,
    recovery_link_url,
  };
}

export async function executeBatch(
  events: PaymentEvent[],
  classifications: ClassificationResult[],
  decisions: StrategyDecision[],
  concurrency = 2
): Promise<AuditLogEntry[]> {
  const classByTxn = new Map(classifications.map((c) => [c.transaction_id, c]));
  const decisionByTxn = new Map(decisions.map((d) => [d.transaction_id, d]));
  let existingByTxn = new Map<
    string,
    { recoveryLinkId: string | null; recoveryLinkUrl: string | null; outcome: string; recoverySource: string | null }
  >();
  try {
    const existing = await prisma.auditLogEntry.findMany({
      where: { transactionId: { in: events.map((e) => e.transaction_id) } },
      select: { transactionId: true, recoveryLinkId: true, recoveryLinkUrl: true, outcome: true, recoverySource: true },
    });
    existingByTxn = new Map(existing.map((e) => [e.transactionId, e]));
    if (existing.length > 0) {
      console.log(`Idempotency check: ${existing.length} transaction(s) already have a prior run's data.`);
    }
  } catch (err) {
    console.warn("Could not reach postgres for idempotency check - proceeding without it. Run `npm run db:push` first if this is unexpected.", (err as Error).message);
  }

  const results: AuditLogEntry[] = [];
  for (let i = 0; i < events.length; i += concurrency) {
    const chunk = events.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(async (event) => {
        const classification = classByTxn.get(event.transaction_id)!;
        const decision = decisionByTxn.get(event.transaction_id)!;
        const outcome = await executeAction(event, decision, existingByTxn.get(event.transaction_id));

        const { calculateRecoveryProbability } = await import("./classifierAgent");
        const recoveryProbability = calculateRecoveryProbability(event, classification.root_cause, decision.action, outcome.outcome);

        return {
          transaction_id: event.transaction_id,
          root_cause: classification.root_cause,
          diagnosis_confidence: classification.diagnosis_confidence,
          recovery_probability: recoveryProbability,
          classifier_reasoning: classification.reasoning,
          action_taken: decision.action,
          strategy_reasoning: outcome.execution_note
            ? `${decision.reasoning} [EXECUTION FAILURE: ${outcome.execution_note}]`
            : decision.reasoning,
          outcome: outcome.outcome,
          amount_recovered: outcome.amount_recovered,
          predicted_recovery_amount: outcome.predicted_recovery_amount,
          recovery_source: outcome.recovery_source,
          expected_recovery_value: decision.expected_recovery_value,
          intervention_cost: decision.intervention_cost,
          expected_net_value: decision.expected_net_value,
          timestamp: outcome.timestamp,
          recovery_link_id: outcome.recovery_link_id,
          recovery_link_url: outcome.recovery_link_url,
        };
      })
    );
    results.push(...chunkResults);
    console.log(`Executed ${Math.min(i + concurrency, events.length)}/${events.length}`);
  }
  return results;
}

interface BatchReport {
  total_events: number;
  total_amount_at_risk: number;
  total_amount_actions_initiated: number;
  total_amount_pending_confirmation: number;
  total_amount_confirmed_recovered: number;
  confirmed_recovery_rate: number;
  total_amount_predicted_recovered: number;
  outcome_breakdown: Record<string, number>;
  root_cause_breakdown: Record<string, number>;
  action_breakdown: Record<string, number>;
  recovery_source_breakdown: Record<string, number>;
  unresolved_cases: AuditLogEntry[];
}

const ACTIVE_RECOVERY_ACTIONS = new Set(["retry_payment", "send_nudge", "reschedule_mandate"]);

export function buildReport(events: PaymentEvent[], log: AuditLogEntry[]): BatchReport {
  const total_amount_at_risk = events.reduce((sum, e) => sum + e.amount, 0);
  const eventAmountByTxn = new Map(events.map((e) => [e.transaction_id, e.amount]));

  let total_amount_actions_initiated = 0;
  let total_amount_pending_confirmation = 0;
  let total_amount_confirmed_recovered = 0;
  let total_amount_predicted_recovered = 0;

  const outcome_breakdown: Record<string, number> = {};
  const root_cause_breakdown: Record<string, number> = {};
  const action_breakdown: Record<string, number> = {};
  const recovery_source_breakdown: Record<string, number> = {};

  for (const entry of log) {
    outcome_breakdown[entry.outcome] = (outcome_breakdown[entry.outcome] || 0) + 1;
    root_cause_breakdown[entry.root_cause] = (root_cause_breakdown[entry.root_cause] || 0) + 1;
    action_breakdown[entry.action_taken] = (action_breakdown[entry.action_taken] || 0) + 1;

    if (ACTIVE_RECOVERY_ACTIONS.has(entry.action_taken)) {
      total_amount_actions_initiated += eventAmountByTxn.get(entry.transaction_id) ?? 0;
    }

    if (entry.outcome === "pending") {
      total_amount_pending_confirmation += eventAmountByTxn.get(entry.transaction_id) ?? 0;
      total_amount_predicted_recovered += entry.predicted_recovery_amount;
    } else if (entry.outcome === "recovered") {
      const source = entry.recovery_source ?? "webhook_confirmed";
      recovery_source_breakdown[source] = (recovery_source_breakdown[source] || 0) + 1;
      total_amount_confirmed_recovered += entry.amount_recovered;
    }
  }

  const unresolved_cases = log.filter((l) => l.outcome === "failed" || l.outcome === "escalated");

  return {
    total_events: events.length,
    total_amount_at_risk,
    total_amount_actions_initiated,
    total_amount_pending_confirmation,
    total_amount_confirmed_recovered,
    confirmed_recovery_rate: total_amount_at_risk > 0 ? total_amount_confirmed_recovered / total_amount_at_risk : 0,
    total_amount_predicted_recovered,
    outcome_breakdown,
    root_cause_breakdown,
    action_breakdown,
    recovery_source_breakdown,
    unresolved_cases,
  };
}

export async function runFullPipeline() {
  const dataDir = join(__dirname, "..", "..", "data");
  const events: PaymentEvent[] = JSON.parse(
    readFileSync(join(dataDir, "payment_events.json"), "utf-8")
  );
  const classifications: ClassificationResult[] = JSON.parse(
    readFileSync(join(dataDir, "classifications.json"), "utf-8")
  );

  const decisions = decideBatch(events, classifications);
  const auditLog = await executeBatch(events, classifications, decisions);
  const report = buildReport(events, auditLog);

  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, "audit_log.json"), JSON.stringify(auditLog, null, 2));
  writeFileSync(join(dataDir, "report.json"), JSON.stringify(report, null, 2));

  const webhookConfirmed = auditLog.filter(l => l.outcome === "recovered" && l.recovery_source === "webhook_confirmed").reduce((s, l) => s + l.amount_recovered, 0);
  const demoConfirmed = auditLog.filter(l => l.outcome === "recovered" && l.recovery_source === "demo_confirmed").reduce((s, l) => s + l.amount_recovered, 0);

  console.log("\n=== Batch Report ===");
  console.log(`Events processed: ${report.total_events}`);
  console.log(`Amount at risk: ₹${(report.total_amount_at_risk / 100).toLocaleString("en-IN")}`);
  console.log(`Actions initiated: ₹${(report.total_amount_actions_initiated / 100).toLocaleString("en-IN")}`);
  console.log(`Pending confirmation: ₹${(report.total_amount_pending_confirmation / 100).toLocaleString("en-IN")}\n`);
  
  console.log("---");
  console.log(`LIVE / VERIFIED`);
  console.log(`₹${(webhookConfirmed / 100).toLocaleString("en-IN")}`);
  console.log(`Razorpay confirmed`);
  
  console.log(`\nDEMO CONFIRMED`);
  console.log(`₹${(demoConfirmed / 100).toLocaleString("en-IN")}`);
  console.log(`Simulated webhook`);
  
  console.log(`\nOFFLINE EVALUATION (Predicted / Counterfactual)`);
  console.log(`₹${(report.total_amount_predicted_recovered / 100).toLocaleString("en-IN")}`);
  console.log(`Counterfactual simulation`);
  console.log("---\n");

  console.log(`Unresolved (failed/escalated) cases: ${report.unresolved_cases.length}`);
  console.table(report.outcome_breakdown);

  return { auditLog, report };
}