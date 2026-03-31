import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import fs from 'fs';
import path from 'path';

const getPrimaryKey = (tableName: string) => {
  if (tableName === 'v3_t_master_modules') return 'module_id';
  if (tableName === 'v3_t_master_platforms') return 'platform_id';
  if (tableName === 'v3_t_platform_adsdashboardpages') return 'id'; // keep id for ads
  return 'id'; // default fallback for other tables
};

const getAllowedTables = () => {
  try {
    const fileContent = fs.readFileSync(path.join(process.cwd(), 'src', 'data', 'tables.json'), 'utf-8');
    const configs = JSON.parse(fileContent);
    return configs.map((c: any) => c.id);
  } catch (e) {
    return [
      'v3_t_product_metrics',
      'v3_t_platform_adsdashboardpages',
      'v3_t_master_modules'
    ];
  }
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tableName: string }> | { tableName: string } }
) {
  const resolvedParams = await Promise.resolve(params);
  const { tableName } = resolvedParams;

  if (!getAllowedTables().includes(tableName)) {
    return NextResponse.json({ error: 'Invalid or unconfigured table name' }, { status: 400 });
  }

  try {
    const primaryKey = getPrimaryKey(tableName);

    // 1. Get exact columns for this table from info schema
    const schemaQuery = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1
    `, [tableName]);
    
    if (schemaQuery.rowCount === 0) {
        return NextResponse.json({ error: 'Table does not exist in database' }, { status: 404 });
    }
    
    const tableColumns = schemaQuery.rows.map(r => r.column_name);
    const hasPlatformId = tableColumns.includes('platform_id');

    // 2. Query table data (with platform JOIN if applicable)
    let sql = `SELECT * FROM public.${tableName} ORDER BY created_time_stamp DESC NULLS LAST, ${primaryKey} DESC LIMIT 100`;

    if (hasPlatformId) {
      sql = `
        SELECT t.*, p.platform as platform_name 
        FROM public.${tableName} t
        LEFT JOIN public.v3_t_master_platforms p ON t.platform_id = p.platform_id
        ORDER BY t.created_time_stamp DESC NULLS LAST, t.${primaryKey} DESC 
        LIMIT 100
      `;
    }

    const dataResult = await query(sql);
    
    // We return both the fetched data AND the base columns schema so the frontend can render empty rows properly
    return NextResponse.json({ 
        data: dataResult.rows,
        columns: tableColumns,
        hasPlatformId 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tableName: string }> | { tableName: string } }
) {
  const resolvedParams = await Promise.resolve(params);
  const { tableName } = resolvedParams;

  if (!getAllowedTables().includes(tableName)) {
    return NextResponse.json({ error: 'Invalid or unconfigured table name' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const primaryKey = getPrimaryKey(tableName);
    
    // Remove auto-generated or joined fields
    delete body[primaryKey];
    delete body['platform_name'];
    
    const keys = Object.keys(body);
    const values = Object.values(body).map(val => {
        if (typeof val === 'object' && val !== null) return JSON.stringify(val);
        if (typeof val === 'string' && val === '') return null;
        return val;
    });
    
    if (keys.length === 0) return NextResponse.json({ error: 'No data provided' }, { status: 400 });

    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const columns = keys.map(k => `"${k}"`).join(', ');

    const sql = `INSERT INTO public.${tableName} (${columns}) VALUES (${placeholders}) RETURNING *`;
    const result = await query(sql, values);
    
    return NextResponse.json({ data: result.rows[0], message: 'Record created successfully' }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ tableName: string }> | { tableName: string } }
) {
  const resolvedParams = await Promise.resolve(params);
  const { tableName } = resolvedParams;

  if (!getAllowedTables().includes(tableName)) {
    return NextResponse.json({ error: 'Invalid or unconfigured table name' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const primaryKey = getPrimaryKey(tableName);
    const idValue = body[primaryKey];

    if (!idValue) return NextResponse.json({ error: `${primaryKey} is required for updating` }, { status: 400 });

    const updateData = { ...body };
    delete updateData[primaryKey];
    delete updateData['platform_name'];

    const keys = Object.keys(updateData);
    const values = Object.values(updateData).map(val => {
        if (typeof val === 'object' && val !== null) return JSON.stringify(val);
        if (typeof val === 'string' && val === '') return null;
        return val;
    });

    if (keys.length === 0) return NextResponse.json({ error: 'No data to update' }, { status: 400 });

    const setClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
    values.push(idValue); 

    const sql = `UPDATE public.${tableName} SET ${setClause} WHERE "${primaryKey}" = $${values.length} RETURNING *`;
    const result = await query(sql, values);

    if (result.rowCount === 0) return NextResponse.json({ error: 'Record not found' }, { status: 404 });

    return NextResponse.json({ data: result.rows[0], message: 'Record updated successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tableName: string }> | { tableName: string } }
) {
  const resolvedParams = await Promise.resolve(params);
  const { tableName } = resolvedParams;

  if (!getAllowedTables().includes(tableName)) {
    return NextResponse.json({ error: 'Invalid or unconfigured table name' }, { status: 400 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const primaryKey = getPrimaryKey(tableName);
    const idValue = searchParams.get('id');

    if (!idValue) return NextResponse.json({ error: `Query parameter 'id' is required` }, { status: 400 });

    const sql = `DELETE FROM public.${tableName} WHERE "${primaryKey}" = $1 RETURNING *`;
    const result = await query(sql, [idValue]);

    if (result.rowCount === 0) return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    return NextResponse.json({ message: 'Record deleted successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
