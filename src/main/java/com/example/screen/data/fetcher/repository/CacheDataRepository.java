package com.example.screen.data.fetcher.repository;

import com.example.screen.data.fetcher.entity.CacheData;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface CacheDataRepository extends JpaRepository<CacheData, String> {
}
