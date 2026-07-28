package com.autotriage.shop;

import com.autotriage.shop.dto.ShopDtos.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;
import java.util.Map;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ShopIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void unauthenticatedCartReturns401() throws Exception {
        mockMvc.perform(get("/api/cart"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error", containsString("Unauthorized")));
    }

    @Test
    void productCatalogFilterAndSortWorks() throws Exception {
        mockMvc.perform(get("/api/products"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(8)));

        mockMvc.perform(get("/api/products")
                        .param("category", "Laptops")
                        .param("sort", "price_asc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(3)))
                .andExpect(jsonPath("$[0].id", is("prod_003")))
                .andExpect(jsonPath("$[0].price", is(1399.0)))
                .andExpect(jsonPath("$[2].id", is("prod_008")))
                .andExpect(jsonPath("$[2].price", is(2500.0)));
    }

    @Test
    void loginCartMergeAndOrderCreationWorks() throws Exception {
        // 1. Login as seeded buyer
        String loginBody = objectMapper.writeValueAsString(new LoginRequest("buyer@autotriage.local", "BuyerPassword123!"));
        MvcResult loginResult = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token", notNullValue()))
                .andReturn();

        String token = objectMapper.readTree(loginResult.getResponse().getContentAsString()).get("token").asText();

        // 2. Missing productId returns 400
        mockMvc.perform(post("/api/cart")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is("Missing productId")));

        // 3. Unknown product returns 404
        mockMvc.perform(post("/api/cart")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":\"prod_999\",\"quantity\":1}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error", is("Product prod_999 not found")));

        // 4. Adding same product twice merges into one cart line
        mockMvc.perform(post("/api/cart")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":\"prod_001\",\"quantity\":1}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/cart")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":\"prod_001\",\"quantity\":2}"))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/cart")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].product.id", is("prod_001")))
                .andExpect(jsonPath("$.items[0].quantity", is(3)))
                .andExpect(jsonPath("$.subtotal", is(1350.0)))
                .andExpect(jsonPath("$.total", is(1485.0)));

        // 5. Place order from cart
        ShippingAddressDto addr = new ShippingAddressDto("Max Robinson", "123 Main St", "Apt 4B", "New York", "NY", "10001", "United States");
        CreateOrderRequest orderReq = new CreateOrderRequest(List.of(), addr, Map.of("method", "Card", "last4", "4242"));

        MvcResult orderRes = mockMvc.perform(post("/api/orders")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(orderReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", startsWith("ord_")))
                .andExpect(jsonPath("$.total", is(1485.0)))
                .andExpect(jsonPath("$.status", is("Processing")))
                .andReturn();

        String orderId = objectMapper.readTree(orderRes.getResponse().getContentAsString()).get("id").asText();

        // 6. Verify order appears in history
        mockMvc.perform(get("/api/orders/" + orderId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(orderId)))
                .andExpect(jsonPath("$.items", hasSize(1)));

        // 7. Verify USER role gets 403 on admin product creation
        CreateProductRequest prodReq = new CreateProductRequest("prod_test", "Test Item", "Desc", 99.0, List.of("https://placehold.co/600x600.png"), "Watches", 5, "watch");
        mockMvc.perform(post("/api/products")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(prodReq)))
                .andExpect(status().isForbidden());
    }
}
