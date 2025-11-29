package com.example.screen.data.fetcher.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class ScreenerDataFetcherService {

    @Autowired
    private RestTemplate restTemplate;

    public String fetchDataFromScreener(String ticker) {
        log.info("Fetching data from Screener for ticker: {}", ticker);
        return restTemplate.getForObject("https://www.screener.in/company/" + ticker + "/consolidated/", String.class);
    }

}
