import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { ProjectCard } from '@/components/ProjectCard';
import { CreateProjectDialog } from '@/components/CreateProjectDialog';
import { RecordTable } from '@/components/RecordTable';
import { MonthlySummary } from '@/components/MonthlySummary';
import { ProjectDetailsSection } from '@/components/ProjectDetailsSection';
import { BluetoothShareDialog } from '@/components/BluetoothShareDialog';
import { BluetoothImportDialog } from '@/components/BluetoothImportDialog';
import { PDFExportDialog } from '@/components/PDFExportDialog';
import { NotesEditor } from '@/components/NotesEditor';
import { ColumnManagerDropdown, CustomColumn, ColumnType } from '@/components/ColumnManagerDropdown';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  MonthlyAggregation,
  ProjectDetails,
  getAllProjects,
  createProject,
  deleteProject,
  getProject,
  getRecordsByProject,
  createRecord,
  updateRecord,
  deleteRecord,
  lockRecord,
  getMonthlyAggregation,
  updateProjectDetails,
  completeProject,
  updateProject,
} from '@/lib/db';
import { Plus, ArrowLeft, Leaf, Database, Lock, Bluetooth, Download, Share2, FileDown, ClipboardList, Table2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const Index = () => {
  const [projects, setProjects] = useState<FarmProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<FarmProject | null>(null);
  const [records, setRecords] = useState<FarmRecord[]>([]);
  const [aggregations, setAggregations] = useState<MonthlyAggregation[]>([]);
  const [recordCounts, setRecordCounts] = useState<Record<string, number>>({});
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [shareProject, setShareProject] = useState<{ project: FarmProject; records: FarmRecord[] } | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isPDFExportOpen, setIsPDFExportOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<'details' | 'components'>('details');
  const [customColumnTypes, setCustomColumnTypes] = useState<Record<string, ColumnType>>({});
  const { toast } = useToast();

  // Load projects
  useEffect(() => {
    loadProjects();
  }, []);

  // Load records when project is selected
  useEffect(() => {
    if (selectedProject) {
      loadRecords(selectedProject.id, selectedProject.details);
    }
  }, [selectedProject]);

  const loadProjects = async () => {
    try {
      setIsLoading(true);
      const allProjects = await getAllProjects();
      setProjects(allProjects);
      
      // Get record counts for each project
      const counts: Record<string, number> = {};
      for (const project of allProjects) {
        const projectRecords = await getRecordsByProject(project.id);
        counts[project.id] = projectRecords.length;
      }
      setRecordCounts(counts);
    } catch (error) {
      toast({ title: 'Error loading projects', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const loadRecords = async (projectId: string, projectDetails?: ProjectDetails) => {
    try {
      const projectRecords = await getRecordsByProject(projectId);
      setRecords(projectRecords);
      const aggs = await getMonthlyAggregation(projectId, projectDetails);
      setAggregations(aggs);
    } catch (error) {
      toast({ title: 'Error loading records', variant: 'destructive' });
    }
  };

  const handleCreateProject = async (title: string, startDate: string, customColumns: string[]) => {
    try {
      const newProject = await createProject(title, startDate, customColumns);
      setProjects([newProject, ...projects]);
      setRecordCounts({ ...recordCounts, [newProject.id]: 0 });
      toast({ title: 'Project created successfully' });
    } catch (error) {
      toast({ title: 'Error creating project', variant: 'destructive' });
    }
  };

  const handleDeleteProject = async () => {
    if (!deleteProjectId) return;
    try {
      await deleteProject(deleteProjectId);
      setProjects(projects.filter(p => p.id !== deleteProjectId));
      const newCounts = { ...recordCounts };
      delete newCounts[deleteProjectId];
      setRecordCounts(newCounts);
      toast({ title: 'Project deleted' });
    } catch (error) {
      toast({ title: 'Error deleting project', variant: 'destructive' });
    } finally {
      setDeleteProjectId(null);
    }
  };

  const handleSelectProject = async (id: string) => {
    const project = await getProject(id);
    if (project) {
      setSelectedProject(project);
      // Load custom column types from project
      setCustomColumnTypes(project.customColumnTypes || {});
    }
  };

  const handleShareProject = async (id: string) => {
    const project = await getProject(id);
    if (project) {
      const projectRecords = await getRecordsByProject(id);
      setShareProject({ project, records: projectRecords });
    }
  };

  const handleAddRecord = async (data: Omit<FarmRecord, 'id' | 'projectId' | 'isLocked' | 'createdAt' | 'updatedAt'>) => {
    if (!selectedProject) return;
    try {
      const newRecord = await createRecord(selectedProject.id, data);
      setRecords([newRecord, ...records]);
      setRecordCounts({ ...recordCounts, [selectedProject.id]: (recordCounts[selectedProject.id] || 0) + 1 });
      const aggs = await getMonthlyAggregation(selectedProject.id, selectedProject.details);
      setAggregations(aggs);
      toast({ title: 'Record added' });
    } catch (error) {
      toast({ title: 'Error adding record', variant: 'destructive' });
    }
  };

  const handleUpdateRecord = async (record: FarmRecord) => {
    try {
      await updateRecord(record);
      setRecords(records.map(r => r.id === record.id ? record : r));
      const aggs = await getMonthlyAggregation(selectedProject!.id, selectedProject?.details);
      setAggregations(aggs);
      toast({ title: 'Record updated' });
    } catch (error) {
      toast({ title: 'Error updating record', variant: 'destructive' });
    }
  };

  const handleDeleteRecord = async (id: string) => {
    if (!selectedProject) return;
    try {
      await deleteRecord(id);
      setRecords(records.filter(r => r.id !== id));
      setRecordCounts({ ...recordCounts, [selectedProject.id]: Math.max(0, (recordCounts[selectedProject.id] || 1) - 1) });
      const aggs = await getMonthlyAggregation(selectedProject.id, selectedProject.details);
      setAggregations(aggs);
      toast({ title: 'Record deleted' });
    } catch (error) {
      toast({ title: 'Cannot delete locked record', variant: 'destructive' });
    }
  };

  const handleUpdateProjectDetails = async (details: ProjectDetails) => {
    if (!selectedProject) return;
    try {
      await updateProjectDetails(selectedProject.id, details);
      setSelectedProject({ ...selectedProject, details });
      // Recalculate aggregations with updated costs
      const aggs = await getMonthlyAggregation(selectedProject.id, details);
      setAggregations(aggs);
      toast({ title: 'Project details updated' });
    } catch (error) {
      toast({ title: 'Error updating details', variant: 'destructive' });
    }
  };

  const handleCompleteProject = async () => {
    if (!selectedProject) return;
    try {
      await completeProject(selectedProject.id);
      setSelectedProject({ 
        ...selectedProject, 
        isCompleted: true, 
        completedAt: new Date().toISOString() 
      });
      toast({ title: 'Project marked as completed' });
    } catch (error) {
      toast({ title: 'Error completing project', variant: 'destructive' });
    }
  };

  const handleLockRecord = async (id: string) => {
    try {
      await lockRecord(id);
      setRecords(records.map(r => r.id === id ? { ...r, isLocked: true, lockedAt: new Date().toISOString() } : r));
      toast({ title: 'Record locked and encrypted' });
    } catch (error) {
      toast({ title: 'Error locking record', variant: 'destructive' });
    }
  };

  const handleAddColumn = async (column: CustomColumn) => {
    if (!selectedProject) return;
    try {
      const newColumns = [...selectedProject.customColumns, column.name];
      const newColumnTypes = { ...selectedProject.customColumnTypes, [column.name]: column.type };
      const updatedProject = { ...selectedProject, customColumns: newColumns, customColumnTypes: newColumnTypes };
      await updateProject(updatedProject);
      setSelectedProject(updatedProject);
      setCustomColumnTypes(newColumnTypes);
      toast({ title: `Column "${column.name}" added` });
    } catch (error) {
      toast({ title: 'Error adding column', variant: 'destructive' });
    }
  };

  const handleRemoveColumn = async (columnName: string) => {
    if (!selectedProject) return;
    try {
      const newColumns = selectedProject.customColumns.filter(c => c !== columnName);
      const newColumnTypes = { ...selectedProject.customColumnTypes };
      delete newColumnTypes[columnName];
      const updatedProject = { ...selectedProject, customColumns: newColumns, customColumnTypes: newColumnTypes };
      await updateProject(updatedProject);
      setSelectedProject(updatedProject);
      setCustomColumnTypes(newColumnTypes);
      toast({ title: `Column "${columnName}" removed` });
    } catch (error) {
      toast({ title: 'Error removing column', variant: 'destructive' });
    }
  };
  if (selectedProject) {
    return (
      <div className="min-h-screen bg-gradient-earth">
        <Header />
        <main className="container px-4 py-6 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => setSelectedProject(null)}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h2 className="font-serif text-2xl font-semibold">{selectedProject.title}</h2>
                <p className="text-sm text-muted-foreground font-mono">ID: {selectedProject.id.slice(0, 8)}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setIsPDFExportOpen(true)}
              >
                <FileDown className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
              <Button
                variant="outline"
                onClick={() => setShareProject({ project: selectedProject, records })}
              >
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
            </div>
          </div>

          {/* Dual Section Tabs */}
          <Tabs value={activeSection} onValueChange={(v) => setActiveSection(v as 'details' | 'components')} className="w-full">
            <TabsList className="grid w-full grid-cols-2 max-w-md">
              <TabsTrigger value="details" className="gap-2">
                <ClipboardList className="h-4 w-4" />
                Project Details
              </TabsTrigger>
              <TabsTrigger value="components" className="gap-2">
                <Table2 className="h-4 w-4" />
                Records
              </TabsTrigger>
            </TabsList>

            {/* Section 1: Project Main Details */}
            <TabsContent value="details" className="space-y-6 mt-6">
              <ProjectDetailsSection
                project={selectedProject}
                onUpdateDetails={handleUpdateProjectDetails}
                onCompleteProject={handleCompleteProject}
              />
              <NotesEditor
                notes={selectedProject.details.notes || ''}
                onChange={(notes) => handleUpdateProjectDetails({ ...selectedProject.details, notes })}
                readOnly={selectedProject.isCompleted}
              />
              <MonthlySummary 
                aggregations={aggregations} 
                projectDetails={selectedProject.details} 
                isCompleted={selectedProject.isCompleted}
              />
            </TabsContent>

            {/* Section 2: Project Records */}
            <TabsContent value="components" className="space-y-6 mt-6">
              <div>
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <h3 className="font-serif text-lg font-semibold">Project Records</h3>
                  <div className="flex items-center gap-3">
                    <ColumnManagerDropdown
                      columns={selectedProject.customColumns}
                      customColumnTypes={customColumnTypes}
                      onAddColumn={handleAddColumn}
                      onRemoveColumn={handleRemoveColumn}
                      disabled={selectedProject.isCompleted}
                    />
                    <p className="text-sm text-muted-foreground">
                      {records.filter(r => r.isLocked).length}/{records.length} locked
                    </p>
                  </div>
                </div>
                <RecordTable
                  project={selectedProject}
                  records={records}
                  onAddRecord={handleAddRecord}
                  onUpdateRecord={handleUpdateRecord}
                  onDeleteRecord={handleDeleteRecord}
                  onLockRecord={handleLockRecord}
                  customColumnTypes={customColumnTypes}
                />
              </div>
            </TabsContent>
          </Tabs>
        </main>

        {shareProject && (
          <BluetoothShareDialog
            open={!!shareProject}
            onOpenChange={() => setShareProject(null)}
            project={shareProject.project}
            records={shareProject.records}
          />
        )}

        <PDFExportDialog
          open={isPDFExportOpen}
          onOpenChange={setIsPDFExportOpen}
          project={selectedProject}
          records={records}
          aggregations={aggregations}
        />
      </div>
    );
  }

  // Projects List View
  return (
    <div className="min-h-screen bg-gradient-earth">
      <Header />
      
      <main className="container px-4 py-8">
        {/* Hero Section */}
        <section className="text-center mb-12 animate-fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-hero shadow-elevated mb-4">
            <Leaf className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-3">
            Welcome to FarmDeck
          </h1>
          <p className="text-muted-foreground max-w-md mx-auto mb-6">
            Your offline farm records platform. Track projects, operations, and finances—all stored securely on your device.
          </p>
          
          <div className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground mb-8">
            <div className="flex items-center gap-2 bg-card px-4 py-2 rounded-full shadow-card">
              <Database className="h-4 w-4 text-primary" />
              <span>Offline Storage</span>
            </div>
            <div className="flex items-center gap-2 bg-card px-4 py-2 rounded-full shadow-card">
              <Lock className="h-4 w-4 text-primary" />
              <span>Tamper-Proof Records</span>
            </div>
            <div className="flex items-center gap-2 bg-card px-4 py-2 rounded-full shadow-card">
              <Bluetooth className="h-4 w-4 text-primary" />
              <span>Bluetooth Sync</span>
            </div>
          </div>
        </section>

        {/* Projects Section */}
        <section>
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <h2 className="font-serif text-xl font-semibold">Your Projects</h2>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsScannerOpen(true)}>
                <Download className="h-4 w-4 mr-2" />
                Import
              </Button>
              <Button variant="hero" onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                New Project
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-48 rounded-lg bg-card animate-pulse" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-16 px-4 rounded-2xl bg-card shadow-card animate-scale-in">
              <Leaf className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-serif text-lg font-semibold mb-2">No projects yet</h3>
              <p className="text-muted-foreground mb-6">
                Create your first farm project to start tracking records.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button variant="outline" onClick={() => setIsScannerOpen(true)}>
                  <Download className="h-4 w-4 mr-2" />
                  Import Project
                </Button>
                <Button variant="hero" onClick={() => setIsCreateOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Create First Project
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {projects.map((project, index) => (
                <div key={project.id} style={{ animationDelay: `${index * 100}ms` }}>
                  <ProjectCard
                    project={project}
                    onSelect={handleSelectProject}
                    onDelete={setDeleteProjectId}
                    onShare={handleShareProject}
                    recordCount={recordCounts[project.id] || 0}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <CreateProjectDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSubmit={handleCreateProject}
      />

      <BluetoothImportDialog
        open={isScannerOpen}
        onOpenChange={setIsScannerOpen}
        onImportComplete={loadProjects}
      />

      {shareProject && (
        <BluetoothShareDialog
          open={!!shareProject}
          onOpenChange={() => setShareProject(null)}
          project={shareProject.project}
          records={shareProject.records}
        />
      )}

      <AlertDialog open={!!deleteProjectId} onOpenChange={() => setDeleteProjectId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the project and all its records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProject} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Index;
