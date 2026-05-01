const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const Blockchain = require("./src/models/Blockchain");
const User = require("./src/models/User");

const app = express();
app.use(cors());
app.use(express.json());

// server.js อยู่ที่ root = CAR-BLOCKCHAIN/
// data/ จะอยู่ที่ CAR-BLOCKCHAIN/data/
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// ===== สร้างโฟลเดอร์ data ถ้ายังไม่มี =====
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ===== โหลด / บันทึก Users =====
function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    // แปลง plain object กลับเป็น User instance
    return data.map(u => {
      const user = new User(u.username, u.password, u.role, u.shopName);
      user.createdAt = u.createdAt;
      return user;
    });
  } catch (e) {
    console.error('❌ Error loading users:', e.message);
    return null;
  }
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (e) {
    console.error('❌ Error saving users:', e.message);
  }
}

// ===== Default accounts =====
const defaultUsers = [
  new User("garage1", "password123", "garage", "ศูนย์บริการ ABC"),
  new User("garage2", "password123", "garage", "อู่ซ่อมรถ XYZ"),
  new User("customer1", "password123", "customer"),
  new User("customer2", "password123", "customer"),
];

// โหลด users จากไฟล์ ถ้าไม่มีใช้ default แล้ว save
let users = loadUsers();
if (!users) {
  users = defaultUsers;
  saveUsers(users);
  console.log('📝 Created default users file');
}

// ===== Initialize Blockchain (โหลดจาก JSON อัตโนมัติ) =====
const blockchain = new Blockchain();

// ===== Session storage =====
const sessions = new Map();

// ============= Authentication Routes =============

// Login
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;

  const user = users.find(u => u.username === username && u.password === password);
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const sessionId = `session_${Date.now()}_${Math.random().toString(36)}`;
  sessions.set(sessionId, {
    username: user.username,
    role: user.role,
    shopName: user.shopName
  });

  res.json({
    sessionId,
    user: { username: user.username, role: user.role, shopName: user.shopName }
  });
});

// Logout
app.post("/api/auth/logout", (req, res) => {
  const { sessionId } = req.body;
  sessions.delete(sessionId);
  res.json({ message: "Logged out successfully" });
});

// Check session
app.get("/api/auth/session", (req, res) => {
  const sessionId = req.headers['x-session-id'];
  const session = sessions.get(sessionId);
  if (!session) return res.status(401).json({ error: "Not authenticated" });
  res.json({ session });
});

// Register
app.post("/api/auth/register", (req, res) => {
  const { username, password, role, shopName } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: "Username already exists" });
  }

  const newUser = new User(username, password, role, shopName || null);
  users.push(newUser);
  saveUsers(users); // บันทึกลงไฟล์ทันที

  res.json({ message: "User registered successfully", username });
});

// ============= Middleware =============

function requireAuth(req, res, next) {
  const sessionId = req.headers['x-session-id'];
  const session = sessions.get(sessionId);
  if (!session) return res.status(401).json({ error: "Not authenticated" });
  req.user = session;
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ error: "Access denied" });
    }
    next();
  };
}

// ============= Transaction Routes =============

// Add transaction (garage only)
app.post("/api/transaction", requireAuth, requireRole("garage"), (req, res) => {
  const { vin, detail, mileage } = req.body;

  if (!vin || !detail || !mileage) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // ===== Mileage Validation =====
  // เช็คจาก block ที่ mine แล้ว
  const history = blockchain.getCarHistory(vin);
  if (history.length > 0) {
    const latestMileage = history[history.length - 1].mileage;
    if (Number(mileage) <= Number(latestMileage)) {
      return res.status(400).json({
        error: `เลขไมล์ต้องมากกว่าครั้งล่าสุด (${Number(latestMileage).toLocaleString()} กม.)`
      });
    }
  }

  // เช็ค pending transactions ของรถคันเดียวกันด้วย
  const pendingForVin = blockchain.pendingTransactions.filter(tx => tx.vin === vin);
  if (pendingForVin.length > 0) {
    const latestPendingMileage = pendingForVin[pendingForVin.length - 1].mileage;
    if (Number(mileage) <= Number(latestPendingMileage)) {
      return res.status(400).json({
        error: `เลขไมล์ต้องมากกว่า pending ล่าสุด (${Number(latestPendingMileage).toLocaleString()} กม.)`
      });
    }
  }
  // ===== End Mileage Validation =====

  const transaction = blockchain.addTransaction(
    vin, detail, mileage,
    req.user.shopName,
    req.user.username
  );
  // saveToFile() ถูกเรียกใน addTransaction() แล้ว

  res.json({ message: "Transaction added successfully", transaction });
});

// Get pending transactions
app.get("/api/transactions/pending", requireAuth, (req, res) => {
  res.json({
    count: blockchain.pendingTransactions.length,
    transactions: blockchain.pendingTransactions
  });
});

// ============= Blockchain Routes =============

// Mine block (garage only)
app.post("/api/mine", requireAuth, requireRole("garage"), (req, res) => {
  const block = blockchain.mineBlock();
  if (!block) {
    return res.status(400).json({ error: "No pending transactions to mine" });
  }
  // saveToFile() ถูกเรียกใน mineBlock() แล้ว

  res.json({ message: "New block mined successfully", block });
});

// Get full chain
app.get("/api/chain", requireAuth, (req, res) => {
  res.json({
    chain: blockchain.chain,
    pendingTransactions: blockchain.pendingTransactions,
    valid: blockchain.isChainValid()
  });
});

// Validate chain
app.get("/api/validate", requireAuth, (req, res) => {
  const valid = blockchain.isChainValid();
  res.json({ valid });
});

// Statistics
app.get("/api/statistics", requireAuth, (req, res) => {
  res.json(blockchain.getStatistics());
});

// ============= Car History Routes =============

// Get car history by VIN
app.get("/api/car/:vin", requireAuth, (req, res) => {
  const { vin } = req.params;
  const history = blockchain.getCarHistory(vin);

  if (history.length === 0) {
    return res.status(404).json({ error: "No maintenance records found for this VIN" });
  }

  const totalServices = history.length;
  const latestMileage = history[history.length - 1]?.mileage || 0;
  const firstService = history[0]?.timestamp;
  const lastService = history[history.length - 1]?.timestamp;

  res.json({
    vin,
    summary: {
      totalServices,
      latestMileage,
      firstServiceDate: new Date(firstService).toLocaleString('th-TH'),
      lastServiceDate: new Date(lastService).toLocaleString('th-TH')
    },
    history
  });
});

// Search all cars
app.get("/api/cars", requireAuth, (req, res) => {
  const vins = new Set();
  for (const block of blockchain.chain) {
    if (block.transactions) block.transactions.forEach(tx => vins.add(tx.vin));
  }

  const carList = Array.from(vins).map(vin => {
    const history = blockchain.getCarHistory(vin);
    return {
      vin,
      totalServices: history.length,
      latestMileage: history[history.length - 1]?.mileage || 0,
      lastService: history[history.length - 1]?.timestamp
    };
  });

  res.json({ cars: carList });
});


// ============= Realtime File Validate =============
const calculateHash = require("./src/utils/hash");
const CHAIN_FILE_PATH = path.join(DATA_DIR, 'blockchain.json');

// อ่านไฟล์ JSON โดยตรงแล้ว validate — ตรวจว่าไฟล์ถูกแก้หรือเปล่า
app.get("/api/validate-file", requireAuth, (req, res) => {
  try {
    if (!fs.existsSync(CHAIN_FILE_PATH)) {
      return res.status(404).json({ error: "blockchain.json not found" });
    }

    const raw = fs.readFileSync(CHAIN_FILE_PATH, 'utf8');
    const data = JSON.parse(raw);
    const chain = data.chain;

    const results = [];
    let valid = true;

    for (let i = 1; i < chain.length; i++) {
      const current = chain[i];
      const previous = chain[i - 1];

      // คำนวณ hash ใหม่จากข้อมูลในไฟล์
      const recalcHash = calculateHash({
        index:        current.index,
        timestamp:    current.timestamp,
        transactions: current.transactions,
        previousHash: current.previousHash,
      });

      const hashMatch  = current.hash === recalcHash;
      const linkMatch  = current.previousHash === previous.hash;
      const blockValid = hashMatch && linkMatch;

      if (!blockValid) valid = false;

      results.push({
        blockIndex:           current.index,
        valid:                blockValid,
        hashMatch,
        linkMatch,
        storedHash:           current.hash,
        calculatedHash:       recalcHash,
        previousHashStored:   current.previousHash,
        previousHashExpected: previous.hash,
      });
    }

    // Block #0 (Genesis)
    if (chain.length > 0) {
      results.unshift({ blockIndex: 0, valid: true, hashMatch: true, linkMatch: true, note: 'Genesis Block' });
    }

    res.json({ valid, chain: results, savedAt: data.savedAt });

  } catch (error) {
    res.status(500).json({ error: "Failed to read blockchain.json: " + error.message });
  }
});

// SSE — push event ทุกครั้งที่ blockchain.json เปลี่ยน
app.get("/api/watch", requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ event: 'connected' })}\n\n`);

  let watcher;
  try {
    watcher = fs.watch(CHAIN_FILE_PATH, (eventType) => {
      if (eventType === 'change') {
        res.write(`data: ${JSON.stringify({ event: 'fileChanged', time: Date.now() })}\n\n`);
      }
    });
  } catch (e) {
    res.write(`data: ${JSON.stringify({ event: 'error', message: e.message })}\n\n`);
  }

  req.on('close', () => { if (watcher) watcher.close(); });
});

// ============= Start Server =============
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚗 CarChain Server running on port ${PORT}`);
  console.log(`💾 Data directory: ${DATA_DIR}`);
  console.log(`📦 Blockchain: ${blockchain.chain.length} blocks loaded`);
  console.log(`👥 Users: ${users.length} accounts loaded`);
});

module.exports = app;