import type { Env } from '../types/env';
import { RAGIngestion } from '../ai/rag-ingestion';

interface UploadRequest {
  title: string;
  content: string;
  source?: string;
}

export async function handleUploadDocument(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as UploadRequest;
    
    // Validazione input
    if (!body.title || !body.content) {
      return Response.json({
        success: false,
        error: "Missing required fields: title and content"
      }, { 
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        }
      });
    }
    
    if (body.content.length < 50) {
      return Response.json({
        success: false,
        error: "Content too short (minimum 50 characters)"
      }, { 
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        }
      });
    }
    
    // Inizializza RAG Ingestion
    const ragIngestion = new RAGIngestion(env.VECTORIZE_INDEX, env.AI);
    
    // Crea documento
    const doc = {
      id: crypto.randomUUID(),
      content: body.content.trim(),
      metadata: {
        title: body.title.trim(),
        source: body.source || 'user_upload',
        type: 'knowledge',
        timestamp: new Date().toISOString()
      }
    };
    
    console.log(`Uploading document: ${doc.metadata.title}`);
    
    // Carica nel sistema RAG
    await ragIngestion.ingestDocument(doc);
    
    return Response.json({
      success: true,
      documentId: doc.id,
      title: doc.metadata.title,
      chunksCreated: Math.ceil(doc.content.length / 512), // Stima
      message: `Document "${body.title}" uploaded and processed successfully`
    }, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      }
    });
    
  } catch (error: any) {
    console.error('Document upload failed:', error);
    return Response.json({
      success: false,
      error: error.message,
      details: "Failed to process document"
    }, { 
      status: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      }
    });
  }
}