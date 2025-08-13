const fs = require('fs');

const [,, iFileName, varName, oFileName] = process.argv;

const data = fs.readFileSync(iFileName, { encoding: 'base64' });

const out = `
const ${varName} = '${data}';

if (typeof module !== 'undefined') {
  module.exports = ${varName};
}
`.trim('\n');

fs.writeFileSync(oFileName, out);
