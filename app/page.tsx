"use client";

import { useState } from "react";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface Annotation {
  lineStart: number;
  lineEnd: number;
  annotation: string;
  type: "info" | "function" | "class" | "important" | "warning";
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

export default function Home() {
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
      if (repoData.fileContents[filePath]) {
        setFileContent(repoData.fileContents[filePath]);
        
        if (repoData.annotations[filePath]) {
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
                {loadingRepo ? "Loading..." : "Analyze Repo"}
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
                    {repoData.fromCache && <span className="text-green-400">⚡ From Cache</span>}
                  </div>
                  
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
                  <div className="bg-black rounded-xl border border-white/20 overflow-hidden">
                    <div className="bg-black px-4 py-2 border-b border-white/20">
                      <h2 className="text-white font-mono text-sm">{selectedFile}</h2>
                    </div>

                    <div className="grid lg:grid-cols-2 gap-0">
                      <div className="border-r border-white/20">
                        <div className="bg-black px-3 py-2 border-b border-white/20">
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
                            wrapLines={true}
                            lineProps={(lineNumber) => {
                              const hasAnnotation = annotations.find(
                                (a) => lineNumber >= a.lineStart && lineNumber <= a.lineEnd
                              );
                              const activeAnn = activeAnnotation !== null && annotations[activeAnnotation];
                              const isActive = activeAnn && 
                                lineNumber >= activeAnn.lineStart && 
                                lineNumber <= activeAnn.lineEnd;
                              
                              return {
                                style: {
                                  display: 'block',
                                  backgroundColor: isActive ? 'rgba(168, 85, 247, 0.1)' : 
                                                  hasAnnotation ? 'rgba(168, 85, 247, 0.05)' : 'transparent',
                                  borderLeft: hasAnnotation ? '2px solid rgb(168, 85, 247)' : 'none',
                                  paddingLeft: hasAnnotation ? '0.5rem' : '0',
                                },
                                onMouseEnter: () => {
                                  if (hasAnnotation) {
                                    const annIdx = annotations.findIndex(
                                      (a) => lineNumber >= a.lineStart && lineNumber <= a.lineEnd
                                    );
                                    setActiveAnnotation(annIdx);
                                  }
                                },
                              };
                            }}
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
    </div>
  );
}
