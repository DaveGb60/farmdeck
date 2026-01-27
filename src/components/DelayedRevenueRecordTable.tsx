import { useState, useMemo } from 'react';
import { FarmRecord, FarmProject, generateId } from '@/lib/db';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Lock, ChevronDown, MessageSquare, Save, MoreVertical, Pencil, DollarSign, Hash, Type, ShoppingCart, Package } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { ColumnType } from '@/components/ColumnManagerDropdown';

interface DelayedRevenueRecordTableProps {
  project: FarmProject;
  records: FarmRecord[];
  onAddRecord: (data: Omit<FarmRecord, 'id' | 'projectId' | 'isLocked' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateRecord: (record: FarmRecord) => void;
  onDeleteRecord: (id: string) => void;
  onLockRecord: (id: string) => void;
  onBatchSale: (saleData: {
    date: string;
    soldQuantity: number;
    revenue: number;
    sourceRecords: FarmRecord[];
    comment?: string;
  }) => void;
  customColumnTypes?: Record<string, ColumnType>;
}

interface NewRecordState {
  date: string;
  item: string;
  produceAmount: string;
  comment: string;
  customFields: Record<string, string>;
}

interface BatchSaleState {
  isOpen: boolean;
  date: string;
  soldQuantity: string;
  revenue: string;
  comment: string;
}

// Field definitions for long-press tooltips
const fieldDefinitions: Record<string, string> = {
  date: "The date when this record entry was made or when the activity occurred",
  itemType: "Specify the product type for projects with multiple outputs (e.g., eggs, milk, vegetables)",
  quantity: "The quantity produced/collected. Revenue is recorded separately when sold.",
  available: "Quantity still available for sale from this record",
  status: "Collection = awaiting sale, Sold = revenue recorded, Carried = unsold balance from batch",
  comment: "Additional notes, specifications, or details about this entry",
  lock: "Check to lock this entry. Once locked, it cannot be edited or deleted",
};

// Check if Item Type column should show
const hasItemTypeColumn = (project: FarmProject) => project.customColumns.includes('Item Type');

export function DelayedRevenueRecordTable({
  project,
  records,
  onAddRecord,
  onUpdateRecord,
  onDeleteRecord,
  onLockRecord,
  onBatchSale,
  customColumnTypes = {},
}: DelayedRevenueRecordTableProps) {
  const [newRecord, setNewRecord] = useState<NewRecordState>({
    date: new Date().toISOString().split('T')[0],
    item: '',
    produceAmount: '',
    comment: '',
    customFields: {},
  });
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [editingRecord, setEditingRecord] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<FarmRecord>>({});
  const [batchSale, setBatchSale] = useState<BatchSaleState>({
    isOpen: false,
    date: new Date().toISOString().split('T')[0],
    soldQuantity: '',
    revenue: '',
    comment: '',
  });

  const showItemTypeColumn = hasItemTypeColumn(project);
  const customColumns = project.customColumns.filter(col => col !== 'Item Type');

  // Get available records for batch sale (not fully sold, not locked as batch sale)
  const availableForSale = useMemo(() => {
    return records.filter(r => {
      // Skip batch sale records (they represent sales, not inventory)
      if (r.isBatchSale) return false;
      // Skip locked records - cannot modify their inventory
      if (r.isLocked) return false;
      // Get available quantity
      const available = r.availableQuantity ?? r.produceAmount;
      return available > 0;
    });
  }, [records]);

  // Calculate total available for sale from ALL available records (auto-calculate)
  const totalAvailableForSale = useMemo(() => {
    return availableForSale.reduce((sum, record) => {
      return sum + (record.availableQuantity ?? record.produceAmount);
    }, 0);
  }, [availableForSale]);

  const toggleComment = (id: string) => {
    const newExpanded = new Set(expandedComments);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedComments(newExpanded);
  };

  const handleAddRecord = () => {
    const customFieldsNumeric: Record<string, string | number> = {};
    for (const key in newRecord.customFields) {
      const val = newRecord.customFields[key];
      customFieldsNumeric[key] = isNaN(Number(val)) ? val : Number(val);
    }

    onAddRecord({
      date: newRecord.date,
      item: showItemTypeColumn ? newRecord.item.trim() : undefined,
      produceAmount: parseFloat(newRecord.produceAmount) || 0,
      produceRevenue: 0, // No revenue on collection, revenue comes from batch sale
      comment: newRecord.comment.trim(),
      customFields: customFieldsNumeric,
      availableQuantity: parseFloat(newRecord.produceAmount) || 0, // Initially all available
    });

    setNewRecord({
      date: new Date().toISOString().split('T')[0],
      item: '',
      produceAmount: '',
      comment: '',
      customFields: {},
    });
  };

  const startEditing = (record: FarmRecord) => {
    if (record.isLocked || record.isBatchSale || record.isCarriedBalance) return;
    setEditingRecord(record.id);
    setEditData({ ...record });
  };

  const saveEdit = () => {
    if (editingRecord && editData) {
      // Update available quantity if produce amount changed
      const updatedRecord = { ...editData } as FarmRecord;
      const originalRecord = records.find(r => r.id === editingRecord);
      if (originalRecord) {
        const originalAmount = originalRecord.produceAmount;
        const newAmount = updatedRecord.produceAmount;
        const usedAmount = originalAmount - (originalRecord.availableQuantity ?? originalAmount);
        updatedRecord.availableQuantity = Math.max(0, newAmount - usedAmount);
      }
      onUpdateRecord(updatedRecord);
      setEditingRecord(null);
      setEditData({});
    }
  };

  const handleOpenBatchSale = () => {
    setBatchSale({
      isOpen: true,
      date: new Date().toISOString().split('T')[0],
      soldQuantity: '',
      revenue: '',
      comment: '',
    });
  };

  const handleConfirmBatchSale = () => {
    const soldQty = parseFloat(batchSale.soldQuantity) || 0;
    const revenue = parseFloat(batchSale.revenue) || 0;

    if (soldQty <= 0 || revenue <= 0 || availableForSale.length === 0) {
      return;
    }

    if (soldQty > totalAvailableForSale) {
      return;
    }

    // Use ALL available records as source (auto-select)
    onBatchSale({
      date: batchSale.date,
      soldQuantity: soldQty,
      revenue,
      sourceRecords: availableForSale,
      comment: batchSale.comment.trim(),
    });

    setBatchSale({
      isOpen: false,
      date: new Date().toISOString().split('T')[0],
      soldQuantity: '',
      revenue: '',
      comment: '',
    });
  };

  // Sort records by date
  const sortedRecords = useMemo(() => {
    return [...records].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [records]);

  // Group records by date for border styling
  const recordsByDate = useMemo(() => {
    const groups: Record<string, FarmRecord[]> = {};
    sortedRecords.forEach(record => {
      if (!groups[record.date]) {
        groups[record.date] = [];
      }
      groups[record.date].push(record);
    });
    return groups;
  }, [sortedRecords]);

  const getRecordBorderStyle = (record: FarmRecord, index: number) => {
    const dateGroup = recordsByDate[record.date];
    const isFirstInGroup = dateGroup[0].id === record.id;
    const isFirstRecord = index === 0;
    
    return cn(
      "transition-colors",
      isFirstInGroup && !isFirstRecord && "border-t-2 border-t-success",
      !isFirstInGroup && "border-t border-t-muted-foreground/30",
      record.isLocked && "table-row-locked opacity-80",
      record.isBatchSale && "bg-success/10",
      record.isCarriedBalance && "bg-warning/10",
      editingRecord === record.id && "bg-accent/20"
    );
  };

  const getRecordStatus = (record: FarmRecord) => {
    if (record.isBatchSale) {
      return { label: 'Sale', variant: 'default' as const, icon: DollarSign };
    }
    if (record.isCarriedBalance) {
      return { label: 'Carried', variant: 'secondary' as const, icon: Package };
    }
    const available = record.availableQuantity ?? record.produceAmount;
    if (available <= 0) {
      return { label: 'Sold', variant: 'outline' as const, icon: ShoppingCart };
    }
    return { label: 'Stock', variant: 'secondary' as const, icon: Package };
  };

  const colSpan = 5 + (showItemTypeColumn ? 1 : 0) + customColumns.length;

  return (
    <TooltipProvider delayDuration={500}>
      <div className="rounded-lg border border-border bg-card shadow-card overflow-hidden">
        {/* Batch Sale Action Bar */}
        <div className="p-3 border-b border-border bg-muted/30 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {availableForSale.length} record(s) with stock available
            </span>
          </div>
          <Button
            variant="success"
            size="sm"
            onClick={handleOpenBatchSale}
            disabled={availableForSale.length === 0 || project.isCompleted}
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            Record Batch Sale
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TableHead className="w-[100px] cursor-help">Date</TableHead>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px]">
                    <p className="text-xs">{fieldDefinitions.date}</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TableHead className="w-[80px] cursor-help">Status</TableHead>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px]">
                    <p className="text-xs">{fieldDefinitions.status}</p>
                  </TooltipContent>
                </Tooltip>
                {showItemTypeColumn && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <TableHead className="cursor-help">Item Type</TableHead>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[250px]">
                      <p className="text-xs">{fieldDefinitions.itemType}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TableHead className="text-right cursor-help">Qty Collected</TableHead>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px]">
                    <p className="text-xs">{fieldDefinitions.quantity}</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TableHead className="text-right cursor-help">Available</TableHead>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px]">
                    <p className="text-xs">{fieldDefinitions.available}</p>
                  </TooltipContent>
                </Tooltip>
                <TableHead className="text-right">Revenue</TableHead>
                {customColumns.map((col) => {
                  const colType = customColumnTypes[col] || 'text';
                  const isCashInflow = colType === 'cash_inflow';
                  const isCashOutflow = colType === 'cash_outflow';
                  return (
                    <TableHead key={col} className="text-right">
                      <span className="flex items-center justify-end gap-1">
                        {isCashInflow && <DollarSign className="h-3 w-3 text-success" />}
                        {isCashOutflow && <DollarSign className="h-3 w-3 text-destructive" />}
                        {colType === 'number' && <Hash className="h-3 w-3 text-muted-foreground" />}
                        {colType === 'text' && <Type className="h-3 w-3 text-muted-foreground" />}
                        {col}
                      </span>
                    </TableHead>
                  );
                })}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TableHead className="w-[50px] cursor-help">Comment</TableHead>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px]">
                    <p className="text-xs">{fieldDefinitions.comment}</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TableHead className="w-[100px] text-center cursor-help">Lock</TableHead>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px]">
                    <p className="text-xs">{fieldDefinitions.lock}</p>
                  </TooltipContent>
                </Tooltip>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* New Collection Record Row */}
              <TableRow className="bg-success/5 border-l-4 border-l-success">
                <TableCell>
                  <Input
                    type="date"
                    value={newRecord.date}
                    onChange={(e) => setNewRecord({ ...newRecord, date: e.target.value })}
                    className="h-8 text-sm bg-background"
                  />
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-xs">
                    <Package className="h-3 w-3 mr-1" />
                    New
                  </Badge>
                </TableCell>
                {showItemTypeColumn && (
                  <TableCell>
                    <Input
                      placeholder="Item type..."
                      value={newRecord.item}
                      onChange={(e) => setNewRecord({ ...newRecord, item: e.target.value })}
                      className="h-8 text-sm bg-background"
                    />
                  </TableCell>
                )}
                <TableCell>
                  <Input
                    type="number"
                    placeholder="0"
                    value={newRecord.produceAmount}
                    onChange={(e) => setNewRecord({ ...newRecord, produceAmount: e.target.value })}
                    className="h-8 text-sm text-right bg-background"
                  />
                </TableCell>
                <TableCell className="text-right text-muted-foreground">-</TableCell>
                <TableCell className="text-right text-muted-foreground">-</TableCell>
                {customColumns.map((col) => (
                  <TableCell key={col}>
                    <Input
                      placeholder="-"
                      value={newRecord.customFields[col] || ''}
                      onChange={(e) => setNewRecord({
                        ...newRecord,
                        customFields: { ...newRecord.customFields, [col]: e.target.value }
                      })}
                      className="h-8 text-sm text-right bg-background"
                    />
                  </TableCell>
                ))}
                <TableCell>
                  <Input
                    placeholder="Comment..."
                    value={newRecord.comment}
                    onChange={(e) => setNewRecord({ ...newRecord, comment: e.target.value })}
                    className="h-8 text-sm bg-background"
                  />
                </TableCell>
                <TableCell></TableCell>
                <TableCell>
                  <Button
                    variant="success"
                    size="sm"
                    onClick={handleAddRecord}
                    className="w-full"
                    disabled={project.isCompleted}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>

              {/* Existing Records */}
              {sortedRecords.map((record, index) => {
                const status = getRecordStatus(record);
                const StatusIcon = status.icon;
                const available = record.availableQuantity ?? record.produceAmount;
                
                return (
                  <Collapsible key={record.id} asChild>
                    <>
                      <TableRow className={getRecordBorderStyle(record, index)}>
                        <TableCell className="font-mono text-sm">
                          {format(new Date(record.date), 'MMM d')}
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant} className="text-xs">
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {status.label}
                          </Badge>
                        </TableCell>
                        {showItemTypeColumn && (
                          <TableCell className="font-medium">
                            {editingRecord === record.id ? (
                              <Input
                                value={editData.item || ''}
                                onChange={(e) => setEditData({ ...editData, item: e.target.value })}
                                className="h-8 text-sm"
                              />
                            ) : (
                              <span 
                                className={cn(!record.isBatchSale && !record.isCarriedBalance && "cursor-pointer hover:text-primary")} 
                                onClick={() => startEditing(record)}
                              >
                                {record.item || '-'}
                              </span>
                            )}
                          </TableCell>
                        )}
                        <TableCell className="text-right tabular-nums">
                          {editingRecord === record.id ? (
                            <Input
                              type="number"
                              value={editData.produceAmount || ''}
                              onChange={(e) => setEditData({ ...editData, produceAmount: parseFloat(e.target.value) || 0 })}
                              className="h-8 text-sm text-right"
                            />
                          ) : (
                            <span 
                              className={cn(!record.isBatchSale && !record.isCarriedBalance && "cursor-pointer hover:text-primary")} 
                              onClick={() => startEditing(record)}
                            >
                              {record.isBatchSale ? (
                                <span className="text-muted-foreground">({record.soldQuantity?.toLocaleString() || 0} sold)</span>
                              ) : (
                                record.produceAmount.toLocaleString()
                              )}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {record.isBatchSale ? (
                            <span className="text-muted-foreground">-</span>
                          ) : (
                            <span className={cn(available > 0 ? "text-warning" : "text-muted-foreground")}>
                              {available.toLocaleString()}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-success">
                          {record.isBatchSale ? (
                            `+${(record.produceRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        {customColumns.map((col) => {
                          const colType = customColumnTypes[col] || 'text';
                          const value = record.customFields[col];
                          const isCashInflow = colType === 'cash_inflow';
                          const isCashOutflow = colType === 'cash_outflow';
                          const numValue = typeof value === 'number' ? value : parseFloat(value as string) || 0;
                          
                          return (
                            <TableCell 
                              key={col} 
                              className={cn(
                                "text-right tabular-nums",
                                isCashInflow && "text-success",
                                isCashOutflow && "text-destructive"
                              )}
                            >
                              {value === undefined || value === '' || value === null ? '-' : (
                                isCashInflow ? `+${numValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}` :
                                isCashOutflow ? `-${numValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}` :
                                colType === 'number' ? numValue.toLocaleString() :
                                String(value)
                              )}
                            </TableCell>
                          );
                        })}
                        <TableCell>
                          {record.comment && (
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleComment(record.id)}>
                                <MessageSquare className={cn("h-4 w-4", expandedComments.has(record.id) && "text-primary")} />
                              </Button>
                            </CollapsibleTrigger>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {record.isLocked ? (
                            <Lock className="h-4 w-4 mx-auto text-locked" />
                          ) : (
                            <Checkbox
                              checked={false}
                              onCheckedChange={() => onLockRecord(record.id)}
                              className="mx-auto"
                              disabled={project.isCompleted}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {editingRecord === record.id ? (
                              <Button variant="success" size="icon" className="h-7 w-7" onClick={saveEdit}>
                                <Save className="h-4 w-4" />
                              </Button>
                            ) : (
                              !record.isLocked && !record.isBatchSale && !record.isCarriedBalance && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7">
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="bg-popover z-50">
                                    <DropdownMenuItem onClick={() => startEditing(record)}>
                                      <Pencil className="h-4 w-4 mr-2" />
                                      Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      onClick={() => onDeleteRecord(record.id)}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {record.comment && (
                        <CollapsibleContent asChild>
                          <TableRow className="bg-muted/30">
                            <TableCell colSpan={colSpan + 2} className="py-2 px-4">
                              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                                <ChevronDown className="h-4 w-4 mt-0.5 shrink-0" />
                                <p>{record.comment}</p>
                              </div>
                            </TableCell>
                          </TableRow>
                        </CollapsibleContent>
                      )}
                    </>
                  </Collapsible>
                );
              })}

              {records.length === 0 && (
                <TableRow>
                  <TableCell colSpan={colSpan + 2} className="h-24 text-center text-muted-foreground">
                    No records yet. Add your first collection entry above.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Batch Sale Dialog */}
      <Dialog open={batchSale.isOpen} onOpenChange={(open) => setBatchSale({ ...batchSale, isOpen: open })}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Record Batch Sale
            </DialogTitle>
            <DialogDescription>
              Enter quantity sold and revenue. The system will automatically deduct from all available stock. Unsold quantities will be carried forward.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Date */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Sale Date</label>
              <Input
                type="date"
                value={batchSale.date}
                onChange={(e) => setBatchSale({ ...batchSale, date: e.target.value })}
              />
            </div>

            {/* Available Stock Summary */}
            <div className="p-3 bg-muted/50 rounded-lg space-y-2">
              <label className="text-sm font-medium">Available Stock</label>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  From {availableForSale.length} record(s)
                </span>
                <span className="text-lg font-bold text-primary">
                  {totalAvailableForSale.toLocaleString()} units
                </span>
              </div>
            </div>

            {/* Quantity Sold */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Quantity Sold</label>
              <Input
                type="number"
                placeholder="Enter quantity sold"
                value={batchSale.soldQuantity}
                onChange={(e) => setBatchSale({ ...batchSale, soldQuantity: e.target.value })}
              />
              {parseFloat(batchSale.soldQuantity) > totalAvailableForSale && (
                <p className="text-xs text-destructive">
                  Cannot sell more than available ({totalAvailableForSale.toLocaleString()})
                </p>
              )}
              {parseFloat(batchSale.soldQuantity) < totalAvailableForSale && parseFloat(batchSale.soldQuantity) > 0 && (
                <p className="text-xs text-warning">
                  Remainder of {(totalAvailableForSale - parseFloat(batchSale.soldQuantity)).toLocaleString()} will be carried forward
                </p>
              )}
            </div>

            {/* Revenue */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Revenue from Sale</label>
              <Input
                type="number"
                placeholder="Enter total revenue"
                value={batchSale.revenue}
                onChange={(e) => setBatchSale({ ...batchSale, revenue: e.target.value })}
              />
            </div>

            {/* Comment */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Comment (optional)</label>
              <Input
                placeholder="Sale notes..."
                value={batchSale.comment}
                onChange={(e) => setBatchSale({ ...batchSale, comment: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchSale({ ...batchSale, isOpen: false })}>
              Cancel
            </Button>
            <Button 
              variant="success"
              onClick={handleConfirmBatchSale}
              disabled={
                availableForSale.length === 0 ||
                parseFloat(batchSale.soldQuantity) <= 0 ||
                parseFloat(batchSale.revenue) <= 0 ||
                parseFloat(batchSale.soldQuantity) > totalAvailableForSale
              }
            >
              Confirm Sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
