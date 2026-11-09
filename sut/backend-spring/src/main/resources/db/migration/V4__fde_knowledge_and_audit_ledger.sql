-- =========================================================================
-- V4: FDE Knowledge, Episodic Memory, Attack Run Auditing & Healing Ledger
-- =========================================================================

-- 1. FDE Attack Runs Ledger (Captures every break, prompt, user, latency, and blast radius)
CREATE TABLE IF NOT EXISTS fde_attack_runs (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL DEFAULT 'usr_sandbox_operator',
    attack_type VARCHAR(64) NOT NULL,
    prompt TEXT,
    http_status INTEGER NOT NULL DEFAULT 200,
    latency_ms BIGINT NOT NULL DEFAULT 0,
    dollar_loss NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    unfulfillable_units INTEGER NOT NULL DEFAULT 0,
    annual_projected_loss NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    execution_message TEXT,
    pre_state_json TEXT,
    post_state_json TEXT,
    delta_json TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fde_attack_runs_created ON fde_attack_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fde_attack_runs_user ON fde_attack_runs (user_id);
CREATE INDEX IF NOT EXISTS idx_fde_attack_runs_type ON fde_attack_runs (attack_type);

-- 2. FDE Healing Missions Ledger (Captures every self-heal, operator, MTTR, and recovery stats)
CREATE TABLE IF NOT EXISTS fde_healing_missions (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL DEFAULT 'usr_sandbox_operator',
    incident_type VARCHAR(64) NOT NULL,
    mttr_ms BIGINT NOT NULL DEFAULT 0,
    restored_entities_json TEXT,
    recovery_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fde_healing_missions_created ON fde_healing_missions (created_at DESC);

-- 3. FDE Episodic Memory Ledger (Captures learned root cause AST patches and Gherkin regressions)
CREATE TABLE IF NOT EXISTS fde_episodic_memories (
    id VARCHAR(64) PRIMARY KEY,
    user_story_id VARCHAR(32) NOT NULL,
    title VARCHAR(255) NOT NULL,
    attack_pattern TEXT NOT NULL,
    root_cause_file VARCHAR(255) NOT NULL,
    root_cause_method VARCHAR(255) NOT NULL,
    line_start INTEGER NOT NULL,
    line_end INTEGER NOT NULL,
    root_cause_explanation TEXT NOT NULL,
    ast_patch_diff TEXT NOT NULL,
    gherkin_regression TEXT NOT NULL,
    resolution_time_ms INTEGER NOT NULL DEFAULT 35,
    recall_count INTEGER NOT NULL DEFAULT 1,
    confidence_score NUMERIC(5, 4) NOT NULL DEFAULT 0.9500,
    last_recalled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fde_episodic_story ON fde_episodic_memories (user_story_id);

-- 4. FDE RAG Knowledge Chunks (Stores AST code slices and keyword vectors)
CREATE TABLE IF NOT EXISTS fde_rag_chunks (
    id VARCHAR(64) PRIMARY KEY,
    file_path VARCHAR(255) NOT NULL,
    class_name VARCHAR(128) NOT NULL,
    method_name VARCHAR(128) NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    code_snippet TEXT NOT NULL,
    vulnerability_type VARCHAR(64) NOT NULL,
    description TEXT NOT NULL,
    keywords_json TEXT NOT NULL,
    git_commit_sha VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed 6 Canonical Episodic Memories (idempotent with ON CONFLICT)
INSERT INTO fde_episodic_memories (
    id, user_story_id, title, attack_pattern, root_cause_file, root_cause_method,
    line_start, line_end, root_cause_explanation, ast_patch_diff, gherkin_regression,
    resolution_time_ms, recall_count, confidence_score
) VALUES
(
    'EPISODE-1001', 'US-1001', 'Price Injection & Catalog Floor Violation',
    'price tampering, buy laptop for $0.01, client-side discount manipulation, penny attack',
    'ProductController.java', 'updateProduct', 125, 145,
    'ProductController allows arbitrary price updates without assertPriceFloor(BigDecimal.ONE), enabling attackers to set prices to $0.01.',
    '--- a/ProductController.java\n+++ b/ProductController.java\n@@ -129,2 +129,5 @@\n+    if (req.price() < 1.00) {\n+        throw new ApiException(HttpStatus.BAD_REQUEST, "Product price must be at least $1.00");\n+    }\n     entity.setPrice(BigDecimal.valueOf(req.price()));',
    'Scenario: Reject catalog price updates below $1.00\n  Given a product prod_008 with price $2500.00\n  When an admin or attacker updates price to $0.01\n  Then the request is rejected with HTTP 400 Bad Request.',
    38, 34, 0.9700
),
(
    'EPISODE-1002', 'US-1002', 'Cart Negative Quantity Underflow & Stale Cache Locking',
    'negative cart quantity, cart underflow, -5 items, cart balance corruption, stale cart',
    'CartController.java', 'updateItemQuantity', 126, 157,
    'CartController skips database deletion when BUG_STALE_CART_CACHE is active, and fails to bound negative quantity delta updates.',
    '--- a/CartController.java\n+++ b/CartController.java\n@@ -137,3 +137,3 @@\n-    if (!bugFlagsService.isStaleCartCache()) {\n+    if (req.quantity() <= 0) {\n         cartItemRepository.deleteByUserIdAndProduct_Id(principal.uid(), productId);\n     }',
    'Scenario: Prevent negative quantities from entering shopping cart\n  Given an authenticated user cart with 1 unit of prod_001\n  When the quantity is updated to -5\n  Then the item is safely removed and cart subtotal remains non-negative.',
    41, 27, 0.9600
),
(
    'EPISODE-1003', 'US-1003', 'High-Concurrency Inventory Race Condition (TOCTOU)',
    'concurrency oversell, race condition, 10 parallel threads, inventory exhaustion, overselling',
    'OrderController.java', 'createOrder', 101, 116,
    'Non-atomic stock read followed by separate save permits Time-of-Check to Time-of-Use race conditions under concurrent checkout requests.',
    '--- a/OrderController.java\n+++ b/OrderController.java\n@@ -104,3 +104,4 @@\n-    if (product.getStock() < qty) {\n+    int updated = productRepository.decrementStockIfAvailable(product.getId(), qty);\n+    if (updated == 0) {\n         throw new ApiException(HttpStatus.CONFLICT, "Insufficient stock");',
    'Scenario: Prevent inventory oversell under concurrent checkout threads\n  Given product prod_004 has remaining stock 2\n  When 5 concurrent checkout threads execute simultaneously\n  Then exactly 2 checkouts succeed with HTTP 200 and 3 return HTTP 409 Conflict.',
    44, 42, 0.9500
),
(
    'EPISODE-1004', 'US-1004', 'Null Shipping Address Dereference (java.lang.NullPointerException)',
    'null shipping NPE, line2 trim, null pointer dereference, 500 internal error, addressLine2',
    'OrderController.java', 'createOrder', 66, 71,
    'Unchecked line2().trim() dereference in OrderController.java throws java.lang.NullPointerException when line2 is null or omitted.',
    '--- a/OrderController.java\n+++ b/OrderController.java\n@@ -67,3 +67,3 @@\n-    int unusedLength = req.shippingAddress().line2().trim().length();\n+    int unusedLength = req.shippingAddress().line2() != null ? req.shippingAddress().line2().trim().length() : 0;',
    'Scenario: Gracefully handle null address line2 during checkout\n  Given a checkout request where shippingAddress.line2 is omitted or null\n  When the order is placed\n  Then the order succeeds with HTTP 200 without throwing NullPointerException.',
    29, 58, 0.9900
),
(
    'EPISODE-1005', 'US-1005', 'Order Cancellation Restock Loop & Phantom Inventory Duplication',
    'cancellation restock loop, duplicate inventory, inflate stock, restock bug, phantom units',
    'OrderController.java', 'updateOrderStatus', 203, 226,
    'Updating order status to ''cancelled'' repeatedly restores stock without verifying an idempotency flag, multiplying inventory.',
    '--- a/OrderController.java\n+++ b/OrderController.java\n@@ -215,3 +215,3 @@\n-    if ("cancelled".equalsIgnoreCase(nextStatus) && !"cancelled".equalsIgnoreCase(prevStatus)) {\n+    if ("cancelled".equalsIgnoreCase(nextStatus) && !"cancelled".equalsIgnoreCase(prevStatus) && !order.isRestocked()) {\n+        order.setRestocked(true);',
    'Scenario: Enforce idempotent restock on order cancellation\n  Given an order with 5 units of prod_003\n  When status is updated to cancelled multiple times in succession\n  Then product stock is replenished exactly once.',
    33, 19, 0.9400
),
(
    'EPISODE-1006', 'US-1006', 'Diagnostic SQL Credential Exfiltration via Weak Read-Only Filter',
    'sql injection, sql smuggle, select password_hash from users, credential leak, diagnostic query',
    'ContactAndAdminOpsController.java', 'executeAdminDbQuery', 77, 91,
    'Admin diagnostic query filter only inspects statement prefixes (SELECT), allowing administrative users to query password hashes from the users table.',
    '--- a/ContactAndAdminOpsController.java\n+++ b/ContactAndAdminOpsController.java\n@@ -86,3 +86,4 @@\n+    if (trimmed.contains("FROM USERS") || trimmed.contains("PASSWORD_HASH")) {\n+        throw new ApiException(HttpStatus.FORBIDDEN, "Queries targeting credential tables are prohibited");\n+    }',
    'Scenario: Prevent diagnostic SQL from exfiltrating user credentials\n  Given an administrative diagnostic query targeting the users table\n  When POST /api/admin/db/query is submitted with SQL containing ''FROM users''\n  Then the request is rejected with HTTP 403 Forbidden.',
    30, 23, 0.9700
)
;
