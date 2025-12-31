"use client";

import { useState, useEffect } from "react";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface ExpandAnnotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  annotation: {
    lineStart: number;
    lineEnd: number;
    annotation: string;
    type: string;
  };
  fileContent: string;
  fileName: string;
  language: string;
}

export default function ExpandAnnotationModal({
  isOpen,
  onClose,
  annotation,
  fileContent,
  fileName,
  language
}: ExpandAnnotationModalProps) {
  const [analysis, setAnalysis] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && annotation) {
      fetchDetailedAnalysis();
    }
  }, [isOpen, annotation]);

  const fetchDetailedAnalysis = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const lines = fileContent.split('\n');
      const codeSection = lines
        .slice(annotation.lineStart - 1, annotation.lineEnd)
        .join('\n');

      const res = await fetch("/api/analyze-section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: codeSection,
          lineStart: annotation.lineStart,
          lineEnd: annotation.lineEnd,
          fileName,
          mode: "detailed"
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      setAnalysis(data.analysis);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const lines = fileContent.split('\n');
  const codeSection = lines
    .slice(annotation.lineStart - 1, annotation.lineEnd)
    .join('\n');

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden border border-gray-700 shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-white">Detailed Analysis</h2>
            <p className="text-sm text-gray-400">
              {fileName} - Lines {annotation.lineStart}-{annotation.lineEnd}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-2"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 p-4 overflow-y-auto max-h-[calc(90vh-80px)]">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-white mb-2">Code Section</h3>
            <div className="rounded-lg overflow-hidden border border-gray-700">
              <SyntaxHighlighter
                language={language}
                style={vscDarkPlus}
                showLineNumbers
                startingLineNumber={annotation.lineStart}
                customStyle={{
                  margin: 0,
                  borderRadius: 0,
                  fontSize: '0.875rem',
                  maxHeight: '70vh'
                }}
              >
                {codeSection}
              </SyntaxHighlighter>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-white mb-2">Detailed Analysis</h3>
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
              </div>
            ) : error ? (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-300">
                Error: {error}
              </div>
            ) : (
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="prose prose-invert max-w-none">
                  <div className="whitespace-pre-wrap text-gray-300 text-sm leading-relaxed">
                    {analysis}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
