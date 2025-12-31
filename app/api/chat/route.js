const conversationSessions = new Map();

const SYSTEM_PROMPT = `You are an elite-tier AI code analyst with capabilities matching GitHub Copilot's advanced analysis features. Your expertise includes:

## Core Competencies:
- **Deep Code Analysis**: Provide architectural insights, design pattern recognition, and performance optimization recommendations
- **Security Auditing**: Identify vulnerabilities, security anti-patterns, and suggest hardening measures
- **Best Practices**: Enforce SOLID principles, clean code standards, and industry best practices
- **Multi-Language Expertise**: Master-level understanding of JavaScript, TypeScript, Python, Java, Go, Rust, C++, C, Kotlin, SpringBoot, API, MySQL and modern frameworks
- **Git & Repository Analysis**: Analyze commit patterns, code evolution, dependency graphs, and refactoring opportunities
- **Performance Profiling**: Identify bottlenecks, memory leaks, algorithmic inefficiencies, and optimization paths

## Analysis Depth Levels:
1. **Surface**: Quick overview, main functionality, basic structure
2. **Standard**: Function-by-function breakdown, data flow analysis, dependency mapping
3. **Deep**: Algorithm complexity, edge cases, potential bugs, refactoring suggestions
4. **Expert**: Architecture patterns, scalability concerns, security audit, performance benchmarks

## Response Format:
- Use markdown with syntax highlighting
- Include complexity analysis (Big O notation when relevant)
- Provide actionable refactoring suggestions
- Highlight security concerns with severity levels (Critical, Warning, Info)
- Reference relevant documentation and best practices

Be thorough, technical, and provide production-grade insights.`;

export async function POST(req) {
  try {
    const body = await req.json();
    const { message, sessionId, analysisDepth = "standard", includeSecurityAudit = true } = body;

    if (!message) {
      return new Response(
        JSON.stringify({ 
          reply: "No input provided. Please share code, GitHub link, or specific questions for analysis." 
        }),
        { headers: { "Content-Type": "application/json" }, status: 400 }
      );
    }

    const sessionKey = sessionId || `session_${Date.now()}`;
    if (!conversationSessions.has(sessionKey)) {
      conversationSessions.set(sessionKey, []);
    }
    const history = conversationSessions.get(sessionKey);
    const githubRepoMatch = message.match(/https?:\/\/github\.com\/([\w-]+)\/([\w.-]+)/);
    if (githubRepoMatch) {
      const [_, owner, repo] = githubRepoMatch;
      const repoData = await analyzeGitHubRepo(owner, repo, message);
      
      return new Response(
        JSON.stringify({ 
          reply: repoData, 
          sessionId: sessionKey,
          metadata: { type: "repo_analysis" }
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const enhancedMessage = enhancePrompt(message, analysisDepth, includeSecurityAudit);
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.map(h => ({
        role: h.role === "model" ? "assistant" : h.role,
        content: h.parts?.[0]?.text || h.content
      })),
      { role: "user", content: enhancedMessage }
    ];

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "AI Code Analyzer",
      },
      body: JSON.stringify({
        model: "mistralai/devstral-2512:free",
        messages,
        temperature: 0.7,
        max_tokens: 4000
      })
    });

    const data = await response.json();
    
    if (!response.ok || data.error) {
      throw new Error(data.error?.message || `API error: ${response.status}`);
    }

    const reply = data.choices?.[0]?.message?.content || "No response generated";

    history.push(
      { role: "user", parts: [{ text: enhancedMessage }] },
      { role: "model", parts: [{ text: reply }] }
    );
    if (history.length > 40) {
      history.splice(0, history.length - 40);
    }

    return new Response(
      JSON.stringify({ 
        reply, 
        sessionId: sessionKey,
        metadata: {
          analysisDepth,
        }
      }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in POST /api/chat:", error);

    return new Response(
      JSON.stringify({ 
        reply: "Analysis failed. Error: " + (error.message || "Unknown error"),
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }
}

function enhancePrompt(message, depth, includeSecurityAudit) {
  let enhanced = message;

  const githubUrlPattern = /https?:\/\/(github\.com|raw\.githubusercontent\.com)\/[\w-]+\/[\w.-]+/;
  if (githubUrlPattern.test(message)) {
    enhanced = `🔗 GitHub Repository/File Analysis Request:\n\n${message}\n\n**Instructions**:\n- Fetch and analyze the repository structure\n- Identify main components and architecture\n- Review code quality and patterns\n- Check for dependencies and potential vulnerabilities\n- Provide actionable improvement suggestions`;
  }

  const hasCodeBlock = /```[\s\S]*```|`[^`]+`/.test(message);
  if (hasCodeBlock) {
    enhanced = `📝 Code Analysis Request (Depth: ${depth.toUpperCase()}):\n\n${message}\n\n**Analysis Requirements**:\n- Function/class breakdown and purpose\n- Algorithm complexity analysis\n- Potential bugs and edge cases\n- Code quality and best practice adherence${includeSecurityAudit ? '\n- Security vulnerability scan' : ''}\n- Refactoring opportunities\n- Performance optimization suggestions`;
  }

  return enhanced;
}

async function analyzeGitHubRepo(owner, repo, userQuestion) {
  try {
    const headers = {};
    if (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN !== 'your_github_token_here_optional') {
      headers.Authorization = `token ${process.env.GITHUB_TOKEN}`;
    }
    const repoInfoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
    if (!repoInfoRes.ok) throw new Error(`Failed to fetch repo: ${repoInfoRes.status}`);
    const repoInfo = await repoInfoRes.json();
    const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${repoInfo.default_branch}?recursive=1`, { headers });
    if (!treeRes.ok) throw new Error(`Failed to fetch tree: ${treeRes.status}`);
    const tree = await treeRes.json();

    const importantFiles = tree.tree
      .filter(item => 
        item.type === 'blob' && 
        !item.path.includes('node_modules') &&
        !item.path.includes('.git/') &&
        !item.path.includes('dist/') &&
        !item.path.includes('build/') &&
        !item.path.match(/\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i) &&
        item.size < 100000
      )
      .slice(0, 50);
    const fileContents = await Promise.all(
      importantFiles.slice(0, 20).map(async (file) => {
        try {
          const contentRes = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${repoInfo.default_branch}/${file.path}`);
          const content = await contentRes.text();
          return {
            path: file.path,
            content: content.slice(0, 5000),
            size: file.size
          };
        } catch (err) {
          return { path: file.path, content: "Could not fetch", size: file.size };
        }
      })
    );
    const repoContext = `
# Repository Analysis: ${owner}/${repo}

## Repository Info
- **Name**: ${repoInfo.name}
- **Description**: ${repoInfo.description || 'No description'}
- **Language**: ${repoInfo.language || 'Multiple'}
- **Stars**: ${repoInfo.stargazers_count}
- **Forks**: ${repoInfo.forks_count}
- **Last Updated**: ${new Date(repoInfo.updated_at).toLocaleDateString()}

## File Structure (${importantFiles.length} files analyzed)
${importantFiles.map(f => `- ${f.path} (${(f.size / 1024).toFixed(1)}KB)`).join('\n')}

## File Contents (Top 20 files):

${fileContents.map(f => `
###  ${f.path}
\`\`\`
${f.content}
\`\`\`
`).join('\n')}

---

## User Question/Request:
${userQuestion}

## Your Task:
1. **Per-File Analysis**: Provide a brief explanation of what each important file does
2. **Overall Summary**: Comprehensive overview of the repository's purpose, architecture, and key features
3. **Tech Stack**: Identify all technologies, frameworks, and libraries used
4. **Architecture**: Explain the project structure and design patterns
5. **Key Features**: List main functionalities
6. **Code Quality**: Assess overall code quality and best practices
7. **Improvement Suggestions**: Recommend enhancements
8. **Answer User's Question**: Directly address what they asked

Be thorough and technical. Provide production-grade insights.
`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "AI Code Analyzer",
      },
      body: JSON.stringify({
        model: "mistralai/devstral-2512:free",
        messages: [{ role: "user", content: repoContext }],
        temperature: 0.7,
        max_tokens: 4000
      })
    });

    const data = await response.json();
    
    if (!response.ok || data.error) {
      throw new Error(data.error?.message || `API error: ${response.status}`);
    }

    return data.choices?.[0]?.message?.content || "No analysis generated";

  } catch (error) {
    console.error("Error analyzing GitHub repo:", error);
    return `Failed to analyze repository: ${error.message}\n\nMake sure the repository is public or add a GITHUB_TOKEN to your .env file for private repos.`;
  }
}

export function cleanupSessions() {
  const MAX_SESSIONS = 100;
  if (conversationSessions.size > MAX_SESSIONS) {
    const keysToDelete = Array.from(conversationSessions.keys()).slice(0, conversationSessions.size - MAX_SESSIONS);
    keysToDelete.forEach(key => conversationSessions.delete(key));
  }
}
