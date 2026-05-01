const fs = require('fs');
const path = require('path');
const Block = require('./Block');
const Transaction = require('./Transaction');

// __dirname = CAR-BLOCKCHAIN/src/models/
// ต้องขึ้นไป 2 ระดับเพื่อไปถึง root แล้วเข้า data/
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const CHAIN_FILE = path.join(DATA_DIR, 'blockchain.json');

class Blockchain {
  constructor() {
    this.chain = [];
    this.pendingTransactions = [];

    // โหลดข้อมูลจากไฟล์ก่อน ถ้าไม่มีค่อยสร้าง Genesis Block
    const loaded = this.loadFromFile();
    if (!loaded) {
      this.chain = [this.createGenesisBlock()];
      this.saveToFile();
    }
  }

  // ===== Genesis Block =====
  createGenesisBlock() {
    return new Block(0, [], "0");
  }

  // ===== ดึง Block ล่าสุด =====
  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  // ===== เพิ่ม Transaction =====
  addTransaction(vin, detail, mileage, garageName, garageUsername) {
    const tx = new Transaction(vin, detail, mileage, garageName, garageUsername);
    this.pendingTransactions.push(tx);
    this.saveToFile(); // บันทึกทันที
    return tx;
  }

  // ===== Mine Block =====
  mineBlock() {
    if (this.pendingTransactions.length === 0) return null;

    const block = new Block(
      this.chain.length,
      this.pendingTransactions,
      this.getLatestBlock().hash
    );

    this.chain.push(block);
    this.pendingTransactions = [];
    this.saveToFile(); // บันทึกทันที
    return block;
  }

  // ===== ตรวจสอบความถูกต้องของ Chain =====
  isChainValid() {
    for (let i = 1; i < this.chain.length; i++) {
      const current = this.chain[i];
      const previous = this.chain[i - 1];

      // ตรวจ hash ของ block ปัจจุบัน
      const recalculated = new Block(
        current.index,
        current.transactions,
        current.previousHash
      );
      // ต้อง set timestamp เดิมก่อนคำนวณ
      recalculated.timestamp = current.timestamp;
      recalculated.hash = recalculated.calculateBlockHash();

      if (current.hash !== recalculated.hash) return false;

      // ตรวจว่า previousHash เชื่อมถูกต้อง
      if (current.previousHash !== previous.hash) return false;
    }
    return true;
  }

  // ===== ค้นหาประวัติรถตาม VIN =====
  getCarHistory(vin) {
    const history = [];
    for (const block of this.chain) {
      if (!block.transactions) continue;
      for (const tx of block.transactions) {
        if (tx.vin === vin) {
          history.push({ ...tx, blockIndex: block.index });
        }
      }
    }
    return history;
  }

  // ===== สถิติ =====
  getStatistics() {
    const vins = new Set();
    let totalTransactions = 0;

    for (const block of this.chain) {
      if (!block.transactions) continue;
      for (const tx of block.transactions) {
        vins.add(tx.vin);
        totalTransactions++;
      }
    }

    return {
      totalBlocks: this.chain.length,
      totalTransactions,
      uniqueVehicles: vins.size,
      pendingTransactions: this.pendingTransactions.length
    };
  }

  // ===== บันทึกลงไฟล์ JSON =====
  saveToFile() {
    try {
      // สร้างโฟลเดอร์ data ถ้ายังไม่มี
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      const data = {
        savedAt: new Date().toISOString(),
        chain: this.chain,
        pendingTransactions: this.pendingTransactions
      };

      fs.writeFileSync(CHAIN_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      console.error('❌ Error saving blockchain:', error.message);
    }
  }

  // ===== โหลดจากไฟล์ JSON =====
  loadFromFile() {
    try {
      if (!fs.existsSync(CHAIN_FILE)) return false;

      const raw = fs.readFileSync(CHAIN_FILE, 'utf8').trim();

      // ไฟล์ว่างเปล่า
      if (!raw) {
        console.warn('⚠️  blockchain.json ว่างเปล่า — สร้าง Genesis Block ใหม่');
        fs.unlinkSync(CHAIN_FILE); // ลบไฟล์เสียทิ้ง
        return false;
      }

      let data;
      try {
        data = JSON.parse(raw);
      } catch (parseError) {
        console.warn('⚠️  blockchain.json เสียหาย (JSON parse error) — สร้าง Genesis Block ใหม่');
        // backup ไฟล์เสียไว้ก่อนลบ
        const backupPath = CHAIN_FILE + `.backup_${Date.now()}`;
        fs.copyFileSync(CHAIN_FILE, backupPath);
        console.warn(`💾 Backup ไว้ที่: ${backupPath}`);
        fs.unlinkSync(CHAIN_FILE);
        return false;
      }

      if (!data.chain || data.chain.length === 0) return false;

      // Restore chain — แปลง plain object กลับเป็น Block instance
      this.chain = data.chain.map(b => {
        const block = new Block(b.index, b.transactions, b.previousHash);
        block.timestamp = b.timestamp;
        block.hash = b.hash;
        return block;
      });

      // Restore pending transactions
      this.pendingTransactions = data.pendingTransactions || [];

      console.log(`✅ Blockchain loaded: ${this.chain.length} blocks, ${this.pendingTransactions.length} pending`);
      return true;

    } catch (error) {
      console.error('❌ Error loading blockchain:', error.message);
      return false;
    }
  }
}

module.exports = Blockchain;