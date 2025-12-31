"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ExpandAnnotationModal from "@/components/ExpandAnnotationModal";
import CodeQuestionModal from "@/components/CodeQuestionModal";

interface Annotation {
  lineStart: number;
  lineEnd: number;
  annotation: string;
  type: "info" | "function" | "class" | "important" | "warning";
  isExpandable?: boolean;
}

interface FileItem {
  path: string;
  size: number;
  type: string;
}

interface RepoData {
  owner: string;
  repo: string;
  branch: string;
  description: string;
  files: FileItem[];
}

interface SelectionData {
  text: string;
  lineStart: number;
  lineEnd: number;
}

export default function CodeViewer() {
  const [repoUrl, setRepoUrl] = useState("");
  const [repoData, setRepoData] = useState<RepoData | null>(null);
  const [loadingRepo, setLoadingRepo] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [fileLanguage, setFileLanguage] = useState("javascript");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loadingFile, setLoadingFile] = useState(false);
  const [activeAnnotation, setActiveAnnotation] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandModalOpen, setExpandModalOpen] = useState(false);
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null);
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [selection, setSelection] = useState<SelectionData | null>(null);
  const [showSelectionButton, setShowSelectionButton] = useState(false);
  const questionModalOpenRef = useRef(questionModalOpen);
  const isHoveringButtonRef = useRef(false);

  useEffect(() => {
    questionModalOpenRef.current = questionModalOpen;
  }, [questionModalOpen]);

  useEffect(() => {
    if (!fileContent) return;

    const handleSelection = () => {
      if (questionModalOpenRef.current || isHoveringButtonRef.current) return;

      setTimeout(() => {
        const sel = window.getSelection();
        const selectedText = sel?.toString() || "";
        
        console.log("=== SELECTION EVENT ===");
        console.log("Text length:", selectedText.length);
        console.log("Text preview:", selectedText.substring(0, 50));
        
        if (selectedText.trim().length > 3) {
          const trimmed = selectedText.trim();
          const lines = fileContent.split('\n');
          let lineStart = 1;
          let lineEnd = 1;
          
          for (let i = 0; i < lines.length; i++) {
            const firstLine = trimmed.split('\n')[0].trim();
            if (firstLine && lines[i].trim().includes(firstLine)) {
              lineStart = i + 1;
              lineEnd = lineStart + trimmed.split('\n').length - 1;
              break;
            }
          }

          console.log("Setting selection:", lineStart, "-", lineEnd);
          setSelection({
            text: trimmed,
            lineStart,
            lineEnd
          });
          setShowSelectionButton(true);
        } else {
          console.log("Clearing selection");
          setSelection(null);
          setShowSelectionButton(false);
        }
      }, 100);
    };

    console.log("Adding selection listeners");
    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('selectionchange', handleSelection);
    
    return () => {
      console.log("Removing selection listeners");
      document.removeEventListener('mouseup', handleSelection);
      document.removeEventListener('selectionchange', handleSelection);
    };
  }, [fileContent]);

  const handleLoadRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) return;

    setLoadingRepo(true);
    setRepoData(null);
    setSelectedFile(null);
    try {
      const res = await fetch("/api/repo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setRepoData(data);
    } catch (error) {
      alert("Error: " + (error as Error).message);
    } finally {
      setLoadingRepo(false);
    }
  };

  const handleFileClick = async (filePath: string) => {
    if (!repoData) return;
    
    setSelectedFile(filePath);
    setLoadingFile(true);
    setFileContent("");
    setAnnotations([]);

    try {
      const fileUrl = `https://github.com/${repoData.owner}/${repoData.repo}/blob/${repoData.branch}/${filePath}`;
      
      const res = await fetch("/api/annotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileUrl }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setFileContent(data.fileContent);
      setAnnotations(data.annotations);
      setFileLanguage(data.language || getLanguage(filePath));
    } catch (error) {
      alert("Error: " + (error as Error).message);
    } finally {
      setLoadingFile(false);
    }
  };

  const getTypeColor = (type: string) => {
    const colors = {
      info: "bg-blue-500/10 border-blue-500/30 text-blue-300",
      function: "bg-purple-500/10 border-purple-500/30 text-purple-300",
      class: "bg-green-500/10 border-green-500/30 text-green-300",
      important: "bg-yellow-500/10 border-yellow-500/30 text-yellow-300",
      warning: "bg-red-500/10 border-red-500/30 text-red-300",
    };
    return colors[type as keyof typeof colors] || colors.info;
  };

  const codeLines = fileContent.split("\n");

  const lineAnnotationMap = useMemo(() => {
    const map = new Map<number, number>();
    annotations.forEach((ann, idx) => {
      for (let line = ann.lineStart; line <= ann.lineEnd; line++) {
        map.set(line, idx);
      }
    });
    return map;
  }, [annotations]);

  const filteredFiles = repoData?.files.filter(f => 
    f.path.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const getFileIcon = (path: string) => {
    const ext = path.split('.').pop()?.toLowerCase();
    const icons: Record<string, string> = {
      js: "📜", jsx: "⚛️", ts: "📘", tsx: "⚛️",
      py: "🐍", java: "☕", cpp: "⚙️", c: "⚙️",
      html: "🌐", css: "🎨", json: "📋", md: "📝",
      yml: "⚙️", yaml: "⚙️", env: "🔑",
    };
    return icons[ext || ""] || "📄";
  };

  const getLanguage = (path: string) => {
    const ext = path.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      js: "javascript", jsx: "jsx", ts: "typescript", tsx: "tsx",
      py: "python", java: "java", cpp: "cpp", c: "c",
      cs: "csharp", go: "go", rs: "rust", php: "php",
      rb: "ruby", swift: "swift", kt: "kotlin",
      html: "html", css: "css", json: "json", md: "markdown",
      yml: "yaml", yaml: "yaml", sh: "bash",
    };
    return langMap[ext || ""] || "javascript";
  };

  const handleExpandAnnotation = (ann: Annotation) => {
    setSelectedAnnotation(ann);
    setExpandModalOpen(true);
  };

  return (
    <>
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">Repo Browser</h1>
            <p className="text-purple-200">Browse repos with AI annotations</p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/20 transition-colors"
          >
            Back
          </Link>
        </div>

        <form onSubmit={handleLoadRepo} className="mb-6">
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
            <div className="flex gap-3">
              <input
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="Paste GitHub repo URL"
                className="flex-1 px-4 py-3 bg-slate-800/50 border border-purple-500/30 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                type="submit"
                disabled={loadingRepo || !repoUrl.trim()}
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-slate-600 disabled:to-slate-600 text-white font-semibold rounded-lg transition-all disabled:cursor-not-allowed"
              >
                {loadingRepo ? "Loading..." : "Load Repo"}
              </button>
            </div>
          </div>
        </form>

        {repoData && (
          <div className="grid lg:grid-cols-4 gap-4">
            <div className="lg:col-span-1">
              <div className="bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 overflow-hidden">
                <div className="bg-slate-800/50 px-4 py-3 border-b border-white/10">
                  <h2 className="text-white font-semibold text-sm">{repoData.repo}</h2>
                  {repoData.description && (
                    <p className="text-slate-400 text-xs mt-1">{repoData.description}</p>
                  )}
                </div>
                
                <div className="p-3 border-b border-white/10">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search files..."
                    className="w-full px-3 py-2 bg-slate-800/50 border border-purple-500/30 rounded text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div className="overflow-y-auto max-h-[70vh]">
                  {filteredFiles.map((file) => (
                    <button
                      key={file.path}
                      onClick={() => handleFileClick(file.path)}
                      className={`w-full text-left px-4 py-2 hover:bg-white/10 border-b border-white/5 transition-colors ${
                        selectedFile === file.path ? "bg-purple-500/20" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span>{getFileIcon(file.path)}</span>
                        <span className="text-sm text-white font-mono truncate">{file.path}</span>
                      </div>
                      <div className="text-xs text-slate-400 ml-6">{(file.size / 1024).toFixed(1)} KB</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:col-span-3">
              {loadingFile ? (
                <div className="bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 p-12 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
                </div>
              ) : selectedFile && fileContent ? (
                <>
                  <div className="bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 overflow-hidden">
                    <div className="bg-slate-800/50 px-4 py-2 border-b border-white/10">
                      <h2 className="text-white font-mono text-sm">{selectedFile}</h2>
                    </div>

                    <div className="grid lg:grid-cols-2 gap-0">
                    <div className="border-r border-white/10">
                      <div className="bg-slate-900/50 px-3 py-2 border-b border-white/10">
                        <span className="text-slate-400 text-xs font-semibold uppercase">Code</span>
                      </div>
                      <div className="overflow-auto max-h-[70vh]">
                        <SyntaxHighlighter
                          language={getLanguage(selectedFile)}
                          style={vscDarkPlus}
                          showLineNumbers={true}
                          customStyle={{
                            margin: 0,
                            padding: '1rem',
                            background: 'transparent',
                            fontSize: '0.875rem',
                          }}
                          lineNumberStyle={{
                            minWidth: '3em',
                            paddingRight: '1em',
                            color: '#6b7280',
                            userSelect: 'none',
                          }}
                        >
                          {fileContent}
                        </SyntaxHighlighter>
                      </div>
                    </div>

                    <div>
                      <div className="bg-slate-900/50 px-3 py-2 border-b border-white/10">
                        <span className="text-slate-400 text-xs font-semibold uppercase">
                          AI Annotations ({annotations.length})
                        </span>
                      </div>
                      <div className="overflow-auto max-h-[70vh] p-4 space-y-3">
                        {annotations.length > 0 ? (
                          annotations.map((ann, idx) => (
                            <div
                              key={idx}
                              className={`p-3 rounded-lg border cursor-pointer transition-all ${getTypeColor(ann.type)} ${
                                activeAnnotation === idx ? "ring-2 ring-white/30 scale-105" : ""
                              }`}
                              onMouseEnter={() => setActiveAnnotation(idx)}
                              onMouseLeave={() => setActiveAnnotation(null)}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-mono text-slate-300">
                                  Lines {ann.lineStart}-{ann.lineEnd}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs px-2 py-0.5 rounded bg-white/10 capitalize">
                                    {ann.type}
                                  </span>
                                  {ann.isExpandable && (
                                    <button
                                      onClick={() => handleExpandAnnotation(ann)}
                                      className="text-xs px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                                      title="Expand for detailed analysis"
                                    >
                                      Expand
                                    </button>
                                  )}
                                </div>
                              </div>
                              <p className="text-sm leading-relaxed">{ann.annotation}</p>
                            </div>
                          ))
                        ) : (
                          <div className="text-center text-slate-400 py-8">
                            <p>No annotations yet</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  </div>
                  

                </>
              ) : (
                <div className="bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 p-12 text-center">
                  <h3 className="text-white text-xl font-semibold mb-2">Select a file to view</h3>
                  <p className="text-purple-200">Click any file from the list to see it with AI annotations</p>
                </div>
              )}
            </div>
          </div>
        )}

        {!repoData && !loadingRepo && (
          <div className="bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 p-12 text-center">
            <h3 className="text-white text-xl font-semibold mb-2">Paste a GitHub Repo URL to Start</h3>
            <p className="text-purple-200">Browse repository files and get AI-powered annotations</p>
          </div>
        )}
      </div>

      {selectedFile && fileContent && (
        <div 
          style={{ position: 'fixed', bottom: '32px', right: '32px', zIndex: 99999 }}
          className="flex flex-col gap-2"
          onMouseEnter={() => isHoveringButtonRef.current = true}
          onMouseLeave={() => isHoveringButtonRef.current = false}
        >
          <button
            onClick={() => {
              setSelection({
                text: "test selection",
                lineStart: 1,
                lineEnd: 5
              });
              setQuestionModalOpen(true);
            }}
            style={{ backgroundColor: '#16a34a', color: 'white', padding: '16px 32px', fontSize: '20px', fontWeight: 'bold', border: '4px solid white', borderRadius: '8px' }}
          >
            🤖 ASK AI ABOUT CODE
          </button>
          {showSelectionButton && selection && (
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex flex-col gap-2 border-4 border-white">
              <div className="flex flex-col">
                <span className="text-xs font-semibold uppercase tracking-wide">Text Selected</span>
                <span className="text-lg font-bold">Lines {selection.lineStart}-{selection.lineEnd}</span>
              </div>
              <button
                onClick={() => setQuestionModalOpen(true)}
                className="px-6 py-3 bg-white text-blue-600 hover:bg-gray-100 rounded-xl font-black text-lg transition-all transform hover:scale-105 shadow-xl"
              >
                ASK AI
              </button>
            </div>
          )}
        </div>
      )}

      {selectedAnnotation && (
        <ExpandAnnotationModal
          isOpen={expandModalOpen}
          onClose={() => {
            setExpandModalOpen(false);
            setSelectedAnnotation(null);
          }}
          annotation={selectedAnnotation}
          fileContent={fileContent}
          fileName={selectedFile || ""}
          language={fileLanguage}
        />
      )}

      {selection && (
        <CodeQuestionModal
          isOpen={questionModalOpen}
          onClose={() => {
            setQuestionModalOpen(false);
            setSelection(null);
            window.getSelection()?.removeAllRanges();
          }}
          selectedCode={selection.text}
          lineStart={selection.lineStart}
          lineEnd={selection.lineEnd}
          fileName={selectedFile || ""}
          language={fileLanguage}
        />
      )}
    </div>
    </>
  );
}
