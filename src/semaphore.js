class Semaphore {
  constructor(name, value) {
    this.name = name;
    this.value = value;
    this.blocked = [];
  }

  tryWait(process) {
    this.value -= 1;
    if (this.value >= 0) return true;
    this.blocked.push(process);
    return false;
  }

  signal() {
    this.value += 1;
    if (this.value <= 0) {
      return this.blocked.shift();
    }
    return null;
  }

  snapshot() {
    return { name: this.name, value: this.value, blocked: this.blocked.map(p => p.id) };
  }
}

if (typeof module !== 'undefined') module.exports = { Semaphore };
