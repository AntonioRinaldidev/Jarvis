export interface ConversationRequest{
    messae:string;
    session_id?:string;
}

export interface ChatRespose{
    jarvis: string;
    session_id:string;
    status:string;
    timestamp:string;
    context_used:number;
}

export interface StatusResponse {
  jarvis: string;
  status: string;
  memory_stats: {
    total_conversations: number;
    memories_stored: number;
    unique_sessions: number;
  };
  timestamp: string;
  version: string;
}