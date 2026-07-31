package com.autotriage.shop.repository;

import com.autotriage.shop.domain.ContactMessageEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ContactMessageRepository extends JpaRepository<ContactMessageEntity, String> {
    List<ContactMessageEntity> findAllByOrderByCreatedAtDesc();
}
