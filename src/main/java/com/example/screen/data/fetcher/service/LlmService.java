package com.example.screen.data.fetcher.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@Slf4j
public class LlmService {

    @Value("${llm.api.url}")
    private String apiUrl;

    @Value("${llm.api.key}")
    private String apiKey;

    @Value("${llm.model}")
    private String model;

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    public LlmService(ObjectMapper objectMapper) {
        this.httpClient = HttpClient.newHttpClient();
        this.objectMapper = objectMapper;
    }

    public List<String> getRelatedEntities(String ticker) {
        if (apiKey == null || apiKey.isEmpty()) {
            return new ArrayList<>();
        }

        String prompt = String.format(
                "Identify the top 5 related entities (subsidiaries, parent companies, key competitors, or major partners) for the stock \"%s\". "
                        +
                        "Return ONLY a JSON array of strings. Example: [\"Entity1\", \"Entity2\"]. Do not include any other text.",
                ticker);

        try {
            String response = callLlm(prompt);
            return parseJsonArray(response);
        } catch (Exception e) {
            log.error("Error fetching related entities from LLM", e);
            return new ArrayList<>();
        }
    }

    public String summarizeImpact(String ticker, Map<String, List<Map<String, String>>> newsData) {
        if (apiKey == null || apiKey.isEmpty()) {
            return "LLM API Key is missing. Cannot generate summary.";
        }

        StringBuilder newsContent = new StringBuilder();
        newsContent.append("News for ").append(ticker).append(" and related entities:\n\n");

        for (Map.Entry<String, List<Map<String, String>>> entry : newsData.entrySet()) {
            String entity = entry.getKey();
            List<Map<String, String>> items = entry.getValue();
            newsContent.append("--- Entity: ").append(entity).append(" ---\n");
            for (Map<String, String> item : items) {
                newsContent.append("- ").append(item.get("title")).append(" (").append(item.get("pubDate"))
                        .append(")\n");
            }
            newsContent.append("\n");
        }

        String prompt = String.format(
                "You are a financial analyst. Analyze the following news for stock \"%s\" and its related entities. " +
                        "Summarize the key events and explain their potential impact on the stock price or business outlook. "
                        +
                        "Provide the summary as a list of bullet points. Start every bullet point with a hyphen and a space: \"- \". "
                        +
                        "Do not use asterisks or numbered lists. Be concise and focus on material information.\n\n%s",
                ticker, newsContent.toString());

        try {
            return callLlm(prompt);
        } catch (Exception e) {
            log.error("Error generating summary from LLM", e);
            return "Error generating summary: " + e.getMessage();
        }
    }

    public List<Map<String, Object>> filterAndScoreNews(String ticker, List<Map<String, String>> newsItems) {
        if (apiKey == null || apiKey.isEmpty() || newsItems.isEmpty()) {
            return new ArrayList<>();
        }

        try {
            // Prepare simplified news list for prompt to save tokens
            List<String> simplifiedNews = new ArrayList<>();
            for (int i = 0; i < newsItems.size(); i++) {
                simplifiedNews.add(String.format("ID:%d|Title:%s", i, newsItems.get(i).get("title")));
            }

            String prompt = String.format(
                    "Analyze the following news headlines for stock \"%s\". " +
                            "For each news item, assign an \"impact_score\" (0-10, where 10 is critical impact) and a brief \"reason\". "
                            +
                            "Return a JSON array of objects: [{\"id\": 0, \"score\": 8, \"reason\": \"...\"}]. " +
                            "Only include items with score > 4. " +
                            "News:\n%s",
                    ticker, String.join("\n", simplifiedNews));

            String response = callLlm(prompt);
            List<Map<String, Object>> scoredItems = new ArrayList<>();

            JsonNode array = objectMapper.readTree(parseJsonContent(response));
            if (array.isArray()) {
                for (JsonNode node : array) {
                    int id = node.path("id").asInt();
                    if (id >= 0 && id < newsItems.size()) {
                        Map<String, String> original = newsItems.get(id);
                        Map<String, Object> scored = new HashMap<>(original);
                        scored.put("score", node.path("score").asInt());
                        scored.put("reason", node.path("reason").asText());
                        scoredItems.add(scored);
                    }
                }
            }

            // Sort by score desc
            scoredItems.sort((a, b) -> ((Integer) b.get("score")).compareTo((Integer) a.get("score")));
            return scoredItems;

        } catch (Exception e) {
            log.error("Error scoring news with LLM", e);
            return new ArrayList<>();
        }
    }

    private String parseJsonContent(String content) {
        // Clean up content if it contains markdown code blocks
        if (content.contains("```json")) {
            content = content.substring(content.indexOf("```json") + 7);
            if (content.contains("```")) {
                content = content.substring(0, content.indexOf("```"));
            }
        } else if (content.contains("```")) {
            content = content.substring(content.indexOf("```") + 3);
            if (content.contains("```")) {
                content = content.substring(0, content.indexOf("```"));
            }
        }
        return content.trim();
    }

    private String callLlm(String prompt) throws Exception {
        if (apiUrl.contains("generativelanguage.googleapis.com")) {
            return callGemini(prompt);
        } else {
            return callOpenAi(prompt);
        }
    }

    private String callGemini(String prompt) throws Exception {
        ObjectNode requestBody = objectMapper.createObjectNode();
        ArrayNode contents = requestBody.putArray("contents");
        ObjectNode part = contents.addObject();
        ArrayNode parts = part.putArray("parts");
        parts.addObject().put("text", prompt);

        String jsonBody = objectMapper.writeValueAsString(requestBody);

        // Gemini passes API key as query param
        String finalUrl = apiUrl + "?key=" + apiKey;

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(finalUrl))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() != 200) {
            throw new RuntimeException("Gemini API returned status " + response.statusCode() + ": " + response.body());
        }

        JsonNode responseNode = objectMapper.readTree(response.body());
        return responseNode.path("candidates").get(0).path("content").path("parts").get(0).path("text").asText();
    }

    private String callOpenAi(String prompt) throws Exception {
        ObjectNode requestBody = objectMapper.createObjectNode();
        requestBody.put("model", model);

        ArrayNode messages = requestBody.putArray("messages");
        ObjectNode message = messages.addObject();
        message.put("role", "user");
        message.put("content", prompt);

        String jsonBody = objectMapper.writeValueAsString(requestBody);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(apiUrl))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() != 200) {
            throw new RuntimeException("LLM API returned status " + response.statusCode() + ": " + response.body());
        }

        JsonNode responseNode = objectMapper.readTree(response.body());
        return responseNode.path("choices").get(0).path("message").path("content").asText();
    }

    private List<String> parseJsonArray(String content) {
        List<String> list = new ArrayList<>();
        try {
            JsonNode array = objectMapper.readTree(parseJsonContent(content));
            if (array.isArray()) {
                for (JsonNode node : array) {
                    list.add(node.asText());
                }
            }
        } catch (Exception e) {
            log.error("Error parsing JSON array from LLM response: {}", content, e);
        }
        return list;
    }
}
