import OpenAI from 'openai';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI();
  }
  return client;
}

export async function getEmbedding(text: string): Promise<number[]> {
  const openai = getClient();
  const resp = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.substring(0, 8000),
  });
  return resp.data[0].embedding;
}

export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const openai = getClient();
  const truncated = texts.map(t => t.substring(0, 8000));
  const resp = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: truncated,
  });
  return resp.data.map(d => d.embedding);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
