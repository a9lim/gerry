// ─── Touch Handlers ───
import { state } from './state.js';
import { clampViewBox, updateZoomDisplay } from './zoom.js';
import { getHexFromPoint, handleHoverAt, clearHover, startPaintingAt, stopPainting } from './input.js';

export function initTouchHandlers($, { deleteDistrict, updateSidebarDetails, updateDistrictPalette, updateMetrics, pushUndoSnapshot }) {
    if (!$.svg || !$.mapContainer) return;

    let lastPinchDist = 0;
    let lastPinchCenter = null;
    let isTouchPainting = false;
    let isTouchPanning = false;
    let touchPanStart = null;
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
                const rect = $.svg.getBoundingClientRect();
                const dx = (touch.clientX - touchPanStart.x) / rect.width * state.viewBox.w;
                const dy = (touch.clientY - touchPanStart.y) / rect.height * state.viewBox.h;
                state.viewBox.x -= dx;
                state.viewBox.y -= dy;
                clampViewBox(state.viewBox);
                touchPanStart = { x: touch.clientX, y: touch.clientY };
                $.svg.setAttribute('viewBox', `${state.viewBox.x} ${state.viewBox.y} ${state.viewBox.w} ${state.viewBox.h}`);
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
                const scale = lastPinchDist / dist;
                const vb = state.viewBox;
                const rect = $.svg.getBoundingClientRect();

                const mx = (center.x - rect.left) / rect.width;
                const my = (center.y - rect.top) / rect.height;
                const svgX = vb.x + mx * vb.w;
                const svgY = vb.y + my * vb.h;

                const minW = state.origViewBox.w / 3;
                const maxW = state.origViewBox.w;
                const ratio = vb.h / vb.w;
                const newW = Math.max(minW, Math.min(maxW, vb.w * scale));
                if (newW !== vb.w) {
                    const newH = newW * ratio;
                    vb.x = svgX - mx * newW;
                    vb.y = svgY - my * newH;
                    vb.w = newW;
                    vb.h = newH;
                    state.zoomLevel = state.origViewBox.w / vb.w;
                }

                if (lastPinchCenter) {
                    vb.x += (lastPinchCenter.x - center.x) / rect.width * vb.w;
                    vb.y += (lastPinchCenter.y - center.y) / rect.height * vb.h;
                }

                clampViewBox(vb);
                $.svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
                updateZoomDisplay($);
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
