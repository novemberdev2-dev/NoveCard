/* ===================================================================
   NoveCard — app.js
   Decks are persisted to localStorage, so flashcards stay on this
   device (phone, tablet, or desktop browser) across sessions.
=================================================================== */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .catch(err => console.error('Service worker registration failed:', err));
  });
}

(function(){
  "use strict";

  /* ---------------- data ---------------- */
  const COLORS = ["#3E6FA8","#5C8A5A","#B4703E","#8A5FA8","#C1533F","#3F9098"];
  const STORAGE_KEY = "novecard_decks_v1";

  let decks = [];           // {id,name,color,favorite,deletedAt,cards:[card]}
  let uid = 1;
  const nextId = () => "id" + (uid++);

  function loadDecks(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.decks)){
        decks = parsed.decks;
        if (typeof parsed.uid === "number") uid = parsed.uid;
      }
    } catch(err){
      console.error("Couldn't load saved flashcards:", err);
    }
  }

  function saveDecks(){
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ decks, uid }));
    } catch(err){
      console.error("Couldn't save flashcards:", err);
      showToast("Couldn't save — device storage is full");
    }
  }

  function newCard(){
    return { id: nextId(), question: { elements: [] }, answer: { elements: [] } };
  }
  function newDeck(name){
    return {
      id: nextId(),
      name: name || "Untitled",
      color: COLORS[decks.length % COLORS.length],
      favorite: false,
      deletedAt: null,
      cards: [ newCard() ]
    };
  }

  /* ---------------- helpers ---------------- */
  const $ = (sel, ctx) => (ctx||document).querySelector(sel);
  const $all = (sel, ctx) => Array.from((ctx||document).querySelectorAll(sel));
  const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };

  function showToast(msg){
    let t = $("#toast");
    if (!t){ t = el("div","toast"); t.id="toast"; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._timer);
    t._timer = setTimeout(()=>t.classList.remove("show"), 1600);
  }

  function closeAllPopovers(){
    $all(".popover").forEach(p=>p.classList.add("hidden"));
    $("#scrim").classList.add("hidden");
  }
  function openPopover(pop, anchorRect){
    closeAllPopovers();
    $("#scrim").classList.remove("hidden");
    pop.classList.remove("hidden");
    // position, keeping inside viewport
    const margin = 10;
    pop.style.visibility = "hidden";
    pop.style.display = "block";
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = anchorRect.left;
    let top = anchorRect.bottom + 8;
    if (left + pw > window.innerWidth - margin) left = window.innerWidth - pw - margin;
    if (left < margin) left = margin;
    if (top + ph > window.innerHeight - margin) top = anchorRect.top - ph - 8;
    pop.style.left = left + "px";
    pop.style.top = top + "px";
    pop.style.visibility = "visible";
  }
  $("#scrim").addEventListener("click", closeAllPopovers);

  /* ---------------- view routing ---------------- */
  const views = {
    home: $("#view-home"),
    favorites: $("#view-favorites"),
    trash: $("#view-trash"),
    study: $("#view-study"),
    editor: $("#view-editor"),
  };
  function showView(name){
    Object.values(views).forEach(v=>v.classList.add("hidden"));
    views[name].classList.remove("hidden");
    const showNav = (name === "home" || name === "favorites" || name === "trash");
    $("#bottom-nav").classList.toggle("hidden", !showNav);
    $("#fab").classList.toggle("hidden", !showNav);
    if (showNav){
      $all(".nav-btn").forEach(b=>b.classList.toggle("active", b.dataset.view === name));
    }
  }

  /* ---------------- home / favorites / trash rendering ---------------- */
  function cardIconSVG(){
    return '<svg class="icon" viewBox="0 0 24 24" fill="none"><path d="M6 9V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-4" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M2 9h12v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  }
  function starIconSVG(){
    return '<svg viewBox="0 0 24 24"><path d="M12 4.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8L12 4.5Z"/></svg>';
  }
  function chevronSVG(){
    return '<svg class="icon" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function buildDeckCard(deck, opts){
    opts = opts || {};
    const wrap = el("div","deck-card");
    wrap.dataset.id = deck.id;

    const face = el("div","deck-card-face");
    face.style.background = deck.color;
    const count = el("span","deck-card-count");
    count.textContent = deck.cards.length + (deck.cards.length === 1 ? " card" : " cards");
    face.appendChild(count);
    if (deck.favorite){
      const fav = el("div","deck-card-fav");
      fav.innerHTML = starIconSVG();
      face.appendChild(fav);
    }
    wrap.appendChild(face);

    const label = el("div","deck-card-label");
    const nameSpan = el("span"); nameSpan.textContent = deck.name;
    label.appendChild(nameSpan);
    const chevBtn = el("button");
    chevBtn.type="button";
    chevBtn.style.cssText = "border:none;background:transparent;display:flex;cursor:pointer;padding:2px;color:inherit;";
    chevBtn.innerHTML = chevronSVG();
    chevBtn.title = "Options";
    label.appendChild(chevBtn);
    label.title = "Options";
    label.addEventListener("click", (e)=>{
      e.stopPropagation();
      if (opts.trash) openTrashMenu(deck, wrap);
      else openDeckMenu(deck, wrap);
    });
    wrap.appendChild(label);

    if (!opts.trash){
      wrap.addEventListener("click", ()=> openStudy(deck));
    }
    return wrap;
  }

  function renderAll(){
    saveDecks();
    renderHome();
    renderFavorites();
    renderTrash();
  }

  function renderHome(){
    const q = ($("#search-input").value || "").trim().toLowerCase();
    const grid = $("#deck-grid");
    grid.innerHTML = "";
    const list = decks.filter(d=>!d.deletedAt && d.name.toLowerCase().includes(q));
    list.forEach(d=> grid.appendChild(buildDeckCard(d)));
    grid.classList.toggle("has-items", list.length>0);
    $("#home-empty").style.display = list.length ? "none" : "block";
  }
  function renderFavorites(){
    const grid = $("#fav-grid");
    grid.innerHTML = "";
    const list = decks.filter(d=>!d.deletedAt && d.favorite);
    list.forEach(d=> grid.appendChild(buildDeckCard(d)));
    grid.classList.toggle("has-items", list.length>0);
    $("#fav-empty").style.display = list.length ? "none" : "block";
  }
  function renderTrash(){
    const grid = $("#trash-grid");
    grid.innerHTML = "";
    const list = decks.filter(d=>d.deletedAt);
    list.forEach(d=> grid.appendChild(buildDeckCard(d, {trash:true})));
    grid.classList.toggle("has-items", list.length>0);
    $("#trash-empty").style.display = list.length ? "none" : "block";
  }

  $("#search-input").addEventListener("input", renderHome);

  /* ---------------- bottom nav ---------------- */
  $all(".nav-btn").forEach(btn=>{
    btn.addEventListener("click", ()=> showView(btn.dataset.view));
  });

  /* ---------------- fab menu ---------------- */
  $("#fab").addEventListener("click", ()=>{
    openPopover($("#fab-menu"), $("#fab").getBoundingClientRect());
  });
  $("#menu-new-flashcard").addEventListener("click", ()=>{
    closeAllPopovers();
    openEditor({ mode:"new" });
  });

  /* ---------------- deck options popover ---------------- */
  let activeDeckForMenu = null;
  let activeDeckCardEl = null;
  function openDeckMenu(deck, cardEl){
    activeDeckForMenu = deck;
    activeDeckCardEl = cardEl;
    const favLabel = $("#deck-menu [data-favorite-label]");
    favLabel.textContent = deck.favorite ? "Unfavorite" : "Favorite";
    openPopover($("#deck-menu"), cardEl.getBoundingClientRect());
  }
  $("#deck-menu").addEventListener("click", (e)=>{
    const btn = e.target.closest(".popover-item");
    if (!btn || btn.disabled || !activeDeckForMenu) return;
    const deck = activeDeckForMenu;
    const action = btn.dataset.action;
    if (action === "color"){
      openColorPicker(deck, activeDeckCardEl.getBoundingClientRect());
    } else if (action === "rename"){
      openRenameBox(deck, activeDeckCardEl.getBoundingClientRect());
    } else if (action === "favorite"){
      deck.favorite = !deck.favorite;
      closeAllPopovers();
      renderAll();
      showToast(deck.favorite ? "Added to favorites" : "Removed from favorites");
    } else if (action === "delete"){
      closeAllPopovers();
      if (confirm("Move \u201c" + deck.name + "\u201d to trash?")){
        deck.deletedAt = Date.now();
        renderAll();
        showToast("Moved to trash");
      }
    }
  });

  /* ---------------- trash options popover ---------------- */
  let activeTrashDeck = null;
  function openTrashMenu(deck, cardEl){
    activeTrashDeck = deck;
    openPopover($("#trash-menu"), cardEl.getBoundingClientRect());
  }
  $("#trash-menu").addEventListener("click", (e)=>{
    const btn = e.target.closest(".popover-item");
    if (!btn || !activeTrashDeck) return;
    const deck = activeTrashDeck;
    const action = btn.dataset.action;
    if (action === "restore"){
      closeAllPopovers();
      deck.deletedAt = null;
      renderAll();
      showToast("Restored");
    } else if (action === "delete-forever"){
      closeAllPopovers();
      if (confirm("Delete \u201c" + deck.name + "\u201d forever? This can't be undone.")){
        decks = decks.filter(d=>d.id !== deck.id);
        renderAll();
      }
    }
  });

  function openColorPicker(deck, rect){
    const row = $("#swatch-row");
    row.innerHTML = "";
    COLORS.forEach(c=>{
      const sw = el("div","swatch" + (c===deck.color ? " selected" : ""));
      sw.style.background = c;
      sw.addEventListener("click", ()=>{
        deck.color = c;
        closeAllPopovers();
        renderAll();
      });
      row.appendChild(sw);
    });
    openPopover($("#color-picker"), rect);
  }

  function openRenameBox(deck, rect){
    const input = $("#rename-input");
    input.value = deck.name;
    openPopover($("#rename-box"), rect);
    input.focus();
    input.select();
    function commit(){
      deck.name = input.value.trim() || deck.name;
      closeAllPopovers();
      renderAll();
    }
    input.onkeydown = (e)=>{
      if (e.key === "Enter") commit();
      else if (e.key === "Escape") closeAllPopovers();
    };
    $("#rename-confirm").onclick = commit;
    $("#rename-cancel").onclick = ()=> closeAllPopovers();
  }

  /* ---------------- study view ---------------- */
  let study = { deck:null, cardIndex:0, revealed:false };

  function openStudy(deck){
    study.deck = deck;
    study.cardIndex = 0;
    study.revealed = false;
    renderStudy({instant:true});
    showView("study");
  }

  function renderElementsInto(container, elements){
    container.innerHTML = "";
    if (!elements.length) return;
    const textEls = elements.filter(e=>e.type==="text");
    const imgEls = elements.filter(e=>e.type==="image");
    imgEls.forEach(e=>{
      const img = document.createElement("img");
      img.src = e.content;
      img.style.maxWidth = "260px";
      container.appendChild(img);
    });
    textEls.forEach(e=>{
      const p = el("p","txt");
      p.textContent = e.content;
      container.appendChild(p);
    });
  }

  function renderStudy(opts){
    const instant = opts && opts.instant;
    const deck = study.deck;
    if (!deck) return;
    $("#study-deck-name").textContent = deck.name;
    const card = deck.cards[study.cardIndex];
    renderElementsInto($("#study-question-side"), card.question.elements);
    renderElementsInto($("#study-answer-side"), card.answer.elements);
    const inner = $("#study-card-inner");
    if (instant) inner.classList.add("no-anim");
    inner.classList.toggle("flipped", study.revealed);
    if (instant){
      // force the flip-reset to apply with no transition, then restore animation for next tap
      void inner.offsetHeight;
      inner.classList.remove("no-anim");
    }
    $("#study-hint").textContent = study.revealed ? "Tap the card to hide the answer" : "Tap the card to reveal the answer";
    $("#study-counter").textContent = "Q" + (study.cardIndex+1) + " / " + deck.cards.length;
    $("#study-prev").disabled = study.cardIndex === 0;
    $("#study-next").disabled = study.cardIndex === deck.cards.length - 1;
  }

  $("#study-card").addEventListener("click", ()=>{
    study.revealed = !study.revealed;
    renderStudy();
  });
  $("#study-prev").addEventListener("click", ()=>{
    if (study.cardIndex > 0){ study.cardIndex--; study.revealed=false; renderStudy({instant:true}); }
  });
  $("#study-next").addEventListener("click", ()=>{
    if (study.cardIndex < study.deck.cards.length - 1){ study.cardIndex++; study.revealed=false; renderStudy({instant:true}); }
  });
  $("#study-back").addEventListener("click", ()=> showView("home"));
  $("#study-edit").addEventListener("click", (e)=>{
    openEditor({ mode:"edit", deck: study.deck, cardIndex: study.cardIndex, lockedSide: null });
  });

  /* ================================================================
     EDITOR
  ================================================================ */
  let ed = null; // editor state

  function cloneCards(cards){ return JSON.parse(JSON.stringify(cards)); }

  function openEditor(opts){
    let deck, cards, cardIndex;
    if (opts.mode === "new"){
      deck = { id:null, name:"Untitled", color: COLORS[decks.length % COLORS.length], favorite:false };
      cards = [ newCard() ];
      cardIndex = 0;
    } else {
      deck = opts.deck;
      cards = cloneCards(deck.cards);
      cardIndex = opts.cardIndex || 0;
    }
    ed = {
      mode: opts.mode,
      deckRef: opts.mode === "edit" ? opts.deck : null,
      deckMeta: { name: deck.name, color: deck.color, favorite: !!deck.favorite },
      cards: cards,
      cardIndex: cardIndex,
      tool: "select",
      selectedId: null,
      lockedSide: opts.lockedSide || null,
      history: [],
      historyIndex: -1,
    };
    pushHistory();
    renderEditor();
    showView("editor");
  }

  function pushHistory(){
    ed.history = ed.history.slice(0, ed.historyIndex+1);
    ed.history.push(cloneCards(ed.cards));
    ed.historyIndex++;
    if (ed.history.length > 40){ ed.history.shift(); ed.historyIndex--; }
    updateUndoRedoButtons();
  }
  function undo(){
    if (ed.historyIndex <= 0) return;
    ed.historyIndex--;
    ed.cards = cloneCards(ed.history[ed.historyIndex]);
    if (ed.cardIndex >= ed.cards.length) ed.cardIndex = ed.cards.length - 1;
    ed.selectedId = null;
    renderEditor();
  }
  function redo(){
    if (ed.historyIndex >= ed.history.length - 1) return;
    ed.historyIndex++;
    ed.cards = cloneCards(ed.history[ed.historyIndex]);
    if (ed.cardIndex >= ed.cards.length) ed.cardIndex = ed.cards.length - 1;
    ed.selectedId = null;
    renderEditor();
  }
  function updateUndoRedoButtons(){
    $('.tool-btn[data-tool="undo"]').disabled = ed.historyIndex <= 0;
    $('.tool-btn[data-tool="redo"]').disabled = ed.historyIndex >= ed.history.length - 1;
  }

  function currentCard(){ return ed.cards[ed.cardIndex]; }

  function selectTool(tool){
    if (tool === "undo"){ undo(); return; }
    if (tool === "redo"){ redo(); return; }
    ed.tool = tool;
    ed.selectedId = null;
    $all(".tool-btn[data-tool]").forEach(b=>{
      if (b.dataset.tool === "undo" || b.dataset.tool === "redo") return;
      b.classList.toggle("active", b.dataset.tool === tool);
    });
    renderEditorPanes();
  }
  $all(".tool-btn[data-tool]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      if (btn.disabled) return;
      selectTool(btn.dataset.tool);
    });
  });

  function renderEditor(){
    $("#q-counter").textContent = "Q" + (ed.cardIndex + 1);
    $("#editor-prev").disabled = ed.cardIndex === 0;
    selectTool(ed.tool);
    renderEditorPanes();
    updateUndoRedoButtons();
  }

  function laneLocked(side){
    return ed.lockedSide === side;
  }

  function renderEditorPanes(){
    ["question","answer"].forEach(side=>{
      const pane = $("#pane-" + side);
      const card = currentCard();
      const data = card[side];
      // clear (keep placeholder node)
      pane.innerHTML = "";
      const ph = el("div","pane-placeholder");
      ph.textContent = side === "question" ? "Question\u2026" : "Answer\u2026";
      pane.appendChild(ph);
      pane.classList.toggle("has-elements", data.elements.length > 0);
      pane.classList.toggle("hidden-locked", false);
      pane.style.opacity = laneLocked(side) ? "0.45" : "1";
      pane.style.pointerEvents = laneLocked(side) ? "none" : "auto";

      data.elements.forEach(elem=> pane.appendChild(buildElementNode(elem, side)));
    });
  }

  function buildElementNode(elem, side){
    const wrap = el("div","el");
    wrap.dataset.id = elem.id;
    wrap.dataset.type = elem.type;
    wrap.style.left = elem.x + "px";
    wrap.style.top = elem.y + "px";
    wrap.style.transform = "rotate(" + (elem.rotation||0) + "deg)";
    if (elem.id === ed.selectedId) wrap.classList.add("selected");

    let contentNode;
    if (elem.type === "text"){
      contentNode = el("div","el-text");
      contentNode.contentEditable = "false";
      contentNode.textContent = elem.content || "";
      contentNode.addEventListener("input", ()=>{ elem.content = contentNode.textContent; });
      contentNode.addEventListener("blur", ()=>{
        contentNode.contentEditable = "false";
        contentNode.classList.remove("editing");
        if (!contentNode.textContent.trim()){
          // nothing was typed — discard the empty box instead of leaving it behind
          const arr = currentCard()[side].elements;
          const i = arr.findIndex(x=>x.id===elem.id);
          if (i>-1) arr.splice(i,1);
          if (ed.selectedId === elem.id) ed.selectedId = null;
          suppressNextPaneClick = true;
          pushHistory();
          renderEditorPanes();
          return;
        }
        pushHistory();
      });
      contentNode.addEventListener("dblclick", (e)=>{
        if (laneLocked(side)) return;
        e.stopPropagation();
        contentNode.contentEditable = "true";
        contentNode.classList.add("editing");
        contentNode.focus();
        placeCaretAtEnd(contentNode);
      });
      wrap.appendChild(contentNode);
    } else {
      wrap.style.width = elem.w + "px";
      wrap.style.height = elem.h + "px";
      contentNode = document.createElement("img");
      contentNode.src = elem.content;
      wrap.appendChild(contentNode);
    }

    wrap.addEventListener("mousedown", (e)=> startDrag(e, elem, side, wrap, contentNode));
    wrap.addEventListener("touchstart", (e)=> startDrag(e, elem, side, wrap, contentNode), {passive:false});
    wrap.addEventListener("click", (e)=>{ e.stopPropagation(); suppressNextPaneClick = false; selectElement(elem.id, side); });

    if (elem.id === ed.selectedId){
      wrap.appendChild(buildElementToolbar(elem, side));
      if (elem.type === "image"){
        ["nw","ne","sw","se"].forEach(corner=>{
          const h = el("div","resize-handle " + corner);
          h.addEventListener("mousedown", (e)=> startResize(e, elem, side, corner));
          h.addEventListener("touchstart", (e)=> startResize(e, elem, side, corner), {passive:false});
          wrap.appendChild(h);
        });
      }
    }
    return wrap;
  }

  function buildElementToolbar(elem, side){
    const bar = el("div","el-toolbar" + (elem.y < 50 ? " below" : ""));
    if (elem.type === "image"){
      const angleBtn = el("button","angle-badge");
      angleBtn.textContent = (elem.rotation||0) + "\u00B0";
      angleBtn.title = "Rotate 15\u00B0";
      angleBtn.addEventListener("click",(e)=>{
        e.stopPropagation();
        elem.rotation = ((elem.rotation||0) + 15) % 360;
        pushHistory();
        renderEditorPanes();
      });
      bar.appendChild(angleBtn);
    }
    const dupBtn = el("button");
    dupBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M9 20h9a2 2 0 0 0 2-2V9" stroke="currentColor" stroke-width="2"/></svg>';
    dupBtn.title = "Duplicate";
    dupBtn.addEventListener("click",(e)=>{
      e.stopPropagation();
      const copy = JSON.parse(JSON.stringify(elem));
      copy.id = nextId();
      copy.x += 16; copy.y += 16;
      currentCard()[side].elements.push(copy);
      ed.selectedId = copy.id;
      pushHistory();
      renderEditorPanes();
    });
    bar.appendChild(dupBtn);

    const delBtn = el("button","danger");
    delBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none"><path d="M4 7h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
    delBtn.title = "Delete";
    delBtn.addEventListener("click",(e)=>{
      e.stopPropagation();
      const arr = currentCard()[side].elements;
      const i = arr.findIndex(x=>x.id===elem.id);
      if (i>-1) arr.splice(i,1);
      ed.selectedId = null;
      pushHistory();
      renderEditorPanes();
    });
    bar.appendChild(delBtn);
    return bar;
  }

  function placeCaretAtEnd(node){
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function selectElement(id, side){
    if (laneLocked(side)) return;
    if (ed.selectedId === id) return; // already selected — avoid re-render (would drop focus/editing state)
    ed.selectedId = id;
    renderEditorPanes();
  }

  /* dragging */
  let dragCtx = null;
  let suppressNextPaneClick = false;
  function startDrag(e, elem, side, wrap, contentNode){
    if (laneLocked(side)) return;
    if (elem.type === "text" && contentNode.isContentEditable) return; // let native caret/selection work while editing
    e.preventDefault();
    const point = e.touches ? e.touches[0] : e;
    dragCtx = { elem, side, startX: point.clientX, startY: point.clientY, origX: elem.x, origY: elem.y, moved:false };
    selectElement(elem.id, side);
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", onDragEnd);
    window.addEventListener("touchmove", onDragMove, {passive:false});
    window.addEventListener("touchend", onDragEnd);
  }
  function onDragMove(e){
    if (!dragCtx) return;
    e.preventDefault();
    const point = e.touches ? e.touches[0] : e;
    const dx = point.clientX - dragCtx.startX;
    const dy = point.clientY - dragCtx.startY;
    if (Math.abs(dx)>2 || Math.abs(dy)>2) dragCtx.moved = true;
    dragCtx.elem.x = Math.max(0, dragCtx.origX + dx);
    dragCtx.elem.y = Math.max(0, dragCtx.origY + dy);
    const pane = $("#pane-" + dragCtx.side);
    const node = pane.querySelector('.el[data-id="'+dragCtx.elem.id+'"]');
    if (node){ node.style.left = dragCtx.elem.x + "px"; node.style.top = dragCtx.elem.y + "px"; }
  }
  function onDragEnd(){
    if (dragCtx && dragCtx.moved) pushHistory();
    dragCtx = null;
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", onDragEnd);
    window.removeEventListener("touchmove", onDragMove);
    window.removeEventListener("touchend", onDragEnd);
  }

  /* resizing (images only) */
  let resizeCtx = null;
  function startResize(e, elem, side, corner){
    e.preventDefault(); e.stopPropagation();
    const point = e.touches ? e.touches[0] : e;
    resizeCtx = { elem, side, corner, startX: point.clientX, startY: point.clientY, origW: elem.w, origH: elem.h, origX: elem.x, origY: elem.y };
    window.addEventListener("mousemove", onResizeMove);
    window.addEventListener("mouseup", onResizeEnd);
    window.addEventListener("touchmove", onResizeMove, {passive:false});
    window.addEventListener("touchend", onResizeEnd);
  }
  function onResizeMove(e){
    if (!resizeCtx) return;
    e.preventDefault();
    const point = e.touches ? e.touches[0] : e;
    const dx = point.clientX - resizeCtx.startX;
    const dy = point.clientY - resizeCtx.startY;
    const { elem, corner } = resizeCtx;
    let w = resizeCtx.origW, h = resizeCtx.origH, x = resizeCtx.origX, y = resizeCtx.origY;
    if (corner.includes("e")) w = Math.max(40, resizeCtx.origW + dx);
    if (corner.includes("s")) h = Math.max(40, resizeCtx.origH + dy);
    if (corner.includes("w")){ w = Math.max(40, resizeCtx.origW - dx); x = resizeCtx.origX + dx; }
    if (corner.includes("n")){ h = Math.max(40, resizeCtx.origH - dy); y = resizeCtx.origY + dy; }
    elem.w = w; elem.h = h; elem.x = x; elem.y = y;
    const pane = $("#pane-" + resizeCtx.side);
    const node = pane.querySelector('.el[data-id="'+elem.id+'"]');
    if (node){
      node.style.width = w+"px"; node.style.height = h+"px";
      node.style.left = x+"px"; node.style.top = y+"px";
    }
  }
  function onResizeEnd(){
    if (resizeCtx) pushHistory();
    resizeCtx = null;
    window.removeEventListener("mousemove", onResizeMove);
    window.removeEventListener("mouseup", onResizeEnd);
    window.removeEventListener("touchmove", onResizeMove);
    window.removeEventListener("touchend", onResizeEnd);
  }

  /* clicking empty pane area with text/image tool */
  ["question","answer"].forEach(side=>{
    $("#pane-" + side).addEventListener("click", (e)=>{
      if (suppressNextPaneClick){ suppressNextPaneClick = false; return; }
      if (e.target.closest(".el")) return;
      if (laneLocked(side)) return;
      const pane = $("#pane-" + side);
      if ((ed.tool === "text" || ed.tool === "image") && ed.selectedId){
        // first tap on empty space just clears the current selection
        // (hides its floating toolbar) instead of also creating a new element
        ed.selectedId = null;
        renderEditorPanes();
        return;
      }
      const rect = pane.getBoundingClientRect();
      const x = e.clientX - rect.left + pane.scrollLeft;
      const y = e.clientY - rect.top + pane.scrollTop;
      if (ed.tool === "text"){
        const elem = { id: nextId(), type:"text", x: Math.max(0,x-10), y: Math.max(0,y-12), rotation:0, content:"" };
        currentCard()[side].elements.push(elem);
        ed.selectedId = elem.id;
        pushHistory();
        renderEditorPanes();
        requestAnimationFrame(()=>{
          const wrap = pane.querySelector('.el[data-id="'+elem.id+'"]');
          const textNode = wrap ? wrap.querySelector(".el-text") : null;
          if (textNode){
            textNode.contentEditable = "true";
            textNode.classList.add("editing");
            textNode.focus();
            placeCaretAtEnd(textNode);
          }
        });
      } else if (ed.tool === "image"){
        pendingImageTarget = { side, x: Math.max(0,x-60), y: Math.max(0,y-45) };
        $("#file-input").click();
      } else {
        ed.selectedId = null;
        renderEditorPanes();
      }
    });
  });

  let pendingImageTarget = null;
  $("#file-input").addEventListener("change", (e)=>{
    const file = e.target.files[0];
    e.target.value = "";
    if (!file || !pendingImageTarget) return;
    const reader = new FileReader();
    reader.onload = function(evt){
      const elem = { id: nextId(), type:"image", x: pendingImageTarget.x, y: pendingImageTarget.y, w:180, h:135, rotation:0, content: evt.target.result };
      currentCard()[pendingImageTarget.side].elements.push(elem);
      ed.selectedId = elem.id;
      pushHistory();
      renderEditorPanes();
      pendingImageTarget = null;
    };
    reader.readAsDataURL(file);
  });

  /* prev / next / delete-question */
  $("#editor-prev").addEventListener("click", ()=>{
    if (ed.cardIndex > 0){
      ed.cardIndex--;
      ed.selectedId = null;
      renderEditor();
    }
  });
  $("#editor-next").addEventListener("click", ()=>{
    if (ed.cardIndex < ed.cards.length - 1){
      ed.cardIndex++;
    } else {
      ed.cards.push(newCard());
      ed.cardIndex = ed.cards.length - 1;
      pushHistory();
    }
    ed.selectedId = null;
    renderEditor();
  });
  $("#editor-delete-q").addEventListener("click", ()=>{
    if (ed.cards.length <= 1){
      showToast("A flashcard needs at least one question");
      return;
    }
    ed.cards.splice(ed.cardIndex, 1);
    if (ed.cardIndex >= ed.cards.length) ed.cardIndex = ed.cards.length - 1;
    ed.selectedId = null;
    pushHistory();
    renderEditor();
  });

  /* cancel / save */
  $("#editor-cancel").addEventListener("click", ()=>{
    const back = ed.mode === "edit" ? "study" : "home";
    ed = null;
    if (back === "study") renderStudy();
    showView(back);
  });
  $("#editor-save").addEventListener("click", ()=>{
    if (ed.mode === "new"){
      const deck = newDeck(ed.deckMeta.name);
      deck.color = ed.deckMeta.color;
      deck.cards = ed.cards;
      decks.push(deck);
      ed = null;
      renderAll();
      showView("home");
      showToast("Flashcard saved");
    } else {
      ed.deckRef.cards = ed.cards;
      study.deck = ed.deckRef;
      if (study.cardIndex >= study.deck.cards.length) study.cardIndex = 0;
      ed = null;
      renderAll();
      renderStudy({instant:true});
      showView("study");
      showToast("Changes saved");
    }
  });

  /* keyboard delete for selected element */
  document.addEventListener("keydown", (e)=>{
    if (!ed || !ed.selectedId) return;
    if (document.activeElement && document.activeElement.isContentEditable) return;
    if (e.key === "Delete" || e.key === "Backspace"){
      const side = ed.lockedSide === "question" ? "answer" : "question";
      ["question","answer"].forEach(s=>{
        const arr = currentCard()[s].elements;
        const i = arr.findIndex(x=>x.id===ed.selectedId);
        if (i>-1){ arr.splice(i,1); ed.selectedId=null; pushHistory(); renderEditorPanes(); }
      });
    }
  });

  /* ---------------- init ---------------- */
  loadDecks();
  renderAll();
  showView("home");

})();
