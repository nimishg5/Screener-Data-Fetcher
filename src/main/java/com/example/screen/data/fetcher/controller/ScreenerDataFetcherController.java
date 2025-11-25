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
        excelDataReadWriteService.readColumnData("/Users/nimishgupta/Documents/Projects/screen-data-fetcher/MainSheet.xlsx", 0, 0);
        return new ResponseEntity<>("Data processed successfully", HttpStatus.OK);
    }

}
