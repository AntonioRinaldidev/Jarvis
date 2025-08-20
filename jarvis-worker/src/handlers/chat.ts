import { 
  getImportantMemories, 
  getRecentHistory, 
  saveConversation, 
  updateMemoryIfImportant 
} from "../database";
import { generateSessionId } from "../utils/session";
import type { Env } from "../types/env";
import { getCurrentSummary, handleSummarization } from "./summarization";
import { buildContextualPrompt, buildChatMessages, buildChatMessagesWithRAG } from "../ai/prompt";
import { RAGRetriever } from "../ai/rag-retriever";

async function extractRequestData(request: Request) {
  let body;
  try {
    body = await request.json() as { message?: string; session_id?: string };
  } catch (error) {
    throw new Error("Invalid JSON format");
  }
  
  if (!body.message || typeof body.message !== 'string') {
    throw new Error("Missing or invalid 'message' field");
  }
  if (body.message.trim() === '') {
    throw new Error("Message cannot be empty");
  }
  
  return {
    message: body.message.trim(),
    session_id: body.session_id || null
  };
}

export async function handleChat(request: Request, env: Env, ctx: ExecutionContext) {
  const { message, session_id } = await extractRequestData(request);
  const finalSessionId = session_id || generateSessionId();
  
  const [ summary, messages] = await Promise.all([

    getCurrentSummary(env.DB, finalSessionId),
    getRecentHistory(env.DB, finalSessionId, 3)
  ]);
  
  const isFirstMessage = messages.length === 0;

  const ragRetriever = new RAGRetriever(env.VECTORIZE_INDEX, env.AI);


  let chatMessages: Array<{ role: "system" | "user" | "assistant", content: string }>;
  let usingRAG = false;

  try {
    chatMessages = await buildChatMessagesWithRAG(
      message,
      messages,
      isFirstMessage,
      ragRetriever,
      summary,
  
    );
    usingRAG = true;
    console.log('✅ Using RAG-enhanced chat');
  } catch (ragError) {
    console.warn('⚠️ RAG failed, falling back to normal chat:', ragError);
    chatMessages = buildChatMessages(
      message,
      messages,
      isFirstMessage,
      summary,

    );
    usingRAG = false;
  }

  let jarvisResponse: string;

  try {
    const modelId = '@cf/meta/llama-3.1-8b-instruct';
    let aiResponse: any;

    // Usa sempre chatMessages (formato moderno)
    if (modelId.includes("instruct") || modelId.includes("chat")) {
      aiResponse = await env.AI.run(modelId, {
        messages: chatMessages,
      });
    } else {
      // Fallback per modelli vecchi (se necessario)
      const contextualPrompt = buildChatMessages(message, messages, isFirstMessage, summary);
      aiResponse = await env.AI.run(modelId, {
        messages: contextualPrompt,
      });
    }
    console.log(aiResponse);
    if (typeof aiResponse === 'string') {
      jarvisResponse = aiResponse;
    } else if (aiResponse && typeof aiResponse === 'object') {
      jarvisResponse = aiResponse.response ||
                       aiResponse.text ||
                       aiResponse.result ||
                       JSON.stringify(aiResponse);
    } else {
      jarvisResponse = "I couldn't generate a response.";
    }

  } catch (error) {
    console.error('❌ AI call failed:', error);
    return Response.json({
      error: "JARVIS is temporarily unavailable",
      details: "AI service error"
    }, { 
      status: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      }
    });
  }

  const currentMessageCount = await saveConversation(env.DB, message, jarvisResponse, finalSessionId);

  ctx.waitUntil(
    handleSummarization(env, finalSessionId, currentMessageCount)
      .catch(error => console.error('Background summarization failed:', error))
  );

  return Response.json({
    jarvis: jarvisResponse,
    session_id: finalSessionId,
    status: "online",
    timestamp: new Date().toISOString(),
    context_used: messages.length,
    rag_enabled: usingRAG // 🔹 AGGIUNGI QUESTO per debug
  }, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    }
  });
}