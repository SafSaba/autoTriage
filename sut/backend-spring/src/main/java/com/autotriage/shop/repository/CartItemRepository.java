package com.autotriage.shop.repository;

import com.autotriage.shop.domain.CartItemEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface CartItemRepository extends JpaRepository<CartItemEntity, Long> {
    List<CartItemEntity> findByUserIdOrderByAddedAtAsc(String userId);
    Optional<CartItemEntity> findByUserIdAndProduct_Id(String userId, String productId);
    void deleteByUserIdAndProduct_Id(String userId, String productId);
    void deleteByUserId(String userId);
}
