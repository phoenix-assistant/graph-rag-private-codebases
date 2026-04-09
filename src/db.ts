import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export interface Entity {
  id?: number;
  filePath: string;
  name: string;
  kind: 'file' | 'function' | 'class' | 'method' | 'variable' | 'import' | 'export';
  startLine: number;
  endLine: number;
  code: string;
  language: string;
}

export interface Edge {
  id?: number;
  sourceId: number;
  targetId: number;
  relation: 'contains' | 'imports' | 'exports' | 'calls' | 'extends' | 'implements';
}

export interface Chunk {
  id?: number;
  entityId: number;
  content: string;
  embedding?: Float64Array | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  code TEXT NOT NULL,
  language TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES entities(id),
  target_id INTEGER NOT NULL REFERENCES entities(id),
  relation TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id INTEGER NOT NULL REFERENCES entities(id),
  content TEXT NOT NULL,
  embedding BLOB
);

CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
CREATE INDEX IF NOT EXISTS idx_entities_kind ON entities(kind);
CREATE INDEX IF NOT EXISTS idx_entities_file ON entities(file_path);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
CREATE INDEX IF NOT EXISTS idx_chunks_entity ON chunks(entity_id);
`;

export class GraphDB {
  private db: Database.Database;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  insertEntity(e: Entity): number {
    const stmt = this.db.prepare(
      'INSERT INTO entities (file_path, name, kind, start_line, end_line, code, language) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(e.filePath, e.name, e.kind, e.startLine, e.endLine, e.code, e.language);
    return Number(result.lastInsertRowid);
  }

  insertEdge(e: Edge): number {
    const stmt = this.db.prepare(
      'INSERT INTO edges (source_id, target_id, relation) VALUES (?, ?, ?)'
    );
    const result = stmt.run(e.sourceId, e.targetId, e.relation);
    return Number(result.lastInsertRowid);
  }

  insertChunk(c: Chunk): number {
    const stmt = this.db.prepare(
      'INSERT INTO chunks (entity_id, content, embedding) VALUES (?, ?, ?)'
    );
    const embeddingBlob = c.embedding ? Buffer.from(c.embedding.buffer) : null;
    const result = stmt.run(c.entityId, c.content, embeddingBlob);
    return Number(result.lastInsertRowid);
  }

  getEntity(id: number): Entity | undefined {
    return this.db.prepare('SELECT * FROM entities WHERE id = ?').get(id) as Entity | undefined;
  }

  findEntitiesByName(name: string): Entity[] {
    return this.db.prepare(
      'SELECT * FROM entities WHERE name LIKE ?'
    ).all(`%${name}%`) as Entity[];
  }

  searchEntities(query: string, limit = 5): Entity[] {
    // Text-based search across name and code
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];
    const conditions = terms.map(() => '(LOWER(name) LIKE ? OR LOWER(code) LIKE ?)').join(' AND ');
    const params = terms.flatMap(t => [`%${t}%`, `%${t}%`]);
    return this.db.prepare(
      `SELECT * FROM entities WHERE ${conditions} ORDER BY kind, name LIMIT ?`
    ).all(...params, limit) as Entity[];
  }

  getRelated(entityId: number, direction: 'outgoing' | 'incoming' | 'both' = 'both'): Array<{ entity: Entity; relation: string }> {
    const results: Array<{ entity: Entity; relation: string }> = [];
    if (direction === 'outgoing' || direction === 'both') {
      const rows = this.db.prepare(
        'SELECT e.*, ed.relation FROM entities e JOIN edges ed ON e.id = ed.target_id WHERE ed.source_id = ?'
      ).all(entityId) as Array<Entity & { relation: string }>;
      results.push(...rows.map(r => ({ entity: r, relation: r.relation })));
    }
    if (direction === 'incoming' || direction === 'both') {
      const rows = this.db.prepare(
        'SELECT e.*, ed.relation FROM entities e JOIN edges ed ON e.id = ed.source_id WHERE ed.target_id = ?'
      ).all(entityId) as Array<Entity & { relation: string }>;
      results.push(...rows.map(r => ({ entity: r, relation: r.relation })));
    }
    return results;
  }

  getUsages(name: string): Entity[] {
    return this.db.prepare(
      `SELECT DISTINCT e2.* FROM entities e1
       JOIN edges ed ON e1.id = ed.target_id
       JOIN entities e2 ON e2.id = ed.source_id
       WHERE e1.name = ? AND ed.relation IN ('calls', 'imports')`
    ).all(name) as Entity[];
  }

  clearFile(filePath: string): void {
    const entities = this.db.prepare('SELECT id FROM entities WHERE file_path = ?').all(filePath) as Array<{ id: number }>;
    const ids = entities.map(e => e.id);
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    this.db.prepare(`DELETE FROM chunks WHERE entity_id IN (${placeholders})`).run(...ids);
    this.db.prepare(`DELETE FROM edges WHERE source_id IN (${placeholders}) OR target_id IN (${placeholders})`).run(...ids, ...ids);
    this.db.prepare(`DELETE FROM entities WHERE file_path = ?`).run(filePath);
  }

  getStats(): { entities: number; edges: number; chunks: number; files: number } {
    const entities = (this.db.prepare('SELECT COUNT(*) as c FROM entities').get() as { c: number }).c;
    const edges = (this.db.prepare('SELECT COUNT(*) as c FROM edges').get() as { c: number }).c;
    const chunks = (this.db.prepare('SELECT COUNT(*) as c FROM chunks').get() as { c: number }).c;
    const files = (this.db.prepare('SELECT COUNT(DISTINCT file_path) as c FROM entities').get() as { c: number }).c;
    return { entities, edges, chunks, files };
  }

  close(): void {
    this.db.close();
  }
}
