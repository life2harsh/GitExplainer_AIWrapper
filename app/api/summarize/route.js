export async function POST(req) {
  try {
    const { repoData } = await req.json();

    if (!repoData) {
      return new Response(
        JSON.stringify({ error: "No repo data provided" }),
        { headers: { "Content-Type": "application/json" }, status: 400 }
      );
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
            content: `Summarize this GitHub repository concisely in plain text. Do NOT use any markdown formatting (no **, no \`, no #). Just write normal sentences.

Repository: ${repoData.owner}/${repoData.repo}
Description: ${repoData.description || 'No description'}
Stars: ${repoData.stars}
Files: ${repoData.files.length}

Top Languages: ${repoData.analysis.languages.slice(0, 3).map(l => `${l.name} (${l.percentage}%)`).join(', ')}

Key Files:
${repoData.files.slice(0, 10).map(f => `- ${f.path}`).join('\n')}

Provide a concise summary covering: purpose, tech stack, key features, and architecture. Write in plain text only, no markdown, no word count.`
          }
        ]
      })
    });

    const data = await response.json();
    console.log("OpenRouter response:", JSON.stringify(data, null, 2));
    
    if (!response.ok || data.error) {
      throw new Error(data.error?.message || `API error: ${response.status}`);
    }
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error("Invalid API response structure");
    }
    
    const summary = data.choices[0].message.content.trim();

    return new Response(
      JSON.stringify({ summary }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error generating summary:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }
}
