package com.autotriage.shop.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;

public class ShopDtos {

    public record ProductDto(
        @Schema(example = "prod_001") String id,
        @Schema(example = "Chronograph Excellence") String name,
        String description,
        @Schema(example = "450.0") double price,
        List<String> images,
        @Schema(example = "Watches") String category,
        @Schema(example = "luxury watch") String dataAiHint,
        @Schema(example = "15") int stock
    ) {}

    public record CreateProductRequest(
        @Schema(example = "prod_009") String id,
        @NotBlank(message = "Product name is required") @Schema(example = "Quantum Mechanical Keyboard") String name,
        @NotBlank(message = "Description is required") @Schema(example = "Hot-swappable aluminum mechanical keyboard.") String description,
        @Schema(example = "199.99") double price,
        List<String> images,
        @Schema(example = "Accessories") String category,
        @Schema(example = "20") Integer stock,
        @Schema(example = "mechanical keyboard") String dataAiHint
    ) {}

    public record CartItemDto(
        ProductDto product,
        @Schema(example = "2") int quantity
    ) {}

    public record CartResponse(
        List<CartItemDto> items,
        @Schema(example = "900.0") double subtotal,
        @Schema(example = "90.0") double tax,
        @Schema(example = "990.0") double total
    ) {}

    public record CartAddItemRequest(
        @Schema(example = "prod_001") String productId,
        @Schema(example = "1") Integer quantity
    ) {}

    public record CartUpdateQuantityRequest(
        @Schema(example = "2") Integer quantity
    ) {}

    public record ShippingAddressDto(
        @NotBlank @Size(min = 2, message = "Name must be at least 2 characters.") @Schema(example = "Max Robinson") String name,
        @NotBlank @Size(min = 5, message = "Address must be at least 5 characters.") @Schema(example = "123 Main St") String line1,
        @Schema(example = "Apt 4B") String line2,
        @NotBlank @Size(min = 2, message = "City must be at least 2 characters.") @Schema(example = "New York") String city,
        @NotBlank @Size(min = 2, message = "State must be at least 2 characters.") @Schema(example = "NY") String state,
        @NotBlank @Size(min = 4, message = "Postal code must be at least 4 characters.") @Schema(example = "10001") String postal_code,
        @NotBlank @Size(min = 2, message = "Country must be at least 2 characters.") @Schema(example = "United States") String country
    ) {}

    public record UserProfileDto(
        String uid,
        String email,
        String role,
        String displayName,
        String phoneNumber,
        ShippingAddressDto shippingAddress,
        long createdAt,
        long updatedAt
    ) {}

    public record UpdateProfileRequest(
        String displayName,
        String firstName,
        String lastName,
        String phoneNumber,
        ShippingAddressDto shippingAddress
    ) {}

    public record LoginRequest(
        @NotBlank @Email @Schema(example = "buyer@autotriage.local") String email,
        @NotBlank @Schema(example = "BuyerPassword123!") String password
    ) {}

    public record SignupRequest(
        @Schema(example = "Max") String firstName,
        @Schema(example = "Robinson") String lastName,
        @NotBlank @Email @Schema(example = "max.robinson@autotriage.local") String email,
        @NotBlank @Size(min = 6) @Schema(example = "StrongPass123!") String password
    ) {}

    public record AuthResponse(
        boolean success,
        String token,
        UserProfileDto user
    ) {}

    public record OrderItemInput(
        ProductDto product,
        @Schema(example = "prod_001") String productId,
        String id,
        String name,
        Double price,
        String imageUrl,
        @Schema(example = "1") int quantity
    ) {}

    public record CreateOrderRequest(
        List<OrderItemInput> items,
        ShippingAddressDto shippingAddress,
        Map<String, Object> paymentDetails
    ) {}

    public record OrderDto(
        String id,
        String userId,
        List<CartItemDto> items,
        double total,
        String status,
        long createdAt,
        ShippingAddressDto shippingAddress,
        Map<String, Object> paymentDetails
    ) {}

    public record UpdateOrderStatusRequest(
        @NotBlank @Schema(example = "shipped") String status
    ) {}

    public record CreateContactMessageRequest(
        @NotBlank @Email @Schema(example = "customer@autotriage.local") String email,
        @NotBlank @Schema(example = "Question about order #ord_123") String subject,
        @NotBlank @Size(min = 10, message = "Message must be at least 10 characters long.") @Schema(example = "Hello, I would like to check the delivery estimate for my order.") String message
    ) {}

    public record ContactMessageDto(
        String id,
        String email,
        String subject,
        String message,
        String status,
        long createdAt
    ) {}
}
