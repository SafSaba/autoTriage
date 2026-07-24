package com.autotriage.shop.controller;

import com.autotriage.shop.domain.CartItemEntity;
import com.autotriage.shop.domain.ProductEntity;
import com.autotriage.shop.dto.ShopDtos.*;
import com.autotriage.shop.exception.ApiException;
import com.autotriage.shop.repository.CartItemRepository;
import com.autotriage.shop.repository.ProductRepository;
import com.autotriage.shop.security.AuthPrincipal;
import com.autotriage.shop.service.BugFlagsService;
import com.autotriage.shop.service.DtoMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/cart")
@Tag(name = "3. Shopping Cart", description = "Authenticated user shopping cart management and guest cart merge")
public class CartController {

    private final CartItemRepository cartItemRepository;
    private final ProductRepository productRepository;
    private final DtoMapper mapper;
    private final BugFlagsService bugFlagsService;

    public CartController(CartItemRepository cartItemRepository,
                          ProductRepository productRepository,
                          DtoMapper mapper,
                          BugFlagsService bugFlagsService) {
        this.cartItemRepository = cartItemRepository;
        this.productRepository = productRepository;
        this.mapper = mapper;
        this.bugFlagsService = bugFlagsService;
    }

    @GetMapping
    @Operation(summary = "Get current user's cart with subtotal, 10% tax, and total")
    public CartResponse getCart(@AuthenticationPrincipal AuthPrincipal principal) {
        requireAuth(principal);
        List<CartItemDto> items = cartItemRepository.findByUserIdOrderByAddedAtAsc(principal.uid())
                .stream()
                .map(mapper::toCartItemDto)
                .toList();
        return buildCartResponse(items);
    }

    @PostMapping({"", "/items"})
    @Transactional
    @Operation(summary = "Add a product to cart (merges quantity if already present)")
    public Map<String, Object> addItem(@AuthenticationPrincipal AuthPrincipal principal,
                                       @RequestBody CartAddItemRequest req) {
        requireAuth(principal);
        if (req.productId() == null || req.productId().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Missing productId");
        }
        int qtyToAdd = req.quantity() != null ? req.quantity() : 1;
        if (qtyToAdd < 1) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Quantity must be at least 1");
        }

        ProductEntity product = productRepository.findById(req.productId())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Product " + req.productId() + " not found"));

        CartItemEntity item = cartItemRepository.findByUserIdAndProduct_Id(principal.uid(), product.getId())
                .orElseGet(() -> {
                    CartItemEntity created = new CartItemEntity();
                    created.setUserId(principal.uid());
                    created.setProduct(product);
                    created.setQuantity(0);
                    return created;
                });

        int newQty = item.getQuantity() + qtyToAdd;
        if (product.getStock() > 0 && newQty > product.getStock()) {
            newQty = product.getStock();
        }
        item.setQuantity(newQty);
        cartItemRepository.save(item);

        return Map.of(
                "success", true,
                "message", "Item added to cart",
                "cart", getCart(principal)
        );
    }

    @PostMapping("/sync")
    @Transactional
    @Operation(summary = "Merge guest cart items into the authenticated user's cart on login")
    public CartResponse syncGuestCart(@AuthenticationPrincipal AuthPrincipal principal,
                                      @RequestBody List<CartAddItemRequest> guestItems) {
        requireAuth(principal);
        if (guestItems != null) {
            for (CartAddItemRequest req : guestItems) {
                if (req.productId() == null || req.productId().isBlank()) continue;
                int qty = req.quantity() != null && req.quantity() > 0 ? req.quantity() : 1;
                productRepository.findById(req.productId()).ifPresent(product -> {
                    CartItemEntity item = cartItemRepository.findByUserIdAndProduct_Id(principal.uid(), product.getId())
                            .orElseGet(() -> {
                                CartItemEntity created = new CartItemEntity();
                                created.setUserId(principal.uid());
                                created.setProduct(product);
                                created.setQuantity(0);
                                return created;
                            });
                    int merged = item.getQuantity() + qty;
                    if (product.getStock() > 0 && merged > product.getStock()) {
                        merged = product.getStock();
                    }
                    item.setQuantity(merged);
                    cartItemRepository.save(item);
                });
            }
        }
        return getCart(principal);
    }

    @PutMapping("/items/{productId}")
    @Transactional
    @Operation(summary = "Update item quantity in cart (removes item if quantity <= 0)")
    public CartResponse updateItemQuantity(@AuthenticationPrincipal AuthPrincipal principal,
                                           @PathVariable String productId,
                                           @RequestBody CartUpdateQuantityRequest req) {
        requireAuth(principal);
        if (req.quantity() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Missing quantity");
        }

        if (req.quantity() <= 0) {
            if (!bugFlagsService.isStaleCartCache()) {
                cartItemRepository.deleteByUserIdAndProduct_Id(principal.uid(), productId);
            }
        } else {
            ProductEntity product = productRepository.findById(productId)
                    .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Product " + productId + " not found"));
            CartItemEntity item = cartItemRepository.findByUserIdAndProduct_Id(principal.uid(), productId)
                    .orElseGet(() -> {
                        CartItemEntity created = new CartItemEntity();
                        created.setUserId(principal.uid());
                        created.setProduct(product);
                        return created;
                    });
            int capped = product.getStock() > 0 ? Math.min(req.quantity(), product.getStock()) : req.quantity();
            item.setQuantity(capped);
            cartItemRepository.save(item);
        }

        return getCart(principal);
    }

    @DeleteMapping("/items/{productId}")
    @Transactional
    @Operation(summary = "Remove a single product from cart")
    public CartResponse removeItem(@AuthenticationPrincipal AuthPrincipal principal,
                                   @PathVariable String productId) {
        requireAuth(principal);
        if (!bugFlagsService.isStaleCartCache()) {
            cartItemRepository.deleteByUserIdAndProduct_Id(principal.uid(), productId);
        }
        return getCart(principal);
    }

    @DeleteMapping
    @Transactional
    @Operation(summary = "Clear all items from the current user's cart")
    public Map<String, Object> clearCart(@AuthenticationPrincipal AuthPrincipal principal) {
        requireAuth(principal);
        if (!bugFlagsService.isStaleCartCache()) {
            cartItemRepository.deleteByUserId(principal.uid());
        }
        return Map.of("success", true, "message", "Cart cleared");
    }

    private void requireAuth(AuthPrincipal principal) {
        if (principal == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Unauthorized: You must be logged in.");
        }
    }

    private CartResponse buildCartResponse(List<CartItemDto> items) {
        BigDecimal subtotal = items.stream()
                .map(i -> BigDecimal.valueOf(i.product().price()).multiply(BigDecimal.valueOf(i.quantity())))
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);
        BigDecimal tax = subtotal.multiply(new BigDecimal("0.10")).setScale(2, RoundingMode.HALF_UP);
        BigDecimal total = subtotal.add(tax).setScale(2, RoundingMode.HALF_UP);
        return new CartResponse(items, subtotal.doubleValue(), tax.doubleValue(), total.doubleValue());
    }
}
