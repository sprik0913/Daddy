package com.sprik.home;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Saved settings: favorites, hidden apps, colors, automation, usage stats. */
final class Prefs {
    private final SharedPreferences sp;

    Prefs(Context c) {
        sp = c.getApplicationContext().getSharedPreferences("sprik", Context.MODE_PRIVATE);
    }

    // ---- favorites / hidden
    List<String> favorites() {
        String raw = sp.getString("favorites", "");
        List<String> out = new ArrayList<>();
        if (!raw.isEmpty()) out.addAll(Arrays.asList(raw.split(",")));
        return out;
    }

    void setFavorites(List<String> favs) {
        sp.edit().putString("favorites", String.join(",", favs)).putBoolean("initialized", true).apply();
    }

    boolean initialized() { return sp.getBoolean("initialized", false); }

    Set<String> hidden() { return new HashSet<>(sp.getStringSet("hidden", new HashSet<>())); }

    void setHidden(Set<String> h) { sp.edit().putStringSet("hidden", new HashSet<>(h)).apply(); }

    boolean showHidden() { return sp.getBoolean("showHidden", false); }

    void setShowHidden(boolean b) { sp.edit().putBoolean("showHidden", b).apply(); }

    // ---- look
    /** 0 = match focused app, 1 = time of day, 2+ = fixed palette. */
    int colorMode() { return sp.getInt("colorMode", 0); }

    void setColorMode(int m) { sp.edit().putInt("colorMode", m).apply(); }

    boolean motion() { return sp.getBoolean("motion", true); }

    void setMotion(boolean b) { sp.edit().putBoolean("motion", b).apply(); }

    // ---- automation
    boolean smartOrder() { return sp.getBoolean("smartOrder", true); }

    void setSmartOrder(boolean b) { sp.edit().putBoolean("smartOrder", b).apply(); }

    boolean autoClean() { return sp.getBoolean("autoClean", true); }

    void setAutoClean(boolean b) { sp.edit().putBoolean("autoClean", b).apply(); }

    boolean nightMode() { return sp.getBoolean("nightMode", true); }

    void setNightMode(boolean b) { sp.edit().putBoolean("nightMode", b).apply(); }

    /** Minutes idle on the home screen before the ambient clock shows. 0 = off. */
    int ambientMinutes() { return sp.getInt("ambientMin", 5); }

    void setAmbientMinutes(int m) { sp.edit().putInt("ambientMin", m).apply(); }

    /** App opened automatically after the TV turns on. Empty = none. */
    String startupApp() { return sp.getString("startupApp", ""); }

    void setStartupApp(String p) { sp.edit().putString("startupApp", p).apply(); }

    // ---- usage
    void recordLaunch(String pkg) {
        sp.edit().putInt("use_" + pkg, launches(pkg) + 1)
                .putLong("last_" + pkg, System.currentTimeMillis()).apply();
    }

    int launches(String pkg) { return sp.getInt("use_" + pkg, 0); }

    long lastUsed(String pkg) { return sp.getLong("last_" + pkg, 0); }

    // ---- home button
    boolean homeRedirect() { return sp.getBoolean("homeRedirect", true); }

    void setHomeRedirect(boolean b) { sp.edit().putBoolean("homeRedirect", b).apply(); }

    String lastStockScreen() { return sp.getString("lastStock", "(none yet)"); }

    void setLastStockScreen(String s) {
        if (!s.equals(sp.getString("lastStock", ""))) sp.edit().putString("lastStock", s).apply();
    }
}
