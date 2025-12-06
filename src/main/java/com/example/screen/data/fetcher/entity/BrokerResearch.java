package com.example.screen.data.fetcher.entity;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Entity
@Data
@Table(name = "broker_research")
public class BrokerResearch {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String ticker;
    private String organization; // Broker Name
    private String reco; // BUY, SELL, etc.
    private String targetPrice;
    private String recommendedPrice;
    private String reportLink;
    private String recoDate; // String as returned from API "16 Oct, 2025" or parsed LocalDate

    private LocalDateTime fetchedAt;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String summary;
}
