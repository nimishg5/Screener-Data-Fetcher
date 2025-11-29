# Screener Data Fetcher

A Spring Boot application that automates the extraction and analysis of financial data from [Screener.in](https://www.screener.in/). It provides a user-friendly web interface to analyze stock tickers, compare companies, and visualize geographical revenue splits alongside relevant news.

## Features

*   **Ticker Analysis**: Fetch and view detailed financial ratios and data for individual stocks.
*   **Competitor Comparison**: Compare multiple tickers side-by-side with visual charts.
*   **Geo Analysis**: Analyze revenue breakup by geography (or segment) and view recent news specific to those regions.
*   **Screener.in Integration**: Log in with your Screener credentials to access premium/detailed data.
*   **Interactive UI**: Clean, dark-themed web interface with dynamic charts and tabs.

## Prerequisites

*   Java 17 or higher
*   Maven (wrapper included)

## Getting Started

1.  **Clone the repository**
    ```bash
    git clone https://github.com/nimishg5/Screener-Data-Fetcher.git
    cd Screener-Data-Fetcher
    ```

2.  **Build the application**
    ```bash
    ./mvnw clean install
    ```

3.  **Run the application**
    ```bash
    ./mvnw spring-boot:run
    ```

4.  **Access the Application**
    Open your browser and navigate to: [http://localhost:8080](http://localhost:8080)

## Usage Guide

### 1. Login
*   Navigate to the **Login** tab.
*   Enter your Screener.in credentials.
*   *Note: This is optional for basic data but recommended for full access.*

### 2. Ticker Analysis
*   Go to the **Ticker Analysis** tab.
*   Enter a stock ticker (e.g., `TCS`, `INFY`, `RELIANCE`).
*   Click **Fetch Data**.
*   The application will retrieve data and populate the underlying Excel sheet (backend).

### 3. Compare Tickers
*   Go to the **Compare** tab.
*   Enter multiple tickers separated by commas (e.g., `TCS, INFY, WIPRO`) or add them one by one.
*   Click **Compare**.
*   View the comparison table and switch to the **Charts** view for visual comparison of key metrics.

### 4. Geo Analysis
*   Go to the **Geo Analysis** tab.
*   Add tickers to the list.
*   The app will fetch the **Revenue Split** (by geography or segment) and display a pie chart.
*   It also fetches **Recent Impact News** relevant to the company's operating regions.
*   Use the sub-tabs to switch between different tickers.

## Technical Stack

*   **Backend**: Spring Boot, Java
*   **Data Extraction**: Jsoup (Web Scraping)
*   **Excel Processing**: Apache POI
*   **Frontend**: HTML5, CSS3, JavaScript
*   **Visualization**: Chart.js