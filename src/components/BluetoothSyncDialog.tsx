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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { FarmProject, FarmRecord, getRecordsByProject, importProject, importRecord } from '@/lib/db';
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
  Download,
  CheckCircle2,
  XCircle,
  Loader2,
  Smartphone,
  RefreshCw,
  Plus,
  Link,
  FileUp,
  ArrowUpDown,
} from 'lucide-react';
import { generateRecordFingerprint } from '@/lib/fileSync';

type SyncMode = 'send' | 'receive';

type SyncPhase = 
  | 'idle'
  | 'mode_select'
  | 'scanning'
  | 'connecting'
  | 'pairing'
  | 'paired'
  | 'selecting'
  | 'confirming'
  | 'transferring'
  | 'reconnecting'
  | 'importing'
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Mode state
  const [syncMode, setSyncMode] = useState<SyncMode>('send');
  
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
      setStatusMessage('Preparing sync data...');
      
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
        deviceId: getDeviceId(),
        projects: projectsToSend,
        records: recordsToSend,
      };
      
      // Create file
      const jsonString = JSON.stringify(syncData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const fileName = `farmdeck-sync-${Date.now()}.json`;
      const file = new File([blob], fileName, { type: 'application/json' });
      
      // Check if Web Share API with files is supported
      const canShareFiles = navigator.canShare && navigator.canShare({ files: [file] });
      
      if (canShareFiles) {
        setStatusMessage('Opening share dialog...');
        try {
          await navigator.share({
            title: 'FarmDeck Sync',
            text: `Syncing ${projectsToSend.length} project(s) with ${recordsToSend.length} record(s)`,
            files: [file],
          });
          
          setPhase('complete');
          setSyncResult({ imported: projectsToSend.length, skipped: 0, conflicts: 0 });
          toast({
            title: 'Sync data shared!',
            description: `Sent ${projectsToSend.length} project(s). The other device should tap "Receive" to import.`
          });
          return;
        } catch (shareError: any) {
          if (shareError.name === 'AbortError') {
            // User cancelled - go back to selection
            setPhase('selecting');
            setStatusMessage('');
            return;
          }
          console.log('[BluetoothSyncDialog] Share failed, trying download:', shareError);
        }
      }
      
      // Fallback: Download file with clear instructions
      setStatusMessage('Downloading file...');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setPhase('complete');
      setSyncResult({ imported: projectsToSend.length, skipped: 0, conflicts: 0 });
      toast({
        title: 'Sync file ready',
        description: `File downloaded. Send it to the other device via Bluetooth, Nearby Share, or any file sharing method.`
      });
    } catch (error) {
      console.error('[BluetoothSyncDialog] Sync error:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Sync failed');
      setPhase('error');
    }
  };

  // Handle file import for receive mode
  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setPhase('importing');
      setStatusMessage('Reading sync file...');
      
      const text = await file.text();
      const syncData = JSON.parse(text);
      
      if (!syncData.projects || !Array.isArray(syncData.projects)) {
        throw new Error('Invalid sync file format');
      }
      
      setStatusMessage('Importing projects...');
      
      let imported = 0;
      let skipped = 0;
      let recordsImported = 0;
      let recordsSkipped = 0;
      
      // Get existing records for fingerprint comparison
      const existingFingerprints = new Set<string>();
      for (const project of projects) {
        const records = await getRecordsByProject(project.id);
        for (const record of records) {
          const fp = generateRecordFingerprint(record);
          existingFingerprints.add(fp);
        }
      }
      
      for (const project of syncData.projects) {
        // Check if project already exists
        const existingProject = projects.find(p => p.id === project.id);
        
        if (!existingProject) {
          // Import new project
          await importProject(project);
          imported++;
        } else {
          skipped++;
        }
        
        // Import records for this project
        const projectRecords = (syncData.records || []).filter(
          (r: FarmRecord) => r.projectId === project.id
        );
        
        for (const record of projectRecords) {
          const fp = generateRecordFingerprint(record);
          if (!existingFingerprints.has(fp)) {
            await importRecord(record);
            existingFingerprints.add(fp);
            recordsImported++;
          } else {
            recordsSkipped++;
          }
        }
      }
      
      setPhase('complete');
      setSyncResult({ 
        imported: imported, 
        skipped: skipped, 
        conflicts: recordsSkipped 
      });
      
      toast({
        title: 'Import complete!',
        description: `Imported ${imported} project(s) and ${recordsImported} record(s).`
      });
      
      onSyncComplete();
      
    } catch (error) {
      console.error('[BluetoothSyncDialog] Import error:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Import failed');
      setPhase('error');
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Quick receive without Bluetooth (direct file import)
  const handleQuickReceive = () => {
    fileInputRef.current?.click();
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

  // Switch mode
  const handleModeChange = (mode: string) => {
    setSyncMode(mode as SyncMode);
    handleReset();
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

  // Render send mode content
  const renderSendContent = () => {
    switch (phase) {
      case 'idle':
        return (
          <div className="space-y-6">
            {/* Quick action */}
            <div className="flex flex-col items-center py-4">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <Send className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-1">Send Projects</h3>
              <p className="text-sm text-muted-foreground text-center mb-4">
                Share your projects with another device via Bluetooth or file transfer.
              </p>
              
              {/* Two options */}
              <div className="w-full space-y-3">
                <Button onClick={handleAddDevice} className="w-full" size="lg">
                  <Bluetooth className="h-4 w-4 mr-2" />
                  Pair & Send via Bluetooth
                </Button>
                
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">or</span>
                  </div>
                </div>
                
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => {
                    buildLocalMetadata();
                    setPhase('selecting');
                  }}
                >
                  <FileUp className="h-4 w-4 mr-2" />
                  Quick Export (Skip Bluetooth)
                </Button>
              </div>
            </div>
            
            {/* Previously paired devices */}
            {pairedDevices.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">Recent Devices</h3>
                <div className="space-y-2">
                  {pairedDevices.slice(0, 3).map(device => (
                    <div
                      key={device.deviceId}
                      className="flex items-center justify-between p-2 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Smartphone className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{device.deviceName}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleConnectDevice(device.deviceId)}
                      >
                        Connect
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
            <Button variant="ghost" size="sm" className="mt-4" onClick={handleReset}>
              Cancel
            </Button>
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
              <span>Preparing project list...</span>
            </div>
          </div>
        );

      case 'selecting':
        return (
          <div className="space-y-4">
            {/* Info banner - only show if device was paired */}
            {deviceName && (
              <div className="flex items-center gap-3 p-3 bg-green-500/10 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Ready to send</p>
                  <p className="text-xs text-muted-foreground">
                    {deviceName} • Select projects and tap Share
                  </p>
                </div>
              </div>
            )}

            {/* Project selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium">Select Projects</h3>
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

            {/* Share button */}
            <Button
              className="w-full"
              size="lg"
              onClick={handleStartSync}
              disabled={selectedProjects.size === 0}
            >
              <Send className="h-4 w-4 mr-2" />
              Share {selectedProjects.size} Project{selectedProjects.size !== 1 ? 's' : ''}
            </Button>
            
            <p className="text-xs text-muted-foreground text-center">
              This will open your device's share menu (Nearby Share, Bluetooth, etc.)
            </p>
          </div>
        );

      case 'transferring':
        return (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
            <p className="text-lg font-medium mb-2">Preparing sync data...</p>
            <p className="text-sm text-muted-foreground">{statusMessage}</p>
          </div>
        );

      case 'complete':
        return (
          <div className="flex flex-col items-center justify-center py-8">
            <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {syncMode === 'send' ? 'Projects Shared!' : 'Import Complete!'}
            </h3>
            {syncResult && (
              <div className="text-sm text-muted-foreground text-center mb-4">
                {syncMode === 'send' ? (
                  <p>Sent {syncResult.imported} project(s)</p>
                ) : (
                  <>
                    <p>Imported: {syncResult.imported} project(s)</p>
                    {syncResult.skipped > 0 && <p>Skipped: {syncResult.skipped} (already exist)</p>}
                  </>
                )}
              </div>
            )}
            {syncMode === 'send' && (
              <p className="text-xs text-muted-foreground mb-4">
                The other device should tap "Receive" to import the data.
              </p>
            )}
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        );

      case 'error':
        return (
          <div className="flex flex-col items-center justify-center py-8">
            <XCircle className="h-16 w-16 text-destructive mb-4" />
            <h3 className="text-lg font-semibold mb-2">Failed</h3>
            <p className="text-sm text-muted-foreground text-center mb-4 max-w-xs">{errorMessage}</p>
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

  // Render receive mode content
  const renderReceiveContent = () => {
    switch (phase) {
      case 'idle':
        return (
          <div className="flex flex-col items-center py-6">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <Download className="h-7 w-7 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-1">Receive Projects</h3>
            <p className="text-sm text-muted-foreground text-center mb-4">
              Import projects shared from another device.
            </p>
            
            <Button onClick={handleQuickReceive} className="w-full" size="lg">
              <FileUp className="h-4 w-4 mr-2" />
              Select Sync File
            </Button>
            
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFileImport}
            />
            
            <p className="text-xs text-muted-foreground text-center mt-4">
              Accept the file from the other device, then tap above to import it.
            </p>
          </div>
        );

      case 'importing':
        return (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
            <p className="text-lg font-medium mb-2">Importing...</p>
            <p className="text-sm text-muted-foreground">{statusMessage}</p>
          </div>
        );

      case 'complete':
        return (
          <div className="flex flex-col items-center justify-center py-8">
            <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Import Complete!</h3>
            {syncResult && (
              <div className="text-sm text-muted-foreground text-center mb-4">
                <p>Imported: {syncResult.imported} project(s)</p>
                {syncResult.skipped > 0 && <p>Skipped: {syncResult.skipped} (already exist)</p>}
              </div>
            )}
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        );

      case 'error':
        return (
          <div className="flex flex-col items-center justify-center py-8">
            <XCircle className="h-16 w-16 text-destructive mb-4" />
            <h3 className="text-lg font-semibold mb-2">Import Failed</h3>
            <p className="text-sm text-muted-foreground text-center mb-4 max-w-xs">{errorMessage}</p>
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

  // Main render
  const renderContent = () => {
    if (!bluetoothSupported && syncMode === 'send' && phase === 'idle') {
      // Show warning but still allow file-based sync
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-amber-500/10 rounded-lg">
            <BluetoothOff className="h-5 w-5 text-amber-600" />
            <div>
              <p className="text-sm font-medium">Bluetooth not available</p>
              <p className="text-xs text-muted-foreground">
                You can still sync using file export/import.
              </p>
            </div>
          </div>
          
          <Button 
            className="w-full"
            onClick={() => {
              buildLocalMetadata();
              setPhase('selecting');
            }}
          >
            <FileUp className="h-4 w-4 mr-2" />
            Export Projects
          </Button>
        </div>
      );
    }

    return syncMode === 'send' ? renderSendContent() : renderReceiveContent();
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
            Transfer projects between devices
          </DialogDescription>
        </DialogHeader>
        
        {/* Mode tabs - only show in idle state */}
        {phase === 'idle' && (
          <Tabs value={syncMode} onValueChange={handleModeChange} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="send" className="flex items-center gap-2">
                <Send className="h-4 w-4" />
                Send
              </TabsTrigger>
              <TabsTrigger value="receive" className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                Receive
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        
        {/* Hidden file input for receive mode */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleFileImport}
        />
        
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
}
