import type { Conversation, Memory, SessionStats, JarvisStats } from '../types/database.js';

export function mapDbResults<T>(
  results: Record<string, unknown>[] | undefined,
  mapper: (row: Record<string, unknown>) => T
): T[] {
  return (results || []).map(mapper);
}

export function toConversation(row: Record<string, unknown>): Conversation {
  return {
    user_input: String(row.user_input || ''),
    jarvis_response: String(row.jarvis_response || ''),
    timestamp: String(row.timestamp || ''),
    session_id: String(row.session_id || '')
  };
}

export function toMemory(row: Record<string, unknown>): Memory {
  return {
    id: row.id ? Number(row.id) : undefined,
    memory_type: String(row.memory_type || ''),
    content: String(row.content || ''),
    importance_score: Number(row.importance_score || 0),
    created_at: row.created_at ? String(row.created_at) : undefined
  };
}

export function toSessionStats(row: Record<string, unknown>): SessionStats {
  return {
    session_id: String(row.session_id || ''),
    last_activity: String(row.last_activity || ''),
    message_count: Number(row.message_count || 0)
  };
}

export function toJarvisStats(row: Record<string, unknown>): JarvisStats {
  return {
    total_conversations: Number(row.total_conversations || 0),
    memories_stored: Number(row.memories_stored || 0),
    unique_sessions: Number(row.unique_sessions || 0)
  };
}

// Helper per singoli risultati
export function mapDbResult<T>(
  result: Record<string, unknown> | null | undefined,
  mapper: (row: Record<string, unknown>) => T
): T | null {
  return result ? mapper(result) : null;
}