package com.autotriage.shop.controller;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.info.BuildProperties;
import org.springframework.boot.info.GitProperties;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
public class HealthController {

    private final ObjectProvider<BuildProperties> buildPropertiesProvider;
    private final ObjectProvider<GitProperties> gitPropertiesProvider;

    public HealthController(ObjectProvider<BuildProperties> buildPropertiesProvider,
                            ObjectProvider<GitProperties> gitPropertiesProvider) {
        this.buildPropertiesProvider = buildPropertiesProvider;
        this.gitPropertiesProvider = gitPropertiesProvider;
    }

    @GetMapping("/api/health")
    public Map<String, Object> health() {
        BuildProperties bp = buildPropertiesProvider.getIfAvailable();
        GitProperties gp = gitPropertiesProvider.getIfAvailable();

        String version = bp != null ? bp.getVersion() : "0.1.0-SNAPSHOT";
        String gitSha = gp != null ? gp.getShortCommitId() : null;

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("status", "up");
        resp.put("timestamp", Instant.now().toString());
        resp.put("service", "E-Automate Spring Boot API");
        resp.put("version", version);
        if (gitSha != null) {
            resp.put("gitSha", gitSha);
        }
        return resp;
    }
}
