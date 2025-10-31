'use strict';

const daysSelector = document.getElementById('days');
const refreshButton = document.getElementById('refresh');
const exportButton = document.getElementById('export');
const allBranchesToggle = document.getElementById('all-branches');
const statusBox = document.getElementById('status');
const tableBody = document.querySelector('#stats-table tbody');

async function fetchStats(days, allBranches) {
  const response = await fetch(`/api/stats?days=${days}&allBranches=${allBranches}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Error desconocido' }));
    throw new Error(error.message || 'Error al obtener las estadisticas');
  }
  return response.json();
}

function formatDate(isoString) {
  if (!isoString) {
    return '—';
  }
  const date = new Date(isoString);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat('es-ES').format(value);
}

function renderStats(data) {
  tableBody.innerHTML = '';

  if (!Array.isArray(data.users) || data.users.length === 0) {
    statusBox.textContent = 'Sin actividad en el periodo seleccionado.';
    statusBox.classList.remove('error');
    return;
  }

  for (const user of data.users) {
    const row = document.createElement('tr');

    row.innerHTML = `
      <td>
        <div>${user.displayName || user.username}</div>
        <div class="badge">${user.username}</div>
      </td>
      <td>${formatNumber(user.commits)}</td>
      <td>${formatNumber(user.linesChanged)}</td>
      <td>${formatNumber(user.repositories)}</td>
      <td>${formatDate(user.lastActivity)}</td>
    `;

    tableBody.appendChild(row);
  }

  const scope = data.allBranches ? 'todas las ramas' : 'rama por defecto';
  statusBox.textContent = `Datos generados el ${formatDate(data.generatedAt)} para los últimos ${data.days} días (${scope}).`;
  statusBox.classList.remove('error');
}

async function updateStats() {
  const days = Number(daysSelector.value);
  statusBox.textContent = 'Cargando...';
  statusBox.classList.remove('error');
  tableBody.innerHTML = '';

  try {
    const includeAllBranches = allBranchesToggle.checked;
    const data = await fetchStats(days, includeAllBranches);
    renderStats(data);
  } catch (error) {
    console.error(error);
    statusBox.textContent = error.message || 'Error cargando datos';
    statusBox.classList.add('error');
  }
}

refreshButton.addEventListener('click', updateStats);

exportButton.addEventListener('click', () => {
  const days = Number(daysSelector.value);
  const includeAllBranches = allBranchesToggle.checked;
  window.location.href = `/api/stats/export?days=${days}&allBranches=${includeAllBranches}`;
});

document.addEventListener('DOMContentLoaded', updateStats);
