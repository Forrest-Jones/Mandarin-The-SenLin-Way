/* Node entry: every level, in order. The browser loads the same files from index.html. */
module.exports = [1, 2, 3, 4, 5, 6].map(n => require('./hsk' + n + '.js'));
