import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, X } from 'lucide-react';

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (title: string, startDate: string, customColumns: string[]) => void;
}

export function CreateProjectDialog({ open, onOpenChange, onSubmit }: CreateProjectDialogProps) {
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [customColumns, setCustomColumns] = useState<string[]>([]);
  const [newColumn, setNewColumn] = useState('');

  const handleAddColumn = () => {
    if (newColumn.trim() && !customColumns.includes(newColumn.trim())) {
      setCustomColumns([...customColumns, newColumn.trim()]);
      setNewColumn('');
    }
  };

  const handleRemoveColumn = (col: string) => {
    setCustomColumns(customColumns.filter(c => c !== col));
  };

  const handleSubmit = () => {
    if (title.trim() && startDate) {
      onSubmit(title.trim(), startDate, customColumns);
      setTitle('');
      setStartDate(new Date().toISOString().split('T')[0]);
      setCustomColumns([]);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Create New Project</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Project Title</Label>
            <Input
              id="title"
              placeholder="e.g., Tomato Farm 2024"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-background"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="startDate">Start Date</Label>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-background"
            />
          </div>
          
          <div className="space-y-2">
            <Label>Custom Columns (Optional)</Label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g., Weather, Workers"
                value={newColumn}
                onChange={(e) => setNewColumn(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddColumn()}
                className="bg-background"
              />
              <Button type="button" variant="secondary" size="icon" onClick={handleAddColumn}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            
            {customColumns.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {customColumns.map((col) => (
                  <span
                    key={col}
                    className="inline-flex items-center gap-1 text-sm bg-secondary text-secondary-foreground px-2 py-1 rounded-full"
                  >
                    {col}
                    <button
                      type="button"
                      onClick={() => handleRemoveColumn(col)}
                      className="hover:text-destructive transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="hero" onClick={handleSubmit} disabled={!title.trim()}>
            Create Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
