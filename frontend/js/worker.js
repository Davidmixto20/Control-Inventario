document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth('WORKER')) return;
  setupAuthButtons();

  document.getElementById('welcome-text').textContent = `Hola, ${localStorage.getItem('username')}`;
  const materialsContainer = document.getElementById('materials-container');
  const inventoryTable = document.getElementById('worker-inventory-table');
  const addMaterialBtn = document.getElementById('add-material-btn');
  const consumptionForm = document.getElementById('consumption-form');
  const submitBtn = document.getElementById('submit-btn');

  let availableMaterials = [];

  async function loadMaterials() {
    try {
      const response = await fetch(`${API_URL}/materials`, { headers: authHeaders() });
      if (response.status === 401 || response.status === 403) return logout();
      if (response.ok) {
        availableMaterials = await response.json();
        renderInventoryTable();
        // Solo añadir la primera fila vacía si el contenedor está vacío
        if (materialsContainer.children.length === 0) addMaterialRow(); 
      } else {
        alert('Error cargando materiales del servidor.');
      }
    } catch (error) {
      console.error(error);
      alert('Error de conexión con el backend.');
    }
  }

  function renderInventoryTable() {
    inventoryTable.innerHTML = '';
    if(availableMaterials.length === 0) {
        inventoryTable.innerHTML = `<tr><td colspan="3" class="text-center py-3">No hay materiales registrados.</td></tr>`;
        return;
    }

    availableMaterials.forEach(mat => {
      const isCritical = parseFloat(mat.current_stock) <= parseFloat(mat.reorder_point);
      const textClass = isCritical ? 'text-danger fw-bold' : 'text-success fw-bold';
      const statusText = isCritical ? 'Bajo' : 'OK';

      const row = `
        <tr>
          <td class="fw-bold">${mat.name} <span class="text-muted small">(${mat.id})</span></td>
          <td class="fw-bold fs-6">${mat.current_stock} ${mat.unit}</td>
          <td class="${textClass}">${statusText}</td>
        </tr>
      `;
      inventoryTable.insertAdjacentHTML('beforeend', row);
    });
  }

  function addMaterialRow() {
    const rowId = Date.now();
    let options = '<option value="">Seleccionar material...</option>';
    availableMaterials.forEach(mat => {
      options += `<option value="${mat.id}">${mat.name} (${mat.unit}) - Disp: ${mat.current_stock}</option>`;
    });

    const rowHtml = `
      <div class="row mb-3 material-row align-items-end" id="row-${rowId}">
        <div class="col-md-7 col-12 mb-2 mb-md-0">
          <label class="form-label text-muted small mb-1 fw-bold">Material</label>
          <select class="form-select material-select" required>
            ${options}
          </select>
        </div>
        <div class="col-md-3 col-8 mb-2 mb-md-0">
          <label class="form-label text-muted small mb-1 fw-bold">Cantidad Utilizada</label>
          <input type="number" class="form-control material-quantity" step="0.01" min="0.01" required>
        </div>
        <div class="col-md-2 col-4 mb-2 mb-md-0">
          <button type="button" class="btn btn-outline-danger w-100 fw-bold" onclick="document.getElementById('row-${rowId}').remove()">X</button>
        </div>
      </div>
    `;
    materialsContainer.insertAdjacentHTML('beforeend', rowHtml);
  }

  addMaterialBtn.addEventListener('click', addMaterialRow);

  consumptionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const batchNumber = document.getElementById('batch-number').value.trim();
    const totalYield = parseFloat(document.getElementById('total-yield').value);
    
    const itemRows = document.querySelectorAll('.material-row');
    const items = [];
    let hasError = false;

    itemRows.forEach(row => {
      const select = row.querySelector('.material-select');
      const quantityInput = row.querySelector('.material-quantity');
      const material_id = select.value;
      const quantity = parseFloat(quantityInput.value);

      if (!material_id || isNaN(quantity) || quantity <= 0) hasError = true;
      items.push({ material_id, quantity });
    });

    if (hasError || items.length === 0) {
      return alert('Por favor completa todos los materiales con cantidades válidas.');
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Procesando...';

    try {
      const response = await fetch(`${API_URL}/consumption`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ batch_number: batchNumber, total_yield: totalYield, items })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Error al registrar consumo');

      alert('Consumo registrado exitosamente.');
      consumptionForm.reset();
      materialsContainer.innerHTML = '';
      
      await loadMaterials();
    } catch (error) {
      alert(`Error: ${error.message}`);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Registrar Consumo y Actualizar Inventario';
    }
  });

  loadMaterials();
});
