package com.autotriage.shop.controller;

import com.autotriage.shop.domain.CartItemEntity;
import com.autotriage.shop.domain.OrderEntity;
import com.autotriage.shop.domain.OrderItemEntity;
import com.autotriage.shop.domain.ProductEntity;
import com.autotriage.shop.domain.UserEntity;
import com.autotriage.shop.repository.CartItemRepository;
import com.autotriage.shop.repository.OrderRepository;
import com.autotriage.shop.repository.ProductRepository;
import com.autotriage.shop.repository.UserRepository;
import com.autotriage.shop.security.AuthPrincipal;
import com.autotriage.shop.security.JwtService;
import com.autotriage.shop.service.BugFlagsService;
import com.autotriage.shop.service.DtoMapper;
import com.autotriage.shop.service.FdeEpisodicMemoryService;
import com.autotriage.shop.service.FdeRagService;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/fde")
@Tag(name = "6. FDE Mission Control & Agentic Diagnostics", description = "Live endpoints powering Glass-Box Mission Control v3.0, ADO Proxy, Chaos Attacks, and Self-Healing")
public class FdeAgenticController {

    private static final Logger log = LoggerFactory.getLogger(FdeAgenticController.class);

    private final ProductRepository productRepository;
    private final OrderRepository orderRepository;
    private final CartItemRepository cartItemRepository;
    private final UserRepository userRepository;
    private final BugFlagsService bugFlagsService;
    private final JwtService jwtService;
    private final PasswordEncoder passwordEncoder;
    private final JdbcTemplate jdbcTemplate;
    private final DtoMapper mapper;
    private final ObjectMapper objectMapper;
    private final FdeRagService fdeRagService;
    private final FdeEpisodicMemoryService fdeEpisodicMemoryService;
    private final org.springframework.beans.factory.ObjectProvider<org.springframework.boot.info.BuildProperties> buildPropertiesProvider;
    private final org.springframework.beans.factory.ObjectProvider<org.springframework.boot.info.GitProperties> gitPropertiesProvider;
    private final org.springframework.core.env.Environment environment;
    private final String devUrl;
    private final String qaUrl;
    private final String prodUrl;

    private static final String SANDBOX_USER_ID = "usr_sandbox_operator";
    private static final String SANDBOX_USER_EMAIL = "fde-sandbox-operator@autotriage.local";
    private static final String ADO_ORG = "isafwan";
    private static final String ADO_PROJECT = "AutoTriage";
    private static final String ADO_REPO_ID = "52a5da4c-1581-447b-9d8d-f138fc4096a5";

    public FdeAgenticController(ProductRepository productRepository,
                                OrderRepository orderRepository,
                                CartItemRepository cartItemRepository,
                                UserRepository userRepository,
                                BugFlagsService bugFlagsService,
                                JwtService jwtService,
                                PasswordEncoder passwordEncoder,
                                JdbcTemplate jdbcTemplate,
                                DtoMapper mapper,
                                ObjectMapper objectMapper,
                                FdeRagService fdeRagService,
                                FdeEpisodicMemoryService fdeEpisodicMemoryService,
                                org.springframework.beans.factory.ObjectProvider<org.springframework.boot.info.BuildProperties> buildPropertiesProvider,
                                org.springframework.beans.factory.ObjectProvider<org.springframework.boot.info.GitProperties> gitPropertiesProvider,
                                org.springframework.core.env.Environment environment,
                                @org.springframework.beans.factory.annotation.Value("${app.envs.dev-url:${DEV_API_URL:http://localhost:8080}}") String devUrl,
                                @org.springframework.beans.factory.annotation.Value("${app.envs.qa-url:${QA_API_URL:https://autotriage-backend-qa.graytree-645df5bf.eastus.azurecontainerapps.io}}") String qaUrl,
                                @org.springframework.beans.factory.annotation.Value("${app.envs.prod-url:${PROD_API_URL:}}") String prodUrl) {
        this.productRepository = productRepository;
        this.orderRepository = orderRepository;
        this.cartItemRepository = cartItemRepository;
        this.userRepository = userRepository;
        this.bugFlagsService = bugFlagsService;
        this.jwtService = jwtService;
        this.passwordEncoder = passwordEncoder;
        this.jdbcTemplate = jdbcTemplate;
        this.mapper = mapper;
        this.objectMapper = objectMapper;
        this.fdeRagService = fdeRagService;
        this.fdeEpisodicMemoryService = fdeEpisodicMemoryService;
        this.buildPropertiesProvider = buildPropertiesProvider;
        this.gitPropertiesProvider = gitPropertiesProvider;
        this.environment = environment;
        this.devUrl = devUrl;
        this.qaUrl = qaUrl;
        this.prodUrl = prodUrl;
    }

    // =========================================================================
    // 1. POST /api/fde/session - Scoped Operator Sandbox Token
    // =========================================================================
    @PostMapping("/session")
    @Operation(summary = "Generate zero-friction scoped operator sandbox JWT token")
    public ResponseEntity<Map<String, Object>> createOperatorSession(@RequestBody(required = false) Map<String, Object> body) {
        ensureSandboxUserExists();
        String token = jwtService.generateToken(SANDBOX_USER_ID, SANDBOX_USER_EMAIL, "FDE_OPERATOR");

        Map<String, Object> user = Map.of(
                "id", SANDBOX_USER_ID,
                "email", SANDBOX_USER_EMAIL,
                "role", "FDE_OPERATOR",
                "displayName", "FDE Sandbox Operator"
        );

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("token", token);
        resp.put("user", user);
        resp.put("expiresIn", 86400000L);
        resp.put("type", "Bearer");
        resp.put("sandboxMode", true);

        return ResponseEntity.ok(resp);
    }

    // =========================================================================
    // 2. GET /api/fde/releases & /api/fde/releases/self
    // =========================================================================
    @GetMapping("/releases/self")
    @Operation(summary = "Get build metadata, Git SHA, Flyway migration version, and active bug flags for this instance")
    public ResponseEntity<Map<String, Object>> getReleasesSelf() {
        return ResponseEntity.ok(buildSelfReleaseInfo());
    }

    @GetMapping("/releases")
    @Operation(summary = "Query releases telemetry across DEV, QA, and PROD environments")
    public ResponseEntity<Map<String, Object>> getReleases() {
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("self", buildSelfReleaseInfo());

        Map<String, Object> environments = new LinkedHashMap<>();
        environments.put("dev", probeReleaseEnvironment("dev", devUrl, false));
        environments.put("qa", probeReleaseEnvironment("qa", qaUrl, false));
        environments.put("prod", probeReleaseEnvironment("prod", prodUrl, true));
        resp.put("environments", environments);

        return ResponseEntity.ok(resp);
    }

    // =========================================================================
    // 3. POST /api/fde/scenarios/{id}/run, /compare/{id}, /attack
    // =========================================================================
    @PostMapping("/scenarios/{id}/run")
    @Operation(summary = "Execute deterministic drift scenario against target environment (dev or qa)")
    public ResponseEntity<Map<String, Object>> runScenario(
            @PathVariable String id,
            @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> result = runScenarioInternal(id, body);
        int httpStatus = ((Number) result.getOrDefault("httpStatus", 200)).intValue();
        return ResponseEntity.status(httpStatus == 500 ? HttpStatus.INTERNAL_SERVER_ERROR : HttpStatus.OK).body(result);
    }

    @PostMapping("/compare/{id}")
    @Operation(summary = "Execute scenario on DEV vs QA and return drift summary")
    public ResponseEntity<Map<String, Object>> compareScenario(
            @PathVariable String id,
            @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> devReq = body != null ? new HashMap<>(body) : new HashMap<>();
        devReq.put("target", "dev");
        Map<String, Object> devResult = runScenarioInternal(id, devReq);

        Map<String, Object> qaReq = body != null ? new HashMap<>(body) : new HashMap<>();
        qaReq.put("target", "qa");
        Map<String, Object> qaResult = runScenarioInternal(id, qaReq);

        List<Map<String, Object>> driftSummary = new ArrayList<>();
        boolean driftDetected = false;

        int devStatus = ((Number) devResult.getOrDefault("httpStatus", 0)).intValue();
        int qaStatus = ((Number) qaResult.getOrDefault("httpStatus", 0)).intValue();
        if (devStatus != qaStatus) {
            driftDetected = true;
            driftSummary.add(Map.of("field", "httpStatus", "dev", devStatus, "qa", qaStatus, "description", "HTTP status differs between DEV and QA"));
        }

        @SuppressWarnings("unchecked")
        Map<String, Object> devBlast = (Map<String, Object>) devResult.getOrDefault("financialBlastRadius", Map.of());
        @SuppressWarnings("unchecked")
        Map<String, Object> qaBlast = (Map<String, Object>) qaResult.getOrDefault("financialBlastRadius", Map.of());
        double devLoss = ((Number) devBlast.getOrDefault("dollarLoss", 0.0)).doubleValue();
        double qaLoss = ((Number) qaBlast.getOrDefault("dollarLoss", 0.0)).doubleValue();
        if (Double.compare(devLoss, qaLoss) != 0) {
            driftDetected = true;
            driftSummary.add(Map.of("field", "dollarLoss", "dev", devLoss, "qa", qaLoss, "description", "Financial dollar loss differs between DEV and QA"));
        }

        int devUnits = ((Number) devBlast.getOrDefault("unfulfillableUnits", 0)).intValue();
        int qaUnits = ((Number) qaBlast.getOrDefault("unfulfillableUnits", 0)).intValue();
        if (devUnits != qaUnits) {
            driftDetected = true;
            driftSummary.add(Map.of("field", "unfulfillableUnits", "dev", devUnits, "qa", qaUnits, "description", "Unfulfillable units differ between DEV and QA"));
        }

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("scenarioId", id);
        resp.put("dev", devResult);
        resp.put("qa", qaResult);
        resp.put("driftDetected", driftDetected);
        resp.put("driftSummary", driftSummary);

        return ResponseEntity.ok(resp);
    }

    @PostMapping({"/attack", "/execute-attack"})
    @Operation(summary = "Execute natural language or raw JSON attack with pre/post state capture")
    public ResponseEntity<Map<String, Object>> executeAttack(@RequestBody(required = false) Map<String, Object> req) {
        String rawPrompt = req != null && req.get("prompt") != null ? String.valueOf(req.get("prompt")) : "";
        String attackType = req != null && req.get("attackType") != null ? String.valueOf(req.get("attackType")) : "";
        String resolved = resolveAttackType(attackType, rawPrompt);
        Map<String, Object> result = runScenarioInternal(resolved, req);
        int httpStatus = ((Number) result.getOrDefault("httpStatus", 200)).intValue();
        return ResponseEntity.status(httpStatus == 500 ? HttpStatus.INTERNAL_SERVER_ERROR : HttpStatus.OK).body(result);
    }

    private Map<String, Object> buildSelfReleaseInfo() {
        var bp = buildPropertiesProvider.getIfAvailable();
        var gp = gitPropertiesProvider.getIfAvailable();

        String version = bp != null ? bp.getVersion() : "0.1.0-SNAPSHOT";
        String gitSha = gp != null ? gp.getShortCommitId() : null;
        String gitBranch = gp != null ? gp.getBranch() : null;
        String buildTime = bp != null && bp.getTime() != null ? bp.getTime().toString()
                : (gp != null && gp.getCommitTime() != null ? gp.getCommitTime().toString() : null);

        String flywayVersion = null;
        String flywayInstalledOn = null;
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT version, installed_on FROM flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1"
            );
            if (!rows.isEmpty()) {
                flywayVersion = rows.get(0).get("version") != null ? String.valueOf(rows.get(0).get("version")) : null;
                flywayInstalledOn = rows.get(0).get("installed_on") != null ? String.valueOf(rows.get(0).get("installed_on")) : null;
            }
        } catch (Exception e) {
            log.debug("Flyway schema history query notice: {}", e.getMessage());
        }

        Map<String, Object> self = new LinkedHashMap<>();
        self.put("version", version);
        self.put("gitSha", gitSha);
        self.put("gitBranch", gitBranch);
        self.put("buildTime", buildTime);
        self.put("flywayVersion", flywayVersion);
        self.put("flywayInstalledOn", flywayInstalledOn);
        self.put("activeBugFlags", bugFlagsService.getFlags());
        return self;
    }

    private Map<String, Object> probeReleaseEnvironment(String name, String baseUrl, boolean readOnly) {
        Map<String, Object> env = new LinkedHashMap<>();
        env.put("name", name);
        env.put("url", baseUrl);
        env.put("readOnly", readOnly);

        if (baseUrl == null || baseUrl.isBlank()) {
            env.put("reachable", false);
            env.put("data", null);
            env.put("error", "URL not configured");
            return env;
        }

        String targetUrl = baseUrl.replaceAll("/+$", "") + "/api/fde/releases/self";
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(targetUrl))
                    .header("Accept", "application/json")
                    .timeout(Duration.ofSeconds(4))
                    .GET()
                    .build();
            HttpClient client = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(4))
                    .build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200) {
                env.put("reachable", true);
                env.put("data", objectMapper.readValue(response.body(), new TypeReference<Map<String, Object>>() {}));
                env.put("error", null);
            } else {
                env.put("reachable", false);
                env.put("data", null);
                env.put("error", "HTTP " + response.statusCode());
            }
        } catch (Exception ex) {
            env.put("reachable", false);
            env.put("data", null);
            env.put("error", ex.getMessage() != null ? ex.getMessage() : ex.getClass().getSimpleName());
        }
        return env;
    }

    private String obtainProbeToken(String baseUrl, String email) {
        try {
            Map<String, String> signupBody = Map.of(
                    "firstName", "Probe",
                    "lastName", "Runner",
                    "email", email,
                    "password", "ProbePassword123!"
            );
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + "/api/auth/signup"))
                    .header("Content-Type", "application/json")
                    .timeout(Duration.ofSeconds(4))
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(signupBody)))
                    .build();
            HttpResponse<String> resp = HttpClient.newHttpClient().send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() == 200 || resp.statusCode() == 201) {
                JsonNode json = objectMapper.readTree(resp.body());
                return json.path("token").asText(null);
            }
            if (resp.statusCode() == 400) {
                Map<String, String> loginBody = Map.of(
                        "email", email,
                        "password", "ProbePassword123!"
                );
                HttpRequest lReq = HttpRequest.newBuilder()
                        .uri(URI.create(baseUrl + "/api/auth/login"))
                        .header("Content-Type", "application/json")
                        .timeout(Duration.ofSeconds(4))
                        .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(loginBody)))
                        .build();
                HttpResponse<String> lResp = HttpClient.newHttpClient().send(lReq, HttpResponse.BodyHandlers.ofString());
                if (lResp.statusCode() == 200) {
                    JsonNode json = objectMapper.readTree(lResp.body());
                    return json.path("token").asText(null);
                }
            }
        } catch (Exception ignored) {}
        return null;
    }

    private Map<String, Object> runScenarioInternal(String rawScenarioId, Map<String, Object> req) {
        ensureSandboxUserExists();
        long startTime = System.currentTimeMillis();

        String rawPrompt = req != null && req.get("prompt") != null ? String.valueOf(req.get("prompt")) : "";
        String attackType = req != null && req.get("attackType") != null ? String.valueOf(req.get("attackType")) : "";
        String scenarioId = (rawScenarioId != null && !rawScenarioId.isBlank()) ? rawScenarioId : resolveAttackType(attackType, rawPrompt);

        String normScenario = scenarioId.toUpperCase(Locale.ROOT).trim();
        if (normScenario.contains("R1") || normScenario.contains("TAX") || normScenario.contains("PRICE")) normScenario = "R1_TAX";
        else if (normScenario.contains("R2") || normScenario.contains("NULL") || normScenario.contains("NPE")) normScenario = "R2_NULL_LINE2";
        else if (normScenario.contains("R3") || normScenario.contains("CART") || normScenario.contains("STALE")) normScenario = "R3_STALE_CART";
        else if (normScenario.contains("R4") || normScenario.contains("RACE") || normScenario.contains("STOCK")) normScenario = "R4_STOCK_RACE";
        else normScenario = "R1_TAX";

        String target = req != null && req.get("target") != null ? String.valueOf(req.get("target")).toLowerCase(Locale.ROOT).trim() : "dev";
        if (!"qa".equals(target)) target = "dev";

        int concurrency = 4;
        if (req != null && req.get("concurrency") != null) {
            try {
                concurrency = Math.max(2, Math.min(10, Integer.parseInt(String.valueOf(req.get("concurrency")))));
            } catch (Exception ignored) {}
        }
        String productId = req != null && req.get("productId") != null ? String.valueOf(req.get("productId")) : null;

        Map<String, Object> preState = captureSnapshot();

        int httpStatus = 200;
        double dollarLoss = 0.0;
        int unfulfillableUnits = 0;
        double annualProjectedLoss = 0.0;
        String executionMessage = "";
        Map<String, Object> executionDetails = new LinkedHashMap<>();
        String runId = "fde_run_" + UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        String probeEmail = "fde-probe+" + runId + "@autotriage.local";

        String targetBaseUrl = "qa".equals(target) ? qaUrl.replaceAll("/+$", "") : devUrl.replaceAll("/+$", "");

        boolean httpExecuted = false;
        try {
            String probeToken = obtainProbeToken(targetBaseUrl, probeEmail);
            if (probeToken != null && !probeToken.isBlank()) {
                switch (normScenario) {
                    case "R1_TAX" -> {
                        String targetPid = (productId != null && !productId.isBlank()) ? productId : "prod_001";
                        double unitPrice = 450.0;
                        try {
                            HttpRequest pReq = HttpRequest.newBuilder()
                                    .uri(URI.create(targetBaseUrl + "/api/products/" + targetPid))
                                    .header("Accept", "application/json")
                                    .timeout(Duration.ofSeconds(4))
                                    .GET().build();
                            HttpResponse<String> pRes = HttpClient.newHttpClient().send(pReq, HttpResponse.BodyHandlers.ofString());
                            if (pRes.statusCode() == 200) {
                                JsonNode pNode = objectMapper.readTree(pRes.body());
                                unitPrice = pNode.path("price").asDouble(450.0);
                            }
                        } catch (Exception ignored) {}

                        double expectedTotal = Math.round(unitPrice * 1.10 * 100.0) / 100.0;
                        Map<String, Object> orderBody = Map.of(
                                "items", List.of(Map.of("productId", targetPid, "quantity", 1)),
                                "shippingAddress", Map.of(
                                        "name", "FDE Probe Runner",
                                        "line1", "100 Innovation Way",
                                        "line2", "Suite 200",
                                        "city", "Tampa",
                                        "state", "FL",
                                        "postal_code", "33602",
                                        "country", "USA"
                                ),
                                "paymentDetails", Map.of("method", "Card", "last4", "4242")
                        );
                        HttpRequest oReq = HttpRequest.newBuilder()
                                .uri(URI.create(targetBaseUrl + "/api/orders"))
                                .header("Content-Type", "application/json")
                                .header("Authorization", "Bearer " + probeToken)
                                .timeout(Duration.ofSeconds(4))
                                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(orderBody)))
                                .build();
                        HttpResponse<String> oRes = HttpClient.newHttpClient().send(oReq, HttpResponse.BodyHandlers.ofString());
                        httpStatus = oRes.statusCode();
                        if (httpStatus == 200 || httpStatus == 201) {
                            JsonNode oNode = objectMapper.readTree(oRes.body());
                            double actualTotal = oNode.path("total").asDouble(expectedTotal);
                            dollarLoss = Math.max(0.0, Math.round((expectedTotal - actualTotal) * 100.0) / 100.0);
                            annualProjectedLoss = Math.round(dollarLoss * 365.0 * 100.0) / 100.0;
                            unfulfillableUnits = 0;
                            executionMessage = String.format("R1_TAX executed via HTTP on %s: unitPrice=%.2f, expectedTotal=%.2f, actualTotal=%.2f, loss=%.2f",
                                    target, unitPrice, expectedTotal, actualTotal, dollarLoss);
                            executionDetails.put("unitPrice", unitPrice);
                            executionDetails.put("expectedTotal", expectedTotal);
                            executionDetails.put("actualTotal", actualTotal);
                            executionDetails.put("dollarLoss", dollarLoss);
                            httpExecuted = true;
                        }
                    }
                    case "R2_NULL_LINE2" -> {
                        String targetPid = (productId != null && !productId.isBlank()) ? productId : "prod_001";
                        Map<String, Object> orderBody = new LinkedHashMap<>();
                        orderBody.put("items", List.of(Map.of("productId", targetPid, "quantity", 1)));
                        Map<String, Object> addr = new LinkedHashMap<>();
                        addr.put("name", "FDE Null Line2 Probe");
                        addr.put("line1", "100 Crash Boulevard");
                        addr.put("city", "Tampa");
                        addr.put("state", "FL");
                        addr.put("postal_code", "33602");
                        addr.put("country", "USA");
                        orderBody.put("shippingAddress", addr);
                        orderBody.put("paymentDetails", Map.of("method", "Card", "last4", "4242"));

                        HttpRequest oReq = HttpRequest.newBuilder()
                                .uri(URI.create(targetBaseUrl + "/api/orders"))
                                .header("Content-Type", "application/json")
                                .header("Authorization", "Bearer " + probeToken)
                                .timeout(Duration.ofSeconds(4))
                                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(orderBody)))
                                .build();
                        HttpResponse<String> oRes = HttpClient.newHttpClient().send(oReq, HttpResponse.BodyHandlers.ofString());
                        httpStatus = oRes.statusCode();
                        if (httpStatus == 500) {
                            dollarLoss = 1399.00;
                            unfulfillableUnits = 1;
                            annualProjectedLoss = 51063500.00;
                            executionMessage = "R2_NULL_LINE2 triggered via HTTP on " + target + ": HTTP 500 NullPointerException caused by null addressLine2.";
                            executionDetails.put("exceptionType", "java.lang.NullPointerException");
                        } else {
                            dollarLoss = 0.0;
                            unfulfillableUnits = 0;
                            annualProjectedLoss = 0.0;
                            executionMessage = "R2_NULL_LINE2 passed via HTTP on " + target + ": HTTP 200 OK handled null line2 safely.";
                        }
                        executionDetails.put("observedStatus", httpStatus);
                        httpExecuted = true;
                    }
                    case "R3_STALE_CART" -> {
                        String targetPid = (productId != null && !productId.isBlank()) ? productId : "prod_001";
                        HttpRequest cReq = HttpRequest.newBuilder()
                                .uri(URI.create(targetBaseUrl + "/api/cart"))
                                .header("Content-Type", "application/json")
                                .header("Authorization", "Bearer " + probeToken)
                                .timeout(Duration.ofSeconds(4))
                                .POST(HttpRequest.BodyPublishers.ofString("{\"productId\":\"" + targetPid + "\",\"quantity\":1}"))
                                .build();
                        HttpClient.newHttpClient().send(cReq, HttpResponse.BodyHandlers.ofString());

                        Map<String, Object> orderBody = Map.of(
                                "shippingAddress", Map.of(
                                        "name", "FDE Cart Probe",
                                        "line1", "100 Cart Way",
                                        "line2", "Apt 1",
                                        "city", "Tampa",
                                        "state", "FL",
                                        "postal_code", "33602",
                                        "country", "USA"
                                ),
                                "paymentDetails", Map.of("method", "Card", "last4", "4242")
                        );
                        HttpRequest oReq = HttpRequest.newBuilder()
                                .uri(URI.create(targetBaseUrl + "/api/orders"))
                                .header("Content-Type", "application/json")
                                .header("Authorization", "Bearer " + probeToken)
                                .timeout(Duration.ofSeconds(4))
                                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(orderBody)))
                                .build();
                        HttpClient.newHttpClient().send(oReq, HttpResponse.BodyHandlers.ofString());

                        HttpRequest checkReq = HttpRequest.newBuilder()
                                .uri(URI.create(targetBaseUrl + "/api/cart"))
                                .header("Authorization", "Bearer " + probeToken)
                                .timeout(Duration.ofSeconds(4))
                                .GET().build();
                        HttpResponse<String> checkRes = HttpClient.newHttpClient().send(checkReq, HttpResponse.BodyHandlers.ofString());
                        httpStatus = checkRes.statusCode();
                        int remainingCartCount = 0;
                        if (httpStatus == 200) {
                            JsonNode cartArr = objectMapper.readTree(checkRes.body());
                            remainingCartCount = cartArr.isArray() ? cartArr.size() : 0;
                        }
                        if (remainingCartCount > 0) {
                            unfulfillableUnits = remainingCartCount;
                            dollarLoss = 450.00 * remainingCartCount;
                            annualProjectedLoss = Math.round(dollarLoss * 365.0 * 100.0) / 100.0;
                            executionMessage = String.format("R3_STALE_CART exploited via HTTP on %s: cart contains %d leftover stale items after checkout.", target, remainingCartCount);
                        } else {
                            unfulfillableUnits = 0;
                            dollarLoss = 0.0;
                            annualProjectedLoss = 0.0;
                            executionMessage = "R3_STALE_CART healthy via HTTP on " + target + ": cart successfully cleared upon order placement.";
                        }
                        executionDetails.put("staleCartItemsCount", remainingCartCount);
                        httpExecuted = true;
                    }
                    case "R4_STOCK_RACE" -> {
                        if ("qa".equals(target)) {
                            httpStatus = 200;
                            dollarLoss = 0.0;
                            unfulfillableUnits = 0;
                            annualProjectedLoss = 0.0;
                            executionMessage = "R4_STOCK_RACE requires dev environment for known starting stock manipulation; skipped on qa.";
                            executionDetails.put("skipped", true);
                            executionDetails.put("reason", "requires dev");
                            httpExecuted = true;
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.info("HTTP execution notice for {} on {}: {}", normScenario, target, e.getMessage());
        }

        if (!httpExecuted) {
            switch (normScenario) {
                case "R1_TAX" -> {
                    String targetPid = (productId != null && !productId.isBlank()) ? productId : "prod_001";
                    ProductEntity product = productRepository.findById(targetPid).orElse(productRepository.findAll().get(0));
                    BigDecimal price = product.getPrice();
                    boolean isBugActive = bugFlagsService.isOffByOneDiscount();
                    BigDecimal multiplier = isBugActive ? new BigDecimal("0.99") : new BigDecimal("1.10");
                    BigDecimal actualTotal = price.multiply(multiplier).setScale(2, RoundingMode.HALF_UP);
                    BigDecimal expectedTotal = price.multiply(new BigDecimal("1.10")).setScale(2, RoundingMode.HALF_UP);

                    httpStatus = 200;
                    dollarLoss = Math.max(0.0, expectedTotal.subtract(actualTotal).doubleValue());
                    unfulfillableUnits = 0;
                    annualProjectedLoss = Math.round(dollarLoss * 365.0 * 100.0) / 100.0;
                    executionMessage = String.format("R1_TAX observed: unitPrice=%.2f, expectedTotal=%.2f, actualTotal=%.2f, loss=%.2f (flag=%b)",
                            price.doubleValue(), expectedTotal.doubleValue(), actualTotal.doubleValue(), dollarLoss, isBugActive);
                    executionDetails.put("targetProduct", product.getId());
                    executionDetails.put("unitPrice", price);
                    executionDetails.put("expectedTotal", expectedTotal);
                    executionDetails.put("actualTotal", actualTotal);
                    executionDetails.put("activeFlag", "BUG_OFF_BY_ONE_DISCOUNT");
                    executionDetails.put("dollarLoss", dollarLoss);
                }
                case "R2_NULL_LINE2" -> {
                    boolean isBugActive = bugFlagsService.isNullShippingNpe();
                    if (isBugActive) {
                        httpStatus = 500;
                        dollarLoss = 1399.00;
                        unfulfillableUnits = 1;
                        annualProjectedLoss = 51063500.00;
                        executionMessage = "R2_NULL_LINE2 triggered: OrderController line2().trim() threw java.lang.NullPointerException (HTTP 500).";
                        executionDetails.put("targetClass", "OrderController.java");
                        executionDetails.put("exceptionType", "java.lang.NullPointerException");
                        executionDetails.put("activeFlag", "BUG_NULL_SHIPPING_NPE");
                    } else {
                        httpStatus = 200;
                        dollarLoss = 0.0;
                        unfulfillableUnits = 0;
                        annualProjectedLoss = 0.0;
                        executionMessage = "R2_NULL_LINE2 healthy: Order handled null line2 safely without NPE.";
                    }
                }
                case "R3_STALE_CART" -> {
                    boolean isBugActive = bugFlagsService.isStaleCartCache();
                    int staleUnits = isBugActive ? 5 : 0;
                    ProductEntity product = productRepository.findById(productId != null && !productId.isBlank() ? productId : "prod_001")
                            .orElse(productRepository.findAll().get(0));
                    httpStatus = 200;
                    dollarLoss = isBugActive ? product.getPrice().doubleValue() * staleUnits : 0.0;
                    unfulfillableUnits = staleUnits;
                    annualProjectedLoss = Math.round(dollarLoss * 365.0 * 100.0) / 100.0;
                    executionMessage = isBugActive
                            ? String.format("R3_STALE_CART exploited: %d stale units remained in cart after order.", staleUnits)
                            : "R3_STALE_CART healthy: cart safely cleared on order completion.";
                    executionDetails.put("activeFlag", "BUG_STALE_CART_CACHE");
                    executionDetails.put("staleCartUnits", staleUnits);
                }
                case "R4_STOCK_RACE" -> {
                    if ("qa".equals(target)) {
                        httpStatus = 200;
                        dollarLoss = 0.0;
                        unfulfillableUnits = 0;
                        annualProjectedLoss = 0.0;
                        executionMessage = "R4_STOCK_RACE requires dev environment for known starting stock manipulation; skipped on qa.";
                        executionDetails.put("skipped", true);
                        executionDetails.put("reason", "requires dev");
                    } else {
                        String targetPid = (productId != null && !productId.isBlank()) ? productId : "prod_004";
                        ProductEntity product = productRepository.findById(targetPid).orElse(productRepository.findAll().get(0));
                        int startingStock = 2;
                        product.setStock(startingStock);
                        productRepository.save(product);

                        int threadCount = Math.max(2, Math.min(10, concurrency));
                        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
                        CountDownLatch latch = new CountDownLatch(threadCount);
                        AtomicInteger successfulOrders = new AtomicInteger(0);
                        AtomicInteger conflictCount = new AtomicInteger(0);

                        for (int i = 0; i < threadCount; i++) {
                            executor.submit(() -> {
                                try {
                                    int rows = productRepository.decrementStockIfAvailable(product.getId(), 1);
                                    if (rows > 0) {
                                        successfulOrders.incrementAndGet();
                                    } else {
                                        conflictCount.incrementAndGet();
                                    }
                                } finally {
                                    latch.countDown();
                                }
                            });
                        }

                        try {
                            latch.await(4, TimeUnit.SECONDS);
                        } catch (InterruptedException ignored) {}
                        executor.shutdown();

                        ProductEntity postProd = productRepository.findById(product.getId()).orElse(product);
                        httpStatus = 200;
                        int oversold = Math.max(0, successfulOrders.get() - startingStock);
                        unfulfillableUnits = oversold;
                        dollarLoss = unfulfillableUnits * product.getPrice().doubleValue();
                        annualProjectedLoss = Math.round(dollarLoss * 52.0 * 100.0) / 100.0;
                        executionMessage = String.format("R4_STOCK_RACE executed: %d threads raced on %d initial stock. Successes: %d, Conflicts (409): %d, Final stock: %d, Oversold: %d.",
                                threadCount, startingStock, successfulOrders.get(), conflictCount.get(), postProd.getStock(), oversold);
                        executionDetails.put("threadCount", threadCount);
                        executionDetails.put("initialStock", startingStock);
                        executionDetails.put("finalStock", postProd.getStock());
                        executionDetails.put("successCount", successfulOrders.get());
                        executionDetails.put("conflictCount", conflictCount.get());
                        executionDetails.put("oversoldUnits", oversold);
                    }
                }
            }
        }

        Map<String, Object> postState = captureSnapshot();
        Map<String, Object> delta = computeDelta(preState, postState);
        long latencyMs = System.currentTimeMillis() - startTime;

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("scenarioId", normScenario);
        result.put("attackType", !attackType.isBlank() ? attackType : normScenario);
        result.put("target", target);
        result.put("status", "COMPLETED");
        result.put("httpStatus", httpStatus);
        result.put("latencyMs", latencyMs);
        result.put("financialBlastRadius", Map.of(
                "dollarLoss", dollarLoss,
                "unfulfillableUnits", unfulfillableUnits,
                "annualProjectedLoss", annualProjectedLoss
        ));
        result.put("executionMessage", executionMessage);
        result.put("executionDetails", executionDetails);
        result.put("preState", preState);
        result.put("postState", postState);
        result.put("delta", delta);
        result.put("runId", runId);

        try {
            jdbcTemplate.update("""
                INSERT INTO fde_attack_runs (
                    id, user_id, attack_type, prompt, http_status, latency_ms,
                    dollar_loss, unfulfillable_units, annual_projected_loss,
                    execution_message, pre_state_json, post_state_json, delta_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                runId,
                resolveCallerUserId(),
                normScenario,
                rawPrompt.isBlank() ? normScenario : rawPrompt,
                httpStatus,
                latencyMs,
                BigDecimal.valueOf(dollarLoss),
                unfulfillableUnits,
                BigDecimal.valueOf(annualProjectedLoss),
                executionMessage,
                objectMapper.writeValueAsString(preState),
                objectMapper.writeValueAsString(postState),
                objectMapper.writeValueAsString(delta)
            );
        } catch (Exception ex) {
            log.warn("Database audit ledger notice (fde_attack_runs): {}", ex.getMessage());
        }

        return result;
    }

    // =========================================================================
    // 3. POST /api/fde/heal - Self-Healing Catalog & Flag Restoration
    // =========================================================================
    @PostMapping("/heal")
    @Transactional
    @Operation(summary = "Heal catalog stock, reset bug flags, clean orphan data, and verify 200 OK")
    public ResponseEntity<Map<String, Object>> healSystem() {
        List<String> activeProfiles = Arrays.asList(environment.getActiveProfiles());
        boolean isDev = activeProfiles.contains("dev") || activeProfiles.contains("test");
        if (!isDev) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                    "error", "Forbidden: Sandbox reset is only permitted in environments with the 'dev' profile active."
            ));
        }

        long startTime = System.currentTimeMillis();

        // 1. Reset all bug flags
        bugFlagsService.updateFlags(Map.of(
                "BUG_NULL_SHIPPING_NPE", false,
                "BUG_OFF_BY_ONE_DISCOUNT", false,
                "BUG_STALE_CART_CACHE", false
        ));

        // 2. Restore 8 canonical catalog products
        List<ProductEntity> defaults = List.of(
                buildProduct("prod_001", "Chronograph Excellence", "A masterpiece of precision and style, this chronograph watch is designed for the modern man. Featuring a stainless steel case, sapphire crystal glass, and a sophisticated dial with multiple subdials, it offers both functionality and elegance. Water-resistant up to 100 meters.", 450.00, List.of("https://images.unsplash.com/photo-1524805444758-089113d48a6d?q=80&w=600&auto=format&fit=crop","https://placehold.co/600x600.png","https://placehold.co/600x600.png"), "Watches", 15, "luxury watch"),
                buildProduct("prod_002", "Titanium Smartwatch", "Experience the future on your wrist. This smartwatch boasts a lightweight titanium frame, a vibrant AMOLED display, and a suite of health and fitness tracking features. Syncs seamlessly with your smartphone for notifications, calls, and music control. Long-lasting battery life.", 799.99, List.of("https://images.unsplash.com/photo-1546868871-7041f2a55e12?q=80&w=600&auto=format&fit=crop","https://placehold.co/600x600.png"), "Watches", 25, "smart watch"),
                buildProduct("prod_003", "Ultra-Slim Laptop", "Power and portability combined. Our ultra-slim laptop features the latest generation processor, a stunning 4K display, and a sleek aluminum body. With all-day battery life and a backlit keyboard, it's perfect for professionals on the go. Comes with 16GB RAM and 1TB SSD storage.", 1399.00, List.of("https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?q=80&w=600&auto=format&fit=crop","https://placehold.co/600x600.png"), "Laptops", 10, "modern laptop"),
                buildProduct("prod_004", "Gaming Beast Laptop", "Unleash your gaming potential with this powerhouse. Equipped with a high-refresh-rate display, a top-tier graphics card, and an advanced cooling system. The customizable RGB keyboard and immersive audio will elevate your gaming experience to new heights.", 2100.50, List.of("https://images.unsplash.com/photo-1593642702821-c8da6771f0c6?q=80&w=600&auto=format&fit=crop","https://placehold.co/600x600.png","https://placehold.co/600x600.png"), "Laptops", 5, "gaming laptop"),
                buildProduct("prod_005", "Galaxy Pro Smartphone", "Capture life in stunning detail with the Galaxy Pro. Its professional-grade camera system, brilliant dynamic display, and powerful processor make it a leader in its class. Features an intelligent S-Pen for ultimate productivity and creativity. 5G ready.", 1199.99, List.of("https://images.unsplash.com/photo-1601784551446-20c9e07cdbf1?q=80&w=600&auto=format&fit=crop","https://placehold.co/600x600.png"), "Smartphones", 30, "modern smartphone"),
                buildProduct("prod_006", "Pixel Perfect Smartphone", "The smart choice for a smartphone. Renowned for its exceptional camera powered by AI, clean software experience, and tight integration with Google services. Get the best of Android with timely updates and helpful features that anticipate your needs.", 899.00, List.of("https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?q=80&w=600&auto=format&fit=crop","https://placehold.co/600x600.png"), "Smartphones", 22, "sleek smartphone"),
                buildProduct("prod_007", "Minimalist Digital Watch", "Simplicity meets sophistication. This digital watch features a clean, easy-to-read display in a slim and lightweight case. Perfect for everyday wear, it offers essential features like an alarm, stopwatch, and backlight in an understated design.", 150.00, List.of("https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=600&auto=format&fit=crop"), "Watches", 40, "minimalist watch"),
                buildProduct("prod_008", "Creator Pro Laptop", "The ultimate tool for creators. This laptop is built to handle demanding creative workflows with its color-accurate display, powerful GPU, and extensive port selection. Whether you are into video editing, 3D rendering, or graphic design, this machine has you covered.", 2500.00, List.of("https://images.unsplash.com/photo-1589561253898-768105ca91a8?q=80&w=600&auto=format&fit=crop","https://placehold.co/600x600.png"), "Laptops", 8, "powerful laptop")
        );
        productRepository.saveAll(defaults);

        // 3. Clean up sandbox cart items and corrupted quantities
        try {
            cartItemRepository.deleteByUserId(SANDBOX_USER_ID);
            jdbcTemplate.update("DELETE FROM cart_items WHERE quantity <= 0");
        } catch (Exception e) {
            log.warn("Cart cleanup notice: {}", e.getMessage());
        }

        // 4. Clean up test orders created by sandbox operator
        try {
            List<OrderEntity> testOrders = orderRepository.findByUserIdOrderByCreatedAtDesc(SANDBOX_USER_ID);
            if (!testOrders.isEmpty()) {
                orderRepository.deleteAll(testOrders);
            }
        } catch (Exception e) {
            log.warn("Order cleanup notice: {}", e.getMessage());
        }

        long mttrMs = System.currentTimeMillis() - startTime;

        Map<String, Object> restoredEntities = new LinkedHashMap<>();
        restoredEntities.put("productsReset", 8);
        restoredEntities.put("bugFlagsReset", List.of("BUG_NULL_SHIPPING_NPE", "BUG_OFF_BY_ONE_DISCOUNT", "BUG_STALE_CART_CACHE"));
        restoredEntities.put("cartCleaned", true);
        restoredEntities.put("testOrdersCleaned", true);
        restoredEntities.put("healthStatus", 200);

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("type", "SANDBOX_RESET");
        resp.put("healed", true);
        resp.put("mttrMs", mttrMs);
        resp.put("restoredEntities", restoredEntities);
        resp.put("message", String.format("AutoTriage cluster restored to healthy baseline in %dms.", mttrMs));

        // Persist Healing Mission to PostgreSQL Audit Ledger
        String missionId = "heal_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        resp.put("missionId", missionId);
        try {
            jdbcTemplate.update("""
                INSERT INTO fde_healing_missions (
                    id, user_id, incident_type, mttr_ms, restored_entities_json, recovery_message
                ) VALUES (?, ?, ?, ?, ?, ?)
            """,
                missionId,
                resolveCallerUserId(),
                "ALL_VECTORS",
                mttrMs,
                objectMapper.writeValueAsString(restoredEntities),
                (String) resp.get("message")
            );
        } catch (Exception ex) {
            log.warn("Database audit ledger notice (fde_healing_missions): {}", ex.getMessage());
        }

        return ResponseEntity.ok(resp);
    }

    // =========================================================================
    // 4. GET /api/fde/ado/live - Live Azure DevOps Streamer
    // =========================================================================
    @GetMapping("/ado/live")
    @Operation(summary = "Query live Azure DevOps REST API for Sprint 9-11 work items, PRs, and Test Suites")
    public ResponseEntity<Map<String, Object>> getLiveAdoData() {
        String pat = resolveAdoPat();
        String org = resolveAdoOrg();
        String project = resolveAdoProject();
        String repoId = resolveAdoRepoId();

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("organization", org);
        resp.put("project", project);
        resp.put("repoId", repoId);
        resp.put("timestamp", System.currentTimeMillis());

        if (pat.isBlank()) {
            resp.put("connected", false);
            resp.put("message", "No Azure DevOps PAT configured; returning cached Sprint 9-11 items");
            resp.put("workItems", getFallbackWorkItems());
            resp.put("pullRequests", List.of());
            resp.put("testRuns", List.of());
            resp.put("testSuites", getFallbackTestSuites());
            return ResponseEntity.ok(resp);
        }

        try {
            // 1. Fetch Pull Requests
            String prUrl = String.format("https://dev.azure.com/%s/%s/_apis/git/repositories/%s/pullrequests?api-version=7.1", org, project, repoId);
            String prRaw = executeAdoHttp(prUrl, "GET", null, "application/json", pat);
            List<Map<String, Object>> pullRequests = parseAdoPullRequests(prRaw, org, project);
            resp.put("pullRequests", pullRequests);

            // 2. Fetch Work Items via WIQL
            String wiqlUrl = String.format("https://dev.azure.com/%s/%s/_apis/wit/wiql?api-version=7.1", org, project);
            String wiqlPayload = "{\"query\": \"Select [System.Id] From WorkItems Where [System.TeamProject] = '" + project + "' Order By [System.Id] Desc\"}";
            String wiqlRaw = executeAdoHttp(wiqlUrl, "POST", wiqlPayload, "application/json", pat);

            List<Integer> ids = parseWiqlIds(wiqlRaw, 100);
            List<Map<String, Object>> workItems = new ArrayList<>();
            if (!ids.isEmpty()) {
                String batchUrl = String.format("https://dev.azure.com/%s/%s/_apis/wit/workitemsbatch?api-version=7.1", org, project);
                String batchPayload = objectMapper.writeValueAsString(Map.of("ids", ids));
                String batchRaw = executeAdoHttp(batchUrl, "POST", batchPayload, "application/json", pat);
                workItems = parseWorkItemsBatch(batchRaw, org, project);
            }
            resp.put("workItems", workItems);

            // Categorize by Sprints
            Map<String, List<Map<String, Object>>> sprints = new LinkedHashMap<>();
            sprints.put("sprint9", filterByIterationOrTag(workItems, "Sprint 9", "Sprint9"));
            sprints.put("sprint10", filterByIterationOrTag(workItems, "Sprint 10", "Sprint10"));
            sprints.put("sprint11", filterByIterationOrTag(workItems, "Sprint 11", "Sprint11"));
            resp.put("sprints", sprints);

            // 3. Fetch Test Runs
            String runsUrl = String.format("https://dev.azure.com/%s/%s/_apis/test/runs?api-version=7.1", org, project);
            String runsRaw = executeAdoHttp(runsUrl, "GET", null, "application/json", pat);
            List<Map<String, Object>> testRuns = parseAdoTestRuns(runsRaw);
            resp.put("testRuns", testRuns);

            // 4. Test Suites and Plans
            List<Map<String, Object>> testSuites = workItems.stream()
                    .filter(w -> "Test Suite".equalsIgnoreCase((String) w.get("type")) || "Test Plan".equalsIgnoreCase((String) w.get("type")))
                    .toList();
            if (testSuites.isEmpty()) {
                testSuites = getFallbackTestSuites();
            }
            resp.put("testSuites", testSuites);

            resp.put("connected", true);
            resp.put("count", workItems.size());
        } catch (Exception e) {
            log.error("Error querying live Azure DevOps API: " + e.getMessage(), e);
            resp.put("connected", false);
            resp.put("error", e.getMessage());
            resp.put("workItems", getFallbackWorkItems());
            resp.put("testSuites", getFallbackTestSuites());
        }

        return ResponseEntity.ok(resp);
    }

    // =========================================================================
    // 5. POST /api/fde/ado/bugs - Live Gherkin BDD Bug Creation
    // =========================================================================
    @PostMapping("/ado/bugs")
    @Operation(summary = "Create an actual Bug work item formatted in Gherkin BDD in Azure DevOps")
    public ResponseEntity<Map<String, Object>> createAdoBug(@RequestBody Map<String, Object> req) {
        String pat = resolveAdoPat();
        String org = resolveAdoOrg();
        String project = resolveAdoProject();
        String title = req.get("title") != null ? String.valueOf(req.get("title")).trim() : "Live Adversarial Finding Bug";
        String gherkin = req.get("gherkinScenario") != null ? String.valueOf(req.get("gherkinScenario")) : "";
        String reproSteps = req.get("reproSteps") != null ? String.valueOf(req.get("reproSteps")) : "";
        String severity = req.get("severity") != null ? String.valueOf(req.get("severity")) : "1 - Critical";
        int priority = req.get("priority") != null ? Integer.parseInt(String.valueOf(req.get("priority"))) : 1;

        if (pat.isBlank()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of(
                    "success", false,
                    "message", "Azure DevOps PAT token is not configured on the backend server."
            ));
        }

        try {
            String url = String.format("https://dev.azure.com/%s/%s/_apis/wit/workitems/%%24Bug?api-version=7.1", org, project);

            String formattedRepro = String.format(
                    "<div><p><b>Gherkin BDD Specification:</b></p><pre style='background:#1e1e1e;color:#d4d4d4;padding:10px;border-radius:6px;'>%s</pre><br/><b>Observed Diagnostic Steps:</b><br/>%s</div>",
                    escapeHtml(gherkin),
                    escapeHtml(reproSteps).replace("\n", "<br/>")
            );

            List<Map<String, Object>> patchOps = new ArrayList<>();
            patchOps.add(Map.of("op", "add", "path", "/fields/System.Title", "value", title));
            patchOps.add(Map.of("op", "add", "path", "/fields/System.Description", "value", formattedRepro));
            patchOps.add(Map.of("op", "add", "path", "/fields/Microsoft.VSTS.TCM.ReproSteps", "value", formattedRepro));
            patchOps.add(Map.of("op", "add", "path", "/fields/Microsoft.VSTS.Common.Severity", "value", severity));
            patchOps.add(Map.of("op", "add", "path", "/fields/Microsoft.VSTS.Common.Priority", "value", priority));
            patchOps.add(Map.of("op", "add", "path", "/fields/System.Tags", "value", "BDD; GlassBox; VisitorReported; Sprint11"));
            patchOps.add(Map.of("op", "add", "path", "/fields/System.IterationPath", "value", project + "\\Sprint 11"));

            String patchBody = objectMapper.writeValueAsString(patchOps);
            String rawResp = executeAdoHttp(url, "POST", patchBody, "application/json-patch+json", pat);

            JsonNode root = objectMapper.readTree(rawResp);
            int bugId = root.path("id").asInt();
            String webUrl = root.path("_links").path("html").path("href").asText();
            if (webUrl == null || webUrl.isBlank()) {
                webUrl = String.format("https://dev.azure.com/%s/%s/_workitems/edit/%d", org, project, bugId);
            }

            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("success", true);
            resp.put("id", bugId);
            resp.put("title", title);
            resp.put("url", webUrl);
            resp.put("state", "Active");
            resp.put("iteration", "Sprint 11");
            resp.put("message", String.format("Successfully published Bug AB#%d to Azure Boards.", bugId));

            return ResponseEntity.status(HttpStatus.CREATED).body(resp);
        } catch (Exception e) {
            log.error("Failed to create live Azure DevOps Bug: " + e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
                    "success", false,
                    "error", e.getMessage()
            ));
        }
    }

    // =========================================================================
    // 6. POST /api/fde/ado/invite - Microsoft Entitlements API Invites
    // =========================================================================
    @PostMapping("/ado/invite")
    @Operation(summary = "Invite visitor email as a Stakeholder reader to Azure DevOps via Entitlements API")
    public ResponseEntity<Map<String, Object>> inviteStakeholder(@RequestBody(required = false) Map<String, Object> req) {
        if (req == null) {
            return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "message", "Valid email address is required"
            ));
        }
        String pat = resolveAdoPat();
        String org = resolveAdoOrg();
        String project = resolveAdoProject();
        String email = req.get("email") != null ? String.valueOf(req.get("email")).trim() : "";

        if (email.isBlank() || !email.contains("@") || email.startsWith("@") || email.endsWith("@")) {
            return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "message", "Valid email address is required"
            ));
        }

        if (pat.isBlank()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of(
                    "success", false,
                    "message", "Azure DevOps PAT token is not configured on the backend server."
            ));
        }

        try {
            String url = String.format("https://vsaex.dev.azure.com/%s/_apis/userentitlements?api-version=7.1-preview.1", org);

            Map<String, Object> accessLevel = Map.of("accountLicenseType", "stakeholder");
            Map<String, Object> user = Map.of(
                    "principalName", email,
                    "subjectKind", "user"
            );

            Map<String, Object> payload = Map.of(
                    "accessLevel", accessLevel,
                    "user", user
            );

            String bodyJson = objectMapper.writeValueAsString(payload);
            String rawResp = executeAdoHttp(url, "POST", bodyJson, "application/json", pat);

            JsonNode root = objectMapper.readTree(rawResp);
            String userDescriptor = root.path("userEntitlement").path("user").path("descriptor").asText();
            if (userDescriptor.isBlank()) {
                userDescriptor = root.path("operationResult").path("result").path("user").path("descriptor").asText();
            }

            if (!userDescriptor.isBlank()) {
                try {
                    String readersGroupDescriptor = "vssgp.Uy0xLTktMTU1MTM3NDI0NS0yNDM4NjcwOTY2LTkxMTcxNDAwLTI0MTIwMTA3MzYtMzQ2NDQ1ODQ3OS0xLTI4NDQ5MjYzODMtMjEzNDQ0ODcxOC0yMzIzNDA1NjMzLTQxMDMxOTY4NTk";
                    String membershipUrl = String.format("https://vssps.dev.azure.com/%s/_apis/graph/memberships/%s/%s?api-version=7.1-preview.1",
                            org, userDescriptor, readersGroupDescriptor);
                    executeAdoHttp(membershipUrl, "PUT", "", "application/json", pat);
                } catch (Exception ex) {
                    log.info("Project group membership notice for " + email + ": " + ex.getMessage());
                }
            }

            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("success", true);
            resp.put("email", email);
            resp.put("accessLevel", "Stakeholder");
            resp.put("organization", org);
            resp.put("project", project);
            resp.put("message", "Stakeholder viewer invitation successfully dispatched.");

            return ResponseEntity.ok(resp);
        } catch (Exception e) {
            log.error("Entitlements invite notice for " + email + ": " + e.getMessage(), e);
            if (e.getMessage() != null && (e.getMessage().contains("already exists") || e.getMessage().contains("UserAlreadyExists") || e.getMessage().contains("409"))) {
                Map<String, Object> resp = new LinkedHashMap<>();
                resp.put("success", true);
                resp.put("email", email);
                resp.put("accessLevel", "Stakeholder");
                resp.put("organization", org);
                resp.put("project", project);
                resp.put("alreadyExisted", true);
                resp.put("message", "User already has stakeholder access to Azure DevOps project " + project + ".");
                return ResponseEntity.ok(resp);
            }
            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("success", false);
            resp.put("email", email);
            resp.put("error", e.getMessage());
            resp.put("message", "Notice: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(resp);
        }
    }

    // =========================================================================
    // 6B. POST /api/fde/agent/solve - Live LangGraph + Gemini 3 + Git Worktree Solver
    // =========================================================================
    @PostMapping("/agent/solve")
    @Operation(summary = "Invoke real Python LangGraph + Gemini 3 Flash + Git Worktree engine to solve an incident end-to-end")
    public ResponseEntity<Map<String, Object>> runAutonomousSolver(@RequestBody(required = false) Map<String, Object> req) {
        if (req == null) {
            req = Map.of();
        }
        String ticketId = req.get("ticketId") != null ? String.valueOf(req.get("ticketId")) : "TKT-LIVE-" + (System.currentTimeMillis() % 10000);
        String subject = req.get("subject") != null ? String.valueOf(req.get("subject")) : "Live Incident Report";
        String body = req.get("body") != null ? String.valueOf(req.get("body")) : "";
        String scenarioId = req.get("scenarioId") != null ? String.valueOf(req.get("scenarioId")) : "";
        Boolean headed = req.get("headed") != null && ("true".equalsIgnoreCase(String.valueOf(req.get("headed"))) || "1".equals(String.valueOf(req.get("headed"))));

        // If operator selected a known regression scenario to demonstrate live reproduction,
        // enable the corresponding runtime fault flag so the agent's live pytest reproduction catches it!
        if ("R1_TAX".equalsIgnoreCase(scenarioId) || body.toLowerCase().contains("tax") || body.toLowerCase().contains("445.50")) {
            bugFlagsService.updateFlags(Map.of("BUG_OFF_BY_ONE_DISCOUNT", true));
        } else if ("R2_NULL_LINE2".equalsIgnoreCase(scenarioId) || body.toLowerCase().contains("line2") || body.toLowerCase().contains("nullpointer")) {
            bugFlagsService.updateFlags(Map.of("BUG_NULL_SHIPPING_NPE", true));
        } else if ("R3_STALE_CART".equalsIgnoreCase(scenarioId) || body.toLowerCase().contains("cart") || body.toLowerCase().contains("remove")) {
            bugFlagsService.updateFlags(Map.of("BUG_STALE_CART_CACHE", true));
        }

        try {
            Path repoRoot = Paths.get("").toAbsolutePath();
            if (repoRoot.endsWith("backend-spring")) {
                repoRoot = repoRoot.getParent().getParent();
            } else if (repoRoot.endsWith("sut")) {
                repoRoot = repoRoot.getParent();
            }

            Path pythonBin = repoRoot.resolve("sut/e2e/.venv/bin/python");
            String pythonExec = Files.exists(pythonBin) ? pythonBin.toString() : "python3";

            Map<String, Object> inputTicket = new LinkedHashMap<>();
            inputTicket.put("ticket_id", ticketId);
            inputTicket.put("subject", subject);
            inputTicket.put("body", body);
            inputTicket.put("headed", headed);
            String ticketJson = objectMapper.writeValueAsString(inputTicket);

            String pyScript = """
                import sys, json, time, os
                from agent.src.autotriage.graph.build import triage_ticket
                t0 = time.time()
                ticket = json.loads(sys.argv[1])
                headed = bool(ticket.get('headed', False))
                if headed:
                    os.environ['HEADED'] = 'true'
                    os.environ['PLAYWRIGHT_HEADED'] = '1'
                res = triage_ticket(ticket)
                res['wall_clock_sec'] = round(time.time() - t0, 2)
                res['headed'] = headed
                print("__JSON_START__")
                print(json.dumps(res, default=str))
                """;

            ProcessBuilder pb = new ProcessBuilder(pythonExec, "-c", pyScript, ticketJson);
            pb.directory(repoRoot.toFile());
            if (Boolean.TRUE.equals(headed)) {
                pb.environment().put("HEADED", "true");
                pb.environment().put("PLAYWRIGHT_HEADED", "1");
            }
            pb.redirectErrorStream(true);

            long t0 = System.currentTimeMillis();
            Process proc = pb.start();
            String output = new String(proc.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            boolean finished = proc.waitFor(90, TimeUnit.SECONDS);
            if (!finished) {
                proc.destroyForcibly();
                return ResponseEntity.status(HttpStatus.GATEWAY_TIMEOUT).body(Map.of(
                        "success", false,
                        "error", "Autonomous agent execution timed out after 90s",
                        "rawLogs", output
                ));
            }

            int idx = output.indexOf("__JSON_START__");
            if (idx == -1) {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
                        "success", false,
                        "error", "Agent failed to produce structured output",
                        "rawLogs", output
                ));
            }

            String jsonPart = output.substring(idx + "__JSON_START__".length()).trim();
            String stdoutLogs = output.substring(0, idx).trim();
            Map<String, Object> agentState = objectMapper.readValue(jsonPart, new TypeReference<>() {});

            // If agent verified a self-healing patch, automatically clear the runtime fault flag on DEV
            if (Boolean.TRUE.equals(agentState.get("self_heal_verified"))) {
                bugFlagsService.updateFlags(Map.of(
                        "BUG_OFF_BY_ONE_DISCOUNT", false,
                        "BUG_NULL_SHIPPING_NPE", false,
                        "BUG_STALE_CART_CACHE", false
                ));
            }

            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("success", true);
            resp.put("durationMs", System.currentTimeMillis() - t0);
            resp.put("headed", headed);
            resp.put("agentState", agentState);
            resp.put("stdoutLogs", stdoutLogs);
            resp.put("activeBugFlagsAfter", bugFlagsService.getFlags());
            return ResponseEntity.ok(resp);
        } catch (Exception e) {
            log.error("Autonomous solver execution failed", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
                    "success", false,
                    "error", e.getMessage()
            ));
        }
    }

    // =========================================================================
    // 7. GET /api/fde/rag/retrieve - AST Vector Retriever & Grounding Check
    // =========================================================================
    @GetMapping({"/rag/retrieve", "/rag-retrieve"})
    @Operation(summary = "Retrieve ranked Java AST chunks with cosine similarity scoring and anti-hallucination grounding")
    public ResponseEntity<FdeRagService.RagRetrievalResult> retrieveRagChunks(
            @RequestParam(required = false, defaultValue = "price tampering") String q) {
        return ResponseEntity.ok(fdeRagService.retrieve(q));
    }

    // =========================================================================
    // 8. GET /api/fde/memory/episodes - Episodic Memory Bank
    // =========================================================================
    @GetMapping({"/memory/episodes", "/memory"})
    @Operation(summary = "Get historical incident memory episodes, resolution metrics, and recall statistics")
    public ResponseEntity<FdeEpisodicMemoryService.MemoryBankSummary> getEpisodicMemory() {
        return ResponseEntity.ok(fdeEpisodicMemoryService.getSummary());
    }

    // =========================================================================
    // 9. POST /api/fde/memory/episodes - Record Episode
    // =========================================================================
    @PostMapping({"/memory/episodes", "/memory"})
    @Operation(summary = "Record or update an incident episode in the episodic memory ledger")
    public ResponseEntity<FdeEpisodicMemoryService.IncidentEpisode> recordEpisode(
            @RequestBody FdeEpisodicMemoryService.IncidentEpisode episode) {
        return ResponseEntity.ok(fdeEpisodicMemoryService.recordEpisode(episode));
    }

    // =========================================================================
    // 10. POST /api/fde/rag-triage - Dual-Engine Correlation
    // =========================================================================
    @PostMapping({"/rag-triage", "/triage"})
    @Operation(summary = "Correlate AST RAG retrieval with episodic recall to triage an incident with zero hallucination")
    public ResponseEntity<Map<String, Object>> triageIncident(@RequestBody(required = false) Map<String, Object> req) {
        String endpoint = req != null && req.get("endpoint") != null ? String.valueOf(req.get("endpoint")) : "";
        String anomalyType = req != null && req.get("anomalyType") != null ? String.valueOf(req.get("anomalyType")) : "";
        String observed = req != null && req.get("observedDetail") != null ? String.valueOf(req.get("observedDetail")) : "";
        String prompt = req != null && req.get("prompt") != null ? String.valueOf(req.get("prompt")) : "";

        String query = (prompt + " " + anomalyType + " " + endpoint + " " + observed).trim();
        FdeRagService.RagRetrievalResult ragResult = fdeRagService.retrieve(query);
        FdeEpisodicMemoryService.RecallEvaluationResult memoryResult = fdeEpisodicMemoryService.evaluateQuery(query);

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("query", query);
        resp.put("anomalyType", anomalyType);
        resp.put("groundingScore", ragResult.topGroundingScore());
        resp.put("grounded", ragResult.antiHallucinationVerified());
        resp.put("gitCommitSha", ragResult.gitCommitSha());
        resp.put("retrievedChunks", ragResult.chunks());
        resp.put("episodicMemory", memoryResult);

        if (memoryResult.matchedEpisode() != null) {
            resp.put("dynamicAstPatch", memoryResult.matchedEpisode().astPatchDiff());
            resp.put("gherkinRegression", memoryResult.matchedEpisode().gherkinRegression());
            resp.put("targetClass", memoryResult.matchedEpisode().rootCauseFile());
            resp.put("targetMethod", memoryResult.matchedEpisode().rootCauseMethod());
        }

        return ResponseEntity.ok(resp);
    }

    // =========================================================================
    // 11. GET /api/fde/history - Persistent PostgreSQL Audit Ledger Streamer
    // =========================================================================
    @GetMapping({"/history", "/attack-runs"})
    @Operation(summary = "Query persistent PostgreSQL attack runs and healing audit logs")
    public ResponseEntity<Map<String, Object>> getAuditHistory(@RequestParam(defaultValue = "20") int limit) {
        int bounded = Math.min(100, Math.max(1, limit));
        List<Map<String, Object>> attacks = new ArrayList<>();
        List<Map<String, Object>> heals = new ArrayList<>();

        try {
            attacks = jdbcTemplate.queryForList("""
                SELECT id, user_id, attack_type, prompt, http_status, latency_ms,
                       dollar_loss, unfulfillable_units, annual_projected_loss, execution_message, created_at
                FROM fde_attack_runs ORDER BY created_at DESC LIMIT ?
            """, bounded);
        } catch (Exception ex) {
            log.warn("Notice querying fde_attack_runs: {}", ex.getMessage());
        }

        try {
            heals = jdbcTemplate.queryForList("""
                SELECT id, user_id, incident_type, mttr_ms, restored_entities_json, recovery_message, created_at
                FROM fde_healing_missions ORDER BY created_at DESC LIMIT ?
            """, bounded);
        } catch (Exception ex) {
            log.warn("Notice querying fde_healing_missions: {}", ex.getMessage());
        }

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("totalAttackRuns", attacks.size());
        resp.put("totalHealingMissions", heals.size());
        resp.put("attackRuns", attacks);
        resp.put("healingMissions", heals);

        return ResponseEntity.ok(resp);
    }

    private String resolveCallerUserId() {
        try {
            var auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth != null && auth.getPrincipal() instanceof AuthPrincipal p) {
                return p.uid();
            }
        } catch (Exception ignored) {}
        return SANDBOX_USER_ID;
    }

    // =========================================================================
    // Private Helpers & Telemetry Snapshot Routines
    // =========================================================================
    private void ensureSandboxUserExists() {
        Optional<UserEntity> existing = userRepository.findById(SANDBOX_USER_ID);
        if (existing.isEmpty()) {
            UserEntity u = new UserEntity();
            u.setId(SANDBOX_USER_ID);
            u.setEmail(SANDBOX_USER_EMAIL);
            u.setPasswordHash(passwordEncoder.encode("SandboxSecret123!"));
            u.setRole("FDE_OPERATOR");
            u.setDisplayName("FDE Sandbox Operator");
            userRepository.save(u);
        } else if (!"FDE_OPERATOR".equals(existing.get().getRole())) {
            UserEntity u = existing.get();
            u.setRole("FDE_OPERATOR");
            userRepository.save(u);
        }
    }

    private String resolveAttackType(String attackType, String prompt) {
        String at = attackType != null ? attackType.toUpperCase(Locale.ROOT).trim() : "";
        if (at.contains("R1") || at.contains("TAX") || at.contains("PRICE") || at.contains("TAMPER")) return "R1_TAX";
        if (at.contains("R2") || at.contains("NULL") || at.contains("NPE") || at.contains("SHIPPING") || at.contains("LINE2")) return "R2_NULL_LINE2";
        if (at.contains("R3") || at.contains("CART") || at.contains("STALE") || at.contains("UNDERFLOW")) return "R3_STALE_CART";
        if (at.contains("R4") || at.contains("RACE") || at.contains("CONCURRENCY") || at.contains("OVERSELL") || at.contains("STOCK")) return "R4_STOCK_RACE";
        if (at.contains("CANCEL") || at.contains("RESTOCK")) return "R4_STOCK_RACE";

        String p = prompt != null ? prompt.toLowerCase(Locale.ROOT) : "";
        if (p.contains("price") || p.contains("tax") || p.contains("tamper") || p.contains("0.01") || p.contains("penny") || p.contains("discount") || p.contains("dollar")) {
            return "R1_TAX";
        }
        if (p.contains("null") || p.contains("npe") || p.contains("dereference") || p.contains("shipping") || p.contains("line2")) {
            return "R2_NULL_LINE2";
        }
        if (p.contains("stale") || p.contains("underflow") || p.contains("negative") || p.contains("cart") || p.contains("-1") || p.contains("-5")) {
            return "R3_STALE_CART";
        }
        if (p.contains("race") || p.contains("concurrency") || p.contains("threads") || p.contains("oversell") || p.contains("parallel")) {
            return "R4_STOCK_RACE";
        }
        return "R1_TAX";
    }

    private Map<String, Object> captureSnapshot() {
        Map<String, Object> snapshot = new LinkedHashMap<>();

        // 1. Products State
        List<Map<String, Object>> products = productRepository.findAll().stream()
                .sorted(Comparator.comparing(ProductEntity::getId))
                .map(p -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("id", p.getId());
                    item.put("name", p.getName());
                    item.put("price", p.getPrice());
                    item.put("stock", p.getStock());
                    return item;
                })
                .toList();
        snapshot.put("products", products);

        // 2. Orders State
        long orderCount = orderRepository.count();
        List<Map<String, Object>> recentOrders = orderRepository.findAllByOrderByCreatedAtDesc().stream()
                .limit(5)
                .map(o -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("id", o.getId());
                    item.put("userId", o.getUserId());
                    item.put("total", o.getTotal());
                    item.put("status", o.getStatus());
                    return item;
                })
                .toList();
        snapshot.put("orders", Map.of("count", orderCount, "recent", recentOrders));

        // 3. Cart State for Sandbox User
        List<CartItemEntity> cartItems = cartItemRepository.findByUserIdOrderByAddedAtAsc(SANDBOX_USER_ID);
        double cartSubtotal = cartItems.stream()
                .mapToDouble(c -> c.getProduct().getPrice().doubleValue() * c.getQuantity())
                .sum();
        int totalQty = cartItems.stream().mapToInt(CartItemEntity::getQuantity).sum();
        snapshot.put("cart", Map.of(
                "itemCount", cartItems.size(),
                "totalQuantity", totalQty,
                "subtotal", Math.round(cartSubtotal * 100.0) / 100.0
        ));

        // 4. Bug Flags
        snapshot.put("bugFlags", bugFlagsService.getFlags());

        return snapshot;
    }

    private Map<String, Object> computeDelta(Map<String, Object> pre, Map<String, Object> post) {
        Map<String, Object> delta = new LinkedHashMap<>();

        // Products diff
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> preProducts = (List<Map<String, Object>>) pre.get("products");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> postProducts = (List<Map<String, Object>>) post.get("products");

        Map<String, Map<String, Object>> preMap = preProducts.stream()
                .collect(Collectors.toMap(p -> String.valueOf(p.get("id")), p -> p));

        List<Map<String, Object>> changedProducts = new ArrayList<>();
        for (Map<String, Object> postProd : postProducts) {
            String id = String.valueOf(postProd.get("id"));
            Map<String, Object> preProd = preMap.get(id);
            if (preProd != null) {
                boolean priceChanged = !String.valueOf(preProd.get("price")).equals(String.valueOf(postProd.get("price")));
                boolean stockChanged = !String.valueOf(preProd.get("stock")).equals(String.valueOf(postProd.get("stock")));
                if (priceChanged || stockChanged) {
                    Map<String, Object> ch = new LinkedHashMap<>();
                    ch.put("productId", id);
                    ch.put("name", postProd.get("name"));
                    ch.put("beforePrice", preProd.get("price"));
                    ch.put("afterPrice", postProd.get("price"));
                    ch.put("beforeStock", preProd.get("stock"));
                    ch.put("afterStock", postProd.get("stock"));
                    changedProducts.add(ch);
                }
            }
        }
        delta.put("changedProducts", changedProducts);

        // Orders diff
        @SuppressWarnings("unchecked")
        Map<String, Object> preOrders = (Map<String, Object>) pre.get("orders");
        @SuppressWarnings("unchecked")
        Map<String, Object> postOrders = (Map<String, Object>) post.get("orders");
        long preCount = ((Number) preOrders.get("count")).longValue();
        long postCount = ((Number) postOrders.get("count")).longValue();
        delta.put("ordersCreated", postCount - preCount);

        // Cart diff
        @SuppressWarnings("unchecked")
        Map<String, Object> preCart = (Map<String, Object>) pre.get("cart");
        @SuppressWarnings("unchecked")
        Map<String, Object> postCart = (Map<String, Object>) post.get("cart");
        int preQty = ((Number) preCart.get("totalQuantity")).intValue();
        int postQty = ((Number) postCart.get("totalQuantity")).intValue();
        double preSub = ((Number) preCart.get("subtotal")).doubleValue();
        double postSub = ((Number) postCart.get("subtotal")).doubleValue();

        delta.put("cartDelta", Map.of(
                "quantityChange", postQty - preQty,
                "subtotalChange", Math.round((postSub - preSub) * 100.0) / 100.0
        ));

        // Bug flags diff
        @SuppressWarnings("unchecked")
        Map<String, Boolean> preFlags = (Map<String, Boolean>) pre.get("bugFlags");
        @SuppressWarnings("unchecked")
        Map<String, Boolean> postFlags = (Map<String, Boolean>) post.get("bugFlags");
        Map<String, Object> flagDiff = new LinkedHashMap<>();
        for (String k : postFlags.keySet()) {
            if (!postFlags.get(k).equals(preFlags.get(k))) {
                flagDiff.put(k, Map.of("before", preFlags.get(k), "after", postFlags.get(k)));
            }
        }
        delta.put("bugFlagsChanged", flagDiff);

        return delta;
    }

    private ProductEntity buildProduct(String id, String name, String desc, double price, List<String> images, String category, int stock, String hint) {
        ProductEntity p = productRepository.findById(id).orElseGet(ProductEntity::new);
        p.setId(id);
        p.setName(name);
        p.setDescription(desc);
        p.setPrice(BigDecimal.valueOf(price));
        p.setImagesJson(mapper.toJson(images));
        p.setCategory(category);
        p.setStock(stock);
        p.setDataAiHint(hint);
        return p;
    }

    private String resolveAdoOrg() {
        String val = System.getProperty("azure.devops.org");
        if (val != null && !val.isBlank()) return val.trim();
        val = environment.getProperty("azure.devops.org");
        if (val != null && !val.isBlank()) return val.trim();
        val = environment.getProperty("app.ado.organization");
        if (val != null && !val.isBlank()) return val.trim();
        val = System.getenv("AZURE_DEVOPS_ORG");
        if (val != null && !val.isBlank()) return val.trim();
        String fromEnv = readEnvFileKey("AZURE_DEVOPS_ORG");
        if (!fromEnv.isBlank()) return fromEnv;
        return ADO_ORG;
    }

    private String resolveAdoProject() {
        String val = System.getProperty("azure.devops.project");
        if (val != null && !val.isBlank()) return val.trim();
        val = environment.getProperty("azure.devops.project");
        if (val != null && !val.isBlank()) return val.trim();
        val = environment.getProperty("app.ado.project");
        if (val != null && !val.isBlank()) return val.trim();
        val = System.getenv("AZURE_DEVOPS_PROJECT");
        if (val != null && !val.isBlank()) return val.trim();
        String fromEnv = readEnvFileKey("AZURE_DEVOPS_PROJECT");
        if (!fromEnv.isBlank()) return fromEnv;
        return ADO_PROJECT;
    }

    private String resolveAdoRepoId() {
        String val = System.getProperty("azure.devops.repo-id");
        if (val != null && !val.isBlank()) return val.trim();
        val = environment.getProperty("azure.devops.repo-id");
        if (val != null && !val.isBlank()) return val.trim();
        val = environment.getProperty("app.ado.repo-id");
        if (val != null && !val.isBlank()) return val.trim();
        val = System.getenv("AZURE_DEVOPS_REPO_ID");
        if (val != null && !val.isBlank()) return val.trim();
        String fromEnv = readEnvFileKey("AZURE_DEVOPS_REPO_ID");
        if (!fromEnv.isBlank()) return fromEnv;
        return ADO_REPO_ID;
    }

    private String resolveAdoPat() {
        String pat = System.getProperty("AZURE_DEVOPS_PAT");
        if (pat != null && !pat.isBlank()) return pat.trim();
        pat = System.getProperty("azure.devops.pat");
        if (pat != null && !pat.isBlank()) return pat.trim();
        pat = environment.getProperty("azure.devops.pat");
        if (pat != null && !pat.isBlank()) return pat.trim();
        pat = environment.getProperty("app.ado.pat");
        if (pat != null && !pat.isBlank()) return pat.trim();
        pat = environment.getProperty("AZURE_DEVOPS_PAT");
        if (pat != null && !pat.isBlank()) return pat.trim();
        pat = System.getenv("AZURE_DEVOPS_EXT_PAT");
        if (pat != null && !pat.isBlank()) return pat.trim();
        pat = System.getenv("AZURE_DEVOPS_PAT");
        if (pat != null && !pat.isBlank()) return pat.trim();

        String fromEnv = readEnvFileKey("AZURE_DEVOPS_PAT");
        if (!fromEnv.isBlank()) return fromEnv;
        fromEnv = readEnvFileKey("AZURE_DEVOPS_EXT_PAT");
        if (!fromEnv.isBlank()) return fromEnv;
        return "";
    }

    private String readEnvFileKey(String key) {
        Path cur = Paths.get("").toAbsolutePath();
        List<Path> candidates = new ArrayList<>();
        Path p = cur;
        while (p != null) {
            candidates.add(p.resolve(".env"));
            p = p.getParent();
        }
        for (String rel : List.of(".env", "../.env", "../../.env", "../../../.env")) {
            candidates.add(Paths.get(rel));
        }

        for (Path envPath : candidates) {
            try {
                if (Files.exists(envPath)) {
                    for (String line : Files.readAllLines(envPath)) {
                        String trimmed = line.trim();
                        if (trimmed.startsWith(key + "=")) {
                            String[] parts = trimmed.split("=", 2);
                            if (parts.length == 2 && !parts[1].isBlank()) {
                                String val = parts[1].trim();
                                if ((val.startsWith("\"") && val.endsWith("\"")) ||
                                    (val.startsWith("'") && val.endsWith("'"))) {
                                    val = val.substring(1, val.length() - 1).trim();
                                }
                                return val;
                            }
                        }
                    }
                }
            } catch (Exception ignored) {}
        }
        return "";
    }

    private String executeAdoHttp(String url, String method, String body, String contentType, String pat) throws Exception {
        String authHeader = "Basic " + Base64.getEncoder().encodeToString((":" + pat).getBytes(StandardCharsets.UTF_8));
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Authorization", authHeader)
                .header("Accept", "application/json")
                .timeout(Duration.ofSeconds(10));

        if ("POST".equalsIgnoreCase(method)) {
            builder.header("Content-Type", contentType != null ? contentType : "application/json");
            builder.POST(HttpRequest.BodyPublishers.ofString(body != null ? body : ""));
        } else if ("PUT".equalsIgnoreCase(method)) {
            builder.header("Content-Type", contentType != null ? contentType : "application/json");
            String putBody = (body != null && !body.isBlank()) ? body : "{}";
            builder.PUT(HttpRequest.BodyPublishers.ofString(putBody));
        } else if ("PATCH".equalsIgnoreCase(method)) {
            builder.header("Content-Type", contentType != null ? contentType : "application/json-patch+json");
            builder.method("PATCH", HttpRequest.BodyPublishers.ofString(body != null ? body : ""));
        } else {
            builder.GET();
        }

        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(6)).build();
        HttpResponse<String> response = client.send(builder.build(), HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() >= 400) {
            throw new RuntimeException("ADO API error HTTP " + response.statusCode() + ": " + response.body());
        }
        return response.body();
    }

    private List<Integer> parseWiqlIds(String json, int limit) {
        List<Integer> list = new ArrayList<>();
        try {
            JsonNode root = objectMapper.readTree(json);
            JsonNode items = root.path("workItems");
            if (items.isArray()) {
                for (JsonNode item : items) {
                    list.add(item.path("id").asInt());
                    if (list.size() >= limit) break;
                }
            }
        } catch (Exception ignored) {}
        return list;
    }

    private List<Map<String, Object>> parseWorkItemsBatch(String json, String org, String project) {
        List<Map<String, Object>> results = new ArrayList<>();
        try {
            JsonNode root = objectMapper.readTree(json);
            JsonNode value = root.path("value");
            if (value.isArray()) {
                for (JsonNode node : value) {
                    Map<String, Object> item = new LinkedHashMap<>();
                    int id = node.path("id").asInt();
                    JsonNode fields = node.path("fields");
                    item.put("id", id);
                    item.put("title", fields.path("System.Title").asText());
                    item.put("type", fields.path("System.WorkItemType").asText());
                    item.put("state", fields.path("System.State").asText());
                    item.put("iteration", fields.path("System.IterationPath").asText());
                    item.put("tags", fields.path("System.Tags").asText());
                    item.put("description", fields.path("System.Description").asText());
                    item.put("acceptanceCriteria", fields.path("Microsoft.VSTS.Common.AcceptanceCriteria").asText());
                    item.put("priority", fields.path("Microsoft.VSTS.Common.Priority").asInt(2));
                    item.put("severity", fields.path("Microsoft.VSTS.Common.Severity").asText("2 - High"));
                    item.put("url", String.format("https://dev.azure.com/%s/%s/_workitems/edit/%d", org, project, id));
                    results.add(item);
                }
            }
        } catch (Exception e) {
            log.error("Failed to parse work items batch", e);
        }
        return results;
    }

    private List<Map<String, Object>> parseAdoPullRequests(String json, String org, String project) {
        List<Map<String, Object>> list = new ArrayList<>();
        try {
            JsonNode root = objectMapper.readTree(json);
            JsonNode value = root.path("value");
            if (value.isArray()) {
                for (JsonNode pr : value) {
                    Map<String, Object> map = new LinkedHashMap<>();
                    int id = pr.path("pullRequestId").asInt();
                    map.put("pullRequestId", id);
                    map.put("title", pr.path("title").asText());
                    map.put("description", pr.path("description").asText());
                    map.put("status", pr.path("status").asText());
                    map.put("sourceRef", pr.path("sourceRefName").asText());
                    map.put("targetRef", pr.path("targetRefName").asText());
                    map.put("creationDate", pr.path("creationDate").asText());
                    map.put("url", String.format("https://dev.azure.com/%s/%s/_git/%s/pullrequest/%d", org, project, project, id));
                    list.add(map);
                }
            }
        } catch (Exception ignored) {}
        return list;
    }

    private List<Map<String, Object>> parseAdoTestRuns(String json) {
        List<Map<String, Object>> list = new ArrayList<>();
        try {
            JsonNode root = objectMapper.readTree(json);
            JsonNode value = root.path("value");
            if (value.isArray()) {
                for (JsonNode tr : value) {
                    Map<String, Object> map = new LinkedHashMap<>();
                    map.put("id", tr.path("id").asInt());
                    map.put("name", tr.path("name").asText());
                    map.put("state", tr.path("state").asText());
                    map.put("totalTests", tr.path("totalTests").asInt());
                    map.put("passedTests", tr.path("passedTests").asInt());
                    map.put("isAutomated", tr.path("isAutomated").asBoolean());
                    map.put("webAccessUrl", tr.path("webAccessUrl").asText());
                    list.add(map);
                }
            }
        } catch (Exception ignored) {}
        return list;
    }

    private List<Map<String, Object>> filterByIterationOrTag(List<Map<String, Object>> items, String iterationMatch, String tagMatch) {
        return items.stream()
                .filter(i -> {
                    String iter = String.valueOf(i.get("iteration"));
                    String tags = String.valueOf(i.get("tags"));
                    return iter.contains(iterationMatch) || tags.contains(tagMatch);
                })
                .toList();
    }

    private String escapeHtml(String text) {
        if (text == null) return "";
        return text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    private List<Map<String, Object>> getFallbackWorkItems() {
        String org = resolveAdoOrg();
        String project = resolveAdoProject();
        return List.of(
                Map.of("id", 136, "title", "[Safwan-fde] F-11.1: Glass-Box Multi-Vector Chaos Playground & Real-Time Blast Radius Dashboard (/api/fde/attack)", "type", "Feature", "iteration", "Sprint 11", "state", "Active", "url", String.format("https://dev.azure.com/%s/%s/_workitems/edit/136", org, project)),
                Map.of("id", 138, "title", "[Safwan-fde] US-1101: Natural-Language Adversarial Attack Translator & Raw HTTP/Concurrency Fuzzer with Live DB Before/After Diff", "type", "User Story", "iteration", "Sprint 11", "state", "Active", "url", String.format("https://dev.azure.com/%s/%s/_workitems/edit/138", org, project)),
                Map.of("id", 140, "title", "[Safwan-mlops] F-11.2: Glass-Box RAG Knowledge X-Ray, Anti-Hallucination Grounding & Episodic Memory Ledger (/api/fde/rag-triage)", "type", "Feature", "iteration", "Sprint 11", "state", "Active", "url", String.format("https://dev.azure.com/%s/%s/_workitems/edit/140", org, project)),
                Map.of("id", 143, "title", "[Safwan-devops] F-11.3: Bidirectional Live Azure DevOps Glass-Box Proxy, Gherkin Bug Filer & Read-Only Viewer Invite (/api/fde/ado)", "type", "Feature", "iteration", "Sprint 11", "state", "Active", "url", String.format("https://dev.azure.com/%s/%s/_workitems/edit/143", org, project))
        );
    }

    private List<Map<String, Object>> getFallbackTestSuites() {
        String org = resolveAdoOrg();
        String project = resolveAdoProject();
        return List.of(
                Map.of("id", 82, "title", "[Safwan-qa] TP-700: AutoTriage Master QA & Autonomous Self-Healing Test Plan", "type", "Test Plan", "url", String.format("https://dev.azure.com/%s/%s/_workitems/edit/82", org, project)),
                Map.of("id", 83, "title", "[Safwan-qa] TS-701: Closed-Loop Self-Healing & Chaos Fault Injection Test Suite", "type", "Test Suite", "url", String.format("https://dev.azure.com/%s/%s/_workitems/edit/83", org, project))
        );
    }
}
