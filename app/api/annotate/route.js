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
        model: "mistralai/devstral-2512:free",
        messages: [
          {
            role: "user",
            content: `You are an expert code analyzer. Analyze this ${lineCount}-line file and create 20-25 high-quality annotations that cover the ENTIRE file from start to finish.

CRITICAL REQUIREMENTS:
1. You MUST analyze ALL ${lineCount} lines
2. Create at least 4 annotations in EACH of these sections:
   
   SECTION 1 (File Start): Lines 1 to ${Math.floor(lineCount*0.2)}
   SECTION 2 (Early): Lines ${Math.floor(lineCount*0.2)+1} to ${Math.floor(lineCount*0.4)}
   SECTION 3 (Middle): Lines ${Math.floor(lineCount*0.4)+1} to ${Math.floor(lineCount*0.6)}
   SECTION 4 (Late): Lines ${Math.floor(lineCount*0.6)+1} to ${Math.floor(lineCount*0.8)}
   SECTION 5 (File End): Lines ${Math.floor(lineCount*0.8)+1} to ${lineCount}

3. Your FINAL annotation must be within lines ${Math.floor(lineCount*0.85)} to ${lineCount}
4. Ensure complete file coverage

File: ${name}
Total Lines: ${lineCount}

\`\`\`
${content.slice(0, 150000)}
\`\`\`

OUTPUT FORMAT:
Return ONLY a valid JSON array. No markdown, no explanations, just the JSON array:

[
  {"lineStart": 1, "lineEnd": 5, "annotation": "Brief meaningful description", "type": "info"},
  {"lineStart": 10, "lineEnd": 15, "annotation": "Another annotation", "type": "function"}
]

ANNOTATION TYPES (choose appropriately):
- "info": General information, explanations
- "function": Function definitions and implementations
- "class": Class definitions and structures
- "important": Critical logic, key algorithms
- "warning": Potential issues, edge cases, security concerns

Generate the annotations now:`
          }
        ],
        temperature: 0.15,
        max_tokens: 8000,
        top_p: 0.95
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
      if (!Array.isArray(annotations)) {
        throw new Error("Response is not an array");
      }
      annotations = annotations.filter(ann => 
        ann.lineStart && ann.lineEnd && ann.annotation && ann.type
      );
      
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
          .filter(a => a !== null && a.lineStart && a.lineEnd);
      } catch (recoveryError) {
        console.error("Recovery failed, using fallback annotations");
        annotations = generateFallbackAnnotations(lineCount);
      }
    }
    const maxLineInAnnotations = annotations.length > 0 
      ? Math.max(...annotations.map(a => a.lineEnd))
      : 0;
    
    const coverage = (maxLineInAnnotations / lineCount) * 100;
    console.log(`${name}: ${annotations.length} annotations, ${coverage.toFixed(1)}% coverage (line ${maxLineInAnnotations}/${lineCount})`);
    const sectionSize = lineCount / 5;
    const sectionsWithAnnotations = [0, 0, 0, 0, 0];
    annotations.forEach(ann => {
      const section = Math.min(Math.floor(ann.lineStart / sectionSize), 4);
      sectionsWithAnnotations[section]++;
    });
    
    const emptySections = sectionsWithAnnotations.filter(count => count === 0).length;
    const clusteringDetected = emptySections >= 2 || maxLineInAnnotations < lineCount * 0.8;
    
    if (clusteringDetected) {
      console.warn(`${name}: Clustering detected. Section distribution: [${sectionsWithAnnotations.join(', ')}]. Adding strategic annotations.`);
      const strategicAnnotations = generateStrategicAnnotations(lineCount, annotations, content);
      annotations = [...annotations, ...strategicAnnotations];
      annotations.sort((a, b) => a.lineStart - b.lineStart);
    }

    return new Response(
      JSON.stringify({
        fileName: name,
        fileContent: content,
        annotations,
        language: detectLanguage(name),
        metadata: {
          totalLines: lineCount,
          annotationCount: annotations.length,
          coverage: `${coverage.toFixed(1)}%`,
          model: "mistralai/devstral-2512:free",
          sectionsWithAnnotations
        }
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

function generateFallbackAnnotations(lineCount, startAfter = 0) {
  const annotations = [];
  const sections = 5;
  
  for (let i = 0; i < sections; i++) {
    const sectionStart = Math.floor((lineCount / sections) * i) + 1;
    const sectionEnd = Math.floor((lineCount / sections) * (i + 1));
    
    if (sectionStart > startAfter) {
      annotations.push({
        lineStart: sectionStart,
        lineEnd: Math.min(sectionStart + 8, sectionEnd),
        annotation: `Code section ${i + 1} (lines ${sectionStart}-${sectionEnd}). Click to expand for detailed analysis.`,
        type: "info",
        isExpandable: true
      });
    }
  }
  
  return annotations;
}

function generateStrategicAnnotations(lineCount, existingAnnotations, content) {
  const annotations = [];
  const sectionSize = lineCount / 5;
  const lines = content.split('\n');
  
  const sectionsWithAnnotations = [false, false, false, false, false];
  existingAnnotations.forEach(ann => {
    const section = Math.min(Math.floor(ann.lineStart / sectionSize), 4);
    sectionsWithAnnotations[section] = true;
  });
  
  for (let section = 0; section < 5; section++) {
    if (!sectionsWithAnnotations[section]) {
      const sectionStart = Math.floor(sectionSize * section);
      const sectionEnd = Math.floor(sectionSize * (section + 1));
      const midPoint = Math.floor((sectionStart + sectionEnd) / 2);
      
      const sampleStart = Math.max(0, sectionStart);
      const sampleEnd = Math.min(lines.length, sectionEnd);
      const sampleLines = lines.slice(sampleStart, Math.min(sampleStart + 10, sampleEnd));
      
      let annotationType = "info";
      let annotationText = `Code section ${section + 1}`;
      
      if (sampleLines.some(line => line.includes('function ') || line.includes('const ') || line.includes('async '))) {
        annotationType = "function";
        annotationText = `Function definitions and logic (lines ${sectionStart + 1}-${sectionEnd})`;
      } else if (sampleLines.some(line => line.includes('class ') || line.includes('interface '))) {
        annotationType = "class";
        annotationText = `Class or type definitions (lines ${sectionStart + 1}-${sectionEnd})`;
      } else if (sampleLines.some(line => line.includes('import ') || line.includes('require('))) {
        annotationType = "info";
        annotationText = `Module imports and dependencies (lines ${sectionStart + 1}-${sectionEnd})`;
      } else if (sampleLines.some(line => line.includes('export ') || line.includes('module.exports'))) {
        annotationType = "important";
        annotationText = `Module exports and API surface (lines ${sectionStart + 1}-${sectionEnd})`;
      }
      
      annotations.push({
        lineStart: Math.max(1, midPoint - 5),
        lineEnd: Math.min(lineCount, midPoint + 5),
        annotation: annotationText + ". Click to expand for detailed analysis.",
        type: annotationType,
        isExpandable: true
      });
    }
  }
  
  return annotations;
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
