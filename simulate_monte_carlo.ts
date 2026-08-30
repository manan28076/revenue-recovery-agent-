import { decideBatch } from "./backend/agents/strategyAgent";
import { PaymentEvent, ClassificationResult } from "./backend/types";

const NUM_SIMULATIONS = 10000;
let baselineRevenue = 0;
let agentRevenue = 0;

let baselineRecoveredCount = 0;
let agentRecoveredCount = 0;
let agentDiscountsGiven = 0;

console.log(`Running Monte Carlo Simulation on ${NUM_SIMULATIONS} dynamic events...`);

for (let i = 0; i < NUM_SIMULATIONS; i++) {
    // Dynamic randomized attributes
    const amount = Math.floor(Math.random() * 900000) + 50000; // ₹500 to ₹9,000 in paise
    const rootCauses = ["card_decline", "insufficient_funds", "fraud", "network_error"];
    const rootCause = rootCauses[Math.floor(Math.random() * rootCauses.length)] as any;
    
    // AI characteristics dynamically generated per transaction
    const confidence = Math.random() * 0.5 + 0.5; // 0.5 to 1.0
    const frustration = Math.random(); // 0.0 to 1.0
    const attempt_count = Math.floor(Math.random() * 3);
    
    const event: PaymentEvent = {
        transaction_id: `sim_${i}`,
        amount,
        currency: "INR",
        status: "failed",
        failure_code: "network_error",
        payment_method: "card",
        customer_id: "cust_sim",
        attempt_count,
        checkout_stage: "payment_selection",
        timestamp: new Date().toISOString(),
        is_subscription: false
    };
    
    const classification: ClassificationResult = {
        transaction_id: `sim_${i}`,
        root_cause: rootCause,
        diagnosis_confidence: confidence,
        frustration_score: frustration,
        reasoning: "Simulated dynamic environment"
    };

    // ---------------------------------------------------------
    // STRATEGY A: Baseline "Dumb" Strategy (Retry all except fraud)
    // ---------------------------------------------------------
    let baselineProb = 0;
    if (rootCause === "network_error") baselineProb = 0.6;
    else if (rootCause === "card_decline") baselineProb = 0.3;
    else if (rootCause === "insufficient_funds") baselineProb = 0.1;
    
    if (rootCause !== "fraud") {
        if (Math.random() < baselineProb) {
            baselineRevenue += amount;
            baselineRecoveredCount++;
        }
        baselineRevenue -= 200; // Static integration/retry cost (₹2)
    }

    // ---------------------------------------------------------
    // STRATEGY B: The Revenue Recovery AI Agent
    // ---------------------------------------------------------
    // We pass it to the actual production code function
    const [decision] = decideBatch([event], [classification]);
    
    const actualProb = decision.recovery_probability || 0;
    
    if (decision.action === "retry_payment") {
        if (Math.random() < actualProb) {
            agentRevenue += amount;
            agentRecoveredCount++;
        }
        agentRevenue -= 200; // Cost of API retry
    } else if (decision.action === "nudge_with_discount") {
        if (Math.random() < actualProb) {
            agentRevenue += (amount * 0.85); // 15% discount applied
            agentRecoveredCount++;
        }
        agentRevenue -= 500; // Cost of sending SMS + Link
        agentDiscountsGiven++;
    } else if (decision.action === "send_nudge") {
        if (Math.random() < actualProb) {
            agentRevenue += amount;
            agentRecoveredCount++;
        }
        agentRevenue -= 500;
    }
    // "escalate" and "no_action" cost 0 and recover 0.
}

console.log("\n=======================================================");
console.log(`           MONTE CARLO SIMULATION RESULTS             `);
console.log(`=======================================================`);
console.log(`Total Transactions Simulated: ${NUM_SIMULATIONS.toLocaleString()}`);
console.log(`\n--- BASELINE (Rule-Based Retries) ---`);
console.log(`Total Revenue Recovered: ₹${(baselineRevenue / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`);
console.log(`Successful Recoveries: ${baselineRecoveredCount.toLocaleString()}`);

console.log(`\n--- MULTI-AGENT ARCHITECTURE ---`);
console.log(`Total Revenue Recovered: ₹${(agentRevenue / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`);
console.log(`Successful Recoveries: ${agentRecoveredCount.toLocaleString()}`);
console.log(`Discounts Dynamically Issued: ${agentDiscountsGiven.toLocaleString()}`);

const percentageLift = ((agentRevenue - baselineRevenue) / baselineRevenue) * 100;
console.log(`\n>>> NET REVENUE LIFT: +${percentageLift.toFixed(2)}% <<<`);
console.log(`=======================================================\n`);
