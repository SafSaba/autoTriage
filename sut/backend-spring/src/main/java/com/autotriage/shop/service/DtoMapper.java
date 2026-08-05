package com.autotriage.shop.service;

import com.autotriage.shop.domain.CartItemEntity;
import com.autotriage.shop.domain.OrderEntity;
import com.autotriage.shop.domain.ProductEntity;
import com.autotriage.shop.domain.UserEntity;
import com.autotriage.shop.dto.ShopDtos.*;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.List;
import java.util.Map;

@Component
public class DtoMapper {

    private final ObjectMapper objectMapper;

    public DtoMapper(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public ProductDto toProductDto(ProductEntity entity) {
        List<String> images = Collections.emptyList();
        try {
            if (entity.getImagesJson() != null) {
                images = objectMapper.readValue(entity.getImagesJson(), new TypeReference<List<String>>() {});
            }
        } catch (Exception ignored) {}
        return new ProductDto(
                entity.getId(),
                entity.getName(),
                entity.getDescription(),
                entity.getPrice().doubleValue(),
                images,
                entity.getCategory(),
                entity.getDataAiHint() != null ? entity.getDataAiHint() : "",
                entity.getStock()
        );
    }

    public String toJson(Object obj) {
        if (obj == null) return null;
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (Exception e) {
            throw new IllegalArgumentException("Failed to serialize JSON", e);
        }
    }

    public ShippingAddressDto parseShippingAddress(String json) {
        if (json == null || json.isBlank()) return null;
        try {
            return objectMapper.readValue(json, ShippingAddressDto.class);
        } catch (Exception e) {
            return null;
        }
    }

    public Map<String, Object> parseMap(String json) {
        if (json == null || json.isBlank()) return Collections.emptyMap();
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            return Collections.emptyMap();
        }
    }

    public UserProfileDto toUserProfileDto(UserEntity user) {
        return new UserProfileDto(
                user.getId(),
                user.getEmail(),
                user.getRole(),
                user.getDisplayName(),
                user.getPhoneNumber(),
                parseShippingAddress(user.getShippingAddressJson()),
                user.getCreatedAt().getEpochSecond(),
                user.getUpdatedAt().getEpochSecond()
        );
    }

    public CartItemDto toCartItemDto(CartItemEntity item) {
        return new CartItemDto(toProductDto(item.getProduct()), item.getQuantity());
    }

    public OrderDto toOrderDto(OrderEntity order) {
        List<CartItemDto> items = order.getItems().stream()
                .map(oi -> new CartItemDto(toProductDto(oi.getProduct()), oi.getQuantity()))
                .toList();
        return new OrderDto(
                order.getId(),
                order.getUserId(),
                items,
                order.getTotal().doubleValue(),
                order.getStatus(),
                order.getCreatedAt().getEpochSecond(),
                parseShippingAddress(order.getShippingAddressJson()),
                parseMap(order.getPaymentDetailsJson())
        );
    }
}
