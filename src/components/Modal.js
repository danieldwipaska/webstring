export function createModal({ id, title, bodyHTML, confirmText = 'Confirm', confirmClass = 'btn-danger', onConfirm }) {
  let modalEl = document.getElementById(id);
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = id;
    modalEl.className = 'modal-backdrop';
    document.body.appendChild(modalEl);
  }

  modalEl.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button class="btn btn-secondary btn-sm" id="${id}-close-x" style="padding: 0.2rem 0.5rem;">✕</button>
      </div>
      <div class="modal-body">
        ${bodyHTML}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="${id}-cancel-btn">Cancel</button>
        <button class="btn ${confirmClass}" id="${id}-confirm-btn">${confirmText}</button>
      </div>
    </div>
  `;

  const close = () => {
    modalEl.classList.remove('open');
  };

  const open = () => {
    modalEl.classList.add('open');
  };

  document.getElementById(`${id}-close-x`).onclick = close;
  document.getElementById(`${id}-cancel-btn`).onclick = close;
  document.getElementById(`${id}-confirm-btn`).onclick = async () => {
    if (onConfirm) {
      await onConfirm();
    }
    close();
  };

  return { open, close };
}
