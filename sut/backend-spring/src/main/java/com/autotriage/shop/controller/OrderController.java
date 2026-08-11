package com.autotriage.shop.controller;

import com.autotriage.shop.domain.CartItemEntity;
import com.autotriage.shop.domain.OrderEntity;
import com.autotriage.shop.domain.OrderItemEntity;
import com.autotriage.shop.domain.ProductEntity;
import com.autotriage.shop.dto.ShopDtos.*;
import com.autotriage.shop.exception.ApiException;
import com.autotriage.shop.repository.CartItemRepository;
import com.autotriage.shop.repository.OrderRepository;
import com.autotriage.shop.repository.ProductRepository;
import com.autotriage.shop.security.AuthPrincipal;
import com.autotriage.shop.service.BugFlagsService;
import com.autotriage.shop.service.DtoMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api")
@Tag(name = "4. Orders & Checkout", description = "Customer checkout, order history, and ADMIN order fulfillment")
public class OrderController {

    private final OrderRepository orderRepository;
    private final ProductRepository productRepository;
    private final CartItemRepository cartItemRepository;
    private final DtoMapper mapper;
    private final BugFlagsService bugFlagsService;

    public OrderController(OrderRepository orderRepository,
                           ProductRepository productRepository,
                           CartItemRepository cartItemRepository,
                           DtoMapper mapper,
                           BugFlagsService bugFlagsService) {
        this.orderRepository = orderRepository;
        this.productRepository = productRepository;
        this.cartItemRepository = cartItemRepository;
        this.mapper = mapper;
        this.bugFlagsService = bugFlagsService;
    }

    @PostMapping({"/orders", "/orders/checkout"})
    @Transactional
    @Operation(summary = "Place a new order", description = "Validates and decrements product stock, calculates 10% tax, clears user cart, and persists the order. Cards ending in 0002 return 402 Payment Required.")
    public OrderDto createOrder(@AuthenticationPrincipal AuthPrincipal principal,
                                @Valid @RequestBody CreateOrderRequest req) {
        if (principal == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Unauthorized: You must be logged in.");
        }
        if (req.shippingAddress() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Shipping address is required");
        }

        // Toggleable Bug Flag 3: BUG_NULL_SHIPPING_NPE (triggers NPE if line2 is null/empty when flag is enabled)
        if (bugFlagsService.isNullShippingNpe()) {
            @SuppressWarnings("unused")
            int unusedLength = req.shippingAddress().line2().trim().length();
        }

        // Mock payment gateway check: decline cards ending in 0002
        if (req.paymentDetails() != null) {
            Object last4 = req.paymentDetails().get("last4");
            Object cardNumber = req.paymentDetails().get("cardNumber");
            if ("0002".equals(String.valueOf(last4)) ||
                (cardNumber != null && String.valueOf(cardNumber).endsWith("0002"))) {
                throw new ApiException(HttpStatus.PAYMENT_REQUIRED, "Payment declined by issuer (card ending in 0002)");
            }
        }

        List<OrderItemEntity> orderItems = new ArrayList<>();
        OrderEntity order = new OrderEntity();
        order.setId("ord_" + UUID.randomUUID().toString().replace("-", "").substring(0, 10));
        order.setUserId(principal.uid());
        order.setStatus("Processing");
        order.setShippingAddressJson(mapper.toJson(req.shippingAddress()));
        order.setPaymentDetailsJson(mapper.toJson(
                req.paymentDetails() != null ? req.paymentDetails() : Map.of("method", "Card", "last4", "4242")
        ));

        if (req.items() != null && !req.items().isEmpty()) {
            for (OrderItemInput input : req.items()) {
                String pid = input.productId() != null ? input.productId()
                        : (input.id() != null ? input.id()
                        : (input.product() != null ? input.product().id() : null));
                if (pid == null) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "Missing productId in order item");
                }
                int qty = Math.max(1, input.quantity());
                ProductEntity product = productRepository.findById(pid)
                        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Product " + pid + " not found"));

                if (product.getStock() < qty) {
                    throw new ApiException(HttpStatus.CONFLICT,
                            "Insufficient stock for " + product.getName() + " (available: " + product.getStock() + ")");
                }
                product.setStock(product.getStock() - qty);
                productRepository.save(product);

                OrderItemEntity oi = new OrderItemEntity();
                oi.setOrder(order);
                oi.setProduct(product);
                oi.setQuantity(qty);
                oi.setUnitPrice(product.getPrice());
                orderItems.add(oi);
            }
        } else {
            List<CartItemEntity> cartItems = cartItemRepository.findByUserIdOrderByAddedAtAsc(principal.uid());
            for (CartItemEntity ci : cartItems) {
                ProductEntity product = ci.getProduct();
                int qty = ci.getQuantity();
                if (product.getStock() < qty) {
                    throw new ApiException(HttpStatus.CONFLICT,
                            "Insufficient stock for " + product.getName() + " (available: " + product.getStock() + ")");
                }
                product.setStock(product.getStock() - qty);
                productRepository.save(product);

                OrderItemEntity oi = new OrderItemEntity();
                oi.setOrder(order);
                oi.setProduct(product);
                oi.setQuantity(qty);
                oi.setUnitPrice(product.getPrice());
                orderItems.add(oi);
            }
        }

        if (orderItems.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Cannot place empty order");
        }

        BigDecimal subtotal = orderItems.stream()
                .map(oi -> oi.getUnitPrice().multiply(BigDecimal.valueOf(oi.getQuantity())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Toggleable Bug Flag 1: BUG_OFF_BY_ONE_DISCOUNT (subtracts an extra 10% when enabled)
        BigDecimal multiplier = bugFlagsService.isOffByOneDiscount()
                ? new BigDecimal("0.99")
                : new BigDecimal("1.10");
        BigDecimal total = subtotal.multiply(multiplier).setScale(2, RoundingMode.HALF_UP);

        order.setTotal(total);
        order.setItems(orderItems);
        orderRepository.save(order);

        if (!bugFlagsService.isStaleCartCache()) {
            cartItemRepository.deleteByUserId(principal.uid());
        }
        return mapper.toOrderDto(order);
    }

    @GetMapping("/orders")
    @Operation(summary = "List orders belonging to the current user")
    public List<OrderDto> getUserOrders(@AuthenticationPrincipal AuthPrincipal principal) {
        if (principal == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Unauthorized: You must be logged in.");
        }
        return orderRepository.findByUserIdOrderByCreatedAtDesc(principal.uid())
                .stream()
                .map(mapper::toOrderDto)
                .toList();
    }

    @GetMapping("/orders/{orderId}")
    @Operation(summary = "Get order details by ID (owner or ADMIN only)")
    public OrderDto getOrderById(@AuthenticationPrincipal AuthPrincipal principal,
                                 @PathVariable String orderId) {
        if (principal == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Unauthorized: You must be logged in.");
        }
        OrderEntity order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Order not found"));

        boolean isAdmin = "ADMIN".equalsIgnoreCase(principal.role());
        if (!isAdmin && !order.getUserId().equals(principal.uid())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Access denied: Order does not belong to the current user.");
        }
        return mapper.toOrderDto(order);
    }

    @GetMapping("/admin/orders")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "List all customer orders across the platform (ADMIN only)")
    public List<OrderDto> getAllOrders() {
        return orderRepository.findAllByOrderByCreatedAtDesc()
                .stream()
                .map(mapper::toOrderDto)
                .toList();
    }

    @PutMapping("/admin/orders/{orderId}/status")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    @Operation(summary = "Update order status (ADMIN only) — restores product stock if cancelled")
    public OrderDto updateOrderStatus(@PathVariable String orderId,
                                      @Valid @RequestBody UpdateOrderStatusRequest req) {
        OrderEntity order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Order not found"));

        String prevStatus = order.getStatus();
        String nextStatus = req.status().trim();

        // If transitioning to cancelled from a non-cancelled state, restore stock
        if ("cancelled".equalsIgnoreCase(nextStatus) && !"cancelled".equalsIgnoreCase(prevStatus)) {
            for (OrderItemEntity item : order.getItems()) {
                ProductEntity p = item.getProduct();
                p.setStock(p.getStock() + item.getQuantity());
                productRepository.save(p);
            }
        }

        order.setStatus(nextStatus);
        orderRepository.save(order);
        return mapper.toOrderDto(order);
    }
}
