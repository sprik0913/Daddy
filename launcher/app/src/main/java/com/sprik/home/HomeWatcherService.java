package com.sprik.home;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityEvent;

/**
 * Fire OS won't let you pick a different home app, so this watches for Amazon's
 * home screen coming up and swaps Sprik Home in front of it.
 *
 * Some Amazon screens live inside the stock launcher (voice search results,
 * profile picker, quick settings). Those are left alone so they keep working.
 */
public class HomeWatcherService extends AccessibilityService {

    private static final String STOCK_LAUNCHER = "com.amazon.tv.launcher";
    private static final String[] LEAVE_ALONE = {
            "search", "profile", "settings", "quick", "dialog", "notification",
            "alexa", "voice", "recent", "detail", "player", "oobe", "setup", "login"
    };

    private long lastJump;

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

        long now = SystemClock.uptimeMillis();
        if (now - lastJump < 600) return;
        lastJump = now;

        Intent home = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                        | Intent.FLAG_ACTIVITY_NO_ANIMATION);
        startActivity(home);
    }

    @Override
    public void onInterrupt() { }
}
