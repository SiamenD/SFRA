'use strict';

var page = module.superModule;
var server = require('server');
var braintreeApiCalls = require('~/cartridge/scripts/braintree/braintreeAPI/braintreeApiCalls');

server.extend(page);

server.append('DeletePayment', function (req, res, next) {
    var array = require('*/cartridge/scripts/util/array');

    var UUID = req.querystring.UUID;
    var paymentInstruments = req.currentCustomer.wallet.paymentInstruments;
    var paymentToDelete = array.find(paymentInstruments, function (item) {
        return UUID === item.UUID;
    });

    var token = paymentToDelete.raw.custom.braintreePaymentMethodToken;
    if (token !== null) {
        braintreeApiCalls.deletePaymentMethod(token);
    }

    next();
});

module.exports = server.exports();
