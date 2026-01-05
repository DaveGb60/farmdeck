import { MonthlyAggregation, ProjectDetails, calculateTotalProjectCosts } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus, Calendar, FileText, Target } from 'lucide-react';
import { format, parse } from 'date-fns';
import { cn } from '@/lib/utils';

interface MonthlySummaryProps {
  aggregations: MonthlyAggregation[];
  projectDetails?: ProjectDetails;
  isCompleted?: boolean;
}

export function MonthlySummary({ aggregations, projectDetails, isCompleted = false }: MonthlySummaryProps) {
  // Calculate total project costs for display
  const totalProjectCosts = projectDetails ? calculateTotalProjectCosts(projectDetails) : 0;
  const capital = projectDetails?.capital || 0;
  const projectedRevenue = projectDetails?.estimatedRevenue || 0;
  
  if (aggregations.length === 0) {
    return (
      <Card className="bg-gradient-card shadow-card">
        <CardContent className="py-8 text-center text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No monthly data yet</p>
          <p className="text-sm">Start adding records to see summaries</p>
        </CardContent>
      </Card>
    );
  }

  // Project-level summary
  const totalRevenue = aggregations.reduce((sum, agg) => sum + agg.totalRevenue, 0);
  const totalCostsWithCapital = totalProjectCosts + capital;
  const overallProfit = totalRevenue - totalCostsWithCapital;
  
  // Calculate Projected P/L and Surplus/Deficit
  const projectedPL = projectedRevenue - totalCostsWithCapital;
  const surplusDeficit = overallProfit - projectedPL; // Positive = Surplus, Negative = Deficit
  const isSurplus = surplusDeficit > 0;
  const isDeficit = surplusDeficit < 0;

  return (
    <div className="space-y-4">
      <h3 className="font-serif text-lg font-semibold flex items-center gap-2">
        <Calendar className="h-5 w-5 text-primary" />
        Monthly Statements
      </h3>

      {/* Project-Level Summary */}
      <Card className="bg-gradient-card shadow-card border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-serif">Project Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Total Revenue</p>
              <p className="font-semibold tabular-nums text-success">
                +{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Total Costs</p>
              <p className="font-semibold tabular-nums text-destructive">
                -{totalCostsWithCapital.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-muted-foreground">(Inputs + Costs + Capital)</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Realized P/L</p>
              <div className={cn(
                "flex items-center gap-1 font-bold tabular-nums",
                overallProfit > 0 && "text-success",
                overallProfit < 0 && "text-destructive"
              )}>
                {overallProfit > 0 && <TrendingUp className="h-4 w-4" />}
                {overallProfit < 0 && <TrendingDown className="h-4 w-4" />}
                {overallProfit === 0 && <Minus className="h-4 w-4" />}
                <span>
                  {overallProfit > 0 ? '+' : ''}{overallProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Total Records</p>
              <p className="font-semibold tabular-nums">
                {aggregations.reduce((sum, agg) => sum + agg.recordCount, 0)}
              </p>
            </div>
          </div>

          {/* Projected P/L and Surplus/Deficit Section */}
          {(isCompleted || projectedRevenue > 0) && (
            <div className="pt-3 border-t border-border">
              <div className="grid grid-cols-2 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs flex items-center gap-1">
                    <Target className="h-3 w-3" />
                    Projected P/L
                  </p>
                  <p className={cn(
                    "font-semibold tabular-nums",
                    projectedPL > 0 && "text-success",
                    projectedPL < 0 && "text-destructive"
                  )}>
                    {projectedPL > 0 ? '+' : ''}{projectedPL.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">
                    {isSurplus ? 'Surplus' : isDeficit ? 'Deficit' : 'On Target'}
                  </p>
                  <div className={cn(
                    "flex items-center gap-1 font-bold tabular-nums",
                    isSurplus && "text-success",
                    isDeficit && "text-destructive"
                  )}>
                    {isSurplus && <TrendingUp className="h-4 w-4" />}
                    {isDeficit && <TrendingDown className="h-4 w-4" />}
                    {!isSurplus && !isDeficit && <Minus className="h-4 w-4" />}
                    <span>
                      {isSurplus ? '+' : ''}{surplusDeficit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    (Realized - Projected)
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {aggregations.map((agg) => {
          const monthDate = parse(agg.month, 'yyyy-MM', new Date());
          const isPositive = agg.netProfit > 0;
          const isNegative = agg.netProfit < 0;
          
          return (
            <Card key={agg.month} className="bg-gradient-card shadow-card hover:shadow-elevated transition-shadow animate-fade-in">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="font-serif">{format(monthDate, 'MMMM yyyy')}</span>
                  <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {agg.recordCount} records
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Total Produce</p>
                    <p className="font-semibold tabular-nums">{agg.totalProduceAmount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Gross Revenue</p>
                    <p className="font-semibold tabular-nums text-success">
                      +{agg.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Costs (Monthly Share)</p>
                    <p className="font-semibold tabular-nums text-destructive">
                      -{agg.totalInputCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Net Profit</p>
                    <div className={cn(
                      "flex items-center gap-1 font-bold tabular-nums",
                      isPositive && "text-success",
                      isNegative && "text-destructive"
                    )}>
                      {isPositive && <TrendingUp className="h-4 w-4" />}
                      {isNegative && <TrendingDown className="h-4 w-4" />}
                      {!isPositive && !isNegative && <Minus className="h-4 w-4" />}
                      <span>
                        {isPositive ? '+' : ''}{agg.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Profit bar visualization */}
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      isPositive && "bg-success",
                      isNegative && "bg-destructive",
                      !isPositive && !isNegative && "bg-muted-foreground"
                    )}
                    style={{
                      width: `${Math.min(100, Math.abs(agg.netProfit / Math.max(agg.totalRevenue, 1)) * 100)}%`
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
