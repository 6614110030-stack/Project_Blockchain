const API = "http://localhost:3000";

// Inject shared navbar styles ให้ทุกหน้าที่โหลด app.js
(function injectNavStyles() {
  if (document.getElementById('appjs-nav-styles')) return;
  const style = document.createElement('style');
  style.id = 'appjs-nav-styles';
  style.textContent = `
    .user-welcome {
      display: flex;
      align-items: center;
      color: var(--text-secondary, #a0a0a0);
      font-size: 0.85rem;
      padding: 0.5rem 0.8rem;
      border: 1px solid var(--border, #2a2a2a);
      border-radius: 8px;
      background: rgba(0, 255, 136, 0.05);
      white-space: nowrap;
    }
    .user-info {
      color: var(--primary, #00ff88);
      font-weight: 600;
      margin-left: 0.3rem;
    }
    .logout-btn:hover {
      border-color: var(--accent, #ff0044) !important;
      color: var(--accent, #ff0044) !important;
      box-shadow: 0 0 20px rgba(255, 0, 68, 0.3) !important;
    }
    .logout-btn:hover .btn-bg {
      background: linear-gradient(90deg, var(--accent, #ff0044), #cc0033) !important;
      width: 100% !important;
    }
  `;
  document.head.appendChild(style);
})();

// Check authentication
function checkAuth() {
  const sessionId = localStorage.getItem('sessionId');
  if (!sessionId) {
    window.location.href = 'login.html';
    return null;
  }
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  return { sessionId, user };
}

// Get auth headers
function getHeaders() {
  const sessionId = localStorage.getItem('sessionId');
  return {
    'Content-Type': 'application/json',
    'X-Session-Id': sessionId
  };
}

// Logout
async function logout() {
  const sessionId = localStorage.getItem('sessionId');
  try {
    await fetch(`${API}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });
  } catch (error) {
    console.error('Logout error:', error);
  }
  localStorage.removeItem('sessionId');
  localStorage.removeItem('user');
  window.location.href = 'login.html';
}

// Add transaction (garage only)
async function addTransaction() {
  const auth = checkAuth();
  if (!auth) return;

  if (auth.user.role !== 'garage') {
    Swal.fire({
      icon: 'error',
      title: 'ไม่มีสิทธิ์',
      text: 'เฉพาะอู่ซ่อมรถเท่านั้นที่สามารถเพิ่มข้อมูลได้',
      background: '#0a0a0a',
      color: '#ff0044'
    });
    return;
  }

  const vin = document.getElementById("vin").value.trim();
  const detail = document.getElementById("detail").value.trim();
  const mileage = document.getElementById("mileage").value;

  if (!vin || !detail || !mileage) {
    Swal.fire({
      icon: 'error',
      title: 'กรุณากรอกข้อมูลให้ครบ',
      background: '#0a0a0a',
      color: '#ff0044'
    });
    return;
  }

  try {
    const res = await fetch(`${API}/api/transaction`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ vin, detail, mileage })
    });

    const data = await res.json();

    // ถ้า server ส่ง error กลับมา (เช่น เลขไมล์น้อยกว่าเดิม)
    // data.error จะมี message อธิบายเหตุผล เช่น
    // "เลขไมล์ต้องมากกว่าครั้งล่าสุด (80,000 กม.)"
    if (!res.ok) throw new Error(data.error);

    Swal.fire({
      icon: "success",
      title: "บันทึกสำเร็จ",
      html: `
        <p>ข้อมูลถูกเพิ่มลง Pending Transactions</p>
        <p style="color: #00ff88; font-family: monospace;">TX ID: ${data.transaction.txId}</p>
      `,
      background: '#0a0a0a',
      color: '#00ff88'
    });

    document.getElementById("vin").value = "";
    document.getElementById("detail").value = "";
    document.getElementById("mileage").value = "";

  } catch (error) {
    // รับ error message จาก server มาแสดงใน SweetAlert โดยตรง
    Swal.fire({
      icon: "error",
      title: "เกิดข้อผิดพลาด",
      text: error.message,
      background: '#0a0a0a',
      color: '#ff0044'
    });
  }
}

// Mine block (garage only)
async function mineBlock() {
  const auth = checkAuth();
  if (!auth) return;

  if (auth.user.role !== 'garage') {
    Swal.fire({
      icon: 'error',
      title: 'ไม่มีสิทธิ์',
      text: 'เฉพาะอู่ซ่อมรถเท่านั้นที่สามารถ mine block ได้',
      background: '#0a0a0a',
      color: '#ff0044'
    });
    return;
  }

  try {
    const res = await fetch(`${API}/api/mine`, {
      method: 'POST',
      headers: getHeaders()
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    Swal.fire({
      icon: "success",
      title: "Mine Block สำเร็จ",
      html: `
        <p>Block #${data.block.index} ถูกสร้างแล้ว</p>
        <p style="font-family: monospace; font-size: 0.8rem; color: #00ff88;">
          Hash: ${data.block.hash.substring(0, 20)}...
        </p>
      `,
      background: '#0a0a0a',
      color: '#00ff88'
    });

    if (typeof loadChain === 'function') loadChain();

  } catch (error) {
    Swal.fire({
      icon: "error",
      title: "เกิดข้อผิดพลาด",
      text: error.message,
      background: '#0a0a0a',
      color: '#ff0044'
    });
  }
}

// Load blockchain
async function loadChain() {
  const auth = checkAuth();
  if (!auth) return;

  try {
    const res = await fetch(`${API}/api/chain`, { headers: getHeaders() });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Failed to load chain');

    const resultElement = document.getElementById("result");
    if (resultElement) {
      resultElement.innerText = JSON.stringify(data, null, 2);
    }

    const blockCountElement = document.getElementById('blockCount');
    if (blockCountElement) {
      blockCountElement.textContent = data.chain?.length || 0;
    }

  } catch (error) {
    console.error('Load chain error:', error);
    if (error.message.includes('401')) logout();
  }
}

// Search car by VIN
async function searchCar() {
  const auth = checkAuth();
  if (!auth) return;

  const vin = document.getElementById('searchVin')?.value.trim();

  if (!vin) {
    Swal.fire({
      icon: 'warning',
      title: 'กรุณากรอก VIN',
      background: '#0a0a0a',
      color: '#ffffff'
    });
    return;
  }

  try {
    const res = await fetch(`${API}/api/car/${vin}`, { headers: getHeaders() });
    const data = await res.json();

    if (!res.ok) {
      if (res.status === 404) {
        Swal.fire({
          icon: 'info',
          title: 'ไม่พบข้อมูล',
          text: `ไม่พบประวัติการซ่อมบำรุงของรถหมายเลข ${vin}`,
          background: '#0a0a0a',
          color: '#ffffff'
        });
      } else {
        throw new Error(data.error);
      }
      return;
    }

    displayCarHistory(data);

  } catch (error) {
    Swal.fire({
      icon: 'error',
      title: 'เกิดข้อผิดพลาด',
      text: error.message,
      background: '#0a0a0a',
      color: '#ff0044'
    });
  }
}

// Display car history
function displayCarHistory(data) {
  const container = document.getElementById('carHistoryContainer');
  if (!container) return;

  const { vin, summary, history } = data;

  let html = `
    <div class="car-info-card">
      <h3 class="car-vin">🚗 ${vin}</h3>
      <div class="car-summary">
        <div class="summary-item">
          <span class="summary-label">จำนวนครั้งที่ซ่อม:</span>
          <span class="summary-value">${summary.totalServices} ครั้ง</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">เลขไมล์ล่าสุด:</span>
          <span class="summary-value">${summary.latestMileage.toLocaleString()} กม.</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">ครั้งแรก:</span>
          <span class="summary-value">${summary.firstServiceDate}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">ครั้งล่าสุด:</span>
          <span class="summary-value">${summary.lastServiceDate}</span>
        </div>
      </div>
    </div>
    <div class="history-timeline">
      <h4 class="timeline-title">ประวัติการซ่อมบำรุง</h4>
  `;

  history.forEach((record, index) => {
    html += `
      <div class="timeline-item">
        <div class="timeline-marker">${index + 1}</div>
        <div class="timeline-content">
          <div class="timeline-header">
            <span class="timeline-date">${new Date(record.timestamp).toLocaleString('th-TH')}</span>
            <span class="timeline-mileage">📏 ${record.mileage.toLocaleString()} กม.</span>
          </div>
          <div class="timeline-detail">${record.detail}</div>
          <div class="timeline-footer">
            <span class="timeline-garage">🔧 ${record.garageName}</span>
            <span class="timeline-block">Block #${record.blockIndex}</span>
          </div>
        </div>
      </div>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;
}

// Load statistics
async function loadStatistics() {
  const auth = checkAuth();
  if (!auth) return;

  try {
    const res = await fetch(`${API}/api/statistics`, { headers: getHeaders() });
    const data = await res.json();

    const setEl = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setEl('totalBlocks', data.totalBlocks || 0);
    setEl('totalTransactions', data.totalTransactions || 0);
    setEl('uniqueVehicles', data.uniqueVehicles || 0);
    setEl('pendingTx', data.pendingTransactions || 0);

  } catch (error) {
    console.error('Load statistics error:', error);
  }
}

// ============ Initialize page (role-based navbar) ============
function initPage() {
  const auth = checkAuth();
  if (!auth) return;

  const { user } = auth;
  const role = user.role;
  const displayName = user.shopName || user.username || 'User';

  // --- แสดงชื่อผู้ใช้ใน .user-info ทุก element ---
  document.querySelectorAll('.user-info').forEach(el => {
    el.textContent = displayName;
  });

  // --- แสดง user-welcome bar ---
  document.querySelectorAll('.user-welcome').forEach(el => {
    el.style.display = 'flex';
  });

  // --- Role-based navbar ---
  if (role !== 'garage') {
    document.querySelectorAll('.garage-only').forEach(el => {
      el.style.display = 'none';
    });
  } else {
    document.querySelectorAll('.garage-only').forEach(el => {
      el.style.display = '';
    });
  }

  // --- Load statistics ถ้ามีฟังก์ชัน ---
  if (typeof loadStatistics === 'function') {
    loadStatistics();
  }
}

document.addEventListener('DOMContentLoaded', initPage);