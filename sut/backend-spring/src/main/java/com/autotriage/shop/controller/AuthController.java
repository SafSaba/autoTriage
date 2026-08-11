package com.autotriage.shop.controller;

import com.autotriage.shop.domain.UserEntity;
import com.autotriage.shop.dto.ShopDtos.*;
import com.autotriage.shop.exception.ApiException;
import com.autotriage.shop.repository.UserRepository;
import com.autotriage.shop.security.AuthPrincipal;
import com.autotriage.shop.security.JwtService;
import com.autotriage.shop.service.DtoMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api")
@Tag(name = "1. Authentication & Profile", description = "JWT login, registration, password reset, and user profile endpoints")
public class AuthController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final DtoMapper mapper;

    public AuthController(UserRepository userRepository,
                          PasswordEncoder passwordEncoder,
                          JwtService jwtService,
                          DtoMapper mapper) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.mapper = mapper;
    }

    @PostMapping({"/auth/login", "/auth"})
    @Operation(summary = "Authenticate user and issue JWT", description = "Returns a Bearer JWT token and UserProfileDto. Seeded accounts: buyer@autotriage.local / BuyerPassword123! and admin@autotriage.local / AdminPassword123!")
    public AuthResponse login(@Valid @RequestBody LoginRequest req) {
        UserEntity user = userRepository.findByEmailIgnoreCase(req.email().trim())
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Invalid credentials"));

        if (!passwordEncoder.matches(req.password(), user.getPasswordHash())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }

        String token = jwtService.generateToken(user);
        return new AuthResponse(true, token, mapper.toUserProfileDto(user));
    }

    @PostMapping("/auth/signup")
    @Operation(summary = "Register a new customer account", description = "Creates a new user account with BCrypt-hashed password and returns a signed JWT.")
    public AuthResponse signup(@Valid @RequestBody SignupRequest req) {
        String email = req.email().trim().toLowerCase();
        if (userRepository.findByEmailIgnoreCase(email).isPresent()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "An account with this email already exists.");
        }

        UserEntity user = new UserEntity();
        user.setId("usr_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12));
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(req.password()));
        user.setRole(email.equals("admin@autotriage.local") ? "ADMIN" : "USER");

        String first = req.firstName() != null ? req.firstName().trim() : "";
        String last = req.lastName() != null ? req.lastName().trim() : "";
        String displayName = (first + " " + last).trim();
        user.setDisplayName(displayName.isEmpty() ? email.split("@")[0] : displayName);

        userRepository.save(user);
        String token = jwtService.generateToken(user);
        return new AuthResponse(true, token, mapper.toUserProfileDto(user));
    }

    @PostMapping("/auth/forgot-password")
    @Operation(summary = "Request password reset link")
    public Map<String, Object> forgotPassword(@RequestBody Map<String, String> body) {
        return Map.of("success", true, "message", "If an account exists for that email, a password reset link has been sent.");
    }

    @GetMapping("/me")
    @Operation(summary = "Get current authenticated user profile")
    public UserProfileDto getMe(@AuthenticationPrincipal AuthPrincipal principal) {
        if (principal == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Unauthorized: You must be logged in.");
        }
        UserEntity user = userRepository.findById(principal.uid())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found"));
        return mapper.toUserProfileDto(user);
    }

    @PutMapping("/me")
    @Operation(summary = "Update current user profile & default shipping address")
    public UserProfileDto updateMe(@AuthenticationPrincipal AuthPrincipal principal,
                                   @RequestBody UpdateProfileRequest req) {
        if (principal == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Unauthorized: You must be logged in.");
        }
        UserEntity user = userRepository.findById(principal.uid())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found"));

        if (req.displayName() != null && !req.displayName().isBlank()) {
            user.setDisplayName(req.displayName().trim());
        } else if (req.firstName() != null || req.lastName() != null) {
            String combined = ((req.firstName() != null ? req.firstName() : "") + " " +
                               (req.lastName() != null ? req.lastName() : "")).trim();
            if (!combined.isEmpty()) {
                user.setDisplayName(combined);
            }
        }

        if (req.phoneNumber() != null) {
            user.setPhoneNumber(req.phoneNumber().trim());
        }
        if (req.shippingAddress() != null) {
            user.setShippingAddressJson(mapper.toJson(req.shippingAddress()));
        }
        user.setUpdatedAt(Instant.now());
        userRepository.save(user);
        return mapper.toUserProfileDto(user);
    }
}
