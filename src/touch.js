// Touch input: single-finger paint/pan, two-finger pinch-zoom with pan.
import { state } from './state.js';
import { camera } from './zoom.js';
import { getHexFromPoint, handleHoverAt, clearHover, startPaintingAt, stopPainting } from './input.js';

export function initTouchHandlers($, { deleteDistrict, updateSidebarDetails, updateDistrictPalette, updateMetrics, pushUndoSnapshot }) {
    if (!$.svg || !$.mapContainer) return;

    let lastPinchDist = 0;
    let lastPinchCenter = null;
    let isTouchPainting = false;
    let isTouchPanning = false;
    let touchPanStart = null;
    // Suppresses the first single-touch after a pinch ends, preventing
    // accidental paint when the second finger lifts slightly before the first.
    let wasMultiTouch = false;

    $.mapContainer.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];

            if (wasMultiTouch) {
                wasMultiTouch = false;
                return;
            }

            if (state.panMode) {
                isTouchPanning = true;
                touchPanStart = { x: touch.clientX, y: touch.clientY };
                $.mapContainer.classList.add('panning');
                return;
            }

            const qr = getHexFromPoint(touch.clientX, touch.clientY, $);
            if (qr) {
                isTouchPainting = startPaintingAt(qr, state.eraseMode, deleteDistrict, updateSidebarDetails, updateDistrictPalette);
            }
        } else if (e.touches.length === 2) {
            e.preventDefault();
            // Transition from single-touch to pinch: end any active paint stroke.
            if (isTouchPainting) {
                isTouchPainting = false;
                stopPainting(updateMetrics, pushUndoSnapshot);
            }
            if (isTouchPanning) {
                isTouchPanning = false;
                $.mapContainer.classList.remove('panning');
            }
            wasMultiTouch = true;
            const [t1, t2] = [e.touches[0], e.touches[1]];
            lastPinchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
            lastPinchCenter = {
                x: (t1.clientX + t2.clientX) / 2,
                y: (t1.clientY + t2.clientY) / 2
            };
        }
    }, { passive: false });

    $.mapContainer.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];

            if (isTouchPanning) {
                camera.panBy(touch.clientX - touchPanStart.x, touch.clientY - touchPanStart.y);
                touchPanStart = { x: touch.clientX, y: touch.clientY };
                return;
            }

            if (isTouchPainting) {
                const qr = getHexFromPoint(touch.clientX, touch.clientY, $);
                if (qr) handleHoverAt(qr, $, updateSidebarDetails);
            }
        } else if (e.touches.length === 2) {
            e.preventDefault();
            const [t1, t2] = [e.touches[0], e.touches[1]];
            const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
            const center = {
                x: (t1.clientX + t2.clientX) / 2,
                y: (t1.clientY + t2.clientY) / 2
            };

            if (lastPinchDist > 0) {
                // Zoom around the midpoint between the two touches.
                const rect = $.svg.getBoundingClientRect();
                const cx = center.x - rect.left;
                const cy = center.y - rect.top;
                camera.zoomBy(dist / lastPinchDist, cx, cy);
                if (lastPinchCenter) {
                    camera.panBy(center.x - lastPinchCenter.x, center.y - lastPinchCenter.y);
                }
            }

            lastPinchDist = dist;
            lastPinchCenter = center;
        }
    }, { passive: false });

    $.mapContainer.addEventListener('touchend', (e) => {
        if (e.touches.length === 0) {
            if (isTouchPainting) {
                isTouchPainting = false;
                stopPainting(updateMetrics, pushUndoSnapshot);
            }
            if (isTouchPanning) {
                isTouchPanning = false;
                $.mapContainer.classList.remove('panning');
            }
            clearHover($);
            lastPinchDist = 0;
            lastPinchCenter = null;
        } else if (e.touches.length === 1) {
            lastPinchDist = 0;
            lastPinchCenter = null;
        }
    });

    $.mapContainer.addEventListener('touchcancel', () => {
        isTouchPainting = false;
        isTouchPanning = false;
        lastPinchDist = 0;
        lastPinchCenter = null;
        touchPanStart = null;
        $.mapContainer.classList.remove('panning');
        stopPainting(updateMetrics, pushUndoSnapshot);
    });
}
