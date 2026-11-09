package com.autotriage.shop.repository;

import com.autotriage.shop.domain.ProductEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;

public interface ProductRepository extends JpaRepository<ProductEntity, String> {
    List<ProductEntity> findByCategoryIgnoreCase(String category);

    @Query("SELECT DISTINCT p.category FROM ProductEntity p ORDER BY p.category")
    List<String> findDistinctCategories();

    @Modifying
    @Query("update ProductEntity p set p.stock = p.stock - :qty where p.id = :id and p.stock >= :qty")
    int decrementStockIfAvailable(@Param("id") String id, @Param("qty") int qty);
}
