import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { ProjectCard } from '@/components/ProjectCard';
import { CreateProjectDialog } from '@/components/CreateProjectDialog';
import { RecordTable } from '@/components/RecordTable';
import { DelayedRevenueRecordTable } from '@/components/DelayedRevenueRecordTable';
import { MonthlySummary } from '@/components/MonthlySummary';
import { ProjectDetailsSection } from '@/components/ProjectDetailsSection';
import { ShareDialog } from '@/components/ShareDialog';
import { ImportDialog } from '@/components/ImportDialog';
import { PDFExportDialog } from '@/components/PDFExportDialog';
import { NotesEditor } from '@/components/NotesEditor';
import { P2PSyncDialog } from '@/components/P2PSyncDialog';
import { ColumnManagerDropdown, CustomColumn, ColumnType } from '@/components/ColumnManagerDropdown';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
  RecordType,
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
  generateId,
} from '@/lib/db';
import { cn } from '@/lib/utils';
import { Plus, ArrowLeft, Leaf, Database, Lock, Download, Share2, FileDown, ClipboardList, Table2, ChevronRight, Package, Zap, Wifi, RefreshCw } from 'lucide-react';
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
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isPDFExportOpen, setIsPDFExportOpen] = useState(false);
  const [isP2PSyncOpen, setIsP2PSyncOpen] = useState(false);
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
      loadRecords(selectedProject.id, selectedProject.details, selectedProject.customColumnTypes);
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

  const loadRecords = async (projectId: string, projectDetails?: ProjectDetails, columnTypes?: Record<string, ColumnType>) => {
    try {
      const projectRecords = await getRecordsByProject(projectId);
      setRecords(projectRecords);
      const aggs = await getMonthlyAggregation(projectId, projectDetails, columnTypes);
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
      const aggs = await getMonthlyAggregation(selectedProject.id, selectedProject.details, customColumnTypes);
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
      const aggs = await getMonthlyAggregation(selectedProject!.id, selectedProject?.details, customColumnTypes);
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
      const aggs = await getMonthlyAggregation(selectedProject.id, selectedProject.details, customColumnTypes);
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
      const aggs = await getMonthlyAggregation(selectedProject.id, details, customColumnTypes);
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

  const handleReorderColumns = async (newColumns: string[]) => {
    if (!selectedProject) return;
    try {
      const updatedProject = { ...selectedProject, customColumns: newColumns };
      await updateProject(updatedProject);
      setSelectedProject(updatedProject);
    } catch (error) {
      toast({ title: 'Error reordering columns', variant: 'destructive' });
    }
  };

  const handleChangeRecordType = async (recordType: RecordType) => {
    if (!selectedProject || selectedProject.isCompleted) return;
    try {
      const updatedProject = { ...selectedProject, recordType };
      await updateProject(updatedProject);
      setSelectedProject(updatedProject);
      toast({ title: `Switched to ${recordType === 'delayed_revenue' ? 'Delayed Revenue' : 'Standard'} mode` });
    } catch (error) {
      toast({ title: 'Error changing record type', variant: 'destructive' });
    }
  };

  const handleBatchSale = async (saleData: {
    date: string;
    soldQuantity: number;
    revenue: number;
    sourceRecords: FarmRecord[];
    comment?: string;
  }) => {
    if (!selectedProject) return;
    try {
      const batchSaleId = generateId();
      let remainingToSell = saleData.soldQuantity;
      const updatedRecords: FarmRecord[] = [];

      // Filter out locked records - only use unlocked records as sources
      const unlockedSourceRecords = saleData.sourceRecords.filter(r => !r.isLocked);
      
      if (unlockedSourceRecords.length === 0) {
        toast({ 
          title: 'Cannot process batch sale', 
          description: 'All source records are locked',
          variant: 'destructive' 
        });
        return;
      }

      // Deduct from source records (FIFO) - only unlocked ones
      for (const record of unlockedSourceRecords) {
        if (remainingToSell <= 0) break;
        const available = record.availableQuantity ?? record.produceAmount;
        const deducted = Math.min(available, remainingToSell);
        remainingToSell -= deducted;
        
        const updatedRecord = { ...record, availableQuantity: available - deducted };
        await updateRecord(updatedRecord);
        updatedRecords.push(updatedRecord);
      }

      // If we couldn't sell the full quantity (locked records blocked it)
      const actuallySold = saleData.soldQuantity - remainingToSell;
      if (actuallySold <= 0) {
        toast({ 
          title: 'Cannot process batch sale', 
          description: 'No available unlocked inventory to sell',
          variant: 'destructive' 
        });
        return;
      }

      // Create batch sale record with actual sold quantity
      const saleRecord = await createRecord(selectedProject.id, {
        date: saleData.date,
        produceAmount: 0,
        produceRevenue: saleData.revenue,
        comment: saleData.comment || `Batch sale of ${actuallySold} units`,
        customFields: {},
        isBatchSale: true,
        soldQuantity: actuallySold,
        sourceRecordIds: updatedRecords.map(r => r.id),
        batchSaleId,
      });

      // Check for remainder and create carried balance if needed
      const totalAvailable = unlockedSourceRecords.reduce((sum, r) => sum + (r.availableQuantity ?? r.produceAmount), 0);
      const remainder = totalAvailable - actuallySold;
      
      if (remainder > 0) {
        await createRecord(selectedProject.id, {
          date: saleData.date,
          produceAmount: remainder,
          produceRevenue: 0,
          comment: `Carried balance from batch sale`,
          customFields: {},
          isCarriedBalance: true,
          availableQuantity: remainder,
          batchSaleId,
        });
      }

      // Reload records
      await loadRecords(selectedProject.id, selectedProject.details, customColumnTypes);
      
      if (remainingToSell > 0) {
        toast({ 
          title: 'Partial batch sale recorded', 
          description: `Sold ${actuallySold} units. ${remainingToSell} units could not be sold (locked records).`
        });
      } else {
        toast({ title: 'Batch sale recorded successfully' });
      }
    } catch (error) {
      console.error('[BatchSale] Error:', error);
      toast({ 
        title: 'Error recording batch sale', 
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive' 
      });
    }
  };

  if (selectedProject) {
    return (
      <TooltipProvider delayDuration={300}>
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
                  <div className="flex items-center gap-2">
                    <h3 className="font-serif text-lg font-semibold">Project Records</h3>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 px-2" disabled={selectedProject.isCompleted}>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="bg-popover z-50 w-72">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuItem 
                              onClick={() => handleChangeRecordType('standard')}
                              className={cn(
                                "flex flex-col items-start gap-1 py-3",
                                selectedProject.recordType === 'standard' && 'bg-accent'
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <Zap className="h-4 w-4" />
                                <span className="font-medium">Standard (Immediate Revenue)</span>
                              </div>
                              <span className="text-xs text-muted-foreground ml-6">
                                Revenue recorded when production occurs
                              </span>
                            </DropdownMenuItem>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs">
                            <p className="text-sm">
                              <strong>Standard Records:</strong> Use when revenue is received immediately upon production or harvest. Ideal for direct sales, daily market sales, or products sold on-the-spot.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuItem 
                              onClick={() => handleChangeRecordType('delayed_revenue')}
                              className={cn(
                                "flex flex-col items-start gap-1 py-3",
                                selectedProject.recordType === 'delayed_revenue' && 'bg-accent'
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <Package className="h-4 w-4" />
                                <span className="font-medium">Delayed Revenue (Batch Sales)</span>
                              </div>
                              <span className="text-xs text-muted-foreground ml-6">
                                Collect first, sell later in batches
                              </span>
                            </DropdownMenuItem>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs">
                            <p className="text-sm">
                              <strong>Delayed Revenue:</strong> Use when products are collected/harvested but sold later (e.g., eggs, stored crops). Track quantities collected, then record batch sales when you sell. Unsold portions are carried forward automatically.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {selectedProject.recordType === 'delayed_revenue' && (
                      <span className="text-xs bg-warning/20 text-warning px-2 py-1 rounded">Delayed Revenue</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <ColumnManagerDropdown
                      columns={selectedProject.customColumns}
                      customColumnTypes={customColumnTypes}
                      onAddColumn={handleAddColumn}
                      onRemoveColumn={handleRemoveColumn}
                      onReorderColumns={handleReorderColumns}
                      disabled={selectedProject.isCompleted}
                    />
                    <p className="text-sm text-muted-foreground">
                      {records.filter(r => r.isLocked).length}/{records.length} locked
                    </p>
                  </div>
                </div>
                {selectedProject.recordType === 'delayed_revenue' ? (
                  <DelayedRevenueRecordTable
                    project={selectedProject}
                    records={records}
                    onAddRecord={handleAddRecord}
                    onUpdateRecord={handleUpdateRecord}
                    onDeleteRecord={handleDeleteRecord}
                    onLockRecord={handleLockRecord}
                    onBatchSale={handleBatchSale}
                    customColumnTypes={customColumnTypes}
                  />
                ) : (
                  <RecordTable
                    project={selectedProject}
                    records={records}
                    onAddRecord={handleAddRecord}
                    onUpdateRecord={handleUpdateRecord}
                    onDeleteRecord={handleDeleteRecord}
                    onLockRecord={handleLockRecord}
                    customColumnTypes={customColumnTypes}
                  />
                )}
              </div>
            </TabsContent>
          </Tabs>
        </main>

        {shareProject && (
          <ShareDialog
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
      </TooltipProvider>
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
              <RefreshCw className="h-4 w-4 text-primary" />
              <span>P2P Sync</span>
            </div>
          </div>
        </section>

        {/* Projects Section */}
        <section>
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <h2 className="font-serif text-xl font-semibold">Your Projects</h2>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsP2PSyncOpen(true)}>
                <Wifi className="h-4 w-4 mr-2" />
                Sync
              </Button>
              <Button variant="outline" onClick={() => setIsImportOpen(true)}>
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
                <Button variant="outline" onClick={() => setIsP2PSyncOpen(true)}>
                  <Wifi className="h-4 w-4 mr-2" />
                  Sync with Device
                </Button>
                <Button variant="outline" onClick={() => setIsImportOpen(true)}>
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

        {/* Footer Branding */}
        <footer className="mt-16 pb-8 text-center">
          <p className="text-sm text-muted-foreground">
            Made by <span className="font-semibold text-primary">Gfibion Genesis</span>
          </p>
        </footer>
      </main>

      <CreateProjectDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSubmit={handleCreateProject}
      />

      <ImportDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onImportComplete={loadProjects}
      />

      <P2PSyncDialog
        open={isP2PSyncOpen}
        onOpenChange={setIsP2PSyncOpen}
        projects={projects}
        onSyncComplete={loadProjects}
      />

      {shareProject && (
        <ShareDialog
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
