package com.example.screen.data.fetcher.service;

import com.example.screen.data.fetcher.entity.CacheData;
import com.example.screen.data.fetcher.repository.CacheDataRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Optional;

@Service
public class CacheService {

    @Autowired
    private CacheDataRepository cacheDataRepository;

    @Autowired
    private ObjectMapper objectMapper;

    public <T> void put(String key, T value, long ttlMillis) {
        try {
            String jsonValue = objectMapper.writeValueAsString(value);
            CacheData data = new CacheData(key, jsonValue, LocalDateTime.now());
            cacheDataRepository.save(data);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public <T> T get(String key, Class<T> clazz) {
        try {
            Optional<CacheData> data = cacheDataRepository.findById(key);
            if (data.isPresent()) {
                return objectMapper.readValue(data.get().getValue(), clazz);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return null;
    }

    public <T> T get(String key, TypeReference<T> typeReference) {
        try {
            Optional<CacheData> data = cacheDataRepository.findById(key);
            if (data.isPresent()) {
                return objectMapper.readValue(data.get().getValue(), typeReference);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return null;
    }

    // Deprecated: Try to avoid using this as it relies on default typing which
    // might be tricky
    public Object get(String key) {
        try {
            Optional<CacheData> data = cacheDataRepository.findById(key);
            if (data.isPresent()) {
                // Default to Map or List
                return objectMapper.readValue(data.get().getValue(), Object.class);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return null;
    }

    public void remove(String key) {
        cacheDataRepository.deleteById(key);
    }

    public void clear() {
        cacheDataRepository.deleteAll();
    }

    public LocalDateTime getLastUpdated(String key) {
        return cacheDataRepository.findById(key)
                .map(CacheData::getLastUpdated)
                .orElse(null);
    }
}
