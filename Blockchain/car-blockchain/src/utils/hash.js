const SHA256 = require("crypto-js/sha256");

function calculateHash(data) {
  return SHA256(JSON.stringify(data)).toString();
}

module.exports = calculateHash;