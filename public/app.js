(() => {
  "use strict";

  const STORAGE_KEY = "mindflow-map-v1";
  const NODE_WIDTH = 184;
  const NODE_HEIGHT = 66;
  const EDGE_GAP = 18;
  const MAX_HISTORY = 30;

  const elements = {
    viewport: document.querySelector("#viewport"),
    canvas: document.querySelector("#canvas"),
    nodeLayer: document.querySelector("#nodeLayer"),
    connections: document.querySelector("#connections"),
    emptyState: document.querySelector("#emptyState"),
    canvasHint: document.querySelector("#canvasHint"),
    saveLabel: document.querySelector("#saveLabel"),
    saveState: document.querySelector(".save-state"),
    toast: document.querySelector("#toast"),
    confirmDialog: document.querySelector("#confirmDialog"),
    confirmMessage: document.querySelector("#confirmMessage"),
    addRoot: document.querySelector("#addRootButton"),
    emptyAdd: document.querySelector("#emptyAddButton"),
    addChild: document.querySelector("#addChildButton"),
    rename: document.querySelector("#renameButton"),
    remove: document.querySelector("#deleteButton"),
    undo: document.querySelector("#undoButton"),
    reset: document.querySelector("#resetButton"),
    mobileAddChild: document.querySelector("#mobileAddChild"),
    mobileRename: document.querySelector("#mobileRename"),
    mobileDelete: document.querySelector("#mobileDelete"),
  };

  const sampleNodes = () => [
    { id: "root", parentId: null, text: "新しいプロジェクト", x: 160, y: 355 },
    { id: "idea", parentId: "root", text: "アイデア", x: 430, y: 205 },
    { id: "research", parentId: "root", text: "リサーチ", x: 430, y: 355 },
    { id: "actions", parentId: "root", text: "次のアクション", x: 430, y: 505 },
    { id: "audience", parentId: "idea", text: "誰のため？", x: 700, y: 155 },
    { id: "value", parentId: "idea", text: "どんな価値？", x: 700, y: 255 },
  ];

  let nodes = loadNodes();
  let selectedId = nodes[0]?.id ?? null;
  let editingId = null;
  let history = [];
  let saveTimer = null;
  let toastTimer = null;
  let pendingDeleteId = null;
  let dragState = null;

  function loadNodes() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && saved.version === 1 && Array.isArray(saved.nodes)) {
        return saved.nodes
          .filter(isValidNode)
          .map((node) => ({
            id: String(node.id),
            parentId: node.parentId === null ? null : String(node.parentId),
            text: String(node.text).slice(0, 80) || "無題のノード",
            x: clamp(Number(node.x), 12, 3000),
            y: clamp(Number(node.y), 12, 2000),
          }));
      }
    } catch (error) {
      console.warn("保存データを読み込めませんでした。", error);
    }
    return sampleNodes();
  }

  function isValidNode(node) {
    return (
      node &&
      typeof node === "object" &&
      (typeof node.id === "string" || typeof node.id === "number") &&
      Number.isFinite(Number(node.x)) &&
      Number.isFinite(Number(node.y))
    );
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function cloneNodes(source = nodes) {
    return source.map((node) => ({ ...node }));
  }

  function snapshot() {
    history.push(cloneNodes());
    if (history.length > MAX_HISTORY) history.shift();
    updateControls();
  }

  function undo() {
    const previous = history.pop();
    if (!previous) return;
    nodes = previous;
    if (!nodes.some((node) => node.id === selectedId)) selectedId = nodes[0]?.id ?? null;
    editingId = null;
    render();
    scheduleSave();
    showToast("ひとつ前の状態に戻しました");
  }

  function saveNow() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, nodes }));
      elements.saveState.classList.remove("saving");
      elements.saveLabel.textContent = "この端末に保存済み";
    } catch (error) {
      elements.saveState.classList.remove("saving");
      elements.saveLabel.textContent = "保存できませんでした";
      showToast("ブラウザの保存領域を利用できません", true);
      console.warn(error);
    }
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    elements.saveState.classList.add("saving");
    elements.saveLabel.textContent = "保存中…";
    saveTimer = window.setTimeout(saveNow, 240);
  }

  function makeId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return `node-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function addRoot() {
    snapshot();
    const visibleLeft = elements.viewport.scrollLeft + Math.max(50, elements.viewport.clientWidth * 0.18);
    const visibleTop = elements.viewport.scrollTop + Math.max(60, elements.viewport.clientHeight * 0.32);
    const node = {
      id: makeId(),
      parentId: null,
      text: "新しいテーマ",
      x: clamp(visibleLeft, 24, elements.canvas.clientWidth - NODE_WIDTH - 24),
      y: clamp(visibleTop, 24, elements.canvas.clientHeight - NODE_HEIGHT - 24),
    };
    nodes.push(node);
    selectedId = node.id;
    editingId = node.id;
    render();
    scheduleSave();
  }

  function addChild(parentId) {
    const parent = nodes.find((node) => node.id === parentId);
    if (!parent) return;

    snapshot();
    const siblings = nodes.filter((node) => node.parentId === parentId);
    const child = {
      id: makeId(),
      parentId,
      text: "新しいアイデア",
      x: clamp(parent.x + 250, 18, elements.canvas.clientWidth - NODE_WIDTH - 18),
      y: clamp(parent.y + (siblings.length - (siblings.length - 1) / 2) * 86, 18, elements.canvas.clientHeight - NODE_HEIGHT - 18),
    };

    const occupied = nodes.some(
      (node) => Math.abs(node.x - child.x) < NODE_WIDTH && Math.abs(node.y - child.y) < NODE_HEIGHT,
    );
    if (occupied) child.y = clamp(parent.y + siblings.length * 92 + 76, 18, elements.canvas.clientHeight - NODE_HEIGHT - 18);

    nodes.push(child);
    selectedId = child.id;
    editingId = child.id;
    render();
    ensureNodeVisible(child);
    scheduleSave();
  }

  function beginRename(id) {
    if (!nodes.some((node) => node.id === id)) return;
    selectedId = id;
    editingId = id;
    render();
  }

  function finishRename(id, rawValue, cancel = false) {
    const node = nodes.find((item) => item.id === id);
    if (!node || editingId !== id) return;
    editingId = null;

    if (!cancel) {
      const value = rawValue.trim().slice(0, 80);
      if (value && value !== node.text) {
        snapshot();
        node.text = value;
        scheduleSave();
      }
    }
    render();
  }

  function descendantsOf(id) {
    const ids = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      nodes.forEach((node) => {
        if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
          ids.add(node.id);
          changed = true;
        }
      });
    }
    return ids;
  }

  function requestDelete(id) {
    const node = nodes.find((item) => item.id === id);
    if (!node) return;
    const count = descendantsOf(id).size;
    pendingDeleteId = id;
    elements.confirmMessage.textContent =
      count > 1
        ? `「${node.text}」と、その先の${count - 1}個の子ノードを削除します。`
        : `「${node.text}」を削除します。この操作は元に戻せます。`;
    if (typeof elements.confirmDialog.showModal === "function") {
      elements.confirmDialog.showModal();
    } else if (window.confirm(elements.confirmMessage.textContent)) {
      deleteNode(id);
    }
  }

  function deleteNode(id) {
    const deleteIds = descendantsOf(id);
    if (!deleteIds.size) return;
    snapshot();
    nodes = nodes.filter((node) => !deleteIds.has(node.id));
    selectedId = nodes[0]?.id ?? null;
    editingId = null;
    render();
    scheduleSave();
    showToast(deleteIds.size > 1 ? `${deleteIds.size}個のノードを削除しました` : "ノードを削除しました");
  }

  function resetMap() {
    snapshot();
    nodes = sampleNodes();
    selectedId = nodes[0].id;
    editingId = null;
    render();
    scheduleSave();
    elements.viewport.scrollTo({ left: 0, top: 0, behavior: "smooth" });
    showToast("サンプルのマップに戻しました");
  }

  function selectNode(id) {
    if (!nodes.some((node) => node.id === id)) return;
    selectedId = id;
    editingId = null;
    render();
  }

  function updateControls() {
    const hasSelection = nodes.some((node) => node.id === selectedId);
    [elements.addChild, elements.rename, elements.remove, elements.mobileAddChild, elements.mobileRename, elements.mobileDelete].forEach(
      (button) => {
        button.disabled = !hasSelection;
      },
    );
    elements.undo.disabled = history.length === 0;
  }

  function render() {
    elements.nodeLayer.replaceChildren();
    elements.connections.querySelectorAll(".connection-line").forEach((line) => line.remove());
    elements.emptyState.hidden = nodes.length !== 0;
    elements.canvasHint.hidden = nodes.length === 0;

    nodes.forEach((node) => elements.nodeLayer.append(createNodeElement(node)));
    window.requestAnimationFrame(drawConnections);
    updateControls();

    if (editingId) {
      window.requestAnimationFrame(() => {
        const input = elements.nodeLayer.querySelector(`[data-node-id="${CSS.escape(editingId)}"] .node-input`);
        if (input) {
          input.focus();
          input.select();
        }
      });
    }
  }

  function createNodeElement(node) {
    const element = document.createElement("article");
    const isRoot = node.parentId === null;
    element.className = `mind-node${isRoot ? " root-node" : ""}${node.id === selectedId ? " selected" : ""}`;
    element.dataset.nodeId = node.id;
    element.style.transform = `translate(${node.x}px, ${node.y}px)`;
    element.setAttribute("role", "button");
    element.setAttribute("tabindex", "0");
    element.setAttribute("aria-label", `${node.text}。ドラッグで移動、Enterキーで編集`);

    if (editingId === node.id) {
      const input = document.createElement("input");
      input.className = "node-input";
      input.value = node.text;
      input.maxLength = 80;
      input.setAttribute("aria-label", "ノード名");
      input.addEventListener("pointerdown", (event) => event.stopPropagation());
      input.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") finishRename(node.id, input.value);
        if (event.key === "Escape") finishRename(node.id, input.value, true);
      });
      input.addEventListener("blur", () => finishRename(node.id, input.value));
      element.append(input);
    } else {
      const label = document.createElement("span");
      label.className = "node-text";
      label.textContent = node.text;
      element.append(label);
    }

    const addButton = document.createElement("button");
    addButton.className = "node-add";
    addButton.type = "button";
    addButton.textContent = "+";
    addButton.setAttribute("aria-label", `「${node.text}」に子ノードを追加`);
    addButton.addEventListener("pointerdown", (event) => event.stopPropagation());
    addButton.addEventListener("click", (event) => {
      event.stopPropagation();
      addChild(node.id);
    });
    element.append(addButton);

    element.addEventListener("dblclick", (event) => {
      if (event.target.closest("button, input")) return;
      event.preventDefault();
      beginRename(node.id);
    });
    element.addEventListener("keydown", (event) => {
      if (event.target.matches("input")) return;
      if (event.key === "Enter") {
        event.preventDefault();
        beginRename(node.id);
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        requestDelete(node.id);
      }
    });
    element.addEventListener("pointerdown", (event) => startDrag(event, node, element));
    return element;
  }

  function startDrag(event, node, element) {
    if (event.button !== 0 || event.target.closest("button, input")) return;
    event.preventDefault();
    selectedId = node.id;
    editingId = null;
    const start = { x: node.x, y: node.y };
    dragState = {
      id: node.id,
      element,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: node.x,
      startY: node.y,
      moved: false,
      savedSnapshot: false,
    };
    element.setPointerCapture(event.pointerId);
    element.classList.add("selected");
    updateControls();

    const onMove = (moveEvent) => {
      if (!dragState || moveEvent.pointerId !== dragState.pointerId) return;
      const dx = moveEvent.clientX - dragState.startClientX;
      const dy = moveEvent.clientY - dragState.startClientY;
      if (!dragState.moved && Math.hypot(dx, dy) > 3) {
        dragState.moved = true;
        element.classList.add("dragging");
      }
      if (!dragState.moved) return;
      node.x = clamp(dragState.startX + dx, EDGE_GAP, elements.canvas.clientWidth - NODE_WIDTH - EDGE_GAP);
      node.y = clamp(dragState.startY + dy, EDGE_GAP, elements.canvas.clientHeight - NODE_HEIGHT - EDGE_GAP);
      element.style.transform = `translate(${node.x}px, ${node.y}px)`;
      drawConnections();
    };

    const onEnd = (endEvent) => {
      if (!dragState || endEvent.pointerId !== dragState.pointerId) return;
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerup", onEnd);
      element.removeEventListener("pointercancel", onEnd);
      element.classList.remove("dragging");
      if (dragState.moved) {
        history.push(nodes.map((item) => (item.id === node.id ? { ...item, x: start.x, y: start.y } : { ...item })));
        if (history.length > MAX_HISTORY) history.shift();
        scheduleSave();
      }
      dragState = null;
      render();
    };

    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerup", onEnd);
    element.addEventListener("pointercancel", onEnd);
  }

  function drawConnections() {
    const canvasRect = elements.canvas.getBoundingClientRect();
    const selectedRelations = new Set();
    if (selectedId) {
      selectedRelations.add(selectedId);
      const selected = nodes.find((node) => node.id === selectedId);
      if (selected?.parentId) selectedRelations.add(selected.parentId);
      nodes.filter((node) => node.parentId === selectedId).forEach((node) => selectedRelations.add(node.id));
    }

    const fragment = document.createDocumentFragment();
    nodes.forEach((node) => {
      if (!node.parentId) return;
      const parentElement = elements.nodeLayer.querySelector(`[data-node-id="${CSS.escape(node.parentId)}"]`);
      const childElement = elements.nodeLayer.querySelector(`[data-node-id="${CSS.escape(node.id)}"]`);
      if (!parentElement || !childElement) return;

      const startRect = parentElement.getBoundingClientRect();
      const endRect = childElement.getBoundingClientRect();
      const points = connectionPoints(startRect, endRect, canvasRect);
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", curvedPath(points));
      path.setAttribute(
        "class",
        `connection-line${selectedRelations.has(node.id) && selectedRelations.has(node.parentId) ? " active" : ""}`,
      );
      fragment.append(path);
    });

    elements.connections.querySelectorAll(".connection-line").forEach((line) => line.remove());
    elements.connections.append(fragment);
  }

  function connectionPoints(from, to, canvasRect) {
    const fromCenter = { x: from.left + from.width / 2, y: from.top + from.height / 2 };
    const toCenter = { x: to.left + to.width / 2, y: to.top + to.height / 2 };
    const dx = toCenter.x - fromCenter.x;
    const dy = toCenter.y - fromCenter.y;
    let start;
    let end;
    let direction;

    if (Math.abs(dx) >= Math.abs(dy)) {
      const sign = dx >= 0 ? 1 : -1;
      start = { x: fromCenter.x + (from.width / 2) * sign, y: fromCenter.y };
      end = { x: toCenter.x - (to.width / 2) * sign, y: toCenter.y };
      direction = "horizontal";
    } else {
      const sign = dy >= 0 ? 1 : -1;
      start = { x: fromCenter.x, y: fromCenter.y + (from.height / 2) * sign };
      end = { x: toCenter.x, y: toCenter.y - (to.height / 2) * sign };
      direction = "vertical";
    }

    return {
      start: { x: start.x - canvasRect.left, y: start.y - canvasRect.top },
      end: { x: end.x - canvasRect.left, y: end.y - canvasRect.top },
      direction,
    };
  }

  function curvedPath({ start, end, direction }) {
    if (direction === "horizontal") {
      const bend = Math.max(48, Math.abs(end.x - start.x) * 0.46);
      const sign = end.x >= start.x ? 1 : -1;
      return `M ${start.x} ${start.y} C ${start.x + bend * sign} ${start.y}, ${end.x - bend * sign} ${end.y}, ${end.x} ${end.y}`;
    }
    const bend = Math.max(42, Math.abs(end.y - start.y) * 0.46);
    const sign = end.y >= start.y ? 1 : -1;
    return `M ${start.x} ${start.y} C ${start.x} ${start.y + bend * sign}, ${end.x} ${end.y - bend * sign}, ${end.x} ${end.y}`;
  }

  function ensureNodeVisible(node) {
    const margin = 90;
    const left = node.x - margin;
    const right = node.x + NODE_WIDTH + margin;
    const top = node.y - margin;
    const bottom = node.y + NODE_HEIGHT + margin;
    let targetLeft = elements.viewport.scrollLeft;
    let targetTop = elements.viewport.scrollTop;

    if (right > targetLeft + elements.viewport.clientWidth) targetLeft = right - elements.viewport.clientWidth;
    if (left < targetLeft) targetLeft = left;
    if (bottom > targetTop + elements.viewport.clientHeight) targetTop = bottom - elements.viewport.clientHeight;
    if (top < targetTop) targetTop = top;
    elements.viewport.scrollTo({ left: Math.max(0, targetLeft), top: Math.max(0, targetTop), behavior: "smooth" });
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 2400);
  }

  elements.addRoot.addEventListener("click", addRoot);
  elements.emptyAdd.addEventListener("click", addRoot);
  elements.addChild.addEventListener("click", () => selectedId && addChild(selectedId));
  elements.mobileAddChild.addEventListener("click", () => selectedId && addChild(selectedId));
  elements.rename.addEventListener("click", () => selectedId && beginRename(selectedId));
  elements.mobileRename.addEventListener("click", () => selectedId && beginRename(selectedId));
  elements.remove.addEventListener("click", () => selectedId && requestDelete(selectedId));
  elements.mobileDelete.addEventListener("click", () => selectedId && requestDelete(selectedId));
  elements.undo.addEventListener("click", undo);
  elements.reset.addEventListener("click", resetMap);

  elements.confirmDialog.addEventListener("close", () => {
    if (elements.confirmDialog.returnValue === "confirm" && pendingDeleteId) deleteNode(pendingDeleteId);
    pendingDeleteId = null;
  });

  elements.canvas.addEventListener("pointerdown", (event) => {
    if (event.target === elements.canvas || event.target === elements.nodeLayer) {
      selectedId = null;
      editingId = null;
      render();
    }
  });

  elements.viewport.addEventListener("keydown", (event) => {
    if (event.target.matches("input, button")) return;
    const modifier = event.metaKey || event.ctrlKey;
    if (modifier && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undo();
    }
    if (modifier && event.key === "Enter") {
      event.preventDefault();
      addRoot();
    }
    if (selectedId && event.key === "Enter") {
      event.preventDefault();
      beginRename(selectedId);
    }
    if (selectedId && (event.key === "Delete" || event.key === "Backspace")) {
      event.preventDefault();
      requestDelete(selectedId);
    }
  });

  window.addEventListener("resize", () => window.requestAnimationFrame(drawConnections));
  window.addEventListener("beforeunload", saveNow);

  render();
  saveNow();
})();
