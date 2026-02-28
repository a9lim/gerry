// ─── Zoom & Pan ───
import { EASE_OUT } from './config.js';
import { state } from './state.js';

export function clampViewBox(vb) {
    const o = state.origViewBox;
    const padX = vb.w * 0.5;
    const padY = vb.h * 0.5;
    vb.x = Math.max(o.x - padX, Math.min(o.x + o.w - vb.w + padX, vb.x));
    vb.y = Math.max(o.y - padY, Math.min(o.y + o.h - vb.h + padY, vb.y));
}

export function updateZoomDisplay($) {
    if ($.zoomLevel) $.zoomLevel.textContent = `${Math.round(state.zoomLevel * 100)}%`;
}

export function animateViewBox(startVb, endVb, duration, $, easeFn = EASE_OUT) {
    const vb = state.viewBox;
    let start = null;

    function step(ts) {
        if (!start) start = ts;
        const t = Math.min((ts - start) / duration, 1);
        const ease = easeFn(t);

        vb.x = startVb.x + (endVb.x - startVb.x) * ease;
        vb.y = startVb.y + (endVb.y - startVb.y) * ease;
        vb.w = startVb.w + (endVb.w - startVb.w) * ease;
        vb.h = startVb.h + (endVb.h - startVb.h) * ease;
        clampViewBox(vb);
        state.zoomLevel = state.origViewBox.w / vb.w;

        $.svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
        updateZoomDisplay($);

        if (t < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
}

export function onWheel(e, $) {
    e.preventDefault();
    const vb = state.viewBox;
    const rect = $.svg.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top) / rect.height;
    const svgX = vb.x + mx * vb.w;
    const svgY = vb.y + my * vb.h;

    const zoomFactor = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    const minW = state.origViewBox.w / 3;
    const maxW = state.origViewBox.w;
    const ratio = vb.h / vb.w;
    const newW = Math.max(minW, Math.min(maxW, vb.w * zoomFactor));
    if (newW === vb.w) return;
    const newH = newW * ratio;

    vb.x = svgX - mx * newW;
    vb.y = svgY - my * newH;
    vb.w = newW;
    vb.h = newH;
    clampViewBox(vb);
    state.zoomLevel = state.origViewBox.w / vb.w;

    $.svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    updateZoomDisplay($);
}

export function smoothZoom(direction, $) {
    const vb = state.viewBox;
    const cx = vb.x + vb.w / 2;
    const cy = vb.y + vb.h / 2;

    const factor = direction > 0 ? 1 / 1.25 : 1.25;
    const minW = state.origViewBox.w / 3;
    const maxW = state.origViewBox.w;
    const ratio = vb.h / vb.w;
    const targetW = Math.max(minW, Math.min(maxW, vb.w * factor));
    if (targetW === vb.w) return;
    const targetH = targetW * ratio;

    const startVb = { ...vb };
    const endVb = { x: cx - targetW / 2, y: cy - targetH / 2, w: targetW, h: targetH };
    animateViewBox(startVb, endVb, 200, $);
}

export function zoomToFit($) {
    const endVb = { ...state.origViewBox };
    if ($.sidebar?.classList.contains('open') && window.innerWidth > 900) {
        const scale = Math.min(window.innerWidth / endVb.w, window.innerHeight / endVb.h);
        endVb.x += 350 / (2 * scale);
    }
    animateViewBox({ ...state.viewBox }, endVb, 300, $);
}
