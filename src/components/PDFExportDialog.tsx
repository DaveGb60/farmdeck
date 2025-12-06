import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FarmProject, FarmRecord, MonthlyAggregation } from '@/lib/db';
import { generateProjectPDF } from '@/lib/pdfExport';
import { FileText, Calendar, Download } from 'lucide-react';
import { format, parse } from 'date-fns';
import { cn } from '@/lib/utils';

interface PDFExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: FarmProject;
  records: FarmRecord[];
  aggregations: MonthlyAggregation[];
}

export function PDFExportDialog({
  open,
  onOpenChange,
  project,
  records,
  aggregations,
}: PDFExportDialogProps) {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (type: 'monthly' | 'full') => {
    setIsExporting(true);
    try {
      generateProjectPDF({
        project,
        records,
        aggregations,
        type,
        selectedMonth: type === 'monthly' ? selectedMonth || undefined : undefined,
      });
      onOpenChange(false);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Export PDF Statement
          </DialogTitle>
          <DialogDescription>
            Download a professionally formatted PDF report for {project.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Full Report Option */}
          <button
            onClick={() => handleExport('full')}
            disabled={isExporting}
            className="w-full p-4 rounded-lg border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left group"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <FileText className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold">Full Project Report</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Complete report with all records and monthly summaries
                </p>
                <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                  <span>{records.length} records</span>
                  <span>•</span>
                  <span>{aggregations.length} months</span>
                </div>
              </div>
              <Download className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </button>

          {/* Monthly Statement Options */}
          {aggregations.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Monthly Statements
              </h4>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {aggregations.map((agg) => {
                  const monthDate = parse(agg.month, 'yyyy-MM', new Date());
                  const isSelected = selectedMonth === agg.month;
                  
                  return (
                    <button
                      key={agg.month}
                      onClick={() => setSelectedMonth(isSelected ? null : agg.month)}
                      className={cn(
                        "p-3 rounded-lg border text-left transition-all",
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <p className="font-medium text-sm">
                        {format(monthDate, 'MMMM yyyy')}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {agg.recordCount} records
                      </p>
                      <p className={cn(
                        "text-xs font-semibold mt-1",
                        agg.netProfit >= 0 ? "text-success" : "text-destructive"
                      )}>
                        Net: {agg.netProfit >= 0 ? '+' : ''}{agg.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                    </button>
                  );
                })}
              </div>
              
              {selectedMonth && (
                <Button
                  onClick={() => handleExport('monthly')}
                  disabled={isExporting}
                  className="w-full"
                  variant="hero"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download {format(parse(selectedMonth, 'yyyy-MM', new Date()), 'MMMM yyyy')} Statement
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
