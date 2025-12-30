import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req) {
  try {
    const { fileUrl, filePath, fileContent, fileName } = await req.json();

    if (!fileUrl && !filePath && !fileContent) {
      return new Response(
        JSON.stringify({ error: "No file URL, path, or content provided" }),
        { headers: { "Content-Type": "application/json" }, status: 400 }
      );
    }

    let content;
    let name;

    if (fileContent) {
      content = fileContent;
      name = fileName || filePath || "unknown";
    } else if (fileUrl) {
      const githubMatch = fileUrl.match(/github\.com\/([\w-]+)\/([\w.-]+)\/blob\/([\w.-]+)\/(.*)/);
      if (githubMatch) {
        const [_, owner, repo, branch, path] = githubMatch;
        name = path.split('/').pop();
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
        const response = await fetch(rawUrl);
        content = await response.text();
      } else {
        return new Response(
          JSON.stringify({ error: "Invalid GitHub URL format" }),
          { headers: { "Content-Type": "application/json" }, status: 400 }
        );
      }
    }

    const lineCount = content.split('\n').length;
    
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
            content: `Analyze this ${lineCount}-line file. Create 15-20 annotations distributed throughout:

MANDATORY COVERAGE:
- Beginning: lines 1-${Math.floor(lineCount*0.2)}
- Early-Mid: lines ${Math.floor(lineCount*0.2)}-${Math.floor(lineCount*0.4)}
- Middle: lines ${Math.floor(lineCount*0.4)}-${Math.floor(lineCount*0.6)}
- Late-Mid: lines ${Math.floor(lineCount*0.6)}-${Math.floor(lineCount*0.8)}
- End: lines ${Math.floor(lineCount*0.8)}-${lineCount}

File: ${name}

\`\`\`
${content.slice(0, 100000)}
\`\`\`

Return ONLY a JSON array. NO markdown, NO extra text:
[{"lineStart":1,"lineEnd":5,"annotation":"Brief description","type":"info"}]
Types: "info", "function", "class", "important", "warning"

CREATE 15-20 ANNOTATIONS SPANNING THE ENTIRE FILE!`
          }
        ],
        temperature: 0.3,
        max_tokens: 4000
      })
    });

    const data = await response.json();
    
    if (!response.ok || data.error) {
      throw new Error(data.error?.message || `API error: ${response.status}`);
    }
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error("Invalid API response:", data);
      return new Response(
        JSON.stringify({
          fileName: name,
          fileContent: content,
          annotations: [],
          language: detectLanguage(name),
        }),
        { headers: { "Content-Type": "application/json" } }
      );
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
      .replace(/}\s*,\s*{/g, '},{')
      .replace(/\[\s*/g, '[')
      .replace(/\s*\]/g, ']')
      .replace(/{\s*/g, '{')
      .replace(/\s*}/g, '}');
    
    let annotations;
    try {
      annotations = JSON.parse(responseText);
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError);
      console.error("Failed to parse:", responseText.substring(0, 500));
      
      try {
        const lines = responseText.split(/(?<=}),(?={)/);
        annotations = lines
          .map(line => {
            try {
              const cleaned = line.trim().replace(/^[\[\{]|[\]\}]$/g, '');
              if (cleaned) {
                return JSON.parse('{' + cleaned.replace(/^{|}$/g, '') + '}');
              }
            } catch (e) {
              return null;
            }
          })
          .filter(a => a !== null);
      } catch (recoveryError) {
        console.error("Recovery failed, returning empty annotations");
        annotations = [];
      }
    }

    return new Response(
      JSON.stringify({
        fileName: name,
        fileContent: content,
        annotations,
        language: detectLanguage(name),
      }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error annotating file:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }
}

function detectLanguage(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  const langMap = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    cs: 'csharp',
    go: 'go',
    rs: 'rust',
    php: 'php',
    rb: 'ruby',
    swift: 'swift',
    kt: 'kotlin',
    css: 'css',
    html: 'html',
    json: 'json',
    md: 'markdown',
  };
  return langMap[ext] || 'plaintext';
}
