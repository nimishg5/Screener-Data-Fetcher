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
