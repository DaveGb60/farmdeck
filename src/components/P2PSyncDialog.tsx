import { useState, useEffect, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  WebRTCSync,
  SyncMetadata,
  SyncSelection,
  TransferProgress,
  SyncDataPayload,
  ConflictInfo,
  detectConflicts,
  applySyncData,
  createSignalingData,
  parseSignalingData,
  createAnswerData,
  parseAnswerData,
  getDeviceId,
  ProjectSummary,
} from '@/lib/webrtcSync';
import { QRCodeScanner } from '@/components/QRCodeScanner';
import {
  Wifi,
  WifiOff,
  QrCode,
  Keyboard,
  Send,
  Download,
  ArrowLeftRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  Smartphone,
  RefreshCw,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Clock,
  Database,
  Camera,
  ScanLine,
} from 'lucide-react';

type SyncPhase = 
  | 'idle'
  | 'creating'
  | 'waiting'
  | 'joining'
  | 'connected'
  | 'metadata'
  | 'selecting'
  | 'confirming'
  | 'transferring'
  | 'complete'
  | 'error'
  | 'cancelled';

interface P2PSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: FarmProject[];
  onSyncComplete: () => void;
}

export function P2PSyncDialog({
  open,
  onOpenChange,
  projects,
  onSyncComplete,
}: P2PSyncDialogProps) {
  const { toast } = useToast();
  const syncRef = useRef<WebRTCSync | null>(null);
  
  // Connection state
  const [phase, setPhase] = useState<SyncPhase>('idle');
  const phaseRef = useRef<SyncPhase>('idle'); // Ref to track current phase for callbacks
  const [isInitiator, setIsInitiator] = useState(false);
  const [signalingData, setSignalingData] = useState<string>('');
  const [pairingCode, setPairingCode] = useState<string>('');
  const [joinCode, setJoinCode] = useState<string>('');
  const [answerData, setAnswerData] = useState<string>('');
  const [showScanner, setShowScanner] = useState(false);
  const [joinMode, setJoinMode] = useState<'scan' | 'paste'>('scan');
  
  // Metadata & selection
  const [localMetadata, setLocalMetadata] = useState<SyncMetadata | null>(null);
  const [remoteMetadata, setRemoteMetadata] = useState<SyncMetadata | null>(null);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [direction, setDirection] = useState<'send' | 'receive'>('send');
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);
  const [conflictResolution, setConflictResolution] = useState<'keep_local' | 'keep_remote' | 'keep_newer'>('keep_newer');
  
  // Transfer state
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [syncResult, setSyncResult] = useState<{ imported: number; skipped: number; conflicts: number } | null>(null);

  // Keep phase ref in sync
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

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

  // Initialize sync connection
  const initSync = useCallback(() => {
    if (syncRef.current) {
      syncRef.current.close();
    }
    
    const sync = new WebRTCSync();
    
    sync.onConnectionStateChange = (state) => {
      console.log('[P2PSync] Connection state:', state);
      if (state === 'connected') {
        setPhase('connected');
      } else if (state === 'failed' || state === 'disconnected') {
        // Use ref to get current phase to avoid stale closure
        const currentPhase = phaseRef.current;
        if (currentPhase !== 'complete' && currentPhase !== 'cancelled' && currentPhase !== 'error') {
          setPhase('error');
          setErrorMessage('Connection lost');
        }
      }
    };

    sync.onDataChannelStateChange = (state) => {
      console.log('[P2PSync] Data channel state:', state);
      if (state === 'open') {
        setPhase('metadata');
        // Exchange metadata
        sync.sendMetadata(projects);
      }
    };

    sync.onMetadataReceived = (metadata) => {
      console.log('[P2PSync] Received metadata:', metadata);
      setRemoteMetadata(metadata);
      
      // Detect conflicts
      const detectedConflicts = detectConflicts(projects, metadata);
      setConflicts(detectedConflicts);
      
      setPhase('selecting');
    };

    sync.onSyncRequest = (selection, metadata) => {
      console.log('[P2PSync] Sync request received:', selection);
      setRemoteMetadata(metadata);
      setSelectedProjects(new Set(selection.projectIds));
      setDirection(selection.direction === 'send' ? 'receive' : 'send');
      setShowConfirmDialog(true);
    };

    sync.onTransferProgress = (prog) => {
      setProgress(prog);
      if (prog.phase === 'complete') {
        setPhase('complete');
      } else if (prog.phase === 'cancelled') {
        setPhase('cancelled');
      } else if (prog.phase === 'error') {
        setPhase('error');
      }
    };

    sync.onDataReceived = async (data) => {
      console.log('[P2PSync] Data received, applying...');
      try {
        const result = await applySyncData(data, conflictResolution, projects);
        setSyncResult(result);
        setPhase('complete');
        onSyncComplete();
        toast({
          title: 'Sync complete',
          description: `Imported ${result.imported} project(s), ${result.skipped} skipped`
        });
      } catch (error) {
        console.error('[P2PSync] Apply sync error:', error);
        setPhase('error');
        setErrorMessage('Failed to apply sync data');
      }
    };

    sync.onError = (error) => {
      console.error('[P2PSync] Error:', error);
      setErrorMessage(error);
      setPhase('error');
    };

    syncRef.current = sync;
    return sync;
  }, [projects, conflictResolution, onSyncComplete, toast]);

  // Create session (initiator)
  const handleCreateSession = async () => {
    try {
      setPhase('creating');
      setIsInitiator(true);
      setErrorMessage('');
      
      await buildLocalMetadata();
      const sync = initSync();
      
      if (!sync) {
        throw new Error('Failed to initialize sync');
      }
      
      const { offer, pairingCode: code } = await sync.createSession();
      
      if (!offer || !code) {
        throw new Error('Failed to create session');
      }
      
      const encoded = createSignalingData(offer, code);
      setSignalingData(encoded);
      setPairingCode(code);
      setPhase('waiting');
    } catch (error) {
      console.error('[P2PSync] Create session error:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create session');
      setPhase('error');
    }
  };

  // Join session (joiner) - from scanned/pasted data
  const handleJoinWithData = useCallback(async (data: string): Promise<void> => {
    const trimmedData = data.trim();
    if (!trimmedData) {
      toast({ title: 'Please scan QR or enter pairing data', variant: 'destructive' });
      return;
    }

    try {
      console.log('[P2PSync] Starting join with data...');
      setPhase('joining');
      setIsInitiator(false);
      setShowScanner(false);
      setErrorMessage('');

      await buildLocalMetadata();
      const sync = initSync();
      
      if (!sync) {
        throw new Error('Failed to initialize sync');
      }
      
      console.log('[P2PSync] Parsing signaling data...');
      const parsed = parseSignalingData(trimmedData);
      if (!parsed) {
        throw new Error('Invalid pairing data - please try again');
      }

      console.log('[P2PSync] Joining session with offer...');
      const answer = await sync.joinSession(parsed.offer);
      
      if (!answer) {
        throw new Error('Failed to create answer');
      }
      
      console.log('[P2PSync] Creating answer data...');
      const encodedAnswer = createAnswerData(answer);
      setAnswerData(encodedAnswer);
      setPairingCode(parsed.pairingCode);
      setPhase('waiting');
      console.log('[P2PSync] Join successful, waiting for connection completion');
    } catch (error) {
      console.error('[P2PSync] Join session error:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to join session');
      setPhase('error');
    }
  }, [buildLocalMetadata, initSync, toast]);

  // Complete connection with answer (initiator receives answer)
  const handleReceiveAnswerWithData = useCallback(async (data: string): Promise<void> => {
    const trimmedData = data.trim();
    if (!trimmedData || !syncRef.current) {
      toast({ title: 'Please scan or enter the response code', variant: 'destructive' });
      return;
    }

    try {
      console.log('[P2PSync] Parsing answer data...');
      const answer = parseAnswerData(trimmedData);
      if (!answer) {
        throw new Error('Invalid response code - please try again');
      }

      console.log('[P2PSync] Completing connection with answer...');
      await syncRef.current.completeConnection(answer);
      console.log('[P2PSync] Connection completion initiated');
      // Phase will transition via the connection state callback
    } catch (error) {
      console.error('[P2PSync] Complete connection error:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to complete connection');
      setPhase('error');
    }
  }, [toast]);

  // Handle QR code scan result - use ref to prevent duplicate processing
  const scanProcessingRef = useRef(false);
  const isMountedRef = useRef(true);
  
  // Track mounted state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  
  const handleQRScan = useCallback((data: string) => {
    // Prevent duplicate processing
    if (!data || scanProcessingRef.current) {
      console.log('[P2PSync] Ignoring scan - no data or already processing');
      return;
    }
    
    // Check current phase using ref to avoid stale closure
    const currentPhase = phaseRef.current;
    if (currentPhase !== 'idle') {
      console.log('[P2PSync] Ignoring scan - wrong phase:', currentPhase);
      return;
    }
    
    scanProcessingRef.current = true;
    console.log('[P2PSync] Processing QR scan for join');
    
    // Use requestAnimationFrame to ensure state updates happen safely
    requestAnimationFrame(() => {
      if (!isMountedRef.current) {
        scanProcessingRef.current = false;
        return;
      }
      
      setJoinCode(data);
      
      // Delay the join to allow React to complete render cycle
      setTimeout(() => {
        if (!isMountedRef.current) {
          scanProcessingRef.current = false;
          return;
        }
        
        handleJoinWithData(data)
          .catch((error) => {
            console.error('[P2PSync] QR scan join error:', error);
            if (isMountedRef.current) {
              setPhase('error');
              setErrorMessage(error instanceof Error ? error.message : 'Failed to process QR code');
            }
          })
          .finally(() => {
            setTimeout(() => {
              scanProcessingRef.current = false;
            }, 500);
          });
      }, 100);
    });
  }, [handleJoinWithData]);

  // Handle QR scan for answer (initiator scanning joiner's response)
  const answerProcessingRef = useRef(false);
  
  const handleAnswerScan = useCallback((data: string) => {
    // Prevent duplicate processing
    if (!data || answerProcessingRef.current) {
      console.log('[P2PSync] Ignoring answer scan - no data or already processing');
      return;
    }
    
    // Check current phase using ref
    const currentPhase = phaseRef.current;
    if (currentPhase !== 'waiting' || !isInitiator) {
      console.log('[P2PSync] Ignoring answer scan - wrong phase or not initiator');
      return;
    }
    
    answerProcessingRef.current = true;
    console.log('[P2PSync] Processing QR scan for answer');
    
    // Use requestAnimationFrame to ensure state updates happen safely
    requestAnimationFrame(() => {
      if (!isMountedRef.current) {
        answerProcessingRef.current = false;
        return;
      }
      
      setAnswerData(data);
      setShowScanner(false);
      
      // Delay the connection to allow React to complete render cycle
      setTimeout(() => {
        if (!isMountedRef.current) {
          answerProcessingRef.current = false;
          return;
        }
        
        handleReceiveAnswerWithData(data)
          .catch((error) => {
            console.error('[P2PSync] Answer scan error:', error);
            if (isMountedRef.current) {
              setPhase('error');
              setErrorMessage(error instanceof Error ? error.message : 'Failed to process answer');
            }
          })
          .finally(() => {
            setTimeout(() => {
              answerProcessingRef.current = false;
            }, 500);
          });
      }, 100);
    });
  }, [isInitiator, handleReceiveAnswerWithData]);

  // Join session (joiner) - manual button
  const handleJoinSession = async () => {
    await handleJoinWithData(joinCode);
  };

  // Complete connection with answer (initiator receives answer) - manual button
  const handleReceiveAnswer = async () => {
    await handleReceiveAnswerWithData(answerData);
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
  const handleStartSync = () => {
    if (selectedProjects.size === 0) {
      toast({ title: 'Please select at least one project', variant: 'destructive' });
      return;
    }

    if (direction === 'send' && syncRef.current && localMetadata) {
      // Send sync request to other device
      const selection: SyncSelection = {
        projectIds: Array.from(selectedProjects),
        direction,
        resolveConflicts: conflictResolution
      };
      syncRef.current.sendSyncRequest(selection, localMetadata);
      setShowConfirmDialog(true);
    } else {
      setShowConfirmDialog(true);
    }
  };

  // Confirm and execute transfer
  const handleConfirmTransfer = async () => {
    setShowConfirmDialog(false);
    setPhase('transferring');

    if (direction === 'send' && syncRef.current) {
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

      const payload: SyncDataPayload = {
        projects: projectsToSend,
        records: recordsToSend
      };

      await syncRef.current.sendData(payload);
    }
  };

  // Cancel transfer
  const handleCancelTransfer = () => {
    if (syncRef.current) {
      syncRef.current.cancelTransfer();
    }
    setPhase('cancelled');
  };

  // Copy to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copied to clipboard' });
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  };

  // Reset state
  const handleReset = () => {
    if (syncRef.current) {
      syncRef.current.close();
      syncRef.current = null;
    }
    // Reset processing refs
    scanProcessingRef.current = false;
    answerProcessingRef.current = false;
    phaseRef.current = 'idle';
    
    setPhase('idle');
    setIsInitiator(false);
    setSignalingData('');
    setPairingCode('');
    setJoinCode('');
    setAnswerData('');
    setShowScanner(false);
    setJoinMode('scan');
    setLocalMetadata(null);
    setRemoteMetadata(null);
    setSelectedProjects(new Set());
    setConflicts([]);
    setProgress(null);
    setErrorMessage('');
    setSyncResult(null);
  };

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      handleReset();
    }
  }, [open]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (syncRef.current) {
        syncRef.current.close();
      }
    };
  }, []);

  const renderIdlePhase = () => (
    <div className="space-y-4 sm:space-y-6">
      <div className="text-center py-2 sm:py-4">
        <Wifi className="h-10 w-10 sm:h-12 sm:w-12 mx-auto text-primary mb-2 sm:mb-3" />
        <p className="text-xs sm:text-sm text-muted-foreground">
          Sync data directly between devices using peer-to-peer connection
        </p>
      </div>

      <div className="grid gap-3 sm:gap-4">
        <Button onClick={handleCreateSession} className="w-full h-12 sm:h-16 text-sm sm:text-lg">
          <QrCode className="h-4 w-4 sm:h-5 sm:w-5 mr-2 sm:mr-3" />
          Create Sync Session
        </Button>
        
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">or join existing session</span>
          </div>
        </div>

        {/* Join Mode Tabs */}
        <Tabs value={joinMode} onValueChange={(v) => setJoinMode(v as 'scan' | 'paste')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="scan" className="gap-1 sm:gap-2 text-xs sm:text-sm">
              <Camera className="h-3 w-3 sm:h-4 sm:w-4" />
              Scan QR
            </TabsTrigger>
            <TabsTrigger value="paste" className="gap-1 sm:gap-2 text-xs sm:text-sm">
              <Keyboard className="h-3 w-3 sm:h-4 sm:w-4" />
              Paste Code
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="scan" className="mt-3 sm:mt-4">
            <QRCodeScanner 
              onScan={handleQRScan}
              scanning={joinMode === 'scan' && phase === 'idle'}
            />
          </TabsContent>
          
          <TabsContent value="paste" className="mt-3 sm:mt-4 space-y-2 sm:space-y-3">
            <Input
              placeholder="Paste pairing data here..."
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              className="font-mono text-xs"
            />
            <Button 
              onClick={handleJoinSession} 
              variant="outline" 
              className="w-full text-sm"
              disabled={!joinCode.trim()}
            >
              <Keyboard className="h-4 w-4 mr-2" />
              Join Session
            </Button>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );

  const renderWaitingPhase = () => (
    <div className="space-y-4 sm:space-y-6">
      {isInitiator ? (
        <>
          <div className="text-center py-2 sm:py-4">
            <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-primary/10 rounded-full mb-3 sm:mb-4">
              <span className="font-mono font-bold text-base sm:text-lg tracking-widest">{pairingCode}</span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-4">
              Let the other device scan this QR code
            </p>
          </div>

          <div className="flex justify-center">
            <div className="bg-white p-2 sm:p-4 rounded-lg shadow-md">
              <QRCodeSVG value={signalingData} size={160} className="sm:hidden" />
              <QRCodeSVG value={signalingData} size={200} className="hidden sm:block" />
            </div>
          </div>

          <div className="flex gap-2 justify-center">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => copyToClipboard(signalingData)}
              className="text-xs sm:text-sm"
            >
              <Copy className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              Copy Code
            </Button>
          </div>

          <div className="border-t pt-3 sm:pt-4 space-y-2 sm:space-y-3">
            <p className="text-xs sm:text-sm text-muted-foreground text-center">
              After the other device scans, get their response:
            </p>
            
            <Tabs value={showScanner ? 'scan' : 'paste'} onValueChange={(v) => setShowScanner(v === 'scan')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="scan" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                  <Camera className="h-3 w-3 sm:h-4 sm:w-4" />
                  Scan Response
                </TabsTrigger>
                <TabsTrigger value="paste" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                  <Keyboard className="h-3 w-3 sm:h-4 sm:w-4" />
                  Paste Response
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="scan" className="mt-2 sm:mt-3">
                <QRCodeScanner 
                  onScan={handleAnswerScan}
                  scanning={showScanner && phase === 'waiting' && isInitiator}
                />
              </TabsContent>
              
              <TabsContent value="paste" className="mt-2 sm:mt-3 space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Paste response code..."
                    value={answerData}
                    onChange={(e) => setAnswerData(e.target.value)}
                    className="font-mono text-xs"
                  />
                  <Button onClick={handleReceiveAnswer} disabled={!answerData.trim()} size="sm">
                    Connect
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </>
      ) : (
        <>
          <div className="text-center py-2 sm:py-4">
            <CheckCircle2 className="h-10 w-10 sm:h-12 sm:w-12 mx-auto text-green-500 mb-2 sm:mb-3" />
            <p className="font-medium text-sm sm:text-base">Session joined!</p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 sm:mt-2">
              Let the other device scan this QR code to complete connection
            </p>
          </div>

          <div className="flex justify-center">
            <div className="bg-white p-2 sm:p-4 rounded-lg shadow-md">
              <QRCodeSVG value={answerData} size={140} className="sm:hidden" />
              <QRCodeSVG value={answerData} size={180} className="hidden sm:block" />
            </div>
          </div>

          <div className="flex gap-2 justify-center">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => copyToClipboard(answerData)}
              className="text-xs sm:text-sm"
            >
              <Copy className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              Copy Response
            </Button>
          </div>

          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
            <span className="text-xs sm:text-sm">Waiting for connection...</span>
          </div>
        </>
      )}
    </div>
  );

  const renderSelectingPhase = () => {
    const sourceProjects = direction === 'send' ? localMetadata?.projects : remoteMetadata?.projects;
    const sourceLabel = direction === 'send' ? 'Your Projects' : 'Remote Projects';

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-green-500" />
            <span className="font-medium">Connected</span>
          </div>
          <Badge variant="outline" className="font-mono">
            {remoteMetadata?.deviceName || 'Device'}
          </Badge>
        </div>

        {/* Direction Toggle */}
        <Tabs value={direction} onValueChange={(v) => setDirection(v as 'send' | 'receive')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="send" className="gap-2">
              <Send className="h-4 w-4" />
              Send
            </TabsTrigger>
            <TabsTrigger value="receive" className="gap-2">
              <Download className="h-4 w-4" />
              Receive
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Project Selection */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{sourceLabel}</span>
            <Button variant="ghost" size="sm" onClick={selectAllProjects}>
              Select All
            </Button>
          </div>
          
          <ScrollArea className="h-[200px] border rounded-lg p-2">
            <div className="space-y-2">
              {sourceProjects?.map((project) => {
                const hasConflict = conflicts.some(c => c.projectId === project.id);
                const conflict = conflicts.find(c => c.projectId === project.id);
                
                return (
                  <div
                    key={project.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                      ${selectedProjects.has(project.id) ? 'bg-primary/10 border-primary' : 'hover:bg-muted/50'}`}
                    onClick={() => toggleProjectSelection(project.id)}
                  >
                    <Checkbox
                      checked={selectedProjects.has(project.id)}
                      onCheckedChange={() => toggleProjectSelection(project.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{project.title}</span>
                        {project.isCompleted && (
                          <Badge variant="secondary" className="text-xs">Completed</Badge>
                        )}
                        {hasConflict && (
                          <Badge variant="destructive" className="text-xs gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Conflict
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <Database className="h-3 w-3" />
                          {project.recordCount} records
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(project.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                      {conflict && (
                        <p className="text-xs text-destructive mt-1">
                          {conflict.type === 'newer_local' && 'Local version is newer'}
                          {conflict.type === 'newer_remote' && 'Remote version is newer'}
                          {conflict.type === 'both_modified' && 'Both versions modified'}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
              
              {(!sourceProjects || sourceProjects.length === 0) && (
                <p className="text-center text-muted-foreground py-8">
                  No projects available
                </p>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Conflict Resolution */}
        {conflicts.length > 0 && direction === 'receive' && (
          <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
            <span className="text-sm font-medium">Conflict Resolution</span>
            <div className="flex gap-2">
              {(['keep_newer', 'keep_remote', 'keep_local'] as const).map((option) => (
                <Button
                  key={option}
                  variant={conflictResolution === option ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setConflictResolution(option)}
                >
                  {option === 'keep_newer' && 'Keep Newer'}
                  {option === 'keep_remote' && 'Use Remote'}
                  {option === 'keep_local' && 'Keep Local'}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Summary & Action */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            {selectedProjects.size} project(s) selected
          </div>
          <Button onClick={handleStartSync} disabled={selectedProjects.size === 0}>
            {direction === 'send' ? (
              <>
                <ArrowRight className="h-4 w-4 mr-2" />
                Send Data
              </>
            ) : (
              <>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Receive Data
              </>
            )}
          </Button>
        </div>
      </div>
    );
  };

  const renderTransferringPhase = () => (
    <div className="space-y-6 py-8">
      <div className="text-center">
        <ArrowLeftRight className="h-12 w-12 mx-auto text-primary animate-pulse mb-4" />
        <p className="font-medium">
          {progress?.direction === 'send' ? 'Sending data...' : 'Receiving data...'}
        </p>
      </div>

      {progress && (
        <div className="space-y-2">
          <Progress 
            value={(progress.sentChunks / Math.max(progress.totalChunks, 1)) * 100} 
            className="h-3"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {progress.sentChunks} / {progress.totalChunks} chunks
            </span>
            <span>
              {(progress.sentBytes / 1024).toFixed(1)} KB / {(progress.totalBytes / 1024).toFixed(1)} KB
            </span>
          </div>
        </div>
      )}

      <Button variant="destructive" onClick={handleCancelTransfer} className="w-full">
        Cancel Transfer
      </Button>
    </div>
  );

  const renderCompletePhase = () => (
    <div className="space-y-6 py-8 text-center">
      <CheckCircle2 className="h-16 w-16 mx-auto text-green-500" />
      <div>
        <p className="font-medium text-lg">Sync Complete!</p>
        {syncResult && (
          <p className="text-sm text-muted-foreground mt-2">
            {syncResult.imported} imported, {syncResult.skipped} skipped
            {syncResult.conflicts > 0 && `, ${syncResult.conflicts} conflicts resolved`}
          </p>
        )}
      </div>
      <Button onClick={() => onOpenChange(false)} className="w-full">
        Done
      </Button>
    </div>
  );

  const renderErrorPhase = () => (
    <div className="space-y-6 py-8 text-center">
      <XCircle className="h-16 w-16 mx-auto text-destructive" />
      <div>
        <p className="font-medium text-lg">Sync Failed</p>
        <p className="text-sm text-muted-foreground mt-2">{errorMessage || 'An error occurred'}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={handleReset} className="flex-1">
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
        <Button onClick={() => onOpenChange(false)} className="flex-1">
          Close
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif flex items-center gap-2 text-base sm:text-lg">
              <Wifi className="h-4 w-4 sm:h-5 sm:w-5" />
              P2P Data Sync
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {phase === 'idle' && 'Sync projects directly between devices'}
              {phase === 'creating' && 'Creating session...'}
              {phase === 'waiting' && 'Waiting for connection...'}
              {phase === 'joining' && 'Joining session...'}
              {phase === 'connected' && 'Establishing data channel...'}
              {phase === 'metadata' && 'Exchanging metadata...'}
              {phase === 'selecting' && 'Select projects to sync'}
              {phase === 'transferring' && 'Transferring data...'}
              {phase === 'complete' && 'Transfer complete'}
              {phase === 'error' && 'An error occurred'}
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 sm:py-4">
            {phase === 'idle' && renderIdlePhase()}
            {(phase === 'creating' || phase === 'joining') && (
              <div className="flex flex-col items-center justify-center py-8 sm:py-12 gap-2 sm:gap-3">
                <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-primary" />
                <span className="text-xs sm:text-sm text-muted-foreground">
                  {phase === 'creating' ? 'Creating session...' : 'Joining session...'}
                </span>
              </div>
            )}
            {phase === 'waiting' && renderWaitingPhase()}
            {(phase === 'connected' || phase === 'metadata') && (
              <div className="flex flex-col items-center justify-center py-8 sm:py-12 gap-2 sm:gap-3">
                <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-primary" />
                <span className="text-xs sm:text-sm text-muted-foreground">Exchanging metadata...</span>
              </div>
            )}
            {phase === 'selecting' && renderSelectingPhase()}
            {(phase === 'confirming' || phase === 'transferring') && renderTransferringPhase()}
            {phase === 'complete' && renderCompletePhase()}
            {(phase === 'error' || phase === 'cancelled') && renderErrorPhase()}
          </div>

          {phase !== 'idle' && phase !== 'complete' && phase !== 'error' && phase !== 'cancelled' && (
            <div className="flex justify-between items-center pt-3 sm:pt-4 border-t">
              <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs sm:text-sm">
                Start Over
              </Button>
              {phase === 'selecting' && (
                <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-xs sm:text-sm">
                  Cancel
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Transfer Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Data Transfer</AlertDialogTitle>
            <AlertDialogDescription>
              {direction === 'send' ? (
                <>
                  You are about to send {selectedProjects.size} project(s) to the connected device.
                  This action requires confirmation from both devices.
                </>
              ) : (
                <>
                  You are about to receive {selectedProjects.size} project(s) from the connected device.
                  {conflicts.length > 0 && (
                    <span className="block mt-2 text-destructive">
                      ⚠️ {conflicts.length} conflict(s) will be resolved using "{conflictResolution.replace('_', ' ')}" strategy.
                    </span>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowConfirmDialog(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmTransfer}>
              {direction === 'send' ? 'Send' : 'Receive'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
