'use strict';

var Transaction = require('dw/system/Transaction');
var Site = require('dw/system/Site');
var PaymentInstrument = require('dw/order/PaymentInstrument');
var CustomerMgr = require('dw/customer/CustomerMgr');

var prefs = require('~/cartridge/config/braintreePreferences')();

var customerHelper = {};

/**
 * Get customer payment instrument by uuid
 * @param {string} uuid uuid for PI
 * @return {dw.customer.CustomerPaymentInstrument} cutomet payment indstrument
 */
customerHelper.getCustomerPaymentInstrument = function (uuid) {
    if (!customer.authenticated) {
        return false;
    }
    var customerPaymentInstruments = customer.getProfile().getWallet().getPaymentInstruments();
    var instrument = null;
    if (uuid === null || customerPaymentInstruments === null || customerPaymentInstruments.size() < 1) {
        return false;
    }
    var instrumentsIter = customerPaymentInstruments.iterator();
    while (instrumentsIter.hasNext()) {
        instrument = instrumentsIter.next();
        if (uuid.equals(instrument.UUID)) {
            return instrument;
        }
    }
    return false;
};

/**
 * Return specific payment method from customers payment methods list
 * @param {string} paymentMethodName Name of the payment method
 * @param {string} customerId Customer id
 * @return {Object} Payment method from customers payment methods list
 */
customerHelper.getCustomerPaymentInstruments = function (paymentMethodName, customerId) {
    var profile = null;

    if (customerId) {
        profile = CustomerMgr.getProfile(customerId.indexOf('_') >= 0 ? customerId.split('_')[1] : customerId);
    } else {
        profile = customer.authenticated ? customer.getProfile() : null;
    }
    if (!profile) {
        return null;
    }
    return profile.getWallet().getPaymentInstruments(paymentMethodName);
};

/**
 * Get default customer PayPal payment instrument
 * @param {string} customerId Braintree customer id or dw cusomer id. If customer id is null, returns payment instruments of current customer
 * @return {dw.customer.CustomerPaymentInstrument} payment instrument
 */
customerHelper.getDefaultCustomerPaypalPaymentInstrument = function (customerId) {
    var instruments = customerHelper.getCustomerPaymentInstruments(prefs.paymentMethods.BRAINTREE_PAYPAL.paymentMethodId, customerId);
    if (!instruments) {
        return null;
    }
    var iterator = instruments.iterator();
    var instrument = null;
    while (iterator.hasNext()) {
        instrument = iterator.next();
        if (instrument.custom.braintreeDefaultCard) {
            return instrument;
        }
    }
    return instruments.length > 0 && instruments[0];
};

/**
 * Get saved PayPal customer payment method instrument
 * @param {string} email PayPal account email
 * @return {dw.util.Collection} payment instruments
 */
customerHelper.getPaypalCustomerPaymentInstrumentByEmail = function (email) {
    var customerPaymentInstruments = customerHelper.getCustomerPaymentInstruments(prefs.paymentMethods.BRAINTREE_PAYPAL.paymentMethodId);
    if (!customerPaymentInstruments) {
        return null;
    }
    var iterator = customerPaymentInstruments.iterator();
    var paymentInst = null;
    while (iterator.hasNext()) {
        paymentInst = iterator.next();
        if (paymentInst.custom.braintreePaypalAccountEmail === email) {
            return paymentInst;
        }
    }

    return null;
};

/**
 * Create customer ID for braintree based on the customer number
 * @param {dw.customer.Customer} customer  Registered customer object
 * @return {string} Customer ID
 */
customerHelper.createCustomerId = function (customer) {
    if (session.custom.customerId) {
        return session.custom.customerId;
    }

    var id = customer.getProfile().getCustomerNo();
    var siteName = Site.getCurrent().getID().toLowerCase();
    var allowNameLength = 31 - id.length;
    if (siteName.length > allowNameLength) {
        siteName = siteName.slice(0, allowNameLength);
    }

    siteName = siteName + '_' + id;
    session.custom.customerId = siteName;

    return siteName;
};

/**
 * Save credit cart as customer payment method
 * @param {Object} createPaymentMethodResponseData Responce data from createPaymentMethod API call
 * @param {string} creditType card type
 * @param {string} creditOwner Credit card owner
 * @return {Object} Object with cart data
 */
customerHelper.saveCustomerCreditCard = function (createPaymentMethodResponseData, creditType, creditOwner) {
    var card = {
        expirationMonth: createPaymentMethodResponseData.creditCard.expirationMonth,
        expirationYear: createPaymentMethodResponseData.creditCard.expirationYear,
        number: Date.now().toString().substr(0, 11) + createPaymentMethodResponseData.creditCard.last4,
        type: creditType,
        owner: creditOwner,
        paymentMethodToken: createPaymentMethodResponseData.creditCard.token
    };
    try {
        Transaction.begin();
        var customerPaymentInstrument = customer.getProfile().getWallet().createPaymentInstrument(PaymentInstrument.METHOD_CREDIT_CARD);
        customerPaymentInstrument.setCreditCardHolder(card.owner);
        customerPaymentInstrument.setCreditCardNumber(card.number);
        customerPaymentInstrument.setCreditCardExpirationMonth(parseInt(card.expirationMonth, 10));
        customerPaymentInstrument.setCreditCardExpirationYear(parseInt(card.expirationYear, 10));
        customerPaymentInstrument.setCreditCardType(card.type);
        customerPaymentInstrument.custom.braintreePaymentMethodToken = card.paymentMethodToken;
        Transaction.commit();
    } catch (error) {
        Transaction.rollback();
        card = {
            error: error.customMessage ? error.customMessage : error.message
        };
    }
    return card;
};

/**
 * Get saved Venmo customer payment method instrument
 * @param {string} userId venmo
 * @return {dw.util.Collection} payment instruments
 */
customerHelper.getVenmoCustomerPaymentInstrumentByUserID = function (userId) {
    var customerPaymentInstruments = customerHelper.getCustomerPaymentInstruments(prefs.paymentMethods.BRAINTREE_VENMO.paymentMethodId);
    if (customerPaymentInstruments) {
        var iterator = customerPaymentInstruments.iterator();
        var paymentInst = null;
        while (iterator.hasNext()) {
            paymentInst = iterator.next();
            if (paymentInst.custom.braintreeVenmoUserId === userId) {
                return paymentInst;
            }
        }
    }

    return null;
};

module.exports = customerHelper;
