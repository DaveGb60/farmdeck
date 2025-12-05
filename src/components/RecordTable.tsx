import { useState } from 'react';
import { FarmRecord, FarmProject } from '@/lib/db';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, Trash2, Lock, ChevronDown, MessageSquare, Save } from 'lucide-react';
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
  inputCost: string;
  revenue: string;
  comment: string;
  customFields: Record<string, string>;
}

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
    inputCost: '',
    revenue: '',
    comment: '',
    customFields: {},
  });
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [editingRecord, setEditingRecord] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<FarmRecord>>({});

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
    if (!newRecord.item.trim()) return;
    
    const customFieldsNumeric: Record<string, string | number> = {};
    for (const key in newRecord.customFields) {
      const val = newRecord.customFields[key];
      customFieldsNumeric[key] = isNaN(Number(val)) ? val : Number(val);
    }

    onAddRecord({
      date: newRecord.date,
      item: newRecord.item.trim(),
      produceAmount: parseFloat(newRecord.produceAmount) || 0,
      inputCost: parseFloat(newRecord.inputCost) || 0,
      revenue: parseFloat(newRecord.revenue) || 0,
      comment: newRecord.comment.trim(),
      customFields: customFieldsNumeric,
    });

    setNewRecord({
      date: new Date().toISOString().split('T')[0],
      item: '',
      produceAmount: '',
      inputCost: '',
      revenue: '',
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

  const sortedRecords = [...records].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="rounded-lg border border-border bg-card shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[100px]">Date</TableHead>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Produce</TableHead>
              <TableHead className="text-right">Input Cost</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              {project.customColumns.map((col) => (
                <TableHead key={col} className="text-right">{col}</TableHead>
              ))}
              <TableHead className="w-[50px]">Note</TableHead>
              <TableHead className="w-[100px] text-center">Lock</TableHead>
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
              <TableCell>
                <Input
                  placeholder="Item name..."
                  value={newRecord.item}
                  onChange={(e) => setNewRecord({ ...newRecord, item: e.target.value })}
                  className="h-8 text-sm bg-background"
                />
              </TableCell>
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
                  value={newRecord.inputCost}
                  onChange={(e) => setNewRecord({ ...newRecord, inputCost: e.target.value })}
                  className="h-8 text-sm text-right bg-background"
                />
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={newRecord.revenue}
                  onChange={(e) => setNewRecord({ ...newRecord, revenue: e.target.value })}
                  className="h-8 text-sm text-right bg-background"
                />
              </TableCell>
              {project.customColumns.map((col) => (
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
                  placeholder="Note..."
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
                  disabled={!newRecord.item.trim()}
                  className="w-full"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>

            {/* Existing Records */}
            {sortedRecords.map((record) => (
              <Collapsible key={record.id} asChild>
                <>
                  <TableRow
                    className={cn(
                      "transition-colors",
                      record.isLocked && "table-row-locked opacity-80",
                      editingRecord === record.id && "bg-accent/20"
                    )}
                  >
                    <TableCell className="font-mono text-sm">
                      {format(new Date(record.date), 'MMM d')}
                    </TableCell>
                    <TableCell className="font-medium">
                      {editingRecord === record.id ? (
                        <Input
                          value={editData.item || ''}
                          onChange={(e) => setEditData({ ...editData, item: e.target.value })}
                          className="h-8 text-sm"
                        />
                      ) : (
                        <span className="cursor-pointer hover:text-primary" onClick={() => startEditing(record)}>
                          {record.item}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {editingRecord === record.id ? (
                        <Input
                          type="number"
                          value={editData.produceAmount || ''}
                          onChange={(e) => setEditData({ ...editData, produceAmount: parseFloat(e.target.value) || 0 })}
                          className="h-8 text-sm text-right"
                        />
                      ) : (
                        record.produceAmount.toLocaleString()
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">
                      {editingRecord === record.id ? (
                        <Input
                          type="number"
                          value={editData.inputCost || ''}
                          onChange={(e) => setEditData({ ...editData, inputCost: parseFloat(e.target.value) || 0 })}
                          className="h-8 text-sm text-right"
                        />
                      ) : (
                        `-${record.inputCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-success">
                      {editingRecord === record.id ? (
                        <Input
                          type="number"
                          value={editData.revenue || ''}
                          onChange={(e) => setEditData({ ...editData, revenue: parseFloat(e.target.value) || 0 })}
                          className="h-8 text-sm text-right"
                        />
                      ) : (
                        `+${record.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                      )}
                    </TableCell>
                    {project.customColumns.map((col) => (
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
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:bg-destructive/10"
                              onClick={() => onDeleteRecord(record.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {record.comment && (
                    <CollapsibleContent asChild>
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={8 + project.customColumns.length} className="py-2 px-4">
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
                <TableCell colSpan={8 + project.customColumns.length} className="h-24 text-center text-muted-foreground">
                  No records yet. Add your first entry above.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
