package com.sprik.home;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextClock;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** The home screen: clock, favorites row and a grid of every app. No ads, no network. */
public class MainActivity extends Activity {

    // name, background top, background bottom, accent
    private static final String[][] THEMES = {
            {"Midnight", "#0B0B1A", "#1E1450", "#8B7CFF"},
            {"Ocean", "#04121C", "#06384F", "#2FD3FF"},
            {"Ember", "#140707", "#4A1410", "#FF8A3D"},
            {"Forest", "#050F0A", "#0F3A26", "#3DDC84"},
            {"Graphite", "#0A0A0A", "#262626", "#FFFFFF"},
    };

    // Picked as favorites the first time, if installed.
    private static final String[] STARTER_FAVORITES = {
            "com.netflix.ninja", "com.amazon.firetv.youtube", "com.google.android.youtube.tv",
            "com.amazon.amazonvideo.livingroom", "com.disney.disneyplus", "com.hulu.plus",
            "com.wbd.stream", "com.hbo.hbonow", "com.plexapp.android", "org.xbmc.kodi",
            "com.peacocktv.peacockandroid", "com.cbs.ott", "com.spotify.tv.android",
    };

    private static final class App {
        String pkg, label;
        Intent launch;
        Drawable banner, icon;
    }

    private final ExecutorService bg = Executors.newSingleThreadExecutor();
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final Map<String, App> apps = new LinkedHashMap<>();
    private String appsSignature = "";

    private Prefs prefs;
    private FrameLayout root;
    private ScrollView scroll;
    private LinearLayout favRow, grid;
    private TextView greeting, allTitle, favTitle;
    private int accent;
    private boolean receiverOn;

    private final BroadcastReceiver packagesChanged = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) { reloadApps(); }
    };

    // ---------------------------------------------------------------- lifecycle

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        prefs = new Prefs(this);
        buildScreen();
        applyTheme();

        IntentFilter f = new IntentFilter();
        f.addAction(Intent.ACTION_PACKAGE_ADDED);
        f.addAction(Intent.ACTION_PACKAGE_REMOVED);
        f.addAction(Intent.ACTION_PACKAGE_CHANGED);
        f.addAction(Intent.ACTION_PACKAGE_REPLACED);
        f.addDataScheme("package");
        registerReceiver(packagesChanged, f);
        receiverOn = true;

        reloadApps();
    }

    @Override
    protected void onResume() {
        super.onResume();
        greeting.setText(greetingText());
        reloadApps(); // cheap; only redraws if something changed
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Home pressed while already home: jump back to the top.
        if (scroll != null) scroll.smoothScrollTo(0, 0);
        focusFirst();
    }

    @Override
    protected void onDestroy() {
        if (receiverOn) unregisterReceiver(packagesChanged);
        bg.shutdownNow();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        // We are home. Back goes nowhere; just return to the top.
        if (scroll != null) scroll.smoothScrollTo(0, 0);
        focusFirst();
    }

    // ---------------------------------------------------------------- loading apps

    private void reloadApps() {
        bg.execute(() -> {
            Map<String, App> fresh = queryApps();
            String sig = TextUtils.join(",", fresh.keySet());
            ui.post(() -> {
                if (isFinishing()) return;
                if (sig.equals(appsSignature) && !apps.isEmpty()) return;
                appsSignature = sig;
                apps.clear();
                apps.putAll(fresh);
                seedFavoritesOnce();
                render();
            });
        });
    }

    private Map<String, App> queryApps() {
        PackageManager pm = getPackageManager();
        Map<String, App> found = new HashMap<>();
        String[] categories = {Intent.CATEGORY_LEANBACK_LAUNCHER, Intent.CATEGORY_LAUNCHER};
        for (String cat : categories) {
            Intent q = new Intent(Intent.ACTION_MAIN).addCategory(cat);
            for (ResolveInfo ri : pm.queryIntentActivities(q, 0)) {
                ActivityInfo ai = ri.activityInfo;
                if (ai == null || ai.packageName.equals(getPackageName())) continue;
                if (found.containsKey(ai.packageName)) continue; // TV entry wins
                App a = new App();
                a.pkg = ai.packageName;
                a.label = String.valueOf(ri.loadLabel(pm));
                a.launch = new Intent(Intent.ACTION_MAIN).addCategory(cat)
                        .setClassName(ai.packageName, ai.name)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
                try {
                    a.banner = ai.loadBanner(pm);
                    if (a.banner == null) a.banner = ai.applicationInfo.loadBanner(pm);
                } catch (Exception ignored) { }
                if (a.banner == null) a.icon = ri.loadIcon(pm);
                found.put(a.pkg, a);
            }
        }
        List<App> sorted = new ArrayList<>(found.values());
        Collections.sort(sorted, (x, y) -> x.label.compareToIgnoreCase(y.label));
        Map<String, App> out = new LinkedHashMap<>();
        for (App a : sorted) out.put(a.pkg, a);
        return out;
    }

    private void seedFavoritesOnce() {
        if (prefs.initialized()) return;
        List<String> favs = new ArrayList<>();
        for (String p : STARTER_FAVORITES) if (apps.containsKey(p) && favs.size() < 8) favs.add(p);
        prefs.setFavorites(favs);
    }

    // ---------------------------------------------------------------- building the screen

    private void buildScreen() {
        root = new FrameLayout(this);
        scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setClipToPadding(false);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setSmoothScrollingEnabled(true);

        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(56), dp(24), dp(56), dp(48));
        col.setClipChildren(false);
        col.setClipToPadding(false);

        // Header: clock + date on the left, settings button on the right.
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);

        LinearLayout clockBox = new LinearLayout(this);
        clockBox.setOrientation(LinearLayout.VERTICAL);
        TextClock clock = new TextClock(this);
        clock.setFormat12Hour("h:mm");
        clock.setFormat24Hour("H:mm");
        clock.setTextSize(54);
        clock.setTextColor(Color.WHITE);
        clock.setTypeface(Typeface.create("sans-serif-light", Typeface.NORMAL));
        clock.setIncludeFontPadding(false);
        TextClock date = new TextClock(this);
        date.setFormat12Hour("EEEE, MMMM d");
        date.setFormat24Hour("EEEE, MMMM d");
        date.setTextSize(18);
        date.setTextColor(0xCCFFFFFF);
        greeting = new TextView(this);
        greeting.setTextSize(15);
        greeting.setTextColor(0x99FFFFFF);
        greeting.setPadding(0, dp(2), 0, 0);
        clockBox.addView(clock);
        clockBox.addView(date);
        clockBox.addView(greeting);
        header.addView(clockBox, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));

        TextView gear = pill("⚙  Menu");
        gear.setOnClickListener(v -> showLauncherMenu());
        header.addView(gear);
        col.addView(header);

        favTitle = sectionTitle("Favorites");
        col.addView(favTitle);
        HorizontalScrollView favScroll = new HorizontalScrollView(this);
        favScroll.setHorizontalScrollBarEnabled(false);
        favScroll.setClipChildren(false);
        favScroll.setClipToPadding(false);
        favScroll.setPadding(dp(4), dp(10), dp(4), dp(10));
        favRow = new LinearLayout(this);
        favRow.setOrientation(LinearLayout.HORIZONTAL);
        favRow.setClipChildren(false);
        favRow.setClipToPadding(false);
        favScroll.addView(favRow);
        col.addView(favScroll);

        allTitle = sectionTitle("All apps");
        col.addView(allTitle);
        grid = new LinearLayout(this);
        grid.setOrientation(LinearLayout.VERTICAL);
        grid.setClipChildren(false);
        grid.setClipToPadding(false);
        grid.setPadding(dp(4), dp(6), dp(4), 0);
        col.addView(grid);

        scroll.addView(col);
        root.addView(scroll);
        setContentView(root);
    }

    private void render() {
        View focused = getCurrentFocus();
        String focusedPkg = focused != null && focused.getTag() instanceof String ? (String) focused.getTag() : null;

        int cardW = cardWidth();
        int cardH = cardW * 9 / 16;
        int gap = dp(16);

        // Favorites
        favRow.removeAllViews();
        List<String> favs = prefs.favorites();
        boolean anyFav = false;
        for (String p : favs) {
            App a = apps.get(p);
            if (a == null) continue;
            favRow.addView(card(a, cardW, cardH), cardParams(cardW, cardH, gap));
            anyFav = true;
        }
        favRow.addView(settingsCard(cardW, cardH), cardParams(cardW, cardH, gap));
        favTitle.setText(anyFav ? "Favorites" : "Favorites  ·  press ☰ on any app to pin it here");

        // All apps grid
        grid.removeAllViews();
        Set<String> hidden = prefs.hidden();
        boolean showHidden = prefs.showHidden();
        int cols = columns();
        LinearLayout row = null;
        int i = 0, shown = 0;
        for (App a : apps.values()) {
            boolean isHidden = hidden.contains(a.pkg);
            if (isHidden && !showHidden) continue;
            if (i % cols == 0) {
                row = new LinearLayout(this);
                row.setOrientation(LinearLayout.HORIZONTAL);
                row.setClipChildren(false);
                row.setClipToPadding(false);
                grid.addView(row);
            }
            View c = card(a, cardW, cardH);
            if (isHidden) c.setAlpha(0.45f);
            row.addView(c, cardParams(cardW, cardH, gap));
            i++;
            shown++;
        }
        int hiddenCount = 0;
        for (String h : hidden) if (apps.containsKey(h)) hiddenCount++;
        allTitle.setText("All apps  ·  " + shown + (hiddenCount > 0 && !showHidden ? "  (" + hiddenCount + " hidden)" : ""));

        // Put focus back where it was, or on the first tile.
        if (focusedPkg != null) {
            View again = favRow.findViewWithTag(focusedPkg);
            if (again == null) again = grid.findViewWithTag(focusedPkg);
            if (again != null) { again.requestFocus(); return; }
        }
        focusFirst();
    }

    private void focusFirst() {
        if (favRow != null && favRow.getChildCount() > 0) favRow.getChildAt(0).requestFocus();
    }

    // ---------------------------------------------------------------- tiles

    private View card(App a, int w, int h) {
        FrameLayout card = baseCard();
        card.setTag(a.pkg);
        if (a.banner != null) {
            ImageView img = new ImageView(this);
            img.setImageDrawable(a.banner);
            img.setScaleType(ImageView.ScaleType.CENTER_CROP);
            card.addView(img, new FrameLayout.LayoutParams(-1, -1));
        } else {
            LinearLayout box = new LinearLayout(this);
            box.setOrientation(LinearLayout.VERTICAL);
            box.setGravity(Gravity.CENTER);
            box.setPadding(dp(8), dp(6), dp(8), dp(6));
            ImageView img = new ImageView(this);
            img.setImageDrawable(a.icon);
            int s = Math.min(dp(52), h / 2);
            box.addView(img, new LinearLayout.LayoutParams(s, s));
            TextView t = new TextView(this);
            t.setText(a.label);
            t.setTextColor(Color.WHITE);
            t.setTextSize(13);
            t.setSingleLine(true);
            t.setEllipsize(TextUtils.TruncateAt.END);
            t.setGravity(Gravity.CENTER);
            t.setPadding(0, dp(6), 0, 0);
            box.addView(t);
            card.addView(box, new FrameLayout.LayoutParams(-1, -1));
        }
        card.setContentDescription(a.label);
        card.setOnClickListener(v -> launch(a));
        card.setOnLongClickListener(v -> { showAppMenu(a); return true; });
        card.setOnKeyListener((v, code, e) -> {
            if (code == KeyEvent.KEYCODE_MENU && e.getAction() == KeyEvent.ACTION_UP) {
                showAppMenu(a);
                return true;
            }
            return false;
        });
        return card;
    }

    private View settingsCard(int w, int h) {
        FrameLayout card = baseCard();
        card.setTag("__settings");
        TextView t = new TextView(this);
        t.setText("⚙\nSettings");
        t.setGravity(Gravity.CENTER);
        t.setTextColor(Color.WHITE);
        t.setTextSize(15);
        card.addView(t, new FrameLayout.LayoutParams(-1, -1));
        card.setOnClickListener(v -> openFireSettings());
        return card;
    }

    private FrameLayout baseCard() {
        FrameLayout card = new FrameLayout(this);
        card.setFocusable(true);
        card.setFocusableInTouchMode(false);
        card.setClickable(true);

        GradientDrawable bgShape = new GradientDrawable();
        bgShape.setCornerRadius(dp(12));
        bgShape.setColor(0x22FFFFFF);
        card.setBackground(bgShape);
        card.setClipToOutline(true);

        GradientDrawable ring = new GradientDrawable();
        ring.setCornerRadius(dp(12));
        ring.setColor(Color.TRANSPARENT);
        ring.setStroke(dp(3), accent);
        StateListDrawable fg = new StateListDrawable();
        fg.addState(new int[]{android.R.attr.state_focused}, ring);
        fg.addState(new int[]{}, new GradientDrawable());
        card.setForeground(fg);

        card.setOnFocusChangeListener((v, has) -> v.animate()
                .scaleX(has ? 1.10f : 1f).scaleY(has ? 1.10f : 1f)
                .translationZ(has ? dp(10) : 0)
                .setDuration(110).start());
        return card;
    }

    private LinearLayout.LayoutParams cardParams(int w, int h, int gap) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(w, h);
        lp.setMargins(0, 0, gap, gap);
        return lp;
    }

    private TextView sectionTitle(String s) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(17);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setLetterSpacing(0.04f);
        t.setPadding(dp(4), dp(28), 0, dp(4));
        return t;
    }

    private TextView pill(String s) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(15);
        t.setTextColor(Color.WHITE);
        t.setPadding(dp(18), dp(10), dp(18), dp(10));
        t.setFocusable(true);
        t.setClickable(true);
        GradientDrawable normal = new GradientDrawable();
        normal.setCornerRadius(dp(22));
        normal.setColor(0x22FFFFFF);
        GradientDrawable focused = new GradientDrawable();
        focused.setCornerRadius(dp(22));
        focused.setColor(0x44FFFFFF);
        focused.setStroke(dp(2), Color.WHITE);
        StateListDrawable sl = new StateListDrawable();
        sl.addState(new int[]{android.R.attr.state_focused}, focused);
        sl.addState(new int[]{}, normal);
        t.setBackground(sl);
        return t;
    }

    // ---------------------------------------------------------------- actions

    private void launch(App a) {
        try {
            startActivity(a.launch);
        } catch (Exception e) {
            Intent alt = getPackageManager().getLeanbackLaunchIntentForPackage(a.pkg);
            if (alt == null) alt = getPackageManager().getLaunchIntentForPackage(a.pkg);
            if (alt != null) {
                try { startActivity(alt.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return; } catch (Exception ignored) { }
            }
            toast("Couldn't open " + a.label);
        }
    }

    private void openFireSettings() {
        try {
            startActivity(new Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception e) {
            toast("Settings not available");
        }
    }

    private void showAppMenu(App a) {
        List<String> favs = prefs.favorites();
        Set<String> hidden = prefs.hidden();
        boolean isFav = favs.contains(a.pkg);
        boolean isHidden = hidden.contains(a.pkg);

        List<String> labels = new ArrayList<>();
        List<Runnable> actions = new ArrayList<>();

        labels.add(isFav ? "Remove from favorites" : "Add to favorites");
        actions.add(() -> {
            if (isFav) favs.remove(a.pkg); else favs.add(a.pkg);
            prefs.setFavorites(favs);
            render();
        });
        if (isFav) {
            int idx = favs.indexOf(a.pkg);
            if (idx > 0) {
                labels.add("Move left");
                actions.add(() -> { Collections.swap(favs, idx, idx - 1); prefs.setFavorites(favs); render(); });
            }
            if (idx < favs.size() - 1) {
                labels.add("Move right");
                actions.add(() -> { Collections.swap(favs, idx, idx + 1); prefs.setFavorites(favs); render(); });
            }
        }
        labels.add(isHidden ? "Unhide app" : "Hide from All apps");
        actions.add(() -> {
            if (isHidden) hidden.remove(a.pkg); else hidden.add(a.pkg);
            prefs.setHidden(hidden);
            render();
        });
        labels.add("App info (force stop, clear cache)");
        actions.add(() -> safeStart(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + a.pkg))));
        labels.add("Uninstall");
        actions.add(() -> safeStart(new Intent(Intent.ACTION_DELETE, Uri.parse("package:" + a.pkg))));

        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle(a.label)
                .setItems(labels.toArray(new String[0]), (d, which) -> actions.get(which).run())
                .show();
    }

    private void showLauncherMenu() {
        boolean serviceOn = homeServiceEnabled();
        List<String> labels = new ArrayList<>();
        List<Runnable> actions = new ArrayList<>();

        labels.add("Fire TV settings");
        actions.add(this::openFireSettings);

        labels.add("Theme: " + THEMES[prefs.theme() % THEMES.length][0] + "  →  next");
        actions.add(() -> {
            prefs.setTheme((prefs.theme() + 1) % THEMES.length);
            applyTheme();
            render();
        });

        labels.add(prefs.showHidden() ? "Stop showing hidden apps" : "Show hidden apps");
        actions.add(() -> { prefs.setShowHidden(!prefs.showHidden()); render(); });

        String homeState = !serviceOn ? "not set up" : (prefs.homeRedirect() ? "ON" : "OFF");
        labels.add("Home button → Sprik Home: " + homeState);
        actions.add(() -> {
            if (!serviceOn) { showHomeHelp(); return; }
            prefs.setHomeRedirect(!prefs.homeRedirect());
            toast(prefs.homeRedirect() ? "Home button opens Sprik Home" : "Home button opens Amazon home");
        });

        labels.add("Open Amazon home screen");
        actions.add(() -> {
            Intent i = getPackageManager().getLaunchIntentForPackage("com.amazon.tv.launcher");
            if (i == null) i = new Intent().setClassName("com.amazon.tv.launcher",
                    "com.amazon.tv.launcher.ui.HomeActivity_vNext");
            boolean was = prefs.homeRedirect();
            prefs.setHomeRedirect(false); // otherwise we'd bounce right back
            safeStart(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            if (was) ui.postDelayed(() -> prefs.setHomeRedirect(true), 4000);
        });

        labels.add("About / troubleshooting");
        actions.add(() -> new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Sprik Home " + versionName())
                .setMessage("No ads. No tracking. No internet access.\n\n"
                        + "Apps: " + apps.size() + "\n"
                        + "Home-button helper: " + (serviceOn ? "enabled" : "NOT enabled") + "\n"
                        + "Last Amazon screen seen: " + prefs.lastStockScreen() + "\n\n"
                        + "Tip: press ☰ (menu) on any app to pin, reorder, hide or uninstall it.")
                .setPositiveButton("OK", null).show());

        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Sprik Home")
                .setItems(labels.toArray(new String[0]), (d, which) -> actions.get(which).run())
                .show();
    }

    private void showHomeHelp() {
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Make the Home button open Sprik Home")
                .setMessage("Run the setup script from your computer again, or run this once:\n\n"
                        + "adb shell settings put secure enabled_accessibility_services "
                        + getPackageName() + "/" + HomeWatcherService.class.getName() + "\n"
                        + "adb shell settings put secure accessibility_enabled 1")
                .setPositiveButton("OK", null).show();
    }

    private boolean homeServiceEnabled() {
        String on = Settings.Secure.getString(getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        return on != null && on.contains(getPackageName() + "/");
    }

    // ---------------------------------------------------------------- look

    private void applyTheme() {
        String[] t = THEMES[prefs.theme() % THEMES.length];
        accent = Color.parseColor(t[3]);
        GradientDrawable bgGrad = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{Color.parseColor(t[1]), Color.parseColor(t[2]), Color.parseColor(t[1])});
        root.setBackground(bgGrad);
        favTitle.setTextColor(accent);
        allTitle.setTextColor(accent);
    }

    private int columns() {
        float wDp = getResources().getDisplayMetrics().widthPixels / getResources().getDisplayMetrics().density;
        return wDp >= 900 ? 5 : 4;
    }

    private int cardWidth() {
        int screen = getResources().getDisplayMetrics().widthPixels;
        int usable = screen - dp(56) * 2 - dp(8);
        int cols = columns();
        return (usable - dp(16) * cols) / cols;
    }

    private String greetingText() {
        int h = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
        if (h < 5) return "Good night, Sprik family";
        if (h < 12) return "Good morning, Sprik family";
        if (h < 17) return "Good afternoon, Sprik family";
        if (h < 22) return "Good evening, Sprik family";
        return "Good night, Sprik family";
    }

    // ---------------------------------------------------------------- helpers

    private void safeStart(Intent i) {
        try { startActivity(i); } catch (Exception e) { toast("Not available on this device"); }
    }

    private String versionName() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; }
        catch (Exception e) { return ""; }
    }

    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_SHORT).show(); }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }
}
