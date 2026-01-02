import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Settings2, Plus, Check, X, Type, Hash, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ColumnType = 'text' | 'number' | 'cash_inflow' | 'cash_outflow';

export interface CustomColumn {
  name: string;
  type: ColumnType;
}

interface ColumnManagerDropdownProps {
  columns: string[];
  customColumnTypes?: Record<string, ColumnType>;
  onAddColumn: (column: CustomColumn) => void;
  onRemoveColumn: (columnName: string) => void;
  disabled?: boolean;
}

// Pre-provided column options
const preProvidedColumns: CustomColumn[] = [
  { name: 'Item', type: 'text' },
  { name: 'Weather', type: 'text' },
  { name: 'Workers', type: 'number' },
  { name: 'Labour Cost', type: 'cash_outflow' },
  { name: 'Transport Cost', type: 'cash_outflow' },
  { name: 'Other Income', type: 'cash_inflow' },
  { name: 'Quantity', type: 'number' },
  { name: 'Unit Price', type: 'number' },
];

const columnTypeLabels: Record<ColumnType, { label: string; icon: typeof Type; description: string }> = {
  text: { label: 'Text', icon: Type, description: 'Words or descriptions' },
  number: { label: 'Number', icon: Hash, description: 'Numeric values' },
  cash_inflow: { label: 'Cash Inflow (+)', icon: DollarSign, description: 'Income/revenue to add' },
  cash_outflow: { label: 'Cash Outflow (-)', icon: DollarSign, description: 'Expenses to subtract' },
};

export function ColumnManagerDropdown({
  columns,
  customColumnTypes = {},
  onAddColumn,
  onRemoveColumn,
  disabled = false,
}: ColumnManagerDropdownProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnType, setNewColumnType] = useState<ColumnType>('text');

  const handleAddPreProvided = (column: CustomColumn) => {
    if (!columns.includes(column.name)) {
      onAddColumn(column);
    }
  };

  const handleCreateCustom = () => {
    if (newColumnName.trim() && !columns.includes(newColumnName.trim())) {
      onAddColumn({ name: newColumnName.trim(), type: newColumnType });
      setNewColumnName('');
      setNewColumnType('text');
      setIsCreateDialogOpen(false);
    }
  };

  const getColumnTypeIcon = (columnName: string) => {
    const type = customColumnTypes[columnName] || 'text';
    const TypeIcon = columnTypeLabels[type].icon;
    return <TypeIcon className={cn(
      "h-3 w-3",
      type === 'cash_inflow' && "text-success",
      type === 'cash_outflow' && "text-destructive"
    )} />;
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={disabled} className="gap-2">
            <Settings2 className="h-4 w-4" />
            Columns
            {columns.length > 0 && (
              <span className="ml-1 bg-primary/20 text-primary px-1.5 py-0.5 rounded-full text-xs">
                {columns.length}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 bg-popover">
          <DropdownMenuLabel>Manage Columns</DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          {/* Pre-provided columns */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Plus className="h-4 w-4 mr-2" />
              Add Pre-defined Column
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="bg-popover">
              {preProvidedColumns.map((col) => {
                const isAdded = columns.includes(col.name);
                const TypeIcon = columnTypeLabels[col.type].icon;
                return (
                  <DropdownMenuItem
                    key={col.name}
                    onClick={() => !isAdded && handleAddPreProvided(col)}
                    disabled={isAdded}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <TypeIcon className={cn(
                        "h-4 w-4",
                        col.type === 'cash_inflow' && "text-success",
                        col.type === 'cash_outflow' && "text-destructive"
                      )} />
                      <span>{col.name}</span>
                    </div>
                    {isAdded && <Check className="h-4 w-4 text-success" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          
          <DropdownMenuItem onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Custom Column
          </DropdownMenuItem>
          
          {columns.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">Active Columns</DropdownMenuLabel>
              {columns.map((col) => (
                <DropdownMenuItem
                  key={col}
                  className="flex items-center justify-between"
                  onSelect={(e) => e.preventDefault()}
                >
                  <div className="flex items-center gap-2">
                    {getColumnTypeIcon(col)}
                    <span>{col}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemoveColumn(col)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create Custom Column Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">Create Custom Column</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="columnName">Column Name</Label>
              <Input
                id="columnName"
                placeholder="e.g., Fertilizer Used"
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                className="bg-background"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="columnType">Column Type</Label>
              <Select value={newColumnType} onValueChange={(v) => setNewColumnType(v as ColumnType)}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  {Object.entries(columnTypeLabels).map(([type, { label, icon: Icon, description }]) => (
                    <SelectItem key={type} value={type}>
                      <div className="flex items-center gap-2">
                        <Icon className={cn(
                          "h-4 w-4",
                          type === 'cash_inflow' && "text-success",
                          type === 'cash_outflow' && "text-destructive"
                        )} />
                        <div>
                          <span>{label}</span>
                          <span className="text-xs text-muted-foreground ml-2">- {description}</span>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
              <p><strong>Type Info:</strong></p>
              <ul className="mt-1 space-y-1 text-xs">
                <li>• <strong>Text:</strong> For words/descriptions (not calculated)</li>
                <li>• <strong>Number:</strong> For quantities (not calculated in P/L)</li>
                <li>• <strong>Cash Inflow:</strong> Added to revenue in calculations</li>
                <li>• <strong>Cash Outflow:</strong> Subtracted as costs in calculations</li>
              </ul>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="hero" 
              onClick={handleCreateCustom} 
              disabled={!newColumnName.trim() || columns.includes(newColumnName.trim())}
            >
              Add Column
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
