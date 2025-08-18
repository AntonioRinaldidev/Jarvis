import type { Memory } from "../types/database";
import { mapDbResult,mapDbResults, toMemory } from "./utils";

export async function updateMemoryIfImportant(
    db:D1Database,
    userInput:string
): Promise<void>{
    const memoryEntry = extractImportantInfo(userInput);
    if(memoryEntry){
        await saveMemory(db,memoryEntry)
    }
}
export async function saveMemory(
    db:D1Database,
    memory: Omit<Memory,'id'| 'created_at'>
):Promise<void>{
    await db.prepare(`
        INSERT INTO memory_bank(memory_type, content,importance_score)
        VALUES(?,?,?)
        `).bind(memory.memory_type,memory.content,memory.importance_score).run();

}

export async function getMemoriesByType(
    db:D1Database,
memoryType:string):Promise<Memory[]>{
    const result = await db.prepare(`
        SELECT id,memory_type, content, importance_score,created_at
        FROM memory_bank
        WHERE memory_type = ?
        ORDER BY importance_score DESC, created_at DESC`).bind(memoryType).all();
    return mapDbResults(result.results,toMemory)
}
export async function getImportantMemories(
  db: D1Database, 
  minImportance = 3
): Promise<Memory[]> {
  console.log('🔍 Getting important memories');
  console.log('db type:', typeof db);
  console.log('minImportance type:', typeof minImportance, 'value:', minImportance);
  
  try {
    const result = await db.prepare(`
      SELECT id, memory_type, content, importance_score, created_at
      FROM memory_bank 
      WHERE importance_score >= ?
      ORDER BY importance_score DESC, created_at DESC
      LIMIT 10
    `).bind(minImportance).all();
    
    return mapDbResults(result.results, toMemory);
  } catch (error) {
    console.error('❌ Query failed:', error);
    throw error;
  }
}


export async function getAllMemories(db:D1Database):Promise<Memory[]>{
    const result = await db.prepare(`
        SELECT id,memory_type,content,importance_score,created_at
        fFROM memory_bank
        ORDER BY importance_score DESC,created_at DESC`).all();

    return mapDbResults(result.results,toMemory)
}

export async function deleteMemory(db: D1Database, memoryId: number): Promise<boolean> {
  const result = await db.prepare(`
    DELETE FROM memory_bank WHERE id = ?
  `).bind(memoryId).run();
  
  
  return result.meta.changes > 0;
}
function extractImportantInfo(userInput: string): Omit<Memory, 'id' | 'created_at'> | null {
  const analysis = analyzeMessage(userInput);
  
  if (analysis.maxScore >= 4) { // Soglia minima
    return {
      memory_type: analysis.primaryCategory,
      content: userInput,
      importance_score: Math.min(analysis.maxScore, 10)
    };
  }
  
  return null;
}

function analyzeMessage(userInput: string): {maxScore: number, primaryCategory: string, matches: string[]} {
  const lowerInput = userInput.toLowerCase();
  let maxScore = 0;
  let primaryCategory = 'user_info';
  const matches: string[] = [];
  
  // Pattern con regex per maggiore flessibilità
  const patterns = [
    // Personal Info - Alta priorità
    { regex: /(?:my name is|i'm|call me|i am)\s+([a-z]+)/i, type: 'personal_info', score: 8, desc: 'name' },
    { regex: /(?:i live in|i'm from|based in|from)\s+([a-z\s]+)/i, type: 'personal_info', score: 6, desc: 'location' },
    { regex: /(?:i'm|i am)\s+(\d+)\s*(?:years old)?/i, type: 'personal_info', score: 5, desc: 'age' },
    
    // Professional Info - Alta priorità
    { regex: /(?:i work at|work for|employed by)\s+([a-z\s]+)/i, type: 'professional_info', score: 7, desc: 'company' },
    { regex: /(?:i'm a|i am a|work as|my job)\s+([a-z\s]+)/i, type: 'professional_info', score: 6, desc: 'role' },
    { regex: /(?:i use|work with|experienced with)\s+(react|vue|python|javascript|typescript|java|php|node)/i, type: 'professional_info', score: 5, desc: 'tech' },
    
    // Contact Info - Alta priorità
    { regex: /(?:my email|email me|contact)\s*(?:is|at)?\s*([\w@.-]+)/i, type: 'contact_info', score: 7, desc: 'email' },
    { regex: /(?:my phone|call me)\s*(?:is|at)?\s*([\d\s+-]+)/i, type: 'contact_info', score: 6, desc: 'phone' },
    
    // Projects - Media priorità
    { regex: /(?:working on|building|my project|developing)\s+([a-z\s]+)/i, type: 'project_info', score: 6, desc: 'project' },
    { regex: /(?:creating|making|designing)\s+([a-z\s]+)/i, type: 'project_info', score: 5, desc: 'creation' },
    
    // Goals & Learning - Media priorità
    { regex: /(?:my goal|want to|planning to|trying to)\s+([a-z\s]+)/i, type: 'goals', score: 5, desc: 'goal' },
    { regex: /(?:learning|studying|getting into)\s+([a-z\s]+)/i, type: 'goals', score: 4, desc: 'learning' },
    
    // Preferences - Media-bassa priorità
    { regex: /(?:i like|love|enjoy)\s+([a-z\s]+)/i, type: 'preferences', score: 4, desc: 'likes' },
    { regex: /(?:i prefer|better than|rather)\s+([a-z\s]+)/i, type: 'preferences', score: 4, desc: 'preferences' },
    { regex: /(?:i hate|dislike|can't stand)\s+([a-z\s]+)/i, type: 'preferences', score: 4, desc: 'dislikes' },
    
    // Explicit Memory - Massima priorità
    { regex: /(?:remember that|don't forget|important:|note that)/i, type: 'explicit_memory', score: 9, desc: 'explicit' },
    { regex: /(?:for future|fyi|just so you know)/i, type: 'explicit_memory', score: 7, desc: 'fyi' },
  ];
  
  for (const pattern of patterns) {
    if (pattern.regex.test(lowerInput)) {
      if (pattern.score > maxScore) {
        maxScore = pattern.score;
        primaryCategory = pattern.type;
      }
      matches.push(pattern.desc);
    }
  }
  
  return { maxScore, primaryCategory, matches };
}