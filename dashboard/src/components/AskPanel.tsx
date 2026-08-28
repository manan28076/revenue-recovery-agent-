import { useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

const EXAMPLE_QUESTIONS = [
  "How much did we recover from checkout drops?",
  "Which transactions were escalated to a human?",
  "How many were fraud-related?",
  "What happened with insufficient funds cases?",
];

interface QaEntry {
  question: string;
  answer: string;
  matchedCount: number;
}

export function AskPanel() {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<QaEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(text: string) {
    if (!text.trim() || loading) return;

    setLoading(true);
    setError(null);
    const askedQuestion = text.trim();
    setQuestion("");

    try {
      const res = await fetch(`${API_BASE}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: askedQuestion }),
      });
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const data = await res.json();
      setHistory((prev) => [
        { question: askedQuestion, answer: data.answer, matchedCount: data.matched_count },
        ...prev,
      ]);
    } catch (err) {
      setError("Couldn't get an answer, check the API is running.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ask-panel">
      <h2>Ask about the audit log</h2>
      <p className="ask-hint">Ask in plain English, the agent queries the real audit trail to answer.</p>

      <form onSubmit={(e) => { e.preventDefault(); ask(question); }} className="ask-form">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. why was txn_00042 escalated?"
          disabled={loading}
        />
        <button type="submit" disabled={loading || !question.trim()}>
          {loading ? "Asking..." : "Ask"}
        </button>
      </form>

      {history.length === 0 && (
        <div className="ask-suggestions">
          {EXAMPLE_QUESTIONS.map((q) => (
            <button key={q} className="suggestion-chip" onClick={() => ask(q)} disabled={loading}>
              {q}
            </button>
          ))}
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <div className="ask-history">
        {history.map((entry, i) => (
          <div className="ask-entry" key={i}>
            <div className="ask-bubble ask-bubble-q">{entry.question}</div>
            <div className="ask-bubble ask-bubble-a">
              {entry.answer}
              <div className="ask-meta">{entry.matchedCount} matching transaction(s)</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}