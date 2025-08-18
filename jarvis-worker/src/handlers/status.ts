import type { Env } from '../types/env.js';
import { getJarvisStats } from '../database/index.js';

export async function handleStatus(env: Env): Promise<Response> {
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