package com.autotriage.shop.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "orders")
public class OrderEntity {
    @Id
    private String id;

    @Column(name = "user_id", nullable = false)
    private String userId;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal total;

    @Column(nullable = false)
    private String status = "Processing";

    @Column(name = "shipping_address_json", nullable = false, columnDefinition = "TEXT")
    private String shippingAddressJson;

    @Column(name = "payment_details_json", columnDefinition = "TEXT")
    private String paymentDetailsJson;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    private List<OrderItemEntity> items = new ArrayList<>();

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public BigDecimal getTotal() { return total; }
    public void setTotal(BigDecimal total) { this.total = total; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getShippingAddressJson() { return shippingAddressJson; }
    public void setShippingAddressJson(String shippingAddressJson) { this.shippingAddressJson = shippingAddressJson; }
    public String getPaymentDetailsJson() { return paymentDetailsJson; }
    public void setPaymentDetailsJson(String paymentDetailsJson) { this.paymentDetailsJson = paymentDetailsJson; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public List<OrderItemEntity> getItems() { return items; }
    public void setItems(List<OrderItemEntity> items) { this.items = items; }
}
