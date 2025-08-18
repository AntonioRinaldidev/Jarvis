export interface Conversation{
    user_input: string;
    jarvis_response:string;
    timestamp:string;
    session_id: string;
}

export interface Memory{
    id?: number;
    memory_type:string;
    content:string;
    importance_score:number;
    created_at?:string;
}

export interface SessionStats{
    session_id:string;
    last_activity:string;
    message_count:number;
}

export interface JarvisStats{
    total_conversations:number;
    memories_stored:number;
    unique_sessions:number;
}

