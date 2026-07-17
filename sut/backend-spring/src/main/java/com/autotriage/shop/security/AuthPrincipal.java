package com.autotriage.shop.security;

public record AuthPrincipal(String uid, String email, String role) {}
