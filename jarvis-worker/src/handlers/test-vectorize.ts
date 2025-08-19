import type { Env } from '../types/env';

export async function handleTestVectorize(request: Request, env: Env): Promise<Response> {
  try {
    console.log('Testing Vectorize...');
    
    // Test 1: Descrivi l'index
    const indexInfo = await env.VECTORIZE_INDEX.describe();
    console.log('Index info:', indexInfo);
    
    // Test 2: Crea un embedding
    const testEmbedding = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
      text: ["This is a test document about artificial intelligence and machine learning"]
    });
    console.log('Embedding created, length:', testEmbedding.data[0].length);
    
    // Test 3: Inserisci un vettore
    await env.VECTORIZE_INDEX.insert([{
      id: 'test-doc-1',
      values: testEmbedding.data[0],
      metadata: { 
        content: "This is a test document about artificial intelligence and machine learning",
        title: "AI Test Document",
        type: "test",
        timestamp: new Date().toISOString()
      }
    }]);
    console.log('Vector inserted successfully');
    
    // Test 4: Cerca
    const searchResults = await env.VECTORIZE_INDEX.query(testEmbedding.data[0], {
      topK: 1,
      returnMetadata: 'all'
    });
    console.log('Search results:', searchResults);
    
    return Response.json({
      success: true,
      indexInfo,
      embeddingLength: testEmbedding.data[0].length,
      vectorsInserted: 1,
      searchResults,
      message: "Vectorize is working perfectly!"
    }, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      }
    });
    
  } catch (error: any) {
    console.error('Vectorize test failed:', error);
    return Response.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { 
      status: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      }
    });
  }
}