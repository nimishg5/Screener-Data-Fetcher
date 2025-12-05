package com.example.screen.data.fetcher.service;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.springframework.stereotype.Service;
import lombok.extern.slf4j.Slf4j;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@Slf4j
public class FivePaisaService {

    private static final String BASE_URL = "https://www.5paisa.com/share-market-today/";
    private static final String USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    @org.springframework.beans.factory.annotation.Autowired
    private CacheService cacheService;

    // 2 days in milliseconds
    private static final long CACHE_DURATION_MS = 2L * 24 * 60 * 60 * 1000;

    public Map<String, List<Map<String, String>>> getAllCorporateActions(Integer year) {
        Map<String, List<Map<String, String>>> result = new HashMap<>();
        String yearStr = (year != null) ? String.valueOf(year) : "";

        result.put("dividends", fetchActions("dividends", yearStr));
        result.put("bonus", fetchActions("bonus", yearStr));
        result.put("splits", fetchActions("splits", yearStr));
        result.put("rights", fetchActions("rights", yearStr));
        return result;
    }

    private List<Map<String, String>> fetchActions(String type, String year) {
        String cacheKey = "market_actions_" + type + "_" + (year.isEmpty() ? "current" : year);

        // Check cache first
        if (!cacheService.isOlderThan(cacheKey, CACHE_DURATION_MS)) {
            List<Map<String, String>> cachedData = cacheService.get(cacheKey,
                    new com.fasterxml.jackson.core.type.TypeReference<List<Map<String, String>>>() {
                    });
            if (cachedData != null && !cachedData.isEmpty()) {
                log.info("Returning cached data for {} year {}", type, year);
                return cachedData;
            }
        }

        List<Map<String, String>> actions = new ArrayList<>();
        String url = BASE_URL + type;
        if (year != null && !year.isEmpty()) {
            url += "?Year=" + year;
        }

        try {
            log.info("Fetching {} from {}", type, url);
            Document doc = Jsoup.connect(url)
                    .userAgent(USER_AGENT)
                    .timeout(10000)
                    .get();

            // The table usually has id="myTable" or is the first table
            Element table = doc.select("table").first();
            if (table == null) {
                log.warn("No table found for {} year {}", type, year);
                return actions;
            }

            Elements rows = table.select("tbody tr");
            for (Element row : rows) {
                Elements cols = row.select("td");
                if (cols.isEmpty())
                    continue;

                Map<String, String> action = new HashMap<>();

                // Common structure: Company Name is usually first
                String companyName = cols.get(0).text();
                action.put("company", companyName);

                // Extract other columns based on type
                // Note: Column indices might vary slightly, but usually:
                // Dividends: Company, Type, %, Announcement, Record, Ex-Dividend
                // Bonus: Company, Ratio, Announcement, Record, Ex-Bonus
                // Splits: Company, Old FV, New FV, Split Date, Announcement, Record, Ex-Split
                // Rights: Company, Ratio, Premium, Announcement, Record, Ex-Rights

                if ("dividends".equals(type)) {
                    if (cols.size() >= 6) {
                        action.put("type", cols.get(1).text());
                        action.put("percentage", cols.get(2).text());
                        action.put("announcementDate", cols.get(3).text());
                        action.put("recordDate", cols.get(4).text());
                        action.put("exDate", cols.get(5).text());
                    }
                } else if ("bonus".equals(type)) {
                    if (cols.size() >= 5) {
                        action.put("ratio", cols.get(1).text());
                        action.put("announcementDate", cols.get(2).text());
                        action.put("recordDate", cols.get(3).text());
                        action.put("exDate", cols.get(4).text());
                    }
                } else if ("splits".equals(type)) {
                    // Splits might have more columns. Let's be safe and map by index if possible or
                    // generic
                    // Based on typical structure: Company, Old FV, New FV, Split Date
                    if (cols.size() >= 4) {
                        action.put("oldFV", cols.get(1).text());
                        action.put("newFV", cols.get(2).text());
                        action.put("splitDate", cols.get(3).text());
                    }
                } else if ("rights".equals(type)) {
                    if (cols.size() >= 6) {
                        action.put("ratio", cols.get(1).text());
                        action.put("premium", cols.get(2).text());
                        action.put("announcementDate", cols.get(3).text());
                        action.put("recordDate", cols.get(4).text());
                        action.put("exDate", cols.get(5).text());
                    }
                }

                actions.add(action);
            }

            // Save to cache
            if (!actions.isEmpty()) {
                cacheService.put(cacheKey, actions, CACHE_DURATION_MS);
            }

        } catch (IOException e) {
            log.error("Error fetching {} from 5paisa: {}", type, e.getMessage());
        }

        return actions;
    }
}
