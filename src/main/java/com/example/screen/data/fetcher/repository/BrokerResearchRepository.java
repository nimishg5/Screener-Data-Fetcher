package com.example.screen.data.fetcher.repository;

import com.example.screen.data.fetcher.entity.BrokerResearch;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface BrokerResearchRepository extends JpaRepository<BrokerResearch, Long> {
    List<BrokerResearch> findByTicker(String ticker);

    // Use List because theoretically duplicate links could exist if scraped
    // multiple times, though improbable
    List<BrokerResearch> findByReportLink(String reportLink);

    @org.springframework.transaction.annotation.Transactional
    void deleteByTicker(String ticker);
}
