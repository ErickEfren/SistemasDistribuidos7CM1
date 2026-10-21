class SharedBuffer {
  constructor(capacity) {
    this.capacity = capacity;
    this.items = [];
  }

  put(item) {
    if (this.items.length >= this.capacity) {
      throw new Error('Buffer lleno: violacion de exclusion mutua');
    }
    this.items.push(item);
  }

  take() {
    if (this.items.length === 0) {
      throw new Error('Buffer vacio: violacion de exclusion mutua');
    }
    return this.items.shift();
  }

  snapshot() {
    return { capacity: this.capacity, items: [...this.items] };
  }
}

module.exports = { SharedBuffer };
