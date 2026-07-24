package com.autotriage.shop.controller;

import com.autotriage.shop.domain.ProductEntity;
import com.autotriage.shop.dto.ShopDtos.CreateProductRequest;
import com.autotriage.shop.dto.ShopDtos.ProductDto;
import com.autotriage.shop.exception.ApiException;
import com.autotriage.shop.repository.ProductRepository;
import com.autotriage.shop.service.DtoMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/products")
@Tag(name = "2. Products Catalog", description = "Public product browsing, filtering, sorting, and ADMIN product management")
public class ProductController {

    private final ProductRepository productRepository;
    private final DtoMapper mapper;

    public ProductController(ProductRepository productRepository, DtoMapper mapper) {
        this.productRepository = productRepository;
        this.mapper = mapper;
    }

    @GetMapping
    @Operation(summary = "List products with optional category, search query, and sort order", description = "Supports category (Watches, Laptops, Smartphones), q/search, and sort (price_asc, price_desc, name_asc, name_desc).")
    public List<ProductDto> getProducts(
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String sort
    ) {
        List<ProductDto> list = productRepository.findAll().stream()
                .map(mapper::toProductDto)
                .toList();

        if (category != null && !category.isBlank()) {
            list = list.stream()
                    .filter(p -> p.category().equalsIgnoreCase(category.trim()))
                    .toList();
        }

        String query = (search != null && !search.isBlank()) ? search : q;
        if (query != null && !query.isBlank()) {
            String lower = query.trim().toLowerCase(Locale.ROOT);
            list = list.stream()
                    .filter(p -> p.name().toLowerCase(Locale.ROOT).contains(lower) ||
                                 p.description().toLowerCase(Locale.ROOT).contains(lower))
                    .toList();
        }

        if (sort != null && !sort.isBlank()) {
            switch (sort.trim().toLowerCase(Locale.ROOT)) {
                case "price_asc", "price-asc" ->
                        list = list.stream().sorted(Comparator.comparingDouble(ProductDto::price)).toList();
                case "price_desc", "price-desc" ->
                        list = list.stream().sorted(Comparator.comparingDouble(ProductDto::price).reversed()).toList();
                case "name_asc", "name-asc" ->
                        list = list.stream().sorted(Comparator.comparing(ProductDto::name, String.CASE_INSENSITIVE_ORDER)).toList();
                case "name_desc", "name-desc" ->
                        list = list.stream().sorted(Comparator.comparing(ProductDto::name, String.CASE_INSENSITIVE_ORDER).reversed()).toList();
                default -> {}
            }
        }

        return list;
    }

    @GetMapping("/categories")
    @Operation(summary = "List distinct product categories")
    public List<String> getCategories() {
        return productRepository.findDistinctCategories();
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get a single product by ID")
    public ProductDto getProductById(@PathVariable String id) {
        ProductEntity entity = productRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Product " + id + " not found"));
        return mapper.toProductDto(entity);
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create or upsert a product (ADMIN only)")
    public ProductDto createProduct(@Valid @RequestBody CreateProductRequest req) {
        String id = (req.id() != null && !req.id().isBlank())
                ? req.id().trim()
                : "prod_" + UUID.randomUUID().toString().substring(0, 8);

        ProductEntity entity = productRepository.findById(id).orElseGet(ProductEntity::new);
        entity.setId(id);
        entity.setName(req.name().trim());
        entity.setDescription(req.description().trim());
        entity.setPrice(BigDecimal.valueOf(req.price()));
        List<String> images = (req.images() != null && !req.images().isEmpty())
                ? req.images()
                : List.of("https://placehold.co/600x600.png");
        entity.setImagesJson(mapper.toJson(images));
        entity.setCategory(req.category() != null && !req.category().isBlank() ? req.category().trim() : "New Arrivals");
        entity.setStock(req.stock() != null ? req.stock() : 10);
        entity.setDataAiHint(req.dataAiHint() != null ? req.dataAiHint() : req.name().toLowerCase(Locale.ROOT));

        productRepository.save(entity);
        return mapper.toProductDto(entity);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Update an existing product's price, stock, or details (ADMIN only)")
    public ProductDto updateProduct(@PathVariable String id, @Valid @RequestBody CreateProductRequest req) {
        ProductEntity entity = productRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Product " + id + " not found"));

        entity.setName(req.name().trim());
        entity.setDescription(req.description().trim());
        entity.setPrice(BigDecimal.valueOf(req.price()));
        if (req.images() != null && !req.images().isEmpty()) {
            entity.setImagesJson(mapper.toJson(req.images()));
        }
        if (req.category() != null && !req.category().isBlank()) {
            entity.setCategory(req.category().trim());
        }
        if (req.stock() != null) {
            entity.setStock(req.stock());
        }
        if (req.dataAiHint() != null) {
            entity.setDataAiHint(req.dataAiHint());
        }
        productRepository.save(entity);
        return mapper.toProductDto(entity);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Delete a product by ID (ADMIN only)")
    public Map<String, Object> deleteProduct(@PathVariable String id) {
        if (!productRepository.existsById(id)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Product " + id + " not found");
        }
        productRepository.deleteById(id);
        return Map.of("success", true, "id", id);
    }

    @PostMapping("/reset")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    @Operation(summary = "Reset catalog to the 8 canonical E-Automate products (ADMIN only)")
    public List<ProductDto> resetProducts() {
        List<ProductEntity> defaults = List.of(
            buildSeed("prod_001", "Chronograph Excellence", "A masterpiece of precision and style, this chronograph watch is designed for the modern man. Featuring a stainless steel case, sapphire crystal glass, and a sophisticated dial with multiple subdials, it offers both functionality and elegance. Water-resistant up to 100 meters.", 450.00, List.of("https://images.unsplash.com/photo-1524805444758-089113d48a6d?q=80&w=600&auto=format&fit=crop","https://placehold.co/600x600.png","https://placehold.co/600x600.png"), "Watches", 15, "luxury watch"),
            buildSeed("prod_002", "Titanium Smartwatch", "Experience the future on your wrist. This smartwatch boasts a lightweight titanium frame, a vibrant AMOLED display, and a suite of health and fitness tracking features. Syncs seamlessly with your smartphone for notifications, calls, and music control. Long-lasting battery life.", 799.99, List.of("https://images.unsplash.com/photo-1546868871-7041f2a55e12?q=80&w=600&auto=format&fit=crop","https://placehold.co/600x600.png"), "Watches", 25, "smart watch"),
            buildSeed("prod_003", "Ultra-Slim Laptop", "Power and portability combined. Our ultra-slim laptop features the latest generation processor, a stunning 4K display, and a sleek aluminum body. With all-day battery life and a backlit keyboard, it’s perfect for professionals on the go. Comes with 16GB RAM and 1TB SSD storage.", 1399.00, List.of("https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?q=80&w=600&auto=format&fit=crop","https://placehold.co/600x600.png"), "Laptops", 10, "modern laptop"),
            buildSeed("prod_004", "Gaming Beast Laptop", "Unleash your gaming potential with this powerhouse. Equipped with a high-refresh-rate display, a top-tier graphics card, and an advanced cooling system. The customizable RGB keyboard and immersive audio will elevate your gaming experience to new heights.", 2100.50, List.of("https://images.unsplash.com/photo-1593642702821-c8da6771f0c6?q=80&w=600&auto=format&fit=crop","https://placehold.co/600x600.png","https://placehold.co/600x600.png"), "Laptops", 5, "gaming laptop"),
            buildSeed("prod_005", "Galaxy Pro Smartphone", "Capture life in stunning detail with the Galaxy Pro. Its professional-grade camera system, brilliant dynamic display, and powerful processor make it a leader in its class. Features an intelligent S-Pen for ultimate productivity and creativity. 5G ready.", 1199.99, List.of("https://images.unsplash.com/photo-1601784551446-20c9e07cdbf1?q=80&w=600&auto=format&fit=crop","https://placehold.co/600x600.png"), "Smartphones", 30, "modern smartphone"),
            buildSeed("prod_006", "Pixel Perfect Smartphone", "The smart choice for a smartphone. Renowned for its exceptional camera powered by AI, clean software experience, and tight integration with Google services. Get the best of Android with timely updates and helpful features that anticipate your needs.", 899.00, List.of("https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?q=80&w=600&auto=format&fit=crop","https://placehold.co/600x600.png"), "Smartphones", 22, "sleek smartphone"),
            buildSeed("prod_007", "Minimalist Digital Watch", "Simplicity meets sophistication. This digital watch features a clean, easy-to-read display in a slim and lightweight case. Perfect for everyday wear, it offers essential features like an alarm, stopwatch, and backlight in an understated design.", 150.00, List.of("https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=600&auto=format&fit=crop"), "Watches", 40, "minimalist watch"),
            buildSeed("prod_008", "Creator Pro Laptop", "The ultimate tool for creators. This laptop is built to handle demanding creative workflows with its color-accurate display, powerful GPU, and extensive port selection. Whether you are into video editing, 3D rendering, or graphic design, this machine has you covered.", 2500.00, List.of("https://images.unsplash.com/photo-1589561253898-768105ca91a8?q=80&w=600&auto=format&fit=crop","https://placehold.co/600x600.png"), "Laptops", 8, "powerful laptop")
        );
        productRepository.saveAll(defaults);
        return productRepository.findAll().stream().map(mapper::toProductDto).toList();
    }

    private ProductEntity buildSeed(String id, String name, String desc, double price, List<String> images, String category, int stock, String hint) {
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
}
