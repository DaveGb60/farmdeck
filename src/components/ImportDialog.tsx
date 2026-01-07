import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  parseJSONImport,
  importSyncData,
  calculateSyncDiff,
  SyncData,
} from '@/lib/fileSync';
import { useToast } from '@/hooks/use-toast';
import {
  Upload,
  FileJson,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ClipboardPaste,
  FolderOpen,
} from 'lucide-react';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
}

export function ImportDialog({
  open,
  onOpenChange,
  onImportComplete,
}: ImportDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // File import state
  const [manualInput, setManualInput] = useState('');
  const [parsedData, setParsedData] = useState<SyncData | null>(null);
  const [syncPreview, setSyncPreview] = useState<{
    newRecords: number;
    existingRecords: number;
    projectExists: boolean;
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<'idle' | 'preview' | 'importing' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const resetState = () => {
    setParsedData(null);
    setSyncPreview(null);
    setImportStatus('idle');
    setError(null);
    setManualInput('');
  };

  const handleParsedData = async (data: SyncData) => {
    setParsedData(data);
    setImportStatus('preview');
    
    const diff = await calculateSyncDiff(data);
    setSyncPreview({
      newRecords: diff.newRecords.length,
      existingRecords: diff.existingRecords.length,
      projectExists: diff.projectExists,
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = parseJSONImport(text);
      
      if (!data) {
        setError('Invalid FarmDeck file format');
        setImportStatus('error');
        return;
      }
      
      await handleParsedData(data);
    } catch {
      setError('Failed to read file');
      setImportStatus('error');
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleManualParse = async () => {
    const data = parseJSONImport(manualInput.trim());
    
    if (!data) {
      setError('Invalid JSON format');
      setImportStatus('error');
      return;
    }
    
    await handleParsedData(data);
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setManualInput(text);
      
      const data = parseJSONImport(text);
      if (data) {
        await handleParsedData(data);
      }
    } catch {
      toast({ title: 'Failed to read clipboard', variant: 'destructive' });
    }
  };

  const handleImport = async () => {
    if (!parsedData) return;
    
    setIsImporting(true);
    setImportStatus('importing');
    
    try {
      const result = await importSyncData(parsedData);
      
      if (result.success) {
        setImportStatus('success');
        toast({ title: result.message });
        
        setTimeout(() => {
          onOpenChange(false);
          onImportComplete();
          resetState();
        }, 1500);
      } else {
        setError(result.message);
        setImportStatus('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setImportStatus('error');
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = (value: boolean) => {
    if (!value) {
      resetState();
    }
    onOpenChange(value);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Project
          </DialogTitle>
          <DialogDescription>
            Import a FarmDeck project from a JSON file
          </DialogDescription>
        </DialogHeader>

        {/* Preview Screen */}
        {importStatus === 'preview' && parsedData && syncPreview && (
          <div className="space-y-4">
            <div className="bg-primary/10 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileJson className="h-5 w-5 text-primary" />
                <h4 className="font-medium">{parsedData.project.title}</h4>
              </div>
              
              <div className="text-sm space-y-1">
                <p className="font-mono text-xs text-muted-foreground">
                  ID: {parsedData.project.id.slice(0, 12)}...
                </p>
                <p>Total records in file: {parsedData.records.length}</p>
              </div>
              
              <div className="border-t pt-3 space-y-2">
                <h5 className="text-sm font-medium">Import Preview:</h5>
                {syncPreview.projectExists ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Project already exists on this device
                    </p>
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span>{syncPreview.newRecords} new records to import</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <ArrowRight className="h-4 w-4" />
                      <span>{syncPreview.existingRecords} records already synced</span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    New project - will import with {syncPreview.newRecords} records
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={resetState} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={isImporting} className="flex-1">
                {isImporting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Import
              </Button>
            </div>
          </div>
        )}

        {/* Importing Screen */}
        {importStatus === 'importing' && (
          <div className="text-center py-8">
            <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary" />
            <p className="mt-4 text-muted-foreground">Importing project data...</p>
          </div>
        )}

        {/* Success Screen */}
        {importStatus === 'success' && (
          <div className="text-center py-8">
            <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
            <p className="mt-4 font-medium">Import Successful!</p>
          </div>
        )}

        {/* Error Screen */}
        {importStatus === 'error' && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <AlertCircle className="h-12 w-12 mx-auto text-destructive" />
              <p className="mt-4 text-destructive">{error}</p>
            </div>
            <Button onClick={resetState} variant="outline" className="w-full">
              Try Again
            </Button>
          </div>
        )}

        {/* Initial Screen */}
        {importStatus === 'idle' && (
          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileSelect}
              className="hidden"
            />

            <div className="grid gap-3">
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                className="w-full justify-start h-auto py-4"
              >
                <FolderOpen className="h-5 w-5 mr-3" />
                <div className="text-left">
                  <p className="font-medium">Select JSON File</p>
                  <p className="text-xs text-muted-foreground">Choose a FarmDeck export file</p>
                </div>
              </Button>

              <Button
                onClick={handlePasteFromClipboard}
                variant="outline"
                className="w-full justify-start h-auto py-4"
              >
                <ClipboardPaste className="h-5 w-5 mr-3" />
                <div className="text-left">
                  <p className="font-medium">Paste from Clipboard</p>
                  <p className="text-xs text-muted-foreground">Import copied JSON data</p>
                </div>
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Or paste JSON manually:</p>
              <Textarea
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder='{"type":"farmdeck-sync",...}'
                className="font-mono text-xs h-24"
              />
              <Button
                onClick={handleManualParse}
                disabled={!manualInput.trim()}
                variant="secondary"
                className="w-full"
              >
                Parse & Preview
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
