import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import fs from 'fs';
import path from 'path';

const getTableConfigs = () => {
  const fileContent = fs.readFileSync(path.join(process.cwd(), 'src', 'data', 'tables.json'), 'utf-8');
  return JSON.parse(fileContent) as { id: string; primaryKey?: string }[];
};

const getAllowedTables = () => {
  try { return getTableConfigs().map(c => c.id); } catch { return []; }
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tableName: string }> | { tableName: string } }
) {
  const resolvedParams = await Promise.resolve(params);
  const { tableName } = resolvedParams;

  if (!getAllowedTables().includes(tableName)) {
    return NextResponse.json({ error: 'Invalid table' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const column = searchParams.get('column');

  if (!column || !/^[a-zA-Z0-9_]+$/.test(column)) {
    return NextResponse.json({ error: 'Invalid column' }, { status: 400 });
  }

  try {
    const result = await query(
      `SELECT DISTINCT "${column}" FROM public.${tableName} WHERE "${column}" IS NOT NULL ORDER BY "${column}" LIMIT 500`,
      []
    );
    const values = result.rows.map(r => {
      const v = r[column];
      return typeof v === 'object' ? JSON.stringify(v) : String(v);
    });
    return NextResponse.json({ values });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
