package com.example.screen.data.fetcher.repository;

import com.example.screen.data.fetcher.entity.TickerMetadata;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface TickerMetadataRepository extends JpaRepository<TickerMetadata, String> {
}
