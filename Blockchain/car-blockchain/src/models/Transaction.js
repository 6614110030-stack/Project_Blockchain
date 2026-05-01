class Transaction {
  constructor(vin, detail, mileage, garageName = "Unknown Garage", garageUsername = null) {
    this.vin = vin;                      // เลขตัวถัง
    this.detail = detail;                // รายละเอียดการซ่อม
    this.mileage = mileage;              // เลขไมล์
    this.garageName = garageName;        // ชื่ออู่ที่ทำการซ่อม
    this.garageUsername = garageUsername; // username ของอู่
    this.timestamp = Date.now();         // เวลา
    this.txId = this.generateTxId();     // Transaction ID
  }

  generateTxId() {
    return `TX${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = Transaction; 