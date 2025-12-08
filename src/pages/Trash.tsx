import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  FarmProject,
  FarmRecord,
  getDeletedProjects,
  restoreProject,
  permanentlyDeleteProject,
  getRecordsByProject,
  cleanupOldTrash,
} from '@/lib/db';
import { Trash2, RotateCcw, Clock, Eye, AlertTriangle, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { format, differenceInDays } from 'date-fns';

const Trash = () => {
  const [deletedProjects, setDeletedProjects] = useState<FarmProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [viewingProject, setViewingProject] = useState<{ project: FarmProject; records: FarmRecord[] } | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadDeletedProjects();
    // Clean up projects older than 30 days
    cleanupOldTrash();
  }, []);

  const loadDeletedProjects = async () => {
    try {
      setIsLoading(true);
      const projects = await getDeletedProjects();
      setDeletedProjects(projects);
    } catch (error) {
      toast({ title: 'Error loading trash', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await restoreProject(id);
      setDeletedProjects(deletedProjects.filter(p => p.id !== id));
      toast({ title: 'Project restored successfully' });
    } catch (error) {
      toast({ title: 'Error restoring project', variant: 'destructive' });
    }
  };

  const handlePermanentDelete = async () => {
    if (!deleteProjectId) return;
    try {
      await permanentlyDeleteProject(deleteProjectId);
      setDeletedProjects(deletedProjects.filter(p => p.id !== deleteProjectId));
      toast({ title: 'Project permanently deleted' });
    } catch (error) {
      toast({ title: 'Error deleting project', variant: 'destructive' });
    } finally {
      setDeleteProjectId(null);
    }
  };

  const handleViewProject = async (project: FarmProject) => {
    const records = await getRecordsByProject(project.id);
    setViewingProject({ project, records });
  };

  const getDaysRemaining = (deletedAt: string) => {
    const deletedDate = new Date(deletedAt);
    const daysSinceDelete = differenceInDays(new Date(), deletedDate);
    return Math.max(0, 30 - daysSinceDelete);
  };

  // View project details (read-only)
  if (viewingProject) {
    return (
      <div className="min-h-screen bg-gradient-earth">
        <Header />
        <main className="container px-4 py-6 space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setViewingProject(null)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="font-serif text-2xl font-semibold">{viewingProject.project.title}</h2>
                <Badge variant="secondary" className="bg-destructive/10 text-destructive">
                  <Trash2 className="h-3 w-3 mr-1" />
                  In Trash
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">Read-only view • Cannot be edited</p>
            </div>
          </div>

          {/* Project Details (Read-only) */}
          <Card className="border-border bg-card shadow-card">
            <CardHeader>
              <CardTitle className="font-serif text-lg">Project Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground">Capital</div>
                  <div className="text-lg font-semibold tabular-nums">
                    {viewingProject.project.details.capital.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground">Total Items</div>
                  <div className="text-lg font-semibold tabular-nums">
                    {viewingProject.project.details.totalItemCount.toLocaleString()}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground">Costs</div>
                  <div className="text-lg font-semibold tabular-nums text-destructive">
                    -{viewingProject.project.details.costs.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground">Est. Revenue</div>
                  <div className="text-lg font-semibold tabular-nums text-success">
                    +{viewingProject.project.details.estimatedRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Records (Read-only) */}
          <Card className="border-border bg-card shadow-card">
            <CardHeader>
              <CardTitle className="font-serif text-lg">Records ({viewingProject.records.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {viewingProject.records.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No records in this project</p>
              ) : (
                <div className="space-y-2">
                  {viewingProject.records.map(record => (
                    <div key={record.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-sm">{format(new Date(record.date), 'MMM d, yyyy')}</span>
                        {record.item && <span className="font-medium">{record.item}</span>}
                        <span className="text-muted-foreground">Produce: {record.produceAmount}</span>
                      </div>
                      <span className="text-success tabular-nums">
                        +{(record.produceRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-earth">
      <Header />
      <main className="container px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-serif text-2xl font-bold flex items-center gap-3">
              <Trash2 className="h-6 w-6 text-muted-foreground" />
              Trash
            </h1>
            <p className="text-sm text-muted-foreground">
              Projects are permanently deleted after 30 days
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-48 rounded-lg bg-card animate-pulse" />
            ))}
          </div>
        ) : deletedProjects.length === 0 ? (
          <div className="text-center py-16 px-4 rounded-2xl bg-card shadow-card">
            <Trash2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="font-serif text-lg font-semibold mb-2">Trash is empty</h3>
            <p className="text-muted-foreground mb-6">
              Deleted projects will appear here for 30 days before permanent deletion.
            </p>
            <Button variant="outline" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Projects
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {deletedProjects.map((project) => {
              const daysRemaining = getDaysRemaining(project.deletedAt!);
              return (
                <Card key={project.id} className="border-border bg-card shadow-card overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="font-serif text-lg">{project.title}</CardTitle>
                      <Badge 
                        variant="secondary" 
                        className={daysRemaining <= 7 ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning-foreground"}
                      >
                        <Clock className="h-3 w-3 mr-1" />
                        {daysRemaining} days left
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Deleted on {format(new Date(project.deletedAt!), 'MMM d, yyyy')}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                      Started: {format(new Date(project.startDate), 'MMM d, yyyy')}
                    </div>
                    
                    {daysRemaining <= 7 && (
                      <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 p-2 rounded-lg">
                        <AlertTriangle className="h-4 w-4" />
                        Will be permanently deleted soon
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleViewProject(project)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      <Button
                        variant="success"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleRestore(project.id)}
                      >
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Restore
                      </Button>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full"
                      onClick={() => setDeleteProjectId(project.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete Permanently
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <AlertDialog open={!!deleteProjectId} onOpenChange={() => setDeleteProjectId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently Delete Project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the project and all its records. This action cannot be undone and the project cannot be recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePermanentDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Trash;