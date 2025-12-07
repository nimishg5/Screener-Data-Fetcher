package com.example.screen.data.fetcher.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class IpoDetails {

    @JsonProperty("id")
    private Long id;

    @JsonProperty("name")
    private String name;

    @JsonProperty("open")
    private String openDate;

    @JsonProperty("close")
    private String closeDate;

    @JsonProperty("min_price")
    private Double minPrice;

    @JsonProperty("max_price")
    private Double maxPrice;

    @JsonProperty("lot_size")
    private Integer lotSize;

    @JsonProperty("issue_size")
    private String issueSize;

    @JsonProperty("premium")
    private String gmp; // Grey Market Premium

    @JsonProperty("current_status")
    private String currentStatus;

    @JsonProperty("allotment_date")
    private String allotmentDate;

    @JsonProperty("listing_date")
    private String listingDate;

    @JsonProperty("lm")
    private String leadManagersRaw;

    private String leadManager; // Cleaned text
}
