// UI presentation only. The markup lives in index.html, the styling in style.css.
import {TEAM_COLORS} from './model.js?v=10';

const $ = id => document.getElementById(id);
const px = value => `${value}px`;
const timeLabel = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const clone = id => $(id).content.firstElementChild.cloneNode(true);
const field = (root, name) => root.querySelector(`[data-field="${name}"]`);
function text(root, name, value) {
    const node = field(root, name);
    if (node && node.textContent !== String(value)) node.textContent = String(value);
}
function progress(root, value, width) {
    const node = field(root, 'progress');
    if (!node) return;
    node.hidden = value <= 0;
    node.style.width = width(value);
}
function setTeam(node, owner) {
    node.style.setProperty('--team', TEAM_COLORS[owner]);
}
function position(node, x, z) {
    node.style.left = px(x);
    node.style.top = px(z);
}

export function drawSelected(model, point) {
    const details = $('selected-details');
    $('selected-empty').hidden = !!point;
    details.hidden = !point;
    if (!point) return;
    const level = model.level(point);
    const owner = point.owner ? model.factions[point.owner].name : '中立';
    setTeam(details, point.owner);
    text(details, 'name', point.name);
    text(details, 'level', `Lv.${point.level}`);
    text(details, 'ownerKind', `${owner} / ${point.kind === 'melee' ? 'Melee' : 'Range'}`);
    text(details, 'garrison', `${point.garrison} / ${point.capacity}`);
    text(details, 'production', point.owner ? `${level.productionCount} / ${level.productionInterval}s` : '—');
    text(details, 'combat', `${level.attack} / ${level.maxHP}`);
    text(details, 'target', point.target >= 0 ? model.points[point.target].name : '駐守');
    text(details, 'incoming', point.incoming);
    text(details, 'progress', `${Math.round(point.progress * 100)}%`);
}

export function drawLog(events) {
    const fragment = document.createDocumentFragment();
    for (const entry of events.slice(-18).reverse()) {
        const node = clone('log-template');
        text(node, 'time', timeLabel(entry.time));
        text(node, 'message', entry.msg);
        fragment.append(node);
    }
    $('log').replaceChildren(fragment);
}

let markerModel = null;
let markerNodes = [];
export function drawMarkers(model, renderer, selected, assigning) {
    const root = $('markers');
    if (markerModel !== model) {
        markerNodes = model.points.map(p => {
            const node = clone('marker-template');
            node.dataset.point = p.i;
            return node;
        });
        root.replaceChildren(...markerNodes);
        markerModel = model;
    }
    const rect = renderer.canvas.getBoundingClientRect();
    const hudBottom = document.querySelector('.hud').getBoundingClientRect().bottom - rect.top;
    for (const point of model.points) {
        const node = markerNodes[point.i];
        const v = renderer.project(point.x, point.z, 2.65);
        const visible = v.x > -35 && v.x < rect.width + 35 && v.y > -15 && v.y < rect.height + 35;
        node.hidden = !visible;
        if (!visible) continue;
        setTeam(node, point.owner);
        node.classList.toggle('selected', point.i === selected);
        node.classList.toggle('armed', assigning && point.i === selected);
        text(node, 'title', `${point.id} · ${point.kind === 'melee' ? 'M' : 'R'} Lv.${point.level}`);
        text(node, 'garrison', `${point.garrison}/${point.capacity}${point.target >= 0 ? ' → ' + model.points[point.target].id : ''}`);
        progress(node, point.progress, v => `${v * 100}%`);
        // A closer view can project the label into the top HUD even when the
        // building itself is on the playable canvas. Keep such labels tappable.
        let y = v.y;
        if (y < hudBottom + 48) {
            const ground = renderer.project(point.x, point.z, 0);
            if (ground.y > hudBottom && ground.y < rect.height) {
                y = Math.max(y, hudBottom + node.offsetHeight + 3);
            }
        }
        position(node, v.x, y);
    }
}
