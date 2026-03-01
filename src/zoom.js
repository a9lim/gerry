// ─── Zoom & Pan (shared-camera integration) ───
import { CONFIG, EASE_OUT } from './config.js';
import { state } from './state.js';

export let camera = null;
let _$ = null;
let _baseZoom = 1;

export function initCamera($) {
    _$ = $;
    const rect = $.svg.getBoundingClientRect();
    _baseZoom = rect.width / state.origViewBox.w;

    camera = createCamera({
        width: rect.width,
        height: rect.height,
        zoom: _baseZoom,
        minZoom: _baseZoom,
        maxZoom: _baseZoom * CONFIG.zoomMaxRatio,
        wheelFactor: CONFIG.zoomWheelFactor,
        x: state.viewBox.x + state.viewBox.w / 2,
        y: state.viewBox.y + state.viewBox.h / 2,
        clamp(cam) {
            const o = state.origViewBox;
            cam.x = clamp(cam.x, o.x, o.x + o.w);
            cam.y = clamp(cam.y, o.y, o.y + o.h);
        },
        onUpdate(cam) {
            const vb = cam.getViewBox();
            state.viewBox.x = vb.x;
            state.viewBox.y = vb.y;
            state.viewBox.w = vb.w;
            state.viewBox.h = vb.h;
            state.zoomLevel = cam.zoom / _baseZoom;
            $.svg.setAttribute('viewBox', cam.getViewBoxString());
        }
    });

    camera.bindWheel($.svg);

    camera.bindZoomButtons({
        zoomIn: $.zoomInBtn,
        zoomOut: $.zoomOutBtn,
        reset: $.zoomFitBtn,
        display: $.zoomLevel,
        duration: CONFIG.zoomAnimDuration,
        formatZoom: (z) => Math.round((z / _baseZoom) * 100) + '%',
        onReset: () => {
            let tx = state.origViewBox.x + state.origViewBox.w / 2;
            if (_$?.sidebar?.classList.contains('open') && window.innerWidth > 900) {
                const pw = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-w')) || 350;
                tx += pw / (2 * _baseZoom);
            }
            camera._animateTo(tx, state.origViewBox.y + state.origViewBox.h / 2, _baseZoom, CONFIG.zoomFitDuration, EASE_OUT);
        },
    });
}

export function resetCamera() {
    if (!camera || !_$) return;
    const rect = _$.svg.getBoundingClientRect();
    _baseZoom = rect.width / state.origViewBox.w;
    camera.viewportW = rect.width;
    camera.viewportH = rect.height;
    camera.minZoom = _baseZoom;
    camera.maxZoom = _baseZoom * CONFIG.zoomMaxRatio;
    camera.setFromViewBox(state.viewBox);
}

export function zoomToFit() {
    if (!camera) return;
    const o = state.origViewBox;
    let targetX = o.x + o.w / 2;
    let targetY = o.y + o.h / 2;
    if (_$?.sidebar?.classList.contains('open') && window.innerWidth > 900) {
        const panelW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-w')) || 350;
        targetX += panelW / (2 * _baseZoom);
    }
    camera._animateTo(targetX, targetY, _baseZoom, CONFIG.zoomFitDuration, EASE_OUT);
}

export function shiftForSidebar(opening) {
    if (!camera || window.innerWidth <= 900) return;
    const panelW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-w')) || 350;
    const dx = panelW / (2 * _baseZoom);
    const o = state.origViewBox;
    camera._animateTo(
        clamp(camera.x + (opening ? dx : -dx), o.x, o.x + o.w),
        camera.y, camera.zoom, 450, EASE_OUT
    );
}
