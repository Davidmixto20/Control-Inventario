document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth('ADMIN')) return;
  setupAuthButtons();

  document.getElementById('welcome-text').textContent = `Hola, ${localStorage.getItem('username')}`;

  const historyDateInput = document.getElementById('history-date');
  const historyMonthInput = document.getElementById('history-month');
  const historyDayBody = document.getElementById('history-day-body');
  const historyMonthBody = document.getElementById('history-month-body');
  const dayCount = document.getElementById('history-day-count');
  const monthCount = document.getElementById('history-month-count');
  const timezoneText = document.getElementById('history-timezone-text');
  const exportDayBtn = document.getElementById('export-day-btn');
  const exportMonthBtn = document.getElementById('export-month-btn');

  let currentDailyMovements = [];
  let currentMonthlySummary = [];
  let currentTimeZone = 'America/Caracas';

  const todayValue = getDateInputValue(new Date());
  historyDateInput.value = todayValue;
  historyMonthInput.value = todayValue.slice(0, 7);

  async function loadHistory() {
    const selectedDate = historyDateInput.value || todayValue;
    const selectedMonth = historyMonthInput.value || selectedDate.slice(0, 7);

    historyDayBody.innerHTML = `<tr><td colspan="6" class="text-center py-4">Cargando historial...</td></tr>`;
    historyMonthBody.innerHTML = `<tr><td colspan="4" class="text-center py-4">Cargando resumen...</td></tr>`;

    try {
      const params = new URLSearchParams({ date: selectedDate, month: selectedMonth });
      const response = await fetch(`${API_URL}/history?${params.toString()}`, { headers: authHeaders() });
      if (response.status === 401 || response.status === 403) return logout();

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Error al cargar historial');

      currentDailyMovements = data.dailyMovements || [];
      currentMonthlySummary = data.monthlySummary || [];
      currentTimeZone = data.timeZone || 'America/Caracas';

      timezoneText.textContent = `Fechas y horas mostradas en zona local: ${currentTimeZone}.`;
      renderDailyMovements(currentDailyMovements);
      renderMonthlySummary(currentMonthlySummary);
    } catch (error) {
      console.error(error);
      currentDailyMovements = [];
      currentMonthlySummary = [];
      historyDayBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger fw-bold py-4">${error.message}</td></tr>`;
      historyMonthBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger fw-bold py-4">No se pudo cargar el resumen.</td></tr>`;
      dayCount.textContent = '0 movimientos';
      monthCount.textContent = '0 grupos';
    }
  }

  function renderDailyMovements(movements) {
    historyDayBody.innerHTML = '';
    dayCount.textContent = `${movements.length} movimiento${movements.length === 1 ? '' : 's'}`;

    if (movements.length === 0) {
      historyDayBody.innerHTML = `<tr><td colspan="6" class="text-center py-4">No hay movimientos para este dia.</td></tr>`;
      return;
    }

    movements.forEach(movement => {
      const typeLabel = movement.type === 'CONSUMPTION' ? 'Consumo' : 'Restock';
      const typeClass = movement.type === 'CONSUMPTION' ? 'text-danger' : 'text-success';
      const quantity = formatNumber(movement.quantity);
      const unit = movement.unit ? ` ${movement.unit}` : '';
      const batch = movement.batch_number || '-';
      const time = movement.local_time || getFallbackLocalTime(movement.timestamp);

      const row = `
        <tr>
          <td data-label="Hora" class="fw-bold text-muted">${time}</td>
          <td data-label="Usuario" class="fw-bold">${movement.username}</td>
          <td data-label="Accion" class="fw-bold ${typeClass}">${typeLabel}</td>
          <td data-label="Material">${movement.material_name} <span class="text-muted small">(${movement.material_id})</span></td>
          <td data-label="Cantidad" class="fw-bold">${quantity}${unit}</td>
          <td data-label="Lote" class="text-muted">${batch}</td>
        </tr>
      `;
      historyDayBody.insertAdjacentHTML('beforeend', row);
    });
  }

  function renderMonthlySummary(summary) {
    historyMonthBody.innerHTML = '';
    monthCount.textContent = `${summary.length} grupo${summary.length === 1 ? '' : 's'}`;

    if (summary.length === 0) {
      historyMonthBody.innerHTML = `<tr><td colspan="4" class="text-center py-4">No hay movimientos para este mes.</td></tr>`;
      return;
    }

    summary.forEach(item => {
      const typeLabel = item.type === 'CONSUMPTION' ? 'Consumido' : 'Restock';
      const typeClass = item.type === 'CONSUMPTION' ? 'text-danger' : 'text-success';
      const total = formatNumber(item.total_quantity);
      const unit = item.unit ? ` ${item.unit}` : '';

      const row = `
        <tr>
          <td data-label="Material" class="fw-bold">${item.material_name}</td>
          <td data-label="Tipo" class="fw-bold ${typeClass}">${typeLabel}</td>
          <td data-label="Total Mes" class="fw-bold">${total}${unit}</td>
          <td data-label="Mov." class="text-muted">${item.movements_count}</td>
        </tr>
      `;
      historyMonthBody.insertAdjacentHTML('beforeend', row);
    });
  }

  function formatNumber(value) {
    return Number(value).toLocaleString('es-VE', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  }

  function getDateInputValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getFallbackLocalTime(timestamp) {
    return new Intl.DateTimeFormat('es-VE', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Caracas'
    }).format(new Date(timestamp));
  }

  function exportDailyHistory() {
    if (currentDailyMovements.length === 0) {
      return alert('No hay movimientos para exportar en el dia seleccionado.');
    }

    const rows = currentDailyMovements.map(movement => ({
      Fecha: movement.local_date || historyDateInput.value,
      Hora: movement.local_time || getFallbackLocalTime(movement.timestamp),
      Usuario: movement.username,
      Accion: movement.type === 'CONSUMPTION' ? 'Consumo' : 'Restock',
      ID_Material: movement.material_id,
      Material: movement.material_name,
      Cantidad: Number(movement.quantity),
      Unidad: movement.unit || '',
      Lote: movement.batch_number || '',
      Rendimiento: movement.total_yield ? Number(movement.total_yield) : ''
    }));

    exportWorkbook(rows, `historial-dia-${historyDateInput.value}.xlsx`, 'Historial Dia');
  }

  function exportMonthlySummary() {
    if (currentMonthlySummary.length === 0) {
      return alert('No hay resumen mensual para exportar en el mes seleccionado.');
    }

    const rows = currentMonthlySummary.map(item => ({
      Mes: historyMonthInput.value,
      ID_Material: item.material_id,
      Material: item.material_name,
      Tipo: item.type === 'CONSUMPTION' ? 'Consumido' : 'Restock',
      Total: Number(item.total_quantity),
      Unidad: item.unit || '',
      Movimientos: Number(item.movements_count)
    }));

    exportWorkbook(rows, `historial-mes-${historyMonthInput.value}.xlsx`, 'Resumen Mes');
  }

  function exportWorkbook(rows, filename, sheetName) {
    if (!window.XLSX) {
      return alert('No se pudo cargar la libreria de Excel. Revisa la conexion a internet e intenta de nuevo.');
    }

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, filename);
  }

  historyDateInput.addEventListener('change', () => {
    if (historyDateInput.value) {
      historyMonthInput.value = historyDateInput.value.slice(0, 7);
    }
    loadHistory();
  });

  historyMonthInput.addEventListener('change', loadHistory);
  exportDayBtn.addEventListener('click', exportDailyHistory);
  exportMonthBtn.addEventListener('click', exportMonthlySummary);

  loadHistory();
});
