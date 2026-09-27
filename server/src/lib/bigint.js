// JSON.stringify throws on BigInt. Serialise as a string so sats values
// above Number.MAX_SAFE_INTEGER never lose precision on the client.
if (typeof BigInt.prototype.toJSON !== 'function') {
  Object.defineProperty(BigInt.prototype, 'toJSON', {
    value() {
      return this.toString();
    },
    writable: true,
    configurable: true,
  });
}
