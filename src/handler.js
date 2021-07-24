const crypto = require('crypto');
const fs = require('fs');
const debug = require('debug')('mcash:handler');
const { format } = require('util');
// eslint-disable-next-line no-unused-vars
const { EventEmitter } = require('events');

// eslint-disable-next-line no-multi-assign,func-names
module.exports = exports = function (environment, callbackUri) {
  // eslint-disable-next-line global-require,import/no-unresolved
  return require('body-parser')
    .json({
      type: 'application/vnd.mcash.api.merchant.v1+json',
      // eslint-disable-next-line no-unused-vars
      verify(req, res, buf, encoding) {
        let err = exports.verifyDigest(req, buf.toString('utf8'));
        if (err) throw new Error(`Digest verification failed: ${err}`);

        err = exports.verifyAuthorization(req, exports.KEYS[environment], callbackUri);
        if (err) throw new Error(`Authorization verification failed: ${err}`);
      },
    });
};
const keysFile = '../../../keys.json';
try {
  if (fs.existsSync(keysFile)) {
    exports.KEYS = fs.readFileSync(keysFile, 'utf8');
  }
} catch (err) {
  // eslint-disable-next-line no-console
  console.error(err);
}
// exports.KEYS = require('../../../keys.json');

// eslint-disable-next-line consistent-return,func-names
exports.verifyDigest = function (req, text) {
  const header = req.headers['x-mcash-content-digest'];
  if (!header) return 'header missing';

  // Split "SHA256=abcdefg" by =
  const match = header.match(/^([^=]+)=(.+)$/);
  if (!match) return 'invalid header format';

  const algo = match[1];
  if (algo !== 'SHA256') return 'unexpected algo';

  const expected = match[2];

  debug('digest of %s', text);

  const actual = crypto.createHash('sha256')
    .update(text || '')
    .digest('base64');
  debug('expected: %s\nactual: %s', expected, actual);

  if (actual !== expected) return 'mismatch';
};

// eslint-disable-next-line consistent-return,func-names
exports.verifyAuthorization = function (req, key, callbackUri) {
  const header = req.headers.authorization;
  if (!header) return 'header missing';

  // Split "RSA-SHA256 abcde" by whitespace
  const match = header.match(/^([^ ]+) (.+)$/);
  if (!match) return 'invalid header format';

  const algo = match[1];
  if (algo !== 'RSA-SHA256') return 'unexpected algo';

  const expected = match[2];

  if (!callbackUri) {
    // eslint-disable-next-line no-param-reassign
    callbackUri = format('%s://%s%s', req.protocol, req.headers.host, req.originalUrl);
  }

  // POST|http://server.test/some/resource/|X-MCASH-CONTENT-DIGEST=SHA256=oWVxV3hh...
  const concat = format('%s|%s|%s',
    req.method,
    callbackUri,
    Object.keys(req.headers)
    // eslint-disable-next-line no-shadow
      .filter((key) => !!key.match(/^x-mcash-/))
      .sort()
    // eslint-disable-next-line no-shadow
      .reduce((p, key) => format('%s%s%s=%s',
        p,
        p.length ? '&' : '',
        key.toUpperCase(),
        req.headers[key]), ''));

  debug('concat:\n%s', concat);

  debug('key:\n%s', key);
  debug('expected: %s', expected);

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(concat);

  if (!verifier.verify(key, expected, 'base64')) {
    return 'signature mismatch';
  }
};
