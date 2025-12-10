import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { FarmProject, FarmRecord } from '@/lib/db';
import {
  isBluetoothAvailable,
  downloadJSON,
  shareViaWebShare,
  copyToClipboard,
  connectToBluetoothDevice,
  disconnectBluetooth,
  sendDataViaBluetooth,
  exportToJSON,
  isDeviceConnected,
  BluetoothConnection,
  TransferProgress,
} from '@/lib/bluetoothSync';
import { useToast } from '@/hooks/use-toast';
import { 
  Bluetooth, 
  Download, 
  Copy, 
  Share2, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Send,
  Unplug,
  Smartphone,
} from 'lucide-react';

interface BluetoothShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: FarmProject;
  records: FarmRecord[];
}

type ConnectionStatus = 'idle' | 'scanning' | 'connected' | 'sending' | 'complete' | 'error';

export function BluetoothShareDialog({
  open,
  onOpenChange,
  project,
  records,
}: BluetoothShareDialogProps) {
  const { toast } = useToast();
  const [connection, setConnection] = useState<BluetoothConnection | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [transferProgress, setTransferProgress] = useState<TransferProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const bluetoothSupported = isBluetoothAvailable();
  const webShareSupported = typeof navigator !== 'undefined' && 'share' in navigator;

  const exportData = exportToJSON(project, records);
  const dataSize = new Blob([exportData]).size;

  // User gesture: Scan and connect to device
  const handleScanAndConnect = async () => {
    setStatus('scanning');
    setErrorMessage(null);
    
    try {
      const conn = await connectToBluetoothDevice();
      
      if (!conn) {
        // User cancelled device picker
        setStatus('idle');
        return;
      }
      
      setConnection(conn);
      setStatus('connected');
      
      toast({ 
        title: `Connected to ${conn.device.name || 'Bluetooth Device'}`,
        description: conn.characteristic 
          ? 'Ready to send data' 
          : 'Device connected - use file sharing for data transfer'
      });
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Connection failed');
      toast({
        title: 'Connection failed',
        description: error instanceof Error ? error.message : 'Could not connect to device',
        variant: 'destructive',
      });
    }
  };

  // User gesture: Send data to connected device
  const handleSendData = async () => {
    if (!connection || !isDeviceConnected(connection)) {
      toast({ title: 'Not connected', variant: 'destructive' });
      return;
    }

    if (!connection.characteristic) {
      toast({
        title: 'Direct transfer not supported',
        description: 'This device doesn\'t support FarmDeck data transfer. Please use file sharing instead.',
        variant: 'destructive',
      });
      return;
    }

    setStatus('sending');
    
    try {
      const success = await sendDataViaBluetooth(
        connection,
        exportData,
        (progress) => setTransferProgress(progress)
      );
      
      if (success) {
        setStatus('complete');
        toast({ title: 'Data sent successfully!' });
      } else {
        setStatus('error');
        setErrorMessage('Transfer failed');
      }
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Transfer failed');
    }
  };

  // User gesture: Disconnect device
  const handleDisconnect = () => {
    if (connection) {
      disconnectBluetooth(connection);
      setConnection(null);
    }
    setStatus('idle');
    setTransferProgress(null);
    setErrorMessage(null);
  };

  // File sharing handlers
  const handleDownload = () => {
    downloadJSON(project, records);
    toast({ title: 'File downloaded' });
  };

  const handleWebShare = async () => {
    const success = await shareViaWebShare(project, records);
    if (success) {
      toast({ title: 'Shared successfully' });
    } else {
      handleDownload();
    }
  };

  const handleCopy = async () => {
    const success = await copyToClipboard(project, records);
    if (success) {
      toast({ title: 'Copied to clipboard' });
    } else {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  const handleClose = (value: boolean) => {
    if (!value) {
      handleDisconnect();
    }
    onOpenChange(value);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif">Share Project</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Project Summary */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <h4 className="font-medium">{project.title}</h4>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Records: {records.length}</p>
              <p>Data size: {(dataSize / 1024).toFixed(1)} KB</p>
              <p className="font-mono text-xs">ID: {project.id.slice(0, 12)}...</p>
            </div>
          </div>

          <Tabs defaultValue={bluetoothSupported ? "bluetooth" : "file"} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="bluetooth" disabled={!bluetoothSupported}>
                <Bluetooth className="h-4 w-4 mr-2" />
                Bluetooth
              </TabsTrigger>
              <TabsTrigger value="file">
                <Download className="h-4 w-4 mr-2" />
                File Export
              </TabsTrigger>
            </TabsList>

            <TabsContent value="bluetooth" className="space-y-4 mt-4">
              {!bluetoothSupported ? (
                <div className="text-center p-4 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Bluetooth not available in this browser</p>
                  <p className="text-xs mt-1">Use Chrome on Android or macOS</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Status Display */}
                  <div className="text-center py-4">
                    {status === 'idle' && (
                      <>
                        <Smartphone className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                        <p className="text-sm text-muted-foreground">
                          Tap below to scan for nearby devices
                        </p>
                      </>
                    )}
                    {status === 'scanning' && (
                      <>
                        <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin mb-3" />
                        <p className="text-sm">Select a device from the list...</p>
                      </>
                    )}
                    {status === 'connected' && connection && (
                      <>
                        <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-3" />
                        <p className="font-medium">{connection.device.name || 'Connected Device'}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {connection.characteristic 
                            ? 'Ready to send data' 
                            : 'Use file sharing for data transfer'}
                        </p>
                      </>
                    )}
                    {status === 'sending' && transferProgress && (
                      <>
                        <Send className="h-12 w-12 mx-auto text-primary mb-3 animate-pulse" />
                        <p className="text-sm mb-2">Sending data...</p>
                        <Progress 
                          value={(transferProgress.sent / transferProgress.total) * 100} 
                          className="h-2"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          {transferProgress.sent}/{transferProgress.total} chunks
                        </p>
                      </>
                    )}
                    {status === 'complete' && (
                      <>
                        <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-3" />
                        <p className="font-medium text-green-600">Transfer Complete!</p>
                      </>
                    )}
                    {status === 'error' && (
                      <>
                        <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-3" />
                        <p className="text-sm text-destructive">{errorMessage || 'Connection failed'}</p>
                      </>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-2">
                    {(status === 'idle' || status === 'error') && (
                      <Button onClick={handleScanAndConnect} className="w-full">
                        <Bluetooth className="h-4 w-4 mr-2" />
                        Scan for Devices
                      </Button>
                    )}

                    {status === 'connected' && connection?.characteristic && (
                      <Button onClick={handleSendData} className="w-full">
                        <Send className="h-4 w-4 mr-2" />
                        Send Project Data
                      </Button>
                    )}

                    {(status === 'connected' || status === 'complete') && (
                      <Button onClick={handleDisconnect} variant="outline" className="w-full">
                        <Unplug className="h-4 w-4 mr-2" />
                        Disconnect
                      </Button>
                    )}

                    {status === 'connected' && !connection?.characteristic && (
                      <div className="bg-muted/50 rounded-lg p-3 text-center">
                        <p className="text-xs text-muted-foreground mb-2">
                          This device doesn't support direct data transfer.
                          Use the File Export tab to share via other methods.
                        </p>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-center text-muted-foreground">
                    Both devices must have Bluetooth enabled and be nearby
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="file" className="space-y-3 mt-4">
              <p className="text-sm text-muted-foreground text-center mb-4">
                Export and share via any method
              </p>

              <div className="grid gap-2">
                {webShareSupported && (
                  <Button onClick={handleWebShare} variant="outline" className="w-full justify-start">
                    <Share2 className="h-4 w-4 mr-3" />
                    Share via Apps (AirDrop, Nearby Share, etc.)
                  </Button>
                )}
                
                <Button onClick={handleDownload} variant="outline" className="w-full justify-start">
                  <Download className="h-4 w-4 mr-3" />
                  Download JSON File
                </Button>
                
                <Button onClick={handleCopy} variant="outline" className="w-full justify-start">
                  <Copy className="h-4 w-4 mr-3" />
                  Copy to Clipboard
                </Button>
              </div>

              <div className="mt-4 p-3 bg-muted rounded-lg">
                <p className="text-xs font-medium mb-2">How to transfer:</p>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Download or share the file</li>
                  <li>Send to other device (AirDrop, email, messaging, etc.)</li>
                  <li>On receiving device, open FarmDeck → Import</li>
                </ol>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
