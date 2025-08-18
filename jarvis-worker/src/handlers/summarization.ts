import type { Env } from '../types/env.js';
import type { Conversation } from '../types/database.js';
import { 
  getRecentHistory, 
  getSessionSummaryInfo,
  getUserMessageCount 
} from '../database/index.js';
import { createSummary } from '../ai/prompt.js';

export async function handleSummarization(
  env: Env, 
  sessionId: string, 
  currentMessageCount: number
): Promise<void> {
  // Controlla se è il momento di fare summarization (ogni 5 messaggi)
  if (currentMessageCount % 5 !== 0) {
    return; // Non è ancora il momento
  }

  try {
    const summaryInfo = await getSessionSummaryInfo(env.DB, sessionId);
    
    if (!summaryInfo) {
      console.error('Could not get summary info for session:', sessionId);
      return;
    }

    const { hasSummary, lastSummarized } = summaryInfo;
    
    if (currentMessageCount === 5) {
      // Primo summary (messaggi 1-5)
      await createFirstSummary(env, sessionId);
    } else if (currentMessageCount > 5) {
      // Summary rolling (include summary precedente + ultimi 5 messaggi)
      await createRollingSummary(env, sessionId, currentMessageCount);
      
      // Cancella i messaggi della finestra precedente
      await cleanupOldMessages(env.DB, sessionId, currentMessageCount);
    }
  } catch (error) {
    console.error('Summarization failed for session:', sessionId, error);
    // Non lanciare l'errore - la conversazione deve continuare anche se il summary fallisce
  }
}

async function createFirstSummary(env: Env, sessionId: string): Promise<void> {
  // Prendi i primi 5 messaggi
  const messages = await getRecentHistory(env.DB, sessionId, 5);
  
  if (messages.length === 0) {
    return;
  }

  // Crea il primo summary
  const summaryText = await createSummary(env.AI, undefined, messages);
  
  // Salva il summary
  await saveSummary(env.DB, sessionId, summaryText, 5);
}

async function createRollingSummary(
  env: Env, 
  sessionId: string, 
  currentMessageCount: number
): Promise<void> {
  // Prendi il summary esistente
  const existingSummary = await getCurrentSummary(env.DB, sessionId);
  
  // Prendi gli ultimi 5 messaggi
  const recentMessages = await getRecentHistory(env.DB, sessionId, 5);
  
  if (recentMessages.length === 0) {
    return;
  }

  // Crea nuovo summary che include tutto
  const newSummaryText = await createSummary(env.AI, existingSummary, recentMessages);
  
  // Aggiorna il summary
  await saveSummary(env.DB, sessionId, newSummaryText, currentMessageCount);
}

export async function getCurrentSummary(db: D1Database, sessionId: string): Promise<string | undefined> {
  const result = await db.prepare(`
    SELECT summary_text FROM conversation_summaries 
    WHERE session_id = ?
  `).bind(sessionId).first();
  
  return result?.summary_text as string || undefined;
}

async function saveSummary(
  db: D1Database, 
  sessionId: string, 
  summaryText: string, 
  lastSummarizedMessage: number
): Promise<void> {
  await db.prepare(`
    INSERT OR REPLACE INTO conversation_summaries 
    (session_id, summary_text, last_summarized_message, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(sessionId, summaryText, lastSummarizedMessage).run();
}

async function cleanupOldMessages(
  db: D1Database, 
  sessionId: string, 
  currentMessageCount: number
): Promise<void> {
  // Calcola quali messaggi cancellare
  // Se siamo al messaggio 10, cancelliamo 1-5
  // Se siamo al messaggio 15, cancelliamo 6-10, etc.
  
  const messagesToDelete = currentMessageCount - 5; // ultimi 5 da cancellare
  
  if (messagesToDelete <= 0) {
    return;
  }

  // Cancella i messaggi più vecchi (mantieni solo gli ultimi 5)
  const result = await db.prepare(`
    DELETE FROM conversations 
    WHERE session_id = ? 
    AND rowid IN (
      SELECT rowid FROM conversations 
      WHERE session_id = ? 
      ORDER BY timestamp ASC 
      LIMIT ?
    )
  `).bind(sessionId, sessionId, messagesToDelete).run();
  
  console.log(`Cleaned up ${result.meta.changes} old messages for session ${sessionId}`);
}