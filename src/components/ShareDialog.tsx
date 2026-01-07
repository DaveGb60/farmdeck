import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FarmProject, FarmRecord } from '@/lib/db';
import {
  downloadJSON,
  shareViaWebShare,
  copyToClipboard,
  exportToJSON,
} from '@/lib/fileSync';
import { useToast } from '@/hooks/use-toast';
import { 
  Download, 
  Copy, 
  Share2, 
  CheckCircle2, 
  FileJson,
  ExternalLink,
} from 'lucide-react';

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: FarmProject;
  records: FarmRecord[];
}

export function ShareDialog({
  open,
  onOpenChange,
  project,
  records,
}: ShareDialogProps) {
  const { toast } = useToast();
  const [lastAction, setLastAction] = useState<string | null>(null);

  const webShareSupported = typeof navigator !== 'undefined' && 'share' in navigator;
  const exportData = exportToJSON(project, records);
  const dataSize = new Blob([exportData]).size;

  // File sharing handlers
  const handleDownload = () => {
    downloadJSON(project, records);
    setLastAction('download');
    toast({ title: 'File downloaded' });
  };

  const handleWebShare = async () => {
    const success = await shareViaWebShare(project, records);
    if (success) {
      setLastAction('share');
      toast({ title: 'Shared successfully' });
    } else {
      handleDownload();
    }
  };

  const handleCopy = async () => {
    const success = await copyToClipboard(project, records);
    if (success) {
      setLastAction('copy');
      toast({ title: 'Copied to clipboard' });
    } else {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  const handleClose = (value: boolean) => {
    if (!value) {
      setLastAction(null);
    }
    onOpenChange(value);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Share Project
          </DialogTitle>
          <DialogDescription>
            Export and share your project data
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Project Summary */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <FileJson className="h-5 w-5 text-primary" />
              <h4 className="font-medium">{project.title}</h4>
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Records: {records.length}</p>
              <p>Data size: {(dataSize / 1024).toFixed(1)} KB</p>
              <p className="font-mono text-xs">ID: {project.id.slice(0, 12)}...</p>
            </div>
          </div>

          {/* Export Options */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Export & Share</p>
            
            <div className="grid gap-2">
              {webShareSupported && (
                <Button 
                  onClick={handleWebShare} 
                  variant="outline" 
                  className="w-full justify-start h-auto py-3"
                >
                  <ExternalLink className="h-5 w-5 mr-3 flex-shrink-0" />
                  <div className="text-left flex-1">
                    <p className="font-medium">Share via Apps</p>
                    <p className="text-xs text-muted-foreground">AirDrop, Nearby Share, Email, etc.</p>
                  </div>
                  {lastAction === 'share' && <CheckCircle2 className="h-4 w-4 text-green-500 ml-2" />}
                </Button>
              )}
              
              <Button 
                onClick={handleDownload} 
                variant="outline" 
                className="w-full justify-start h-auto py-3"
              >
                <Download className="h-5 w-5 mr-3 flex-shrink-0" />
                <div className="text-left flex-1">
                  <p className="font-medium">Download JSON File</p>
                  <p className="text-xs text-muted-foreground">Save to your device</p>
                </div>
                {lastAction === 'download' && <CheckCircle2 className="h-4 w-4 text-green-500 ml-2" />}
              </Button>
              
              <Button 
                onClick={handleCopy} 
                variant="outline" 
                className="w-full justify-start h-auto py-3"
              >
                <Copy className="h-5 w-5 mr-3 flex-shrink-0" />
                <div className="text-left flex-1">
                  <p className="font-medium">Copy to Clipboard</p>
                  <p className="text-xs text-muted-foreground">Paste anywhere</p>
                </div>
                {lastAction === 'copy' && <CheckCircle2 className="h-4 w-4 text-green-500 ml-2" />}
              </Button>
            </div>
          </div>

          {/* Instructions */}
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-xs font-medium mb-2">How to transfer:</p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Download or share the file</li>
              <li>Send to other device (AirDrop, email, messaging)</li>
              <li>On receiving device, open FarmDeck → Import</li>
            </ol>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
