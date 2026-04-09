#!/usr/bin/env node
import { Command } from 'commander';
import { indexRepo } from './commands/index-repo.js';
import { queryCode } from './commands/query.js';
import { serve } from './commands/serve.js';

const program = new Command();

program
  .name('graphrag')
  .description('Graph RAG for private codebases — self-hosted code intelligence')
  .version('0.1.0');

program
  .command('index <repo>')
  .description('Index a codebase into a knowledge graph')
  .option('--extensions <exts>', 'File extensions to index (comma-separated)', 'ts,tsx,js,jsx,py')
  .option('--db <path>', 'Database path', '.graphrag/index.db')
  .option('--embed', 'Generate embeddings (requires OPENAI_API_KEY)', false)
  .action(async (repo: string, opts) => {
    await indexRepo(repo, {
      extensions: opts.extensions.split(','),
      dbPath: opts.db,
      embed: opts.embed,
    });
  });

program
  .command('query <question>')
  .description('Semantic search over indexed codebase with graph context')
  .option('--db <path>', 'Database path', '.graphrag/index.db')
  .option('--limit <n>', 'Max results', '5')
  .action(async (question: string, opts) => {
    await queryCode(question, {
      dbPath: opts.db,
      limit: parseInt(opts.limit, 10),
    });
  });

program
  .command('serve')
  .description('Start MCP server for code intelligence')
  .option('--db <path>', 'Database path', '.graphrag/index.db')
  .option('--port <n>', 'Port number', '3700')
  .action(async (opts) => {
    await serve({
      dbPath: opts.db,
      port: parseInt(opts.port, 10),
    });
  });

program.parse();
