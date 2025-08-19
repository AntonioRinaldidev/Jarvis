// src/index.ts
import type { Env } from './types/env.js';
import { handleChat } from './handlers/chat.js';
import { handleStatus } from './handlers/status.js';
import { handleUploadDocument } from './handlers/upload-document'; 
import { handleTestVectorize } from './handlers/test-vectorize';   

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
      
      // Route requests to appropriate handlers
      if (request.method === "POST") {
        switch (url.pathname) { 
          case '/chat':
            return await handleChat(request, env, ctx);
          case '/upload-document': 
            return await handleUploadDocument(request, env);
          case '/test-vectorize': 
            return await handleTestVectorize(request, env);
          default:
            return Response.json(
              { error: "Endpoint not found" },
              { status: 404 }
            );
        }
      } else if (request.method === "GET") {
        switch (url.pathname) {
          case '/status':
            return await handleStatus(env);
          default:
            return Response.json(
              { error: "Endpoint not found" },
              { status: 404 }
            );
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