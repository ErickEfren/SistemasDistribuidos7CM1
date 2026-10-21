class Inventory {
  constructor(initialStock) {
    this.stock = { ...initialStock };
    this.rejected = 0;
    this.fulfilled = 0;
  }

  processOrder(order) {
    const available = this.stock[order.product] ?? 0;
    if (available >= order.qty) {
      this.stock[order.product] = available - order.qty;
      this.fulfilled++;
      return { fulfilled: true, remaining: this.stock[order.product] };
    }
    this.rejected++;
    return { fulfilled: false, remaining: available };
  }

  snapshot() {
    return { stock: { ...this.stock }, fulfilled: this.fulfilled, rejected: this.rejected };
  }
}

if (typeof module !== 'undefined') module.exports = { Inventory };
