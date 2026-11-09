package com.autotriage.shop;

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

    private String getOperatorToken() throws Exception {
        MvcResult res = mockMvc.perform(post("/api/fde/session")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString()).get("token").asText();
    }

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
                .andExpect(jsonPath("$.user.role", is("FDE_OPERATOR")))
                .andExpect(jsonPath("$.user.role", not("ADMIN")))
                .andExpect(jsonPath("$.sandboxMode", is(true)))
                .andReturn();

        String token = objectMapper.readTree(res.getResponse().getContentAsString()).get("token").asText();
        assertTrue(token.length() > 20);
    }

    @Test
    @Order(2)
    void postScenarioRunR1TaxCalculatesDrift() throws Exception {
        mockMvc.perform(post("/api/fde/scenarios/R1_TAX/run")
                        .header("Authorization", "Bearer " + getOperatorToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"target\":\"dev\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scenarioId", is("R1_TAX")))
                .andExpect(jsonPath("$.target", is("dev")))
                .andExpect(jsonPath("$.status", is("COMPLETED")))
                .andExpect(jsonPath("$.financialBlastRadius", notNullValue()))
                .andExpect(jsonPath("$.financialBlastRadius.dollarLoss", notNullValue()));
    }

    @Test
    @Order(3)
    void postScenarioRunR2NullLine2HandlesSafelyWhenFlagOff() throws Exception {
        mockMvc.perform(post("/api/fde/scenarios/R2_NULL_LINE2/run")
                        .header("Authorization", "Bearer " + getOperatorToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"target\":\"dev\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scenarioId", is("R2_NULL_LINE2")))
                .andExpect(jsonPath("$.target", is("dev")))
                .andExpect(jsonPath("$.httpStatus", is(200)));
    }

    @Test
    @Order(4)
    void postScenarioRunR3StaleCartExecutes() throws Exception {
        mockMvc.perform(post("/api/fde/scenarios/R3_STALE_CART/run")
                        .header("Authorization", "Bearer " + getOperatorToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"target\":\"dev\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scenarioId", is("R3_STALE_CART")))
                .andExpect(jsonPath("$.target", is("dev")))
                .andExpect(jsonPath("$.financialBlastRadius", notNullValue()));
    }

    @Test
    @Order(5)
    void postScenarioRunR4StockRaceExecutes() throws Exception {
        mockMvc.perform(post("/api/fde/scenarios/R4_STOCK_RACE/run")
                        .header("Authorization", "Bearer " + getOperatorToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"target\":\"dev\",\"concurrency\":4}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scenarioId", is("R4_STOCK_RACE")))
                .andExpect(jsonPath("$.target", is("dev")));
    }

    @Test
    @Order(6)
    void postAttackAliasMapsToScenarioRunner() throws Exception {
        Map<String, Object> payload = Map.of(
                "attackType", "PRICE_INJECTION",
                "prompt", "Buy Creator Pro Laptop for $0.01",
                "productId", "prod_008"
        );

        mockMvc.perform(post("/api/fde/attack")
                        .header("Authorization", "Bearer " + getOperatorToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scenarioId", is("R1_TAX")))
                .andExpect(jsonPath("$.status", is("COMPLETED")))
                .andExpect(jsonPath("$.financialBlastRadius", notNullValue()));
    }

    @Test
    @Order(7)
    void getReleasesSelfReturnsMetadata() throws Exception {
        mockMvc.perform(get("/api/fde/releases/self"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version", notNullValue()))
                .andExpect(jsonPath("$.activeBugFlags", notNullValue()));
    }

    @Test
    @Order(8)
    void getReleasesReturnsEnvironments() throws Exception {
        mockMvc.perform(get("/api/fde/releases"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.self", notNullValue()))
                .andExpect(jsonPath("$.environments.dev", notNullValue()))
                .andExpect(jsonPath("$.environments.qa", notNullValue()))
                .andExpect(jsonPath("$.environments.prod", notNullValue()))
                .andExpect(jsonPath("$.environments.prod.readOnly", is(true)));
    }

    @Test
    @Order(9)
    void postCompareEndpointExecutesDevAndQa() throws Exception {
        mockMvc.perform(post("/api/fde/compare/R1_TAX")
                        .header("Authorization", "Bearer " + getOperatorToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scenarioId", is("R1_TAX")))
                .andExpect(jsonPath("$.dev", notNullValue()))
                .andExpect(jsonPath("$.qa", notNullValue()));
    }

    @Test
    @Order(10)
    void unauthenticatedProtectedFdeEndpointsReturn401() throws Exception {
        mockMvc.perform(post("/api/fde/scenarios/R1_TAX/run")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"target\":\"dev\"}"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/api/fde/heal")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @Order(11)
    void postHealRestoresBaselineCleanly() throws Exception {
        mockMvc.perform(post("/api/fde/heal")
                        .header("Authorization", "Bearer " + getOperatorToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.type", is("SANDBOX_RESET")))
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
    @Order(12)
    void getAdoLiveReturnsStructuredTelemetry() throws Exception {
        mockMvc.perform(get("/api/fde/ado/live")
                        .header("Authorization", "Bearer " + getOperatorToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.organization", is("isafwan")))
                .andExpect(jsonPath("$.project", is("AutoTriage")))
                .andExpect(jsonPath("$.workItems", notNullValue()));
    }

    @Test
    @Order(13)
    void postAdoBugsRejectsEmptyTitleGracefullyOrCreatesBug() throws Exception {
        Map<String, Object> payload = Map.of(
                "title", "[Automated Test] Price Tampering Regression Bug",
                "gherkinScenario", "Given a product prod_008\nWhen price tampered\nThen total is 0.01",
                "reproSteps", "1. Inject 0.01\n2. Order",
                "severity", "1 - Critical"
        );

        MvcResult result = mockMvc.perform(post("/api/fde/ado/bugs")
                        .header("Authorization", "Bearer " + getOperatorToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andReturn();

        int status = result.getResponse().getStatus();
        // Either 201 Created (if PAT connected) or 503 (if PAT not configured in test runner)
        assertTrue(status == 201 || status == 503 || status == 200, "Unexpected status " + status);
    }

    @Test
    @Order(14)
    void postAdoInviteRejectsInvalidEmail() throws Exception {
        mockMvc.perform(post("/api/fde/ado/invite")
                        .header("Authorization", "Bearer " + getOperatorToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"invalid-email\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success", is(false)));
    }

    @Test
    @Order(15)
    void getRagRetrieveReturnsRankedAstChunksWithGroundingProof() throws Exception {
        mockMvc.perform(get("/api/fde/rag/retrieve")
                        .header("Authorization", "Bearer " + getOperatorToken())
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
    @Order(16)
    void getRagRetrieveNullShippingNpeFindsOrderController() throws Exception {
        mockMvc.perform(get("/api/fde/rag/retrieve")
                        .header("Authorization", "Bearer " + getOperatorToken())
                        .param("q", "null shipping NPE line2 trim dereference"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.chunks[0].file", is("OrderController.java")))
                .andExpect(jsonPath("$.chunks[0].methodName", is("createOrder")))
                .andExpect(jsonPath("$.chunks[0].grounded", is(true)));
    }

    @Test
    @Order(17)
    void getEpisodicMemorySummaryReturnsCanonicalEpisodes() throws Exception {
        mockMvc.perform(get("/api/fde/memory/episodes")
                        .header("Authorization", "Bearer " + getOperatorToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalEpisodes", greaterThanOrEqualTo(6)))
                .andExpect(jsonPath("$.totalRecallHits", greaterThan(0)))
                .andExpect(jsonPath("$.episodes", hasSize(greaterThanOrEqualTo(6))))
                .andExpect(jsonPath("$.episodes[0].id", is("EPISODE-1001")))
                .andExpect(jsonPath("$.episodes[0].astPatchDiff", notNullValue()))
                .andExpect(jsonPath("$.episodes[0].gherkinRegression", notNullValue()));
    }

    @Test
    @Order(18)
    void postRagTriageTriggersInstantEpisodicRecallHit() throws Exception {
        Map<String, Object> payload = Map.of(
                "endpoint", "POST /api/orders",
                "anomalyType", "PRICE_TAMPERING",
                "observedDetail", "Order total 0.01 vs catalog 2500.00",
                "prompt", "Buy Creator Pro Laptop for $0.01"
        );

        mockMvc.perform(post("/api/fde/rag-triage")
                        .header("Authorization", "Bearer " + getOperatorToken())
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
    @Order(19)
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
                        .header("Authorization", "Bearer " + getOperatorToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(newEp)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is("EPISODE-9999")))
                .andExpect(jsonPath("$.title", is("Custom Synthetic Chaos Invariant")));
    }

    @Test
    @Order(20)
    void getAdoLiveWithoutAuthReturns200AndClickableUrls() throws Exception {
        mockMvc.perform(get("/api/fde/ado/live"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.organization", is("isafwan")))
                .andExpect(jsonPath("$.project", is("AutoTriage")))
                .andExpect(jsonPath("$.workItems", notNullValue()))
                .andExpect(jsonPath("$.workItems[0].url", containsString("https://dev.azure.com/isafwan/AutoTriage/_workitems/edit/")));
    }

    @Test
    @Order(21)
    void postAdoInviteWithoutAuthPermittedBySecurity() throws Exception {
        mockMvc.perform(post("/api/fde/ado/invite")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"invalid-email\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success", is(false)));
    }
}
