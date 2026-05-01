class User {
  constructor(username, password, role, shopName = null) {
    this.username = username;     // username สำหรับเข้าสู่ระบบ
    this.password = password;     // password (ในระบบจริงควร hash)
    this.role = role;            // 'garage' หรือ 'customer'
    this.shopName = shopName;    // ชื่ออู่ (สำหรับ garage เท่านั้น)
    this.createdAt = Date.now();
  }
}

module.exports = User;