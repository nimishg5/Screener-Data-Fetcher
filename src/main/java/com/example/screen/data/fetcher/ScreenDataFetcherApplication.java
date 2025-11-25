package com.example.screen.data.fetcher;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.web.client.RestTemplate;

@SpringBootApplication
public class ScreenDataFetcherApplication {

	public static void main(String[] args) {
		SpringApplication.run(ScreenDataFetcherApplication.class, args);
	}

    @Bean
    public RestTemplate restTemplate () {
        return new RestTemplate();
    }

}
