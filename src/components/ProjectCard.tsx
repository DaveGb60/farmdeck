import { FarmProject } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Hash, ChevronRight, Trash2, QrCode } from 'lucide-react';
import { format } from 'date-fns';

interface ProjectCardProps {
  project: FarmProject;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onShare: (id: string) => void;
  recordCount?: number;
}

export function ProjectCard({ project, onSelect, onDelete, onShare, recordCount = 0 }: ProjectCardProps) {
  return (
    <Card className="group cursor-pointer bg-gradient-card shadow-card hover:shadow-elevated transition-all duration-300 hover:-translate-y-1 animate-scale-in">
      <CardHeader className="pb-2" onClick={() => onSelect(project.id)}>
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg font-serif text-foreground group-hover:text-primary transition-colors">
            {project.title}
          </CardTitle>
          <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
            <Hash className="h-3 w-3" />
            <span className="font-mono">{project.id.slice(0, 8)}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent onClick={() => onSelect(project.id)}>
        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            <span>{format(new Date(project.startDate), 'MMM d, yyyy')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-foreground">{recordCount}</span>
            <span>records</span>
          </div>
        </div>
        

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(project.id);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-primary hover:bg-primary/10"
              onClick={(e) => {
                e.stopPropagation();
                onShare(project.id);
              }}
            >
              <QrCode className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="ghost" size="sm" className="group-hover:text-primary">
            Open
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
