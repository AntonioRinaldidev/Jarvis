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
   
   let existingContent = '';
   let deletedChunks = 0;
   let updateMode = false;

   // 🔍 Cerca documenti esistenti con stesso titolo
   try {
     const titleEmbedding = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
       text: [body.title.trim()]
     });
     
     const existingDocs = await env.VECTORIZE_INDEX.query(titleEmbedding.data[0], {
       topK: 20,
       returnValues: false,
       returnMetadata: true
     });
     
     const matchingDocs = existingDocs.matches.filter(
       (match: any) => match.metadata?.title === body.title.trim()
     );
     
     if (matchingDocs.length > 0) {
       updateMode = true;
       
       // 📚 Raccogli tutto il contenuto esistente
       existingContent = matchingDocs
         .map((match: any) => match.metadata?.content || '')
         .filter((content: string | any[]) => content.length > 0)
         .join('\n\n');
       
       // 🗑️ Elimina i vecchi chunks
       const idsToDelete = matchingDocs.map((match: any) => match.id);
       await env.VECTORIZE_INDEX.deleteByIds(idsToDelete);
       deletedChunks = idsToDelete.length;
       console.log(`🗑️ Deleted ${deletedChunks} existing chunks for merging`);
     }
   } catch (deleteError) {
     console.warn('⚠️ Could not check for existing documents:', deleteError);
   }

   // 🧠 Merge intelligente con AI
   let finalContent = body.content.trim();
   
   if (updateMode && existingContent) {
     console.log('🧠 Performing intelligent content merge...');
     
     const mergePrompt = `You are an AI content merger. Your task is to intelligently merge existing content with new content about the same topic.

EXISTING CONTENT:
${existingContent}

NEW CONTENT:
${body.content.trim()}

Instructions:
1. Merge the information intelligently
2. Remove duplicates and contradictions
3. Keep the most recent/accurate information
4. Maintain a coherent narrative structure
5. Preserve all unique details from both sources
6. Update outdated information with newer data

Return only the merged content, no explanations:`;

     try {
       const mergeResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
         messages: [
           { role: "system", content: "You are a content merger specialist." },
           { role: "user", content: mergePrompt }
         ]
       });
       
       finalContent = mergeResponse.response || mergeResponse || finalContent;
       console.log('✅ AI merge completed');
     } catch (mergeError) {
       console.warn('⚠️ AI merge failed, using simple concatenation:', mergeError);
       // Fallback: merge semplice
       finalContent = `${existingContent}\n\n--- UPDATE (${new Date().toISOString()}) ---\n${body.content.trim()}`;
     }
   }

   // 📤 Carica documento con contenuto merged
   const ragIngestion = new RAGIngestion(env.VECTORIZE_INDEX, env.AI);
   
   const doc = {
     id: crypto.randomUUID(),
     content: finalContent,
     metadata: {
       title: body.title.trim(),
       source: body.source || 'user_upload',
       type: 'knowledge',
       timestamp: new Date().toISOString(),
       version: updateMode ? 'updated' : 'new',
       last_update: new Date().toISOString()
     }
   };
   
   console.log(`📤 ${updateMode ? 'Updating' : 'Uploading'} document: ${doc.metadata.title}`);
   
   await ragIngestion.ingestDocument(doc);
   
   const estimatedChunks = Math.ceil(finalContent.length / 512);
   
   return Response.json({
     success: true,
     documentId: doc.id,
     title: doc.metadata.title,
     chunksCreated: estimatedChunks,
     deletedChunks: deletedChunks,
     action: updateMode ? 'updated' : 'created',
     merge_performed: updateMode,
     content_length: finalContent.length,
     original_content_length: existingContent.length,
     message: updateMode 
       ? `Document "${body.title}" updated successfully (merged with ${deletedChunks} existing chunks)`
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