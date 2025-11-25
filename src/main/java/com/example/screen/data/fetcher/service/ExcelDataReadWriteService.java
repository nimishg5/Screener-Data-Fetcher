package com.example.screen.data.fetcher.service;

import org.apache.poi.ss.formula.functions.Column;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.jsoup.Connection;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.*;
import java.text.SimpleDateFormat;
import java.util.*;

@Service
public class ExcelDataReadWriteService {

    private Map<String, String> loginCookies;

    @Autowired
    private ScreenerDataFetcherService screenerDataFetcherService;

    @Value("${screener.username}")
    private String userName;

    @Value("${screener.password}")
    private String password;

    public void readColumnData(String excelFilePath, int columnIndex, int sheetIndex) throws IOException {
        System.out.println("...Started Processing....");
        try (FileInputStream fis = new FileInputStream(excelFilePath);
             final Workbook workbook = new XSSFWorkbook(fis)) {
             final Sheet sheet = workbook.getSheetAt(0); // get first sheet
             // fetch all header names only once on which data needs to be extracted
            final Set<String> headerSet = getHeaderNameList(sheet, 4);
            final Set<String> ticketSet = getAllTickers(sheet, 5);

            System.out.println(headerSet);
            System.out.println(ticketSet);

            boolean areHeadersWritten = false;
            String timeStamp = new SimpleDateFormat("dd-MM-yyyy HH.mm.ss").format(new Date());
            Sheet newSheet = workbook.createSheet("Report - " + timeStamp);
            int rowIndex = 1;
            int serialIndex = 1;
            for (String ticker : ticketSet) {
                System.out.println("------------------------");
                System.out.println("Fetching data for " + ticker);
                Map<String, String> ratiosMap = findBasicElementsAndAdvanced(ticker);
                // write data in excel as we know the ratiosMap for a particular ticker
                if (!ratiosMap.isEmpty()) {
                    writeDataForTicker(ticker, ratiosMap, newSheet, areHeadersWritten, rowIndex, serialIndex);
                    areHeadersWritten = true;
                    rowIndex++;
                    serialIndex++;
                }
                System.out.println("------------------------");
            }
            //autoSizeAndCloseWorkBook(ratiosMap, newSheet);
            saveWithOutputStreamAndWrite(workbook, excelFilePath);
            System.out.println("...Completed Processing....");
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    private void saveWithOutputStreamAndWrite(Workbook wb, String filePath) throws IOException {
        FileOutputStream fos = new FileOutputStream(new File(filePath));
        wb.write(fos);
    }

//    private void autoSizeAndCloseWorkBook(Map<String, String> ratiosMap, Sheet newSheet) {
//        // Auto-size columns
//        for (int i = 0; i < ratiosMap.size(); i++) {
//            newSheet.autoSizeColumn(i);
//        }
//    }

    private void writeDataForTicker(String ticker, Map<String, String> ratiosMap, Sheet newSheet, boolean areHeadersWritten, int rowIndex, int serial) {
        if (!areHeadersWritten) {
            writeHeaders(newSheet, ratiosMap);
        }

        // ---- Write data rows ----
        Row row = newSheet.createRow(rowIndex++);

        int col = 0;
        row.createCell(col++).setCellValue(serial++);
        row.createCell(col++).setCellValue(ticker);

        for (String key : ratiosMap.keySet()) {
            row.createCell(col++).setCellValue(ratiosMap.getOrDefault(key, ""));
        }

    }

    private void writeHeaders(Sheet newSheet, Map<String, String> ratioMap) {
        // write headers first
        Row headerRow = newSheet.createRow(0);
        headerRow.createCell(0).setCellValue("S No.");
        headerRow.createCell(1).setCellValue("Ticker");
        int index = 2;
        Iterator<Map.Entry<String, String>> iterator = ratioMap.entrySet().iterator();
        while (iterator.hasNext()) {
            Map.Entry<String, String> entry = iterator.next();
            headerRow.createCell(index).setCellValue(entry.getKey());
            index++;
        }
    }

    private String getDataFromScreenerApi(String ticker) {
        return screenerDataFetcherService.fetchDataFromScreener(ticker);
    }

    private Set<String> getHeaderNameList(Sheet sheet, int indexOfHeaders) {
        Set<String> headerNameSet = new HashSet<>();

        // Get actual row from Excel using getRow(), NOT createRow()
        final Row headerRow = sheet.getRow(indexOfHeaders);
        if (headerRow == null) {
            System.out.println("Header row is empty or missing!");
            return headerNameSet;
        }

        int lastCellNum = headerRow.getLastCellNum();
        System.out.println("Header cells count = " + lastCellNum);

        for (int cellIndex = 0; cellIndex < lastCellNum; cellIndex++) {
            final Cell cell = headerRow.getCell(cellIndex);
            if (cell == null || cell.getStringCellValue().isEmpty() || cell.getStringCellValue().isBlank()) {
                continue;
            }

            headerNameSet.add(cell.getStringCellValue());
        }

        return headerNameSet;
    }

    private Set<String> getAllTickers(Sheet sheet, int indexOfTickers) {
        Set<String> tickerNameSet = new HashSet<>();

        for (int i=indexOfTickers; i<sheet.getLastRowNum(); i++) {
            // Get actual row from Excel using getRow(), NOT createRow()
            final Row tickerNameStartRow = sheet.getRow(i);

            int lastCellNum = tickerNameStartRow.getLastCellNum();

            for (int cellIndex = 1; cellIndex < 2; cellIndex++) {
                final Cell cell = tickerNameStartRow.getCell(cellIndex);
                if (cell == null || cell.getStringCellValue().isEmpty() || cell.getStringCellValue().isBlank()) {
                    continue;
                }

                tickerNameSet.add(cell.getStringCellValue());
            }
        }

        return tickerNameSet;
    }

    private Map<String, String> findBasicElementsAndAdvanced(String ticker) throws IOException {
        final String screenerBasicRatioUrl = "https://www.screener.in/company/"+ticker+"/consolidated/";
        Document doc = Jsoup.connect(screenerBasicRatioUrl).get();
        Map<String, String> ratiosMap = new HashMap<>();
        fetchRatios(ratiosMap, doc);
        final String screenerLoginUrl = "https://www.screener.in/login/?next=/dashboard/";
        String code = fetchTickerCode(doc);
        String advancedRatioUrl = "https://www.screener.in/api/company/"+code+"/quick_ratios/";

        if (loginCookies == null || loginCookies.isEmpty() ) {
            fetchLoginCookiesAndRatios(ratiosMap, advancedRatioUrl);

        } else {
            // call loginCookies only when session is expired
            doc = Jsoup.connect(advancedRatioUrl).cookies(loginCookies).get();
            if (doc.title().contains("Login")) {
                fetchLoginCookiesAndRatios(ratiosMap, advancedRatioUrl);
            } else {
                fetchRatios(ratiosMap, doc);
            }
        }

        System.out.println("Data for Ticker : "+ ticker + " is : " + ratiosMap);
        return ratiosMap;
    }

    private void fetchLoginCookiesAndRatios(Map<String, String> ratiosMap, String advancedRatioUrl) throws IOException {
        // session is expired
        // token expired refresh token and hit api again
        loginCookies = fetchLoginResponseCookies();
        Document doc = Jsoup.connect(advancedRatioUrl).cookies(loginCookies).get();
        fetchRatios(ratiosMap, doc);
    }

    private void fetchRatios(Map<String, String> ratiosMap, Document doc) {
        try {
            // Select the <li> with both classes
            Elements elements = doc.select("li.flex.flex-space-between");

            for (Element element : elements) {
                String key = element.select("span.name").text().trim();
                // Extract only the number inside <span class="number">
                String value = element.select("span.value .number").text().trim();
                ratiosMap.put(key, value);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private Map<String, String> fetchLoginResponseCookies() {
        try {

            //
            System.out.println("Fetching token from screener url");
            // 1) GET login page to receive CSRF
            Connection.Response loginForm = Jsoup.connect("https://www.screener.in/login/")
                    .method(Connection.Method.GET)
                    .header("User-Agent", "Mozilla/5.0")
                    .execute();

            String csrfToken = loginForm.cookie("csrftoken");
            System.out.println("CSRF = " + csrfToken);

            // 2) POST login using same cookies
            Connection.Response loginResponse = Jsoup.connect("https://www.screener.in/login/")
                    .cookies(loginForm.cookies())
                    .data("username", userName)
                    .data("password", password)
                    .data("csrfmiddlewaretoken", csrfToken)
                    .header("User-Agent", "Mozilla/5.0")
                    .header("Referer", "https://www.screener.in/login/")
                    .method(Connection.Method.POST)
                    .followRedirects(true)
                    .execute();

            System.out.println("LOGIN COOKIES = " + loginResponse.cookies());

            return loginResponse.cookies();
        } catch (Exception e) {
            e.printStackTrace();
        }

        return Collections.emptyMap();
    }

    private String fetchTickerCode(Document doc) {
        // Select the div by id
        Element div = doc.selectFirst("#company-info");
        String warehouseId = "";
        if (div != null) {
            warehouseId = div.attr("data-warehouse-id");
            System.out.println("Warehouse ID = " + warehouseId);
        }
        return warehouseId;
    }


}
