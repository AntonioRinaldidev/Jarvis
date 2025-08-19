import type { Env } from '../types/env.js';
import { getJarvisStats } from '../database/index.js';

export async function handleStatus(request:Request,env: Env): Promise<Response> {
   if (request) {
    const clientIP = request.headers.get('CF-Connecting-IP') || 
                     request.headers.get('X-Forwarded-For') || 
                     request.headers.get('X-Real-IP') || 
                     'unknown';
    
    console.log(`🔍 Status request from IP: ${clientIP}`);
    console.log(`📱 User-Agent: ${request.headers.get('User-Agent')}`);
    console.log(`🌐 Referer: ${request.headers.get('Referer') || 'direct'}`);
    console.log(`🗺️ Country: ${request.headers.get('CF-IPCountry') || 'unknown'}`);
    console.log(`⚡ CF-Ray: ${request.headers.get('CF-RAY')}`);
  }
  try {
    const stats = await getJarvisStats(env.DB);

    return Response.json({
      jarvis: "I am JARVIS, your AI assistant. My memory banks are online and operational.",
      status: "online",
      memory_stats: stats,
      timestamp: new Date().toISOString(),
      version: "2.0-modular"
    }, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      }
    });
  } catch (error) {
    console.error('Status handler error:', error);
    return Response.json({
      error: "Unable to retrieve system status",
      status: "degraded"
    }, { 
      status: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      }
    });
  }
}