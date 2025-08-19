// src/ai/rag-ingestion.ts
export interface Document {
  id: string;
  content: string;
  metadata: {
    title?: string;
    source?: string;
    type?: string;
    timestamp?: string;
  };
}

export class RAGIngestion {
  constructor(private vectorize: any, private ai: any) {}

  async ingestDocument(doc: Document): Promise<void> {
    try {
      // 1. Splitta il documento in chunks
      const chunks = this.splitIntoChunks(doc.content, 512);
      console.log(`Splitting document into ${chunks.length} chunks`);
      
      // 2. Crea embedding per ogni chunk
      const vectors = [];
      
      for (let i = 0; i < chunks.length; i++) {
        const embedding = await this.createEmbedding(chunks[i]);
        
        vectors.push({
          id: `${doc.id}_chunk_${i}`,
          values: embedding,
          metadata: {
            ...doc.metadata,
            chunk_index: i,
            content: chunks[i],
            document_id: doc.id
          }
        });
      }
      
      // 3. Salva nel database vettoriale
      await this.vectorize.insert(vectors);
      console.log(`Inserted ${vectors.length} vectors for document ${doc.id}`);
      
    } catch (error) {
      console.error('Error ingesting document:', error);
      throw error;
    }
  }

  private splitIntoChunks(text: string, chunkSize: number): string[] {
    // Strategia migliorata: split per paragrafi e frasi
    const paragraphs = text.split(/\n\s*\n/);
    const chunks = [];
    let currentChunk = '';
    
    for (const paragraph of paragraphs) {
      // Se il paragrafo è troppo lungo, spezzalo per frasi
      if (paragraph.length > chunkSize) {
        const sentences = paragraph.split(/[.!?]+/);
        
        for (const sentence of sentences) {
          if (!sentence.trim()) continue;
          
          if ((currentChunk + sentence).length > chunkSize) {
            if (currentChunk.trim()) {
              chunks.push(currentChunk.trim());
            }
            currentChunk = sentence.trim() + '.';
          } else {
            currentChunk += (currentChunk ? ' ' : '') + sentence.trim() + '.';
          }
        }
      } else {
        // Paragrafo normale
        if ((currentChunk + paragraph).length > chunkSize) {
          if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
          }
          currentChunk = paragraph.trim();
        } else {
          currentChunk += (currentChunk ? '\n\n' : '') + paragraph.trim();
        }
      }
    }
    
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks.filter(chunk => chunk.length > 20); // Rimuovi chunks troppo piccoli
  }

  private async createEmbedding(text: string): Promise<number[]> {
    const response = await this.ai.run('@cf/baai/bge-base-en-v1.5', {
      text: [text]
    });
    return response.data[0];
  }

  // Metodo per eliminare un documento
  async deleteDocument(documentId: string): Promise<void> {
    try {
      // Trova tutti i chunk di questo documento
      const searchResults = await this.vectorize.query(
        [], // Query vuota
        {
          filter: { document_id: documentId },
          returnMetadata: true
        }
      );

      // Elimina tutti i vettori trovati
      const idsToDelete = searchResults.matches.map((match: any) => match.id);
      if (idsToDelete.length > 0) {
        await this.vectorize.deleteByIds(idsToDelete);
        console.log(`Deleted ${idsToDelete.length} vectors for document ${documentId}`);
      }
    } catch (error) {
      console.error('Error deleting document:', error);
      throw error;
    }
  }
}