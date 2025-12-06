import { useState } from 'react';
import { FarmProject, ProjectDetails } from '@/lib/db';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Save, Lock, AlertCircle, DollarSign, Package, TrendingUp, AlertTriangle, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProjectDetailsSectionProps {
  project: FarmProject;
  onUpdateDetails: (details: ProjectDetails) => void;
  onCompleteProject: () => void;
}

export function ProjectDetailsSection({
  project,
  onUpdateDetails,
  onCompleteProject,
}: ProjectDetailsSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<ProjectDetails>(project.details);
  const [newFieldKey, setNewFieldKey] = useState('');

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

  const isCompleted = project.isCompleted;

  return (
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
          <MetricCard
            icon={DollarSign}
            label="Capital"
            value={editData.capital}
            isEditing={isEditing && !isCompleted}
            onChange={(v) => setEditData({ ...editData, capital: parseFloat(v) || 0 })}
            format="currency"
          />
          <MetricCard
            icon={Package}
            label="Total Items"
            value={editData.totalItemCount}
            isEditing={isEditing && !isCompleted}
            onChange={(v) => setEditData({ ...editData, totalItemCount: parseInt(v) || 0 })}
            format="number"
          />
          <MetricCard
            icon={AlertTriangle}
            label="Total Costs"
            value={editData.totalCosts}
            isEditing={isEditing && !isCompleted}
            onChange={(v) => setEditData({ ...editData, totalCosts: parseFloat(v) || 0 })}
            format="currency"
            variant="destructive"
          />
          <MetricCard
            icon={TrendingUp}
            label="Est. Revenue"
            value={editData.estimatedRevenue}
            isEditing={isEditing && !isCompleted}
            onChange={(v) => setEditData({ ...editData, estimatedRevenue: parseFloat(v) || 0 })}
            format="currency"
            variant="success"
          />
        </div>

        {/* Challenges Summary */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-medium">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            Challenges Summary
          </Label>
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
            <Label className="text-sm font-medium">Custom Fields</Label>
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

        {/* Profit Projection */}
        <div className="pt-3 border-t border-border">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Projected Profit/Loss:</span>
            <span className={cn(
              "font-semibold tabular-nums",
              editData.estimatedRevenue - editData.totalCosts >= 0 ? "text-success" : "text-destructive"
            )}>
              {editData.estimatedRevenue - editData.totalCosts >= 0 ? '+' : ''}
              {(editData.estimatedRevenue - editData.totalCosts).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface MetricCardProps {
  icon: React.ElementType;
  label: string;
  value: number;
  isEditing: boolean;
  onChange: (value: string) => void;
  format: 'currency' | 'number';
  variant?: 'default' | 'success' | 'destructive';
}

function MetricCard({ icon: Icon, label, value, isEditing, onChange, format, variant = 'default' }: MetricCardProps) {
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
    <div className="p-3 rounded-lg bg-muted/50 space-y-1">
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
        />
      ) : (
        <div className={cn("text-lg font-semibold tabular-nums", colorClass)}>
          {format === 'currency' && variant === 'destructive' && value > 0 && '-'}
          {format === 'currency' && variant === 'success' && value > 0 && '+'}
          {formatValue(value)}
        </div>
      )}
    </div>
  );
}
