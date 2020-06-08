'use strict';

var braintreeCreditProcessor = require('~/cartridge/scripts/braintree/processors/processorCredit');


/**
 * Create Braintree payment instrument and update shipping and billing address, if the new one was given
 * @param {Object} basket Arguments of the HTTP call
 * @returns {Object} handle call result
 */
function Handle(basket) {
    var result = braintreeCreditProcessor.handle(basket);
    return result;
}

/**
 * Create sale transaction and handle result
 * @param {string} orderNumber Order Number
 * @param {Object} paymentInstrument Payment Instrument
 * @returns {Object} sale call result
 */
function Authorize(orderNumber, paymentInstrument) {
    var result = braintreeCreditProcessor.authorize(orderNumber, paymentInstrument);
    return result;
}

exports.Handle = Handle;
exports.Authorize = Authorize;
