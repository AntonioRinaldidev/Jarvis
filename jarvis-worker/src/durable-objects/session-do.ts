import { generateSessionId } from "../utils/session.js";
import { getCurrentSummary, handleSummarization } from '../handlers/summarization.js';
import { getRecentHistory, saveConversation } from '../database/index.js';
import { buildChatMessages, buildChatMessagesWithRAG } from '../ai/prompt.js';
import { RAGRetriever } from '../ai/rag-retriever.js';
import { DurableObject} from "cloudflare:workers";
import type { Env } from '../types/env.js';

export class JarvisSessionDO extends DurableObject<Env>{
    private sessionId: string | null = null;
    private isOccupied : boolean = false;
    private currentSessionId: string | null = null;
    private websocket : WebSocket | null = null;

    constructor(ctx: DurableObjectState,env:Env){
         super(ctx, env);
    }

    async fetch(request:Request): Promise<Response>{
        const url = new URL(request.url);


        if (url.pathname === '/status'){
            return Response.json({
                occupied: this.isOccupied,
                sessionId: this.currentSessionId,
                available: this.isAvailable(),
            })
        }
        if(url.pathname === '/claim'){
            return new Response('Claim not implemented yet',{status:501})
        }

        if(request.headers.get("Upgrade")==="websocket"){
            const  url = new URL(request.url);
            const sessionId = url.searchParams.get('do_session_id') || generateSessionId();
            console.log("DO sessionId received: ",sessionId)

            const claimResult = await this.tryClaim(sessionId);
            if(!claimResult.success){
                return new Response('DO busy', {status:503})
            }
            await this.ensureSessionExists(sessionId);
            const pair = new WebSocketPair();
            const [client,server] = Object.values(pair);

            this.ctx.acceptWebSocket(server);
            this.websocket = server;


            const previousMessages = await getRecentHistory(this.env.DB, sessionId, 100);

            if (previousMessages.length > 0) {
                server.send(JSON.stringify({
                    type: 'chat_history',
                    messages: previousMessages,
                    sessionId: sessionId
                }));
            } else {
                server.send(JSON.stringify({
                    type: 'connected',
                    message: `JARVIS Online\n\nHello! I'm JARVIS, your personal AI assistant. I can:\n\n• Chat and answer your questions\n• Access the portfolio knowledge base\n• Analyze documents and projects\n• Help with technical information\n\nHow can I help you today?`,
                    sessionId: sessionId
                }));
            }

            return new Response(null,{status:101,webSocket:client})
        }
        return new Response('Do is alive', {status:200})
    }

    async tryClaim(sessionId:string):Promise<{success:boolean, reason?:string}>{
        if(this.isOccupied){
            return {success:false,reason: 'DO_OCCUPIED'};
        }
        this.isOccupied = true;
        this.currentSessionId = sessionId;
        return {success:true}
    }

    async release():Promise<void>{
        if(this.websocket){
            this.websocket.close();
            this.websocket = null;
        }

        this.isOccupied = false;
        this.currentSessionId = null
    }

    isAvailable(): boolean{
        return !this.isOccupied
    }

    getCurrentSession(): string |null{
        return this.currentSessionId;
    }

    private async ensureSessionExists(sessionId: string): Promise<void> {
    try {
        
        const existingSession = await this.env.DB.prepare(`
            SELECT session_id FROM chat_sessions WHERE session_id = ?
        `).bind(sessionId).first();
        
        if (!existingSession) {
            
            await this.env.DB.prepare(`
                INSERT INTO chat_sessions (session_id, last_activity, message_count)
                VALUES (?, CURRENT_TIMESTAMP, 0)
            `).bind(sessionId).run();
            
            console.log('✨ New session created in database:', sessionId);
        } else {
            
            await this.env.DB.prepare(`
                UPDATE chat_sessions 
                SET last_activity = CURRENT_TIMESTAMP 
                WHERE session_id = ?
            `).bind(sessionId).run();
            
            console.log('🔄 Existing session updated:', sessionId);
        }
    } catch (error) {
        console.error('❌ Error managing session in database:', error);
        
    }
}

    webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {

    try {
        // Parse del messaggio JSON
        const data = JSON.parse(message as string);

        
        if (data.type === 'chat') {
            const sessionId = data.sessionId || this.currentSessionId || generateSessionId();
			this.currentSessionId = sessionId; // opzionale, per fallback
            this.handleChatMessage(ws, data.message,sessionId);
        } else if (data.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
        } else {
            console.log('⚠️ Unknown message type:', data.type);
        }
    } catch (error) {

        ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format'
        }));
    }
}


    webSocketClose(ws:WebSocket,code:number, reason:string, wasClean:boolean):void{
        this.release();
    }

private async handleChatMessage(ws: WebSocket, userMessage: string,sessionId:string): Promise<void> {
    console.log('🤖 Processing chat message:', userMessage);
    
    try {

        ws.send(JSON.stringify({
            type: 'thinking',
            message: 'JARVIS is thinking...'
        }));
        

        const [summary, messages] = await Promise.all([
            getCurrentSummary(this.env.DB, sessionId),
            getRecentHistory(this.env.DB, sessionId, 3)
        ]);
        
        const isFirstMessage = messages.length === 0;
        let chatMessages: Array<{ role: "system" | "user" | "assistant", content: string }>;
        let usingRAG = false;


        if (this.env.VECTORIZE_INDEX) {
            const ragRetriever = new RAGRetriever(this.env.VECTORIZE_INDEX, this.env.AI);
            try {
                chatMessages = await buildChatMessagesWithRAG(
                    userMessage, messages, isFirstMessage, ragRetriever, summary
                );
                usingRAG = true;
                console.log('Using RAG-enhanced chat');
            } catch (ragError) {
                console.warn('RAG failed, falling back to normal chat:', ragError);
                chatMessages = buildChatMessages(userMessage, messages, isFirstMessage, summary);
            }
        } else {
            chatMessages = buildChatMessages(userMessage, messages, isFirstMessage, summary);
        }


        const modelId = '@cf/meta/llama-3.1-8b-instruct-fp8';
        const aiResponse = await this.env.AI.run(modelId, { messages: chatMessages });
        
        const jarvisResponse = aiResponse.response || aiResponse.text || aiResponse.result || 
                               "I couldn't generate a response.";

        console.log('AI Response:', jarvisResponse);


        const currentMessageCount = await saveConversation(
            this.env.DB, userMessage, jarvisResponse,sessionId
        );


        this.ctx.waitUntil(
            handleSummarization(this.env, sessionId, currentMessageCount)
                .catch(error => console.error('Background summarization failed:', error))
        );

        ws.send(JSON.stringify({
            type: 'chat_response',
            message: jarvisResponse,
            sessionId: sessionId,
            usingRAG: usingRAG,
            contextUsed: messages.length
        }));

    } catch (error) {
        console.error('❌ Error processing chat:', error);
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Sorry, I encountered an error processing your message.'
        }));
    }
}
}