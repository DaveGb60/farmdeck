import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FarmProject, FarmRecord } from '@/lib/db';
import {
  isBluetoothAvailable,
  downloadJSON,
  shareViaWebShare,
  copyToClipboard,
  scanForBluetoothDevices,
  connectToDevice,
  exportToJSON,
} from '@/lib/bluetoothSync';
import { useToast } from '@/hooks/use-toast';
import { Bluetooth, Download, Copy, Share2, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface BluetoothShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: FarmProject;
  records: FarmRecord[];
}

export function BluetoothShareDialog({
  open,
  onOpenChange,
  project,
  records,
}: BluetoothShareDialogProps) {
  const { toast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [connectedDevice, setConnectedDevice] = useState<any | null>(null);
  const [transferStatus, setTransferStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');

  const bluetoothSupported = isBluetoothAvailable();
  const webShareSupported = typeof navigator !== 'undefined' && 'share' in navigator;

  const handleBluetoothConnect = async () => {
    setIsConnecting(true);
    setTransferStatus('connecting');
    try {
      const device = await scanForBluetoothDevices();
      if (device) {
        const connection = await connectToDevice(device);
        if (connection) {
          setConnectedDevice(device);
          setTransferStatus('connected');
          toast({ title: `Connected to ${device.name || 'device'}` });
          
          // Note: Actual data transfer via BLE requires the receiving device
          // to be running a compatible BLE peripheral service.
          // For now, show success and instruct to use file sharing as fallback.
          toast({
            title: 'Device connected',
            description: 'For full data transfer, please use the file export option below.',
          });
        } else {
          setTransferStatus('error');
        }
      } else {
        setTransferStatus('idle');
      }
    } catch (error) {
      setTransferStatus('error');
      toast({
        title: 'Bluetooth error',
        description: error instanceof Error ? error.message : 'Connection failed',
        variant: 'destructive',
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDownload = () => {
    downloadJSON(project, records);
    toast({ title: 'File downloaded' });
  };

  const handleWebShare = async () => {
    const success = await shareViaWebShare(project, records);
    if (success) {
      toast({ title: 'Shared successfully' });
    } else {
      // Fallback to download
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

  const exportData = exportToJSON(project, records);
  const dataSize = new Blob([exportData]).size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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

          <Tabs defaultValue="file" className="w-full">
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
                  <p className="text-xs mt-1">Use Chrome on Android or macOS for Bluetooth support</p>
                </div>
              ) : (
                <>
                  <div className="text-center space-y-3">
                    {transferStatus === 'idle' && (
                      <>
                        <Bluetooth className="h-12 w-12 mx-auto text-primary opacity-70" />
                        <p className="text-sm text-muted-foreground">
                          Connect to a nearby device to share this project
                        </p>
                      </>
                    )}
                    {transferStatus === 'connecting' && (
                      <>
                        <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin" />
                        <p className="text-sm">Scanning for devices...</p>
                      </>
                    )}
                    {transferStatus === 'connected' && (
                      <>
                        <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
                        <p className="text-sm">Connected to {connectedDevice?.name || 'device'}</p>
                      </>
                    )}
                    {transferStatus === 'error' && (
                      <>
                        <AlertCircle className="h-12 w-12 mx-auto text-destructive" />
                        <p className="text-sm text-destructive">Connection failed</p>
                      </>
                    )}
                  </div>

                  <Button
                    onClick={handleBluetoothConnect}
                    disabled={isConnecting}
                    className="w-full"
                    variant="outline"
                  >
                    {isConnecting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Bluetooth className="h-4 w-4 mr-2" />
                    )}
                    {transferStatus === 'connected' ? 'Connect Another Device' : 'Scan for Devices'}
                  </Button>

                  <p className="text-xs text-center text-muted-foreground">
                    Note: Both devices must have Bluetooth enabled
                  </p>
                </>
              )}
            </TabsContent>

            <TabsContent value="file" className="space-y-3 mt-4">
              <p className="text-sm text-muted-foreground text-center mb-4">
                Export your project data as a file to share via any method
              </p>

              <div className="grid gap-2">
                {webShareSupported && (
                  <Button onClick={handleWebShare} variant="outline" className="w-full justify-start">
                    <Share2 className="h-4 w-4 mr-3" />
                    Share via Apps
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
                <p className="text-xs font-medium mb-2">Quick Share Instructions:</p>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Download or share the JSON file</li>
                  <li>Send to the other device (Bluetooth, AirDrop, email, etc.)</li>
                  <li>On the receiving device, open FarmDeck and tap Import</li>
                </ol>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
