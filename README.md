# @phoenixaihub/graphrag

[![npm](https://img.shields.io/npm/v/@phoenixaihub/graphrag)](https://www.npmjs.com/package/@phoenixaihub/graphrag)
[![CI](https://github.com/phoenix-assistant/graph-rag-private-codebases/actions/workflows/ci.yml/badge.svg)](https://github.com/phoenix-assistant/graph-rag-private-codebases/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Graph RAG for private codebases** — index your code into a knowledge graph with semantic search and an MCP server. Self-hosted, no code leaves your machine.

## Features

- 🔍 **Index** TypeScript, JavaScript, and Python codebases into a knowledge graph
- 🧠 **Semantic search** over code with graph-aware context expansion
- 🔗 **Graph relationships** — functions, classes, imports, exports, call chains
- 🤖 **MCP server** — plug into Claude, Cursor, or any MCP-compatible client
- 🏠 **Self-hosted** — SQLite-backed, runs locally, zero cloud dependencies
- ⚡ **Optional embeddings** via OpenAI `text-embedding-3-small`

## Quick Start

```bash
npm install -g @phoenixaihub/graphrag

# Index a repo
graphrag index ./my-project

# Search code
graphrag query "authentication middleware"

# Start MCP server
graphrag serve --db ./my-project/.graphrag/index.db
```

## MCP Configuration

Add to your Claude Desktop / Cursor config:

```json
{
  "mcpServers": {
    "graphrag": {
      "command": "graphrag",
      "args": ["serve", "--db", "/path/to/project/.graphrag/index.db"]
    }
  }
}
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `search_codebase` | Semantic search across indexed code entities |
| `get_function_context` | Get a function/class with full graph context (callers, callees, imports) |
| `find_usages` | Find all usages of a function, class, or variable |

## With Embeddings

Set `OPENAI_API_KEY` and use `--embed`:

```bash
export OPENAI_API_KEY=sk-...
graphrag index ./my-project --embed
```

## How It Works

1. **Parse** — Extracts functions, classes, imports/exports using regex-based parsing
2. **Graph** — Builds entity relationship graph (contains, imports, calls, extends)
3. **Store** — Persists to SQLite with full-text search indexes
4. **Search** — Text search + graph traversal for context-rich results
5. **Serve** — MCP server exposes tools for AI-assisted code exploration

## Comparison

| Feature | GraphRAG | Sourcegraph | Codeium |
|---------|----------|-------------|---------|
| Self-hosted | ✅ Local SQLite | ❌ Server required | ❌ Cloud |
| Privacy | ✅ No code leaves machine | ⚠️ Depends on deployment | ❌ Cloud-processed |
| MCP support | ✅ Built-in | ❌ | ❌ |
| Setup time | < 1 min | Hours | Minutes |
| Cost | Free | $$$$ | Free tier limited |
| Graph relationships | ✅ | ✅ | ❌ |
| Languages | TS/JS/Python | 30+ | 70+ |

## Programmatic API

```typescript
import { GraphDB, parseFile } from '@phoenixaihub/graphrag';

const db = new GraphDB('.graphrag/index.db');
const result = parseFile('./src/main.ts');

for (const entity of result.entities) {
  db.insertEntity(entity);
}

const results = db.searchEntities('handler', 5);
console.log(results);
```

## License

MIT
