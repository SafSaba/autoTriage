package com.autotriage.shop.repository;

import com.autotriage.shop.domain.ProductEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;

public interface ProductRepository extends JpaRepository<ProductEntity, String> {
    List<ProductEntity> findByCategoryIgnoreCase(String category);

    @Query("SELECT DISTINCT p.category FROM ProductEntity p ORDER BY p.category")
    List<String> findDistinctCategories();
}
