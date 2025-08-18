import type { Conversation } from '../types/database.js';
import { mapDbResults, toConversation } from './utils.js';
import { updateSessionActivity, getUserMessageCount } from './stats.js';

export async function getRecentHistory(
  db: D1Database, 
  sessionId: string, 
  limit = 5
): Promise<Conversation[]> {
  const result = await db.prepare(`
    SELECT user_input, jarvis_response, timestamp, session_id
    FROM conversations 
    WHERE session_id = ? 
    ORDER BY timestamp DESC 
    LIMIT ?
  `).bind(sessionId, limit).all();
  
  const conversations = mapDbResults(result.results, toConversation);
  return conversations.reverse();
}

export async function saveConversation(
  db: D1Database, 
  userInput: string, 
  jarvisResponse: string, 
  sessionId: string
): Promise<number> {
      console.log('💾 Saving conversation...');
  console.log('userInput type:', typeof userInput, 'length:', userInput?.length);
  console.log('jarvisResponse type:', typeof jarvisResponse, 'length:', jarvisResponse?.length);
  console.log('sessionId type:', typeof sessionId, 'value:', sessionId);
    
  try {
    const result = await db.prepare(`
      INSERT INTO conversations (user_input, jarvis_response, session_id)
      VALUES (?, ?, ?)
    `).bind(userInput, jarvisResponse, sessionId).run();
    
    console.log('✅ Insert success');


  
  // Aggiorna statistiche sessione
  await updateSessionActivity(db, sessionId);
  
  // Restituisci il numero di messaggi utente per questa sessione
  return await getUserMessageCount(db, sessionId);
      } catch (error) {
    console.error('❌ Insert failed:', error);
    throw error;
  }
}

export async function getConversationsBySession(
  db: D1Database, 
  sessionId: string
): Promise<Conversation[]> {
  const result = await db.prepare(`
    SELECT user_input, jarvis_response, timestamp, session_id
    FROM conversations 
    WHERE session_id = ? 
    ORDER BY timestamp ASC
  `).bind(sessionId).all();
  
  return mapDbResults(result.results, toConversation);
}

export async function getUserMessageNumber(
  db: D1Database,
  sessionId: string
): Promise<number> {
  return await getUserMessageCount(db, sessionId);
}