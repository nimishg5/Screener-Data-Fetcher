package com.example.screen.data.fetcher.repository;

import com.example.screen.data.fetcher.entity.ScreenerSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ScreenerSessionRepository extends JpaRepository<ScreenerSession, Long> {
}
