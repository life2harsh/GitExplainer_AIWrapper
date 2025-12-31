"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
import CodeQuestionModal from "@/components/CodeQuestionModal";

interface Annotation {
  lineStart: number;
  lineEnd: number;
  annotation: string;
  type: "info" | "function" | "class" | "important" | "warning";
}

interface SelectionData {
  text: string;
  lineStart: number;
  lineEnd: number;
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
  fileContents: Record<string, string>;
  annotations: Record<string, Annotation[]>;
  analysis: {
    languages: Array<{name: string; count: number; bytes: number; percentage: string}>;
    totalFiles: number;
    totalSize: number;
  };
  stars: number;
  forks: number;
  updatedAt: string;
  fromCache?: boolean;
}

export default function CodeViewer() {
  const [repoUrl, setRepoUrl] = useState("");
  const [repoData, setRepoData] = useState<RepoData | null>(null);
  const [loadingRepo, setLoadingRepo] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loadingFile, setLoadingFile] = useState(false);
  const [activeAnnotation, setActiveAnnotation] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [repoSummary, setRepoSummary] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [generalChatOpen, setGeneralChatOpen] = useState(false);
  const [generalChatMessages, setGeneralChatMessages] = useState<Array<{role: 'user' | 'assistant', content: string}>>([]);
  const [generalChatInput, setGeneralChatInput] = useState("");
  const [generalChatLoading, setGeneralChatLoading] = useState(false);
  const [selection, setSelection] = useState<SelectionData | null>(null);
  const [showSelectionButton, setShowSelectionButton] = useState(false);
  const questionModalOpenRef = useRef(questionModalOpen);
  const isHoveringButtonRef = useRef(false);
  const codeContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    questionModalOpenRef.current = questionModalOpen;
  }, [questionModalOpen]);

  useEffect(() => {
    if (!fileContent) return;

    let rafId: number | null = null;

    const handleSelection = (e: MouseEvent) => {
      if (questionModalOpenRef.current || isHoveringButtonRef.current) return;
      if (rafId) cancelAnimationFrame(rafId);

      rafId = requestAnimationFrame(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        
        const selectedText = sel.toString();
        if (!selectedText || selectedText.trim().length <= 3) {
          setSelection(null);
          setShowSelectionButton(false);
          return;
        }

        if (!codeContainerRef.current) return;
        const target = e.target as Node;
        if (!codeContainerRef.current.contains(target)) return;

        const trimmed = selectedText.trim();
        let lineStart = 1;
        let lineEnd = 1;
        
        try {
          const range = sel.getRangeAt(0);
          const preCaretRange = range.cloneRange();
          preCaretRange.selectNodeContents(codeContainerRef.current);
          preCaretRange.setEnd(range.startContainer, range.startOffset);
          const textBefore = preCaretRange.toString();
          let count = 0;
          for (let i = 0; i < textBefore.length; i++) {
            if (textBefore[i] === '\n') count++;
          }
          lineStart = count + 1;
          let selCount = 0;
          for (let i = 0; i < trimmed.length; i++) {
            if (trimmed[i] === '\n') selCount++;
          }
          lineEnd = lineStart + selCount;
        } catch {
          lineEnd = lineStart;
        }

        setSelection({ text: trimmed, lineStart, lineEnd });
        setShowSelectionButton(true);
      });
    };

    document.addEventListener('mouseup', handleSelection);
    return () => {
      document.removeEventListener('mouseup', handleSelection);
      if (rafId) cancelAnimationFrame(rafId);
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
    setFileContent("");
    setAnnotations([]);
    setActiveAnnotation(null);
    setLoadingFile(true);
    try {
      if (repoData.fileContents && repoData.fileContents[filePath]) {
        setFileContent(repoData.fileContents[filePath]);
        
        if (repoData.annotations && repoData.annotations[filePath]) {
          setAnnotations(repoData.annotations[filePath]);
        } else {
          const res = await fetch("/api/annotate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              fileContent: repoData.fileContents[filePath],
              fileName: filePath 
            }),
          });

          const data = await res.json();
          if (data.error) throw new Error(data.error);
          setAnnotations(data.annotations);
        }
      } else {
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
      }
    } catch (error) {
      alert("Error: " + (error as Error).message);
    } finally {
      setLoadingFile(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!repoData) return;
    
    setLoadingSummary(true);
    setShowSummaryModal(true);
    
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoData }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      setRepoSummary(data.summary);
    } catch (error) {
      setRepoSummary("Error generating summary: " + (error as Error).message);
    } finally {
      setLoadingSummary(false);
    }
  };

  const getTypeColor = (type: string) => {
    const colors = {
      info: "bg-blue-500/10 border-blue-500/40 text-blue-300",
      function: "bg-purple-500/10 border-purple-500/40 text-purple-300",
      class: "bg-green-500/10 border-green-500/40 text-green-300",
      important: "bg-orange-500/10 border-orange-500/40 text-orange-300",
      warning: "bg-red-500/10 border-red-500/40 text-red-300",
    };
    return colors[type as keyof typeof colors] || colors.info;
  };

  const filteredFiles = useMemo(() => {
    if (!repoData?.files) return [];
    const term = searchTerm.toLowerCase();
    return repoData.files.filter(f => f.path.toLowerCase().includes(term));
  }, [repoData?.files, searchTerm]);

  const iconMap: Record<string, string> = {
    js: "/icons/js.jpg",
    jsx: "/icons/react.png",
    ts: "/icons/typescript.png",
    tsx: "/icons/react.png",
    py: "/icons/python.png",
    java: "/icons/java.png",
    cpp: "/icons/cpp.png",
    c: "/icons/c.png",
    cs: "/icons/csharp.png",
    go: "/icons/go.png",
    rs: "/icons/rust.png",
    php: "/icons/php.png",
    r: "/icons/r.png",
    swift: "/icons/swift.png",
    html: "/icons/html.png",
    css: "/icons/css.png",
    json: "/icons/json.png",
    md: "/icons/md.png",
    yml: "/icons/yaml.png",
    yaml: "/icons/yaml.png",
    env: "/icons/env.png",
  };

  const getFileIconPath = (path: string) => {
    const ext = path.split('.').pop()?.toLowerCase();
    return iconMap[ext || ""] || "/icons/generic.png";
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
    return langMap[ext || ""] || "text";
  };

  const handleGeneralChat = async () => {
    if (!generalChatInput.trim() || generalChatLoading) return;

    const userMessage = generalChatInput.trim();
    setGeneralChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setGeneralChatInput("");
    setGeneralChatLoading(true);

    try {
      let contextMessage = userMessage;
      if (repoData) {
        contextMessage = `[Repository: ${repoData.owner}/${repoData.repo}]
[Description: ${repoData.description || 'No description'}]
[Languages: ${repoData.analysis.languages.map(l => `${l.name} (${l.percentage})`).join(', ')}]
${selectedFile ? `[Current file: ${selectedFile}]` : ''}
${fileContent ? `[File preview (first 2000 chars):\n\`\`\`\n${fileContent.slice(0, 2000)}\n\`\`\`]` : ''}

Question: ${userMessage}`;
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: contextMessage,
          analysisDepth: "standard",
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      setGeneralChatMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch {
      setGeneralChatMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I encountered an error. Please try again." }]);
    } finally {
      setGeneralChatLoading(false);
    }
  };

  const annotationMap = useMemo(() => {
    const map = new Map<number, number>();
    annotations.forEach((a, idx) => {
      for (let line = a.lineStart; line <= a.lineEnd; line++) {
        map.set(line, idx);
      }
    });
    return map;
  }, [annotations]);

  const linePropsCallback = useCallback((lineNumber: number) => {
    const annIdx = annotationMap.get(lineNumber);
    const hasAnnotation = annIdx !== undefined;
    const isActive = hasAnnotation && activeAnnotation === annIdx;
    
    if (!hasAnnotation) {
      return { style: { display: 'block' } };
    }
    
    return {
      style: {
        display: 'block',
        backgroundColor: isActive ? 'rgba(168, 85, 247, 0.1)' : 'rgba(168, 85, 247, 0.05)',
        borderLeft: '2px solid rgb(168, 85, 247)',
        paddingLeft: '0.5rem',
      },
    };
  }, [annotationMap, activeAnnotation]);

  return (
    <div className="min-h-screen bg-black">
      <div className="container mx-auto px-4 py-6">
        <div className="text-center mb-6">
          <h1 className="text-5xl font-bold text-white mb-2 tracking-tight">
            Repo Browser
          </h1>
        </div>

        <form onSubmit={handleLoadRepo} className="mb-6">
          <div className="bg-black rounded-xl p-4 border border-white/20">
            <div className="flex gap-3">
              <input
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="Paste GitHub repo URL (e.g., https://github.com/user/repo)"
                className="flex-1 px-4 py-3 bg-black border border-white/20 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-white/40"
              />
              <button
                type="submit"
                disabled={loadingRepo || !repoUrl.trim()}
                className="px-6 py-3 bg-black hover:bg-white/5 disabled:bg-black/50 border border-white/20 text-white font-semibold rounded-lg transition-all disabled:cursor-not-allowed disabled:text-slate-600"
              >
                {loadingRepo ? "Loading..." : "Load Repo"}
              </button>
            </div>
          </div>
        </form>

        {repoData && (
          <>
            <div className="bg-black rounded-xl p-6 border border-white/20 mb-4">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-white mb-1">{repoData.owner}/{repoData.repo}</h2>
                  {repoData.description && (
                    <p className="text-slate-300 mb-3">{repoData.description}</p>
                  )}
                  <div className="flex gap-4 text-sm text-slate-300">
                    <span>{repoData.files.length} files</span>
                    {repoData.fromCache && <span className="text-green-400">From Cache</span>}
                  </div>
                  
                  {repoData.analysis && (
                    <div className="mt-4">
                      <h3 className="text-white font-semibold mb-2">Languages</h3>
                      <div className="flex gap-2 flex-wrap">
                        {repoData.analysis.languages.slice(0, 5).map(lang => (
                          <span key={lang.name} className="px-3 py-1 bg-black border border-white/20 text-white rounded-full text-sm">
                            {lang.name} ({lang.percentage}%)
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                <button
                  onClick={handleGenerateSummary}
                  className="px-6 py-3 bg-black hover:bg-white/5 border border-white/20 text-white font-semibold rounded-lg transition-all"
                >
                  Repository Summary
                </button>
              </div>
            </div>

            <div className="grid lg:grid-cols-4 gap-4">
              <div className="lg:col-span-1">
                <div className="bg-black rounded-xl border border-white/20 overflow-hidden sticky top-4">
                  <div className="bg-black px-4 py-3 border-b border-white/20">
                    <h2 className="text-white font-semibold text-sm">Files ({repoData.files.length})</h2>
                  </div>
                  
                  <div className="p-3 border-b border-white/20">
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search files..."
                      className="w-full px-3 py-2 bg-black border border-white/20 rounded text-white text-sm placeholder-slate-600 focus:outline-none focus:border-white/40"
                    />
                  </div>

                  <div className="overflow-y-auto max-h-[70vh]">
                    {filteredFiles.map((file) => (
                      <button
                        key={file.path}
                        onClick={() => handleFileClick(file.path)}
                        className={`w-full text-left px-4 py-2 hover:bg-white/5 border-b border-white/10 transition-colors ${
                          selectedFile === file.path ? "bg-white/10" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <img src={getFileIconPath(file.path)} alt="" className="w-4 h-4 object-contain" />
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
                  <div className="bg-black rounded-xl border border-white/20 p-12 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
                  </div>
                ) : selectedFile && fileContent ? (
                  <div className="bg-black rounded-xl border border-white/20 overflow-hidden">
                    <div className="bg-black px-4 py-2 border-b border-white/20">
                      <h2 className="text-white font-mono text-sm">{selectedFile}</h2>
                    </div>

                    <div className="grid lg:grid-cols-2 gap-0">
                      <div className="border-r border-white/20 flex flex-col">
                        <div className="bg-black px-3 py-2 border-b border-white/20">
                          <span className="text-slate-400 text-xs font-semibold uppercase">Code</span>
                        </div>
                        <div ref={codeContainerRef} className="overflow-x-auto overflow-y-auto max-h-[70vh] code-selection">
                          <SyntaxHighlighter
                            language={getLanguage(selectedFile)}
                            style={vscDarkPlus}
                            showLineNumbers={true}
                            wrapLongLines={false}
                            customStyle={{
                              margin: 0,
                              padding: '1rem',
                              background: 'transparent',
                              fontSize: '0.875rem',
                              minWidth: 'max-content',
                            }}
                            lineNumberStyle={{
                              minWidth: '3em',
                              paddingRight: '1em',
                              color: '#6b7280',
                              userSelect: 'none',
                            }}
                            wrapLines={true}
                            lineProps={linePropsCallback}
                          >
                            {fileContent}
                          </SyntaxHighlighter>
                        </div>
                      </div>

                      <div>
                        <div className="bg-black px-3 py-2 border-b border-white/20">
                          <span className="text-slate-400 text-xs font-semibold uppercase">
                            AI Annotations ({annotations.length})
                          </span>
                        </div>
                        <div className="overflow-auto max-h-[70vh] p-4 space-y-2">
                          {annotations.length > 0 ? (
                            annotations.map((ann, idx) => (
                              <div
                                key={idx}
                                className={`p-3 rounded-lg border cursor-pointer transition-all ${getTypeColor(ann.type)} ${
                                  activeAnnotation === idx ? "ring-2 ring-purple-500 scale-[1.02]" : ""
                                }`}
                                onMouseEnter={() => setActiveAnnotation(idx)}
                                onMouseLeave={() => setActiveAnnotation(null)}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-mono text-slate-400">
                                    Lines {ann.lineStart}-{ann.lineEnd}
                                  </span>
                                  <span className="text-xs px-2 py-0.5 rounded bg-[#2a2a3e] capitalize text-purple-300">
                                    {ann.type}
                                  </span>
                                </div>
                                <p className="text-sm leading-relaxed text-slate-300">{ann.annotation}</p>
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
                ) : (
                  <div className="bg-black rounded-xl border border-white/20 p-12 text-center">
                    <h3 className="text-white text-xl font-semibold mb-2">Select a file to view</h3>
                    <p className="text-slate-400">Click any file from the list to see it with AI annotations</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {!repoData && !loadingRepo && (
          <div className="bg-black rounded-xl border border-white/20 p-12 text-center">
            <h3 className="text-white text-xl font-semibold mb-2">Paste a GitHub Repo URL to Start</h3>
            <p className="text-purple-200">Analyze repositories with AI-powered code insights and annotations</p>
          </div>
        )}

        {showSummaryModal && (
          <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4">
            <div className="bg-black rounded-2xl border-2 border-white/30 max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-2xl">
              <div className="bg-black px-6 py-4 flex justify-between items-center border-b border-white/30">
                <h2 className="text-xl font-bold text-white">Repository Summary</h2>
                <button
                  onClick={() => setShowSummaryModal(false)}
                  className="text-white hover:text-slate-400 text-2xl"
                >
                  ×
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
                {loadingSummary ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
                  </div>
                ) : (
                  <div className="text-white leading-relaxed">
                    {repoSummary}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {selectedFile && fileContent && showSelectionButton && selection && (
        <div 
          style={{ position: 'fixed', bottom: '32px', right: '32px', zIndex: 99999 }}
          onMouseEnter={() => isHoveringButtonRef.current = true}
          onMouseLeave={() => isHoveringButtonRef.current = false}
        >
          <div style={{ backgroundColor: '#000000' }} className="text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-white/20">
            <span className="text-sm text-slate-400">Lines {selection.lineStart}-{selection.lineEnd}</span>
            <button
              onClick={() => setQuestionModalOpen(true)}
              style={{ backgroundColor: '#ffffff', color: '#000000' }}
              className="px-4 py-2 hover:bg-slate-200 rounded-lg font-semibold transition-all"
            >
              Ask AI
            </button>
          </div>
        </div>
      )}

      {selection && (
        <CodeQuestionModal
          isOpen={questionModalOpen}
          onClose={() => {
            setQuestionModalOpen(false);
            setSelection(null);
            setShowSelectionButton(false);
            window.getSelection()?.removeAllRanges();
          }}
          selectedCode={selection.text}
          lineStart={selection.lineStart}
          lineEnd={selection.lineEnd}
          fileName={selectedFile || ""}
          language={selectedFile ? getLanguage(selectedFile) : "javascript"}
        />
      )}

      {}
      {repoData && !showSelectionButton && (
        <button
          onClick={() => setGeneralChatOpen(true)}
          style={{ position: 'fixed', bottom: '32px', right: '32px', zIndex: 99998 }}
          className="bg-white text-black px-5 py-3 rounded-xl shadow-2xl font-semibold hover:bg-slate-200 transition-all flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          Ask AI
        </button>
      )}

      {}
      {generalChatOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-black rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden border border-white/20 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-white/20">
              <div>
                <h2 className="text-xl font-bold text-white">Ask AI</h2>
                <p className="text-sm text-slate-400">
                  {repoData ? `${repoData.owner}/${repoData.repo}` : 'Chat about the code'}
                  {selectedFile && ` • ${selectedFile}`}
                </p>
              </div>
              <button
                onClick={() => setGeneralChatOpen(false)}
                className="text-slate-400 hover:text-white transition-colors p-2"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px]">
              {generalChatMessages.length === 0 ? (
                <div className="text-center text-slate-400 py-8">
                  <p className="mb-4">Ask anything about this repository or code</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {[
                      "What does this project do?",
                      "What are the main files?",
                      "Explain the architecture",
                      "What technologies are used?"
                    ].map((q, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setGeneralChatInput(q);
                        }}
                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg text-sm text-slate-300 transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                generalChatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg ${
                      msg.role === 'user' 
                        ? 'bg-white/10 ml-8' 
                        : 'bg-white/5 mr-8'
                    }`}
                  >
                    <div className="text-xs text-slate-400 mb-1">
                      {msg.role === 'user' ? 'You' : 'AI'}
                    </div>
                    {msg.role === 'user' ? (
                      <div className="text-white text-sm whitespace-pre-wrap">{msg.content}</div>
                    ) : (
                      <div className="text-white text-sm prose prose-invert prose-sm max-w-none prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/10 prose-code:text-purple-300 prose-headings:text-white prose-strong:text-white prose-table:text-sm prose-th:border prose-th:border-white/20 prose-th:p-2 prose-td:border prose-td:border-white/20 prose-td:p-2">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                ))
              )}
              {generalChatLoading && (
                <div className="flex items-center gap-2 text-slate-400 p-3">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Thinking...</span>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-white/20">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={generalChatInput}
                  onChange={(e) => setGeneralChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleGeneralChat()}
                  placeholder="Ask about the code..."
                  className="flex-1 px-4 py-2 bg-black border border-white/20 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-white/40"
                  disabled={generalChatLoading}
                />
                <button
                  onClick={handleGeneralChat}
                  disabled={generalChatLoading || !generalChatInput.trim()}
                  className="px-4 py-2 bg-white text-black rounded-lg font-semibold hover:bg-slate-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
