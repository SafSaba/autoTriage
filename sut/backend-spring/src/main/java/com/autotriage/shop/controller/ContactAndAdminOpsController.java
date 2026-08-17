package com.autotriage.shop.controller;

import com.autotriage.shop.domain.ContactMessageEntity;
import com.autotriage.shop.dto.ShopDtos.ContactMessageDto;
import com.autotriage.shop.dto.ShopDtos.CreateContactMessageRequest;
import com.autotriage.shop.exception.ApiException;
import com.autotriage.shop.repository.ContactMessageRepository;
import com.autotriage.shop.service.BugFlagsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api")
@Tag(name = "5. Support & Admin Diagnostics", description = "Customer contact messages, DB inspection, and runtime AutoTriage bug-flag controls")
public class ContactAndAdminOpsController {

    private final ContactMessageRepository contactMessageRepository;
    private final BugFlagsService bugFlagsService;
    private final JdbcTemplate jdbcTemplate;

    public ContactAndAdminOpsController(ContactMessageRepository contactMessageRepository,
                                        BugFlagsService bugFlagsService,
                                        JdbcTemplate jdbcTemplate) {
        this.contactMessageRepository = contactMessageRepository;
        this.bugFlagsService = bugFlagsService;
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostMapping("/contact")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Submit a customer support / contact message")
    public ContactMessageDto submitContact(@Valid @RequestBody CreateContactMessageRequest req) {
        ContactMessageEntity entity = new ContactMessageEntity();
        entity.setId("msg_" + UUID.randomUUID().toString().replace("-", "").substring(0, 10));
        entity.setEmail(req.email().trim());
        entity.setSubject(req.subject().trim());
        entity.setMessage(req.message().trim());
        entity.setStatus("OPEN");
        contactMessageRepository.save(entity);
        return toDto(entity);
    }

    @GetMapping("/admin/messages")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "List all customer support messages (ADMIN only)")
    public List<ContactMessageDto> listMessages() {
        return contactMessageRepository.findAllByOrderByCreatedAtDesc()
                .stream()
                .map(this::toDto)
                .toList();
    }

    @GetMapping("/admin/bugs")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Get current AutoTriage SUT bug injection flags (ADMIN only)")
    public Map<String, Boolean> getBugFlags() {
        return bugFlagsService.getFlags();
    }

    @PutMapping("/admin/bugs")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Toggle AutoTriage SUT bug injection flags at runtime without restart (ADMIN only)")
    public Map<String, Boolean> updateBugFlags(@RequestBody Map<String, Boolean> updates) {
        return bugFlagsService.updateFlags(updates);
    }

    @PostMapping("/admin/db/query")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Execute read-only SQL query for diagnostics & automated DB assertions (ADMIN only)")
    public List<Map<String, Object>> executeAdminDbQuery(@RequestBody Map<String, String> body) {
        String sql = body.get("sql");
        if (sql == null || sql.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "SQL statement required");
        }
        String trimmed = sql.trim().toUpperCase();
        if (!trimmed.startsWith("SELECT") && !trimmed.startsWith("EXPLAIN") && !trimmed.startsWith("SHOW") && !trimmed.startsWith("DESCRIBE")) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Only read-only queries (SELECT, EXPLAIN, SHOW, DESCRIBE) are permitted");
        }
        return jdbcTemplate.queryForList(sql);
    }

    @GetMapping("/admin/db/summary")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Inspect database table counts and metadata (ADMIN only)")
    public Map<String, Object> getDatabaseSummary() {
        Map<String, Object> summary = new HashMap<>();
        summary.put("users_count", jdbcTemplate.queryForObject("SELECT count(*) FROM users", Long.class));
        summary.put("products_count", jdbcTemplate.queryForObject("SELECT count(*) FROM products", Long.class));
        summary.put("orders_count", jdbcTemplate.queryForObject("SELECT count(*) FROM orders", Long.class));
        summary.put("order_items_count", jdbcTemplate.queryForObject("SELECT count(*) FROM order_items", Long.class));
        summary.put("cart_items_count", jdbcTemplate.queryForObject("SELECT count(*) FROM cart_items", Long.class));
        summary.put("contact_messages_count", jdbcTemplate.queryForObject("SELECT count(*) FROM contact_messages", Long.class));
        return summary;
    }

    private ContactMessageDto toDto(ContactMessageEntity e) {
        return new ContactMessageDto(
                e.getId(),
                e.getEmail(),
                e.getSubject(),
                e.getMessage(),
                e.getStatus(),
                e.getCreatedAt().getEpochSecond()
        );
    }
}
