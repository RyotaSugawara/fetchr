/**
 * Copyright 2014, Yahoo! Inc.
 * Copyrights licensed under the New BSD License. See the accompanying LICENSE file for terms.
 */

/**
 * @module httpRequest
 */

var FetchrError = require('./FetchrError');

function _shouldRetry(err) {
    if (err.reason === FetchrError.ABORT) {
        return false;
    }

    if (this._currentAttempt >= this._options.retry.maxRetries) {
        return false;
    }

    if (this._options.method === 'POST' && !this._options.retry.retryOnPost) {
        return false;
    }

    return this._options.retry.statusCodes.indexOf(err.statusCode) !== -1;
}

// _retry is the onReject promise callback that we attach to the
// _fetch call (ex. _fetch().catch(_retry)). Since _fetch is a promise
// and since we must be able to retry requests (aka call _fetch
// function again), we must call _fetch from within _retry. This means
// that _fetch is a recursive function. Recursive promises are
// problematic since they can block the main thread for a
// while. However, since the inner _fetch call is wrapped in a
// setTimeout we are safe here.
//
// The call flow:
//
// send -> _fetch -> _retry -> _fetch -> _retry -> end
function _retry(err) {
    if (!_shouldRetry.call(this, err)) {
        throw err;
    }

    // Use exponential backoff and full jitter
    // strategy published in
    // https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
    var delay = Math.random() * this._options.retry.interval * Math.pow(2, this._currentAttempt);

    this._controller = new AbortController();
    this._currentAttempt += 1;

    return new Promise((resolve, reject) => {
        setTimeout(() => {
            _fetch.call(this).then(resolve, reject);
        }, delay);
    });
}

function _fetch() {
    var timedOut = false;
    var request = new Request(this._options.url, {
        body: this._options.body,
        credentials: this._options.credentials,
        headers: this._options.headers,
        method: this._options.method,
        signal: this._controller.signal,
    });

    var timeoutId = setTimeout(() => {
        timedOut = true;
        this._controller.abort();
    }, this._options.timeout);

    return fetch(request)
        .then(
            (response) => {
                clearTimeout(timeoutId);

                if (response.ok) {
                    return response.json().catch(() => {
                        throw new FetchrError(
                            FetchrError.BAD_JSON,
                            'Cannot parse response into a JSON object',
                            this._options,
                            request,
                            response
                        );
                    });
                } else {
                    return response.text().then((message) => {
                        throw new FetchrError(FetchrError.BAD_HTTP_STATUS, message, this._options, request, response);
                    });
                }
            },
            (err) => {
                clearTimeout(timeoutId);
                if (err.name === 'AbortError') {
                    if (timedOut) {
                        throw new FetchrError(
                            FetchrError.TIMEOUT,
                            'Request failed due to timeout',
                            this._options,
                            request
                        );
                    }

                    throw new FetchrError(FetchrError.ABORT, err.message, this._options, request);
                }

                throw new FetchrError(FetchrError.UNKNOWN, err.message, this._options, request);
            }
        )
        .catch(_retry.bind(this));
}

function _send() {
    this._request = _fetch.call(this);
}

function FetchrHttpRequest(options) {
    this._controller = new AbortController();
    this._currentAttempt = 0;
    this._options = options;
    this._request = null;
}

FetchrHttpRequest.prototype.abort = function () {
    return this._controller.abort();
};

FetchrHttpRequest.prototype.then = function (resolve, reject) {
    return this._request.then(resolve, reject);
};

FetchrHttpRequest.prototype.catch = function (reject) {
    return this._request.catch(reject);
};

function httpRequest(options) {
    var request = new FetchrHttpRequest(options);
    _send.call(request);
    return request;
}

module.exports = httpRequest;
