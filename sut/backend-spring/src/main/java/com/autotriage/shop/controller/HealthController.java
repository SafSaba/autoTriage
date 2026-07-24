package com.autotriage.shop.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Map;

@RestController
public class HealthController {

    @GetMapping("/api/health")
    public Map<String, Object> health() {
        return Map.of(
                "status", "up",
                "timestamp", Instant.now().toString(),
                "service", "E-Automate Spring Boot API",
                "version", "0.1.0"
        );
    }
}
