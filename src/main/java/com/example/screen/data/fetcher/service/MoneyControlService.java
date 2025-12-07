package com.example.screen.data.fetcher.service;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.springframework.stereotype.Service;
import lombok.extern.slf4j.Slf4j;

import java.io.IOException;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.transaction.Transactional;

@Service
@Slf4j
public class MoneyControlService {

    private static final String AUTOSUGGEST_URL = "https://www.moneycontrol.com/mccode/common/autosuggestion_solr.php?classic=true&query=%s&type=1&format=json";

    // Pattern to extract slug and ID from Moneycontrol URL
    // Example:
    // https://www.moneycontrol.com/india/stockpricequote/computers-software/tataconsultancyservices/TCS
    private static final Pattern URL_PATTERN = Pattern
            .compile("moneycontrol\\.com/india/stockpricequote/[^/]+/([^/]+)/([^/]+)");

    public Map<String, Object> getCorporateActions(String ticker) {
        Map<String, Object> result = new HashMap<>();
        try {
            // 1. Search for the company to get the slug
            String[] companyDetails = searchCompany(ticker);
            if (companyDetails == null) {
                result.put("error", "Company not found on Moneycontrol");
                return result;
            }

            String slug = companyDetails[0];
            String mcId = companyDetails[1];

            log.info("Found Moneycontrol details for {}: Slug={}, ID={}", ticker, slug, mcId);

            // 2. Fetch Actions
            result.put("dividends", fetchAction(slug, mcId, "dividends"));
            result.put("bonus", fetchAction(slug, mcId, "bonus"));
            result.put("splits", fetchAction(slug, mcId, "splits"));
            result.put("rights", fetchAction(slug, mcId, "rights"));

            return result;

        } catch (Exception e) {
            log.error("Error fetching corporate actions from Moneycontrol for {}", ticker, e);
            result.put("error", e.getMessage());
            return result;
        }
    }

    private String[] searchCompany(String ticker) throws IOException {
        String url = String.format(AUTOSUGGEST_URL, ticker);
        String jsonResponse = Jsoup.connect(url)
                .ignoreContentType(true)
                .header("User-Agent", "Mozilla/5.0")
                .execute()
                .body();

        // Simple JSON parsing to find "link_src"
        // We expect an array of objects. We take the first one.
        int linkSrcIndex = jsonResponse.indexOf("\"link_src\":\"");
        if (linkSrcIndex == -1)
            return null;

        int start = linkSrcIndex + 12;
        int end = jsonResponse.indexOf("\"", start);
        String linkSrc = jsonResponse.substring(start, end).replace("\\/", "/");

        Matcher matcher = URL_PATTERN.matcher(linkSrc);
        if (matcher.find()) {
            return new String[] { matcher.group(1), matcher.group(2) };
        }
        return null;
    }

    private Map<String, List<Map<String, String>>> fetchAction(String slug, String mcId, String actionType) {
        Map<String, List<Map<String, String>>> result = new HashMap<>();
        List<Map<String, String>> upcoming = new ArrayList<>();
        List<Map<String, String>> previous = new ArrayList<>();

        // URL Pattern:
        // https://www.moneycontrol.com/company-facts/tataconsultancyservices/dividends/TCS/
        String url = String.format("https://www.moneycontrol.com/company-facts/%s/%s/%s/", slug, actionType, mcId);

        try {
            log.info("Fetching {} from URL: {}", actionType, url);
            Document doc = Jsoup.connect(url)
                    .header("User-Agent",
                            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36")
                    .followRedirects(true)
                    .get();

            // Try to parse from Next.js JSON first
            boolean jsonParsed = parseNextJsData(doc, actionType, upcoming, previous);

            if (!jsonParsed) {
                // Fallback to HTML Table parsing
                log.info("JSON data not found or empty for {}, falling back to HTML table parsing", actionType);
                parseHtmlTable(doc, upcoming, previous, actionType);
            }

        } catch (Exception e) {
            log.error("Error fetching {} for {}", actionType, slug, e);
        }

        result.put("upcoming", upcoming);
        result.put("previous", previous);
        return result;
    }

    @SuppressWarnings("unchecked")
    private boolean parseNextJsData(Document doc, String actionType, List<Map<String, String>> upcoming,
            List<Map<String, String>> previous) {
        try {
            Element script = doc.selectFirst("script[id=__NEXT_DATA__]");
            if (script == null)
                return false;

            String jsonContent = script.html();
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            Map<String, Object> nextData = mapper.readValue(jsonContent, Map.class);

            // Navigate: props -> pageProps -> data -> tabsData -> [actionType]
            Map<String, Object> props = (Map<String, Object>) nextData.get("props");
            if (props == null)
                return false;

            Map<String, Object> pageProps = (Map<String, Object>) props.get("pageProps");
            if (pageProps == null)
                return false;

            Map<String, Object> data = (Map<String, Object>) pageProps.get("data");
            if (data == null)
                return false;

            Map<String, Object> tabsData = (Map<String, Object>) data.get("tabsData");
            if (tabsData == null)
                return false;

            List<Map<String, Object>> actions = (List<Map<String, Object>>) tabsData.get(actionType);
            if (actions == null || actions.isEmpty())
                return false;

            log.info("Found {} items in JSON for {}", actions.size(), actionType);

            Date today = new Date();
            // Formats seen in JSON: "25 Apr, 2025", "14 Aug, 2025"
            java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat("dd MMM, yyyy");

            for (Map<String, Object> act : actions) {
                Map<String, String> row = new LinkedHashMap<>(); // Use LinkedHashMap for order

                // Common fields
                String announcement = toStringSafe(act.get("disp_announce_date"));
                if (announcement.isEmpty())
                    announcement = toStringSafe(act.get("announcement_date"));
                if (announcement.isEmpty())
                    announcement = toStringSafe(act.get("announce_date"));
                row.put("Announcement", announcement);

                // Map fields based on action type
                if ("dividends".equals(actionType)) {
                    // JSON keys: announce_date, dividend_type, dividend_per, effective_date,
                    // remarks, dividend_amount
                    row.put("Ex-Date", toStringSafe(act.get("effective_date")));
                    row.put("Type", toStringSafe(act.get("dividend_type")));
                    row.put("Dividend(Rs)", toStringSafe(act.get("dividend_amount"))); // Requested Column
                    row.put("Dividend %", toStringSafe(act.get("dividend_per")));
                    row.put("Remarks", toStringSafe(act.get("remarks")));

                } else if ("bonus".equals(actionType)) {
                    // JSON keys: announce_date, ratio, effective_date, remarks
                    // For Bonus, Moneycontrol uses "exbonus_date" or "effective_date"
                    String exDate = toStringSafe(act.get("exbonus_date"));
                    if (exDate.isEmpty())
                        exDate = toStringSafe(act.get("effective_date"));
                    row.put("Ex-Date", exDate);

                    // Ratio might be in "bonus_ratio" (e.g., "1:2") or constructed from
                    // existing/offered
                    String ratio = toStringSafe(act.get("bonus_ratio"));
                    if (ratio.isEmpty())
                        ratio = toStringSafe(act.get("ratio"));
                    row.put("Ratio", ratio);
                    row.put("Remarks", toStringSafe(act.get("remarks")));

                } else if ("splits".equals(actionType)) {
                    // JSON keys: announce_date, old_fv, new_fv, effective_date
                    // For Splits, Moneycontrol uses "exsplit_date"
                    String splitDate = toStringSafe(act.get("exsplit_date"));
                    if (splitDate.isEmpty())
                        splitDate = toStringSafe(act.get("effective_date"));
                    row.put("Split Date", splitDate);

                    row.put("Old FV", toStringSafe(act.get("old_fv")));
                    row.put("New FV", toStringSafe(act.get("new_fv")));

                } else if ("rights".equals(actionType)) {
                    // Rights often use 'effective_date' or 'exrights_date' (need to verify, but
                    // effective_date is common fallback)
                    row.put("Ex-Date", toStringSafe(act.get("effective_date")));
                    row.put("Ratio", toStringSafe(act.get("ratio")));
                    row.put("Premium", toStringSafe(act.get("premium")));
                }

                // Determine if upcoming
                String dateStr = row.containsKey("Ex-Date") ? row.get("Ex-Date") : row.get("Announcement");
                if ("splits".equals(actionType)) {
                    dateStr = row.get("Split Date");
                }

                boolean isUpcoming = false;
                if (dateStr != null && !dateStr.isEmpty()) {
                    try {
                        Date d = sdf.parse(dateStr);
                        if (d.after(today)) {
                            isUpcoming = true;
                        }
                    } catch (Exception e) {
                        // ignore
                    }
                }

                if (isUpcoming) {
                    upcoming.add(row);
                } else {
                    previous.add(row);
                }
            }

            return true;
        } catch (Exception e) {
            log.error("Error parsing Next.js JSON data", e);
            return false;
        }
    }

    @Autowired
    private com.example.screen.data.fetcher.repository.BrokerResearchRepository brokerResearchRepository;

    @Autowired
    private com.example.screen.data.fetcher.repository.TickerMetadataRepository tickerMetadataRepository;

    @Autowired
    private LlmService llmService;

    // Remove unused constant if preferred, or keep for reference
    // private static final String BROKER_RESEARCH_API =
    // "https://api.moneycontrol.com/mcapi/v1/stock/broker-research?scId=%s&page=1";
    private static final String PRICE_API = "https://priceapi.moneycontrol.com/pricefeed/nse/equitycash/%s";

    public String getBrokerReportSummary(String ticker, String reportLink) {
        try {
            if (reportLink == null || reportLink.isEmpty())
                return "No report link provided.";

            // Check if summary already exists in DB
            List<com.example.screen.data.fetcher.entity.BrokerResearch> existing = brokerResearchRepository
                    .findByReportLink(reportLink);
            if (!existing.isEmpty()) {
                // Return the first one that has a summary, UNLESS it's an error message
                for (com.example.screen.data.fetcher.entity.BrokerResearch br : existing) {
                    String sm = br.getSummary();
                    if (sm != null && !sm.isEmpty() && !sm.startsWith("Error generating summary")
                            && !sm.startsWith("LLM API Key is missing")) {
                        log.info("Returning cached summary for {}", ticker);
                        return sm;
                    }
                }
            }

            // Not found, generate logic
            String text = extractTextFromPdf(reportLink);
            if (text == null || text.trim().isEmpty())
                return "Could not extract text from PDF.";

            String summary = llmService.summarizePdfContent(ticker, text);

            // Save to DB
            if (!existing.isEmpty()) {
                // Update existing record(s)
                for (com.example.screen.data.fetcher.entity.BrokerResearch br : existing) {
                    br.setSummary(summary);
                }
                brokerResearchRepository.saveAll(existing);
                log.info("Saved new summary for {}", ticker);
            }

            return summary;
        } catch (Exception e) {
            log.error("Error generating summary for {}", ticker, e);
            return "Error generating summary: " + e.getMessage();
        }
    }

    private String extractTextFromPdf(String pdfUrl) {
        try {
            // Check if it's a PDF
            if (!pdfUrl.toLowerCase().endsWith(".pdf")) {
                // Could be a viewer link, but let's assume direct PDF for now as seen in API
                // response
                log.warn("Link does not look like a PDF: {}", pdfUrl);
                // Try anyway or return null? Moneycontrol usually gives direct PDF.
            }

            java.net.URL url = new java.net.URL(pdfUrl);
            try (java.io.InputStream is = url.openStream();
                    org.apache.pdfbox.pdmodel.PDDocument document = org.apache.pdfbox.pdmodel.PDDocument.load(is)) {

                org.apache.pdfbox.text.PDFTextStripper stripper = new org.apache.pdfbox.text.PDFTextStripper();
                return stripper.getText(document);
            }
        } catch (Exception e) {
            log.error("Failed to extract text from PDF: {}", pdfUrl, e);
            return null;
        }
    }

    public Map<String, Object> getBrokerResearch(String ticker, boolean forceRefresh) {
        Map<String, Object> result = new HashMap<>();

        com.example.screen.data.fetcher.entity.TickerMetadata metadata = tickerMetadataRepository.findById(ticker)
                .orElse(null);
        boolean fetchNeeded = forceRefresh;

        if (metadata == null || metadata.getLastBrokerResearchFetch() == null) {
            fetchNeeded = true;
        } else {
            java.time.LocalDateTime twoDaysAgo = java.time.LocalDateTime.now().minusDays(2);
            if (metadata.getLastBrokerResearchFetch().isBefore(twoDaysAgo)) {
                fetchNeeded = true;
            }
        }

        if (fetchNeeded) {
            try {
                fetchAndSaveBrokerResearch(ticker);
                if (metadata == null) {
                    metadata = new com.example.screen.data.fetcher.entity.TickerMetadata();
                    metadata.setTicker(ticker);
                }
                metadata.setLastBrokerResearchFetch(java.time.LocalDateTime.now());
                tickerMetadataRepository.save(metadata);
            } catch (Exception e) {
                log.error("Failed to fetch fresh broker research for {}", ticker, e);
                result.put("error", "Failed to fetch data: " + e.getMessage());
            }
        }

        List<com.example.screen.data.fetcher.entity.BrokerResearch> reports = brokerResearchRepository
                .findByTicker(ticker);

        // Calculate upside
        double currentPrice = getCurrentPrice(ticker);

        List<Map<String, Object>> formattedReports = new ArrayList<>();
        for (com.example.screen.data.fetcher.entity.BrokerResearch r : reports) {
            Map<String, Object> map = new HashMap<>();
            map.put("broker", r.getOrganization());
            map.put("reco", r.getReco());
            map.put("target", r.getTargetPrice());
            map.put("date", r.getRecoDate());
            map.put("link", r.getReportLink());

            if (currentPrice > 0 && r.getTargetPrice() != null) {
                try {
                    double target = Double.parseDouble(r.getTargetPrice().replace(",", ""));
                    double upside = ((target - currentPrice) / currentPrice) * 100;
                    map.put("upside", String.format("%.2f%%", upside));
                } catch (Exception e) {
                    map.put("upside", "-");
                }
            } else {
                map.put("upside", "-");
            }
            formattedReports.add(map);
        }

        result.put("reports", formattedReports);
        if (metadata != null && metadata.getLastBrokerResearchFetch() != null) {
            result.put("lastFetched", metadata.getLastBrokerResearchFetch().toString());
        }
        result.put("currentPrice", currentPrice);

        return result;
    }

    private void fetchAndSaveBrokerResearch(String ticker) throws IOException {
        String scId = getScId(ticker);
        if (scId == null)
            throw new IOException("Could not find SC_ID for " + ticker);

        // Preserve existing summaries
        List<com.example.screen.data.fetcher.entity.BrokerResearch> existingRecords = brokerResearchRepository
                .findByTicker(ticker);
        Map<String, String> summaryCache = new HashMap<>();
        for (com.example.screen.data.fetcher.entity.BrokerResearch br : existingRecords) {
            if (br.getReportLink() != null && br.getSummary() != null) {
                summaryCache.put(br.getReportLink(), br.getSummary());
            }
        }

        List<com.example.screen.data.fetcher.entity.BrokerResearch> allEntities = new ArrayList<>();
        com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();

        // Fetch up to 5 pages
        for (int page = 1; page <= 5; page++) {
            try {
                // Adding limit=50 to try and fetch more per page
                String baseUrl = "https://api.moneycontrol.com/mcapi/v1/stock/broker-research?scId=" + scId + "&page="
                        + page + "&limit=50";

                String jsonResponse = Jsoup.connect(baseUrl)
                        .ignoreContentType(true)
                        .header("User-Agent", "Mozilla/5.0")
                        .execute()
                        .body();

                com.fasterxml.jackson.databind.JsonNode root = mapper.readTree(jsonResponse);

                if (root.has("data") && root.get("data").has("broker_research_data")) {
                    com.fasterxml.jackson.databind.JsonNode list = root.get("data").get("broker_research_data");
                    if (list.isArray() && list.size() > 0) {
                        for (com.fasterxml.jackson.databind.JsonNode node : list) {
                            com.example.screen.data.fetcher.entity.BrokerResearch br = new com.example.screen.data.fetcher.entity.BrokerResearch();
                            br.setTicker(ticker);
                            br.setOrganization(node.path("organization").asText(null));
                            br.setReco(node.path("recommend_flag").asText(null));
                            br.setTargetPrice(node.path("target").asText(null));
                            br.setRecommendedPrice(node.path("recommended_price").asText(null));

                            String link = node.path("attachment").asText(null);
                            br.setReportLink(link);

                            // Restore summary if exists
                            if (link != null && summaryCache.containsKey(link)) {
                                br.setSummary(summaryCache.get(link));
                            }

                            br.setRecoDate(node.path("recommend_date").asText(null));
                            br.setFetchedAt(java.time.LocalDateTime.now());
                            allEntities.add(br);
                        }
                    } else {
                        // Empty list means no more data
                        break;
                    }
                } else {
                    break;
                }
            } catch (Exception e) {
                log.warn("Error fetching page {} for ticker {}: {}", page, ticker, e.getMessage());
                break; // Stop fetching on error
            }
        }

        if (!allEntities.isEmpty()) {
            log.info("Fetched {} broker research reports for {}", allEntities.size(), ticker);
            deleteAndSave(ticker, allEntities);
        }
    }

    @org.springframework.transaction.annotation.Transactional
    protected void deleteAndSave(String ticker, List<com.example.screen.data.fetcher.entity.BrokerResearch> entities) {
        brokerResearchRepository.deleteByTicker(ticker);
        brokerResearchRepository.saveAll(entities);
    }

    private String getScId(String ticker) {
        try {
            String url = String.format(AUTOSUGGEST_URL, ticker);
            String jsonResponse = Jsoup.connect(url)
                    .ignoreContentType(true)
                    .header("User-Agent", "Mozilla/5.0")
                    .execute()
                    .body();

            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            com.fasterxml.jackson.databind.JsonNode root = mapper.readTree(jsonResponse);

            if (root.isArray() && root.size() > 0) {
                com.fasterxml.jackson.databind.JsonNode first = root.get(0);
                if (first.has("sc_id")) {
                    return first.get("sc_id").asText();
                }
            }

            // Fallback to URL parsing if sc_id is missing (unlikely for stocks)
            String companyUrl = getCompanyUrl(ticker);
            if (companyUrl != null) {
                String[] parts = companyUrl.split("/");
                return parts[parts.length - 1];
            }

        } catch (Exception e) {
            log.error("Error finding scId for {}", ticker, e);
        }
        return null;
    }

    private double getCurrentPrice(String ticker) {
        try {
            String scId = getScId(ticker);
            if (scId == null)
                return 0;
            String url = String.format(PRICE_API, scId);
            String json = Jsoup.connect(url).ignoreContentType(true).execute().body();
            com.fasterxml.jackson.databind.JsonNode node = new com.fasterxml.jackson.databind.ObjectMapper()
                    .readTree(json);
            if (node.has("data") && node.get("data").has("pricecurrent")) {
                return node.get("data").get("pricecurrent").asDouble();
            }
        } catch (Exception e) {
            log.error("Error fetching current price for {}", ticker, e);
        }
        return 0;
    }

    private String getCompanyUrl(String ticker) throws IOException {
        String url = String.format(AUTOSUGGEST_URL, ticker);
        String jsonResponse = Jsoup.connect(url)
                .ignoreContentType(true)
                .header("User-Agent", "Mozilla/5.0")
                .execute()
                .body();

        int linkSrcIndex = jsonResponse.indexOf("\"link_src\":\"");
        if (linkSrcIndex == -1)
            return null;

        int start = linkSrcIndex + 12;
        int end = jsonResponse.indexOf("\"", start);
        return jsonResponse.substring(start, end).replace("\\/", "/");
    }

    private String toStringSafe(Object obj) {
        return obj == null ? "" : String.valueOf(obj);
    }

    private void parseHtmlTable(Document doc, List<Map<String, String>> upcoming, List<Map<String, String>> previous,
            String actionType) {
        // Moneycontrol tables often have class "mctable1" or are inside "fr_data_div"
        // Sometimes they are just generic tables.

        Elements tables = doc.select("table.mctable1");
        if (tables.isEmpty()) {
            tables = doc.select("div.fr_data_div table");
        }
        if (tables.isEmpty()) {
            // Fallback: look for any table that has "Announcement" or "Ex-Date" in headers
            for (Element t : doc.select("table")) {
                if (t.text().contains("Announcement") || t.text().contains("Ex-Date")) {
                    tables = new Elements(t);
                    break;
                }
            }
        }

        if (!tables.isEmpty()) {
            Element table = tables.first();
            parseTable(table, upcoming, previous, actionType);
        } else {
            log.warn("No suitable table found for {} (HTML fallback)", actionType);
        }
    }

    private void parseTable(Element table, List<Map<String, String>> upcoming, List<Map<String, String>> previous,
            String actionType) {
        Elements rows = table.select("tr");
        if (rows.isEmpty())
            return;

        // Extract headers
        Elements ths = rows.get(0).select("th");
        if (ths.isEmpty()) {
            // Sometimes headers are in the first tr as td with bold or specific class
            ths = rows.get(0).select("td");
        }

        List<String> headers = new ArrayList<>();
        for (Element th : ths) {
            headers.add(th.text().trim());
        }

        log.debug("Found headers: {}", headers);

        // Parse data
        Date today = new Date();
        // Moneycontrol date formats can vary: "25-07-2024", "25 Jul 2024", etc.
        // We will try a few formats
        List<java.text.SimpleDateFormat> dateFormats = new ArrayList<>();
        dateFormats.add(new java.text.SimpleDateFormat("dd-MM-yyyy"));
        dateFormats.add(new java.text.SimpleDateFormat("dd MMM yyyy"));

        for (int i = 1; i < rows.size(); i++) {
            Elements tds = rows.get(i).select("td");
            if (tds.size() != headers.size())
                continue;

            Map<String, String> rowData = new HashMap<>();
            String dateStr = "";

            for (int j = 0; j < headers.size(); j++) {
                String header = headers.get(j);
                String value = tds.get(j).text().trim();

                // Customize header names
                if ("%".equals(header)) {
                    header = "Dividend %";
                }

                rowData.put(header, value);

                if (header.toLowerCase().contains("date") && !header.toLowerCase().contains("record")) {
                    // Prefer Ex-Date or Announcement Date
                    if (header.contains("Announcement") || header.contains("Ex-Date") || header.contains("Effective")) {
                        dateStr = value;
                    }
                }
            }

            // Categorize
            boolean isUpcoming = false;
            if (!dateStr.isEmpty()) {
                for (java.text.SimpleDateFormat sdf : dateFormats) {
                    try {
                        Date date = sdf.parse(dateStr);
                        if (date.after(today)) {
                            isUpcoming = true;
                        }
                        break; // Successfully parsed
                    } catch (Exception e) {
                        // ignore and try next format
                    }
                }
            }

            if (isUpcoming) {
                upcoming.add(rowData);
            } else {
                previous.add(rowData);
            }
        }
    }
}
