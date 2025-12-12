// helpers/status.js
function addBusinessDays(date, days) {
  const res = new Date(date);
  let added = 0;
  while (added < days) {
    res.setDate(res.getDate() + 1);
    const d = res.getDay();
    if (d !== 0 && d !== 6) added++;
  }
  return res;
}

// Devuelve: 'status-green' | 'status-yellow' | 'status-red' | null
function getStatusClass(t, now = new Date()) {
  if (t.estado !== 'Pendiente') return null; // como en el front solo coloreas pendientes
  const due = new Date(t.fechaLimite);
  const msToDue = due - now;
  const daysToDue = msToDue / (1000 * 60 * 60 * 24);
  const overdue3 = addBusinessDays(due, 3);

  if (now > overdue3) return 'status-red';       // pasó +3 días hábiles
  if (daysToDue <= 1 && daysToDue >= 0) return 'status-yellow'; // ≤1 día
  return 'status-green';
}

module.exports = { addBusinessDays, getStatusClass };
