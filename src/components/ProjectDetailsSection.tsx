import { useState } from 'react';
import { FarmProject, ProjectDetails, InputItem } from '@/lib/db';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Save, Lock, DollarSign, Package, TrendingUp, Plus, X, ShoppingCart, Coins, Calendar } from 'lucide-react';
import { format as formatDate } from 'date-fns';
import { cn } from '@/lib/utils';

interface ProjectDetailsSectionProps {
  project: FarmProject;
  onUpdateDetails: (details: ProjectDetails) => void;
  onCompleteProject: () => void;
}

// Field definitions for long-press tooltips
const fieldDefinitions: Record<string, string> = {
  capital: "The initial money invested to start and set up this project (seeds, equipment, infrastructure, etc.)",
  totalItems: "The foundation quantity purchased to start the project (e.g., grams of seed, number of chicks, calves, seedlings)",
  costs: "Total operational expenses during the project (labor, transport, utilities, maintenance, etc.)",
  estimatedRevenue: "The projected total income expected from selling all produce from this project",
  inputs: "Consumable items used during the project (animal feed, fertilizer, pesticides, herbicides, etc.)",
  challenges: "Document any difficulties, risks, setbacks, or important notes about this project",
};

export function ProjectDetailsSection({
  project,
  onUpdateDetails,
  onCompleteProject,
}: ProjectDetailsSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<ProjectDetails>(project.details);
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newInputName, setNewInputName] = useState('');
  const [newInputCost, setNewInputCost] = useState('');
  const [newInputDate, setNewInputDate] = useState('');

  const handleSave = () => {
    onUpdateDetails(editData);
    setIsEditing(false);
  };

  const handleAddCustomField = () => {
    if (!newFieldKey.trim()) return;
    setEditData({
      ...editData,
      customDetails: {
        ...editData.customDetails,
        [newFieldKey.trim()]: '',
      },
    });
    setNewFieldKey('');
  };

  const handleRemoveCustomField = (key: string) => {
    const newCustomDetails = { ...editData.customDetails };
    delete newCustomDetails[key];
    setEditData({ ...editData, customDetails: newCustomDetails });
  };

  const handleAddInput = () => {
    if (!newInputName.trim()) return;
    const newInput: InputItem = {
      name: newInputName.trim(),
      cost: parseFloat(newInputCost) || 0,
      date: newInputDate || undefined,
    };
    setEditData({
      ...editData,
      inputs: [...editData.inputs, newInput],
    });
    setNewInputName('');
    setNewInputCost('');
    setNewInputDate('');
  };

  const handleUpdateInputDate = (index: number, date: string) => {
    const newInputs = [...editData.inputs];
    newInputs[index] = { ...newInputs[index], date: date || undefined };
    setEditData({ ...editData, inputs: newInputs });
  };

  const handleRemoveInput = (index: number) => {
    const newInputs = [...editData.inputs];
    newInputs.splice(index, 1);
    setEditData({ ...editData, inputs: newInputs });
  };

  const handleUpdateInput = (index: number, field: 'name' | 'cost', value: string) => {
    const newInputs = [...editData.inputs];
    if (field === 'name') {
      newInputs[index] = { ...newInputs[index], name: value };
    } else {
      newInputs[index] = { ...newInputs[index], cost: parseFloat(value) || 0 };
    }
    setEditData({ ...editData, inputs: newInputs });
  };

  const totalInputsCost = editData.inputs.reduce((sum, input) => sum + input.cost, 0);
  const isCompleted = project.isCompleted;

  return (
    <TooltipProvider delayDuration={500}>
      <Card className="border-border bg-card shadow-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="font-serif text-lg">Project Details</CardTitle>
              {isCompleted ? (
                <Badge variant="secondary" className="bg-locked/10 text-locked">
                  <Lock className="h-3 w-3 mr-1" />
                  Completed
                </Badge>
              ) : (
                <Badge variant="outline" className="border-success text-success">
                  Active
                </Badge>
              )}
            </div>
            {!isCompleted && (
              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => {
                      setEditData(project.details);
                      setIsEditing(false);
                    }}>
                      Cancel
                    </Button>
                    <Button variant="success" size="sm" onClick={handleSave}>
                      <Save className="h-4 w-4 mr-1" />
                      Save
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                      Edit Details
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={onCompleteProject}
                    >
                      <Lock className="h-4 w-4 mr-1" />
                      Complete Project
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Main Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCardWithDate
              icon={DollarSign}
              label="Capital"
              tooltip={fieldDefinitions.capital}
              value={editData.capital}
              date={editData.capitalDate}
              isEditing={isEditing && !isCompleted}
              onChange={(v) => setEditData({ ...editData, capital: parseFloat(v) || 0 })}
              onDateChange={(d) => setEditData({ ...editData, capitalDate: d || undefined })}
              format="currency"
            />
            <MetricCard
              icon={Package}
              label="Total Items"
              tooltip={fieldDefinitions.totalItems}
              value={editData.totalItemCount}
              isEditing={isEditing && !isCompleted}
              onChange={(v) => setEditData({ ...editData, totalItemCount: parseInt(v) || 0 })}
              format="number"
            />
            <MetricCardWithDate
              icon={Coins}
              label="Costs"
              tooltip={fieldDefinitions.costs}
              value={editData.costs}
              date={editData.costsDate}
              isEditing={isEditing && !isCompleted}
              onChange={(v) => setEditData({ ...editData, costs: parseFloat(v) || 0 })}
              onDateChange={(d) => setEditData({ ...editData, costsDate: d || undefined })}
              format="currency"
              variant="destructive"
            />
            <MetricCard
              icon={TrendingUp}
              label="Est. Revenue"
              tooltip={fieldDefinitions.estimatedRevenue}
              value={editData.estimatedRevenue}
              isEditing={isEditing && !isCompleted}
              onChange={(v) => setEditData({ ...editData, estimatedRevenue: parseFloat(v) || 0 })}
              format="currency"
              variant="success"
            />
          </div>

          {/* Inputs Section */}
          <div className="space-y-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Label className="flex items-center gap-2 text-sm font-medium cursor-help">
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                  Inputs
                  <span className="text-xs text-muted-foreground ml-auto">
                    Total: {totalInputsCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </Label>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[250px]">
                <p className="text-xs">{fieldDefinitions.inputs}</p>
              </TooltipContent>
            </Tooltip>
            
            {editData.inputs.length > 0 && (
              <div className="space-y-2">
                {editData.inputs.map((input, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                    {isEditing && !isCompleted ? (
                      <>
                        <Input
                          value={input.name}
                          onChange={(e) => handleUpdateInput(index, 'name', e.target.value)}
                          className="h-8 text-sm flex-1 bg-background"
                          placeholder="Input name"
                        />
                        <Input
                          type="number"
                          value={input.cost || ''}
                          onChange={(e) => handleUpdateInput(index, 'cost', e.target.value)}
                          className="h-8 text-sm w-20 text-right bg-background"
                          placeholder="Cost"
                        />
                        <Input
                          type="date"
                          value={input.date || ''}
                          onChange={(e) => handleUpdateInputDate(index, e.target.value)}
                          className="h-8 text-sm w-32 bg-background"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10"
                          onClick={() => handleRemoveInput(index)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="text-sm flex-1">{input.name}</span>
                        {input.date && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(new Date(input.date), 'MMM yyyy')}
                          </span>
                        )}
                        <span className="text-sm tabular-nums text-muted-foreground">
                          {input.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {isEditing && !isCompleted && (
              <div className="flex gap-2 pt-1 flex-wrap">
                <Input
                  placeholder="Input name (e.g., fertilizer)"
                  value={newInputName}
                  onChange={(e) => setNewInputName(e.target.value)}
                  className="h-8 text-sm flex-1 min-w-[120px]"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddInput()}
                />
                <Input
                  type="number"
                  placeholder="Cost"
                  value={newInputCost}
                  onChange={(e) => setNewInputCost(e.target.value)}
                  className="h-8 text-sm w-20 text-right"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddInput()}
                />
                <Input
                  type="date"
                  placeholder="Date"
                  value={newInputDate}
                  onChange={(e) => setNewInputDate(e.target.value)}
                  className="h-8 text-sm w-32"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddInput}
                  disabled={!newInputName.trim()}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
            )}

            {!isEditing && editData.inputs.length === 0 && (
              <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground italic">
                No inputs added
              </div>
            )}
          </div>

          {/* Challenges Summary */}
          <div className="space-y-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Label className="flex items-center gap-2 text-sm font-medium cursor-help">
                  Challenges Summary
                </Label>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[250px]">
                <p className="text-xs">{fieldDefinitions.challenges}</p>
              </TooltipContent>
            </Tooltip>
            {isEditing && !isCompleted ? (
              <Textarea
                value={editData.challengesSummary}
                onChange={(e) => setEditData({ ...editData, challengesSummary: e.target.value })}
                placeholder="Document any challenges, risks, or notes about this project..."
                className="min-h-[80px] bg-background"
              />
            ) : (
              <div className="p-3 rounded-lg bg-muted/50 min-h-[60px] text-sm">
                {editData.challengesSummary || (
                  <span className="text-muted-foreground italic">No challenges documented</span>
                )}
              </div>
            )}
          </div>

          {/* Custom Fields */}
          {(Object.keys(editData.customDetails).length > 0 || (isEditing && !isCompleted)) && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Additional Fields</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {Object.entries(editData.customDetails).map(([key, value]) => (
                  <div key={key} className="relative">
                    <Label className="text-xs text-muted-foreground mb-1 block">{key}</Label>
                    {isEditing && !isCompleted ? (
                      <div className="flex gap-1">
                        <Input
                          value={value}
                          onChange={(e) => setEditData({
                            ...editData,
                            customDetails: { ...editData.customDetails, [key]: e.target.value }
                          })}
                          className="h-8 text-sm bg-background"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10"
                          onClick={() => handleRemoveCustomField(key)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="p-2 rounded bg-muted/50 text-sm">
                        {value || '-'}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Add Custom Field */}
              {isEditing && !isCompleted && (
                <div className="flex gap-2 pt-2">
                  <Input
                    placeholder="Field name..."
                    value={newFieldKey}
                    onChange={(e) => setNewFieldKey(e.target.value)}
                    className="h-8 text-sm max-w-[200px]"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCustomField()}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddCustomField}
                    disabled={!newFieldKey.trim()}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Field
                  </Button>
                </div>
              )}
            </div>
          )}

        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

interface MetricCardProps {
  icon: React.ElementType;
  label: string;
  tooltip: string;
  value: number;
  isEditing: boolean;
  onChange: (value: string) => void;
  format: 'currency' | 'number';
  variant?: 'default' | 'success' | 'destructive';
}

function MetricCard({ icon: Icon, label, tooltip, value, isEditing, onChange, format, variant = 'default' }: MetricCardProps) {
  const colorClass = variant === 'success' 
    ? 'text-success' 
    : variant === 'destructive' 
      ? 'text-destructive' 
      : 'text-foreground';

  const formatValue = (v: number) => {
    if (format === 'currency') {
      return v.toLocaleString(undefined, { minimumFractionDigits: 2 });
    }
    return v.toLocaleString();
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="p-3 rounded-lg bg-muted/50 space-y-1 cursor-help">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Icon className="h-3 w-3" />
            <span>{label}</span>
          </div>
          {isEditing ? (
            <Input
              type="number"
              value={value || ''}
              onChange={(e) => onChange(e.target.value)}
              className="h-8 text-sm font-semibold bg-background"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className={cn("text-lg font-semibold tabular-nums", colorClass)}>
              {format === 'currency' && variant === 'destructive' && value > 0 && '-'}
              {format === 'currency' && variant === 'success' && value > 0 && '+'}
              {formatValue(value)}
            </div>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[250px]">
        <p className="text-xs">{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

interface MetricCardWithDateProps extends MetricCardProps {
  date?: string;
  onDateChange: (value: string) => void;
}

function MetricCardWithDate({ icon: Icon, label, tooltip, value, date, isEditing, onChange, onDateChange, format, variant = 'default' }: MetricCardWithDateProps) {
  const colorClass = variant === 'success' 
    ? 'text-success' 
    : variant === 'destructive' 
      ? 'text-destructive' 
      : 'text-foreground';

  const formatValue = (v: number) => {
    if (format === 'currency') {
      return v.toLocaleString(undefined, { minimumFractionDigits: 2 });
    }
    return v.toLocaleString();
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="p-3 rounded-lg bg-muted/50 space-y-1 cursor-help">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Icon className="h-3 w-3" />
            <span>{label}</span>
          </div>
          {isEditing ? (
            <div className="space-y-1">
              <Input
                type="number"
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                className="h-8 text-sm font-semibold bg-background"
                onClick={(e) => e.stopPropagation()}
              />
              <Input
                type="date"
                value={date || ''}
                onChange={(e) => onDateChange(e.target.value)}
                className="h-7 text-xs bg-background"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          ) : (
            <div>
              <div className={cn("text-lg font-semibold tabular-nums", colorClass)}>
                {format === 'currency' && variant === 'destructive' && value > 0 && '-'}
                {format === 'currency' && variant === 'success' && value > 0 && '+'}
                {formatValue(value)}
              </div>
              {date && (
                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-2.5 w-2.5" />
                  {formatDate(new Date(date), 'MMM yyyy')}
                </div>
              )}
            </div>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[250px]">
        <p className="text-xs">{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}