package com.example.screen.data.fetcher.service;

import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.jsoup.Connection;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.springframework.beans.factory.annotation.Autowired;

import org.springframework.stereotype.Service;

import java.io.*;
import java.text.SimpleDateFormat;
import java.util.*;

import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class ScreenerAnalysisService {

    private Map<String, String> loginCookies;

    @Autowired
    private ScreenerDataFetcherService screenerDataFetcherService;

    @Autowired
    private ChartGeneratorService chartGeneratorService;

    private String userName;
    private String password;

    public boolean login(String username, String password) {
        this.userName = username;
        this.password = password;
        this.loginCookies = fetchLoginResponseCookies();
        return !this.loginCookies.isEmpty();
    }

    public void logout() {
        this.userName = null;
        this.password = null;
        if (this.loginCookies != null) {
            this.loginCookies.clear();
        }
    }

    public void readColumnData(String excelFilePath, int columnIndex, int sheetIndex) throws IOException {
        log.info("...Started Processing....");
        try (FileInputStream fis = new FileInputStream(excelFilePath);
                final Workbook workbook = new XSSFWorkbook(fis)) {
            final Sheet sheet = workbook.getSheetAt(0); // get first sheet
            // fetch all header names only once on which data needs to be extracted
            final Set<String> headerSet = getHeaderNameList(sheet, 4);
            final Set<String> ticketSet = getAllTickers(sheet, 5);

            Map<String, Map<String, String>> tickerMapRatio = new HashMap<>();

            log.debug("Header Set: {}", headerSet);
            log.debug("Ticker Set: {}", ticketSet);

            boolean areHeadersWritten = false;
            String timeStamp = new SimpleDateFormat("dd-MM-yyyy HH.mm.ss").format(new Date());
            Sheet newSheet = workbook.createSheet("Report - " + timeStamp);
            int rowIndex = 1;
            int serialIndex = 1;
            for (String ticker : ticketSet) {
                log.info("------------------------");
                log.info("Fetching data for {}", ticker);
                Map<String, String> ratiosMap = findBasicElementsAndAdvanced(ticker);
                tickerMapRatio.put(ticker, ratiosMap);
                // write data in excel as we know the ratiosMap for a particular ticker
                if (!ratiosMap.isEmpty()) {
                    writeDataForTicker(ticker, ratiosMap, newSheet, areHeadersWritten, rowIndex, serialIndex);
                    areHeadersWritten = true;
                    rowIndex++;
                    serialIndex++;
                }
                serialIndex++;
            }
            log.info("------------------------");

            Sheet comparisonSheet = workbook.createSheet("Comparison Sheet2");

            String ticker1 = "TCS", ticker2 = "INFY";

            // Fetch data for both tickers
            Map<String, String> ticker1Data = findBasicElementsAndAdvanced(ticker1);
            Map<String, String> ticker2Data = findBasicElementsAndAdvanced(ticker2);

            if (ticker1Data.isEmpty() || ticker2Data.isEmpty()) {
                log.warn("Could not fetch data for one or both tickers");
                return;
            }

            // Create clean comparison sheet with color-coded table
            chartGeneratorService.createSimpleComparisonSheet((XSSFWorkbook) workbook, ticker1, ticker1Data, ticker2,
                    ticker2Data);

            // Optionally also generate and embed the chart
            String chartImagePath = excelFilePath.replace(".xlsx", "_" + ticker1 + "_vs_" + ticker2 + ".png");
            chartGeneratorService.generateSimpleComparisonBarChart(ticker1, ticker1Data, ticker2, ticker2Data,
                    chartImagePath);

            chartGeneratorService.embedChartInExcel((XSSFWorkbook) workbook, comparisonSheet, chartImagePath, 18, 0);

            // autoSizeAndCloseWorkBook(ratiosMap, newSheet);
            saveWithOutputStreamAndWrite(workbook, excelFilePath);
            log.info("...Completed Processing....");
        } catch (

        IOException e) {
            log.error("Error processing Excel file", e);
        }
    }

    private void saveWithOutputStreamAndWrite(Workbook wb, String filePath) throws IOException {
        FileOutputStream fos = new FileOutputStream(new File(filePath));
        wb.write(fos);
    }

    // private void autoSizeAndCloseWorkBook(Map<String, String> ratiosMap, Sheet
    // newSheet) {
    // // Auto-size columns
    // for (int i = 0; i < ratiosMap.size(); i++) {
    // newSheet.autoSizeColumn(i);
    // }
    // }

    private void writeDataForTicker(String ticker, Map<String, String> ratiosMap, Sheet newSheet,
            boolean areHeadersWritten, int rowIndex, int serial) {
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
            log.warn("Header row is empty or missing!");
            return headerNameSet;
        }

        int lastCellNum = headerRow.getLastCellNum();
        log.debug("Header cells count = {}", lastCellNum);

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

        for (int i = indexOfTickers; i < sheet.getLastRowNum(); i++) {
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

    @Autowired
    private MoneyControlService moneyControlService;

    public Map<String, Object> getCorporateActions(String ticker) {
        log.info("Fetching corporate actions for {} from Moneycontrol", ticker);
        return moneyControlService.getCorporateActions(ticker);
    }

    public Map<String, String> findBasicElementsAndAdvanced(String ticker) {
        try {
            final String screenerBasicRatioUrl = "https://www.screener.in/company/" + ticker + "/consolidated/";
            Document doc = Jsoup.connect(screenerBasicRatioUrl).get();
            Map<String, String> ratiosMap = new HashMap<>();
            fetchRatios(ratiosMap, doc);
            final String screenerLoginUrl = "https://www.screener.in/login/?next=/dashboard/";
            String code = fetchTickerCode(doc);
            String advancedRatioUrl = "https://www.screener.in/api/company/" + code + "/quick_ratios/";

            if (loginCookies == null || loginCookies.isEmpty()) {
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

            // Extract Industry/Sector
            try {
                String industry = "Others";
                Element peersSection = doc.selectFirst("#peers");

                // Fallback if #peers ID is not found
                if (peersSection == null) {
                    log.warn("#peers section not found for {}, trying text search", ticker);
                    Elements headers = doc.select("h2");
                    for (Element h : headers) {
                        if (h.text().trim().equalsIgnoreCase("Peer comparison")) {
                            // The content is usually in the parent section or following sibling
                            peersSection = h.parent();
                            break;
                        }
                    }
                }

                if (peersSection != null) {
                    Elements sectorLinks = peersSection.select("a[href*='/market/']");
                    if (!sectorLinks.isEmpty()) {
                        industry = sectorLinks.first().text().trim();
                        log.info("Extracted Industry for {}: {}", ticker, industry);
                    } else {
                        log.warn("Peers section found but no market links for {}", ticker);
                    }
                } else {
                    log.warn("Peers section completely missing for {}", ticker);
                }

                // Fallback: Check for breadcrumbs if peers extraction failed
                if ("Others".equals(industry)) {
                    Elements breadcrumbs = doc.select("ul.breadcrumbs li a");
                    if (breadcrumbs.isEmpty()) {
                        breadcrumbs = doc.select(".breadcrumbs a");
                    }

                    if (breadcrumbs.size() > 1) {
                        industry = breadcrumbs.get(1).text().trim();
                        log.info("Extracted Industry from breadcrumbs for {}: {}", ticker, industry);
                    }
                }

                ratiosMap.put("Industry", industry);

            } catch (Exception e) {
                log.warn("Failed to extract industry for {}: {}", ticker, e.getMessage());
                ratiosMap.put("Industry", "Others");
            }

            log.debug("Data for Ticker : {} is : {}", ticker, ratiosMap);
            return ratiosMap;
        } catch (Exception e) {
            log.error("Error fetching data for ticker: {}. Error: {}", ticker, e.getMessage());
            return null;
        }
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
                Elements numberElements = element.select("span.value .number");
                String value;
                if (numberElements.size() > 1) {
                    List<String> values = new ArrayList<>();
                    for (Element num : numberElements) {
                        values.add(num.text().trim());
                    }
                    value = String.join(" / ", values);
                } else {
                    value = numberElements.text().trim();
                }
                ratiosMap.put(key, value);
            }
        } catch (Exception e) {
            log.error("Error fetching ratios", e);
        }
    }

    private Map<String, String> fetchLoginResponseCookies() {
        try {

            //
            log.debug("Fetching token from screener url");
            // 1) GET login page to receive CSRF
            Connection.Response loginForm = Jsoup.connect("https://www.screener.in/login/")
                    .method(Connection.Method.GET)
                    .header("User-Agent", "Mozilla/5.0")
                    .execute();

            String csrfToken = loginForm.cookie("csrftoken");
            log.debug("CSRF = {}", csrfToken);

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

            log.debug("Login Response URL: {}", loginResponse.url());

            // Check if we are still on the login page (login failed)
            if (loginResponse.url().toString().contains("/login")) {
                log.warn("Login failed: Invalid credentials");
                return Collections.emptyMap();
            }

            log.info("Login successful. Cookies obtained.");

            return loginResponse.cookies();
        } catch (Exception e) {
            log.error("Error during login", e);
        }

        return Collections.emptyMap();
    }

    private String fetchTickerCode(Document doc) {
        // Select the div by id
        Element div = doc.selectFirst("#company-info");
        String warehouseId = "";
        if (div != null) {
            warehouseId = div.attr("data-warehouse-id");
        }
        return warehouseId;
    }

    private Map<String, Double> parseRevenueSplit(String text) {
        Map<String, Double> split = new HashMap<>();
        try {
            // Normalize text
            String lowerText = text; // Keep case for display but use lower for checks if needed

            // Pattern 1: "Name : Value%" (e.g., "BFSI : 32.6%")
            // Pattern 2: "Name - Value%"
            // Pattern 3: "Name (Value%)"

            // We'll try a generic regex that captures a name followed by a separator and a
            // percentage
            // ([A-Za-z &,-]+) -> Name (letters, spaces, &, , -)
            // \s*[:\(-]\s* -> Separator (: or - or ()
            // (\d+(?:\.\d+)?)% -> Percentage

            java.util.regex.Pattern p = java.util.regex.Pattern
                    .compile("([A-Za-z &,-]+?)\\s*[:\\(-]\\s*(\\d+(?:\\.\\d+)?)%");
            java.util.regex.Matcher m = p.matcher(text);

            while (m.find()) {
                String name = m.group(1).trim();
                // Clean up name (remove leading "Revenue Breakup" etc if captured)
                if (name.contains("Revenue Breakup")) {
                    name = name.substring(name.lastIndexOf("Revenue Breakup") + 15).trim();
                }
                // Remove common noise words from start
                name = name.replaceAll("^(and|of|in)\\s+", "");

                if (name.length() > 50 || name.length() < 2)
                    continue; // Ignore likely invalid matches

                double val = Double.parseDouble(m.group(2));
                split.put(name, val);
            }

            // If the generic pattern didn't work, try the specific "exports" one
            if (split.isEmpty() && text.toLowerCase().contains("export")) {
                java.util.regex.Pattern pExport = java.util.regex.Pattern.compile("export.*?(\\d+(?:\\.\\d+)?)%");
                java.util.regex.Matcher mExport = pExport.matcher(text.toLowerCase());
                if (mExport.find()) {
                    double exportPct = Double.parseDouble(mExport.group(1));
                    split.put("Exports", exportPct);
                    split.put("Domestic", 100.0 - exportPct);
                }
            }

        } catch (Exception e) {
            log.error("Error parsing revenue split: {}", e.getMessage());
        }
        return split;
    }

    @Autowired
    private NewsService newsService;

    public Map<String, Object> getGeoAnalysis(String ticker) {
        Map<String, Object> result = new HashMap<>();
        try {
            // 1. Fetch Revenue Split
            String screenerUrl = "https://www.screener.in/company/" + ticker + "/consolidated/";
            Document doc = Jsoup.connect(screenerUrl).get();
            Element aboutSection = doc.selectFirst(".company-profile .about p");
            String aboutText = aboutSection != null ? aboutSection.text() : "";

            log.debug("About Text for {}: {}", ticker, aboutText);

            Map<String, Double> revenueSplit = parseRevenueSplit(aboutText);
            result.put("revenueSplit", revenueSplit);

            // 2. Fetch News
            // Determine which countries/regions to fetch news for
            Set<String> regionsToFetch = new HashSet<>();

            // Check if keys are likely countries/regions
            boolean hasGeoKeys = false;
            String[] commonRegions = { "USA", "America", "Europe", "UK", "India", "China", "Asia", "Global", "Domestic",
                    "Exports" };

            for (String key : revenueSplit.keySet()) {
                for (String region : commonRegions) {
                    if (key.toLowerCase().contains(region.toLowerCase())) {
                        hasGeoKeys = true;
                        // Map "Domestic" to "India" (assuming Indian company context for Screener.in)
                        if (key.equalsIgnoreCase("Domestic"))
                            regionsToFetch.add("India");
                        else if (key.equalsIgnoreCase("Exports"))
                            regionsToFetch.add("Global");
                        else
                            regionsToFetch.add(key);
                        break;
                    }
                }
            }

            if (!hasGeoKeys) {
                // If keys are industries (BFSI, etc.) or empty, default to India & Global
                regionsToFetch.add("India");
                regionsToFetch.add("Global");
            }

            Map<String, List<Map<String, String>>> countryNews = new HashMap<>();
            for (String region : regionsToFetch) {
                if (region.equalsIgnoreCase("Rest of World") || region.equalsIgnoreCase("Others"))
                    continue;

                String query = ticker + " " + region;
                List<Map<String, String>> news = newsService.fetchNews(query);
                countryNews.put(region, news);
            }
            result.put("news", countryNews);

        } catch (Exception e) {
            log.error("Error in getGeoAnalysis", e);
            result.put("error", e.getMessage());
        }
        return result;
    }

    public List<Map<String, String>> searchTickers(String query) {
        List<Map<String, String>> suggestions = new ArrayList<>();
        try {
            String searchUrl = "https://www.screener.in/api/company/search/?q="
                    + java.net.URLEncoder.encode(query, "UTF-8");

            // Fetch JSON response using Jsoup
            String jsonResponse = Jsoup.connect(searchUrl)
                    .ignoreContentType(true)
                    .header("User-Agent", "Mozilla/5.0")
                    .execute()
                    .body();

            log.debug("Search JSON Response: {}", jsonResponse);

            // Parse JSON using Regex to avoid dependency issues
            // Pattern to match: "name": "...", "url": "..."
            // We split by "}" to handle multiple objects roughly
            String[] objects = jsonResponse.split("}");

            java.util.regex.Pattern namePattern = java.util.regex.Pattern.compile("\"name\"\\s*:\\s*\"([^\"]+)\"");
            java.util.regex.Pattern urlPattern = java.util.regex.Pattern.compile("\"url\"\\s*:\\s*\"([^\"]+)\"");

            for (String obj : objects) {
                java.util.regex.Matcher nameMatcher = namePattern.matcher(obj);
                java.util.regex.Matcher urlMatcher = urlPattern.matcher(obj);

                if (nameMatcher.find() && urlMatcher.find()) {
                    String name = nameMatcher.group(1);
                    String url = urlMatcher.group(1);

                    // Extract ticker from URL (e.g., /company/TCS/consolidated/ -> TCS)
                    String ticker = "";
                    if (url.startsWith("/company/")) {
                        String[] parts = url.split("/");
                        if (parts.length > 2) {
                            ticker = parts[2];
                        }
                    }

                    if (!ticker.isEmpty()) {
                        Map<String, String> item = new HashMap<>();
                        item.put("ticker", ticker);
                        item.put("name", name);
                        suggestions.add(item);
                    }
                }
            }

        } catch (Throwable e) {
            log.error("Error searching tickers for query: {}", query, e);
        }
        return suggestions;
    }
}
