
export async function getRelevantMemoriesRAG(
    vectorize:any,
    ai:any,
    query:string,
    threshold: number = 0.75,
    maxResults:number = 5,
):Promise<Array<{content:string,category:string,score:number}>>{
    try{
        const queryEmbedding = await ai.run('@cg/baai/bge-m3',{
            text:query
        })

        const matches = await vectorize.query(queryEmbedding.data[0],{
            topK:maxResults,
            returnMetadata:true,
        });

        return matches.matches
        .filter((match: { score: number; }) => match.score >=threshold)
        .map((match: { medadata: { content: any; }; metadata: { category: any; }; score: any; }) =>({
            content:match.medadata.content,
            category:match.metadata.category,
            score: match.score
        }))
    }catch(error){
        return []
    }
}

export async function listAllMemoriesRAG(
  vectorize: any
): Promise<Array<{id: string, content: string, category: string, timestamp: string}>> {
  try {

    const dummyVector = new Array(1024).fill(0);
    
    const matches = await vectorize.query(dummyVector, {
      topK: 100, 
      returnMetadata: true
    });
    
    return matches.matches.map((match: { id: any; metadata: { content: any; category: any; timestamp: any; }; }) => ({
      id: match.id,
      content: match.metadata.content,
      category: match.metadata.category,
      timestamp: match.metadata.timestamp
    }));
    
  } catch (error) {

    return [];
  }
}

export async function deleteMemoryFromRAG(
  vectorize: any,
  memoryId: string
): Promise<boolean> {
  try {
    await vectorize.deleteByIds([memoryId]);

    return true;
  } catch (error) {

    return false;
  }
}