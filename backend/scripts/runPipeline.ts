import "dotenv/config";
import { runFullPipeline } from "../agents/executionAgent";

runFullPipeline().catch((err) => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});