import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import path from 'path';
import { GraphDB } from '../db.js';

interface ServeOptions {
  dbPath: string;
  port: number;
}

export async function serve(opts: ServeOptions): Promise<void> {
  const dbPath = path.resolve(opts.dbPath);
  const db = new GraphDB(dbPath);

  const server = new McpServer({
    name: 'graphrag',
    version: '0.1.0',
  });

  server.tool(
    'search_codebase',
    'Search the indexed codebase for functions, classes, and code patterns',
    { query: z.string().describe('Search query'), limit: z.number().optional().describe('Max results (default 5)') },
    async ({ query, limit }) => {
      const results = db.searchEntities(query, limit ?? 5);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(results.map(e => ({
            name: e.name,
            kind: e.kind,
            file: `${e.filePath}:${e.startLine}-${e.endLine}`,
            code: e.code.substring(0, 500),
          })), null, 2),
        }],
      };
    }
  );

  server.tool(
    'get_function_context',
    'Get a function/class with its full graph context (callers, callees, imports)',
    { name: z.string().describe('Function or class name') },
    async ({ name }) => {
      const entities = db.findEntitiesByName(name);
      if (entities.length === 0) {
        return { content: [{ type: 'text' as const, text: `No entity found: ${name}` }] };
      }
      const entity = entities[0];
      const id = (entity as any).id as number;
      const related = db.getRelated(id);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            entity: { name: entity.name, kind: entity.kind, file: entity.filePath, code: entity.code },
            related: related.map(r => ({
              name: r.entity.name, kind: r.entity.kind, relation: r.relation,
              file: r.entity.filePath,
            })),
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'find_usages',
    'Find all usages of a function, class, or variable',
    { name: z.string().describe('Entity name to find usages of') },
    async ({ name }) => {
      const usages = db.getUsages(name);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(usages.map(e => ({
            name: e.name, kind: e.kind,
            file: `${e.filePath}:${e.startLine}-${e.endLine}`,
            code: e.code.substring(0, 200),
          })), null, 2),
        }],
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('GraphRAG MCP server running on stdio');
}
