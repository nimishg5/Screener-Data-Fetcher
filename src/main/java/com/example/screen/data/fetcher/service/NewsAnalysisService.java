package com.example.screen.data.fetcher.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import lombok.extern.slf4j.Slf4j;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@Slf4j
public class NewsAnalysisService {

    @Autowired
    private NewsService newsService;

    @Autowired
    private LlmService llmService;

    @Autowired
    private CacheService cacheService;

    private static final long CACHE_EXPIRY_MS = 3L * 24 * 60 * 60 * 1000; // 3 Days

    public Map<String, Object> analyzeStockNews(String ticker) {
        return analyzeStockNews(ticker, false);
    }

    public Map<String, Object> analyzeStockNews(String ticker, boolean refresh) {
        String cacheKey = "news_analysis_" + ticker;

        if (refresh) {
            cacheService.remove(cacheKey);
        }

        Map<String, Object> cachedResult = cacheService.get(cacheKey,
                new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {
                });
        if (cachedResult != null) {
            log.info("Returning cached AI analysis for {}", ticker);
            java.time.LocalDateTime lastUpdated = cacheService.getLastUpdated(cacheKey);
            if (lastUpdated != null) {
                cachedResult.put("fetchedAt", lastUpdated.toString());
            }
            return cachedResult;
        }

        Map<String, Object> result = new HashMap<>();

        // 1. Get Related Entities (Dynamic Discovery)
        log.info("Fetching related entities for {}", ticker);
        List<String> relatedEntities = llmService.getRelatedEntities(ticker);

        // Always include the main ticker
        if (!relatedEntities.contains(ticker)) {
            relatedEntities.add(0, ticker);
        }

        result.put("relatedEntities", relatedEntities);

        // 2. Fetch News for all entities
        Map<String, List<Map<String, String>>> aggregatedNews = new HashMap<>();
        for (String entity : relatedEntities) {
            log.info("Fetching news for entity: {}", entity);
            List<Map<String, String>> news = newsService.fetchNews(entity, refresh);
            if (!news.isEmpty()) {
                aggregatedNews.put(entity, news);
            }
        }

        result.put("news", aggregatedNews);

        // 3. Summarize and Analyze Impact (RAG)
        log.info("Generating summary for {}", ticker);
        String summary = llmService.summarizeImpact(ticker, aggregatedNews);

        // 4. Score News Items (New Feature)
        List<Map<String, String>> allNews = new java.util.ArrayList<>();
        aggregatedNews.values().forEach(allNews::addAll);

        List<Map<String, Object>> scoredNews = llmService.filterAndScoreNews(ticker, allNews);

        // Sort scored news by date (newest first)
        scoredNews.sort((n1, n2) -> {
            String d1 = (String) n1.get("pubDate");
            String d2 = (String) n2.get("pubDate");
            if (d1 == null)
                return 1;
            if (d2 == null)
                return -1;
            return parseDate(d2).compareTo(parseDate(d1));
        });

        Map<String, Object> aiAnalysis = new HashMap<>();
        aiAnalysis.put("summary", summary);
        aiAnalysis.put("scoredNews", scoredNews);

        result.put("aiAnalysis", aiAnalysis);
        result.put("fetchedAt", java.time.LocalDateTime.now().toString());

        // Cache the result
        cacheService.put(cacheKey, result, CACHE_EXPIRY_MS);

        return result;
    }

    private java.time.ZonedDateTime parseDate(String dateStr) {
        try {
            return java.time.ZonedDateTime.parse(dateStr, java.time.format.DateTimeFormatter.RFC_1123_DATE_TIME);
        } catch (Exception e) {
            return java.time.ZonedDateTime.now().minusYears(10);
        }
    }
}
