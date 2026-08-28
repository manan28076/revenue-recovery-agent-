import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

async function run() {
  const models = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.5-flash-latest", "gemini-2.5-flash"];
  for (const m of models) {
    try {
      const response = await ai.models.generateContent({
        model: m,
        contents: "Hello",
      });
      console.log(m, "works:", response.text);
    } catch (e: any) {
      console.error(m, "error:", e.message);
    }
  }
}
run();
