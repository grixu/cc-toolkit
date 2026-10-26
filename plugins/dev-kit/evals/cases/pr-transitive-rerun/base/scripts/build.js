const mkdirp = require('mkdirp');
const path = require('node:path');

mkdirp.sync(path.join(__dirname, '..', 'dist', 'assets'));
