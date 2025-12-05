package com.example.screen.data.fetcher.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "cache_data")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class CacheData {

    @Id
    @Column(name = "cache_key", length = 500)
    private String key;

    @Lob
    @Column(name = "cache_value", columnDefinition = "CLOB")
    private String value;

    @Column(name = "last_updated")
    private LocalDateTime lastUpdated;
}
