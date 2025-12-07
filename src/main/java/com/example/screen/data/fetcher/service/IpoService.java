package com.example.screen.data.fetcher.service;

import com.example.screen.data.fetcher.dto.IpoDetails;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.Jsoup;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

@Service
@Slf4j
public class IpoService {

    @Autowired
    private RestTemplate restTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    // Fetching plenty of records to cover upcoming, open, and closed
    private static final String IPO_URL = "https://www.ipopremium.in/ipo?draw=1&start=0&length=2000&all=true&all_ipos=true";

    public List<IpoDetails> fetchIpoData() {
        log.info("Fetching IPO data from {}", IPO_URL);
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setAccept(Collections.singletonList(MediaType.APPLICATION_JSON));
            headers.add("User-Agent",
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36");
            headers.add("X-Requested-With", "XMLHttpRequest");

            HttpEntity<String> entity = new HttpEntity<>(headers);

            ResponseEntity<String> response = restTemplate.exchange(IPO_URL, HttpMethod.GET, entity, String.class);
            String jsonResponse = response.getBody();

            if (jsonResponse == null || jsonResponse.isEmpty()) {
                log.warn("Empty response from IPO URL");
                return new ArrayList<>();
            }

            JsonNode root = objectMapper.readTree(jsonResponse);
            JsonNode dataNode = root.get("data");

            if (dataNode != null && dataNode.isArray()) {
                IpoDetails[] ipos = objectMapper.treeToValue(dataNode, IpoDetails[].class);
                List<IpoDetails> ipoList = new ArrayList<>(Arrays.asList(ipos));

                // Clean up fields using Jsoup with specific class selection
                for (IpoDetails ipo : ipoList) {
                    if (ipo.getName() != null) {
                        try {
                            // Extract text from <a class="text-bold text-reset">
                            String cleanName = Jsoup.parse(ipo.getName()).select("a.text-bold.text-reset").text();
                            // Fallback if specific class not found
                            if (cleanName.isEmpty()) {
                                cleanName = Jsoup.parse(ipo.getName()).text();
                            }
                            ipo.setName(cleanName);
                        } catch (Exception e) {
                            log.error("Error parsing IPO name: {}", ipo.getName(), e);
                        }
                    }

                    if (ipo.getLeadManagersRaw() != null) {
                        try {
                            String cleanLm = Jsoup.parse(ipo.getLeadManagersRaw()).select("a.text-bold.text-reset")
                                    .eachText().stream().collect(Collectors.joining(", "));
                            // Fallback
                            if (cleanLm.isEmpty()) {
                                cleanLm = Jsoup.parse(ipo.getLeadManagersRaw()).text();
                            }
                            ipo.setLeadManager(cleanLm);
                        } catch (Exception e) {
                            log.error("Error parsing IPO Lead Manager: {}", ipo.getLeadManagersRaw(), e);
                        }
                    }
                }
                return ipoList;
            }
        } catch (Exception e) {
            log.error("Error fetching IPO data", e);
        }
        return new ArrayList<>();
    }
}
