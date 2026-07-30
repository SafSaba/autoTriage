package com.autotriage.shop.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
public class BugFlagsService {

    private final AtomicBoolean offByOneDiscount;
    private final AtomicBoolean staleCartCache;
    private final AtomicBoolean nullShippingNpe;

    public BugFlagsService(
            @Value("${BUG_OFF_BY_ONE_DISCOUNT:false}") boolean offByOneDiscount,
            @Value("${BUG_STALE_CART_CACHE:false}") boolean staleCartCache,
            @Value("${BUG_NULL_SHIPPING_NPE:false}") boolean nullShippingNpe
    ) {
        this.offByOneDiscount = new AtomicBoolean(offByOneDiscount);
        this.staleCartCache = new AtomicBoolean(staleCartCache);
        this.nullShippingNpe = new AtomicBoolean(nullShippingNpe);
    }

    public boolean isOffByOneDiscount() { return offByOneDiscount.get(); }
    public boolean isStaleCartCache() { return staleCartCache.get(); }
    public boolean isNullShippingNpe() { return nullShippingNpe.get(); }

    public Map<String, Boolean> getFlags() {
        return Map.of(
                "BUG_OFF_BY_ONE_DISCOUNT", offByOneDiscount.get(),
                "BUG_STALE_CART_CACHE", staleCartCache.get(),
                "BUG_NULL_SHIPPING_NPE", nullShippingNpe.get()
        );
    }

    public Map<String, Boolean> updateFlags(Map<String, Boolean> updates) {
        if (updates.containsKey("BUG_OFF_BY_ONE_DISCOUNT")) {
            offByOneDiscount.set(Boolean.TRUE.equals(updates.get("BUG_OFF_BY_ONE_DISCOUNT")));
        }
        if (updates.containsKey("BUG_STALE_CART_CACHE")) {
            staleCartCache.set(Boolean.TRUE.equals(updates.get("BUG_STALE_CART_CACHE")));
        }
        if (updates.containsKey("BUG_NULL_SHIPPING_NPE")) {
            nullShippingNpe.set(Boolean.TRUE.equals(updates.get("BUG_NULL_SHIPPING_NPE")));
        }
        return getFlags();
    }
}
