import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FarmProject, FarmRecord } from '@/lib/db';
import { Copy, Check, Download, QrCode } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface QRShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: FarmProject;
  records: FarmRecord[];
}

export function QRShareDialog({ open, onOpenChange, project, records }: QRShareDialogProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  // Create full export data (includes all records for proper syncing)
  const fullExportData = {
    type: 'farmdeck_full_export',
    version: 1,
    exportedAt: new Date().toISOString(),
    project: project,
    records: records,
  };

  // For QR code, we need to be smart about size limits (~2KB max for reliable scanning)
  // Include full project data and as many records as possible
  const createQRData = () => {
    const baseData = {
      type: 'farmdeck_full_export',
      version: 1,
      exportedAt: new Date().toISOString(),
      project: project,
      records: records,
    };
    
    let qrString = JSON.stringify(baseData);
    
    // If data is too large for QR, progressively reduce records
    if (qrString.length > 2000) {
      // Try with minimal record data (just essential fields)
      const minimalRecords = records.map(r => ({
        id: r.id,
        projectId: r.projectId,
        date: r.date,
        item: r.item,
        produceAmount: r.produceAmount,
        inputCost: r.inputCost,
        revenue: r.revenue,
        comment: r.comment || '',
        isLocked: r.isLocked,
        lockedAt: r.lockedAt,
        customFields: r.customFields,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
      
      baseData.records = minimalRecords;
      qrString = JSON.stringify(baseData);
      
      // If still too large, include fewer records with a warning
      if (qrString.length > 2000) {
        const maxRecords = Math.floor(records.length * (2000 / qrString.length));
        baseData.records = minimalRecords.slice(0, Math.max(1, maxRecords));
        qrString = JSON.stringify(baseData);
      }
    }
    
    return { data: baseData, jsonString: qrString, includedRecords: baseData.records.length };
  };

  const qrResult = createQRData();
  const qrData = qrResult.jsonString;
  const qrIncludedRecords = qrResult.includedRecords;
  const fullDataString = JSON.stringify(fullExportData, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullDataString);
      setCopied(true);
      toast({ title: 'Project data copied to clipboard' });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  };

  const handleDownload = () => {
    const blob = new Blob([fullDataString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `farmdeck-${project.title.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: 'Project exported successfully' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            Share Project
          </DialogTitle>
          <DialogDescription>
            Share "{project.title}" with another device
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="qr" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="qr">QR Code</TabsTrigger>
            <TabsTrigger value="export">Export Data</TabsTrigger>
          </TabsList>

          <TabsContent value="qr" className="space-y-4">
            <div className="flex flex-col items-center py-6">
              <div className="p-4 bg-background rounded-xl shadow-soft">
                <QRCodeSVG
                  value={qrData}
                  size={200}
                  level="M"
                  includeMargin
                  bgColor="hsl(42, 33%, 96%)"
                  fgColor="hsl(150, 40%, 30%)"
                />
              </div>
              <p className="text-sm text-muted-foreground mt-4 text-center">
                Scan this QR code with another FarmDeck device to sync this project
              </p>
              {qrIncludedRecords < records.length && (
                <p className="text-xs text-amber-600 mt-2 text-center">
                  ⚠️ QR includes {qrIncludedRecords}/{records.length} records. Use Export Data tab for full sync.
                </p>
              )}
            </div>

            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Records:</span>
                <span className="font-medium">{records.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Locked:</span>
                <span className="font-medium">{records.filter(r => r.isLocked).length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Project ID:</span>
                <span className="font-mono text-xs">{project.id.slice(0, 12)}...</span>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="export" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Export all project data including records for backup or sharing via other methods.
            </p>
            
            <div className="flex flex-col gap-2">
              <Button variant="outline" onClick={handleCopy} className="w-full">
                {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                {copied ? 'Copied!' : 'Copy to Clipboard'}
              </Button>
              <Button variant="default" onClick={handleDownload} className="w-full">
                <Download className="h-4 w-4 mr-2" />
                Download JSON File
              </Button>
            </div>

            <div className="bg-muted/50 rounded-lg p-3 text-xs font-mono max-h-32 overflow-auto">
              <pre className="text-muted-foreground whitespace-pre-wrap break-all">
                {JSON.stringify({ project: project.title, records: records.length }, null, 2)}
              </pre>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
