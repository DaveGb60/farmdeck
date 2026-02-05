import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { FarmProject, FarmRecord, getRecordsByProject, importProject, importRecord } from '@/lib/db';
import { 
  WebRTCP2PSync, 
  P2PState, 
  P2PSyncData, 
  P2PSyncResult,
  importP2PSyncData,
} from '@/lib/webrtcP2PSync';
import { QRCodeScanner } from '@/components/QRCodeScanner';
import { QRCodeSVG } from 'qrcode.react';
import {
  Send,
  Download,
  CheckCircle2,
  XCircle,
  Loader2,
  QrCode,
  ScanLine,
  RefreshCw,
  ArrowUpDown,
  Smartphone,
  Wifi,
} from 'lucide-react';

type SyncMode = 'send' | 'receive';

type DialogPhase = 
  | 'select_mode'
  | 'select_projects'
  | 'show_qr'
  | 'scan_qr'
  | 'connecting'
  | 'transferring'
  | 'complete'
  | 'error';

interface BluetoothSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: FarmProject[];
  onSyncComplete: () => void;
}

export function BluetoothSyncDialog({
  open,
  onOpenChange,
  projects,
  onSyncComplete,
}: BluetoothSyncDialogProps) {
  const { toast } = useToast();
  const syncRef = useRef<WebRTCP2PSync | null>(null);
  
  // State
  const [mode, setMode] = useState<SyncMode>('send');
  const [phase, setPhase] = useState<DialogPhase>('select_mode');
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [qrData, setQrData] = useState<string>('');
  const [progressValue, setProgressValue] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState<P2PSyncResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // Initialize sync manager
  const initSync = useCallback(() => {
    if (syncRef.current) {
      syncRef.current.close();
    }

    const sync = new WebRTCP2PSync();

    sync.onStateChange = (state: P2PState) => {
      console.log('[BluetoothSyncDialog] State:', state);
      if (state === 'connected') {
        setPhase('transferring');
        setProgressMessage('Connected! Preparing transfer...');
      } else if (state === 'error') {
        setPhase('error');
      } else if (state === 'complete') {
        setPhase('complete');
      }
    };

    sync.onOfferReady = (data: string) => {
      console.log('[BluetoothSyncDialog] Offer ready, QR length:', data.length);
      setQrData(data);
      setPhase('show_qr');
    };

    sync.onAnswerReady = (data: string) => {
      console.log('[BluetoothSyncDialog] Answer ready, QR length:', data.length);
      setQrData(data);
      setPhase('show_qr');
    };

    sync.onProgress = (progress) => {
      setProgressValue(Math.round((progress.current / progress.total) * 100));
      setProgressMessage(progress.message);
    };

    sync.onDataReceived = async (data: P2PSyncData): Promise<P2PSyncResult> => {
      console.log('[BluetoothSyncDialog] Data received, processing...');
      setProgressMessage('Importing data...');
      
      const importResult = await importP2PSyncData(
        data,
        projects,
        importProject,
        importRecord,
        getRecordsByProject
      );
      
      return importResult;
    };

    sync.onComplete = (syncResult: P2PSyncResult) => {
      console.log('[BluetoothSyncDialog] Sync complete:', syncResult);
      setResult(syncResult);
      setPhase('complete');
      onSyncComplete();
    };

    sync.onError = (error: string) => {
      console.error('[BluetoothSyncDialog] Error:', error);
      setErrorMessage(error);
      setPhase('error');
    };

    syncRef.current = sync;
    return sync;
  }, [projects, onSyncComplete]);

  // Reset dialog
  const handleReset = useCallback(() => {
    syncRef.current?.close();
    syncRef.current = null;
    setPhase('select_mode');
    setSelectedProjects(new Set());
    setQrData('');
    setProgressValue(0);
    setProgressMessage('');
    setErrorMessage('');
    setResult(null);
    setIsScanning(false);
  }, []);

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      handleReset();
    }
  }, [open, handleReset]);

  // === SEND FLOW ===

  // Start send flow - select projects first
  const handleStartSend = () => {
    setMode('send');
    setPhase('select_projects');
  };

  // Toggle project selection
  const toggleProject = (id: string) => {
    const newSelection = new Set(selectedProjects);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedProjects(newSelection);
  };

  // Select all projects
  const selectAll = () => {
    setSelectedProjects(new Set(projects.map(p => p.id)));
  };

  // Create offer after selecting projects
  const handleCreateOffer = async () => {
    if (selectedProjects.size === 0) {
      toast({ title: 'Select at least one project', variant: 'destructive' });
      return;
    }

    try {
      setPhase('connecting');
      setProgressMessage('Creating connection offer...');
      
      const sync = initSync();
      await sync.createOffer();
      // onOfferReady will be called, which sets the QR
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create offer');
      setPhase('error');
    }
  };

  // After receiver scans offer and shows their answer QR, sender scans it
  const handleScanAnswer = () => {
    setPhase('scan_qr');
    setIsScanning(true);
  };

  // Process scanned answer QR
  const handleAnswerScanned = async (data: string) => {
    try {
      setIsScanning(false);
      setPhase('connecting');
      setProgressMessage('Processing answer...');
      
      await syncRef.current?.processAnswer(data);
      
      // Wait for connection, then send data
      const checkAndSend = async () => {
        if (syncRef.current?.isConnected()) {
          // Gather selected project data
          const projectsToSend: FarmProject[] = [];
          const recordsToSend: FarmRecord[] = [];
          
          for (const id of selectedProjects) {
            const project = projects.find(p => p.id === id);
            if (project) {
              projectsToSend.push(project);
              const records = await getRecordsByProject(id);
              recordsToSend.push(...records);
            }
          }
          
          setProgressMessage('Sending data...');
          await syncRef.current.sendSyncData(projectsToSend, recordsToSend);
        } else {
          // Retry after a short delay
          setTimeout(checkAndSend, 500);
        }
      };
      
      setTimeout(checkAndSend, 1000);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to process answer');
      setPhase('error');
    }
  };

  // === RECEIVE FLOW ===

  // Start receive flow - scan offer QR
  const handleStartReceive = () => {
    setMode('receive');
    setPhase('scan_qr');
    setIsScanning(true);
  };

  // Process scanned offer QR and create answer
  const handleOfferScanned = async (data: string) => {
    try {
      setIsScanning(false);
      setPhase('connecting');
      setProgressMessage('Processing offer...');
      
      const sync = initSync();
      await sync.processOffer(data);
      // onAnswerReady will be called, which sets the QR
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to process offer');
      setPhase('error');
    }
  };

  // Handle QR scan result
  const handleQRScan = (data: string) => {
    if (mode === 'send') {
      handleAnswerScanned(data);
    } else {
      handleOfferScanned(data);
    }
  };

  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  };

  // Render content based on phase
  const renderContent = () => {
    switch (phase) {
      case 'select_mode':
        return (
          <div className="space-y-6 py-4">
            <div className="text-center mb-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <Wifi className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">Direct Device Sync</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Transfer projects between devices using QR codes
              </p>
            </div>

            <div className="grid gap-3">
              <Button onClick={handleStartSend} size="lg" className="w-full h-auto py-4">
                <Send className="h-5 w-5 mr-3" />
                <div className="text-left">
                  <p className="font-medium">Send Projects</p>
                  <p className="text-xs opacity-80">Share your projects to another device</p>
                </div>
              </Button>

              <Button onClick={handleStartReceive} size="lg" variant="outline" className="w-full h-auto py-4">
                <Download className="h-5 w-5 mr-3" />
                <div className="text-left">
                  <p className="font-medium">Receive Projects</p>
                  <p className="text-xs opacity-80">Import projects from another device</p>
                </div>
              </Button>
            </div>

            <div className="text-xs text-muted-foreground text-center space-y-1">
              <p className="flex items-center justify-center gap-1">
                <QrCode className="h-3 w-3" />
                Works offline using peer-to-peer connection
              </p>
            </div>
          </div>
        );

      case 'select_projects':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Select Projects to Send</h3>
              <Button variant="ghost" size="sm" onClick={selectAll}>
                Select All
              </Button>
            </div>

            <ScrollArea className="h-[250px] border rounded-lg">
              <div className="p-2 space-y-1">
                {projects.map(project => (
                  <div
                    key={project.id}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer hover:bg-muted transition-colors ${
                      selectedProjects.has(project.id) ? 'bg-muted' : ''
                    }`}
                    onClick={() => toggleProject(project.id)}
                  >
                    <Checkbox checked={selectedProjects.has(project.id)} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{project.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Updated {formatDate(project.updatedAt)}
                      </p>
                    </div>
                    {project.isCompleted && (
                      <Badge variant="secondary" className="text-xs">Done</Badge>
                    )}
                  </div>
                ))}
                {projects.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No projects available
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReset} className="flex-1">
                Back
              </Button>
              <Button 
                onClick={handleCreateOffer} 
                className="flex-1"
                disabled={selectedProjects.size === 0}
              >
                Continue ({selectedProjects.size})
              </Button>
            </div>
          </div>
        );

      case 'show_qr':
        return (
          <div className="space-y-4 text-center">
            {mode === 'send' ? (
              <>
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Smartphone className="h-4 w-4" />
                  <span>Step 1: Show this QR to receiving device</span>
                </div>
                
                <div className="bg-background border p-4 rounded-xl inline-block mx-auto">
                  <QRCodeSVG 
                    value={qrData} 
                    size={200}
                    level="L"
                    includeMargin={false}
                    bgColor="transparent"
                    fgColor="currentColor"
                  />
                </div>
                
                <p className="text-xs text-muted-foreground">
                  The other device should tap "Receive" and scan this code
                </p>

                <Button onClick={handleScanAnswer} className="w-full">
                  <ScanLine className="h-4 w-4 mr-2" />
                  Scan Their Response QR
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Smartphone className="h-4 w-4" />
                  <span>Step 2: Show this QR to sending device</span>
                </div>
                
                <div className="bg-background border p-4 rounded-xl inline-block mx-auto">
                  <QRCodeSVG 
                    value={qrData} 
                    size={200}
                    level="L"
                    includeMargin={false}
                    bgColor="transparent"
                    fgColor="currentColor"
                  />
                </div>
                
                <p className="text-xs text-muted-foreground">
                  The sender should scan this response code
                </p>

                <div className="flex items-center justify-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Waiting for connection...</span>
                </div>
              </>
            )}
          </div>
        );

      case 'scan_qr':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-2">
              <ScanLine className="h-4 w-4" />
              <span>
                {mode === 'send' 
                  ? 'Step 2: Scan their response QR' 
                  : 'Step 1: Scan the sender\'s QR code'}
              </span>
            </div>

            <QRCodeScanner
              onScan={handleQRScan}
              onError={(err) => {
                console.error('[BluetoothSyncDialog] Scanner error:', err);
              }}
              scanning={isScanning}
              autoStart={true}
            />

            <Button variant="outline" onClick={handleReset} className="w-full">
              Cancel
            </Button>
          </div>
        );

      case 'connecting':
        return (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
            <p className="text-lg font-medium mb-2">Connecting...</p>
            <p className="text-sm text-muted-foreground">{progressMessage}</p>
          </div>
        );

      case 'transferring':
        return (
          <div className="space-y-6 py-4">
            <div className="text-center">
              <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto mb-3" />
              <h3 className="text-lg font-semibold">
                {mode === 'send' ? 'Sending...' : 'Receiving...'}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">{progressMessage}</p>
            </div>
            
            <Progress value={progressValue} className="h-2" />
            <p className="text-center text-sm text-muted-foreground">{progressValue}%</p>
          </div>
        );

      case 'complete':
        return (
          <div className="flex flex-col items-center justify-center py-8">
            <CheckCircle2 className="h-16 w-16 text-success mb-4" />
            <h3 className="text-xl font-semibold mb-2">Sync Complete!</h3>
            
            {result && (
              <div className="text-sm text-muted-foreground text-center space-y-1 mb-4">
                {mode === 'send' ? (
                  <p>Successfully sent {selectedProjects.size} project(s)</p>
                ) : (
                  <>
                    <p>Imported: {result.projectsImported} projects, {result.recordsImported} records</p>
                    {result.projectsSkipped > 0 && (
                      <p className="text-xs">Skipped: {result.projectsSkipped} existing projects</p>
                    )}
                  </>
                )}
              </div>
            )}
            
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        );

      case 'error':
        return (
          <div className="flex flex-col items-center justify-center py-8">
            <XCircle className="h-16 w-16 text-destructive mb-4" />
            <h3 className="text-lg font-semibold mb-2">Sync Failed</h3>
            <p className="text-sm text-muted-foreground text-center mb-4 max-w-xs">
              {errorMessage || 'An error occurred during sync'}
            </p>
            <Button onClick={handleReset}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpDown className="h-5 w-5" />
            Sync Projects
          </DialogTitle>
          <DialogDescription>
            Transfer projects directly between devices
          </DialogDescription>
        </DialogHeader>
        
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
}
