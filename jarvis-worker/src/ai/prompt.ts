import type { Conversation, Memory } from '../types/database.js';
import { RAGRetriever } from './rag-retriever.js';

export function buildContextualPrompt(
 message: string, 
 history: Conversation[], 
 isFirstMessage:boolean,
 summary?: string,
 memories?: Memory[],
 
): string {
 let prompt = `You are JARVIS, my advanced AI assistant. You are helpful, intelligent, sophisticated, and remember previous conversations.\n\n`;
 
 // Add summary if exists
 if (summary) {
   prompt += `CONVERSATION HISTORY (Summary):\n${summary}\n\n`;
 }
 
 // Add recent messages
 if (history.length > 0) {
   prompt += "RECENT CONVERSATION:\n";
   history.forEach((conv) => {
     prompt += `Human: ${conv.user_input}\n`;
     prompt += `JARVIS: ${conv.jarvis_response}\n`;
   });
   prompt += "\n";
 }
 
 // Add important memories if they exist
 if (memories && memories.length > 0) {
   prompt += "IMPORTANT INFORMATION TO REMEMBER:\n";
   memories.forEach((memory) => {
     prompt += `- ${memory.content}\n`;
   });
   prompt += "\n";
 }
 
 prompt += `Current message: ${message}\n\nRespond as JARVIS with awareness of our conversation history:`;
 
 return prompt;
}

export function buildChatMessages(
  message: string,
  history: Conversation[],
  isFirstMessage:boolean,
  summary?: string,
  memories?: Memory[]
): Array<{ role: "system" | "user" | "assistant", content: string }> {
  
  const messages: Array<{ role: "system" | "user" | "assistant", content: string }> = [];
  
 
let systemContent = `
  You are JARVIS, Antonio Rinaldi's advanced AI assistant.
  
  Guidelines:
  - Refer to Antonio in third person (he/his/Antonio)
  - Be professional, helpful, and naturally conversational
  - Vary your phrasing while staying factual and relevant
  - Use your knowledge base to provide accurate information about Antonio
  `;
  
  if (isFirstMessage) {
      systemContent += " Greet the user politely at the start of the session.";
  } else {
      systemContent += " Do NOT greet the user again.";
  }
  if (summary) {
    systemContent += `\n\nContext (summary): ${summary}`;
  }
  
  if (memories && memories.length > 0) {
    systemContent += "\n\nRemembered facts:\n";
    for (const memory of memories) {
      systemContent += `- ${memory.content}\n`;
    }
  }
  
  messages.push({
    role: "system",
    content: systemContent
  });
  
  // 🔹 Conversazione recente
  for (const conv of history) {
    messages.push({
      role: "user",
      content: conv.user_input
    });
    messages.push({
      role: "assistant",
      content: conv.jarvis_response
    });
  }
  
  // 🔹 Messaggio corrente
  messages.push({
    role: "user",
    content: message
  });
  
  return messages;
}
export async function buildChatMessagesWithRAG(
  message: string,
  history: Conversation[],
  isFirstMessage: boolean,
  ragRetriever: RAGRetriever,
  summary?: string,
  memories?: Memory[]
): Promise<Array<{ role: "system" | "user" | "assistant", content: string }>> {
  
  const messages: Array<{ role: "system" | "user" | "assistant", content: string }> = [];
  
let systemContent = `
  You are JARVIS, Antonio Rinaldi's advanced AI assistant.
  
  Guidelines:
  - Refer to Antonio in third person (he/his/Antonio)
  - Be professional, helpful, and naturally conversational
  - Vary your phrasing while staying factual and relevant
  - Use your knowledge base to provide accurate information about Antonio
  `;
  
  if (isFirstMessage) {
    systemContent += " Greet the user politely at the start of the session.";
  } else {
    systemContent += " Do NOT greet the user again.";
  }
  
  // 🔹 AGGIUNGI RAG KNOWLEDGE al system prompt
  try {
    const ragResults = await ragRetriever.search(message, 3);
    
    if (ragResults.length > 0) {
      systemContent += "\n\nRelevant knowledge from your database:\n";
      ragResults.forEach((result: { content: any; metadata: { title: any; }; }, index: number) => {
        systemContent += `[${index + 1}] ${result.content}`;
        if (result.metadata.title) {
          systemContent += ` (Source: ${result.metadata.title})`;
        }
        systemContent += "\n";
      });
      systemContent += "\nUse this knowledge naturally in your responses when relevant.";
    }
  } catch (error) {
    console.error('RAG search error:', error);
    // Continua senza RAG se c'è un errore
  }
  
  if (summary) {
    systemContent += `\n\nContext (summary): ${summary}`;
  }
  
  if (memories && memories.length > 0) {
    systemContent += "\n\nRemembered facts:\n";
    for (const memory of memories) {
      systemContent += `- ${memory.content}\n`;
    }
  }
  
  messages.push({
    role: "system",
    content: systemContent
  });
  
  // Conversazione recente
  for (const conv of history) {
    messages.push({
      role: "user",
      content: conv.user_input
    });
    messages.push({
      role: "assistant",
      content: conv.jarvis_response
    });
  }
  
  // Messaggio corrente
  messages.push({
    role: "user",
    content: message
  });
  
  return messages;
}
export async function createSummary(
 ai: any, 
 previousSummary: string | undefined, 
 recentMessages: Conversation[]
): Promise<string> {
 let contentToSummarize = '';
 
 if (previousSummary) {
   contentToSummarize += `Previous conversation summary:\n${previousSummary}\n\n`;
 }
 
 contentToSummarize += "Recent messages to include:\n";
 recentMessages.forEach((conv) => {
   contentToSummarize += `Human: ${conv.user_input}\n`;
   contentToSummarize += `JARVIS: ${conv.jarvis_response}\n`;
 });
 
 const summaryPrompt = `Summarize this ENTIRE conversation (previous summary + new messages) into a single coherent and fluid text.

${contentToSummarize}

Keep: user's personal information, project context, expressed preferences, important facts to remember.
Write in a narrative and continuous style, maximum 300 words.
Focus on what's important to continue the conversation in the future.

Summary:`;

 const response = await ai.run('@cf/qwen/qwen1.5-0.5b-chat', {
   prompt: summaryPrompt,
   max_tokens: 400
 });

 return response.response || response;
}