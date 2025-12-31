"use client";

import { useState } from "react";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';

interface CodeQuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCode: string;
  lineStart: number;
  lineEnd: number;
  fileName: string;
  language: string;
}

const SUGGESTED_QUESTIONS = [
  "What does this code do?",
  "Are there any potential bugs or issues?",
  "How can this code be improved?",
  "What are the performance implications?",
  "Explain this in simpler terms"
];

export default function CodeQuestionModal({
  isOpen,
  onClose,
  selectedCode,
  lineStart,
  lineEnd,
  fileName,
  language
}: CodeQuestionModalProps) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAsk = async (customQuestion?: string) => {
    const questionToAsk = customQuestion || question;
    if (!questionToAsk.trim()) return;

    setLoading(true);
    setError(null);
    setAnswer("");

    try {
      const res = await fetch("/api/analyze-section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: selectedCode,
          lineStart,
          lineEnd,
          fileName,
          question: questionToAsk,
          mode: "qa"
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      setAnswer(data.analysis);
      if (customQuestion) setQuestion(customQuestion);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-black rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-white/20 shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-white/20">
          <div>
            <h2 className="text-xl font-bold text-white">Ask About Code</h2>
            <p className="text-sm text-slate-400">
              {fileName} - Lines {lineStart}-{lineEnd}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-2"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(90vh-80px)] space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-2">Selected Code</h3>
            <div className="rounded-lg overflow-hidden border border-white/20 max-h-48">
              <SyntaxHighlighter
                language={language}
                style={vscDarkPlus}
                showLineNumbers
                startingLineNumber={lineStart}
                customStyle={{
                  margin: 0,
                  borderRadius: 0,
                  fontSize: '0.75rem'
                }}
              >
                {selectedCode}
              </SyntaxHighlighter>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-2">Quick Questions</h3>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_QUESTIONS.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => handleAsk(q)}
                  disabled={loading}
                  className="px-3 py-1.5 bg-black hover:bg-white/5 border border-white/20 rounded-lg text-sm text-slate-300 transition-colors disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-2">Ask Your Question</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your question here..."
                className="flex-1 px-4 py-2 bg-black border border-white/20 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-white/40"
                disabled={loading}
              />
              <button
                onClick={() => handleAsk()}
                disabled={loading || !question.trim()}
                className="px-6 py-2 bg-black hover:bg-white/5 border border-white/20 rounded-lg text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "..." : "Ask"}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
              Error: {error}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
            </div>
          )}

          {answer && !loading && (
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-2">Answer</h3>
              <div className="bg-black rounded-lg p-4 border border-white/20">
                <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/10 prose-code:text-purple-300 prose-headings:text-white prose-strong:text-white prose-table:text-sm prose-th:border prose-th:border-white/20 prose-th:p-2 prose-td:border prose-td:border-white/20 prose-td:p-2">
                  <ReactMarkdown>{answer}</ReactMarkdown>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
