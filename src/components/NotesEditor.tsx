import { useState, useRef } from 'react';
import DOMPurify from 'dompurify';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bold, List, ListOrdered, FileText, Pencil, Save, X } from 'lucide-react';

interface NotesEditorProps {
  notes: string;
  onChange: (notes: string) => void;
  readOnly?: boolean;
}

export function NotesEditor({ notes, onChange, readOnly = false }: NotesEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(notes);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleStartEdit = () => {
    setEditValue(notes);
    setIsEditing(true);
  };

  const handleSave = () => {
    onChange(editValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(notes);
    setIsEditing(false);
  };

  const insertFormatting = (prefix: string, suffix: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = editValue.substring(start, end);
    const newText = 
      editValue.substring(0, start) + 
      prefix + selectedText + suffix + 
      editValue.substring(end);
    
    setEditValue(newText);
    
    // Focus and set cursor position after formatting
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + prefix.length + selectedText.length + suffix.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const insertBold = () => insertFormatting('**', '**');
  
  const insertBullet = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const lineStart = editValue.lastIndexOf('\n', start - 1) + 1;
    const newText = editValue.substring(0, lineStart) + '• ' + editValue.substring(lineStart);
    setEditValue(newText);
    
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + 2, start + 2);
    }, 0);
  };

  const insertNumbered = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const textBefore = editValue.substring(0, start);
    const lines = textBefore.split('\n');
    
    // Count existing numbered items in current list
    let count = 1;
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      const match = line.match(/^(\d+)\.\s/);
      if (match) {
        count = parseInt(match[1]) + 1;
      } else if (line.trim() === '') {
        break;
      }
    }
    
    const lineStart = editValue.lastIndexOf('\n', start - 1) + 1;
    const newText = editValue.substring(0, lineStart) + `${count}. ` + editValue.substring(lineStart);
    setEditValue(newText);
    
    setTimeout(() => {
      textarea.focus();
      const offset = `${count}. `.length;
      textarea.setSelectionRange(start + offset, start + offset);
    }, 0);
  };

  // Render notes with basic formatting (sanitized to prevent XSS)
  const renderFormattedNotes = (text: string) => {
    if (!text) return <span className="text-muted-foreground italic">No notes added yet</span>;
    
    return text.split('\n').map((line, index) => {
      // Bold text - apply formatting then sanitize
      const formatted = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      // Sanitize HTML to only allow safe tags (strong for bold)
      const sanitized = DOMPurify.sanitize(formatted, { 
        ALLOWED_TAGS: ['strong'],
        ALLOWED_ATTR: [] 
      });
      
      return (
        <div key={index} className="min-h-[1.5em]">
          <span dangerouslySetInnerHTML={{ __html: sanitized || '&nbsp;' }} />
        </div>
      );
    });
  };

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg font-serif">
            <FileText className="h-5 w-5 text-primary" />
            Project Notes
          </CardTitle>
          {!readOnly && !isEditing && (
            <Button variant="ghost" size="sm" onClick={handleStartEdit}>
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
          )}
          {isEditing && (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleCancel}>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button variant="default" size="sm" onClick={handleSave}>
                <Save className="h-4 w-4 mr-1" />
                Save
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <div className="space-y-3">
            <div className="flex gap-1 p-1 bg-muted rounded-md w-fit">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={insertBold}
                className="h-8 px-2"
                title="Bold"
              >
                <Bold className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={insertBullet}
                className="h-8 px-2"
                title="Bullet point"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={insertNumbered}
                className="h-8 px-2"
                title="Numbered list"
              >
                <ListOrdered className="h-4 w-4" />
              </Button>
            </div>
            <Textarea
              ref={textareaRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder="Add your project notes here..."
              className="min-h-[200px] font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Use **text** for bold. Click icons or type directly.
            </p>
          </div>
        ) : (
          <div className="prose prose-sm max-w-none text-foreground">
            {renderFormattedNotes(notes)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
