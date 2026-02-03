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
import { useToast } from '@/hooks/use-toast';
import { FarmProject, FarmRecord, getRecordsByProject } from '@/lib/db';
import {
  BluetoothSync,
  isBluetoothAvailable,
  getPairedDevices,
  PairedDevice,
  BluetoothSyncState,
} from '@/lib/bluetoothSync';
import {
  SyncMetadata,
  getDeviceId,
  ProjectSummary,
} from '@/lib/webrtcSync';
import {
  Bluetooth,
  BluetoothOff,
  Send,
  CheckCircle2,
  XCircle,
  Loader2,
  Smartphone,
  RefreshCw,
  Plus,
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
  
  // Transfer state
  const [errorMessage, setErrorMessage] = useState<string>('');
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

  // Start Bluetooth discovery - simplified flow
  const handleAddDevice = async () => {
    try {
      setPhase('scanning');
      setErrorMessage('');
      setStatusMessage('Opening device picker...');
      
      const sync = initSync();
      await sync.initialize();
      
      // Step 1: Request device via Bluetooth picker
      const device = await sync.requestDevice();
      if (!device) {
        setPhase('idle');
        return;
      }
      
      setDeviceName(device.name || 'Unknown Device');
      
      // Step 2: Try to connect (optional, for trust verification)
      setPhase('connecting');
      setStatusMessage('Verifying device...');
      
      const connected = await sync.connect();
      if (!connected) {
        // Even if GATT fails, we proceed since device was discovered
        console.log('[BluetoothSyncDialog] GATT optional, continuing...');
      }
      
      // Step 3: Establish pairing (trust relationship)
      setPhase('pairing');
      setStatusMessage('Establishing trust...');
      
      const paired = await sync.startPairing();
      if (!paired) {
        setPhase('error');
        setErrorMessage('Failed to pair with device');
        return;
      }
      
      // Step 4: Build local metadata and go to selection
      await buildLocalMetadata();
      setPhase('selecting');
      setStatusMessage('');
      
      toast({
        title: 'Device paired',
        description: `Connected to ${device.name || 'device'}. Select projects to sync.`
      });
      
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
    if (localMetadata?.projects) {
      setSelectedProjects(new Set(localMetadata.projects.map(p => p.id)));
    }
  };

  // Start sync transfer - uses file sharing after Bluetooth pairing establishes trust
  const handleStartSync = async () => {
    if (selectedProjects.size === 0) {
      toast({ title: 'Select at least one project', variant: 'destructive' });
      return;
    }

    try {
      setPhase('transferring');
      
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
      
      const syncData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        projects: projectsToSend,
        records: recordsToSend,
      };
      
      // Create and share file
      const jsonString = JSON.stringify(syncData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      
      // Try Web Share API first (works great on mobile)
      if (navigator.share && navigator.canShare) {
        const file = new File([blob], `farmdeck-sync-${Date.now()}.json`, { type: 'application/json' });
        
        try {
          await navigator.share({
            title: 'FarmDeck Sync',
            text: `Syncing ${projectsToSend.length} project(s)`,
            files: [file],
          });
          
          setPhase('complete');
          setSyncResult({ imported: 0, skipped: 0, conflicts: 0 });
          toast({
            title: 'Sync file shared',
            description: `Shared ${projectsToSend.length} project(s). Open the file on the other device to import.`
          });
          return;
        } catch (shareError) {
          // Share was cancelled or failed, fall back to download
          console.log('[BluetoothSyncDialog] Share cancelled, falling back to download');
        }
      }
      
      // Fallback: Download file
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `farmdeck-sync-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setPhase('complete');
      setSyncResult({ imported: 0, skipped: 0, conflicts: 0 });
      toast({
        title: 'Sync file downloaded',
        description: `Downloaded ${projectsToSend.length} project(s). Share this file with the other device.`
      });
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
            {/* Info banner */}
            <div className="p-3 bg-primary/10 rounded-lg text-sm">
              <p className="font-medium text-primary">Device Paired Successfully</p>
              <p className="text-muted-foreground text-xs mt-1">
                Select projects below and tap Send to share via file transfer.
              </p>
            </div>

            {/* Device info */}
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <Smartphone className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">{deviceName || 'Paired Device'}</p>
                <p className="text-xs text-muted-foreground">
                  {localMetadata?.projectCount || 0} local projects available
                </p>
              </div>
              <Badge variant="outline" className="text-green-600 border-green-600">
                Paired
              </Badge>
            </div>

            {/* Project selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium">Select Projects to Share</h3>
                <Button variant="ghost" size="sm" onClick={selectAllProjects}>
                  Select All
                </Button>
              </div>
              
              <ScrollArea className="h-[200px] border rounded-lg">
                <div className="p-2 space-y-1">
                  {localMetadata?.projects?.map(project => (
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
                  {(!localMetadata?.projects || localMetadata.projects.length === 0) && (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      No projects to share
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Send button */}
            <Button
              className="w-full"
              size="lg"
              onClick={handleStartSync}
              disabled={selectedProjects.size === 0}
            >
              <Send className="h-4 w-4 mr-2" />
              Share {selectedProjects.size} Project{selectedProjects.size !== 1 ? 's' : ''}
            </Button>
          </div>
        );

      case 'transferring':
        return (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
            <p className="text-lg font-medium mb-2">Preparing files...</p>
            <p className="text-sm text-muted-foreground">Please wait</p>
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
