import OpenAI from "openai";
let messages = [
  {
    role: "system",
    content: "You are a witty senior software development engineer. You like to make pop culture references, and your task is to take GitHub links or code and explain its source code in detail."
  }
];
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
export async function POST(req) {
  try {
    const body = await req.json();

  
    const userMessage = String(body.message || "Hello! (no message provided)");
    messages.push({
      role: "user",
      content: userMessage
    });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages
    });
    const reply = completion.choices[0].message.content;
    messages.push({
      role: "assistant",
      content: reply
    });
    return new Response(JSON.stringify({ reply }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Error in POST /api/chat:", error);

    return new Response(JSON.stringify({ reply: "Oops! Something went wrong." }), {
      headers: { "Content-Type": "application/json" },
      status: 500
    });
  }
}
