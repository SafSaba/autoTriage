package com.autotriage.shop.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "products")
public class ProductEntity {
    @Id
    private String id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String description;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal price;

    @Column(name = "images_json", nullable = false, columnDefinition = "TEXT")
    private String imagesJson;

    @Column(nullable = false)
    private String category;

    @Column(name = "data_ai_hint")
    private String dataAiHint;

    @Column(nullable = false)
    private int stock;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public BigDecimal getPrice() { return price; }
    public void setPrice(BigDecimal price) { this.price = price; }
    public String getImagesJson() { return imagesJson; }
    public void setImagesJson(String imagesJson) { this.imagesJson = imagesJson; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getDataAiHint() { return dataAiHint; }
    public void setDataAiHint(String dataAiHint) { this.dataAiHint = dataAiHint; }
    public int getStock() { return stock; }
    public void setStock(int stock) { this.stock = stock; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
