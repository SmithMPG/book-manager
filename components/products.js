// Products: Admin mode's Products page (☰ → Products) — one row per
// product in the New Case dropdown (data.js getProducts), like a client
// list, alphabetical.
//
// Collapsed row: the product, its product type (what its cases record
// and how commission and PCR are worked out — PRODUCT_TYPES in
// constants.js), its checklist size, and an edit button at the far right
// (name, type, Delete product).
//
// Clicking a row opens its checklist (one row open at a time) — what has
// to be in place before a case is submitted. Every case has the same
// stages (Opened → Submitted → Accepted or Not taken up), so there's
// nothing else to set per product. The checklist is read-only until its
// Edit button is clicked; then rename an item in place (Enter or clicking
// away saves, Esc puts it back), × removes it, and the box under the list
// adds one. Done goes back to read-only. Always alphabetical.
//
// Open cases follow the product as it's edited; closed ones keep the
// checklist they had (SPEC.md, "Admin-only: Products"). The database
// refuses to delete a product open cases are using — its message is
// shown as is.
//
// Rows reuse the FA list's styles (team.js: .fa-wrapper, .fa-row, …), and
// its popup form (_faFormDialog).

function _injectProductsCSS() {
  if (document.getElementById('products-styles')) return;
  const s = document.createElement('style');
  s.id = 'products-styles';
  s.textContent = `
    .pe { max-width: 640px; display: flex; flex-direction: column; gap: 4px; }
    .pe-list { display: flex; flex-direction: column; gap: 4px; }
    .pe-list:empty { display: none; }
    .pe-item {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 34px;
      padding: 0 8px 0 23px;
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 6px;
      background: #ffffff;
      color: var(--ink);
    }
    .pe-item.view { padding-left: 30px; font-size: 13px; }
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
let _editingChecklist = false; // the open product's checklist is in edit mode
let _refocusAdd = false;   // after adding an item, put the cursor back in the add box

function _productCaptures(type) {
  return productIsPremiumOnly(type) ? 'Monthly premium' : 'Lump sum, monthly premium & advice fee';
}

function _checklistItemHTML(item) {
  if (!_editingChecklist) return `<div class="pe-item view">${_escHtml(item.label)}</div>`;
  return `
    <div class="pe-item" data-id="${item.id}">
      <input class="pe-label" value="${_escHtml(item.label)}" data-original="${_escHtml(item.label)}" aria-label="Name">
      <button type="button" class="pe-remove" title="Remove">&times;</button>
    </div>
  `;
}

function _productDetailHTML(p) {
  const n = p.checklist.length;
  return `
    <div class="pe" data-product-id="${p.id}">
      <div class="pe-head">
        <span class="fa-detail-title">Checklist · ${n} item${n === 1 ? '' : 's'}</span>
        <button type="button" class="pe-edit${_editingChecklist ? ' done' : ''}" data-edit-checklist>${_editingChecklist ? 'Done' : 'Edit'}</button>
      </div>
      <div class="pe-list">${p.checklist.map(_checklistItemHTML).join('')}</div>
      ${_editingChecklist ? '<input class="pe-add" placeholder="+ Add an item (Enter to save)">' : ''}
    </div>
  `;
}

function _productRowHTML(p) {
  const open = p.id === _openProduct;
  return `
    <div class="fa-wrapper">
      <div class="fa-row${open ? ' active' : ''}" data-product="${p.id}">
        <div class="name"><b>${_escHtml(p.name)}</b></div>
        <span class="fa-meta">${PRODUCT_TYPE_LABELS[p.type] || ''}</span>
        <span class="fa-meta">${_productCaptures(p.type)}</span>
        <span class="spacer"></span>
        <span class="fa-chip">${p.checklist.length}-item checklist</span>
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
  if (_refocusAdd) {
    container.querySelector('.pe-add')?.focus();
    _refocusAdd = false;
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
      message: `${p.name} leaves the New Case dropdown for good. Cases already closed on it keep their name and checklist. This can't be undone.`,
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

// ---------- the checklist ----------

function _checklistProduct(el) {
  return getProduct(el.closest('.pe')?.dataset.productId);
}

async function _addItem(input) {
  const product = _checklistProduct(input);
  const label = input.value.trim();
  if (!product || !label) return;
  input.disabled = true;
  try {
    _refocusAdd = true;
    await dbAddChecklistItem(product.id, label);
  } catch (err) {
    _refocusAdd = false;
    input.disabled = false;
    _productProblem(err);
  }
}

async function _renameItem(input) {
  const label = input.value.trim();
  const original = input.dataset.original;
  if (!label) input.value = original;
  if (!label || label === original) return;
  try {
    await dbRenameChecklistItem(input.closest('.pe-item').dataset.id, label);
  } catch (err) {
    input.value = original;
    _productProblem(err);
  }
}

async function _removeItem(btn) {
  const product = _checklistProduct(btn);
  const id = btn.closest('.pe-item').dataset.id;
  const item = product?.checklist.find(x => x.id === id);
  if (!item) return;
  const ok = await showChoiceDialog({
    title: 'Remove this checklist item?',
    message: `Remove "${item.label}" from ${product.name}'s checklist? Open ${product.name} cases stop counting it; closed ones keep it.`,
    choices: [{ label: 'Cancel', value: null }, { label: 'Remove', value: true, primary: true }],
  });
  if (!ok) return;
  try {
    await dbRemoveChecklistItem(id);
  } catch (err) {
    _productProblem(err);
  }
}

// ---------- wiring ----------

function initProducts(root) {
  root.addEventListener('click', e => {
    if (e.target.closest('.btn-add-product')) {
      _addProduct().catch(_productProblem);
      return;
    }
    if (e.target.closest('[data-edit-checklist]')) {
      _editingChecklist = !_editingChecklist;
      _refocusAdd = _editingChecklist;
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
    _editingChecklist = false;
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

  document.addEventListener('products:changed', _renderProducts);
}
