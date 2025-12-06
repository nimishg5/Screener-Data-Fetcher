package com.example.screen.data.fetcher.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import lombok.Data;
import java.time.LocalDateTime;

@Entity
@Data
public class TickerMetadata {
    @Id
    private String ticker;

    private LocalDateTime lastBrokerResearchFetch;
}
