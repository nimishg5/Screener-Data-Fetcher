package com.example.screen.data.fetcher.service;

import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.jfree.chart.ChartFactory;
import org.jfree.chart.ChartUtils;
import org.jfree.chart.JFreeChart;
import org.jfree.chart.axis.CategoryAxis;
import org.jfree.chart.plot.CategoryPlot;
import org.jfree.chart.plot.PlotOrientation;
import org.jfree.chart.renderer.category.BarRenderer;
import org.jfree.data.category.DefaultCategoryDataset;
import org.springframework.stereotype.Service;

import java.awt.Color;
import java.awt.Font;
import java.io.*;
import java.util.*;

@Service
public class ChartGeneratorService {

    /**
     * Generates a clean horizontal bar chart comparing two tickers
     * Shows only top 10 most important metrics for clarity
     */
    public void generateSimpleComparisonBarChart(String ticker1, Map<String, String> ticker1Data,
                                                 String ticker2, Map<String, String> ticker2Data,
                                                 String outputPath) throws IOException {

        DefaultCategoryDataset dataset = new DefaultCategoryDataset();

        // Get only numeric metrics and limit to top 10
        int metricCount = 0;
        int maxMetrics = 10;

        for (String metric : ticker1Data.keySet()) {
            if (metricCount >= maxMetrics) break;

            if (ticker2Data.containsKey(metric)) {
                try {
                    double value1 = Double.parseDouble(ticker1Data.get(metric));
                    double value2 = Double.parseDouble(ticker2Data.get(metric));

                    // Only add if values are reasonable (not too large)
                    if (value1 < 1000000 && value2 < 1000000) {
                        dataset.addValue(value1, ticker1, metric);
                        dataset.addValue(value2, ticker2, metric);
                        metricCount++;
                    }
                } catch (NumberFormatException e) {
                    // Skip non-numeric values
                    continue;
                }
            }
        }

        // Create horizontal bar chart for better readability
        JFreeChart chart = ChartFactory.createBarChart(
                "Ticker Comparison: " + ticker1 + " vs " + ticker2,
                "Metrics",
                "Values",
                dataset,
                PlotOrientation.HORIZONTAL,  // Horizontal for better readability
                true,  // Include legend
                true,
                false
        );

        // Customize the plot
        CategoryPlot plot = chart.getCategoryPlot();
        plot.setBackgroundPaint(new Color(240, 240, 240));
        plot.setDomainGridlinePaint(Color.WHITE);
        plot.setRangeGridlinePaint(Color.LIGHT_GRAY);

        // Customize the domain axis (Y-axis - metrics)
        CategoryAxis domainAxis = plot.getDomainAxis();
        domainAxis.setTickLabelFont(new Font("Arial", Font.PLAIN, 11));
        domainAxis.setLabelFont(new Font("Arial", Font.BOLD, 12));

        // Customize renderer
        BarRenderer renderer = (BarRenderer) plot.getRenderer();
        renderer.setSeriesPaint(0, new Color(52, 168, 224));   // Light blue for ticker1
        renderer.setSeriesPaint(1, new Color(255, 127, 39));   // Orange for ticker2
        renderer.setMaximumBarWidth(0.7);

        // Save chart with larger dimensions for clarity
        ChartUtils.saveChartAsPNG(new File(outputPath), chart, 1200, 600);
        System.out.println("Chart saved to: " + outputPath);
    }

    /**
     * Alternative: Creates a simple line-based comparison table directly in Excel
     * Much cleaner and easier to understand than embedded charts
     */
    public void createSimpleComparisonSheet(XSSFWorkbook workbook, String ticker1, Map<String, String> ticker1Data,
                                            String ticker2, Map<String, String> ticker2Data) {

        Sheet comparisonSheet = workbook.createSheet("Comparison");

        // Create title
        Row titleRow = comparisonSheet.createRow(0);
        Cell titleCell = titleRow.createCell(0);
        titleCell.setCellValue("Comparison: " + ticker1 + " vs " + ticker2);
        CellStyle titleStyle = workbook.createCellStyle();
        org.apache.poi.ss.usermodel.Font titleFont = workbook.createFont();
        titleFont.setBold(true);
        titleFont.setFontHeightInPoints((short) 16);
        titleStyle.setFont(titleFont);
        titleCell.setCellStyle(titleStyle);

        // Create header row
        Row headerRow = comparisonSheet.createRow(2);
        String[] headers = {"Metric", ticker1, ticker2, "Difference", "% Change"};
        CellStyle headerStyle = workbook.createCellStyle();
        org.apache.poi.ss.usermodel.Font headerFont = workbook.createFont();
        headerFont.setBold(true);
        headerFont.setColor(IndexedColors.WHITE.getIndex());
        headerStyle.setFont(headerFont);
        headerStyle.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex());
        headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);

        for (int i = 0; i < headers.length; i++) {
            Cell cell = headerRow.createCell(i);
            cell.setCellValue(headers[i]);
            cell.setCellStyle(headerStyle);
        }

        // Add data rows with color coding
        int rowNum = 3;
        int metricCount = 0;

        for (String metric : ticker1Data.keySet()) {
            if (metricCount >= 15) break;  // Limit to 15 metrics

            if (ticker2Data.containsKey(metric)) {
                Row dataRow = comparisonSheet.createRow(rowNum);

                dataRow.createCell(0).setCellValue(metric);
                dataRow.createCell(1).setCellValue(ticker1Data.get(metric));
                dataRow.createCell(2).setCellValue(ticker2Data.get(metric));

                try {
                    double val1 = Double.parseDouble(ticker1Data.get(metric));
                    double val2 = Double.parseDouble(ticker2Data.get(metric));
                    double diff = val1 - val2;

                    // Avoid division by zero
                    double percentChange = (val2 != 0) ? (diff / val2) * 100 : 0;

                    Cell diffCell = dataRow.createCell(3);
                    diffCell.setCellValue(String.format("%.2f", diff));

                    Cell percentCell = dataRow.createCell(4);
                    percentCell.setCellValue(String.format("%.2f%%", percentChange));

                    // Color code: Green if ticker1 is better, Red if ticker2 is better
                    CellStyle dataStyle = workbook.createCellStyle();
                    if (diff > 0) {
                        dataStyle.setFillForegroundColor(IndexedColors.LIGHT_GREEN.getIndex());
                        dataStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
                        dataRow.getCell(3).setCellStyle(dataStyle);
                    } else if (diff < 0) {
                        dataStyle.setFillForegroundColor(IndexedColors.LIGHT_ORANGE.getIndex());
                        dataStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
                        dataRow.getCell(3).setCellStyle(dataStyle);
                    }

                    metricCount++;
                } catch (NumberFormatException e) {
                    dataRow.createCell(3).setCellValue("N/A");
                    dataRow.createCell(4).setCellValue("N/A");
                    metricCount++;
                }

                rowNum++;
            }
        }

        // Auto-size columns for better readability
        comparisonSheet.autoSizeColumn(0);
        comparisonSheet.autoSizeColumn(1);
        comparisonSheet.autoSizeColumn(2);
        comparisonSheet.autoSizeColumn(3);
        comparisonSheet.autoSizeColumn(4);
    }

    /**
     * Embeds chart image into Excel sheet
     */
    public void embedChartInExcel(XSSFWorkbook workbook, Sheet sheet, String imagePath,
                                  int startRow, int startCol) throws IOException {

        FileInputStream imageStream = new FileInputStream(new File(imagePath));
        byte[] imageBytes = imageStream.readAllBytes();
        imageStream.close();

        int pictureIndex = workbook.addPicture(imageBytes, Workbook.PICTURE_TYPE_PNG);
        Drawing<?> drawing = sheet.createDrawingPatriarch();

        ClientAnchor anchor = workbook.getCreationHelper().createClientAnchor();
        anchor.setCol1(startCol);
        anchor.setRow1(startRow);
        anchor.setCol2(startCol + 8);
        anchor.setRow2(startRow + 20);

        drawing.createPicture(anchor, pictureIndex);
    }
}