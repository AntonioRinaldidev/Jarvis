import type { Env } from './types/env.js';
import { handleChat } from './handlers/chat.js';
import { handleStatus } from './handlers/status.js';

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
      // Route requests to appropriate handlers
      if (request.method === "POST") {
        return await handleChat(request, env, ctx);
      } else if (request.method === "GET") {
        return await handleStatus(env);
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