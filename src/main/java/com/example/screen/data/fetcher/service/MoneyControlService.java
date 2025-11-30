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

            // Log the title to verify we are on the right page
            log.debug("Page Title: {}", doc.title());

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
                log.warn("No suitable table found for {} on page: {}", actionType, url);
            }

        } catch (Exception e) {
            log.error("Error fetching {} for {}", actionType, slug, e);
        }

        result.put("upcoming", upcoming);
        result.put("previous", previous);
        return result;
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
