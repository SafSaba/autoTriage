package com.autotriage.shop.config;

import com.autotriage.shop.domain.UserEntity;
import com.autotriage.shop.repository.UserRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
public class DataSeederConfig {

    @Bean
    public CommandLineRunner seedUsers(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        return args -> {
            seedUserIfMissing(userRepository, "usr_admin_01", "admin@autotriage.local",
                    passwordEncoder.encode("AdminPassword123!"), "ADMIN", "AutoTriage Admin",
                    "{\"name\":\"AutoTriage Admin\",\"line1\":\"100 Enterprise Way\",\"city\":\"Tampa\",\"state\":\"FL\",\"postal_code\":\"33602\",\"country\":\"United States\"}");
            seedUserIfMissing(userRepository, "usr_admin_02", "ops-lead@autotriage.local",
                    passwordEncoder.encode("AdminPassword123!"), "ADMIN", "Ops Lead",
                    "{\"name\":\"Ops Lead\",\"line1\":\"100 Enterprise Way\",\"city\":\"Tampa\",\"state\":\"FL\",\"postal_code\":\"33602\",\"country\":\"United States\"}");
            seedUserIfMissing(userRepository, "usr_buyer_01", "buyer@autotriage.local",
                    passwordEncoder.encode("BuyerPassword123!"), "USER", "Max Robinson",
                    "{\"name\":\"Max Robinson\",\"line1\":\"123 Main St\",\"line2\":\"Apt 4B\",\"city\":\"New York\",\"state\":\"NY\",\"postal_code\":\"10001\",\"country\":\"United States\"}");
            seedUserIfMissing(userRepository, "usr_buyer_02", "jane.doe@autotriage.local",
                    passwordEncoder.encode("BuyerPassword123!"), "USER", "Jane Doe", null);
        };
    }

    private void seedUserIfMissing(UserRepository repo, String id, String email, String hash,
                                   String role, String displayName, String shippingJson) {
        if (repo.findByEmailIgnoreCase(email).isEmpty()) {
            UserEntity u = new UserEntity();
            u.setId(id);
            u.setEmail(email.toLowerCase());
            u.setPasswordHash(hash);
            u.setRole(role);
            u.setDisplayName(displayName);
            u.setShippingAddressJson(shippingJson);
            repo.save(u);
        }
    }
}
