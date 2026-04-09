import fs from 'fs';
import path from 'path';
import type { Entity, Edge } from './db.js';

// Regex-based parser (no native tree-sitter dependency — works everywhere)

interface ParseResult {
  entities: Omit<Entity, 'id'>[];
  edges: Array<{ sourceName: string; targetName: string; relation: Edge['relation'] }>;
}

const FUNCTION_PATTERNS: Record<string, RegExp[]> = {
  typescript: [
    /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm,
    /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/gm,
    /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>/gm,
  ],
  python: [
    /^def\s+(\w+)\s*\(/gm,
    /^async\s+def\s+(\w+)\s*\(/gm,
  ],
};

const CLASS_PATTERNS: Record<string, RegExp[]> = {
  typescript: [/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/gm],
  python: [/^class\s+(\w+)/gm],
};

const IMPORT_PATTERNS: Record<string, RegExp[]> = {
  typescript: [
    /import\s+(?:{([^}]+)}|(\w+))\s+from\s+['"]([^'"]+)['"]/gm,
    /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/gm,
  ],
  python: [
    /^from\s+(\S+)\s+import\s+(.+)$/gm,
    /^import\s+(\S+)/gm,
  ],
};

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) return 'typescript';
  if (ext === '.py') return 'python';
  return 'unknown';
}

function getLineNumber(source: string, index: number): number {
  return source.substring(0, index).split('\n').length;
}

function extractBlock(lines: string[], startLine: number, language: string): { endLine: number; code: string } {
  // Simple brace/indent block extraction
  const start = startLine - 1;
  if (language === 'python') {
    let end = start + 1;
    const baseIndent = lines[start]?.search(/\S/) ?? 0;
    while (end < lines.length) {
      const line = lines[end];
      if (line.trim() === '') { end++; continue; }
      const indent = line.search(/\S/);
      if (indent <= baseIndent) break;
      end++;
    }
    return { endLine: end, code: lines.slice(start, end).join('\n') };
  }
  
  // Brace-based
  let braces = 0;
  let found = false;
  let end = start;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') { braces++; found = true; }
      if (ch === '}') braces--;
    }
    end = i + 1;
    if (found && braces <= 0) break;
  }
  if (!found) end = Math.min(start + 1, lines.length);
  return { endLine: end, code: lines.slice(start, end).join('\n') };
}

export function parseFile(filePath: string, source?: string): ParseResult {
  const content = source ?? fs.readFileSync(filePath, 'utf-8');
  const language = detectLanguage(filePath);
  if (language === 'unknown') return { entities: [], edges: [] };

  const lines = content.split('\n');
  const entities: Omit<Entity, 'id'>[] = [];
  const edgesList: ParseResult['edges'] = [];

  // File entity
  entities.push({
    filePath, name: path.basename(filePath), kind: 'file',
    startLine: 1, endLine: lines.length, code: content.substring(0, 500),
    language,
  });

  const langKey = language;
  
  // Functions
  for (const pattern of (FUNCTION_PATTERNS[langKey] ?? [])) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      const startLine = getLineNumber(content, match.index);
      const block = extractBlock(lines, startLine, language);
      entities.push({
        filePath, name, kind: 'function',
        startLine, endLine: block.endLine, code: block.code,
        language,
      });
      edgesList.push({ sourceName: path.basename(filePath), targetName: name, relation: 'contains' });
    }
  }

  // Classes
  for (const pattern of (CLASS_PATTERNS[langKey] ?? [])) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      const startLine = getLineNumber(content, match.index);
      const block = extractBlock(lines, startLine, language);
      entities.push({
        filePath, name, kind: 'class',
        startLine, endLine: block.endLine, code: block.code,
        language,
      });
      edgesList.push({ sourceName: path.basename(filePath), targetName: name, relation: 'contains' });
    }
  }

  // Imports
  for (const pattern of (IMPORT_PATTERNS[langKey] ?? [])) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const startLine = getLineNumber(content, match.index);
      const importSource = language === 'typescript' ? (match[3] ?? match[2] ?? match[1]) : match[1];
      const importedNames = language === 'typescript'
        ? (match[1] ?? match[2] ?? '').split(',').map(s => s.trim()).filter(Boolean)
        : (match[2] ?? match[1] ?? '').split(',').map(s => s.trim()).filter(Boolean);
      
      for (const name of importedNames) {
        entities.push({
          filePath, name: name.replace(/\s+as\s+\w+/, ''), kind: 'import',
          startLine, endLine: startLine, code: match[0],
          language,
        });
        edgesList.push({
          sourceName: path.basename(filePath),
          targetName: name.replace(/\s+as\s+\w+/, ''),
          relation: 'imports',
        });
      }
    }
  }

  return { entities, edges: edgesList };
}
