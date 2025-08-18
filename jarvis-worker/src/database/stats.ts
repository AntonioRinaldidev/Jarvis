import type { JarvisStats, SessionStats } from '../types/database.js';
import { mapDbResult, mapDbResults, toJarvisStats, toSessionStats } from './utils.js';

export async function getJarvisStats(db: D1Database): Promise<JarvisStats> {
  const result = await db.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM conversations) as total_conversations,
      (SELECT COUNT(*) FROM memory_bank) as memories_stored,
      (SELECT COUNT(DISTINCT session_id) FROM conversations) as unique_sessions
  `).first();
  
  return mapDbResult(result, toJarvisStats) || {
    total_conversations: 0,
    memories_stored: 0,
    unique_sessions: 0
  };
}

export async function getSessionStats(
  db: D1Database, 
  sessionId: string
): Promise<SessionStats | null> {
  const result = await db.prepare(`
    SELECT session_id, last_activity, message_count
    FROM chat_sessions 
    WHERE session_id = ?
  `).bind(sessionId).first();
  
  return mapDbResult(result, toSessionStats);
}

export async function getTopSessions(
  db: D1Database, 
  limit = 10
): Promise<SessionStats[]> {
  const result = await db.prepare(`
    SELECT session_id, last_activity, message_count
    FROM chat_sessions 
    ORDER BY message_count DESC, last_activity DESC
    LIMIT ?
  `).bind(limit).all();
  
  return mapDbResults(result.results, toSessionStats);
}

export async function updateSessionActivity(
  db: D1Database, 
  sessionId: string
): Promise<void> {
  await db.prepare(`
    INSERT OR REPLACE INTO chat_sessions (session_id, last_activity, message_count)
    VALUES (?, CURRENT_TIMESTAMP, 
      COALESCE((SELECT message_count FROM chat_sessions WHERE session_id = ?), 0) + 1
    )
  `).bind(sessionId, sessionId).run();
}

export async function getUserMessageCount(
  db: D1Database, 
  sessionId: string
): Promise<number> {
  const result = await db.prepare(`
    SELECT COUNT(*) as count 
    FROM conversations 
    WHERE session_id = ? 
    AND user_input IS NOT NULL AND user_input != ''
  `).bind(sessionId).first();
  
  return Number(result?.count || 0);
}

export async function getSessionSummaryInfo(
  db: D1Database, 
  sessionId: string
): Promise<{ hasSummary: boolean; lastSummarized: number } | null> {
  const result = await db.prepare(`
    SELECT last_summarized_message 
    FROM conversation_summaries 
    WHERE session_id = ?
  `).bind(sessionId).first();
  
  if (result) {
    return {
      hasSummary: true,
      lastSummarized: Number(result.last_summarized_message || 0)
    };
  }
  
  return { hasSummary: false, lastSummarized: 0 };
}