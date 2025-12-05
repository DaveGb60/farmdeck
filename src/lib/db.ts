// IndexedDB wrapper for FarmDeck local storage
import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface FarmProject {
  id: string;
  title: string;
  startDate: string;
  createdAt: string;
  updatedAt: string;
  customColumns: string[];
}

export interface FarmRecord {
  id: string;
  projectId: string;
  date: string;
  item: string;
  produceAmount: number;
  inputCost: number;
  revenue: number;
  comment: string;
  isLocked: boolean;
  lockedAt?: string;
  customFields: Record<string, string | number>;
  createdAt: string;
  updatedAt: string;
}

export interface MonthlyAggregation {
  month: string; // YYYY-MM
  projectId: string;
  totalInputCost: number;
  totalProduceAmount: number;
  totalRevenue: number;
  grossProfit: number;
  netProfit: number;
  recordCount: number;
}

interface FarmDeckDB extends DBSchema {
  projects: {
    key: string;
    value: FarmProject;
    indexes: { 'by-title': string };
  };
  records: {
    key: string;
    value: FarmRecord;
    indexes: { 
      'by-project': string;
      'by-date': string;
      'by-project-date': [string, string];
    };
  };
}

let dbInstance: IDBPDatabase<FarmDeckDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<FarmDeckDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<FarmDeckDB>('farmdeck-db', 1, {
    upgrade(db) {
      // Projects store
      const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
      projectStore.createIndex('by-title', 'title');

      // Records store
      const recordStore = db.createObjectStore('records', { keyPath: 'id' });
      recordStore.createIndex('by-project', 'projectId');
      recordStore.createIndex('by-date', 'date');
      recordStore.createIndex('by-project-date', ['projectId', 'date']);
    },
  });

  return dbInstance;
}

// Generate unique ID
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Project operations
export async function createProject(title: string, startDate: string, customColumns: string[] = []): Promise<FarmProject> {
  const db = await getDB();
  const now = new Date().toISOString();
  const project: FarmProject = {
    id: generateId(),
    title,
    startDate,
    createdAt: now,
    updatedAt: now,
    customColumns,
  };
  await db.put('projects', project);
  return project;
}

export async function getAllProjects(): Promise<FarmProject[]> {
  const db = await getDB();
  return db.getAll('projects');
}

export async function getProject(id: string): Promise<FarmProject | undefined> {
  const db = await getDB();
  return db.get('projects', id);
}

export async function updateProject(project: FarmProject): Promise<void> {
  const db = await getDB();
  project.updatedAt = new Date().toISOString();
  await db.put('projects', project);
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDB();
  // Delete all records for this project first
  const records = await getRecordsByProject(id);
  const tx = db.transaction(['projects', 'records'], 'readwrite');
  for (const record of records) {
    await tx.objectStore('records').delete(record.id);
  }
  await tx.objectStore('projects').delete(id);
  await tx.done;
}

// Record operations
export async function createRecord(
  projectId: string,
  data: Omit<FarmRecord, 'id' | 'projectId' | 'isLocked' | 'createdAt' | 'updatedAt'>
): Promise<FarmRecord> {
  const db = await getDB();
  const now = new Date().toISOString();
  const record: FarmRecord = {
    id: generateId(),
    projectId,
    ...data,
    isLocked: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.put('records', record);
  return record;
}

export async function getRecordsByProject(projectId: string): Promise<FarmRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('records', 'by-project', projectId);
}

export async function updateRecord(record: FarmRecord): Promise<void> {
  const db = await getDB();
  if (record.isLocked) {
    throw new Error('Cannot update a locked record');
  }
  record.updatedAt = new Date().toISOString();
  await db.put('records', record);
}

export async function lockRecord(id: string): Promise<void> {
  const db = await getDB();
  const record = await db.get('records', id);
  if (!record) throw new Error('Record not found');
  record.isLocked = true;
  record.lockedAt = new Date().toISOString();
  record.updatedAt = new Date().toISOString();
  await db.put('records', record);
}

export async function deleteRecord(id: string): Promise<void> {
  const db = await getDB();
  const record = await db.get('records', id);
  if (record?.isLocked) {
    throw new Error('Cannot delete a locked record');
  }
  await db.delete('records', id);
}

// Aggregation helpers
export function getMonthFromDate(dateStr: string): string {
  return dateStr.substring(0, 7); // YYYY-MM
}

export async function getMonthlyAggregation(projectId: string): Promise<MonthlyAggregation[]> {
  const records = await getRecordsByProject(projectId);
  const monthlyData: Record<string, MonthlyAggregation> = {};

  for (const record of records) {
    const month = getMonthFromDate(record.date);
    if (!monthlyData[month]) {
      monthlyData[month] = {
        month,
        projectId,
        totalInputCost: 0,
        totalProduceAmount: 0,
        totalRevenue: 0,
        grossProfit: 0,
        netProfit: 0,
        recordCount: 0,
      };
    }
    monthlyData[month].totalInputCost += record.inputCost || 0;
    monthlyData[month].totalProduceAmount += record.produceAmount || 0;
    monthlyData[month].totalRevenue += record.revenue || 0;
    monthlyData[month].recordCount += 1;
  }

  // Calculate profits
  for (const month in monthlyData) {
    monthlyData[month].grossProfit = monthlyData[month].totalRevenue;
    monthlyData[month].netProfit = monthlyData[month].totalRevenue - monthlyData[month].totalInputCost;
  }

  return Object.values(monthlyData).sort((a, b) => b.month.localeCompare(a.month));
}
