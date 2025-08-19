// src/ai/rag-retriever.ts
export interface RAGResult {
  content: string;
  score: number;
  metadata: any;
}

export class RAGRetriever {
  constructor(private vectorize: any, private ai: any) {}

  async search(query: string, topK: number = 5): Promise<RAGResult[]> {
    // 1. Crea embedding della query
    const queryEmbedding = await this.createEmbedding(query);
    
    // 2. Cerca nel database vettoriale
    const searchResults = await this.vectorize.query(queryEmbedding, {
      topK,
      returnMetadata: 'all'
    });
    
    // 3. Formatta i risultati
    return searchResults.matches.map((match: { metadata: { content: any; }; score: any; }) => ({
      content: match.metadata.content,
      score: match.score,
      metadata: match.metadata
    }));
  }

  private async createEmbedding(text: string): Promise<number[]> {
    const response = await this.ai.run('@cf/baai/bge-base-en-v1.5', {
      text: [text]
    });
    return response.data[0];
  }
}