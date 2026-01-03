import { useState, useRef, useCallback } from 'react';
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
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Settings2, Plus, Check, X, Type, Hash, DollarSign, Info, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ColumnType } from '@/lib/db';

export type { ColumnType } from '@/lib/db';

export interface CustomColumn {
  name: string;
  type: ColumnType;
}

interface ColumnManagerDropdownProps {
  columns: string[];
  customColumnTypes?: Record<string, ColumnType>;
  onAddColumn: (column: CustomColumn) => void;
  onRemoveColumn: (columnName: string) => void;
  onReorderColumns?: (newColumns: string[]) => void;
  disabled?: boolean;
}

// Sortable column item component
interface SortableColumnItemProps {
  id: string;
  columnName: string;
  typeIcon: React.ReactNode;
  onRemove: () => void;
}

function SortableColumnItem({ id, columnName, typeIcon, onRemove }: SortableColumnItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center justify-between px-2 py-1.5 rounded-md",
        isDragging && "opacity-50 bg-accent"
      )}
    >
      <div className="flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none p-0.5 hover:bg-muted rounded"
        >
          <GripVertical className="h-3 w-3 text-muted-foreground" />
        </button>
        {typeIcon}
        <span className="text-sm">{columnName}</span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

// Pre-provided column options with descriptions for long-press
const preProvidedColumns: { column: CustomColumn; description: string }[] = [
  { 
    column: { name: 'Item Type', type: 'text' }, 
    description: 'Specify the product type for projects with multiple outputs (e.g., milk, beef, manure, calves in dairy farming)' 
  },
  { 
    column: { name: 'Weather', type: 'text' }, 
    description: 'Record weather conditions that may affect production (e.g., sunny, rainy, cold)' 
  },
  { 
    column: { name: 'Workers', type: 'number' }, 
    description: 'Number of workers involved in the activity for this record' 
  },
  { 
    column: { name: 'Labour Cost', type: 'cash_outflow' }, 
    description: 'Cost of labor for this record. Subtracts from the record\'s net revenue before project calculations' 
  },
  { 
    column: { name: 'Transport Cost', type: 'cash_outflow' }, 
    description: 'Transportation expenses for this record. Subtracts from the record\'s net revenue before project calculations' 
  },
  { 
    column: { name: 'Other Income', type: 'cash_inflow' }, 
    description: 'Additional income for this record (tips, bonuses, etc.). Adds to the record\'s net revenue before project calculations' 
  },
  { 
    column: { name: 'Unit Price', type: 'number' }, 
    description: 'Price per unit of produce for reference calculations' 
  },
];

// Column type descriptions for long-press tooltips
const columnTypeDescriptions: Record<ColumnType, string> = {
  text: 'Text fields store words or descriptions and are not included in calculations',
  number: 'Number fields store numeric values for tracking but are not included in P/L calculations',
  cash_inflow: 'Cash inflow values are added to the record\'s revenue before forwarding to project calculations',
  cash_outflow: 'Cash outflow values are subtracted from the record\'s revenue before forwarding to project calculations',
};

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
  onReorderColumns,
  disabled = false,
}: ColumnManagerDropdownProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnType, setNewColumnType] = useState<ColumnType>('text');
  const [descriptionDialog, setDescriptionDialog] = useState<{ title: string; description: string } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = columns.indexOf(active.id as string);
      const newIndex = columns.indexOf(over.id as string);
      const newOrder = arrayMove(columns, oldIndex, newIndex);
      onReorderColumns?.(newOrder);
    }
  };

  const handleLongPressStart = useCallback((title: string, description: string) => {
    longPressTimer.current = setTimeout(() => {
      setDescriptionDialog({ title, description });
    }, 500); // 500ms long press
  }, []);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

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
            <DropdownMenuSubContent className="bg-popover w-64">
              <p className="px-2 py-1 text-xs text-muted-foreground">Long-press for description</p>
              {preProvidedColumns.map(({ column: col, description }) => {
                const isAdded = columns.includes(col.name);
                const TypeIcon = columnTypeLabels[col.type].icon;
                return (
                  <DropdownMenuItem
                    key={col.name}
                    onClick={() => !isAdded && handleAddPreProvided(col)}
                    disabled={isAdded}
                    className="flex items-center justify-between cursor-pointer"
                    onMouseDown={() => handleLongPressStart(col.name, description)}
                    onMouseUp={handleLongPressEnd}
                    onMouseLeave={handleLongPressEnd}
                    onTouchStart={() => handleLongPressStart(col.name, description)}
                    onTouchEnd={handleLongPressEnd}
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
              <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center gap-2">
                Active Columns
                <span className="text-[10px] font-normal">(drag to reorder)</span>
              </DropdownMenuLabel>
              <div className="px-1">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={columns} strategy={verticalListSortingStrategy}>
                    {columns.map((col) => (
                      <SortableColumnItem
                        key={col}
                        id={col}
                        columnName={col}
                        typeIcon={getColumnTypeIcon(col)}
                        onRemove={() => onRemoveColumn(col)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
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

      {/* Description Dialog for Long Press */}
      <Dialog open={!!descriptionDialog} onOpenChange={() => setDescriptionDialog(null)}>
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />
              {descriptionDialog?.title}
            </DialogTitle>
            <DialogDescription className="pt-2">
              {descriptionDialog?.description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDescriptionDialog(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
