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
    

    let deletedChunks = 0;
    try {

      const dummyVector = new Array(1024).fill(0.001); 
      
      const existingDocs = await env.VECTORIZE_INDEX.query(dummyVector, {
        topK: 100, 
        returnValues: false,
        returnMetadata: 'indexed'
      });
      

      const matchingDocs = existingDocs.matches.filter(
        (match: any) => match.metadata?.title === body.title.trim()
      );
      
      if (matchingDocs.length > 0) {
        const idsToDelete = matchingDocs.map((match: any) => match.id);
        await env.VECTORIZE_INDEX.deleteByIds(idsToDelete);
        deletedChunks = idsToDelete.length;
        console.log(`🗑️ Deleted ${deletedChunks} existing chunks for "${body.title}"`);
      }
    } catch (deleteError) {
      console.warn('⚠️ Could not check for existing documents:', deleteError);
 
    }
    

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
    
    console.log(`📤 Uploading document: ${doc.metadata.title}`);
    

    await ragIngestion.ingestDocument(doc);
    
    const estimatedChunks = Math.ceil(doc.content.length / 512);
    
    return Response.json({
      success: true,
      documentId: doc.id,
      title: doc.metadata.title,
      chunksCreated: estimatedChunks,
      deletedChunks: deletedChunks, 
      action: deletedChunks > 0 ? 'updated' : 'created', 
      message: deletedChunks > 0 
        ? `Document "${body.title}" updated successfully (replaced ${deletedChunks} existing chunks)`
        : `Document "${body.title}" uploaded and processed successfully`
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