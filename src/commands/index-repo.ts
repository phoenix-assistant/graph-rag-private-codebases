import path from 'path';
import { glob } from 'glob';
import { GraphDB } from '../db.js';
import { parseFile } from '../parser.js';
import { getEmbeddings } from '../embeddings.js';

interface IndexOptions {
  extensions: string[];
  dbPath: string;
  embed: boolean;
}

export async function indexRepo(repoPath: string, opts: IndexOptions): Promise<void> {
  const absRepo = path.resolve(repoPath);
  const dbPath = path.isAbsolute(opts.dbPath) ? opts.dbPath : path.join(absRepo, opts.dbPath);
  const db = new GraphDB(dbPath);

  const patterns = opts.extensions.map(ext => `**/*.${ext}`);
  const files = await glob(patterns, {
    cwd: absRepo,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/venv/**', '**/__pycache__/**'],
    absolute: true,
  });

  console.log(`Indexing ${files.length} files from ${absRepo}`);

  const entityNameToId = new Map<string, number>();
  let totalEntities = 0;
  let totalEdges = 0;
  const pendingEdges: Array<{ sourceName: string; targetName: string; relation: string }> = [];
  const chunksToEmbed: Array<{ entityId: number; content: string }> = [];

  for (const file of files) {
    const relPath = path.relative(absRepo, file);
    db.clearFile(relPath);
    
    const result = parseFile(file);
    
    for (const entity of result.entities) {
      const e = { ...entity, filePath: relPath };
      const id = db.insertEntity(e);
      entityNameToId.set(e.name, id);
      totalEntities++;

      // Create chunk for non-import entities
      if (e.kind !== 'import') {
        chunksToEmbed.push({ entityId: id, content: `${e.kind} ${e.name}\n${e.code}` });
      }
    }

    pendingEdges.push(...result.edges);
  }

  // Resolve and insert edges
  for (const edge of pendingEdges) {
    const sourceId = entityNameToId.get(edge.sourceName);
    const targetId = entityNameToId.get(edge.targetName);
    if (sourceId && targetId) {
      db.insertEdge({ sourceId, targetId, relation: edge.relation as any });
      totalEdges++;
    }
  }

  // Generate embeddings in batches
  if (opts.embed && process.env.OPENAI_API_KEY) {
    console.log(`Generating embeddings for ${chunksToEmbed.length} chunks...`);
    const batchSize = 100;
    for (let i = 0; i < chunksToEmbed.length; i += batchSize) {
      const batch = chunksToEmbed.slice(i, i + batchSize);
      const embeddings = await getEmbeddings(batch.map(c => c.content));
      for (let j = 0; j < batch.length; j++) {
        db.insertChunk({
          entityId: batch[j].entityId,
          content: batch[j].content,
          embedding: new Float64Array(embeddings[j]),
        });
      }
      console.log(`  Embedded ${Math.min(i + batchSize, chunksToEmbed.length)}/${chunksToEmbed.length}`);
    }
  } else {
    // Store chunks without embeddings
    for (const chunk of chunksToEmbed) {
      db.insertChunk({ entityId: chunk.entityId, content: chunk.content });
    }
  }

  const stats = db.getStats();
  console.log(`\nDone! Indexed:`);
  console.log(`  Files:    ${stats.files}`);
  console.log(`  Entities: ${stats.entities}`);
  console.log(`  Edges:    ${stats.edges}`);
  console.log(`  Chunks:   ${stats.chunks}`);
  console.log(`\nDatabase: ${dbPath}`);

  db.close();
}
