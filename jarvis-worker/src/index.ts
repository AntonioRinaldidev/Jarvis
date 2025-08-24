// src/index.ts
import type { Env } from './types/env.js';
import { handleChat } from './handlers/chat.js';
import { handleStatus } from './handlers/status.js';
import { handleUploadDocument } from './handlers/upload-document'; 
import { handleTestVectorize } from './handlers/test-vectorize';   
import { RateLimiter } from './middleware/simpleRateLimiter'
import {  getRelevantMemoriesRAG, listAllMemoriesRAG } from './ai/rag-memory';
import { JarvisSessionDO as _JarvisSessionDO } from './durable-objects/session-do';
export class JarvisSessionDO extends _JarvisSessionDO {}
import { generateSessionId } from './utils/session.js';


async function findAvailableDO(env:Env): Promise<string|null>{
  const POOL_SIZE = 10;

  for (let i = 0; i <POOL_SIZE; i++){
    const doName = `jarvis-name-${i}`;

    try{
      const doId = env.JARVIS_SESSION_DO.idFromName(doName);
      const doStub = env.JARVIS_SESSION_DO.get(doId);

      const statusResponse =  await doStub.fetch(new Request(`https://${doName}.session.jarvis/status`))
      const status = await statusResponse.json() as { available : boolean}

      if(status.available){
        return doName;
      }

    }catch(error){
      continue;
    }
  }
  return null;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {

    if(request.headers.get("Upgrade")==="websocket"){

      const availableDOName = await findAvailableDO(env);

      const url = new URL(request.url);
      const sessionId = url.searchParams.get('session_id') || generateSessionId();
    
      if(!availableDOName){
        return new Response('All connection busy, try again later',{status:503,
        headers: { 
          'Retry-After': '5',
          'Access-Control-Allow-Origin': '*'
        }})
      }
      
      const doId = env.JARVIS_SESSION_DO.idFromName(availableDOName);
      const doStub = env.JARVIS_SESSION_DO.get(doId);
      

      const modifiedRequest = new Request(request.url + `&do_session_id=${sessionId}`, {
      headers: request.headers
    });
    
      return doStub.fetch(modifiedRequest);      
    }
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    try {
      const url = new URL(request.url); //
            let pathname = url.pathname;
      
      if (pathname.startsWith('/api/jarvis')) {
        pathname = pathname.replace('/api/jarvis', '');
      }
      // Se pathname è vuoto, imposta come '/'
      if (!pathname || pathname === '') {
        pathname = '/';
      }

      const {rateLimitResult,rateLimitConfig,clientIP} = RateLimiter(request,pathname);

      if(!rateLimitResult.allowed){
        const retryAfterSeconds = Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000);
        
        
        
        return Response.json({
          error: 'Rate limit exceeded',
          message: `Too many requests to ${pathname}. Try again in ${retryAfterSeconds} seconds.`,
          endpoint: pathname,
          retryAfter: retryAfterSeconds,
          limit: rateLimitConfig.maxRequests
        }, { 
          status: 429,
          headers: {
            'Retry-After': retryAfterSeconds.toString(),
            'X-RateLimit-Limit': rateLimitConfig.maxRequests.toString(),
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          }
        });
      }

      const baseHeaders = {
        'X-RateLimit-Limit': rateLimitConfig.maxRequests.toString(),
        'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        'X-RateLimit-Reset': rateLimitResult.resetTime.toString()
      };
      // Route requests to appropriate handlers
      if (request.method === "POST") {
        switch (pathname) { 

         case '/upload-document':
          try {
            const uploadResponse = await handleUploadDocument(request, env);
            Object.entries(baseHeaders).forEach(([key, value]) => {
              uploadResponse.headers.set(key, value);
            });
            return uploadResponse;
          } catch (error) {
            return Response.json({ error: "Failed to upload Document" }, { status: 500 });
          }

          case '/rag/search':
            try {
              const body = await request.json() as { query: string; threshold?: number };
              const results = await getRelevantMemoriesRAG(env.VECTORIZE_INDEX, env.AI, body.query, body.threshold);
              const searchResponse = Response.json({ results });
              Object.entries(baseHeaders).forEach(([key, value]) => {
                searchResponse.headers.set(key, value);
              });
              return searchResponse;
            } catch (error) {
              return Response.json({ error: "Failed to search memories" }, { status: 500 });
            }

          default:
            return Response.json({ error: "Endpoint not found" }, { status: 404 });
                  }
      } else if (request.method === "GET") {
        switch (pathname) {
          case '/status':
          case '/':
            const statusResponse = await handleStatus( request,env);
            Object.entries(baseHeaders).forEach(([key, value]) => {
              statusResponse.headers.set(key, value);
            });
            return statusResponse;
          case '/rag/list':
            try {
              const memories = await listAllMemoriesRAG(env.VECTORIZE_INDEX);
              const listResponse = Response.json({ memories });
              Object.entries(baseHeaders).forEach(([key, value]) => {
                listResponse.headers.set(key, value);
              });
              return listResponse;
            } catch (error) {
              return Response.json({ error: "Failed to list memories" }, { status: 500 });
            }
          case '/debug-rag':
            try {
              const dummyVector = new Array(768).fill(0.001);
              const allDocs = await env.VECTORIZE_INDEX.query(dummyVector, {
                topK: 10,
                returnValues: false,
                returnMetadata: true
              });
              
              const debugResponse = Response.json({
                success: true,
                total_found: allDocs.matches.length,
                documents: allDocs.matches.map((match: { id: any; metadata: { title: any; source: any; content: string; }; }) => ({
                  id: match.id,
                  title: match.metadata?.title || 'NO TITLE',
                  source: match.metadata?.source || 'NO SOURCE',
                  content_preview: match.metadata?.content?.substring(0, 100) + '...' || 'NO CONTENT',
                  all_metadata: match.metadata
                }))
              });
              
              Object.entries(baseHeaders).forEach(([key, value]) => {
                debugResponse.headers.set(key, value);
              });
              return debugResponse;
            } catch (error:any) {
              return Response.json({ error: error.message }, { status: 500 });
            }

          default:
            return Response.json({ error: "Endpoint not found" }, { status: 404 });
                  }
      } else {
        return Response.json(
          { error: "Method not allowed" },
          { status: 405 }
        );
      }
    } catch (error: any) {
      console.error('JARVIS system error:', error);
      return Response.json({
        error: "JARVIS system error",
        details: error.message
      }, { 
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        }
      });
    }
  },
};

