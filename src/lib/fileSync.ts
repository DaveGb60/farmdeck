// File Sync Module for FarmDeck
// Handles file-based data import/export and sharing

import { FarmProject, FarmRecord, getProject, importProject, importRecord, getRecordsByProject } from './db';

export interface SyncData {
  type: 'farmdeck-sync';
  version: '1.0';
  timestamp: string;
  project: FarmProject;
  records: FarmRecord[];
}

export interface SyncResult {
  success: boolean;
  message: string;
  newRecords?: number;
  updatedRecords?: number;
  skippedRecords?: number;
}

// Create sync data package
export function createSyncData(project: FarmProject, records: FarmRecord[]): SyncData {
  return {
    type: 'farmdeck-sync',
    version: '1.0',
    timestamp: new Date().toISOString(),
    project,
    records,
  };
}

// Validate incoming sync data
export function validateSyncData(data: unknown): data is SyncData {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    d.type === 'farmdeck-sync' &&
    d.version === '1.0' &&
    typeof d.project === 'object' &&
    d.project !== null &&
    Array.isArray(d.records)
  );
}

// Calculate sync diff - what records need to be transferred
export async function calculateSyncDiff(
  incomingData: SyncData
): Promise<{
  newRecords: FarmRecord[];
  existingRecords: FarmRecord[];
  existingRecordDetails?: FarmRecord[];
  projectExists: boolean;
}> {
  const existingProject = await getProject(incomingData.project.id);
  const projectExists = !!existingProject;

  if (!projectExists) {
    return {
      newRecords: incomingData.records,
      existingRecords: [],
      existingRecordDetails: [],
      projectExists: false,
    };
  }

  const existingRecords = await getRecordsByProject(incomingData.project.id);
  const existingRecordIds = new Set(existingRecords.map(r => r.id));

  const newRecords = incomingData.records.filter(r => !existingRecordIds.has(r.id));
  const alreadyExisting = incomingData.records.filter(r => existingRecordIds.has(r.id));

  return {
    newRecords,
    existingRecords: alreadyExisting,
    existingRecordDetails: existingRecords, // Include full existing records for comparison
    projectExists: true,
  };
}

// Import sync data into database with proper deduplication
export async function importSyncData(data: SyncData): Promise<SyncResult> {
  try {
    const diff = await calculateSyncDiff(data);
    
    // Import or update project
    await importProject(data.project);
    
    let importedCount = 0;
    let skippedCount = 0;
    let updatedCount = 0;
    
    // Import only new records (not already existing)
    for (const record of diff.newRecords) {
      try {
        await importRecord(record);
        importedCount++;
      } catch {
        skippedCount++;
      }
    }
    
    // For existing records, optionally update if incoming is newer
    for (const incomingRecord of diff.existingRecords) {
      const existingRecord = diff.existingRecordDetails?.find(r => r.id === incomingRecord.id);
      if (existingRecord) {
        const incomingTime = new Date(incomingRecord.updatedAt).getTime();
        const existingTime = new Date(existingRecord.updatedAt).getTime();
        
        // Only update if incoming is newer and existing is not locked
        if (incomingTime > existingTime && !existingRecord.isLocked) {
          try {
            await importRecord(incomingRecord);
            updatedCount++;
          } catch {
            skippedCount++;
          }
        } else {
          skippedCount++;
        }
      } else {
        skippedCount++;
      }
    }
    
    return {
      success: true,
      message: diff.projectExists 
        ? `Synced ${importedCount} new, ${updatedCount} updated records`
        : `Imported project with ${importedCount} records`,
      newRecords: importedCount,
      updatedRecords: updatedCount,
      skippedRecords: skippedCount,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Import failed',
    };
  }
}

// Export project data to JSON string
export function exportToJSON(project: FarmProject, records: FarmRecord[]): string {
  const syncData = createSyncData(project, records);
  return JSON.stringify(syncData, null, 2);
}

// Parse JSON string to sync data
export function parseJSONImport(jsonString: string): SyncData | null {
  try {
    const data = JSON.parse(jsonString);
    if (validateSyncData(data)) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

// Download JSON file
export function downloadJSON(project: FarmProject, records: FarmRecord[]): void {
  const json = exportToJSON(project, records);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `farmdeck-${project.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Share via Web Share API (if available)
export async function shareViaWebShare(project: FarmProject, records: FarmRecord[]): Promise<boolean> {
  if (!navigator.share) {
    return false;
  }
  
  const json = exportToJSON(project, records);
  const blob = new Blob([json], { type: 'application/json' });
  const file = new File([blob], `farmdeck-${project.title}.json`, { type: 'application/json' });
  
  try {
    await navigator.share({
      title: `FarmDeck: ${project.title}`,
      text: `Farm project data - ${records.length} records`,
      files: [file],
    });
    return true;
  } catch {
    // User cancelled or share failed
    return false;
  }
}

// Copy to clipboard
export async function copyToClipboard(project: FarmProject, records: FarmRecord[]): Promise<boolean> {
  const json = exportToJSON(project, records);
  try {
    await navigator.clipboard.writeText(json);
    return true;
  } catch {
    return false;
  }
}

// Generate shareable text for nearby share (Android/iOS)
export function generateShareableLink(project: FarmProject, records: FarmRecord[]): {
  title: string;
  text: string;
  data: string;
} {
  const data = exportToJSON(project, records);
  return {
    title: `FarmDeck: ${project.title}`,
    text: `Farm project with ${records.length} records`,
    data,
  };
}

// Create a data URL for the sync data (useful for some sharing methods)
export function createDataUrl(project: FarmProject, records: FarmRecord[]): string {
  const json = exportToJSON(project, records);
  const base64 = btoa(unescape(encodeURIComponent(json)));
  return `data:application/json;base64,${base64}`;
}
