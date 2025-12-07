package com.example.screen.data.fetcher.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "screener_session")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ScreenerSession {
    @Id
    private Long id = 1L; // Singleton record

    private LocalDateTime lastTokenFetchTime;

    public ScreenerSession(LocalDateTime lastTokenFetchTime) {
        this.lastTokenFetchTime = lastTokenFetchTime;
    }
}
