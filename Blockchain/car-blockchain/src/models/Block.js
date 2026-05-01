const calculateHash = require("../utils/hash");

class Block {
  constructor(index, transactions, previousHash = "") {
    this.index = index;
    this.timestamp = Date.now();
    this.transactions = transactions;
    this.previousHash = previousHash;
    this.hash = this.calculateBlockHash();
  }

  calculateBlockHash() {
    return calculateHash({
      index: this.index,
      timestamp: this.timestamp,
      transactions: this.transactions,
      previousHash: this.previousHash,
    });
  }
}

module.exports = Block;