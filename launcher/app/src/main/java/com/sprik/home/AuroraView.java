package com.sprik.home;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.RadialGradient;
import android.graphics.Rect;
import android.graphics.Shader;
import android.os.SystemClock;
import android.view.View;

/**
 * Slowly drifting glow of colors behind everything, like the Apple TV backdrop.
 * It draws into a tiny 96x54 bitmap and stretches it to full screen, so it is
 * naturally soft and very cheap for the Fire TV's GPU.
 */
public class AuroraView extends View {

    private static final int W = 96, H = 54;
    private static final long BLEND_MS = 900;
    private static final long FRAME_MS = 40; // ~25 fps is plenty for slow motion

    private final Bitmap small = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
    private final Canvas sc = new Canvas(small);
    private final Paint blob = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint up = new Paint(Paint.FILTER_BITMAP_FLAG | Paint.DITHER_FLAG);
    private final Rect dst = new Rect();

    private final int[] cur = {0xFF00E5FF, 0xFF7C4DFF, 0xFFFF4081};
    private final int[] from = new int[3];
    private final int[] to = new int[3];
    private int base = 0xFF05060F, baseFrom, baseTo;
    private long blendStart = -1;

    private boolean motion = true, running;
    private final long t0 = SystemClock.uptimeMillis();

    public AuroraView(Context c) {
        super(c);
        blob.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SCREEN));
    }

    /** colors: 3 glow colors; baseColor: the dark background under them. */
    public void setColors(int[] colors, int baseColor, boolean animate) {
        if (!animate) {
            System.arraycopy(colors, 0, cur, 0, 3);
            base = baseColor;
            blendStart = -1;
        } else {
            System.arraycopy(cur, 0, from, 0, 3);
            System.arraycopy(colors, 0, to, 0, 3);
            baseFrom = base;
            baseTo = baseColor;
            blendStart = SystemClock.uptimeMillis();
        }
        invalidate();
    }

    public void setMotion(boolean on) { motion = on; invalidate(); }

    public void start() { running = true; invalidate(); }

    public void stop() { running = false; }

    @Override
    protected void onDraw(Canvas canvas) {
        long now = SystemClock.uptimeMillis();
        if (blendStart >= 0) {
            float f = Math.min(1f, (now - blendStart) / (float) BLEND_MS);
            f = f * f * (3 - 2 * f); // ease in-out
            for (int i = 0; i < 3; i++) cur[i] = mix(from[i], to[i], f);
            base = mix(baseFrom, baseTo, f);
            if (f >= 1f) blendStart = -1;
        }

        float t = motion ? (now - t0) / 1000f : 0f;
        sc.drawColor(base, PorterDuff.Mode.SRC);
        drawBlob(cur[0], t, 0.11f, 0.07f, 0.0f, 1.3f, 0.62f);
        drawBlob(cur[1], t, 0.08f, 0.10f, 2.1f, 0.4f, 0.58f);
        drawBlob(cur[2], t, 0.06f, 0.09f, 4.2f, 2.6f, 0.50f);

        dst.set(0, 0, getWidth(), getHeight());
        canvas.drawBitmap(small, null, dst, up);

        if ((motion && running) || blendStart >= 0) postInvalidateDelayed(FRAME_MS);
    }

    private void drawBlob(int color, float t, float sx, float sy, float px, float py, float size) {
        float x = W * (0.15f + 0.7f * (0.5f + 0.5f * (float) Math.sin(t * sx + px)));
        float y = H * (0.10f + 0.6f * (0.5f + 0.5f * (float) Math.cos(t * sy + py)));
        float r = W * size;
        int inner = (color & 0x00FFFFFF) | 0xC0000000;
        blob.setShader(new RadialGradient(x, y, r, inner, color & 0x00FFFFFF, Shader.TileMode.CLAMP));
        sc.drawCircle(x, y, r, blob);
    }

    static int mix(int a, int b, float f) {
        int ar = Color.red(a), ag = Color.green(a), ab = Color.blue(a), aa = Color.alpha(a);
        return Color.argb(
                Math.round(aa + (Color.alpha(b) - aa) * f),
                Math.round(ar + (Color.red(b) - ar) * f),
                Math.round(ag + (Color.green(b) - ag) * f),
                Math.round(ab + (Color.blue(b) - ab) * f));
    }
}
