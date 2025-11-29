package com.example.screen.data.fetcher.controller;

import com.example.screen.data.fetcher.service.ExcelDataReadWriteService;
import com.example.screen.data.fetcher.service.ScreenerDataFetcherService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;

@RestController
@RequestMapping(value = "/api/v1/data-fetcher")
public class ScreenerDataFetcherController {

    @Autowired
    private ScreenerDataFetcherService screenerDataFetcherService;

    @Autowired
    private ExcelDataReadWriteService excelDataReadWriteService;

    @GetMapping(value = "/ticker/{ticker}")
    public ResponseEntity<String> fetchDataForTicker(
            @PathVariable(value = "ticker", required = true) String ticker) throws IOException {
        excelDataReadWriteService
                .readColumnData("/Users/nimishgupta/Documents/Projects/screen-data-fetcher/MainSheet.xlsx", 0, 0);
        return new ResponseEntity<>("Data processed successfully", HttpStatus.OK);
    }

    @PostMapping(value = "/login")
    public ResponseEntity<String> login(@RequestBody java.util.Map<String, String> credentials) {
        String username = credentials.get("username");
        String password = credentials.get("password");
        if (excelDataReadWriteService.login(username, password)) {
            return new ResponseEntity<>("Login successful", HttpStatus.OK);
        } else {
            return new ResponseEntity<>("Login failed", HttpStatus.UNAUTHORIZED);
        }
    }

    @PostMapping(value = "/logout")
    public ResponseEntity<String> logout() {
        excelDataReadWriteService.logout();
        return new ResponseEntity<>("Logout successful", HttpStatus.OK);
    }

    @GetMapping(value = "/compare")
    public ResponseEntity<java.util.Map<String, java.util.Map<String, String>>> compareTickers(
            @RequestParam(value = "tickers") String tickers) throws IOException {
        String[] tickerArray = tickers.split(",");
        java.util.Map<String, java.util.Map<String, String>> response = new java.util.LinkedHashMap<>();

        for (String ticker : tickerArray) {
            String trimmedTicker = ticker.trim();
            if (!trimmedTicker.isEmpty()) {
                java.util.Map<String, String> data = excelDataReadWriteService
                        .findBasicElementsAndAdvanced(trimmedTicker);
                if (data != null) {
                    response.put(trimmedTicker, data);
                } else {
                    // Put a special marker or null to indicate failure
                    response.put(trimmedTicker, null);
                }
            }
        }
        return new ResponseEntity<>(response, HttpStatus.OK);
    }

}
