import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { FarmProject, FarmRecord, getRecordsByProject } from '@/lib/db';
import {
  BluetoothSync,
  isBluetoothAvailable,
  getOrCreateDeviceIdentity,
  getPairedDevices,
  PairedDevice,
  BluetoothSyncState,
} from '@/lib/bluetoothSync';
import {
  SyncMetadata,
  SyncSelection,
  TransferProgress,
  SyncDataPayload,
  detectConflicts,
  applySyncData,
  getDeviceId,
  ProjectSummary,
} from '@/lib/webrtcSync';
import {
  Bluetooth,
  BluetoothOff,
  Send,
  Download,
  CheckCircle2,
  XCircle,
  Loader2,
  Smartphone,
  RefreshCw,
  AlertTriangle,
  ArrowRight,
  Clock,
  Database,
  Plus,
  Trash2,
  Link,
} from 'lucide-react';

type SyncPhase = 
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'pairing'
  | 'paired'
  | 'selecting'
  | 'confirming'
  | 'transferring'
  | 'reconnecting'
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
  const syncRef = useRef<BluetoothSync | null>(null);
  
  // Connection state
  const [phase, setPhase] = useState<SyncPhase>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [bluetoothSupported, setBluetoothSupported] = useState(true);
  
  // Device info
  const [pairedDevices, setPairedDevices] = useState<PairedDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string>('');
  
  // Metadata & selection
  const [localMetadata, setLocalMetadata] = useState<SyncMetadata | null>(null);
  const [remoteMetadata, setRemoteMetadata] = useState<SyncMetadata | null>(null);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [direction, setDirection] = useState<'send' | 'receive'>('send');
  
  // Transfer state
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [syncResult, setSyncResult] = useState<{ imported: number; skipped: number; conflicts: number } | null>(null);

  // Check Bluetooth availability on mount
  useEffect(() => {
    setBluetoothSupported(isBluetoothAvailable());
    setPairedDevices(getPairedDevices());
  }, []);

  // Build local metadata
  const buildLocalMetadata = useCallback(async () => {
    const projectSummaries: ProjectSummary[] = [];
    let totalRecords = 0;

    for (const project of projects) {
      const records = await getRecordsByProject(project.id);
      totalRecords += records.length;
      projectSummaries.push({
        id: project.id,
        title: project.title,
        recordCount: records.length,
        updatedAt: project.updatedAt,
        startDate: project.startDate,
        isCompleted: project.isCompleted
      });
    }

    const metadata: SyncMetadata = {
      deviceId: getDeviceId(),
      deviceName: navigator.userAgent.includes('Mobile') ? 'Mobile Device' : 'Desktop',
      projectCount: projects.length,
      recordCount: totalRecords,
      lastUpdated: new Date().toISOString(),
      projects: projectSummaries
    };

    setLocalMetadata(metadata);
    return metadata;
  }, [projects]);

  // Initialize sync manager
  const initSync = useCallback(() => {
    if (syncRef.current) {
      syncRef.current.close();
    }
    
    const sync = new BluetoothSync();
    
    sync.onStateChange = (state: BluetoothSyncState) => {
      console.log('[BluetoothSyncDialog] State:', state);
      switch (state) {
        case 'scanning':
          setPhase('scanning');
          setStatusMessage('Opening device picker...');
          break;
        case 'connecting':
          setPhase('connecting');
          break;
        case 'pairing':
          setPhase('pairing');
          break;
        case 'paired':
          setPhase('paired');
          break;
        case 'webrtc_connecting':
          setStatusMessage('Establishing secure connection...');
          break;
        case 'signaling':
          setStatusMessage('Exchanging connection info...');
          break;
        case 'reconnecting':
          setPhase('reconnecting');
          break;
        case 'connected':
          setPhase('selecting');
          break;
        case 'error':
          setPhase('error');
          break;
      }
    };

    sync.onProgress = (message: string) => {
      setStatusMessage(message);
    };

    sync.onDevicePaired = (device: PairedDevice) => {
      setPairedDevices(prev => {
        const exists = prev.find(d => d.deviceId === device.deviceId);
        if (exists) {
          return prev.map(d => d.deviceId === device.deviceId ? device : d);
        }
        return [...prev, device];
      });
      setSelectedDevice(device.deviceId);
    };

    sync.onWebRTCConnected = () => {
      setPhase('selecting');
      // Exchange metadata
      buildLocalMetadata().then(metadata => {
        // Send metadata through data channel
        sync.sendData(JSON.stringify({
          type: 'metadata',
          payload: metadata,
          timestamp: Date.now(),
        }));
      });
    };

    sync.onDataChannelOpen = () => {
      console.log('[BluetoothSyncDialog] Data channel ready');
    };

    sync.onDataChannelMessage = async (data: string) => {
      try {
        const message = JSON.parse(data);
        console.log('[BluetoothSyncDialog] Message:', message.type);
        
        if (message.type === 'metadata') {
          setRemoteMetadata(message.payload);
          setPhase('selecting');
        } else if (message.type === 'sync-data') {
          // Received sync data
          const syncData: SyncDataPayload = message.payload;
          const result = await applySyncData(syncData, 'keep_newer', projects);
          setSyncResult(result);
          setPhase('complete');
          onSyncComplete();
          toast({
            title: 'Sync complete',
            description: `Imported ${result.imported} project(s), ${result.skipped} skipped`
          });
        }
      } catch (error) {
        console.error('[BluetoothSyncDialog] Message parse error:', error);
      }
    };

    sync.onError = (error: string) => {
      console.error('[BluetoothSyncDialog] Error:', error);
      setErrorMessage(error);
      setPhase('error');
    };

    syncRef.current = sync;
    return sync;
  }, [buildLocalMetadata, projects, onSyncComplete, toast]);

  // Start Bluetooth discovery
  const handleAddDevice = async () => {
    try {
      setPhase('scanning');
      setErrorMessage('');
      setStatusMessage('Opening device picker...');
      
      const sync = initSync();
      await sync.initialize();
      
      const device = await sync.requestDevice();
      if (!device) {
        setPhase('idle');
        return;
      }
      
      setDeviceName(device.name || 'Unknown Device');
      
      // Connect and pair
      const connected = await sync.connect();
      if (!connected) {
        return;
      }
      
      // Start pairing
      const paired = await sync.startPairing();
      if (!paired) {
        return;
      }
      
      // Initialize WebRTC
      await sync.initializeWebRTC(true);
      
    } catch (error) {
      console.error('[BluetoothSyncDialog] Add device error:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to add device');
      setPhase('error');
    }
  };

  // Connect to a previously paired device
  const handleConnectDevice = async (deviceId: string) => {
    const device = pairedDevices.find(d => d.deviceId === deviceId);
    if (!device) return;
    
    setSelectedDevice(deviceId);
    setDeviceName(device.deviceName);
    
    // For now, we need to re-discover via Bluetooth
    // In a full implementation, we'd store BLE device info
    toast({
      title: 'Reconnecting',
      description: 'Please select the device from the Bluetooth picker',
    });
    
    await handleAddDevice();
  };

  // Toggle project selection
  const toggleProjectSelection = (projectId: string) => {
    const newSelection = new Set(selectedProjects);
    if (newSelection.has(projectId)) {
      newSelection.delete(projectId);
    } else {
      newSelection.add(projectId);
    }
    setSelectedProjects(newSelection);
  };

  // Select all projects
  const selectAllProjects = () => {
    const source = direction === 'send' ? localMetadata?.projects : remoteMetadata?.projects;
    if (source) {
      setSelectedProjects(new Set(source.map(p => p.id)));
    }
  };

  // Start sync transfer
  const handleStartSync = async () => {
    if (!syncRef.current || selectedProjects.size === 0) {
      toast({ title: 'Select at least one project', variant: 'destructive' });
      return;
    }

    try {
      setPhase('transferring');
      
      if (direction === 'send') {
        // Gather data for selected projects
        const projectsToSend: FarmProject[] = [];
        const recordsToSend: FarmRecord[] = [];
        
        for (const projectId of selectedProjects) {
          const project = projects.find(p => p.id === projectId);
          if (project) {
            projectsToSend.push(project);
            const records = await getRecordsByProject(projectId);
            recordsToSend.push(...records);
          }
        }
        
        const syncData: SyncDataPayload = {
          projects: projectsToSend,
          records: recordsToSend,
        };
        
        // Send through data channel
        syncRef.current.sendData(JSON.stringify({
          type: 'sync-data',
          payload: syncData,
          timestamp: Date.now(),
        }));
        
        setPhase('complete');
        toast({
          title: 'Sync complete',
          description: `Sent ${projectsToSend.length} project(s) to ${deviceName}`
        });
      } else {
        // Request data from remote
        syncRef.current.sendData(JSON.stringify({
          type: 'sync-request',
          payload: {
            projectIds: Array.from(selectedProjects),
            direction: 'receive',
          },
          timestamp: Date.now(),
        }));
      }
    } catch (error) {
      console.error('[BluetoothSyncDialog] Sync error:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Sync failed');
      setPhase('error');
    }
  };

  // Reset dialog
  const handleReset = () => {
    syncRef.current?.close();
    syncRef.current = null;
    setPhase('idle');
    setStatusMessage('');
    setErrorMessage('');
    setRemoteMetadata(null);
    setSelectedProjects(new Set());
    setProgress(null);
    setSyncResult(null);
    setDeviceName('');
  };

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      handleReset();
    }
  }, [open]);

  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Render phase content
  const renderContent = () => {
    if (!bluetoothSupported) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <BluetoothOff className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Bluetooth Not Available</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Web Bluetooth is not supported in this browser.
            <br />
            Try using Chrome, Edge, or Opera on a desktop or Android device.
          </p>
        </div>
      );
    }

    switch (phase) {
      case 'idle':
        return (
          <div className="space-y-6">
            {/* Paired Devices */}
            {pairedDevices.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-3">Previously Paired Devices</h3>
                <div className="space-y-2">
                  {pairedDevices.map(device => (
                    <div
                      key={device.deviceId}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Smartphone className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{device.deviceName}</p>
                          <p className="text-xs text-muted-foreground">
                            Paired {formatDate(device.pairedAt)}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleConnectDevice(device.deviceId)}
                      >
                        <Link className="h-4 w-4 mr-1" />
                        Connect
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Add New Device */}
            <div className="flex flex-col items-center py-6">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Bluetooth className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Add Device</h3>
              <p className="text-sm text-muted-foreground text-center mb-4">
                Pair with a nearby device to sync your farm projects wirelessly.
              </p>
              <Button onClick={handleAddDevice} size="lg">
                <Plus className="h-4 w-4 mr-2" />
                Add Device
              </Button>
            </div>
            
            <div className="text-xs text-muted-foreground text-center">
              <p>Both devices need to have FarmDeck open with Bluetooth enabled.</p>
            </div>
          </div>
        );

      case 'scanning':
      case 'connecting':
      case 'pairing':
        return (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="relative mb-4">
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
              {phase === 'connecting' && (
                <div className="absolute -bottom-1 -right-1 h-4 w-4 bg-primary rounded-full animate-pulse" />
              )}
            </div>
            <p className="text-lg font-medium mb-2">
              {phase === 'scanning' && 'Looking for devices...'}
              {phase === 'connecting' && 'Connecting...'}
              {phase === 'pairing' && 'Establishing trust...'}
            </p>
            <p className="text-sm text-muted-foreground text-center max-w-xs">{statusMessage}</p>
            {phase === 'connecting' && (
              <p className="text-xs text-muted-foreground mt-3">This may take a few seconds</p>
            )}
          </div>
        );

      case 'paired':
        return (
          <div className="flex flex-col items-center justify-center py-8">
            <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
            <p className="text-lg font-medium mb-2">Device Paired!</p>
            <p className="text-sm text-muted-foreground mb-4">{deviceName}</p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Setting up secure channel...</span>
            </div>
          </div>
        );

      case 'reconnecting':
        return (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="relative mb-4">
              <RefreshCw className="h-12 w-12 text-amber-500 animate-spin" />
            </div>
            <p className="text-lg font-medium mb-2">Reconnecting...</p>
            <p className="text-sm text-muted-foreground text-center max-w-xs">{statusMessage}</p>
            <Button variant="ghost" size="sm" className="mt-4" onClick={handleReset}>
              Cancel
            </Button>
          </div>
        );

      case 'selecting':
        return (
          <div className="space-y-4">
            {/* Direction selector */}
            <div className="flex gap-2 p-1 bg-muted rounded-lg">
              <Button
                variant={direction === 'send' ? 'default' : 'ghost'}
                className="flex-1"
                onClick={() => setDirection('send')}
              >
                <Send className="h-4 w-4 mr-2" />
                Send
              </Button>
              <Button
                variant={direction === 'receive' ? 'default' : 'ghost'}
                className="flex-1"
                onClick={() => setDirection('receive')}
              >
                <Download className="h-4 w-4 mr-2" />
                Receive
              </Button>
            </div>

            {/* Device info */}
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <Smartphone className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">{deviceName}</p>
                {remoteMetadata && (
                  <p className="text-xs text-muted-foreground">
                    {remoteMetadata.projectCount} projects • {remoteMetadata.recordCount} records
                  </p>
                )}
              </div>
              <Badge variant="outline" className="text-success border-success">
                Connected
              </Badge>
            </div>

            {/* Project selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium">
                  {direction === 'send' ? 'Your Projects' : 'Remote Projects'}
                </h3>
                <Button variant="ghost" size="sm" onClick={selectAllProjects}>
                  Select All
                </Button>
              </div>
              
              <ScrollArea className="h-[200px] border rounded-lg">
                <div className="p-2 space-y-1">
                  {(direction === 'send' ? localMetadata?.projects : remoteMetadata?.projects)?.map(project => (
                    <div
                      key={project.id}
                      className={`flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-muted ${
                        selectedProjects.has(project.id) ? 'bg-muted' : ''
                      }`}
                      onClick={() => toggleProjectSelection(project.id)}
                    >
                      <Checkbox checked={selectedProjects.has(project.id)} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{project.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {project.recordCount} records • {formatDate(project.updatedAt)}
                        </p>
                      </div>
                      {project.isCompleted && (
                        <Badge variant="secondary" className="text-xs">Done</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Sync button */}
            <Button
              className="w-full"
              size="lg"
              onClick={handleStartSync}
              disabled={selectedProjects.size === 0}
            >
              {direction === 'send' ? (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send {selectedProjects.size} Project{selectedProjects.size !== 1 ? 's' : ''}
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Receive {selectedProjects.size} Project{selectedProjects.size !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </div>
        );

      case 'transferring':
        return (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
            <p className="text-lg font-medium mb-2">Syncing...</p>
            {progress && (
              <>
                <Progress value={(progress.sentChunks / progress.totalChunks) * 100} className="w-full mb-2" />
                <p className="text-sm text-muted-foreground">
                  {progress.sentChunks} / {progress.totalChunks} chunks
                </p>
              </>
            )}
          </div>
        );

      case 'complete':
        return (
          <div className="flex flex-col items-center justify-center py-8">
            <CheckCircle2 className="h-16 w-16 text-success mb-4" />
            <h3 className="text-lg font-semibold mb-2">Sync Complete!</h3>
            {syncResult && (
              <div className="text-sm text-muted-foreground text-center mb-4">
                <p>Imported: {syncResult.imported} project(s)</p>
                <p>Skipped: {syncResult.skipped} (already exists)</p>
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
            <p className="text-sm text-muted-foreground text-center mb-4">{errorMessage}</p>
            <Button onClick={handleReset}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bluetooth className="h-5 w-5" />
            Bluetooth Sync
          </DialogTitle>
          <DialogDescription>
            Sync your farm projects with another device via Bluetooth
          </DialogDescription>
        </DialogHeader>
        
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
}
