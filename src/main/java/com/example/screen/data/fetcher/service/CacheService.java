package com.example.screen.data.fetcher.service;

import org.springframework.stereotype.Service;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class CacheService {

    private final Map<String, CacheEntry<?>> cache = new ConcurrentHashMap<>();

    private static class CacheEntry<T> {
        T value;
        long expiryTime;

        CacheEntry(T value, long expiryTime) {
            this.value = value;
            this.expiryTime = expiryTime;
        }
    }

    public <T> void put(String key, T value, long ttlMillis) {
        cache.put(key, new CacheEntry<>(value, System.currentTimeMillis() + ttlMillis));
    }

    @SuppressWarnings("unchecked")
    public <T> T get(String key) {
        CacheEntry<?> entry = cache.get(key);
        if (entry != null) {
            if (System.currentTimeMillis() < entry.expiryTime) {
                return (T) entry.value;
            } else {
                cache.remove(key);
            }
        }
        return null;
    }

    public void remove(String key) {
        cache.remove(key);
    }

    public void clear() {
        cache.clear();
    }
}
