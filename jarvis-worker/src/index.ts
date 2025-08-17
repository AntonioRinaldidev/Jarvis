export interface Env {
  AI: any;
  DB: D1Database;
}

interface ConversationRequest {
  message: string;
  session_id?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    try {
      if (request.method === "POST") {
        return await handleChat(request, env);
      } else {
        return await handleStatus(env);
      }
    } catch (error: any) {
      return Response.json({ 
        error: "JARVIS system error",
        details: error.message
      }, { status: 500 });
    }
  },
};

async function handleChat(request: Request, env: Env): Promise<Response> {
  const { message, session_id = generateSessionId() }: ConversationRequest = await request.json();
  
  // 1. Recupera conversazioni recenti per contesto
  const recentHistory = await getRecentHistory(env.DB, session_id);
  
  // 2. Costruisci prompt con memoria
  const contextualPrompt = buildContextualPrompt(message, recentHistory);
  
  // 3. Chiama AI con contesto
  const aiResponse = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
    prompt: contextualPrompt
  });

  const jarvisResponse = aiResponse.response || aiResponse;
  
  // 4. Salva conversazione nel database
  await saveConversation(env.DB, message, jarvisResponse, session_id);
  
  // 5. Aggiorna memoria se necessario
  await updateMemoryIfImportant(env.DB, message);

  return Response.json({
    jarvis: jarvisResponse,
    session_id,
    status: "online",
    timestamp: new Date().toISOString(),
    context_used: recentHistory.length
  }, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    }
  });
}

async function handleStatus(env: Env): Promise<Response> {
  // Stats della memoria di JARVIS
  const stats = await env.DB.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM conversations) as total_conversations,
      (SELECT COUNT(*) FROM memory_bank) as memories_stored,
      (SELECT COUNT(DISTINCT session_id) FROM conversations) as unique_sessions
  `).first();

  return Response.json({
    jarvis: "I am JARVIS, your AI assistant. My memory banks are online and operational.",
    status: "online",
    memory_stats: stats,
    timestamp: new Date().toISOString()
  }, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    }
  });
}

// Helper Functions
function generateSessionId(): string {
  return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

async function getRecentHistory(db: D1Database, sessionId: string, limit = 3) {
  const result = await db.prepare(`
    SELECT user_input, jarvis_response, timestamp 
    FROM conversations 
    WHERE session_id = ? 
    ORDER BY timestamp DESC 
    LIMIT ?
  `).bind(sessionId, limit).all();
  
  return result.results?.reverse() || [];
}

function buildContextualPrompt(message: string, history: any[]): string {
  let prompt = `You are JARVIS, my advanced AI assistant. You are helpful, intelligent, sophisticated, and remember previous conversations.

`;
  
  // Aggiungi storia conversazione se esiste
  if (history.length > 0) {
    prompt += "CONVERSATION HISTORY:\n";
    history.forEach((conv: any) => {
      prompt += `Human: ${conv.user_input}\n`;
      prompt += `JARVIS: ${conv.jarvis_response}\n`;
    });
    prompt += "\n";
  }
  
  prompt += `Current message: ${message}\n\nRespond as JARVIS with awareness of our conversation history:`;
  
  return prompt;
}

async function saveConversation(db: D1Database, userInput: string, jarvisResponse: string, sessionId: string) {
  await db.prepare(`
    INSERT INTO conversations (user_input, jarvis_response, session_id)
    VALUES (?, ?, ?)
  `).bind(userInput, jarvisResponse, sessionId).run();
  
  // Aggiorna session stats
  await db.prepare(`
    INSERT OR REPLACE INTO chat_sessions (session_id, last_activity, message_count)
    VALUES (?, CURRENT_TIMESTAMP, 
      COALESCE((SELECT message_count FROM chat_sessions WHERE session_id = ?), 0) + 1
    )
  `).bind(sessionId, sessionId).run();
}

async function updateMemoryIfImportant(db: D1Database, userInput: string) {
  // Identifica informazioni importanti da ricordare
  const importantPatterns = [
    'my name is',
    'i work at', 
    'i am a',
    'i like',
    'i prefer',
    'my project',
    'remember that'
  ];
  
  const lowerInput = userInput.toLowerCase();
  
  for (const pattern of importantPatterns) {
    if (lowerInput.includes(pattern)) {
      await db.prepare(`
        INSERT INTO memory_bank (memory_type, content, importance_score)
        VALUES (?, ?, ?)
      `).bind('user_info', userInput, 5).run();
      break;
    }
  }
}