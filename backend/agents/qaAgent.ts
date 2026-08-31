import { GoogleGenAI } from "@google/genai";
import { prisma } from "../db/prismaClient";
import { sanitizeFilter, SafeFilter } from "./qaFilterGuard";
import { computeVerifiedAggregates, templatedFallback } from "./qaAggregates";
import { recordCacheHit, recordCacheMiss } from "./cacheStats";

const MODEL_NAME = "gemini-2.5-flash";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const FILTER_EXTRACTION_PROMPT = `Extract a filter from this question about a payment recovery audit log.
Respond ONLY with JSON, no markdown fences, no preamble. Only use these exact values:

rootCause: one of card_decline, insufficient_funds, checkout_drop, mandate_failure, receivable_overdue, unrecoverable_fraud, transient_error
actionTaken: one of retry_payment, send_nudge, reschedule_mandate, escalate_human, no_action
outcome: one of pending, recovered, failed, escalated, skipped
isRealRazorpayObject: true or false
transactionId: exact transaction id if the question names one

Only include fields the question actually asks about. Example:
Q: "how much did we recover from checkout drops?"
A: {"rootCause": "checkout_drop", "outcome": "recovered"}

Q: "why was txn_00042 escalated?"
A: {"transactionId": "txn_00042"}

Q: "how many transactions do we have total?"
A: {}

Question: `;

export interface QaResult {
  answer: string;
  matched_count: number;
  filter_used: SafeFilter;
  extraction_failed?: boolean;
}

const CANNOT_DETERMINE_FILTER_MESSAGE =
  "I couldn't safely determine what you're asking - please rephrase, or be specific about a transaction id, root cause, action, or outcome you're interested in.";

interface CacheEntry {
  question: string;
  embedding: number[];
  result: QaResult;
}

const semanticCache: CacheEntry[] = [];
const SIMILARITY_THRESHOLD = 0.95;

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function getEmbedding(text: string): Promise<number[]> {
  try {
    const response = await ai.models.embedContent({
      model: "embedding-001",
      contents: text,
    });
    return response.embeddings?.[0]?.values || [];
  } catch (error) {
    console.error("Embedding generation failed:", error);
    return [];
  }
}

export async function askQuestion(question: string): Promise<QaResult> {
  // 1. Generate embedding for the question
  const questionEmbedding = await getEmbedding(question);

  // 2. Check semantic cache
  if (questionEmbedding.length > 0) {
    for (const entry of semanticCache) {
      const similarity = cosineSimilarity(questionEmbedding, entry.embedding);
      if (similarity >= SIMILARITY_THRESHOLD) {
        console.log(`[Semantic Cache Hit] Similarity: ${similarity.toFixed(4)} matched: "${entry.question}"`);
        recordCacheHit();
        return entry.result;
      }
    }
  }

  recordCacheMiss();

  let filter: SafeFilter = {};
  let extractionSucceeded = false;

  try {
    const result = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `${FILTER_EXTRACTION_PROMPT}${question}`,
    });
    const text = (result.text || "").trim().replace(/```json|```/g, "").trim();
    filter = sanitizeFilter(JSON.parse(text));
    extractionSucceeded = true;
  } catch (err) {
    console.error("QA filter extraction failed:", (err as Error).message);
    extractionSucceeded = false;
  }

  if (!extractionSucceeded) {
    return {
      answer: CANNOT_DETERMINE_FILTER_MESSAGE,
      matched_count: 0,
      filter_used: {},
      extraction_failed: true,
    };
  }
  const entries = await prisma.auditLogEntry.findMany({
    where: filter,
    include: { paymentEvent: true },
  });

  const aggregates = computeVerifiedAggregates(entries);
  const exampleSample = entries.slice(0, 5).map((e) => ({
    transaction_id: e.transactionId,
    root_cause: e.rootCause,
    action: e.actionTaken,
    outcome: e.outcome,
    amount_recovered: e.amountRecovered,
    reasoning: e.strategyReasoning,
  }));

  try {
    const phraseResult = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `You're answering a merchant's question about their payment recovery audit log.
Question: ${question}

VERIFIED AGGREGATE NUMBERS (computed from ALL ${aggregates.count} matching transactions, not a sample - use these for any totals, counts, or sums, they are exact):
${JSON.stringify(aggregates)}

A few example matching transactions, for specificity/detail only (there may be many more matching transactions than shown here - do NOT compute totals from this short list, always use the verified aggregate numbers above instead):
${JSON.stringify(exampleSample)}

Answer in 1-3 plain sentences. Use the verified aggregate numbers for any financial totals or counts. If nothing matched, say so.`,
    });
    const answer = (phraseResult.text || "").trim() || templatedFallback(aggregates, filter);
    const result = { answer, matched_count: aggregates.count, filter_used: filter };
    
    // 3. Save to cache
    if (questionEmbedding.length > 0) {
      semanticCache.push({ question, embedding: questionEmbedding, result });
    }
    
    return result;
  } catch (err) {
    console.error("QA answer phrasing failed, using templated fallback:", (err as Error).message);
    const fallbackResult = { answer: templatedFallback(aggregates, filter), matched_count: aggregates.count, filter_used: filter };
    
    // Save fallback to cache too
    if (questionEmbedding.length > 0) {
      semanticCache.push({ question, embedding: questionEmbedding, result: fallbackResult });
    }
    
    return fallbackResult;
  }
}