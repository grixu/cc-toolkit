'use strict';

class FetchkitError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'FetchkitError';
    this.code = code;
  }
}

module.exports = { FetchkitError };
