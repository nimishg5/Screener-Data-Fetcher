package com.example.screen.data.fetcher.controller;

import com.example.screen.data.fetcher.service.FivePaisaService;
import com.example.screen.data.fetcher.service.NewsAnalysisService;
import com.example.screen.data.fetcher.service.ScreenerAnalysisService;
import com.example.screen.data.fetcher.service.ScreenerDataFetcherService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;
import java.util.Map;

import lombok.extern.slf4j.Slf4j;

@RestController
@RequestMapping(value = "/api/v1/data-fetcher")
@Slf4j
public class ScreenerDataFetcherController {

    @Autowired
    private ScreenerAnalysisService screenerAnalysisService;

    @Autowired
    private com.example.screen.data.fetcher.service.NewsAnalysisService newsAnalysisService;

    @GetMapping(value = "/ticker/{ticker}")
    public ResponseEntity<String> fetchDataForTicker(
            @PathVariable(value = "ticker", required = true) String ticker) throws IOException {
        log.info("Received request to fetch data for ticker: {}", ticker);
        screenerAnalysisService
                .readColumnData("/Users/nimishgupta/Documents/Projects/screen-data-fetcher/MainSheet.xlsx", 0, 0);
        return new ResponseEntity<>("Data processed successfully", HttpStatus.OK);
    }

    @PostMapping(value = "/login")
    public ResponseEntity<java.util.Map<String, String>> login(@RequestBody java.util.Map<String, String> credentials) {
        String username = credentials.get("username");
        log.info("Login request received for user: {}", username);
        if (screenerAnalysisService.login(username, credentials.get("password"))) {
            log.info("Login successful for user: {}", username);
            java.util.Map<String, String> response = new java.util.HashMap<>();
            response.put("message", "Login successful");
            response.put("username", username);
            return new ResponseEntity<>(response, HttpStatus.OK);
        } else {
            log.warn("Login failed for user: {}", username);
            return new ResponseEntity<>(HttpStatus.UNAUTHORIZED);
        }
    }

    @PostMapping(value = "/logout")
    public ResponseEntity<String> logout() {
        log.info("Logout request received");
        screenerAnalysisService.logout();
        return new ResponseEntity<>("Logout successful", HttpStatus.OK);
    }

    @GetMapping(value = "/compare")
    public ResponseEntity<java.util.Map<String, java.util.Map<String, String>>> compareTickers(
            @RequestParam(value = "tickers") String tickers) throws IOException {
        log.info("Compare request received for tickers: {}", tickers);
        String[] tickerArray = tickers.split(",");
        java.util.Map<String, java.util.Map<String, String>> response = new java.util.LinkedHashMap<>();

        for (String ticker : tickerArray) {
            String trimmedTicker = ticker.trim();
            if (!trimmedTicker.isEmpty()) {
                java.util.Map<String, String> data = screenerAnalysisService
                        .findBasicElementsAndAdvanced(trimmedTicker);
                if (data != null) {
                    response.put(trimmedTicker, data);
                } else {
                    log.warn("No data found for ticker: {}", trimmedTicker);
                    response.put(trimmedTicker, null);
                }
            }
        }
        return new ResponseEntity<>(response, HttpStatus.OK);
    }

    @GetMapping(value = "/geo-analysis")
    public ResponseEntity<java.util.Map<String, Object>> getGeoAnalysis(
            @RequestParam(value = "ticker") String ticker,
            @RequestParam(value = "refresh", defaultValue = "false") boolean refresh) {
        log.info("Geo analysis request received for ticker: {}, refresh: {}", ticker, refresh);
        java.util.Map<String, Object> data = screenerAnalysisService.getGeoAnalysis(ticker, refresh);
        return new ResponseEntity<>(data, HttpStatus.OK);
    }

    @GetMapping(value = "/search")
    public ResponseEntity<java.util.List<java.util.Map<String, String>>> searchTickers(
            @RequestParam(value = "query") String query) {
        log.info("Search request received for query: {}", query);
        java.util.List<java.util.Map<String, String>> suggestions = screenerAnalysisService.searchTickers(query);
        return new ResponseEntity<>(suggestions, HttpStatus.OK);
    }

    @Autowired
    private FivePaisaService fivePaisaService;

    @GetMapping(value = "/corporate-actions")
    public ResponseEntity<java.util.Map<String, Object>> getCorporateActions(
            @RequestParam(value = "ticker") String ticker,
            @RequestParam(value = "refresh", defaultValue = "false") boolean refresh) {
        log.info("Corporate actions request received for ticker: {}, refresh: {}", ticker, refresh);
        java.util.Map<String, Object> data = screenerAnalysisService.getCorporateActions(ticker, refresh);
        return new ResponseEntity<>(data, HttpStatus.OK);
    }

    @GetMapping(value = "/market-actions")
    public ResponseEntity<java.util.Map<String, List<java.util.Map<String, String>>>> getMarketActions(
            @RequestParam(value = "year", required = false) Integer year) {
        log.info("Market actions request received for year: {}", year);
        java.util.Map<String, List<java.util.Map<String, String>>> data = fivePaisaService.getAllCorporateActions(year);
        return new ResponseEntity<>(data, HttpStatus.OK);
    }

    @GetMapping(value = "/news-analysis")
    public ResponseEntity<java.util.Map<String, Object>> getNewsAnalysis(
            @RequestParam(value = "ticker") String ticker,
            @RequestParam(value = "refresh", defaultValue = "false") boolean refresh) {
        log.info("News analysis request received for ticker: {}, refresh: {}", ticker, refresh);
        java.util.Map<String, Object> data = newsAnalysisService.analyzeStockNews(ticker, refresh);
        return new ResponseEntity<>(data, HttpStatus.OK);
    }

    @Autowired
    private com.example.screen.data.fetcher.service.MoneyControlService moneyControlService;

    @GetMapping(value = "/broker-research")
    public ResponseEntity<Map<String, Object>> getBrokerResearch(
            @RequestParam(value = "ticker") String ticker,
            @RequestParam(value = "refresh", defaultValue = "false") boolean refresh) {
        log.info("Broker Research request received for ticker: {}, refresh: {}", ticker, refresh);
        return new ResponseEntity<>(moneyControlService.getBrokerResearch(ticker, refresh), HttpStatus.OK);
    }

    @PostMapping(value = "/broker-research/summary")
    public ResponseEntity<Map<String, String>> getBrokerResearchSummary(@RequestBody Map<String, String> payload) {
        String ticker = payload.get("ticker");
        String link = payload.get("link");
        log.info("Generating summary for ticker: {}, link: {}", ticker, link);
        String summary = moneyControlService.getBrokerReportSummary(ticker, link);
        return new ResponseEntity<>(java.util.Collections.singletonMap("summary", summary), HttpStatus.OK);
    }

}
