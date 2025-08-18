import { getImportantMemories, getRecentHistory, saveConversation, updateMemoryIfImportant } from "../database";
import { generateSessionId } from "../utils/session";
import type { Env } from "../types/env";
import { getCurrentSummary, handleSummarization } from "./summarization";
import { buildContextualPrompt } from "../ai/prompt.js";

async function extractRequestData(request: Request) {
  
  let body;
  try {
    body = await request.json()as { message?: string; session_id?: string };
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
    session_id: body.session_id || null // Opzionale
  };
}

export async function handleChat(request:Request,env:Env,ctx: ExecutionContext){
    const {message, session_id} = await extractRequestData(request);
    const finalSessionId = session_id ||generateSessionId();

     console.log('1. Getting memories...');
    const memories = await getImportantMemories(env.DB, 5);
    console.log('✅ Memories success');
    
    console.log('2. Getting summary...');
    const summary = await getCurrentSummary(env.DB, finalSessionId);
    console.log('✅ Summary success');
    
    console.log('3. Getting messages...');
    const messages = await getRecentHistory(env.DB, finalSessionId, 5);
    console.log('✅ Messages success');
    
console.log('4. Building prompt...');
const contextualPrompt = buildContextualPrompt(message, messages, summary, memories);
console.log('✅ Prompt built, length:', contextualPrompt.length);

console.log('5. Calling AI...');
console.log('env.AI type:', typeof env.AI);

let jarvisResponse;
try {
  const aiResponse = await env.AI.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
    prompt: contextualPrompt
  });
  console.log('✅ AI call success');
  jarvisResponse = aiResponse.response || aiResponse;
} catch (error) {
  console.error('❌ AI call failed:', error);
  throw error;
}

console.log('6. Saving conversation...');
    const currentMessageCount = await saveConversation(env.DB, message, jarvisResponse,finalSessionId);
    await updateMemoryIfImportant(env.DB, message);
  
    ctx.waitUntil(
        handleSummarization(env, finalSessionId, currentMessageCount)
        .catch(error => console.error('Background summarization failed:', error))
    );
    return Response.json({
        jarvis: jarvisResponse,
        session_id: finalSessionId,
        status: "online", 
        timestamp: new Date().toISOString(),
        context_used: messages.length
    }, {
        headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
        }
    });
    }
