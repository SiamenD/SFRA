/* eslint-disable require-jsdoc */
'use strict';

var BraintreeHelper = require('~/cartridge/scripts/braintree/braintreeHelper');
var braintreeApiCalls = require('~/cartridge/scripts/braintree/braintreeApiCalls');
var prefs = BraintreeHelper.getPrefs();

var OrderMgr = require('dw/order/OrderMgr');
var PaymentMgr = require('dw/order/PaymentMgr');
var Transaction = require('dw/system/Transaction');

function updateBillingAddress(braintreeApplePayShippingAddress, basket) {
    var isCountryCodesUpperCase = BraintreeHelper.isCountryCodesUpperCase();
    var newBilling = JSON.parse(braintreeApplePayShippingAddress);
    Transaction.wrap(function () {
        var billing = basket.getBillingAddress() || basket.createBillingAddress();
        billing.setFirstName(newBilling.firstName || '');
        billing.setLastName(newBilling.lastName || '');
        billing.setCountryCode(isCountryCodesUpperCase ? newBilling.countryCodeAlpha2.toUpperCase() : newBilling.countryCodeAlpha2.toLowerCase());
        billing.setCity(newBilling.locality || '');
        billing.setAddress1(newBilling.streetAddress || '');
        billing.setAddress2(newBilling.extendedAddress || '');
        billing.setPostalCode(newBilling.postalCode || '');
        billing.setStateCode(newBilling.region || '');
        billing.setPhone(newBilling.phone || '');
        basket.setCustomerEmail(newBilling.email);
    });
}

function updateShippingAddress(braintreeApplePayBillingAddress, basket) {
    var fullName;
    var newShipping = JSON.parse(braintreeApplePayBillingAddress);
    var isCountryCodesUpperCase = BraintreeHelper.isCountryCodesUpperCase();
    if (newShipping.recipientName) {
        fullName = BraintreeHelper.createFullName(newShipping.recipientName);
    }
    Transaction.wrap(function () {
        var shipping = basket.getDefaultShipment().getShippingAddress() || basket.getDefaultShipment().createShippingAddress();
        shipping.setCountryCode(isCountryCodesUpperCase ? newShipping.countryCodeAlpha2.toUpperCase() : newShipping.countryCodeAlpha2.toLowerCase());
        shipping.setCity(newShipping.locality || '');
        shipping.setAddress1(newShipping.streetAddress || '');
        shipping.setAddress2(newShipping.extendedAddress || '');
        shipping.setPostalCode(newShipping.postalCode || '');
        shipping.setStateCode(newShipping.region || '');
        shipping.setPhone(newShipping.phone || '');
        if (fullName) {
            shipping.setFirstName(fullName.firstName || '');
            if (!empty(fullName.secondName)) {
                shipping.setSecondName(fullName.secondName || '');
            }
            if (!empty(fullName.lastName)) {
                shipping.setLastName(fullName.lastName || '');
            }
        } else {
            shipping.setFirstName(newShipping.firstName || '');
            shipping.setLastName(newShipping.lastName || '');
        }
    });
}

/**
 * Perform API call to create new(sale) transaction
 * @param {dw.order.Order} order Current order
 * @param {dw.order.OrderPaymentInstrument} paymentInstrument Used payment instrument
 * @return {Object} Response data from API call
 */
function createSaleTransactionData(order, paymentInstrument) {
    var data = {
        xmlType: 'transaction',
        requestPath: 'transactions'
    };
    var customer = order.getCustomer();

    if (empty(paymentInstrument.custom.braintreePaymentMethodNonce)) {
        throw new Error('paymentInstrument.custom.braintreePaymentMethodNonce');
    }

    data.paymentMethodNonce = paymentInstrument.custom.braintreePaymentMethodNonce;
    data.orderId = order.getOrderNo();
    data.amount = BraintreeHelper.getAmount(order).getValue();
    data.currencyCode = order.getCurrencyCode();

    if (braintreeApiCalls.isCustomerExist(customer)) {
        data.customerId = BraintreeHelper.createCustomerId(customer);
    } else {
        data.customerId = null;
        data.customer = BraintreeHelper.createCustomerData(order);
    }

    data.options = {
        submitForSettlement: prefs.BRAINTREE_APPLEPAY_Payment_Model === 'sale'
    };

    data.customFields = BraintreeHelper.getCustomFields(order);

    if (prefs.BRAINTREE_L2_L3) {
        data.shipping = BraintreeHelper.createAddressData(order.getDefaultShipment().getShippingAddress());
        data.level_2_3_processing = data.shipping.level_2_3_processing = true;
        data.taxAmount = order.getTotalTax().toNumberString();
        if (order.getCustomerLocaleID().split('_')[1].toLowerCase() === data.shipping.countryCodeAlpha2.toLowerCase()) {
            data.shipping.countryCodeAlpha3 = BraintreeHelper.getISO3Country(order.getCustomerLocaleID());
        }
        data.shippingAmount = order.getShippingTotalPrice();
        data.discountAmount = BraintreeHelper.getOrderLevelDiscountTotal(order);
        data.lineItems = BraintreeHelper.getLineItems(order.productLineItems);
    }

    return data;
}

/**
 * Write info about failed order into payment instrument, and mark customer as Braintree customer
 * @param {dw.order.Order} orderRecord Current order
 * @param {dw.order.OrderPaymentInstrument} paymentInstrumentRecord Used payment instrument
 * @param {string} braintreeError Error text
 * @returns {Object} object which indicates error
 */
function authorizeFailedFlow(orderRecord, paymentInstrumentRecord, braintreeError) {
    var paymentTransaction = paymentInstrumentRecord.getPaymentTransaction();
    var paymentProcessor = PaymentMgr.getPaymentMethod(prefs.applePayMethodName).getPaymentProcessor();
    Transaction.wrap(function () {
        paymentTransaction.setPaymentProcessor(paymentProcessor);
        orderRecord.custom.isBraintree = true;
        paymentInstrumentRecord.custom.braintreeFailReason = braintreeError;
    });
    return { error: true };
}

/**
 * Save result of the success sale transaction
 * @param {dw.order.Order} orderRecord Current order
 * @param {dw.order.OrderPaymentInstrument} paymentInstrumentRecord Current payment instrument
 * @param {Object} responseTransaction Response data from API call
 */
function saveTransactionData(orderRecord, paymentInstrumentRecord, responseTransaction) {
    var PT = require('dw/order/PaymentTransaction');
    var paymentTransaction = paymentInstrumentRecord.getPaymentTransaction();
    var paymentProcessor = PaymentMgr.getPaymentMethod(prefs.applePayMethodName).getPaymentProcessor();
    var Money = require('dw/value/Money');

    Transaction.wrap(function () {
        paymentTransaction.setTransactionID(responseTransaction.id);
        paymentTransaction.setPaymentProcessor(paymentProcessor);
        paymentTransaction.setAmount(new Money(responseTransaction.amount, orderRecord.getCurrencyCode()));

        orderRecord.custom.isBraintree = true;
        orderRecord.custom.braintreePaymentStatus = responseTransaction.status;

        if (responseTransaction.type === 'sale' && responseTransaction.status === 'authorized') {
            paymentTransaction.setType(PT.TYPE_AUTH);
        } else if (responseTransaction.type === 'sale' && responseTransaction.status === 'submitted_for_settlement') {
            paymentTransaction.setType(PT.TYPE_CAPTURE);
        }

        paymentInstrumentRecord.custom.braintreePaymentMethodNonce = null;
        paymentInstrumentRecord.custom.braintreeCustomFields = null;
    });
}

/**
 * Create Braintree payment instrument and update shipping and billing address, if the new one was given
 * @param {Basket} basket Basket object
 * @param {boolean} fromCart indicator for cart checkout
 * @returns {Object} success object
 */
function handle(basket, fromCart) {
    var httpParameterMap = request.httpParameterMap;
    var braintreeApplePayBillingAddress = httpParameterMap.braintreeApplePayBillingAddress.stringValue;
    var braintreeApplePayShippingAddress = httpParameterMap.braintreeApplePayShippingAddress.stringValue;
    var isNewBilling = !empty(braintreeApplePayBillingAddress) && braintreeApplePayBillingAddress !== '{}';
    var isNewShipping = !empty(braintreeApplePayShippingAddress) && braintreeApplePayShippingAddress !== '{}';

    var applePayPaymentInstrument = null;

    if (fromCart) {
        BraintreeHelper.addDefaultShipping(basket);
    }

    Transaction.wrap(function () {
        if (fromCart) {
            var paymentInstruments = basket.getPaymentInstruments();
            var iterator = paymentInstruments.iterator();
            var instument = null;
            while (iterator.hasNext()) {
                instument = iterator.next();
                basket.removePaymentInstrument(instument);
            }
        } else {
            BraintreeHelper.deleteBraintreePaymentInstruments(basket);
        }

        if (!prefs.isMFRA) {
            session.forms.billing.fulfilled.value = true;
        }

        applePayPaymentInstrument = basket.createPaymentInstrument(prefs.applePayMethodName, BraintreeHelper.getAmount(basket));
    });

    if (!httpParameterMap.braintreeApplePayNonce || httpParameterMap.braintreeApplePayNonce.stringValue === '') {
        return { error: true };
    }

    if (!basket) {
        return { error: true };
    }

    if (isNewShipping && !!basket.getProductLineItems().size()) {
        updateShippingAddress(braintreeApplePayShippingAddress, basket);
    }

    if (isNewBilling || fromCart) {
        updateBillingAddress(braintreeApplePayBillingAddress, basket);
    }

    Transaction.wrap(function () {
        applePayPaymentInstrument.custom.braintreePaymentMethodNonce = httpParameterMap.braintreeApplePayNonce.stringValue;
        applePayPaymentInstrument.custom.braintreeCustomFields = httpParameterMap.braintreeApplePayCustomFields.stringValue;
    });

    return { success: true };
}

/**
 * Authorize payment function
 * @param {string} orderNo Order Number
 * @param {Object} paymentInstrument Instrument
 * @returns {Object} success object
 */
function authorize(orderNo, paymentInstrument) {
    var order = OrderMgr.getOrder(orderNo);

    if (paymentInstrument && paymentInstrument.getPaymentTransaction().getAmount().getValue() > 0) {
        try {
            var saleTransactionRequestData = createSaleTransactionData(order, paymentInstrument);
            var saleTransactionResponseData = braintreeApiCalls.call(saleTransactionRequestData);
            saveTransactionData(order, paymentInstrument, saleTransactionResponseData.transaction);
        } catch (error) {
            return authorizeFailedFlow(order, paymentInstrument, error.customMessage ? error.customMessage : error.message);
        }
    } else {
        Transaction.wrap(function () {
            order.removePaymentInstrument(paymentInstrument);
        });
    }
    return { authorized: true };
}

/*
 * Module exports
 */
exports.updateBillingAddress = updateBillingAddress;
exports.updateShippingAddress = updateShippingAddress;
exports.saveTransactionData = saveTransactionData;
exports.createSaleTransactionData = createSaleTransactionData;
exports.authorizeFailedFlow = authorizeFailedFlow;
exports.handle = handle;
exports.authorize = authorize;
