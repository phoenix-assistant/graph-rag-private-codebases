import path from 'path';
import { GraphDB } from '../db.js';

interface QueryOptions {
  dbPath: string;
  limit: number;
}

export async function queryCode(question: string, opts: QueryOptions): Promise<void> {
  const dbPath = path.resolve(opts.dbPath);
  const db = new GraphDB(dbPath);

  const results = db.searchEntities(question, opts.limit);

  if (results.length === 0) {
    console.log('No results found.');
    db.close();
    return;
  }

  console.log(`Found ${results.length} results:\n`);

  for (const entity of results) {
    const id = (entity as any).id as number;
    console.log(`━━━ ${entity.kind}: ${entity.name} ━━━`);
    console.log(`File: ${entity.filePath}:${entity.startLine}-${entity.endLine}`);
    
    // Get related entities for context
    const related = db.getRelated(id);
    if (related.length > 0) {
      console.log(`Relations:`);
      for (const r of related.slice(0, 5)) {
        console.log(`  ${r.relation} → ${r.entity.name} (${r.entity.kind})`);
      }
    }
    
    console.log(`\n${entity.code.substring(0, 300)}`);
    if (entity.code.length > 300) console.log('  ...');
    console.log('');
  }

  db.close();
}
