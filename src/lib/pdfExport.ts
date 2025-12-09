import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FarmProject, FarmRecord, MonthlyAggregation, calculateTotalProjectCosts } from './db';
import { format, parse } from 'date-fns';

interface PDFExportOptions {
  project: FarmProject;
  records: FarmRecord[];
  aggregations: MonthlyAggregation[];
  type: 'monthly' | 'full';
  selectedMonth?: string; // YYYY-MM format
}

export function generateProjectPDF(options: PDFExportOptions): void {
  const { project, records, aggregations, type, selectedMonth } = options;
  const doc = new jsPDF();
  
  const primaryColor: [number, number, number] = [34, 84, 61]; // Deep green
  const accentColor: [number, number, number] = [22, 163, 74]; // Bright green
  
  // Header
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, 220, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('FarmDeck', 14, 20);
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('Farm Records Statement', 14, 30);
  
  // Project Info
  doc.setTextColor(0, 0, 0);
  let yPos = 50;
  
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(project.title, 14, yPos);
  yPos += 8;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(`Project ID: ${project.id.slice(0, 8)}`, 14, yPos);
  doc.text(`Start Date: ${format(new Date(project.startDate), 'MMMM d, yyyy')}`, 80, yPos);
  if (project.isCompleted) {
    doc.text(`Status: Completed`, 160, yPos);
  }
  yPos += 6;
  doc.text(`Generated: ${format(new Date(), 'MMMM d, yyyy HH:mm')}`, 14, yPos);
  yPos += 12;
  
  // Filter data based on export type
  let filteredRecords = records;
  let filteredAggregations = aggregations;
  let reportTitle = 'Full Project Report';
  
  if (type === 'monthly' && selectedMonth) {
    filteredRecords = records.filter(r => r.date.startsWith(selectedMonth));
    filteredAggregations = aggregations.filter(a => a.month === selectedMonth);
    const monthDate = parse(selectedMonth, 'yyyy-MM', new Date());
    reportTitle = `Monthly Statement - ${format(monthDate, 'MMMM yyyy')}`;
  }
  
  // Report Title
  doc.setTextColor(...accentColor);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(reportTitle, 14, yPos);
  yPos += 10;

  // Project Details Section (Section 1)
  if (project.details) {
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Project Details', 14, yPos);
    yPos += 8;
    
    const details = project.details;
    const boxWidth = 44;
    const boxHeight = 24;
    const startX = 14;
    
    // Capital
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(startX, yPos, boxWidth, boxHeight, 2, 2, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Capital', startX + 3, yPos + 7);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(details.capital.toLocaleString(undefined, { minimumFractionDigits: 2 }), startX + 3, yPos + 18);
    
    // Total Items
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(startX + boxWidth + 4, yPos, boxWidth, boxHeight, 2, 2, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Total Items', startX + boxWidth + 7, yPos + 7);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(details.totalItemCount.toLocaleString(), startX + boxWidth + 7, yPos + 18);
    
    // Costs
    doc.setFillColor(254, 226, 226);
    doc.roundedRect(startX + (boxWidth + 4) * 2, yPos, boxWidth, boxHeight, 2, 2, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Costs', startX + (boxWidth + 4) * 2 + 3, yPos + 7);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38);
    doc.text(`-${details.costs.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, startX + (boxWidth + 4) * 2 + 3, yPos + 18);
    
    // Est. Revenue
    doc.setFillColor(220, 252, 231);
    doc.roundedRect(startX + (boxWidth + 4) * 3, yPos, boxWidth, boxHeight, 2, 2, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Est. Revenue', startX + (boxWidth + 4) * 3 + 3, yPos + 7);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(22, 163, 74);
    doc.text(`+${details.estimatedRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, startX + (boxWidth + 4) * 3 + 3, yPos + 18);
    
    yPos += boxHeight + 8;

    // Inputs Section
    if (details.inputs && details.inputs.length > 0) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 100, 100);
      doc.text('Inputs:', 14, yPos);
      yPos += 5;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      details.inputs.forEach((input) => {
        doc.text(`• ${input.name}: ${input.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 18, yPos);
        yPos += 4;
      });
      yPos += 4;
    }

    // Challenges Summary
    if (details.challengesSummary) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 100, 100);
      doc.text('Challenges:', 14, yPos);
      yPos += 5;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      const challengeLines = doc.splitTextToSize(details.challengesSummary, 180);
      doc.text(challengeLines, 14, yPos);
      yPos += challengeLines.length * 4 + 4;
    }
    
    yPos += 8;
  }
  
  // Summary Section
  if (filteredAggregations.length > 0) {
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary', 14, yPos);
    yPos += 8;
    
    // Calculate totals including project-level costs
    const totalProjectCosts = project.details ? calculateTotalProjectCosts(project.details) : 0;
    const capital = project.details?.capital || 0;
    
    const totals = filteredAggregations.reduce(
      (acc, agg) => ({
        revenue: acc.revenue + agg.totalRevenue,
        produce: acc.produce + agg.totalProduceAmount,
        records: acc.records + agg.recordCount,
      }),
      { revenue: 0, produce: 0, records: 0 }
    );
    
    // Net profit = Revenue - Total Costs - Capital
    const netProfit = totals.revenue - totalProjectCosts - capital;
    
    // Summary boxes
    const boxWidth = 44;
    const boxHeight = 24;
    const startX = 14;
    
    // Total Records
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(startX, yPos, boxWidth, boxHeight, 2, 2, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Total Records', startX + 3, yPos + 7);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(totals.records.toString(), startX + 3, yPos + 18);
    
    // Total Produce
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(startX + boxWidth + 4, yPos, boxWidth, boxHeight, 2, 2, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Total Produce', startX + boxWidth + 7, yPos + 7);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(totals.produce.toLocaleString(), startX + boxWidth + 7, yPos + 18);
    
    // Total Costs (including capital)
    const totalAllCosts = totalProjectCosts + capital;
    doc.setFillColor(254, 226, 226);
    doc.roundedRect(startX + (boxWidth + 4) * 2, yPos, boxWidth, boxHeight, 2, 2, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Total Costs', startX + (boxWidth + 4) * 2 + 3, yPos + 7);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38);
    doc.text(`-${totalAllCosts.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, startX + (boxWidth + 4) * 2 + 3, yPos + 18);
    
    // Net Profit
    const isProfit = netProfit >= 0;
    doc.setFillColor(isProfit ? 220 : 254, isProfit ? 252 : 226, isProfit ? 231 : 226);
    doc.roundedRect(startX + (boxWidth + 4) * 3, yPos, boxWidth, boxHeight, 2, 2, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Net Profit', startX + (boxWidth + 4) * 3 + 3, yPos + 7);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(isProfit ? 22 : 220, isProfit ? 163 : 38, isProfit ? 74 : 38);
    doc.text(
      `${isProfit ? '+' : ''}${netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      startX + (boxWidth + 4) * 3 + 3,
      yPos + 18
    );
    
    yPos += boxHeight + 12;
  }
  
  // Monthly Breakdown Table (for full reports)
  if (type === 'full' && filteredAggregations.length > 0) {
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Monthly Breakdown', 14, yPos);
    yPos += 6;
    
    const monthlyData = filteredAggregations.map(agg => {
      const monthDate = parse(agg.month, 'yyyy-MM', new Date());
      return [
        format(monthDate, 'MMM yyyy'),
        agg.recordCount.toString(),
        agg.totalProduceAmount.toLocaleString(),
        `+${agg.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        `-${agg.totalInputCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        `${agg.netProfit >= 0 ? '+' : ''}${agg.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      ];
    });
    
    autoTable(doc, {
      startY: yPos,
      head: [['Month', 'Records', 'Produce', 'Revenue', 'Costs', 'Net Profit']],
      body: monthlyData,
      theme: 'striped',
      headStyles: { fillColor: primaryColor, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        3: { textColor: accentColor },
        4: { textColor: [220, 38, 38] },
        5: { fontStyle: 'bold' },
      },
    });
    
    yPos = (doc as any).lastAutoTable.finalY + 12;
  }
  
  // Records Table
  if (filteredRecords.length > 0) {
    // Check if we need a new page
    if (yPos > 220) {
      doc.addPage();
      yPos = 20;
    }
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Detailed Records', 14, yPos);
    yPos += 6;
    
    const recordsData = filteredRecords
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .map(record => [
        format(new Date(record.date), 'MMM d, yyyy'),
        record.item || '-',
        record.produceAmount.toLocaleString(),
        `+${(record.produceRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        record.isLocked ? '✓' : 'X',
        record.comment?.slice(0, 40) || '-',
      ]);
    
    autoTable(doc, {
      startY: yPos,
      head: [['Date', 'Item', 'Produce', 'Revenue', 'Lock', 'Comment']],
      body: recordsData,
      theme: 'striped',
      headStyles: { fillColor: primaryColor, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 30 },
        2: { cellWidth: 20 },
        3: { textColor: accentColor, cellWidth: 28 },
        4: { cellWidth: 12, halign: 'center' },
        5: { cellWidth: 50 },
      },
    });
  }
  
  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `FarmDeck | Page ${i} of ${pageCount}`,
      doc.internal.pageSize.width / 2,
      doc.internal.pageSize.height - 10,
      { align: 'center' }
    );
  }
  
  // Generate filename
  const dateStr = format(new Date(), 'yyyy-MM-dd');
  const monthStr = selectedMonth ? `-${selectedMonth}` : '';
  const filename = `FarmDeck_${project.title.replace(/\s+/g, '_')}${monthStr}_${dateStr}.pdf`;
  
  doc.save(filename);
}
