import { useState, useMemo } from 'react';
import { FarmRecord, FarmProject } from '@/lib/db';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, Trash2, Lock, ChevronDown, MessageSquare, Save, MoreVertical, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface RecordTableProps {
  project: FarmProject;
  records: FarmRecord[];
  onAddRecord: (data: Omit<FarmRecord, 'id' | 'projectId' | 'isLocked' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateRecord: (record: FarmRecord) => void;
  onDeleteRecord: (id: string) => void;
  onLockRecord: (id: string) => void;
}

interface NewRecordState {
  date: string;
  item: string;
  produceAmount: string;
  produceRevenue: string;
  comment: string;
  customFields: Record<string, string>;
}

// Field definitions for long-press tooltips
const fieldDefinitions: Record<string, string> = {
  date: "The date when this record entry was made or when the activity occurred",
  item: "Optional: Specify the product type if your project has multiple outputs (e.g., milk, manure, beef for a cow project)",
  produce: "The quantity or amount produced/harvested in this entry",
  produceRevenue: "The income earned from selling the produce in this entry",
  comment: "Additional notes, specifications, or details about this entry",
  lock: "Check to lock this entry. Once locked, it cannot be edited or deleted",
};

// Check if Item column should show (user has added it to custom columns)
const hasItemColumn = (project: FarmProject) => project.customColumns.includes('Item');

export function RecordTable({
  project,
  records,
  onAddRecord,
  onUpdateRecord,
  onDeleteRecord,
  onLockRecord,
}: RecordTableProps) {
  const [newRecord, setNewRecord] = useState<NewRecordState>({
    date: new Date().toISOString().split('T')[0],
    item: '',
    produceAmount: '',
    produceRevenue: '',
    comment: '',
    customFields: {},
  });
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [editingRecord, setEditingRecord] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<FarmRecord>>({});

  const showItemColumn = hasItemColumn(project);
  // Filter out 'Item' from custom columns since it's handled separately
  const customColumns = project.customColumns.filter(col => col !== 'Item');

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
      item: showItemColumn ? newRecord.item.trim() : undefined,
      produceAmount: parseFloat(newRecord.produceAmount) || 0,
      produceRevenue: parseFloat(newRecord.produceRevenue) || 0,
      comment: newRecord.comment.trim(),
      customFields: customFieldsNumeric,
    });

    setNewRecord({
      date: new Date().toISOString().split('T')[0],
      item: '',
      produceAmount: '',
      produceRevenue: '',
      comment: '',
      customFields: {},
    });
  };

  const startEditing = (record: FarmRecord) => {
    if (record.isLocked) return;
    setEditingRecord(record.id);
    setEditData({ ...record });
  };

  const saveEdit = () => {
    if (editingRecord && editData) {
      onUpdateRecord(editData as FarmRecord);
      setEditingRecord(null);
      setEditData({});
    }
  };

  // Sort records by date and group by day
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

  // Get border style for a record based on its position in date group
  const getRecordBorderStyle = (record: FarmRecord, index: number) => {
    const dateGroup = recordsByDate[record.date];
    const isFirstInGroup = dateGroup[0].id === record.id;
    const isLastInGroup = dateGroup[dateGroup.length - 1].id === record.id;
    const isFirstRecord = index === 0;
    
    return cn(
      "transition-colors",
      // Green border for day groups
      isFirstInGroup && !isFirstRecord && "border-t-2 border-t-success",
      // Grey border between same-day records
      !isFirstInGroup && "border-t border-t-muted-foreground/30",
      // Locked styling
      record.isLocked && "table-row-locked opacity-80",
      editingRecord === record.id && "bg-accent/20"
    );
  };

  const colSpan = 4 + (showItemColumn ? 1 : 0) + customColumns.length;

  return (
    <TooltipProvider delayDuration={500}>
      <div className="rounded-lg border border-border bg-card shadow-card overflow-hidden">
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
                {showItemColumn && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <TableHead className="cursor-help">Item</TableHead>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[200px]">
                      <p className="text-xs">{fieldDefinitions.item}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TableHead className="text-right cursor-help">Produce</TableHead>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px]">
                    <p className="text-xs">{fieldDefinitions.produce}</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TableHead className="text-right cursor-help">Revenue</TableHead>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px]">
                    <p className="text-xs">{fieldDefinitions.produceRevenue}</p>
                  </TooltipContent>
                </Tooltip>
                {customColumns.map((col) => (
                  <TableHead key={col} className="text-right">{col}</TableHead>
                ))}
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
              {/* New Record Row */}
              <TableRow className="bg-success/5 border-l-4 border-l-success">
                <TableCell>
                  <Input
                    type="date"
                    value={newRecord.date}
                    onChange={(e) => setNewRecord({ ...newRecord, date: e.target.value })}
                    className="h-8 text-sm bg-background"
                  />
                </TableCell>
                {showItemColumn && (
                  <TableCell>
                    <Input
                      placeholder="Item..."
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
                <TableCell>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={newRecord.produceRevenue}
                    onChange={(e) => setNewRecord({ ...newRecord, produceRevenue: e.target.value })}
                    className="h-8 text-sm text-right bg-background"
                  />
                </TableCell>
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
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>

              {/* Existing Records */}
              {sortedRecords.map((record, index) => (
                <Collapsible key={record.id} asChild>
                  <>
                    <TableRow className={getRecordBorderStyle(record, index)}>
                      <TableCell className="font-mono text-sm">
                        {format(new Date(record.date), 'MMM d')}
                      </TableCell>
                      {showItemColumn && (
                        <TableCell className="font-medium">
                          {editingRecord === record.id ? (
                            <Input
                              value={editData.item || ''}
                              onChange={(e) => setEditData({ ...editData, item: e.target.value })}
                              className="h-8 text-sm"
                            />
                          ) : (
                            <span className="cursor-pointer hover:text-primary" onClick={() => startEditing(record)}>
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
                          <span className="cursor-pointer hover:text-primary" onClick={() => startEditing(record)}>
                            {record.produceAmount.toLocaleString()}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-success">
                        {editingRecord === record.id ? (
                          <Input
                            type="number"
                            value={editData.produceRevenue || ''}
                            onChange={(e) => setEditData({ ...editData, produceRevenue: parseFloat(e.target.value) || 0 })}
                            className="h-8 text-sm text-right"
                          />
                        ) : (
                          `+${(record.produceRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                        )}
                      </TableCell>
                      {customColumns.map((col) => (
                        <TableCell key={col} className="text-right tabular-nums">
                          {record.customFields[col] || '-'}
                        </TableCell>
                      ))}
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
                            !record.isLocked && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
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
              ))}

              {records.length === 0 && (
                <TableRow>
                  <TableCell colSpan={colSpan + 2} className="h-24 text-center text-muted-foreground">
                    No records yet. Add your first entry above.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </TooltipProvider>
  );
}
