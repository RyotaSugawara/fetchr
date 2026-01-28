// Node.js 20+ provides native fetch, Request, Response, Headers, and AbortController
// However, for testing we use node-fetch because fetch-mock@10.x is designed to work
// with node-fetch, not with Node.js native fetch. fetch-mock expects node-fetch's
// behavior for relative URLs.

const nodeFetch = require('node-fetch');
global.fetch = nodeFetch;
global.Headers = nodeFetch.Headers;
global.Request = nodeFetch.Request;
global.Response = nodeFetch.Response;

// AbortController is available natively in Node.js 15+
// No setup needed
