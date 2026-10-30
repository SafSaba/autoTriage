package com.autotriage.shop;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Map;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class FdeAgenticControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    @Order(1)
    void postSessionGeneratesOperatorSandboxToken() throws Exception {
        MvcResult res = mockMvc.perform(post("/api/fde/session")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token", notNullValue()))
                .andExpect(jsonPath("$.user.id", is("usr_sandbox_operator")))
                .andExpect(jsonPath("$.user.email", is("fde-sandbox-operator@autotriage.local")))
                .andExpect(jsonPath("$.user.role", is("ADMIN")))
                .andExpect(jsonPath("$.sandboxMode", is(true)))
                .andReturn();

        String token = objectMapper.readTree(res.getResponse().getContentAsString()).get("token").asText();
        assertTrue(token.length() > 20);
    }

    @Test
    @Order(2)
    void postAttackPriceInjectionModifiesPriceAndRecordsBlastRadius() throws Exception {
        Map<String, Object> payload = Map.of(
                "attackType", "PRICE_INJECTION",
                "prompt", "Buy Creator Pro Laptop for $0.01",
                "productId", "prod_008"
        );

        mockMvc.perform(post("/api/fde/attack")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attackType", is("PRICE_INJECTION")))
                .andExpect(jsonPath("$.httpStatus", is(200)))
                .andExpect(jsonPath("$.latencyMs", greaterThanOrEqualTo(0)))
                .andExpect(jsonPath("$.preState", notNullValue()))
                .andExpect(jsonPath("$.postState", notNullValue()))
                .andExpect(jsonPath("$.delta", notNullValue()))
                .andExpect(jsonPath("$.financialBlastRadius.dollarLoss", is(2499.99)))
                .andExpect(jsonPath("$.financialBlastRadius.annualProjectedLoss", is(912496.35)));
    }

    @Test
    @Order(3)
    void postAttackCartUnderflowSetsNegativeQuantity() throws Exception {
        Map<String, Object> payload = Map.of(
                "prompt", "Inject negative quantity -5 into cart"
        );

        mockMvc.perform(post("/api/fde/attack")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attackType", is("CART_UNDERFLOW")))
                .andExpect(jsonPath("$.financialBlastRadius.dollarLoss", is(2250.0)))
                .andExpect(jsonPath("$.financialBlastRadius.unfulfillableUnits", is(5)));
    }

    @Test
    @Order(4)
    void postAttackConcurrencyOversellSimulatesParallelLoad() throws Exception {
        Map<String, Object> payload = Map.of(
                "prompt", "High concurrency oversell race on remaining watches",
                "concurrency", 4
        );

        mockMvc.perform(post("/api/fde/execute-attack")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attackType", is("CONCURRENCY_OVERSELL")))
                .andExpect(jsonPath("$.financialBlastRadius.unfulfillableUnits", greaterThanOrEqualTo(1)));
    }

    @Test
    @Order(5)
    void postAttackNullShippingNpeTriggers500() throws Exception {
        Map<String, Object> payload = Map.of(
                "attackType", "NULL_SHIPPING_NPE",
                "prompt", "Checkout order with null addressLine2 to trigger NPE"
        );

        mockMvc.perform(post("/api/fde/attack")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.attackType", is("NULL_SHIPPING_NPE")))
                .andExpect(jsonPath("$.httpStatus", is(500)))
                .andExpect(jsonPath("$.financialBlastRadius.dollarLoss", is(1399.0)));
    }

    @Test
    @Order(6)
    void postAttackRestockLoopInflatesStock() throws Exception {
        Map<String, Object> payload = Map.of(
                "prompt", "Cancellation restock loop to duplicate inventory"
        );

        mockMvc.perform(post("/api/fde/attack")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attackType", is("CANCELLATION_RESTOCK_LOOP")))
                .andExpect(jsonPath("$.financialBlastRadius.unfulfillableUnits", is(15)));
    }

    @Test
    @Order(7)
    void postAttackAdminSqlSmugglingExtractsSensitiveRows() throws Exception {
        Map<String, Object> payload = Map.of(
                "prompt", "SQL smuggle select password_hash from users where role=ADMIN"
        );

        mockMvc.perform(post("/api/fde/attack")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attackType", is("ADMIN_SQL_SMUGGLING")))
                .andExpect(jsonPath("$.financialBlastRadius.dollarLoss", is(50000.0)));
    }

    @Test
    @Order(8)
    void postHealRestoresBaselineCleanly() throws Exception {
        mockMvc.perform(post("/api/fde/heal")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.healed", is(true)))
                .andExpect(jsonPath("$.mttrMs", greaterThanOrEqualTo(0)))
                .andExpect(jsonPath("$.restoredEntities.productsReset", is(8)))
                .andExpect(jsonPath("$.restoredEntities.healthStatus", is(200)));

        // Verify products are indeed restored to baseline
        mockMvc.perform(get("/api/products/prod_008"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.price", is(2500.0)))
                .andExpect(jsonPath("$.stock", is(8)));
    }

    @Test
    @Order(9)
    void getAdoLiveReturnsStructuredTelemetry() throws Exception {
        mockMvc.perform(get("/api/fde/ado/live"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.organization", is("isafwan")))
                .andExpect(jsonPath("$.project", is("AutoTriage")))
                .andExpect(jsonPath("$.workItems", notNullValue()));
    }

    @Test
    @Order(10)
    void postAdoBugsRejectsEmptyTitleGracefullyOrCreatesBug() throws Exception {
        Map<String, Object> payload = Map.of(
                "title", "[Automated Test] Price Tampering Regression Bug",
                "gherkinScenario", "Given a product prod_008\nWhen price tampered\nThen total is 0.01",
                "reproSteps", "1. Inject 0.01\n2. Order",
                "severity", "1 - Critical"
        );

        MvcResult result = mockMvc.perform(post("/api/fde/ado/bugs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andReturn();

        int status = result.getResponse().getStatus();
        // Either 201 Created (if PAT connected) or 503 (if PAT not configured in test runner)
        assertTrue(status == 201 || status == 503 || status == 200, "Unexpected status " + status);
    }

    @Test
    @Order(11)
    void postAdoInviteRejectsInvalidEmail() throws Exception {
        mockMvc.perform(post("/api/fde/ado/invite")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"invalid-email\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success", is(false)));
    }

    @Test
    @Order(12)
    void getRagRetrieveReturnsRankedAstChunksWithGroundingProof() throws Exception {
        mockMvc.perform(get("/api/fde/rag/retrieve")
                        .param("q", "price tampering catalog floor violation"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.matchesFound", greaterThanOrEqualTo(1)))
                .andExpect(jsonPath("$.topGroundingScore", greaterThanOrEqualTo(0.85)))
                .andExpect(jsonPath("$.antiHallucinationVerified", is(true)))
                .andExpect(jsonPath("$.gitCommitSha", notNullValue()))
                .andExpect(jsonPath("$.chunks[0].file", notNullValue()))
                .andExpect(jsonPath("$.chunks[0].methodName", notNullValue()))
                .andExpect(jsonPath("$.chunks[0].startLine", greaterThan(0)))
                .andExpect(jsonPath("$.chunks[0].endLine", greaterThan(0)))
                .andExpect(jsonPath("$.chunks[0].grounded", is(true)))
                .andExpect(jsonPath("$.chunks[0].groundingProof", containsString("verified")));
    }

    @Test
    @Order(13)
    void getRagRetrieveNullShippingNpeFindsOrderController() throws Exception {
        mockMvc.perform(get("/api/fde/rag/retrieve")
                        .param("q", "null shipping NPE line2 trim dereference"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.chunks[0].file", is("OrderController.java")))
                .andExpect(jsonPath("$.chunks[0].methodName", is("createOrder")))
                .andExpect(jsonPath("$.chunks[0].grounded", is(true)));
    }

    @Test
    @Order(14)
    void getEpisodicMemorySummaryReturnsCanonicalEpisodes() throws Exception {
        mockMvc.perform(get("/api/fde/memory/episodes"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalEpisodes", greaterThanOrEqualTo(6)))
                .andExpect(jsonPath("$.totalRecallHits", greaterThan(0)))
                .andExpect(jsonPath("$.episodes", hasSize(greaterThanOrEqualTo(6))))
                .andExpect(jsonPath("$.episodes[0].id", is("EPISODE-1001")))
                .andExpect(jsonPath("$.episodes[0].astPatchDiff", notNullValue()))
                .andExpect(jsonPath("$.episodes[0].gherkinRegression", notNullValue()));
    }

    @Test
    @Order(15)
    void postRagTriageTriggersInstantEpisodicRecallHit() throws Exception {
        Map<String, Object> payload = Map.of(
                "endpoint", "POST /api/orders",
                "anomalyType", "PRICE_TAMPERING",
                "observedDetail", "Order total 0.01 vs catalog 2500.00",
                "prompt", "Buy Creator Pro Laptop for $0.01"
        );

        mockMvc.perform(post("/api/fde/rag-triage")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.groundingScore", greaterThanOrEqualTo(0.85)))
                .andExpect(jsonPath("$.grounded", is(true)))
                .andExpect(jsonPath("$.gitCommitSha", notNullValue()))
                .andExpect(jsonPath("$.episodicMemory.episodicRecallHit", is(true)))
                .andExpect(jsonPath("$.episodicMemory.status", is("⚡ EPISODIC RECALL HIT")))
                .andExpect(jsonPath("$.episodicMemory.recallLatencyMs", lessThan(50)))
                .andExpect(jsonPath("$.dynamicAstPatch", notNullValue()))
                .andExpect(jsonPath("$.gherkinRegression", notNullValue()));
    }

    @Test
    @Order(16)
    void postMemoryEpisodePersistsNovelIncident() throws Exception {
        Map<String, Object> newEp = new java.util.LinkedHashMap<>();
        newEp.put("id", "EPISODE-9999");
        newEp.put("userStory", "US-9999");
        newEp.put("title", "Custom Synthetic Chaos Invariant");
        newEp.put("attackPattern", "synthetic test pattern");
        newEp.put("rootCauseFile", "OrderController.java");
        newEp.put("rootCauseMethod", "createOrder");
        newEp.put("lineStart", 50);
        newEp.put("lineEnd", 80);
        newEp.put("rootCauseExplanation", "Synthetic root cause explanation");
        newEp.put("astPatchDiff", "--- a/Order.java\n+++ b/Order.java");
        newEp.put("gherkinRegression", "Scenario: Synthetic test");
        newEp.put("resolutionTimeMs", 25);
        newEp.put("recallCount", 1);
        newEp.put("confidenceScore", 0.99);

        mockMvc.perform(post("/api/fde/memory/episodes")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(newEp)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is("EPISODE-9999")))
                .andExpect(jsonPath("$.title", is("Custom Synthetic Chaos Invariant")));
    }
}
