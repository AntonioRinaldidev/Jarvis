import type { Conversation, Memory } from '../types/database.js';

export function buildContextualPrompt(
 message: string, 
 history: Conversation[], 
 summary?: string,
 memories?: Memory[]
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