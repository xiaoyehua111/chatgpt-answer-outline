(function () {
  const PANEL_ID = "cao-answer-outline-panel";
  const COLLAPSED_CLASS = "cao-panel--collapsed";
  const DARK_THEME_CLASS = "cao-panel--dark";
  const LIGHT_THEME_CLASS = "cao-panel--light";
  const BODY_CLASS = "cao-panel__body";
  const SEARCH_INPUT_ID = "cao-question-search";
  const MESSAGE_SELECTOR = "[data-message-author-role]";
  const USER_SELECTOR = '[data-message-author-role="user"]';
  const ASSISTANT_SELECTOR = '[data-message-author-role="assistant"]';
  const HEADING_SELECTOR = "h1, h2, h3";
  const READING_TOP = 120;

  let currentPromptItems = [];
  let searchQuery = "";
  let scanTimer = null;
  let observer = null;
  let activePromptId = "";
  let activeAssistantElement = null;
  let activeHeadings = [];
  let outlineStatus = "";
  let lastRevealTime = 0;
  let dragState = null;
  let resizeState = null;
  let themeObserver = null;
  let fiberBridgeInjected = false;
  const fiberPromptTextCache = new Map();
  const expandedPromptIds = new Set();

  function injectFiberBridge() {
    if (fiberBridgeInjected || typeof chrome === "undefined" || !chrome.runtime?.getURL) {
      return;
    }

    fiberBridgeInjected = true;
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("fiber-bridge.js");
    script.async = false;
    script.onload = () => {
      script.remove();
      document.dispatchEvent(new CustomEvent("cao-extract-fiber-prompts"));
    };
    (document.head || document.documentElement).appendChild(script);
  }

  function requestFiberPromptTexts() {
    injectFiberBridge();
    document.dispatchEvent(new CustomEvent("cao-extract-fiber-prompts"));
  }

  function getRgbLuminance(color) {
    const match = String(color || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/i);
    if (!match) {
      return null;
    }

    const [, red, green, blue, alpha] = match.map(Number);
    if (Number.isFinite(alpha) && alpha === 0) {
      return null;
    }

    return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  }

  function isPageDarkTheme() {
    const root = document.documentElement;
    const body = document.body;
    const nodes = [root, body].filter(Boolean);

    if (nodes.some((node) => node.classList?.contains("dark"))) {
      return true;
    }

    if (nodes.some((node) => String(node.getAttribute("data-theme") || "").toLowerCase() === "dark")) {
      return true;
    }

    const colorSchemes = nodes
      .flatMap((node) => [node.style?.colorScheme || "", getComputedStyle(node).colorScheme || ""])
      .map((value) => String(value).trim().toLowerCase())
      .filter(Boolean);

    if (colorSchemes.some((value) => value === "dark" || value.startsWith("dark ") || value.includes("only dark"))) {
      return true;
    }

    const bodyLuminance = getRgbLuminance(getComputedStyle(body || root).backgroundColor);
    const rootLuminance = getRgbLuminance(getComputedStyle(root).backgroundColor);
    const luminance = bodyLuminance ?? rootLuminance;

    if (luminance !== null) {
      return luminance < 0.45;
    }

    return window.matchMedia?.("(prefers-color-scheme: dark)").matches || false;
  }

  function applyPanelTheme(panel) {
    const isDark = isPageDarkTheme();
    panel.classList.toggle(DARK_THEME_CLASS, isDark);
    panel.classList.toggle(LIGHT_THEME_CLASS, !isDark);
  }

  function setupPanelThemeSync(panel) {
    applyPanelTheme(panel);

    const syncTheme = () => applyPanelTheme(panel);
    const colorSchemeQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
    colorSchemeQuery?.addEventListener?.("change", syncTheme);

    if (themeObserver) {
      themeObserver.disconnect();
    }

    themeObserver = new MutationObserver(syncTheme);
    [document.documentElement, document.body].filter(Boolean).forEach((node) => {
      themeObserver.observe(node, {
        attributes: true,
        attributeFilter: ["class", "style", "data-theme"]
      });
    });
  }

  document.addEventListener("cao-fiber-prompts-result", (event) => {
    const detail = event.detail || {};
    let changed = false;
    Object.entries(detail).forEach(([turnId, text]) => {
      const normalized = normalizePromptText(text);
      if (turnId && normalized && fiberPromptTextCache.get(turnId) !== normalized) {
        fiberPromptTextCache.set(turnId, normalized);
        changed = true;
      }
    });

    if (changed) {
      window.setTimeout(refreshNavigator, 0);
    }
  });

  function createPanel() {
    const existingPanel = document.getElementById(PANEL_ID);
    if (existingPanel) {
      return existingPanel;
    }

    const panel = document.createElement("aside");
    panel.id = PANEL_ID;
    panel.className = "cao-panel";
    panel.setAttribute("aria-label", "ChatGPT 历史问题导航");

    const header = document.createElement("div");
    header.className = "cao-panel__header";
    header.setAttribute("title", "\u62d6\u52a8\u79fb\u52a8\u5bfc\u822a\u9762\u677f");

    const headerText = document.createElement("div");
    headerText.className = "cao-panel__heading";

    const headerTitle = document.createElement("div");
    headerTitle.className = "cao-panel__heading-title";
    headerTitle.textContent = "\u5f53\u524d\u5bf9\u8bdd";

    const headerSubtitle = document.createElement("div");
    headerSubtitle.className = "cao-panel__heading-subtitle";
    headerSubtitle.textContent = "\u95ee\u9898\u4e0e\u56de\u7b54\u76ee\u5f55";

    headerText.append(headerTitle, headerSubtitle);

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "cao-panel__toggle";
    toggleButton.setAttribute("aria-label", "折叠导航面板");
    toggleButton.setAttribute("aria-expanded", "true");
    toggleButton.textContent = "−";

    const searchWrap = document.createElement("div");
    searchWrap.className = "cao-search";

    const searchInput = document.createElement("input");
    searchInput.id = SEARCH_INPUT_ID;
    searchInput.className = "cao-search__input";
    searchInput.type = "search";
    searchInput.placeholder = "搜索历史问题...";
    searchInput.autocomplete = "off";
    searchInput.value = searchQuery;

    const body = document.createElement("div");
    body.className = BODY_CLASS;
    body.textContent = "正在扫描历史问题...";

    const resizeHandles = createPanelResizeHandles();

    toggleButton.addEventListener("click", (event) => {
      if (panel.dataset.caoSuppressToggle === "1") {
        event.preventDefault();
        event.stopPropagation();
        panel.dataset.caoSuppressToggle = "0";
        return;
      }

      const isCollapsed = panel.classList.toggle(COLLAPSED_CLASS);
      toggleButton.textContent = isCollapsed ? "+" : "−";
      toggleButton.setAttribute("aria-expanded", String(!isCollapsed));
      toggleButton.setAttribute("aria-label", isCollapsed ? "展开导航面板" : "折叠导航面板");
    });

    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value;
      renderNavigator(currentPromptItems);
    });

    header.append(headerText, toggleButton);
    searchWrap.appendChild(searchInput);
    panel.append(header, searchWrap, body, ...resizeHandles);
    document.body.appendChild(panel);
    setupPanelThemeSync(panel);
    setupPanelDrag(panel, header, toggleButton);
    setupPanelResize(panel, resizeHandles);
    return panel;
  }

  function createPanelResizeHandles() {
    return ["n", "e", "s", "w", "ne", "se", "sw", "nw"].map((direction) => {
      const handle = document.createElement("div");
      handle.className = `cao-panel__resize-edge cao-panel__resize-edge--${direction}`;
      handle.dataset.resizeDirection = direction;
      handle.setAttribute("aria-hidden", "true");
      return handle;
    });
  }

  function clampPanelPosition(left, top, panel) {
    const rect = panel.getBoundingClientRect();
    const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
    const maxTop = Math.max(8, window.innerHeight - rect.height - 8);

    return {
      left: Math.min(Math.max(8, left), maxLeft),
      top: Math.min(Math.max(8, top), maxTop)
    };
  }

  function applyPanelPosition(panel, left, top) {
    const next = clampPanelPosition(left, top, panel);
    panel.style.left = `${next.left}px`;
    panel.style.top = `${next.top}px`;
    panel.style.right = "auto";
  }

  function beginPanelDrag(panel, handle, event, options = {}) {
    const rect = panel.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      moved: false,
      suppressToggleOnMove: Boolean(options.suppressToggleOnMove)
    };

    handle.setPointerCapture?.(event.pointerId);
    panel.classList.add("cao-panel--dragging");
    event.preventDefault();
  }

  function updatePanelDrag(panel, event) {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      dragState.moved = true;
    }

    applyPanelPosition(panel, dragState.left + deltaX, dragState.top + deltaY);
  }

  function endPanelDrag(panel, handle, event) {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (dragState.moved && dragState.suppressToggleOnMove) {
      panel.dataset.caoSuppressToggle = "1";
    }

    handle.releasePointerCapture?.(event.pointerId);
    panel.classList.remove("cao-panel--dragging");
    dragState = null;
  }

  function setupPanelDrag(panel, handle, toggleButton) {
    handle.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button, input")) {
        return;
      }

      beginPanelDrag(panel, handle, event);
    });

    handle.addEventListener("pointermove", (event) => {
      updatePanelDrag(panel, event);
    });

    const endDrag = (event) => {
      endPanelDrag(panel, handle, event);
    };

    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);

    toggleButton.addEventListener("pointerdown", (event) => {
      if (!panel.classList.contains(COLLAPSED_CLASS)) {
        return;
      }

      beginPanelDrag(panel, toggleButton, event, { suppressToggleOnMove: true });
    });

    toggleButton.addEventListener("pointermove", (event) => {
      updatePanelDrag(panel, event);
    });

    toggleButton.addEventListener("pointerup", (event) => {
      endPanelDrag(panel, toggleButton, event);
    });

    toggleButton.addEventListener("pointercancel", (event) => {
      endPanelDrag(panel, toggleButton, event);
    });
  }

  function clampPanelSize(width, height) {
    return {
      width: Math.min(Math.max(260, width), Math.max(260, window.innerWidth - 32)),
      height: Math.min(Math.max(260, height), Math.max(260, window.innerHeight - 32))
    };
  }

  function applyPanelResize(panel, event) {
    if (!resizeState || resizeState.pointerId !== event.pointerId) {
      return;
    }

    const direction = resizeState.direction;
    const deltaX = event.clientX - resizeState.startX;
    const deltaY = event.clientY - resizeState.startY;
    let nextLeft = resizeState.left;
    let nextTop = resizeState.top;
    let nextWidth = resizeState.width;
    let nextHeight = resizeState.height;

    if (direction.includes("e")) {
      nextWidth = resizeState.width + deltaX;
    }
    if (direction.includes("s")) {
      nextHeight = resizeState.height + deltaY;
    }
    if (direction.includes("w")) {
      nextWidth = resizeState.width - deltaX;
      nextLeft = resizeState.left + deltaX;
    }
    if (direction.includes("n")) {
      nextHeight = resizeState.height - deltaY;
      nextTop = resizeState.top + deltaY;
    }

    const next = clampPanelSize(nextWidth, nextHeight);
    if (direction.includes("w")) {
      nextLeft = resizeState.left + (resizeState.width - next.width);
    }
    if (direction.includes("n")) {
      nextTop = resizeState.top + (resizeState.height - next.height);
    }

    const position = clampPanelPosition(nextLeft, nextTop, panel);
    panel.style.left = `${position.left}px`;
    panel.style.top = `${position.top}px`;
    panel.style.right = "auto";
    panel.style.width = `${next.width}px`;
    panel.style.height = `${next.height}px`;
  }

  function setupPanelResize(panel, handles) {
    const beginResize = (handle, event) => {
      if (panel.classList.contains(COLLAPSED_CLASS)) {
        return;
      }

      const rect = panel.getBoundingClientRect();
      resizeState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        direction: handle.dataset.resizeDirection || "se"
      };

      handle.setPointerCapture?.(event.pointerId);
      panel.classList.add("cao-panel--resizing");
      event.preventDefault();
      event.stopPropagation();
    };

    const endResize = (handle, event) => {
      if (!resizeState || resizeState.pointerId !== event.pointerId) {
        return;
      }

      handle.releasePointerCapture?.(event.pointerId);
      panel.classList.remove("cao-panel--resizing");
      resizeState = null;
    };

    handles.forEach((handle) => {
      handle.addEventListener("pointerdown", (event) => beginResize(handle, event));
      handle.addEventListener("pointermove", (event) => applyPanelResize(panel, event));
      handle.addEventListener("pointerup", (event) => endResize(handle, event));
      handle.addEventListener("pointercancel", (event) => endResize(handle, event));
    });
  }

  function getElementText(element) {
    return element ? element.innerText || element.textContent || "" : "";
  }

  function normalizePromptText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function getTextPreview(text, maxLength) {
    const cleanText = normalizePromptText(text);
    if (cleanText.length <= maxLength) {
      return cleanText;
    }

    return `${cleanText.slice(0, maxLength)}...`;
  }

  function hasLeadingNumbering(text) {
    return /^(?:\d+(?:\.\d+)*[.)、．]?\s*|[一二三四五六七八九十百千万]+[、.．]\s*)/.test(normalizePromptText(text));
  }

  function isVisibleElement(element) {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isExcludedNativeText(text) {
    const cleanText = normalizePromptText(text);
    const lower = cleanText.toLowerCase();
    const exactExcluded = [
      "new chat",
      "search",
      "library",
      "settings",
      "upgrade",
      "log out",
      "help",
      "temporary chat",
      "chatgpt",
      "sora",
      "today",
      "yesterday",
      "projects",
      "gpts",
      "thinking",
      "think",
      "deep research",
      "create image",
      "write or code",
      "新建聊天",
      "搜索",
      "设置",
      "帮助",
      "项目",
      "查找资料",
      "生成图片",
      "撰写或编辑",
      "临时聊天"
    ];
    const partialExcluded = [
      "explore gpts",
      "previous 7 days",
      "previous 30 days"
    ];

    return exactExcluded.includes(lower) || partialExcluded.some((item) => lower.includes(item));
  }

  function hasRenderedConversationMessages() {
    return Boolean(
      document.querySelector(
        [
          USER_SELECTOR,
          ASSISTANT_SELECTOR,
          '[data-turn="user"]',
          '[data-turn="assistant"]',
          "[data-turn-id]"
        ].join(", ")
      )
    );
  }

  function isInsideLeftSidebar(element) {
    if (!element) {
      return false;
    }

    if (element.closest("aside")) {
      return true;
    }

    const rect = element.getBoundingClientRect();
    return rect.right < window.innerWidth * 0.45;
  }

  function isRightSideElement(element) {
    if (!element || isInsideLeftSidebar(element)) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    return rect.left > window.innerWidth * 0.55 || rect.right > window.innerWidth - 180;
  }

  function hasExcludedNavigationContext(element) {
    const context = normalizePromptText(
      [
        element.getAttribute("aria-label") || "",
        element.getAttribute("data-testid") || "",
        element.closest("[aria-label]") ? element.closest("[aria-label]").getAttribute("aria-label") || "" : "",
        element.closest("[data-testid]") ? element.closest("[data-testid]").getAttribute("data-testid") || "" : ""
      ].join(" ")
    );

    return isExcludedNativeText(context);
  }

  function isLikelyCurrentConversationPromptNavItem(element) {
    if (!(element instanceof HTMLElement) || !isRightSideElement(element) || hasExcludedNavigationContext(element)) {
      return false;
    }

    const text = normalizePromptText(getElementText(element));
    if (text.length <= 2 || text.length > 300 || isExcludedNativeText(text)) {
      return false;
    }

    return true;
  }

  function revealRightSideConversationNav() {
    const now = Date.now();
    if (now - lastRevealTime < 1500) {
      return;
    }

    lastRevealTime = now;
    const x = Math.max(window.innerWidth - 10, 0);
    const y = Math.max(Math.round(window.innerHeight * 0.4), 80);
    const panel = document.getElementById(PANEL_ID);
    const hitTarget = document.elementFromPoint(x, y);
    const target = hitTarget && panel && panel.contains(hitTarget) ? document.body : hitTarget || document.body;
    const eventOptions = {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      view: window
    };

    ["mouseenter", "mouseover", "mousemove"].forEach((eventName) => {
      target.dispatchEvent(new MouseEvent(eventName, eventOptions));
      document.dispatchEvent(new MouseEvent(eventName, eventOptions));
      document.body.dispatchEvent(new MouseEvent(eventName, eventOptions));
    });

    window.setTimeout(() => {
      currentPromptItems = getPromptItems();
      renderNavigator(currentPromptItems);
    }, 500);
  }

  function dedupePromptItems(items) {
    const seen = new Set();
    const deduped = [];

    items.forEach((item) => {
      const key = normalizePromptText(item.text).toLowerCase();
      if (!key || seen.has(key)) {
        return;
      }

      seen.add(key);
      deduped.push({
        ...item,
        index: deduped.length + 1
      });
    });

    return deduped;
  }

  function getRightSideCurrentConversationPromptNavItems() {
    const panel = document.getElementById(PANEL_ID);
    const selectors = [
      'button',
      'a',
      '[role="button"]',
      '[data-testid*="prompt" i]',
      '[data-testid*="conversation" i]',
      '[aria-label*="prompt" i]',
      '[aria-label*="conversation" i]'
    ];
    const candidates = new Set();

    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        if (isRightSideElement(element)) {
          candidates.add(element);
        }
      });
    });

    const items = [];
    candidates.forEach((element) => {
      if (panel && panel.contains(element)) {
        return;
      }

      if (!isLikelyCurrentConversationPromptNavItem(element)) {
        return;
      }

      const text = normalizePromptText(getElementText(element));

      items.push({
        id: `cao-right-nav-prompt-${items.length}`,
        text,
        sourceType: "right-nav",
        element,
        index: items.length + 1,
        assistantElement: null
      });
    });

    return dedupePromptItems(items);
  }

  function collectHeadings(assistantElement, itemId) {
    if (!assistantElement) {
      return [];
    }

    const candidates = Array.from(assistantElement.querySelectorAll(HEADING_SELECTOR))
      .map((heading, index) => {
        const text = normalizePromptText(heading.innerText || heading.textContent || "");
        if (!text) {
          return null;
        }

        if (!heading.id) {
          heading.id = `cao-heading-${itemId}-${index}`;
        }

        heading.classList.add("cao-scroll-anchor");

        return {
          id: heading.id,
          text,
          level: Number(heading.tagName.replace("H", "")) || 1,
          itemType: "flat",
          groupId: "",
          element: heading
        };
      })
      .filter(Boolean);

    return buildHeadingOutline(candidates);
  }

  function hasHeadingHierarchy(headings, parentLevel, childLevel) {
    let hasParent = false;
    for (const heading of headings) {
      if (heading.level === parentLevel) {
        hasParent = true;
        continue;
      }

      if (heading.level === childLevel && hasParent) {
        return true;
      }
    }

    return false;
  }

  function buildHeadingHierarchy(headings, parentLevel, childLevel) {
    const result = [];
    let currentGroup = null;
    let groupIndex = 0;

    headings.forEach((heading) => {
      if (heading.level === parentLevel) {
        groupIndex += 1;
        currentGroup = {
          ...heading,
          itemType: "group",
          groupId: heading.id,
          displayIndex: String(groupIndex),
          childCount: 0
        };
        result.push(currentGroup);
        return;
      }

      if (heading.level === childLevel && currentGroup) {
        currentGroup.childCount += 1;
        result.push({
          ...heading,
          itemType: "child",
          groupId: currentGroup.id,
          displayIndex: `${currentGroup.displayIndex}.${currentGroup.childCount}`
        });
      }
    });

    return result;
  }

  function pickSingleHeadingLevel(headings) {
    const h2 = headings.filter((heading) => heading.level === 2);
    if (h2.length > 0) {
      return h2;
    }

    const h1 = headings.filter((heading) => heading.level === 1);
    if (h1.length > 0) {
      return h1;
    }

    return headings.filter((heading) => heading.level === 3);
  }

  function buildHeadingOutline(headings) {
    if (hasHeadingHierarchy(headings, 1, 2)) {
      return buildHeadingHierarchy(headings, 1, 2);
    }

    if (hasHeadingHierarchy(headings, 2, 3)) {
      return buildHeadingHierarchy(headings, 2, 3);
    }

    return pickSingleHeadingLevel(headings).map((heading, index) => ({
      ...heading,
      itemType: "flat",
      displayIndex: String(index + 1)
    }));
  }

  function findConversationContainer() {
    const firstTurn = document.querySelector("[data-turn-id]");
    if (!firstTurn) {
      return null;
    }

    const allTurns = Array.from(document.querySelectorAll("[data-turn-id]"));
    let root = firstTurn.parentElement;

    while (root && root !== document.body) {
      const allInside = allTurns.every((turn) => root.contains(turn));
      if (allInside) {
        return root;
      }

      root = root.parentElement;
    }

    return firstTurn.parentElement || null;
  }

  function resolvePromptTextAnchor(turnElement) {
    const selectors = [".whitespace-pre-wrap", '[dir="auto"]', ".markdown", "p", "pre"];

    for (const selector of selectors) {
      const candidates = Array.from(turnElement.querySelectorAll(selector));
      for (const candidate of candidates) {
        if (normalizePromptText(getElementText(candidate))) {
          return candidate;
        }
      }
    }

    return turnElement;
  }

  function getTurnAssistantElement(userTurnElement, orderedTurns) {
    const userIndex = orderedTurns.indexOf(userTurnElement);
    if (userIndex < 0) {
      return null;
    }

    for (let index = userIndex + 1; index < orderedTurns.length; index += 1) {
      const candidate = orderedTurns[index];
      const turnRole = candidate.getAttribute("data-turn");
      if (turnRole === "user") {
        return null;
      }

      if (turnRole === "assistant") {
        return candidate;
      }
    }

    return null;
  }

  function getTurnDomPromptItems() {
    const conversationContainer = findConversationContainer();
    if (!conversationContainer) {
      return [];
    }

    requestFiberPromptTexts();
    const orderedTurns = Array.from(conversationContainer.querySelectorAll("[data-turn-id]"));
    const userTurns = orderedTurns.filter((turn) => turn.getAttribute("data-turn") === "user");
    const items = userTurns.map((userTurn, index) => {
      const id = userTurn.getAttribute("data-turn-id") || userTurn.dataset.caoPromptId || `cao-turn-prompt-${index}`;
      const anchor = resolvePromptTextAnchor(userTurn);
      const domText = normalizePromptText(getElementText(anchor));
      const cachedText = fiberPromptTextCache.get(id) || "";
      const assistantElement = getTurnAssistantElement(userTurn, orderedTurns);
      userTurn.dataset.caoPromptId = id;
      userTurn.classList.add("cao-scroll-anchor");
      if (assistantElement) {
        assistantElement.classList.add("cao-scroll-anchor");
      }

      return {
        id,
        text: domText || cachedText,
        sourceType: "turn-dom",
        element: anchor,
        index: index + 1,
        assistantElement,
        headings: collectHeadings(assistantElement, id)
      };
    });

    return dedupePromptItems(items.filter((item) => item.text.length > 0));
  }

  function getMessageDomPromptItems() {
    const messageNodes = Array.from(document.querySelectorAll(MESSAGE_SELECTOR));
    const items = [];
    let pendingUser = null;

    for (const node of messageNodes) {
      const role = node.getAttribute("data-message-author-role");

      if (role === "user") {
        pendingUser = node;
        continue;
      }

      if (role === "assistant" && pendingUser) {
        const id = pendingUser.dataset.caoPromptId || `cao-message-prompt-${items.length}`;
        pendingUser.dataset.caoPromptId = id;
        pendingUser.classList.add("cao-scroll-anchor");
        node.classList.add("cao-scroll-anchor");

        items.push({
          id,
          text: normalizePromptText(getElementText(pendingUser)),
          sourceType: "message-dom",
          element: pendingUser,
          index: items.length + 1,
          assistantElement: node,
          headings: collectHeadings(node, id)
        });

        pendingUser = null;
      }
    }

    if (pendingUser) {
      const id = pendingUser.dataset.caoPromptId || `cao-message-prompt-${items.length}`;
      pendingUser.dataset.caoPromptId = id;
      pendingUser.classList.add("cao-scroll-anchor");
      items.push({
        id,
        text: normalizePromptText(getElementText(pendingUser)),
        sourceType: "message-dom",
        element: pendingUser,
        index: items.length + 1,
        assistantElement: null,
        headings: []
      });
    }

    return dedupePromptItems(items.filter((item) => item.text.length > 0));
  }

  function getPromptItems() {
    const turnDomItems = getTurnDomPromptItems();
    if (turnDomItems.length > 0) {
      return turnDomItems;
    }

    if (!hasRenderedConversationMessages()) {
      return [];
    }

    const rightNavItems = getRightSideCurrentConversationPromptNavItems();
    if (rightNavItems.length > 0) {
      return rightNavItems;
    }

    return getMessageDomPromptItems();
  }

  function filterPromptItems(items, queryText) {
    const query = queryText.trim().toLowerCase();
    if (!query) {
      return items;
    }

    return items.filter((item) => item.text.toLowerCase().includes(query));
  }

  function isElementScrollable(element) {
    if (!element) {
      return false;
    }

    try {
      const style = getComputedStyle(element);
      const overflowY = String(style.overflowY || "").toLowerCase();
      const isDocument = element === document.scrollingElement || element === document.documentElement || element === document.body;
      const allowed = overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
      if (!allowed && !isDocument) {
        return false;
      }

      if ((element.scrollHeight || 0) - (element.clientHeight || 0) > 4) {
        return true;
      }

      const previous = element.scrollTop;
      element.scrollTop = previous + 1;
      const changed = element.scrollTop !== previous;
      element.scrollTop = previous;
      return changed;
    } catch {
      return false;
    }
  }

  function getScrollableAncestor(startElement) {
    let best = null;
    let node = startElement;

    while (node && node !== document.body) {
      if (isElementScrollable(node)) {
        best = node;
        break;
      }
      node = node.parentElement;
    }

    if (best) {
      return best;
    }

    return document.scrollingElement || document.documentElement || document.body;
  }

  function resolveScrollAnchor(element) {
    const turnElement = element?.closest?.("[data-turn-id]") || element;
    if (!turnElement) {
      return element;
    }

    const selectors = [".whitespace-pre-wrap", '[dir="auto"]', ".markdown", "p", "pre"];
    let textAnchor = null;

    for (const selector of selectors) {
      const candidates = Array.from(turnElement.querySelectorAll(selector));
      for (const candidate of candidates) {
        if (normalizePromptText(getElementText(candidate))) {
          textAnchor = candidate;
          break;
        }
      }
      if (textAnchor) {
        break;
      }
    }

    if (!textAnchor) {
      return turnElement;
    }

    let bubbleAnchor = textAnchor;
    let node = textAnchor;
    while (node && node !== turnElement) {
      try {
        const style = getComputedStyle(node);
        const backgroundColor = String(style.backgroundColor || "").trim().toLowerCase();
        const hasBackground = backgroundColor && backgroundColor !== "rgba(0, 0, 0, 0)" && backgroundColor !== "transparent";
        const radius = parseFloat(style.borderTopLeftRadius || "0") || 0;
        const hasBorder = (parseFloat(style.borderTopWidth || "0") || 0) > 0;
        const hasPadding = ((parseFloat(style.paddingTop || "0") || 0) + (parseFloat(style.paddingBottom || "0") || 0)) > 0;
        if ((hasBackground || hasBorder) && (radius > 0 || hasPadding)) {
          bubbleAnchor = node;
        }
      } catch {}

      node = node.parentElement;
    }

    return bubbleAnchor || textAnchor || turnElement;
  }

  function getScrollFocusOffset(container) {
    try {
      const style = getComputedStyle(container);
      const scrollPaddingTop = parseFloat(style.getPropertyValue("scroll-padding-top") || "0") || 0;
      return Math.max(96, scrollPaddingTop + 12);
    } catch {
      return 96;
    }
  }

  function getTargetScrollTop(container, targetElement) {
    if (!container || !targetElement) {
      return NaN;
    }

    const containerRect = container.getBoundingClientRect();
    const targetRect = targetElement.getBoundingClientRect();
    const rawTop = targetRect.top - containerRect.top + container.scrollTop;
    return Math.max(0, rawTop - getScrollFocusOffset(container));
  }

  function easeInOutQuad(timeElapsed, start, distance, duration) {
    let time = timeElapsed / (duration / 2);
    if (time < 1) {
      return (distance / 2) * time * time + start;
    }

    time -= 1;
    return (-distance / 2) * (time * (time - 2) - 1) + start;
  }

  function correctScrollPosition(container, targetElement, maxWrites = 6) {
    for (let index = 0; index < maxWrites; index += 1) {
      const targetTop = getTargetScrollTop(container, targetElement);
      if (!Number.isFinite(targetTop)) {
        break;
      }

      const delta = targetTop - container.scrollTop;
      if (Math.abs(delta) <= 1) {
        break;
      }

      container.scrollTop = targetTop;
      targetElement.getBoundingClientRect();
    }
  }

  function scrollToElement(element, options = {}) {
    if (!element) {
      return;
    }

    const shouldResolveAnchor = options.resolveAnchor !== false;
    const targetElement = shouldResolveAnchor ? resolveScrollAnchor(element) : element;
    const container = getScrollableAncestor(targetElement);
    const startPosition = container.scrollTop;
    const targetPosition = getTargetScrollTop(container, targetElement);
    const duration = 520;

    if (!Number.isFinite(targetPosition)) {
      targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (Math.abs(targetPosition - startPosition) <= 1) {
      correctScrollPosition(container, targetElement);
      return;
    }

    let startTime = null;
    const animate = (currentTime) => {
      if (startTime === null) {
        startTime = currentTime;
      }

      const timeElapsed = currentTime - startTime;
      const liveTargetPosition = getTargetScrollTop(container, targetElement);
      const effectiveTarget = Number.isFinite(liveTargetPosition) ? liveTargetPosition : targetPosition;
      const nextTop = easeInOutQuad(Math.min(timeElapsed, duration), startPosition, effectiveTarget - startPosition, duration);
      container.scrollTop = nextTop;

      if (timeElapsed < duration) {
        requestAnimationFrame(animate);
        return;
      }

      container.scrollTop = Number.isFinite(liveTargetPosition) ? liveTargetPosition : effectiveTarget;
      correctScrollPosition(container, targetElement);
      window.setTimeout(() => correctScrollPosition(container, targetElement, 3), 180);
    };

    requestAnimationFrame(animate);
  }

  function highlightElement(element) {
    if (!element) {
      return;
    }

    element.classList.add("cao-nav-highlight");
    window.setTimeout(() => {
      element.classList.remove("cao-nav-highlight");
    }, 1200);
  }

  function getVisibleAssistantCandidates() {
    return Array.from(document.querySelectorAll(ASSISTANT_SELECTOR))
      .filter((element) => normalizePromptText(getElementText(element)).length > 0)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          element,
          rect,
          distance: Math.abs(rect.top - READING_TOP)
        };
      })
      .filter((item) => item.rect.bottom > READING_TOP && item.rect.top < window.innerHeight);
  }

  function selectActiveAssistantByViewport() {
    const visibleAssistants = getVisibleAssistantCandidates();
    if (visibleAssistants.length === 0) {
      return null;
    }

    return visibleAssistants.sort((a, b) => a.distance - b.distance)[0].element;
  }

  function updateOutlineFromAssistant(assistantElement, itemId) {
    activeAssistantElement = assistantElement;
    activeHeadings = collectHeadings(activeAssistantElement, itemId || "active");
    outlineStatus = activeAssistantElement ? "" : "已定位问题，但暂未检测到对应 AI 回答";
    renderNavigator(currentPromptItems);
  }

  function updateActiveAssistantAfterNavigation(promptItem) {
    if (promptItem.assistantElement) {
      activeAssistantElement = promptItem.assistantElement;
      activeHeadings = promptItem.headings || collectHeadings(promptItem.assistantElement, promptItem.id);
      outlineStatus = "";
      renderNavigator(currentPromptItems);
      return;
    }

    updateOutlineFromAssistant(selectActiveAssistantByViewport(), promptItem.id);
  }

  function handlePromptCardClick(promptItem) {
    activePromptId = promptItem.id;
    outlineStatus = "";
    renderNavigator(currentPromptItems);

    if (promptItem.sourceType === "right-nav") {
      promptItem.element.click();
      window.setTimeout(() => {
        currentPromptItems = getPromptItems();
        updateActiveAssistantAfterNavigation(promptItem);
      }, 800);
      return;
    }

    scrollToElement(promptItem.element);
    highlightElement(promptItem.element);
    window.setTimeout(() => {
      currentPromptItems = getPromptItems();
      updateActiveAssistantAfterNavigation(promptItem);
    }, 700);
  }

  function togglePromptDirectory(promptItem) {
    if (expandedPromptIds.has(promptItem.id)) {
      expandedPromptIds.delete(promptItem.id);
    } else {
      expandedPromptIds.add(promptItem.id);
    }

    if (promptItem.assistantElement) {
      activePromptId = promptItem.id;
      activeAssistantElement = promptItem.assistantElement;
      activeHeadings = promptItem.headings || collectHeadings(promptItem.assistantElement, promptItem.id);
      outlineStatus = "";
      renderNavigator(currentPromptItems);
      return;
    }

    if (activePromptId !== promptItem.id) {
      handlePromptCardClick(promptItem);
      return;
    }

    renderNavigator(currentPromptItems);
  }

  function scrollToHeading(heading) {
    scrollToElement(heading.element, { resolveAnchor: false });
    highlightElement(heading.element);
  }

  function appendHighlightedText(parent, text, queryText) {
    const query = queryText.trim();
    if (!query) {
      parent.textContent = text;
      return;
    }

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let cursor = 0;
    let matchIndex = lowerText.indexOf(lowerQuery, cursor);

    if (matchIndex === -1) {
      parent.textContent = text;
      return;
    }

    while (matchIndex !== -1) {
      if (matchIndex > cursor) {
        parent.appendChild(document.createTextNode(text.slice(cursor, matchIndex)));
      }

      const mark = document.createElement("mark");
      mark.className = "cao-search-mark";
      mark.textContent = text.slice(matchIndex, matchIndex + query.length);
      parent.appendChild(mark);

      cursor = matchIndex + query.length;
      matchIndex = lowerText.indexOf(lowerQuery, cursor);
    }

    if (cursor < text.length) {
      parent.appendChild(document.createTextNode(text.slice(cursor)));
    }
  }

  function renderHeadingList(headings) {
    const list = document.createElement("ol");
    list.className = "cao-heading-list";

    headings.forEach((heading) => {
      const item = document.createElement("li");
      item.className = `cao-heading-list__item cao-heading-list__item--${heading.itemType || "flat"}`;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "cao-heading-button";

      const index = document.createElement("span");
      index.className = "cao-heading-index";
      index.textContent = heading.displayIndex || "";
      if (hasLeadingNumbering(heading.text)) {
        index.textContent = "";
        index.setAttribute("aria-hidden", "true");
      }

      const title = document.createElement("span");
      title.className = "cao-heading-title";
      title.textContent = heading.text;

      button.append(index, title);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        scrollToHeading(heading);
      });

      item.appendChild(button);
      list.appendChild(item);
    });

    return list;
  }

  function renderPromptCard(promptItem) {
    const isActive = activePromptId === promptItem.id;
    const isExpanded = expandedPromptIds.has(promptItem.id);
    const itemHeadings = isActive ? activeHeadings : promptItem.headings || [];
    const canShowDirectory = itemHeadings.length > 0 || (isActive && outlineStatus);
    const card = document.createElement("article");
    card.className = "cao-question-card";
    if (isActive) {
      card.classList.add("cao-question-card--active");
    }
    if (canShowDirectory) {
      card.classList.add("cao-question-card--has-directory");
    }

    if (canShowDirectory) {
      const toggleButton = document.createElement("button");
      toggleButton.type = "button";
      toggleButton.className = "cao-question-toggle";
      toggleButton.setAttribute("aria-expanded", String(isExpanded));
      toggleButton.setAttribute("aria-label", isExpanded ? "收起回答目录" : "展开回答目录");
      toggleButton.textContent = isExpanded ? "−" : "+";
      toggleButton.addEventListener("click", (event) => {
        event.stopPropagation();
        togglePromptDirectory(promptItem);
      });
      card.appendChild(toggleButton);
    }

    const content = document.createElement("button");
    content.type = "button";
    content.className = "cao-question-content";
    content.addEventListener("click", () => handlePromptCardClick(promptItem));

    const title = document.createElement("div");
    title.className = "cao-question-title";
    appendHighlightedText(title, getTextPreview(promptItem.text, 120), searchQuery);

    const index = document.createElement("span");
    index.className = "cao-question-index";
    index.textContent = `${promptItem.index}.`;

    content.append(index, title);
    card.appendChild(content);

    if (isExpanded && canShowDirectory) {
      const directory = document.createElement("div");
      directory.className = "cao-directory";

      if (isActive && outlineStatus) {
        const status = document.createElement("div");
        status.className = "cao-panel__empty";
        status.textContent = outlineStatus;
        directory.appendChild(status);
      } else if (itemHeadings.length > 0) {
        directory.appendChild(renderHeadingList(itemHeadings));
      }

      card.appendChild(directory);
    }

    return card;
  }

  function renderNavigator(promptItems) {
    const panel = createPanel();
    const body = panel.querySelector(`.${BODY_CLASS}`);
    const searchInput = panel.querySelector(`#${SEARCH_INPUT_ID}`);
    if (!body) {
      return;
    }

    if (searchInput && searchInput.value !== searchQuery) {
      searchInput.value = searchQuery;
    }

    body.replaceChildren();

    if (promptItems.length === 0) {
      const empty = document.createElement("div");
      empty.className = "cao-panel__empty";
      empty.textContent = "当前暂无历史问题";
      body.appendChild(empty);
      return;
    }

    const filteredItems = filterPromptItems(promptItems, searchQuery);
    if (filteredItems.length === 0) {
      const empty = document.createElement("div");
      empty.className = "cao-panel__empty";
      empty.textContent = "未找到匹配的问题";
      body.appendChild(empty);
      return;
    }

    const list = document.createElement("div");
    list.className = "cao-question-list";
    filteredItems.forEach((item) => {
      list.appendChild(renderPromptCard(item));
    });

    body.appendChild(list);
  }

  function refreshNavigator() {
    revealRightSideConversationNav();
    currentPromptItems = getPromptItems();
    if (activePromptId && !currentPromptItems.some((item) => item.id === activePromptId)) {
      activePromptId = "";
      activeAssistantElement = null;
      activeHeadings = [];
      outlineStatus = "";
    }
    renderNavigator(currentPromptItems);
  }

  function isPanelMutation(mutation) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) {
      return false;
    }

    const target = mutation.target && mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target : mutation.target.parentElement;
    return Boolean(target && panel.contains(target));
  }

  function scheduleScan(mutations) {
    if (mutations && mutations.length > 0 && mutations.every(isPanelMutation)) {
      return;
    }

    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(refreshNavigator, 300);
  }

  function startObserver() {
    if (observer || !document.body) {
      return;
    }

    observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function init() {
    createPanel();
    refreshNavigator();
    startObserver();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
