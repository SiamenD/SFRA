'use strict';

var page = module.superModule;
var server = require('server');

server.extend(page);

server.append('Show', function (req, res, next) {
    var { getCustomerPaymentInstruments } = require('~/cartridge/scripts/braintree/helpers/customerHelper');
    var prefs = require('~/cartridge/config/braintreePreferences')();
    var AccountModel = require('*/cartridge/models/account');
    var CREDIT_CARD = require('dw/order/PaymentInstrument').METHOD_CREDIT_CARD;
    res.setViewData({
        braintree: {
            paymentCardInstruments: AccountModel.getCustomerPaymentInstruments(getCustomerPaymentInstruments(CREDIT_CARD)),
            paymentPaypalInstruments: AccountModel.getCustomerPaymentInstruments(getCustomerPaymentInstruments(prefs.paymentMethods.BRAINTREE_PAYPAL.paymentMethodId)),
            paymentVenmoInstruments: AccountModel.getCustomerPaymentInstruments(getCustomerPaymentInstruments(prefs.paymentMethods.BRAINTREE_VENMO.paymentMethodId)),
            prefs: prefs
        }
    });
    next();
});

module.exports = server.exports();
