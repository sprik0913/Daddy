package com.sprik.home;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Small wrapper around saved settings: favorites, hidden apps, theme. */
final class Prefs {
    private final SharedPreferences sp;

    Prefs(Context c) {
        sp = c.getApplicationContext().getSharedPreferences("sprik", Context.MODE_PRIVATE);
    }

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

    int theme() { return sp.getInt("theme", 0); }

    void setTheme(int t) { sp.edit().putInt("theme", t).apply(); }

    boolean showHidden() { return sp.getBoolean("showHidden", false); }

    void setShowHidden(boolean b) { sp.edit().putBoolean("showHidden", b).apply(); }

    boolean homeRedirect() { return sp.getBoolean("homeRedirect", true); }

    void setHomeRedirect(boolean b) { sp.edit().putBoolean("homeRedirect", b).apply(); }

    String lastStockScreen() { return sp.getString("lastStock", "(none yet)"); }

    void setLastStockScreen(String s) {
        if (!s.equals(sp.getString("lastStock", ""))) sp.edit().putString("lastStock", s).apply();
    }
}
