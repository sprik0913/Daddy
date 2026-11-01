package com.sprik.home;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.ViewConfiguration;
import android.view.accessibility.AccessibilityEvent;

/**
 * Fire OS won't let you pick a different home app, so this watches for Amazon's
 * home screen coming up and swaps Sprik Home in front of it.
 *
 * It also runs the "start-up app" automation: right after the TV boots, it
 * opens the app chosen in Sprik Home's Automation menu.
 */
public class HomeWatcherService extends AccessibilityService {

    private static final String STOCK_LAUNCHER = "com.amazon.tv.launcher";
    private static final String[] LEAVE_ALONE = {
            "search", "profile", "settings", "quick", "dialog", "notification",
            "alexa", "voice", "recent", "detail", "player", "oobe", "setup", "login"
    };
    private static final long FRESH_BOOT_MS = 4 * 60 * 1000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private long lastJump;
    private boolean startupPending;

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        Prefs prefs = new Prefs(this);
        if (SystemClock.elapsedRealtime() < FRESH_BOOT_MS && !prefs.startupApp().isEmpty()) {
            startupPending = true;
            // If Amazon's home never shows up, launch it anyway after a while.
            handler.postDelayed(this::runStartupApp, 15000);
        }
    }

    /**
     * The Home key itself. Watching for Amazon's screen alone misses one case: when
     * Amazon's home is already showing (e.g. right after boot), pressing Home again
     * changes no window, so nothing would fire. A short press opens Sprik Home a
     * moment after the system handles the key; a long press (Amazon's quick menu)
     * is left alone. The key is never swallowed.
     */
    @Override
    protected boolean onKeyEvent(KeyEvent e) {
        if (e.getKeyCode() == KeyEvent.KEYCODE_HOME && e.getAction() == KeyEvent.ACTION_UP
                && !e.isCanceled()
                && e.getEventTime() - e.getDownTime() < ViewConfiguration.getLongPressTimeout()
                && new Prefs(this).homeRedirect()) {
            handler.postDelayed(this::openHome, 250);
        }
        return false;
    }

    private void openHome() {
        long now = SystemClock.uptimeMillis();
        if (now - lastJump < 400) return;
        lastJump = now;
        startActivity(new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                        | Intent.FLAG_ACTIVITY_NO_ANIMATION));
        if (startupPending) handler.postDelayed(this::runStartupApp, 1200);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent e) {
        if (e == null || e.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        if (e.getPackageName() == null || !STOCK_LAUNCHER.contentEquals(e.getPackageName())) return;

        String cls = e.getClassName() == null ? "" : e.getClassName().toString();
        Prefs prefs = new Prefs(this);
        prefs.setLastStockScreen(cls);
        if (!prefs.homeRedirect()) return;
        if (!cls.startsWith("com.amazon")) return; // views/popups, not a full screen

        String lower = cls.toLowerCase();
        for (String word : LEAVE_ALONE) if (lower.contains(word)) return;

        openHome();
    }

    private void runStartupApp() {
        if (!startupPending) return;
        startupPending = false;
        String pkg = new Prefs(this).startupApp();
        if (pkg.isEmpty()) return;
        Intent i = getPackageManager().getLeanbackLaunchIntentForPackage(pkg);
        if (i == null) i = getPackageManager().getLaunchIntentForPackage(pkg);
        if (i == null) return;
        try {
            startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            new Prefs(this).recordLaunch(pkg);
        } catch (Exception ignored) { }
    }

    @Override
    public void onInterrupt() { }
}
