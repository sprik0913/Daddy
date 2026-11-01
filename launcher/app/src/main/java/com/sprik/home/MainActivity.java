package com.sprik.home;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.AlertDialog;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
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
import android.text.format.DateUtils;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.OvershootInterpolator;
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
import java.util.Random;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Apple TV style home screen: a big "top shelf" preview of the focused app,
 * a glass dock of favorites, and a grid of every app over a drifting aurora
 * that takes on the focused app's colors. No ads, no network.
 */
public class MainActivity extends Activity {

    // ------------------------------------------------------------------ colors

    private static final String[] PALETTE_NAMES = {"Aurora", "Sunset", "Ocean", "Neon", "Mono"};
    private static final int[][] PALETTES = {
            {0xFF00E5FF, 0xFF7C4DFF, 0xFFFF4081, 0xFF05060F},
            {0xFFFF6B6B, 0xFFFFB347, 0xFFC850C0, 0xFF120509},
            {0xFF00B4DB, 0xFF0083B0, 0xFF3DDC84, 0xFF02101A},
            {0xFFF72585, 0xFF4CC9F0, 0xFF7209B7, 0xFF07020F},
            {0xFF8E9AAF, 0xFF4A5568, 0xFFCBD5E0, 0xFF08090B},
    };
    private static final int[] SUNRISE = {0xFFFFD166, 0xFFFF7EB3, 0xFF7AE7FF, 0xFF100A12};
    private static final int[] NIGHT = {0xFFB4532A, 0xFF5B2A86, 0xFF2A1B3D, 0xFF040306};

    private static final String[] STARTER_FAVORITES = {
            "com.netflix.ninja", "com.amazon.firetv.youtube", "com.google.android.youtube.tv",
            "com.amazon.amazonvideo.livingroom", "com.disney.disneyplus", "com.hulu.plus",
            "com.wbd.stream", "com.hbo.hbonow", "com.plexapp.android", "org.xbmc.kodi",
            "com.peacocktv.peacockandroid", "com.cbs.ott", "com.spotify.tv.android",
    };
    private static final String SETTINGS_TILE = "__settings";

    private static final class App {
        String pkg, label;
        Intent launch;
        Drawable banner, icon;
        int color = 0xFF5A6270;
        Bitmap blur;
    }

    // ------------------------------------------------------------------ state

    private final ExecutorService bg = Executors.newSingleThreadExecutor();
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final Map<String, App> apps = new LinkedHashMap<>();
    private String appsSignature = "";
    private App settingsApp;

    private Prefs prefs;
    private AuroraView aurora;
    private ImageView backdrop;
    private FrameLayout content;
    private View hero, topBar;
    private TextView heroTitle, heroSub, heroChip;
    private ImageView heroArt;
    private TextView heroArtLabel;
    private ScrollView scroll;
    private LinearLayout dockRow, grid;
    private TextView gridTitle;
    private FrameLayout ambient;
    private int heroHeight;

    private App focusedApp;
    private int lastDir; // last d-pad direction, for the tilt effect
    private String lastLaunched;
    private boolean receiverOn;

    private final Runnable goAmbient = this::showAmbient;
    private final Runnable moveAmbientClock = new Runnable() {
        @Override public void run() {
            if (ambient == null || ambient.getVisibility() != View.VISIBLE) return;
            Random r = new Random();
            View clock = ambient.getChildAt(0);
            clock.animate().translationX(dp(r.nextInt(161) - 80)).translationY(dp(r.nextInt(81) - 40))
                    .setDuration(4000).start();
            ui.postDelayed(this, 60_000);
        }
    };
    private final Runnable checkTimeColors = new Runnable() {
        @Override public void run() {
            applyColors(true);
            ui.postDelayed(this, 5 * 60_000);
        }
    };

    private final BroadcastReceiver packagesChanged = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) { reloadApps(); }
    };

    // ------------------------------------------------------------------ lifecycle

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        prefs = new Prefs(this);
        settingsApp = new App();
        settingsApp.pkg = SETTINGS_TILE;
        settingsApp.label = "Settings";
        settingsApp.color = 0xFF6B7280;

        buildScreen();
        aurora.setMotion(prefs.motion());
        applyColors(false);

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
        aurora.start();
        hideAmbient(false);
        resetIdleTimer();
        ui.post(checkTimeColors);
        if (lastLaunched != null) {
            autoClean(lastLaunched);
            lastLaunched = null;
            if (prefs.smartOrder()) render(); // usage changed, re-sort the dock
        }
        reloadApps();
    }

    @Override
    protected void onPause() {
        aurora.stop();
        ui.removeCallbacks(goAmbient);
        ui.removeCallbacks(checkTimeColors);
        super.onPause();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        hideAmbient(true);
        scroll.smoothScrollTo(0, 0);
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
        scroll.smoothScrollTo(0, 0);
        focusFirst();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        resetIdleTimer();
        if (ambient.getVisibility() == View.VISIBLE) {
            if (e.getAction() == KeyEvent.ACTION_UP) hideAmbient(true);
            return true; // swallow the key that wakes us up
        }
        if (e.getAction() == KeyEvent.ACTION_DOWN) {
            switch (e.getKeyCode()) {
                case KeyEvent.KEYCODE_DPAD_LEFT:
                case KeyEvent.KEYCODE_DPAD_RIGHT:
                case KeyEvent.KEYCODE_DPAD_UP:
                case KeyEvent.KEYCODE_DPAD_DOWN:
                    lastDir = e.getKeyCode();
                    break;
                case KeyEvent.KEYCODE_MENU:
                    View f = getCurrentFocus();
                    if (f == null || !(f.getTag() instanceof String)) { showLauncherMenu(); return true; }
                    break;
            }
        }
        return super.dispatchKeyEvent(e);
    }

    // ------------------------------------------------------------------ apps

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
        for (String cat : new String[]{Intent.CATEGORY_LEANBACK_LAUNCHER, Intent.CATEGORY_LAUNCHER}) {
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
                Drawable art = a.banner != null ? a.banner : a.icon;
                if (art != null) {
                    a.color = brandColor(art);
                    a.blur = tinyCopy(art, 48, 27);
                }
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

    private List<String> dockOrder() {
        List<String> favs = prefs.favorites();
        if (prefs.smartOrder()) {
            List<String> manual = new ArrayList<>(favs);
            Collections.sort(favs, (a, b) -> {
                int d = prefs.launches(b) - prefs.launches(a);
                return d != 0 ? d : manual.indexOf(a) - manual.indexOf(b);
            });
        }
        return favs;
    }

    // ------------------------------------------------------------------ layout

    private void buildScreen() {
        int screenH = getResources().getDisplayMetrics().heightPixels;
        heroHeight = (int) (screenH * 0.52f);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        aurora = new AuroraView(this);
        root.addView(aurora, match());

        // Blurred art of the focused app, washed over the aurora.
        backdrop = new ImageView(this);
        backdrop.setScaleType(ImageView.ScaleType.CENTER_CROP);
        backdrop.setAlpha(0f);
        root.addView(backdrop, match());

        // Darken the bottom so the grid always reads well.
        View shade = new View(this);
        shade.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{0x22000000, 0x33000000, 0xB0000000, 0xE6000000}));
        root.addView(shade, match());

        content = new FrameLayout(this);
        root.addView(content, match());

        hero = buildHero();
        content.addView(hero, new FrameLayout.LayoutParams(-1, heroHeight));

        // Top-right: clock and the "more" button.
        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        TextClock clock = new TextClock(this);
        clock.setFormat12Hour("h:mm");
        clock.setFormat24Hour("H:mm");
        clock.setTextSize(22);
        clock.setTextColor(Color.WHITE);
        clock.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        clock.setShadowLayer(dp(6), 0, 0, 0x66000000);
        top.addView(clock);
        TextView more = roundButton("•••");
        more.setOnClickListener(v -> showLauncherMenu());
        LinearLayout.LayoutParams mlp = new LinearLayout.LayoutParams(dp(44), dp(44));
        mlp.leftMargin = dp(16);
        top.addView(more, mlp);
        FrameLayout.LayoutParams tlp = new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.END);
        tlp.setMargins(0, dp(24), dp(48), 0);
        content.addView(top, tlp);
        topBar = top;

        // Scrolling part: spacer for the hero, glass dock, then the grid.
        scroll = new ScrollView(this);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setClipToPadding(false);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        scroll.setOnScrollChangeListener((v, x, y, ox, oy) -> {
            float f = Math.min(1f, y / (heroHeight * 0.6f));
            hero.setAlpha(1f - f);
            hero.setTranslationY(-y * 0.35f);
            topBar.setAlpha(Math.max(0f, 1f - y / (float) dp(60)));
            topBar.setVisibility(y > dp(60) ? View.INVISIBLE : View.VISIBLE);
        });

        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setClipChildren(false);
        col.setClipToPadding(false);
        col.setPadding(0, heroHeight, 0, dp(80));

        // Glass dock
        FrameLayout dock = new FrameLayout(this);
        dock.setClipChildren(false);
        dock.setClipToPadding(false);
        GradientDrawable glass = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{0x2EFFFFFF, 0x14FFFFFF});
        glass.setCornerRadius(dp(26));
        glass.setStroke(1, 0x33FFFFFF);
        View glassView = new View(this);
        glassView.setBackground(glass);
        FrameLayout.LayoutParams glp = new FrameLayout.LayoutParams(-1, -1);
        glp.setMargins(dp(36), dp(6), dp(36), dp(6));
        dock.addView(glassView, glp);

        HorizontalScrollView dockScroll = new HorizontalScrollView(this);
        dockScroll.setHorizontalScrollBarEnabled(false);
        dockScroll.setClipChildren(false);
        dockScroll.setClipToPadding(false);
        dockScroll.setPadding(dp(64), dp(22), dp(64), dp(4));
        dockRow = new LinearLayout(this);
        dockRow.setClipChildren(false);
        dockRow.setClipToPadding(false);
        dockScroll.addView(dockRow);
        dock.addView(dockScroll);
        col.addView(dock);

        gridTitle = new TextView(this);
        gridTitle.setTextSize(13);
        gridTitle.setLetterSpacing(0.12f);
        gridTitle.setTextColor(0x99FFFFFF);
        gridTitle.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        gridTitle.setPadding(dp(64), dp(30), 0, dp(14));
        col.addView(gridTitle);

        grid = new LinearLayout(this);
        grid.setOrientation(LinearLayout.VERTICAL);
        grid.setClipChildren(false);
        grid.setClipToPadding(false);
        grid.setPadding(dp(64), 0, dp(64), 0);
        col.addView(grid);

        scroll.addView(col);
        content.addView(scroll, match());

        ambient = buildAmbient();
        root.addView(ambient, match());

        setContentView(root);
    }

    private View buildHero() {
        FrameLayout h = new FrameLayout(this);
        h.setPadding(dp(64), dp(76), dp(64), dp(26));

        LinearLayout text = new LinearLayout(this);
        text.setOrientation(LinearLayout.VERTICAL);
        text.setGravity(Gravity.BOTTOM);

        heroChip = new TextView(this);
        heroChip.setTextSize(11);
        heroChip.setLetterSpacing(0.15f);
        heroChip.setTextColor(Color.WHITE);
        heroChip.setTypeface(Typeface.DEFAULT_BOLD);
        heroChip.setPadding(dp(10), dp(4), dp(10), dp(4));
        GradientDrawable chipBg = new GradientDrawable();
        chipBg.setCornerRadius(dp(10));
        chipBg.setColor(0x33FFFFFF);
        heroChip.setBackground(chipBg);
        LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(-2, -2);
        clp.bottomMargin = dp(10);
        text.addView(heroChip, clp);

        heroTitle = new TextView(this);
        heroTitle.setTextSize(46);
        heroTitle.setTextColor(Color.WHITE);
        heroTitle.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        heroTitle.setMaxLines(1);
        heroTitle.setEllipsize(TextUtils.TruncateAt.END);
        heroTitle.setShadowLayer(dp(12), 0, dp(2), 0x80000000);
        text.addView(heroTitle);

        heroSub = new TextView(this);
        heroSub.setTextSize(16);
        heroSub.setTextColor(0xCCFFFFFF);
        heroSub.setPadding(0, dp(6), 0, 0);
        heroSub.setShadowLayer(dp(8), 0, 0, 0x80000000);
        text.addView(heroSub);

        FrameLayout.LayoutParams tlp = new FrameLayout.LayoutParams(dp(470), -1, Gravity.START | Gravity.BOTTOM);
        h.addView(text, tlp);

        // Big artwork card on the right, like the Apple TV top shelf.
        FrameLayout art = new FrameLayout(this);
        GradientDrawable artBg = new GradientDrawable();
        artBg.setCornerRadius(dp(18));
        artBg.setColor(0xFF1C1C22);
        art.setBackground(artBg);
        art.setClipToOutline(true);
        art.setElevation(dp(24));
        heroArt = new ImageView(this);
        heroArt.setScaleType(ImageView.ScaleType.CENTER_CROP);
        art.addView(heroArt, match());
        heroArtLabel = new TextView(this);
        heroArtLabel.setTextColor(Color.WHITE);
        heroArtLabel.setTextSize(28);
        heroArtLabel.setTypeface(Typeface.DEFAULT_BOLD);
        heroArtLabel.setGravity(Gravity.CENTER);
        art.addView(heroArtLabel, match());
        View sheen = new View(this);
        sheen.setBackground(new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{0x30FFFFFF, 0x00FFFFFF, 0x00000000, 0x30000000}));
        art.addView(sheen, match());
        int artW = dp(312);
        FrameLayout.LayoutParams alp = new FrameLayout.LayoutParams(artW, artW * 9 / 16, Gravity.END | Gravity.BOTTOM);
        h.addView(art, alp);
        return h;
    }

    private FrameLayout buildAmbient() {
        FrameLayout a = new FrameLayout(this);
        a.setBackgroundColor(0x55000000);
        a.setVisibility(View.GONE);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        TextClock big = new TextClock(this);
        big.setFormat12Hour("h:mm");
        big.setFormat24Hour("H:mm");
        big.setTextSize(120);
        big.setTextColor(0xEEFFFFFF);
        big.setTypeface(Typeface.create("sans-serif-thin", Typeface.NORMAL));
        big.setGravity(Gravity.CENTER);
        TextClock date = new TextClock(this);
        date.setFormat12Hour("EEEE, MMMM d");
        date.setFormat24Hour("EEEE, MMMM d");
        date.setTextSize(22);
        date.setTextColor(0xAAFFFFFF);
        date.setGravity(Gravity.CENTER);
        box.addView(big);
        box.addView(date);
        a.addView(box, new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER));
        return a;
    }

    // ------------------------------------------------------------------ render

    private void render() {
        View focused = getCurrentFocus();
        String focusedPkg = focused != null && focused.getTag() instanceof String ? (String) focused.getTag() : null;

        int cols = 5;
        int usable = getResources().getDisplayMetrics().widthPixels - dp(64) * 2;
        int gap = dp(30);
        int tileW = (usable - gap * (cols - 1)) / cols;
        int tileH = tileW * 3 / 5; // Apple TV icon shape

        dockRow.removeAllViews();
        for (String p : dockOrder()) {
            App a = apps.get(p);
            if (a != null) addTile(dockRow, a, tileW, tileH, gap, true);
        }
        addTile(dockRow, settingsApp, tileW, tileH, gap, true);

        grid.removeAllViews();
        Set<String> hidden = prefs.hidden();
        boolean showHidden = prefs.showHidden();
        LinearLayout row = null;
        int i = 0, hiddenCount = 0;
        for (App a : apps.values()) {
            boolean isHidden = hidden.contains(a.pkg);
            if (isHidden) hiddenCount++;
            if (isHidden && !showHidden) continue;
            if (i % cols == 0) {
                row = new LinearLayout(this);
                row.setClipChildren(false);
                row.setClipToPadding(false);
                grid.addView(row);
            }
            View t = addTile(row, a, tileW, tileH, gap, false);
            if (isHidden) t.setAlpha(0.4f);
            i++;
        }
        gridTitle.setText(("ALL APPS  ·  " + i)
                + (hiddenCount > 0 && !showHidden ? "  ·  " + hiddenCount + " HIDDEN" : ""));

        if (focusedPkg != null) {
            View again = dockRow.findViewWithTag(focusedPkg);
            if (again == null) again = grid.findViewWithTag(focusedPkg);
            if (again != null) { again.requestFocus(); return; }
        }
        focusFirst();
    }

    private void focusFirst() {
        if (focusedApp == null && !apps.isEmpty()) {
            // Fill the top shelf right away, even before anything has focus.
            List<String> order = dockOrder();
            focusedApp = !order.isEmpty() && apps.containsKey(order.get(0)) ? apps.get(order.get(0))
                    : apps.values().iterator().next();
            ui.post(updateHero);
        }
        if (dockRow.getChildCount() > 0) {
            View cell = dockRow.getChildAt(0);
            View card = ((ViewGroup) cell).getChildAt(0);
            card.requestFocus();
        }
    }

    /** A tile: rounded artwork that lifts, tilts and shines when focused, name shown underneath. */
    private View addTile(LinearLayout parent, App a, int w, int h, int gap, boolean inDock) {
        LinearLayout cell = new LinearLayout(this);
        cell.setOrientation(LinearLayout.VERTICAL);
        cell.setClipChildren(false);
        cell.setClipToPadding(false);

        FrameLayout card = new FrameLayout(this);
        card.setTag(a.pkg);
        card.setFocusable(true);
        card.setClickable(true);
        card.setCameraDistance(dp(1200));
        GradientDrawable bgShape = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{lighten(a.color, 0.18f), darken(a.color, 0.45f)});
        bgShape.setCornerRadius(dp(14));
        card.setBackground(bgShape);
        card.setClipToOutline(true);
        card.setElevation(dp(4));

        if (a.banner != null) {
            ImageView img = new ImageView(this);
            img.setImageDrawable(a.banner);
            img.setScaleType(ImageView.ScaleType.CENTER_CROP);
            card.addView(img, match());
        } else if (a.icon != null) {
            ImageView img = new ImageView(this);
            img.setImageDrawable(a.icon);
            int s = (int) (h * 0.56f);
            card.addView(img, new FrameLayout.LayoutParams(s, s, Gravity.CENTER));
        } else {
            TextView glyph = new TextView(this);
            glyph.setText("⚙");
            glyph.setTextSize(34);
            glyph.setTextColor(Color.WHITE);
            glyph.setGravity(Gravity.CENTER);
            card.addView(glyph, match());
        }

        // Light sweep that runs across the tile when it gets focus.
        View glare = new View(this);
        glare.setBackground(new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,
                new int[]{0x00FFFFFF, 0x50FFFFFF, 0x00FFFFFF}));
        glare.setAlpha(0f);
        glare.setRotation(20f);
        card.addView(glare, new FrameLayout.LayoutParams(w / 2, h * 2, Gravity.CENTER_VERTICAL));

        // Thin bright rim when focused.
        GradientDrawable rim = new GradientDrawable();
        rim.setCornerRadius(dp(14));
        rim.setStroke(dp(2), 0x80FFFFFF);
        StateListDrawable fg = new StateListDrawable();
        fg.addState(new int[]{android.R.attr.state_focused}, rim);
        fg.addState(new int[]{}, new GradientDrawable());
        card.setForeground(fg);

        cell.addView(card, new LinearLayout.LayoutParams(w, h));

        TextView label = new TextView(this);
        label.setText(a.label);
        label.setTextSize(14);
        label.setTextColor(Color.WHITE);
        label.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        label.setGravity(Gravity.CENTER);
        label.setSingleLine(true);
        label.setEllipsize(TextUtils.TruncateAt.END);
        label.setAlpha(0f);
        label.setShadowLayer(dp(6), 0, 0, 0xCC000000);
        LinearLayout.LayoutParams llp = new LinearLayout.LayoutParams(w, -2);
        llp.topMargin = dp(14);
        cell.addView(label, llp);

        card.setOnFocusChangeListener((v, has) -> onTileFocus(card, glare, label, a, has, inDock, w));
        card.setOnClickListener(v -> launch(a));
        card.setOnLongClickListener(v -> { if (a != settingsApp) showAppMenu(a); return true; });
        card.setOnKeyListener((v, code, e) -> {
            if (code == KeyEvent.KEYCODE_MENU && e.getAction() == KeyEvent.ACTION_UP && a != settingsApp) {
                showAppMenu(a);
                return true;
            }
            return false;
        });

        LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(w, -2);
        cp.rightMargin = gap;
        cp.bottomMargin = inDock ? dp(4) : dp(10);
        parent.addView(cell, cp);
        return cell;
    }

    private void onTileFocus(View card, View glare, View label, App a, boolean has, boolean inDock, int w) {
        View row = (View) ((View) card.getParent()).getParent();
        if (has) {
            row.setTranslationZ(1f);
            float tiltY = lastDir == KeyEvent.KEYCODE_DPAD_RIGHT ? -9f : lastDir == KeyEvent.KEYCODE_DPAD_LEFT ? 9f : 0f;
            float tiltX = lastDir == KeyEvent.KEYCODE_DPAD_DOWN ? 7f : lastDir == KeyEvent.KEYCODE_DPAD_UP ? -7f : 0f;
            card.setRotationY(tiltY);
            card.setRotationX(tiltX);
            card.animate().scaleX(1.16f).scaleY(1.16f).rotationX(0).rotationY(0)
                    .translationZ(dp(22)).setInterpolator(new OvershootInterpolator(1.4f))
                    .setDuration(260).start();
            label.animate().alpha(1f).translationY(dp(6)).setDuration(180).start();
            if (prefs.motion()) {
                glare.setTranslationX(-w * 0.6f);
                glare.setAlpha(1f);
                glare.animate().translationX(w * 1.1f).setDuration(650)
                        .setInterpolator(new DecelerateInterpolator())
                        .withEndAction(() -> glare.setAlpha(0f)).start();
            }
            if (inDock && scroll.getScrollY() != 0) scroll.smoothScrollTo(0, 0);
            if (!inDock) {
                // Keep the name under the tile on screen too.
                View cell = (View) card.getParent();
                ui.post(() -> cell.requestRectangleOnScreen(
                        new android.graphics.Rect(0, 0, cell.getWidth(), cell.getHeight() + dp(48))));
            }
            focusedApp = a;
            ui.removeCallbacks(updateHero);
            ui.postDelayed(updateHero, 70);
        } else {
            row.setTranslationZ(0f);
            card.animate().scaleX(1f).scaleY(1f).rotationX(0).rotationY(0).translationZ(0)
                    .setInterpolator(new DecelerateInterpolator()).setDuration(180).start();
            label.animate().alpha(0f).translationY(0).setDuration(140).start();
            glare.animate().cancel();
            glare.setAlpha(0f);
        }
    }

    private final Runnable updateHero = () -> {
        App a = focusedApp;
        if (a == null) return;
        heroTitle.setText(a.label);

        boolean fav = prefs.favorites().contains(a.pkg);
        if (a == settingsApp) {
            heroChip.setText("FIRE TV");
            heroSub.setText("Network, display, apps and remotes");
        } else {
            heroChip.setText(fav ? "FAVORITE" : "APP");
            int n = prefs.launches(a.pkg);
            long last = prefs.lastUsed(a.pkg);
            if (n == 0) heroSub.setText("Press select to open  ·  ☰ for options");
            else heroSub.setText("Opened " + n + (n == 1 ? " time" : " times") + "  ·  last "
                    + DateUtils.getRelativeTimeSpanString(last, System.currentTimeMillis(),
                    DateUtils.MINUTE_IN_MILLIS).toString().toLowerCase());
        }

        if (a.banner != null) {
            heroArt.setImageDrawable(a.banner);
            heroArt.setScaleType(ImageView.ScaleType.CENTER_CROP);
            heroArt.setPadding(0, 0, 0, 0);
            heroArtLabel.setText("");
        } else if (a.icon != null) {
            heroArt.setImageDrawable(a.icon);
            heroArt.setScaleType(ImageView.ScaleType.FIT_CENTER);
            heroArt.setPadding(dp(96), dp(44), dp(96), dp(44));
            heroArtLabel.setText("");
        } else {
            heroArt.setImageDrawable(null);
            heroArtLabel.setText("⚙");
        }
        ((View) heroArt.getParent()).setBackground(roundGradient(a.color, dp(18)));

        View art = (View) heroArt.getParent();
        art.setAlpha(0.4f);
        art.setTranslationX(dp(24));
        art.animate().alpha(1f).translationX(0).setDuration(320)
                .setInterpolator(new DecelerateInterpolator()).start();

        if (a.blur != null) {
            backdrop.setImageBitmap(a.blur);
            backdrop.animate().alpha(0.38f).setDuration(500).start();
        } else {
            backdrop.animate().alpha(0f).setDuration(300).start();
        }
        applyColors(true);
    };

    // ------------------------------------------------------------------ colors & automation

    private boolean isNight() {
        int h = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
        return h >= 22 || h < 6;
    }

    private int[] currentPalette() {
        if (prefs.nightMode() && isNight()) return NIGHT;
        int mode = prefs.colorMode();
        if (mode >= 2) return PALETTES[(mode - 2) % PALETTES.length];
        if (mode == 0 && focusedApp != null && focusedApp != settingsApp) return paletteFrom(focusedApp.color);
        int h = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
        if (h >= 5 && h < 11) return SUNRISE;
        if (h >= 11 && h < 17) return PALETTES[2];
        return PALETTES[0];
    }

    private void applyColors(boolean animate) {
        int[] p = currentPalette();
        aurora.setColors(new int[]{p[0], p[1], p[2]}, p[3], animate);
        if (ambient.getVisibility() == View.VISIBLE) return;
        float dim = prefs.nightMode() && isNight() ? 0.82f : 1f;
        content.animate().alpha(dim).setDuration(600).start();
    }

    /** Builds a matching glow palette from one brand color. */
    private static int[] paletteFrom(int c) {
        float[] hsv = new float[3];
        Color.colorToHSV(c, hsv);
        float h = hsv[0];
        float s = Math.max(0.55f, hsv[1]);
        if (hsv[1] < 0.15f) { h = 220; s = 0.35f; } // grey/white logos get cool blue
        return new int[]{
                Color.HSVToColor(new float[]{h, s, 0.95f}),
                Color.HSVToColor(new float[]{(h + 40) % 360, s * 0.9f, 0.80f}),
                Color.HSVToColor(new float[]{(h + 300) % 360, s * 0.8f, 0.70f}),
                Color.HSVToColor(new float[]{h, 0.6f, 0.07f}),
        };
    }

    private void autoClean(String keep) {
        if (!prefs.autoClean()) return;
        List<String> pkgs = new ArrayList<>(apps.keySet());
        bg.execute(() -> {
            ActivityManager am = (ActivityManager) getSystemService(ACTIVITY_SERVICE);
            for (String p : pkgs) {
                if (p.equals(keep)) continue;
                try { am.killBackgroundProcesses(p); } catch (Exception ignored) { }
            }
        });
    }

    private void resetIdleTimer() {
        ui.removeCallbacks(goAmbient);
        int min = prefs.ambientMinutes();
        if (min > 0 && hasWindowFocus()) ui.postDelayed(goAmbient, min * 60_000L);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) resetIdleTimer(); else ui.removeCallbacks(goAmbient);
    }

    private void showAmbient() {
        if (ambient.getVisibility() == View.VISIBLE) return;
        ambient.setAlpha(0f);
        ambient.setVisibility(View.VISIBLE);
        ambient.animate().alpha(1f).setDuration(1200).start();
        content.animate().alpha(0f).setDuration(1200).start();
        backdrop.animate().alpha(0f).setDuration(1200).start();
        ui.postDelayed(moveAmbientClock, 60_000);
    }

    private void hideAmbient(boolean animate) {
        ui.removeCallbacks(moveAmbientClock);
        if (ambient.getVisibility() != View.VISIBLE) return;
        ambient.animate().alpha(0f).setDuration(animate ? 300 : 0)
                .withEndAction(() -> ambient.setVisibility(View.GONE)).start();
        ambient.setVisibility(View.GONE);
        applyColors(true);
        if (focusedApp != null && focusedApp.blur != null) backdrop.animate().alpha(0.38f).setDuration(400).start();
    }

    // ------------------------------------------------------------------ actions

    private void launch(App a) {
        if (a == settingsApp) { openFireSettings(); return; }
        prefs.recordLaunch(a.pkg);
        lastLaunched = a.pkg;
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
        safeStart(new Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    }

    private void showAppMenu(App a) {
        List<String> favs = prefs.favorites();
        Set<String> hidden = prefs.hidden();
        boolean isFav = favs.contains(a.pkg);
        boolean isHidden = hidden.contains(a.pkg);

        List<String> labels = new ArrayList<>();
        List<Runnable> actions = new ArrayList<>();

        labels.add(isFav ? "Remove from dock" : "Add to dock");
        actions.add(() -> {
            if (isFav) favs.remove(a.pkg); else favs.add(a.pkg);
            prefs.setFavorites(favs);
            render();
        });
        if (isFav && !prefs.smartOrder()) {
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
        labels.add(prefs.startupApp().equals(a.pkg) ? "Stop opening at start-up" : "Open when TV turns on");
        actions.add(() -> {
            boolean on = prefs.startupApp().equals(a.pkg);
            prefs.setStartupApp(on ? "" : a.pkg);
            toast(on ? "Start-up app cleared" : a.label + " will open when the TV turns on");
        });
        labels.add(isHidden ? "Unhide app" : "Hide from All Apps");
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

        list(a.label, labels, actions);
    }

    private void showLauncherMenu() {
        boolean serviceOn = homeServiceEnabled();
        List<String> labels = new ArrayList<>();
        List<Runnable> actions = new ArrayList<>();

        labels.add("Colors: " + colorModeName(prefs.colorMode()));
        actions.add(this::showColorMenu);

        labels.add("Motion effects: " + (prefs.motion() ? "On" : "Off"));
        actions.add(() -> {
            prefs.setMotion(!prefs.motion());
            aurora.setMotion(prefs.motion());
            aurora.start();
        });

        labels.add("Automation…");
        actions.add(this::showAutomationMenu);

        labels.add(prefs.showHidden() ? "Stop showing hidden apps" : "Show hidden apps");
        actions.add(() -> { prefs.setShowHidden(!prefs.showHidden()); render(); });

        String homeState = !serviceOn ? "not set up" : (prefs.homeRedirect() ? "On" : "Off");
        labels.add("Home button opens Sprik Home: " + homeState);
        actions.add(() -> {
            if (!serviceOn) { showHomeHelp(); return; }
            prefs.setHomeRedirect(!prefs.homeRedirect());
            toast(prefs.homeRedirect() ? "Home button opens Sprik Home" : "Home button opens Amazon home");
        });

        labels.add("Fire TV settings");
        actions.add(this::openFireSettings);

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

        labels.add("About");
        actions.add(() -> new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Sprik Home " + versionName())
                .setMessage("No ads. No tracking. No internet access.\n\n"
                        + "Apps: " + apps.size() + "\n"
                        + "Home-button helper: " + (serviceOn ? "enabled" : "NOT enabled") + "\n"
                        + "Last Amazon screen seen: " + prefs.lastStockScreen() + "\n\n"
                        + "Tip: press ☰ on any app to add it to the dock, hide it, or open it at start-up.")
                .setPositiveButton("OK", null).show());

        list("Sprik Home", labels, actions);
    }

    private String colorModeName(int m) {
        if (m == 0) return "Match the app";
        if (m == 1) return "Time of day";
        return PALETTE_NAMES[(m - 2) % PALETTE_NAMES.length];
    }

    private void showColorMenu() {
        List<String> labels = new ArrayList<>();
        List<Runnable> actions = new ArrayList<>();
        for (int m = 0; m < PALETTE_NAMES.length + 2; m++) {
            int mode = m;
            labels.add((prefs.colorMode() == m ? "●  " : "○  ") + colorModeName(m));
            actions.add(() -> { prefs.setColorMode(mode); applyColors(true); });
        }
        list("Colors", labels, actions);
    }

    private void showAutomationMenu() {
        List<String> labels = new ArrayList<>();
        List<Runnable> actions = new ArrayList<>();

        labels.add("Smart dock (most used first): " + onOff(prefs.smartOrder()));
        actions.add(() -> { prefs.setSmartOrder(!prefs.smartOrder()); render(); showAutomationMenu(); });

        labels.add("Free up memory when you come home: " + onOff(prefs.autoClean()));
        actions.add(() -> { prefs.setAutoClean(!prefs.autoClean()); showAutomationMenu(); });

        labels.add("Night mode 10 PM – 6 AM (warm, dimmer): " + onOff(prefs.nightMode()));
        actions.add(() -> { prefs.setNightMode(!prefs.nightMode()); applyColors(true); showAutomationMenu(); });

        int amb = prefs.ambientMinutes();
        labels.add("Ambient clock when idle: " + (amb == 0 ? "Off" : "after " + amb + " min"));
        actions.add(() -> {
            int[] steps = {0, 2, 5, 10, 20};
            int next = 0;
            for (int i = 0; i < steps.length; i++) if (steps[i] == amb) next = (i + 1) % steps.length;
            prefs.setAmbientMinutes(steps[next]);
            resetIdleTimer();
            showAutomationMenu();
        });

        App start = apps.get(prefs.startupApp());
        labels.add("Open at start-up: " + (start == null ? "Nothing" : start.label));
        actions.add(this::pickStartupApp);

        list("Automation", labels, actions);
    }

    private void pickStartupApp() {
        List<String> labels = new ArrayList<>();
        List<Runnable> actions = new ArrayList<>();
        labels.add("Nothing (just show Sprik Home)");
        actions.add(() -> { prefs.setStartupApp(""); showAutomationMenu(); });
        for (App a : apps.values()) {
            labels.add((prefs.startupApp().equals(a.pkg) ? "●  " : "") + a.label);
            actions.add(() -> { prefs.setStartupApp(a.pkg); showAutomationMenu(); });
        }
        list("Open when the TV turns on", labels, actions);
    }

    private void showHomeHelp() {
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Make the Home button open Sprik Home")
                .setMessage("Run the setup script from your computer again with the word \"home\", "
                        + "or run once:\n\nadb shell settings put secure enabled_accessibility_services "
                        + getPackageName() + "/" + HomeWatcherService.class.getName() + "\n"
                        + "adb shell settings put secure accessibility_enabled 1")
                .setPositiveButton("OK", null).show();
    }

    private boolean homeServiceEnabled() {
        String on = Settings.Secure.getString(getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        return on != null && on.contains(getPackageName() + "/");
    }

    // ------------------------------------------------------------------ helpers

    private void list(String title, List<String> labels, List<Runnable> actions) {
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle(title)
                .setItems(labels.toArray(new String[0]), (d, which) -> actions.get(which).run())
                .show();
    }

    private TextView roundButton(String s) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(13);
        t.setTextColor(Color.WHITE);
        t.setGravity(Gravity.CENTER);
        t.setFocusable(true);
        t.setClickable(true);
        GradientDrawable normal = new GradientDrawable();
        normal.setShape(GradientDrawable.OVAL);
        normal.setColor(0x33FFFFFF);
        GradientDrawable focused = new GradientDrawable();
        focused.setShape(GradientDrawable.OVAL);
        focused.setColor(0xEEFFFFFF);
        StateListDrawable sl = new StateListDrawable();
        sl.addState(new int[]{android.R.attr.state_focused}, focused);
        sl.addState(new int[]{}, normal);
        t.setBackground(sl);
        t.setOnFocusChangeListener((v, has) -> {
            t.setTextColor(has ? Color.BLACK : Color.WHITE);
            v.animate().scaleX(has ? 1.15f : 1f).scaleY(has ? 1.15f : 1f).setDuration(150).start();
        });
        return t;
    }

    private static GradientDrawable roundGradient(int c, int radius) {
        GradientDrawable g = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{lighten(c, 0.2f), darken(c, 0.5f)});
        g.setCornerRadius(radius);
        return g;
    }

    /** Most eye-catching color in an app's artwork. */
    private static int brandColor(Drawable d) {
        Bitmap b = tinyCopy(d, 24, 24);
        if (b == null) return 0xFF5A6270;
        float[] hsv = new float[3];
        double r = 0, g = 0, bl = 0, wSum = 0;
        for (int y = 0; y < b.getHeight(); y++) {
            for (int x = 0; x < b.getWidth(); x++) {
                int p = b.getPixel(x, y);
                if (Color.alpha(p) < 128) continue;
                Color.colorToHSV(p, hsv);
                double w = 0.05 + hsv[1] * hsv[1] * hsv[2];
                r += Color.red(p) * w; g += Color.green(p) * w; bl += Color.blue(p) * w; wSum += w;
            }
        }
        if (wSum == 0) return 0xFF5A6270;
        return Color.rgb((int) (r / wSum), (int) (g / wSum), (int) (bl / wSum));
    }

    /** Draws a drawable into a tiny bitmap; stretched later it becomes a soft blur. */
    private static Bitmap tinyCopy(Drawable d, int w, int h) {
        try {
            Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(b);
            Drawable copy = d.getConstantState() != null ? d.getConstantState().newDrawable().mutate() : d;
            copy.setBounds(0, 0, w, h);
            copy.draw(c);
            return b;
        } catch (Exception e) {
            return null;
        }
    }

    private static int lighten(int c, float f) { return AuroraView.mix(c, Color.WHITE, f); }

    private static int darken(int c, float f) { return AuroraView.mix(c, Color.BLACK, f); }

    private static String onOff(boolean b) { return b ? "On" : "Off"; }

    private static FrameLayout.LayoutParams match() { return new FrameLayout.LayoutParams(-1, -1); }

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
