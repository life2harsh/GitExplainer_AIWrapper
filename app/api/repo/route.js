import { getCachedRepo, setCachedRepo } from '../../../lib/cache.js';
import { isAnalyzableFile, analyzeRepoLanguages } from '../../../lib/fileFilter.js';

async function generateAnnotations(content, fileName) {
  try {
    const maxChars = 100000;
    const truncated = content.length > maxChars ? content.slice(0, maxChars) : content;
    const lineCount = truncated.split('\n').length;
    
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "AI Code Analyzer",
      },
      body: JSON.stringify({
        model: "kwaipilot/kat-coder-pro:free",
        messages: [
          {
            role: "user",
            content: `Analyze this ${lineCount}-line file and create annotations covering the ENTIRE file from line 1 to ${lineCount}.

CRITICAL: You MUST create at least 15-20 annotations distributed across:
- Beginning (lines 1-${Math.floor(lineCount*0.2)})
- Early-Mid (lines ${Math.floor(lineCount*0.2)}-${Math.floor(lineCount*0.4)})
- Middle (lines ${Math.floor(lineCount*0.4)}-${Math.floor(lineCount*0.6)})
- Late-Mid (lines ${Math.floor(lineCount*0.6)}-${Math.floor(lineCount*0.8)})
- End (lines ${Math.floor(lineCount*0.8)}-${lineCount})

File: ${fileName}

\`\`\`
${truncated}
\`\`\`

Return ONLY a JSON array. NO OTHER TEXT.
[{"lineStart":1,"lineEnd":5,"annotation":"Brief description","type":"info"}]
Types: "info", "function", "class", "important", "warning"

PROVIDE 15-20 ANNOTATIONS COVERING ALL SECTIONS!`
          }
        ],
        temperature: 0.3,
        max_tokens: 4000
      })
    });

    const data = await response.json();
    
    if (!response.ok || data.error) {
      console.error(`API error for ${fileName}:`, data.error?.message || response.status);
      return [];
    }
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error(`Invalid response for ${fileName}`);
      return [];
    }
    
    let responseText = data.choices[0].message.content.trim();
    
    const jsonMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      responseText = jsonMatch[1].trim();
    }
    
    const arrayMatch = responseText.match(/(\[[\s\S]*\])/);
    if (arrayMatch) {
      responseText = arrayMatch[1];
    }
    
    responseText = responseText
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/"\s*,\s*"/g, '","')
      .replace(/}\s*,\s*{/g, '},{');
    
    return JSON.parse(responseText);
  } catch (error) {
    console.error(`Annotation error for ${fileName}:`, error.message);
    return [];
  }
}

export async function POST(req) {
  try {
    const { repoUrl } = await req.json();

    const match = repoUrl.match(/github\.com\/([\w-]+)\/([\w.-]+)/);
    if (!match) {
      return new Response(
        JSON.stringify({ error: "Invalid GitHub URL" }),
        { headers: { "Content-Type": "application/json" }, status: 400 }
      );
    }

    const [_, owner, repo] = match;
    const repoKey = `${owner}/${repo}`;
    
    const cached = getCachedRepo(repoKey);
    if (cached) {
      return new Response(
        JSON.stringify({ ...cached, fromCache: true }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const headers = {};
    if (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN !== 'your_github_token_here_optional') {
      headers.Authorization = `token ${process.env.GITHUB_TOKEN}`;
    }

    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
    if (!repoRes.ok) throw new Error(`Failed to fetch repo: ${repoRes.status}`);
    const repoInfo = await repoRes.json();

    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${repoInfo.default_branch}?recursive=1`,
      { headers }
    );
    if (!treeRes.ok) throw new Error(`Failed to fetch tree: ${treeRes.status}`);
    const tree = await treeRes.json();

    const files = tree.tree
      .filter(item => item.type === 'blob' && isAnalyzableFile(item.path, item.size))
      .map(item => ({
        path: item.path,
        size: item.size,
        type: item.type,
      }));

    const fileContents = {};
    const annotations = {};
    const batchSize = 20;
    const filesToFetch = files.slice(0, batchSize);
    
    await Promise.all(
      filesToFetch.map(async (file) => {
        try {
          const contentRes = await fetch(
            `https://raw.githubusercontent.com/${owner}/${repo}/${repoInfo.default_branch}/${file.path}`
          );
          if (contentRes.ok) {
            const content = await contentRes.text();
            fileContents[file.path] = content;
            
            const ext = file.path.split('.').pop()?.toLowerCase();
            if (['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'cpp', 'c', 'go', 'rs'].includes(ext)) {
              annotations[file.path] = await generateAnnotations(content, file.path);
            }
          }
        } catch (err) {
          console.error(`Failed to fetch ${file.path}:`, err);
        }
      })
    );

    const repoAnalysis = analyzeRepoLanguages(files);

    const response = {
      owner,
      repo,
      branch: repoInfo.default_branch,
      description: repoInfo.description,
      files,
      fileContents,
      annotations,
      analysis: repoAnalysis,
      stars: repoInfo.stargazers_count,
      forks: repoInfo.forks_count,
      updatedAt: repoInfo.updated_at,
    };

    setCachedRepo(repoKey, response);

    return new Response(
      JSON.stringify(response),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error fetching repo:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }
}
