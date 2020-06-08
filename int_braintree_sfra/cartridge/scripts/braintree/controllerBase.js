'use strict';

var Transaction = require('dw/system/Transaction');
var braintreeApiCalls = require('~/cartridge/scripts/braintree/braintreeAPI/braintreeApiCalls');

var PaymentInstrument = require('dw/order/PaymentInstrument');

var controllerBase = {};

controllerBase.getPaymentMethodNonceByUUID = function (uuid) {
    var currentCustomerProfile = customer.getProfile();
    var customerPaymentInstruments = currentCustomerProfile.getWallet().getPaymentInstruments(PaymentInstrument.METHOD_CREDIT_CARD);
    var token = null;

    var iterator = customerPaymentInstruments.iterator();
    var paymentInst = null;
    while (iterator.hasNext()) {
        paymentInst = iterator.next();
        if (paymentInst.getUUID() === uuid) {
            if (paymentInst.custom.braintreePaymentMethodToken) {
                token = paymentInst.custom.braintreePaymentMethodToken;
            } else {
                token = paymentInst.creditCardToken;
                Transaction.wrap(function () {
                    paymentInst.custom.braintreePaymentMethodToken = token;
                });
            }
            break;
        }
    }

    if (!token) {
        require('~/cartridge/scripts/braintree/helpers/paymentHelper').getLogger().error(new Error('No token find for given uuid: ' + uuid));
        return null;
    }

    return braintreeApiCalls.getNonceFromToken(token);
};

module.exports = controllerBase;
