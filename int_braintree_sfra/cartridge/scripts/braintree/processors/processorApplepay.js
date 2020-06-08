/* eslint-disable require-jsdoc */
'use strict';

var braintreeApiCalls = require('~/cartridge/scripts/braintree/braintreeAPI/braintreeApiCalls');

var {
    createAddressData,
    getOrderLevelDiscountTotal,
    getLineItems,
    deleteBraintreePaymentInstruments,
    addDefaultShipping,
    getAmountPaid
} = require('~/cartridge/scripts/braintree/helpers/paymentHelper');
var {
    updateBillingAddress,
    updateShippingAddress,
    saveGeneralTransactionData,
    createBaseSaleTransactionData,
    getISO3Country
} = require('~/cartridge/scripts/braintree/processors/processorHelper');

var prefs = require('~/cartridge/config/braintreePreferences')();

var OrderMgr = require('dw/order/OrderMgr');
var PaymentMgr = require('dw/order/PaymentMgr');
var Transaction = require('dw/system/Transaction');

/**
 * Perform API call to create new(sale) transaction
 * @param {dw.order.Order} order Current order
 * @param {dw.order.OrderPaymentInstrument} paymentInstrument Used payment instrument
 * @return {Object} Response data from API call
 */
function createSaleTransactionData(order, paymentInstrument) {
    if (empty(paymentInstrument.custom.braintreePaymentMethodNonce)) {
        throw new Error('paymentInstrument.custom.braintreePaymentMethodNonce');
    }
    var data = createBaseSaleTransactionData(order, paymentInstrument);

    data.options = {
        submitForSettlement: prefs.BRAINTREE_APPLEPAY_Payment_Model === 'sale'
    };

    if (prefs.BRAINTREE_L2_L3) {
        data.shipping = createAddressData(order.getDefaultShipment().getShippingAddress());
        data.level_2_3_processing = data.shipping.level_2_3_processing = true;
        data.taxAmount = order.getTotalTax().toNumberString();
        if (order.getCustomerLocaleID().split('_')[1].toLowerCase() === data.shipping.countryCodeAlpha2.toLowerCase()) {
            data.shipping.countryCodeAlpha3 = getISO3Country(order.getCustomerLocaleID());
        }
        data.shippingAmount = order.getShippingTotalPrice();
        data.discountAmount = getOrderLevelDiscountTotal(order);
        data.lineItems = getLineItems(order.productLineItems);
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
    Transaction.wrap(function () {
        orderRecord.custom.isBraintree = true;
        paymentInstrumentRecord.custom.braintreeFailReason = braintreeError;
    });
    return { error: true };
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
    var paymentProcessor = PaymentMgr.getPaymentMethod(prefs.paymentMethods.BRAINTREE_APPLEPAY.paymentMethodId).getPaymentProcessor();

    var applePayPaymentInstrument = null;

    if (fromCart) {
        addDefaultShipping(basket);
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
            deleteBraintreePaymentInstruments(basket);
        }

        applePayPaymentInstrument = basket.createPaymentInstrument(prefs.paymentMethods.BRAINTREE_APPLEPAY.paymentMethodId, getAmountPaid(basket));
        applePayPaymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);
    });

    if (!httpParameterMap.braintreeApplePayNonce || httpParameterMap.braintreeApplePayNonce.stringValue === '') {
        return { error: true };
    }

    if (!basket) {
        return { error: true };
    }

    if (isNewShipping && !!basket.getProductLineItems().size()) {
        updateShippingAddress(braintreeApplePayShippingAddress, basket.getDefaultShipment());
    }

    if (isNewBilling || fromCart) {
        var newBilling = JSON.parse(braintreeApplePayShippingAddress);
        updateBillingAddress(newBilling, basket);
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
            Transaction.wrap(function () {
                saveGeneralTransactionData(order, paymentInstrument, saleTransactionResponseData.transaction);
            });
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
exports.authorizeFailedFlow = authorizeFailedFlow;
exports.handle = handle;
exports.authorize = authorize;
exports.createSaleTransactionData = createSaleTransactionData;
