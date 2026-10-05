// Products: Admin mode's Products tab — one row per product in the New
// Case dropdown (data.js getProducts, from the products tables), like a
// client list, alphabetical.
//
// Collapsed row: the product, its product type (what its cases record
// and how commission and PCR are worked out — PRODUCT_TYPES in
// constants.js), its number of own stages, its case pack size, and an
// edit button at the far right (name, type, Delete product).
//
// Clicking a row opens its stages and its case pack, side by side (one
// row open at a time). Each list is read-only until its Edit button is
// clicked; then rename an item in place (Enter or clicking away saves,
// Esc puts it back), × removes it, drag ⋮⋮ to reorder (stages only — the
// case pack is alphabetical), and the box under the list adds one. Done
// goes back to read-only. The standard stages are on every product and
// shown fixed: Opened and Submitted first, Accepted / Not taken up — the
// two ways a case ends — last. The product's own stages always come
// between Submitted and Accepted.
//
// Open cases follow the product as it's edited; closed ones keep what
// they had (SPEC.md, "Admin-only: Products"). The database refuses to
// delete a product, or remove a stage, that open cases are using — its
// message is shown as is.
//
// Rows reuse the FA list's styles (team.js: .fa-wrapper, .fa-row, …), and
// its popup form (_faFormDialog).

function _injectProductsCSS() {
  if (document.getElementById('products-styles')) return;
  const s = document.createElement('style');
  s.id = 'products-styles';
  s.textContent = `
    .pe { display: flex; gap: 40px; align-items: flex-start; }
    .pe-col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .pe-list { display: flex; flex-direction: column; gap: 4px; }
    .pe-list:empty { display: none; }
    .pe-fixed,
    .pe-item {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 34px;
      padding: 0 8px;
      border-radius: 6px;
      color: var(--ink);
    }
    .pe-fixed { background: #f2f2f0; color: var(--ink-dim); font-size: 13px; padding-left: 30px; }
    .pe-fixed::after { content: 'Standard'; margin-left: auto; padding-right: 4px; font-size: 11px; color: var(--ink-dim); }
    .pe-item.view { padding-left: 30px; font-size: 13px; }
    .pe-list[data-part="checklist"] .pe-item:not(.view) { padding-left: 23px; } /* no handle: text lines up with view mode */
    .pe-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
    .pe-head .fa-detail-title { margin-bottom: 0; }
    .pe-edit {
      background: none;
      border: 1px solid rgba(0, 0, 0, 0.15);
      border-radius: 6px;
      padding: 4px 12px;
      font-size: 12px;
      font-weight: 600;
      font-family: inherit;
      color: var(--ink-dim);
      cursor: pointer;
    }
    .pe-edit:hover { border-color: var(--gold); color: var(--ink); }
    .pe-edit.done { background: var(--gold); border-color: var(--gold); color: var(--navy); }
    .pe-item { border: 1px solid rgba(0, 0, 0, 0.08); background: #ffffff; }
    .pe-item.dragging { opacity: 0.4; }
    .pe-handle {
      width: 14px;
      flex-shrink: 0;
      color: var(--ink-dim);
      cursor: grab;
      user-select: none;
      text-align: center;
      letter-spacing: -2px;
    }
    .pe-label {
      flex: 1;
      min-width: 0;
      border: 1px solid transparent;
      border-radius: 4px;
      background: transparent;
      padding: 5px 6px;
      font-size: 13px;
      font-family: inherit;
      color: var(--ink);
    }
    .pe-label:hover { border-color: rgba(0, 0, 0, 0.1); }
    .pe-label:focus { border-color: var(--gold); outline: none; background: #ffffff; }
    .pe-remove {
      width: 24px;
      height: 24px;
      flex-shrink: 0;
      border: none;
      border-radius: 50%;
      background: none;
      color: var(--ink-dim);
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
      opacity: 0;
    }
    .pe-item:hover .pe-remove,
    .pe-remove:focus { opacity: 1; }
    .pe-remove:hover { color: var(--red); background: rgba(232, 92, 92, 0.1); }
    .pe-add {
      border: 1px dashed rgba(0, 0, 0, 0.2);
      border-radius: 6px;
      background: transparent;
      padding: 8px 10px;
      font-size: 13px;
      font-family: inherit;
      color: var(--ink);
    }
    .pe-add:focus { border-style: solid; border-color: var(--gold); outline: none; background: #ffffff; }
  `;
  document.head.appendChild(s);
}
_injectProductsCSS();

let _openProduct = null;   // the id of the product whose row is open
let _refocusPart = null;   // after adding an item, put the cursor back in that list's add box
const _editingParts = new Set(); // the open product's lists in edit mode: 'stages', 'checklist'

function _productCaptures(type) {
  return productIsPremiumOnly(type) ? 'Monthly premium' : 'Lump sum, monthly premium & advice fee';
}

const _PART_NOUN = { stages: 'stage', checklist: 'case pack item' };

function _peItemHTML(item, editing, part) {
  if (!editing) {
    return `<div class="pe-item view">${_escHtml(item.label)}</div>`;
  }
  return `
    <div class="pe-item" data-id="${item.id}">
      ${part === 'stages' ? '<span class="pe-handle" draggable="true" title="Drag to reorder">⋮⋮</span>' : ''}
      <input class="pe-label" value="${_escHtml(item.label)}" data-original="${_escHtml(item.label)}" aria-label="Name">
      <button type="button" class="pe-remove" title="Remove">&times;</button>
    </div>
  `;
}

function _peHeadHTML(part, title) {
  const editing = _editingParts.has(part);
  return `
    <div class="pe-head">
      <span class="fa-detail-title">${title}</span>
      <button type="button" class="pe-edit${editing ? ' done' : ''}" data-edit-part="${part}">${editing ? 'Done' : 'Edit'}</button>
    </div>
  `;
}

function _peListHTML(p, part, placeholder) {
  const editing = _editingParts.has(part);
  return `
    <div class="pe-list" data-part="${part}">${p[part].map(item => _peItemHTML(item, editing, part)).join('')}</div>
    ${editing ? `<input class="pe-add" data-part="${part}" placeholder="${placeholder}">` : ''}
  `;
}

function _productDetailHTML(p) {
  const fixed = label => `<div class="pe-fixed">${label}</div>`;
  return `
    <div class="pe" data-product-id="${p.id}">
      <div class="pe-col">
        ${_peHeadHTML('stages', 'Stages')}
        ${fixed(CASE_STAGE_LABELS.opened)}
        ${fixed(CASE_STAGE_LABELS.submitted)}
        ${_peListHTML(p, 'stages', '+ Add a stage (Enter to save)')}
        ${fixed(`${CASE_STAGE_LABELS.accepted} / ${CASE_STAGE_LABELS['not-taken-up']}`)}
      </div>
      <div class="pe-col">
        ${_peHeadHTML('checklist', `Case pack · ${p.checklist.length} item${p.checklist.length === 1 ? '' : 's'}`)}
        ${_peListHTML(p, 'checklist', '+ Add an item (Enter to save)')}
      </div>
    </div>
  `;
}

function _productRowHTML(p) {
  const open = p.id === _openProduct;
  const own = p.stages.length;
  return `
    <div class="fa-wrapper">
      <div class="fa-row${open ? ' active' : ''}" data-product="${p.id}">
        <div class="name"><b>${_escHtml(p.name)}</b></div>
        <span class="fa-meta">${PRODUCT_TYPE_LABELS[p.type] || ''}</span>
        <span class="fa-meta">${_productCaptures(p.type)}</span>
        <span class="spacer"></span>
        <span class="fa-chip">${own ? `${own} own stage${own === 1 ? '' : 's'}` : 'Standard stages'}</span>
        <span class="fa-chip">${p.checklist.length}-item case pack</span>
        <button type="button" class="fa-edit" data-product-edit title="Edit ${_escHtml(p.name)}">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      </div>
      <div class="fa-detail${open ? ' open' : ''}">${open ? _productDetailHTML(p) : ''}</div>
    </div>
  `;
}

function _renderProducts() {
  const container = document.getElementById('products-cards');
  if (!container) return;
  if (_openProduct && !getProduct(_openProduct)) _openProduct = null;
  const products = getProducts();
  container.innerHTML = products.length
    ? products.map(_productRowHTML).join('')
    : '<div class="fa-list-empty">No products yet. Use + (bottom right) to add one.</div>';
  if (_refocusPart) {
    container.querySelector(`.pe-add[data-part="${_refocusPart}"]`)?.focus();
    _refocusPart = null;
  }
}

// What the database said, shown as it is ("Risk has 2 open cases…").
function _productProblem(err) {
  console.error(err);
  return showChoiceDialog({
    title: "Couldn't save that",
    message: err.message || String(err),
    choices: [{ label: 'OK', value: true, primary: true }],
  });
}

// ---------- add / edit a product ----------

const _TYPE_OPTIONS = PRODUCT_TYPES.map(t => ({ value: t.key, label: t.label }));

function _checkProductName(v) {
  if (!v.name) throw new Error('Give the product a name.');
}

function _addProduct() {
  return _faFormDialog({
    title: 'Add a product',
    fields: [
      { key: 'name', label: 'Name' },
      { key: 'type', label: 'Product type', options: _TYPE_OPTIONS, value: 'investment' },
    ],
    submitLabel: 'Add product',
    onSubmit: async v => {
      _checkProductName(v);
      await dbAddProduct(v);
    },
  });
}

function _openCasesText(n) {
  return `${n} open case${n === 1 ? '' : 's'}`;
}

async function _editProduct(p) {
  const save = async v => {
    _checkProductName(v);
    if (v.type !== p.type) {
      const open = await dbCountOpenCases(p.id);
      if (open) {
        const ok = await showChoiceDialog({
          title: `Make ${p.name} ${PRODUCT_TYPE_LABELS[v.type]}?`,
          message: `${p.name} has ${_openCasesText(open)}. They change too: what they record, and how their commission and PCR are worked out. Closed cases keep their type.`,
          choices: [{ label: 'Cancel', value: null }, { label: 'Change type', value: true, primary: true }],
        });
        if (!ok) return false;
      }
    }
    await dbUpdateProduct(p.id, v);
  };
  const remove = async () => {
    const open = await dbCountOpenCases(p.id);
    if (open) {
      await showChoiceDialog({
        title: `${p.name} is in use`,
        message: `${p.name} has ${_openCasesText(open)}. They need to be accepted or marked not taken up before it can be deleted.`,
        choices: [{ label: 'OK', value: true, primary: true }],
      });
      return false;
    }
    const ok = await showChoiceDialog({
      title: `Delete ${p.name}?`,
      message: `${p.name} leaves the New Case dropdown for good. Cases already closed on it keep their name, stages and case pack. This can't be undone.`,
      choices: [{ label: 'Cancel', value: null }, { label: 'Delete product', value: true, primary: true }],
    });
    if (!ok) return false;
    await dbDeleteProduct(p.id);
  };
  return _faFormDialog({
    title: `Edit ${p.name}`,
    fields: [
      { key: 'name', label: 'Name', value: p.name },
      { key: 'type', label: 'Product type', options: _TYPE_OPTIONS, value: p.type },
    ],
    submitLabel: 'Save',
    onSubmit: save,
    extra: { label: 'Delete product', onClick: remove },
  });
}

// ---------- stages and case pack ----------

function _peContext(el) {
  const product = getProduct(el.closest('.pe')?.dataset.productId);
  const part = el.closest('[data-part]')?.dataset.part;
  return { product, part };
}

async function _addItem(input) {
  const { product, part } = _peContext(input);
  const label = input.value.trim();
  if (!product || !label) return;
  input.disabled = true;
  try {
    _refocusPart = part;
    await dbAddProductItem(part, product.id, label);
  } catch (err) {
    _refocusPart = null;
    input.disabled = false;
    _productProblem(err);
  }
}

async function _renameItem(input) {
  const label = input.value.trim();
  const original = input.dataset.original;
  if (!label) input.value = original;
  if (!label || label === original) return;
  const { part } = _peContext(input);
  try {
    await dbRenameProductItem(part, input.closest('.pe-item').dataset.id, label);
  } catch (err) {
    input.value = original;
    _productProblem(err);
  }
}

async function _removeItem(btn) {
  const { product, part } = _peContext(btn);
  const id = btn.closest('.pe-item').dataset.id;
  const item = product?.[part].find(x => x.id === id);
  if (!item) return;
  const message = part === 'stages'
    ? `Remove the "${item.label}" stage from ${product.name}? FAs won't be able to pick it any more. Closed cases keep it.`
    : `Remove "${item.label}" from ${product.name}'s case pack? Open ${product.name} cases stop counting it; closed ones keep it.`;
  const ok = await showChoiceDialog({
    title: `Remove this ${_PART_NOUN[part]}?`,
    message,
    choices: [{ label: 'Cancel', value: null }, { label: 'Remove', value: true, primary: true }],
  });
  if (!ok) return;
  try {
    await dbRemoveProductItem(part, id);
  } catch (err) {
    _productProblem(err);
  }
}

// ---------- drag to reorder ----------

let _peDragItem = null;
let _peDragStartOrder = '';

function _peOrder(list) {
  return [...list.querySelectorAll('.pe-item')].map(el => el.dataset.id);
}

function _initProductDrag(root) {
  root.addEventListener('dragstart', e => {
    const handle = e.target.closest?.('.pe-handle');
    if (!handle) return;
    _peDragItem = handle.closest('.pe-item');
    _peDragStartOrder = _peOrder(_peDragItem.parentElement).join();
    _peDragItem.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
    e.dataTransfer.setDragImage(_peDragItem, 20, 17);
  });
  // Only within the list it came from: moves it above or below whichever
  // item the pointer is over.
  root.addEventListener('dragover', e => {
    if (!_peDragItem) return;
    const list = _peDragItem.parentElement;
    const over = e.target.closest?.('.pe-item');
    if (!over || over.parentElement !== list) return;
    e.preventDefault();
    if (over === _peDragItem) return;
    const r = over.getBoundingClientRect();
    list.insertBefore(_peDragItem, e.clientY < r.top + r.height / 2 ? over : over.nextSibling);
  });
  root.addEventListener('drop', e => {
    if (_peDragItem) e.preventDefault();
  });
  root.addEventListener('dragend', async () => {
    const item = _peDragItem;
    if (!item) return;
    _peDragItem = null;
    item.classList.remove('dragging');
    const ids = _peOrder(item.parentElement);
    if (ids.join() === _peDragStartOrder) return;
    try {
      await dbReorderProductItems(_peContext(item).part, ids);
    } catch (err) {
      _renderProducts(); // back to the saved order
      _productProblem(err);
    }
  });
}

// ---------- wiring ----------

function initProducts(root) {
  root.addEventListener('click', e => {
    if (e.target.closest('.btn-add-product')) {
      _addProduct().catch(_productProblem);
      return;
    }
    const editBtn = e.target.closest('[data-edit-part]');
    if (editBtn) {
      const part = editBtn.dataset.editPart;
      if (_editingParts.has(part)) _editingParts.delete(part);
      else {
        _editingParts.add(part);
        _refocusPart = part;
      }
      _renderProducts();
      return;
    }
    const remove = e.target.closest('.pe-remove');
    if (remove) {
      _removeItem(remove);
      return;
    }
    const row = e.target.closest('.fa-row[data-product]');
    if (!row) return;
    const p = getProduct(row.dataset.product);
    if (!p) return;
    if (e.target.closest('[data-product-edit]')) {
      _editProduct(p).catch(_productProblem);
      return;
    }
    _openProduct = _openProduct === p.id ? null : p.id;
    _editingParts.clear();
    _renderProducts();
  });

  root.addEventListener('keydown', e => {
    const add = e.target.closest?.('.pe-add');
    if (add && e.key === 'Enter') {
      e.preventDefault();
      _addItem(add);
      return;
    }
    if (add && e.key === 'Escape') {
      add.value = '';
      add.blur();
      return;
    }
    const label = e.target.closest?.('.pe-label');
    if (!label) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      label.blur(); // saves (focusout, below)
    } else if (e.key === 'Escape') {
      label.value = label.dataset.original;
      label.blur();
    }
  });
  root.addEventListener('focusout', e => {
    if (e.target.matches?.('.pe-label')) _renameItem(e.target);
  });

  _initProductDrag(root);
  document.addEventListener('products:changed', _renderProducts);
}
