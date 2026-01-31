import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { DuckDBInstance } from '@duckdb/node-api';
import { compile, SpanError } from '../index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));

let db: DuckDBInstance | null = null;

async function getDb(): Promise<DuckDBInstance> {
  if (!db) {
    db = await DuckDBInstance.create(':memory:');
  }
  return db;
}

interface QueryRequest {
  query: string;
}

interface QueryResponse {
  success: boolean;
  sql?: string;
  columns?: string[];
  rows?: Record<string, unknown>[];
  error?: string;
}

app.post('/api/query', async (req, res) => {
  const { query } = req.body as QueryRequest;

  if (!query || typeof query !== 'string') {
    const response: QueryResponse = {
      success: false,
      error: 'Missing or invalid query parameter'
    };
    res.status(400).json(response);
    return;
  }

  try {
    // Compile Span DSL to SQL
    const sql = compile(query, { dataPath: 'data', year: 2024 });

    // Execute SQL against DuckDB
    const instance = await getDb();
    const connection = await instance.connect();

    try {
      const reader = await connection.runAndReadAll(sql);
      const columns = reader.columnNames();
      const rows = reader.getRowObjectsJson() as Record<string, unknown>[];

      const response: QueryResponse = {
        success: true,
        sql,
        columns,
        rows
      };
      res.json(response);
    } finally {
      connection.closeSync();
    }
  } catch (err) {
    const error = err instanceof SpanError
      ? `${err.name}: ${err.message}`
      : err instanceof Error
        ? err.message
        : String(err);

    const response: QueryResponse = {
      success: false,
      error
    };
    res.status(400).json(response);
  }
});

app.listen(PORT, () => {
  console.log(`Span server running at http://localhost:${PORT}`);
});
