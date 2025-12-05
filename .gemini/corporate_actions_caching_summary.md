# Corporate Actions Caching Implementation

## Overview
Implemented database caching for corporate actions data with a 1-week TTL (Time To Live) and added a refetch button to manually refresh the data.

## Changes Made

### 1. Backend Changes

#### CacheService.java
- **Added `isOlderThan(String key, long maxAgeMillis)` method**
  - Checks if cached data is older than a specified duration
  - Returns `true` if cache doesn't exist or is expired
  - Used for implementing TTL-based cache invalidation

#### ScreenerAnalysisService.java
- **Updated `getCorporateActions` method with caching support**
  - Added overloaded method: `getCorporateActions(String ticker, boolean refresh)`
  - Implements 1-week cache TTL (7 days = 604,800,000 milliseconds)
  - If `refresh=true`, clears cache and fetches fresh data
  - If cache exists and is less than 1 week old, returns cached data
  - Adds `fetchedAt` timestamp to response for UI display
  - Caches result in database for future requests

#### ScreenerDataFetcherController.java
- **Updated `/corporate-actions` endpoint**
  - Added optional `refresh` query parameter (default: `false`)
  - Example: `/api/v1/data-fetcher/corporate-actions?ticker=TCS&refresh=true`
  - Passes refresh parameter to service layer

### 2. Frontend Changes

#### script.js
- **Added `refetchCorporateActions(ticker)` function**
  - Displays loading indicator while refetching
  - Calls API with `refresh=true` parameter
  - Updates cache and re-renders data

- **Enhanced `renderActionsData(ticker, result, container)` function**
  - Added header section with timestamp and refetch button
  - Displays last updated date/time with human-readable "time ago" format
  - Examples: "Just now", "5 minutes ago", "2 hours ago", "3 days ago", "2 weeks ago"
  - Styled refetch button with hover effects
  - Button triggers `refetchCorporateActions()` on click

## User Experience

### Initial Load
1. User navigates to "Corporate Actions" tab
2. Data is fetched from Moneycontrol.com
3. Data is saved to database with current timestamp
4. UI displays data with "Last updated: [timestamp] (Just now)"

### Subsequent Loads (within 1 week)
1. User navigates to "Corporate Actions" tab
2. Cached data is retrieved from database
3. UI displays data with timestamp showing age (e.g., "3 days ago")
4. No external API call is made

### After 1 Week
1. User navigates to "Corporate Actions" tab
2. Cache is detected as expired (older than 7 days)
3. Fresh data is fetched from Moneycontrol.com
4. Database cache is updated
5. UI displays new data with updated timestamp

### Manual Refresh
1. User clicks "🔄 Refetch" button
2. Loading indicator appears
3. Cache is cleared and fresh data is fetched
4. Database cache is updated
5. UI displays new data with current timestamp

## Technical Details

### Cache Key Format
```
CORPORATE_ACTIONS_{ticker}
```
Example: `CORPORATE_ACTIONS_TCS`

### Cache Duration
- **TTL**: 1 week (7 days)
- **Milliseconds**: 604,800,000 ms

### Database Storage
- **Table**: `cache_data`
- **Fields**:
  - `cache_key`: Primary key (e.g., "CORPORATE_ACTIONS_TCS")
  - `cache_value`: JSON string of corporate actions data
  - `last_updated`: LocalDateTime timestamp

### API Response Format
```json
{
  "fetchedAt": "2025-12-05T12:36:51",
  "dividends": {
    "upcoming": [...],
    "previous": [...]
  },
  "bonus": {
    "upcoming": [...],
    "previous": [...]
  },
  "splits": {
    "upcoming": [...],
    "previous": [...]
  },
  "rights": {
    "upcoming": [...],
    "previous": [...]
  }
}
```

## Benefits

1. **Reduced API Calls**: Minimizes requests to Moneycontrol.com
2. **Faster Load Times**: Cached data loads instantly from database
3. **Better User Control**: Refetch button allows manual refresh when needed
4. **Transparency**: Timestamp shows data freshness
5. **Automatic Expiry**: Old data (>1 week) is automatically refreshed
6. **Database Persistence**: Cache survives application restarts

## Testing

To test the implementation:

1. **First Load**:
   - Navigate to Corporate Actions tab for a ticker (e.g., TCS)
   - Verify data loads and shows "Just now"
   - Check database for `CORPORATE_ACTIONS_TCS` entry

2. **Cached Load**:
   - Refresh page or navigate away and back
   - Verify data loads quickly from cache
   - Check timestamp shows time elapsed

3. **Manual Refresh**:
   - Click "🔄 Refetch" button
   - Verify loading indicator appears
   - Verify data refreshes and timestamp updates to "Just now"

4. **Cache Expiry** (simulated):
   - Manually update `last_updated` in database to 8 days ago
   - Navigate to Corporate Actions tab
   - Verify fresh data is fetched automatically

## Notes

- The lint warnings in ScreenerAnalysisService.java are pre-existing and unrelated to this implementation
- The caching mechanism is consistent with the existing geo-analysis and news-analysis features
- The UI design matches the existing refetch functionality in other tabs
