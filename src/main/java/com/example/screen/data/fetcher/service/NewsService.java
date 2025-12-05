package com.example.screen.data.fetcher.service;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import lombok.extern.slf4j.Slf4j;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@Slf4j
public class NewsService {

    @Autowired
    private CacheService cacheService;

    private static final long CACHE_EXPIRY_MS = 2L * 24 * 60 * 60 * 1000; // 2 days

    public List<Map<String, String>> fetchNews(String query) {
        return fetchNews(query, false);
    }

    public List<Map<String, String>> fetchNews(String query, boolean refresh) {
        String cacheKey = "NEWS_" + query.toLowerCase().replace(" ", "_");

        if (refresh) {
            cacheService.remove(cacheKey);
        }

        List<Map<String, String>> cachedNews = cacheService.get(cacheKey,
                new com.fasterxml.jackson.core.type.TypeReference<List<Map<String, String>>>() {
                });

        if (cachedNews != null) {
            log.info("Fetching news from cache for query: {}", query);
            return cachedNews;
        }

        List<Map<String, String>> newsList = new ArrayList<>();
        try {
            // Append "business" to context if not present, to get relevant news
            String searchQuery = query + " business";

            String rssUrl = "https://news.google.com/rss/search?q="
                    + URLEncoder.encode(searchQuery, StandardCharsets.UTF_8)
                    + "&hl=en-IN&gl=IN&ceid=IN:en";

            log.debug("Fetching news from: {}", rssUrl);

            Document doc = Jsoup.connect(rssUrl)
                    .header("User-Agent",
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
                    .get();
            Elements items = doc.select("item");

            int count = 0;
            for (Element item : items) {
                if (count >= 5)
                    break; // Limit to 5 news items per query
                Map<String, String> newsItem = new HashMap<>();
                newsItem.put("title", item.select("title").text());
                newsItem.put("link", item.select("link").text());
                newsItem.put("pubDate", item.select("pubDate").text());
                newsItem.put("source", item.select("source").text());
                newsList.add(newsItem);
                count++;
            }

            // Store in cache
            cacheService.put(cacheKey, newsList, CACHE_EXPIRY_MS);

        } catch (Exception e) {
            log.error("Error fetching news for {}: {}", query, e.getMessage());
        }
        return newsList;
    }
}
