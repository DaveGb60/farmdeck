import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FarmProject, FarmRecord, getProject, importProject, importRecord } from '@/lib/db';
import { Camera, FileUp, AlertCircle, Check, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface QRScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
}

type ScanStatus = 'idle' | 'scanning' | 'found' | 'error';

interface ParsedData {
  type: string;
  version: number;
  project: FarmProject;
  records?: FarmRecord[];
}

export function QRScannerDialog({ open, onOpenChange, onImportComplete }: QRScannerDialogProps) {
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [scannedData, setScannedData] = useState<ParsedData | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setScanStatus('idle');
      setScannedData(null);
      setManualInput('');
      setError(null);
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    }
  }, [open]);

  const startScanning = async () => {
    try {
      setError(null);
      setScanStatus('scanning');

      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode('qr-reader');
      }

      await scannerRef.current.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          handleQRData(decodedText);
          scannerRef.current?.stop().catch(() => {});
        },
        () => {} // Ignore errors during scanning
      );
    } catch (err) {
      setError('Camera access denied or not available');
      setScanStatus('error');
    }
  };

  const stopScanning = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
    }
    setScanStatus('idle');
  };

  const handleQRData = (data: string) => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.type === 'farmdeck_project' || parsed.type === 'farmdeck_full_export') {
        setScannedData(parsed);
        setScanStatus('found');
        setError(null);
      } else {
        throw new Error('Invalid FarmDeck data');
      }
    } catch (e) {
      setError('Invalid QR code. Not a FarmDeck project.');
      setScanStatus('error');
    }
  };

  const handleManualImport = () => {
    try {
      const parsed = JSON.parse(manualInput);
      if (parsed.type === 'farmdeck_project' || parsed.type === 'farmdeck_full_export') {
        setScannedData(parsed);
        setScanStatus('found');
        setError(null);
      } else {
        throw new Error('Invalid FarmDeck data');
      }
    } catch (e) {
      setError('Invalid data format. Please paste valid FarmDeck export data.');
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed.type === 'farmdeck_project' || parsed.type === 'farmdeck_full_export') {
        setScannedData(parsed);
        setScanStatus('found');
        setError(null);
      } else {
        throw new Error('Invalid FarmDeck data');
      }
    } catch (e) {
      setError('Invalid file. Please select a valid FarmDeck export file.');
    }
  };

  const handleImport = async () => {
    if (!scannedData) return;

    setIsImporting(true);
    try {
      const projectData = scannedData.project;
      
      // Check if project already exists
      const existing = await getProject(projectData.id);
      
      if (existing) {
        // Merge with existing project - update project metadata and sync records
        await importProject({
          ...existing,
          title: projectData.title,
          customColumns: projectData.customColumns || existing.customColumns,
        });
        
        // Import/sync records if available (preserving original IDs)
        if (scannedData.records) {
          for (const record of scannedData.records) {
            await importRecord(record);
          }
        }
        toast({ title: 'Project synced successfully', description: `${scannedData.records?.length || 0} records synced` });
      } else {
        // Create new project with the SAME ID to maintain consistency across devices
        await importProject({
          id: projectData.id,
          title: projectData.title,
          startDate: projectData.startDate,
          customColumns: projectData.customColumns || [],
          createdAt: projectData.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        
        // Import records if available (preserving original IDs)
        if (scannedData.records) {
          for (const record of scannedData.records) {
            await importRecord(record);
          }
        }
        toast({ title: 'Project imported successfully', description: `${scannedData.records?.length || 0} records imported` });
      }
      
      onImportComplete();
      onOpenChange(false);
    } catch (e) {
      setError('Failed to import project');
      toast({ title: 'Import failed', variant: 'destructive' });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            Import Project
          </DialogTitle>
          <DialogDescription>
            Scan a QR code or import project data
          </DialogDescription>
        </DialogHeader>

        {scanStatus === 'found' && scannedData ? (
          <div className="space-y-4">
            <div className="bg-success/10 border border-success/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-success mb-2">
                <Check className="h-5 w-5" />
                <span className="font-medium">Project Found!</span>
              </div>
              <div className="space-y-1 text-sm">
                <p><span className="text-muted-foreground">Title:</span> {scannedData.project.title}</p>
                <p><span className="text-muted-foreground">Start Date:</span> {scannedData.project.startDate}</p>
                {scannedData.records && (
                  <p><span className="text-muted-foreground">Records:</span> {scannedData.records.length}</p>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setScanStatus('idle')} className="flex-1">
                Cancel
              </Button>
              <Button variant="hero" onClick={handleImport} disabled={isImporting} className="flex-1">
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  'Import Project'
                )}
              </Button>
            </div>
          </div>
        ) : (
          <Tabs defaultValue="scan" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="scan">Scan QR</TabsTrigger>
              <TabsTrigger value="paste">Paste/File</TabsTrigger>
            </TabsList>

            <TabsContent value="scan" className="space-y-4">
              <div 
                id="qr-reader" 
                className={cn(
                  "w-full aspect-square rounded-lg overflow-hidden bg-muted",
                  scanStatus !== 'scanning' && "hidden"
                )}
              />

              {scanStatus === 'idle' && (
                <div className="flex flex-col items-center py-8">
                  <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <Camera className="h-10 w-10 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground text-center mb-4">
                    Point your camera at a FarmDeck QR code to import a project
                  </p>
                  <Button variant="hero" onClick={startScanning}>
                    Start Scanning
                  </Button>
                </div>
              )}

              {scanStatus === 'scanning' && (
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-2">Scanning for QR code...</p>
                  <Button variant="outline" onClick={stopScanning}>
                    Stop Scanning
                  </Button>
                </div>
              )}

              {error && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="paste" className="space-y-4">
              <div className="space-y-2">
                <Label>Import from File</Label>
                <Input
                  type="file"
                  accept=".json"
                  onChange={handleFileImport}
                  className="cursor-pointer"
                />
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or paste data</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Paste Export Data</Label>
                <Textarea
                  placeholder='{"type": "farmdeck_full_export", ...}'
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  className="min-h-[120px] font-mono text-xs"
                />
              </div>

              <Button 
                variant="default" 
                onClick={handleManualImport} 
                disabled={!manualInput.trim()}
                className="w-full"
              >
                <FileUp className="h-4 w-4 mr-2" />
                Import Data
              </Button>

              {error && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
