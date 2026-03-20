import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const dataFilePath = path.join(process.cwd(), 'src', 'data', 'tables.json');

const readConfig = () => {
    try {
        const fileContent = fs.readFileSync(dataFilePath, 'utf-8');
        return JSON.parse(fileContent);
    } catch(e) {
        return [];
    }
};

const writeConfig = (data: any) => {
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf-8');
};

export async function GET() {
    return NextResponse.json(readConfig());
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        
        if (!body.id || !body.name || !body.desc) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const currentData = readConfig();
        
        if (currentData.some((t: any) => t.id === body.id)) {
            return NextResponse.json({ error: "Table configuration already exists" }, { status: 400 });
        }

        const newEntry = {
            id: body.id,
            name: body.name,
            icon: body.icon || "Database",
            color: body.color || "#888888",
            desc: body.desc
        };

        currentData.push(newEntry);
        writeConfig(currentData);

        return NextResponse.json({ message: "Table configuration added", data: newEntry }, { status: 201 });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const body = await request.json();
        if (!body.id) return NextResponse.json({ error: "Table ID required" }, { status: 400 });

        let currentData = readConfig();
        const index = currentData.findIndex((t: any) => t.id === body.id);
        
        if (index === -1) {
            return NextResponse.json({ error: "Table configuration not found" }, { status: 404 });
        }

        currentData[index] = { ...currentData[index], ...body };
        writeConfig(currentData);

        return NextResponse.json({ message: "Table configuration updated", data: currentData[index] });
    } catch(e:any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) return NextResponse.json({ error: "Table ID required" }, { status: 400 });

        let currentData = readConfig();
        const filteredData = currentData.filter((t: any) => t.id !== id);

        if (filteredData.length === currentData.length) {
            return NextResponse.json({ error: "Table configuration not found" }, { status: 404 });
        }

        writeConfig(filteredData);
        return NextResponse.json({ message: "Table configuration deleted" });
    } catch(e:any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
