export async function POST(req) {
  try {
    const { code, lineStart, lineEnd, fileName, question, mode = "detailed" } = await req.json();

    if (!code) {
      return new Response(
        JSON.stringify({ error: "No code provided" }),
        { headers: { "Content-Type": "application/json" }, status: 400 }
      );
    }

    const lineCount = code.split('\n').length;
    
    let promptContent;
    if (mode === "qa" && question) {
      promptContent = `You are an expert code analyzer. Answer the following question about this code section.

File: ${fileName || "unknown"}
Lines: ${lineStart}-${lineEnd} (${lineCount} lines total)

Code:
\`\`\`
${code}
\`\`\`

Question: ${question}

Provide a clear, concise answer focusing specifically on the question asked. Include relevant code references and line numbers when helpful.`;
    } else {
      promptContent = `You are an expert code analyzer. Provide a comprehensive analysis of this code section.

File: ${fileName || "unknown"}
Lines: ${lineStart}-${lineEnd} (${lineCount} lines total)

Code:
\`\`\`
${code}
\`\`\`

Provide a detailed analysis covering:
1. Purpose: What this code does
2. Key Components: Main functions, classes, or logic
3. Dependencies: External libraries or modules used
4. Potential Issues: Bugs, security concerns, or improvements
5. Best Practices: Any recommendations

Be specific and reference actual code elements.`;
    }

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
            content: promptContent
          }
        ],
        temperature: 0.2,
        max_tokens: 2000
      })
    });

    const data = await response.json();
    
    if (!response.ok || data.error) {
      console.error("API error:", data.error?.message || response.status);
      throw new Error(data.error?.message || `API error: ${response.status}`);
    }
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error("Invalid API response");
    }
    const analysis = data.choices[0].message.content.trim();
    return new Response(
      JSON.stringify({
        analysis,
        lineStart,
        lineEnd,
        fileName,
        mode
      }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error analyzing section:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }
}
