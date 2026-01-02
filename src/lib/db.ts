// IndexedDB wrapper for FarmDeck local storage
import { openDB, DBSchema, IDBPDatabase } from 'idb';

// Input item for project details
export interface InputItem {
  name: string;
  cost: number;
}

// Project Details (Section 1) - editable until project is completed
export interface ProjectDetails {
  capital: number;
  totalItemCount: number;
  costs: number;
  estimatedRevenue: number;
  inputs: InputItem[];
  challengesSummary: string;
  customDetails: Record<string, string | number>;
  notes?: string; // Project notes with formatting
}

export type ColumnType = 'text' | 'number' | 'cash_inflow' | 'cash_outflow';

export interface FarmProject {
  id: string;
  title: string;
  startDate: string;
  createdAt: string;
  updatedAt: string;
  customColumns: string[];
  customColumnTypes: Record<string, ColumnType>;
  isCompleted: boolean;
  completedAt?: string;
  details: ProjectDetails;
  // Soft delete fields
  deletedAt?: string;
  isDeleted?: boolean;
}

export interface FarmRecord {
  id: string;
  projectId: string;
  date: string;
  item?: string; // Optional - for projects with multiple products
  produceAmount: number;
  produceRevenue: number;
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

// Default project details
export function createDefaultProjectDetails(): ProjectDetails {
  return {
    capital: 0,
    totalItemCount: 0,
    costs: 0,
    estimatedRevenue: 0,
    inputs: [],
    challengesSummary: '',
    customDetails: {},
  };
}

// Project operations
export async function createProject(title: string, startDate: string, customColumns: string[] = [], existingId?: string): Promise<FarmProject> {
  const db = await getDB();
  const now = new Date().toISOString();
  const project: FarmProject = {
    id: existingId || generateId(),
    title,
    startDate,
    createdAt: now,
    updatedAt: now,
    customColumns,
    customColumnTypes: {},
    isCompleted: false,
    details: createDefaultProjectDetails(),
  };
  await db.put('projects', project);
  return project;
}

// Import a full project with its original ID (for syncing)
export async function importProject(projectData: FarmProject): Promise<FarmProject> {
  const db = await getDB();
  const project: FarmProject = {
    ...projectData,
    // Ensure details exists (for backward compatibility)
    details: projectData.details || createDefaultProjectDetails(),
    customColumnTypes: projectData.customColumnTypes || {},
    isCompleted: projectData.isCompleted || false,
    updatedAt: new Date().toISOString(),
  };
  await db.put('projects', project);
  return project;
}

// Update project details (Section 1)
export async function updateProjectDetails(projectId: string, details: ProjectDetails): Promise<void> {
  const db = await getDB();
  const project = await db.get('projects', projectId);
  if (!project) throw new Error('Project not found');
  if (project.isCompleted) throw new Error('Cannot update a completed project');
  
  project.details = details;
  project.updatedAt = new Date().toISOString();
  await db.put('projects', project);
}

// Complete project (lock Section 1)
export async function completeProject(projectId: string): Promise<void> {
  const db = await getDB();
  const project = await db.get('projects', projectId);
  if (!project) throw new Error('Project not found');
  
  project.isCompleted = true;
  project.completedAt = new Date().toISOString();
  project.updatedAt = new Date().toISOString();
  await db.put('projects', project);
}

// Import a record with its original ID (for syncing)
export async function importRecord(record: FarmRecord): Promise<FarmRecord> {
  const db = await getDB();
  const existingRecord = await db.get('records', record.id);
  
  // If record already exists and is locked, don't overwrite
  if (existingRecord?.isLocked) {
    return existingRecord;
  }
  
  // Preserve the original record data including ID and lock status
  const importedRecord: FarmRecord = {
    ...record,
    updatedAt: new Date().toISOString(),
  };
  await db.put('records', importedRecord);
  return importedRecord;
}

export async function getAllProjects(): Promise<FarmProject[]> {
  const db = await getDB();
  const projects = await db.getAll('projects');
  // Filter out deleted projects and ensure backward compatibility
  return projects
    .filter(p => !p.isDeleted)
    .map(p => ({
      ...p,
      isCompleted: p.isCompleted ?? false,
      details: p.details ?? createDefaultProjectDetails(),
      customColumnTypes: p.customColumnTypes ?? {},
    }));
}

// Get only deleted projects (for trash)
export async function getDeletedProjects(): Promise<FarmProject[]> {
  const db = await getDB();
  const projects = await db.getAll('projects');
  return projects
    .filter(p => p.isDeleted)
    .map(p => ({
      ...p,
      isCompleted: p.isCompleted ?? false,
      details: p.details ?? createDefaultProjectDetails(),
      customColumnTypes: p.customColumnTypes ?? {},
    }))
    .sort((a, b) => new Date(b.deletedAt!).getTime() - new Date(a.deletedAt!).getTime());
}

export async function getProject(id: string): Promise<FarmProject | undefined> {
  const db = await getDB();
  const project = await db.get('projects', id);
  if (!project) return undefined;
  // Ensure backward compatibility for projects without new fields
  return {
    ...project,
    isCompleted: project.isCompleted ?? false,
    details: project.details ?? createDefaultProjectDetails(),
    customColumnTypes: project.customColumnTypes ?? {},
  };
}

export async function updateProject(project: FarmProject): Promise<void> {
  const db = await getDB();
  project.updatedAt = new Date().toISOString();
  await db.put('projects', project);
}

// Soft delete - moves project to trash
export async function deleteProject(id: string): Promise<void> {
  const db = await getDB();
  const project = await db.get('projects', id);
  if (!project) throw new Error('Project not found');
  
  project.isDeleted = true;
  project.deletedAt = new Date().toISOString();
  project.updatedAt = new Date().toISOString();
  await db.put('projects', project);
}

// Restore project from trash
export async function restoreProject(id: string): Promise<void> {
  const db = await getDB();
  const project = await db.get('projects', id);
  if (!project) throw new Error('Project not found');
  
  project.isDeleted = false;
  project.deletedAt = undefined;
  project.updatedAt = new Date().toISOString();
  await db.put('projects', project);
}

// Permanently delete project and all its records
export async function permanentlyDeleteProject(id: string): Promise<void> {
  const db = await getDB();
  const records = await getRecordsByProject(id);
  const tx = db.transaction(['projects', 'records'], 'readwrite');
  for (const record of records) {
    await tx.objectStore('records').delete(record.id);
  }
  await tx.objectStore('projects').delete(id);
  await tx.done;
}

// Clean up projects that have been in trash for more than 30 days
export async function cleanupOldTrash(): Promise<void> {
  const db = await getDB();
  const projects = await db.getAll('projects');
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  for (const project of projects) {
    if (project.isDeleted && project.deletedAt) {
      const deletedDate = new Date(project.deletedAt);
      if (deletedDate < thirtyDaysAgo) {
        await permanentlyDeleteProject(project.id);
      }
    }
  }
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

// Calculate total project costs (inputs + costs from project details)
export function calculateTotalProjectCosts(details: ProjectDetails): number {
  const inputsCost = details.inputs?.reduce((sum, input) => sum + (input.cost || 0), 0) || 0;
  return inputsCost + (details.costs || 0);
}

export async function getMonthlyAggregation(projectId: string, projectDetails?: ProjectDetails): Promise<MonthlyAggregation[]> {
  const records = await getRecordsByProject(projectId);
  const monthlyData: Record<string, MonthlyAggregation> = {};

  // Calculate total project-level costs (to be distributed across months)
  const totalProjectCosts = projectDetails ? calculateTotalProjectCosts(projectDetails) : 0;
  const capital = projectDetails?.capital || 0;

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
    monthlyData[month].totalProduceAmount += record.produceAmount || 0;
    monthlyData[month].totalRevenue += record.produceRevenue || 0;
    monthlyData[month].recordCount += 1;
  }

  const monthCount = Object.keys(monthlyData).length;
  const costPerMonth = monthCount > 0 ? totalProjectCosts / monthCount : 0;
  const capitalPerMonth = monthCount > 0 ? capital / monthCount : 0;

  // Calculate profits with distributed costs
  for (const month in monthlyData) {
    monthlyData[month].totalInputCost = costPerMonth;
    monthlyData[month].grossProfit = monthlyData[month].totalRevenue;
    // Net profit = Revenue - Costs - Capital (all distributed per month)
    monthlyData[month].netProfit = monthlyData[month].totalRevenue - costPerMonth - capitalPerMonth;
  }

  return Object.values(monthlyData).sort((a, b) => b.month.localeCompare(a.month));
}
