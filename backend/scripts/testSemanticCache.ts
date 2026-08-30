import { askQuestion } from "../agents/qaAgent";

async function run() {
  console.log("=== Semantic Caching Test ===");
  
  const q1 = "How many failed payments do we have in total?";
  console.log(`\n1. Asking: "${q1}"`);
  console.log("Expecting: Cache Miss (Slow)");
  let start = Date.now();
  let res1 = await askQuestion(q1);
  let end = Date.now();
  console.log(`Time taken: ${end - start}ms`);
  console.log(`Answer: ${res1.answer}`);

  const q2 = "What is the total count of failed payments?";
  console.log(`\n2. Asking: "${q2}" (Semantically similar to Q1)`);
  console.log("Expecting: Cache Hit (Fast)");
  start = Date.now();
  let res2 = await askQuestion(q2);
  end = Date.now();
  console.log(`Time taken: ${end - start}ms`);
  console.log(`Answer: ${res2.answer}`);
  
  const q3 = "How much money was recovered from checkout drops?";
  console.log(`\n3. Asking: "${q3}" (Completely different)`);
  console.log("Expecting: Cache Miss (Slow)");
  start = Date.now();
  let res3 = await askQuestion(q3);
  end = Date.now();
  console.log(`Time taken: ${end - start}ms`);
  console.log(`Answer: ${res3.answer}`);
}

run().catch(console.error);
