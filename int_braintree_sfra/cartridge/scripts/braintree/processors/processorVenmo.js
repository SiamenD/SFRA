'use strict';
/* global dw request empty session */

var {
    getVenmoCustomerPaymentInstrumentByUserID,
    getCustomerPaymentInstrument
} = require('~/cartridge/scripts/braintree/helpers/customerHelper');
var {
    createBaseSaleTransactionData,
    getISO3Country
} = require('~/cartridge/scripts/braintree/processors/processorHelper');
var {
    deleteBraintreePaymentInstruments,
    getAmountPaid,
    createAddressData
} = require('~/cartridge/scripts/braintree/helpers/paymentHelper');

var braintreeApiCalls = require('~/cartridge/scripts/braintree/braintreeAPI/braintreeApiCalls');
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
    if (empty(paymentInstrument.custom.braintreePaymentMethodNonce) && empty(paymentInstrument.custom.braintreePaymentMethodToken)) {
        throw new Error('paymentInstrument.custom.braintreePaymentMethodNonce or paymentInstrument.custom.braintreePaymentMethodToken are empty');
    }

    var data = createBaseSaleTransactionData(order, paymentInstrument);
    data.descriptor = {
        name: (!empty(prefs.BRAINTREE_VENMO_Descriptor_Name) ? prefs.BRAINTREE_VENMO_Descriptor_Name : '')
    };

    data.options = {
        submitForSettlement: prefs.BRAINTREE_VENMO_Payment_Model === 'sale'
    };

    if (prefs.BRAINTREE_VENMO_Vault_Mode === 'always') {
        data.options.storeInVault = true;
    } else if (prefs.BRAINTREE_VENMO_Vault_Mode === 'success') {
        data.options.storeInVaultOnSuccess = true;
    }

    data.deviceData = paymentInstrument.custom.braintreeFraudRiskData;
    data.shipping = createAddressData(order.getDefaultShipment().getShippingAddress());

    if (prefs.BRAINTREE_L2_L3) {
        data.level_2_3_processing = data.shipping.level_2_3_processing = true;
        data.taxAmount = order.getTotalTax().toNumberString();
        if (order.getCustomerLocaleID().split('_')[1].toLowerCase() === data.shipping.countryCodeAlpha2.toLowerCase()) {
            data.shipping.countryCodeAlpha3 = getISO3Country(order.getCustomerLocaleID());
        }
        data.l2_only = true;

        /** Rounding issues due to discounts, removed from scope due to bug on PayPal / BT end.
            * No ETA on bug fix and not in roadmap.
            *
            *
            * data.shippingAmount = order.getShippingTotalPrice();
            * data.discountAmount = getOrderLevelDiscountTotal(order);
            * data.lineItems = getLineItems(order.productLineItems);
        */
    }

    return data;
}

/**
 * Write info about failed order into payment instrument, and mark customer as Braintree customer
 * @param {dw.order.Order} order Current order
 * @param {dw.order.OrderPaymentInstrument} paymentInstrument Used payment instrument
 * @param {string} braintreeError Error text
 * @returns {Object} object which indicates error
 */
function authorizeFailedFlow(order, paymentInstrument, braintreeError) {
    var orderRecord = order;
    var paymentInstrumentRecord = paymentInstrument;
    var paymentTransaction = paymentInstrumentRecord.getPaymentTransaction();
    var paymentProcessor = PaymentMgr.getPaymentMethod(prefs.paymentMethods.BRAINTREE_VENMO.paymentMethodId).getPaymentProcessor();
    Transaction.wrap(function () {
        paymentTransaction.setPaymentProcessor(paymentProcessor);
        orderRecord.custom.isBraintree = true;
        paymentInstrumentRecord.custom.braintreeFailReason = braintreeError;
    });
    return { error: true };
}

/**
 * Save result of the success sale transaction
 * @param {dw.order.Order} order Current order
 * @param {dw.order.OrderPaymentInstrument} paymentInstrument Current payment instrument
 * @param {Object} saleTransactionResponseData Response data from API call
 */
function saveTransactionData(order, paymentInstrument, saleTransactionResponseData) {
    var orderRecord = order;
    var paymentInstrumentRecord = paymentInstrument;
    var responseTransaction = saleTransactionResponseData.transaction;
    var paymentTransaction = paymentInstrumentRecord.getPaymentTransaction();
    var paymentProcessor = PaymentMgr.getPaymentMethod(prefs.paymentMethods.BRAINTREE_VENMO.paymentMethodId).getPaymentProcessor();

    Transaction.wrap(function () {
        paymentTransaction.setTransactionID(responseTransaction.id);
        paymentTransaction.setPaymentProcessor(paymentProcessor);
        paymentTransaction.setAmount(new dw.value.Money(responseTransaction.amount, order.getCurrencyCode()));

        orderRecord.custom.isBraintree = true;
        orderRecord.custom.braintreePaymentStatus = responseTransaction.status;

        paymentInstrumentRecord.custom.braintreePaymentMethodNonce = null;
        paymentInstrumentRecord.custom.braintreeCustomFields = null;
    });
}

/**
 * Save Venmo account as Customer Payment Instrument for the current customer
 * @param {Object} saleTransactionResponseData Response data from API call
 * @returns {Object} Result object
 */
function saveVenmoAccount(saleTransactionResponseData) {
    var customerPaymentInstrument = null;

    try {
        Transaction.begin();

        customerPaymentInstrument = customer.getProfile().getWallet().createPaymentInstrument(prefs.paymentMethods.BRAINTREE_VENMO.paymentMethodId);
        customerPaymentInstrument.setCreditCardType('visa'); // hack for MFRA account.js line 99 (paymentInstrument.creditCardType.toLowerCase())
        customerPaymentInstrument.custom.braintreeVenmoUserId = saleTransactionResponseData.transaction.venmoAccount.venmoUserId;
        customerPaymentInstrument.custom.braintreePaymentMethodToken = saleTransactionResponseData.transaction.venmoAccount.token;

        Transaction.commit();
    } catch (error) {
        Transaction.rollback();
        return {
            error: error.customMessage ? error.customMessage : error.message
        };
    }
    return {
        token: customerPaymentInstrument.custom.braintreePaymentMethodToken
    };
}

/**
 * Create Braintree payment instrument
 * @param {Basket} basket Basket object
 * @returns {Object} success object
 */
function handle(basket) {
    var httpParameterMap = request.httpParameterMap;
    var venmoPaymentInstrument = null;
    var customerPaymentInstrument = null;
    var selectedVenmoAccountUuid = httpParameterMap.braintreeVenmoAccountList.stringValue;
    var paymentProcessor = PaymentMgr.getPaymentMethod(prefs.paymentMethods.BRAINTREE_VENMO.paymentMethodId).getPaymentProcessor();

    Transaction.wrap(function () {
        deleteBraintreePaymentInstruments(basket);
        venmoPaymentInstrument = basket.createPaymentInstrument(prefs.paymentMethods.BRAINTREE_VENMO.paymentMethodId, getAmountPaid(basket));
        venmoPaymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);
    });

    if (selectedVenmoAccountUuid && selectedVenmoAccountUuid !== 'newaccount') {
        customerPaymentInstrument = getCustomerPaymentInstrument(selectedVenmoAccountUuid);
        if (!customerPaymentInstrument) {
            return { error: true };
        }
        Transaction.wrap(function () {
            venmoPaymentInstrument.custom.braintreePaymentMethodToken = customerPaymentInstrument.custom.braintreePaymentMethodToken;
            venmoPaymentInstrument.custom.braintreeCreditCardMakeDefault = httpParameterMap.braintreeVenmoAccountMakeDefault.booleanValue;
        });
        return { success: true };
    }

    if (!httpParameterMap.braintreeVenmoNonce || httpParameterMap.braintreeVenmoNonce.stringValue === '' || !basket) {
        return { error: true };
    }

    Transaction.wrap(function () {
        venmoPaymentInstrument.custom.braintreePaymentMethodNonce = httpParameterMap.braintreeVenmoNonce.stringValue;
        venmoPaymentInstrument.custom.braintreeFraudRiskData = httpParameterMap.braintreeVenmoRiskData.stringValue;
        venmoPaymentInstrument.custom.braintreeCreditCardMakeDefault = httpParameterMap.braintreeVenmoAccountMakeDefault.booleanValue;
        venmoPaymentInstrument.custom.braintreeSaveCreditCard = httpParameterMap.braintreeSaveVenmoAccount.booleanValue;
        venmoPaymentInstrument.custom.braintreeVenmoUserId = httpParameterMap.braintreeVenmoUserId.stringValue;
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
            saveTransactionData(order, paymentInstrument, saleTransactionResponseData);
            var existCustomerPaymentInstrument = getVenmoCustomerPaymentInstrumentByUserID(saleTransactionResponseData.transaction.venmoAccount.venmoUserId);

            if (paymentInstrument.custom.braintreeSaveCreditCard && !existCustomerPaymentInstrument) {
                saveVenmoAccount(saleTransactionResponseData);
                Transaction.wrap(function () {
                    paymentInstrument.custom.braintreeSaveCreditCard = null;
                });
            }

            if (paymentInstrument.custom.braintreeCreditCardMakeDefault) {
                braintreeApiCalls.makeDefaultVenmoAccount(existCustomerPaymentInstrument ? existCustomerPaymentInstrument.custom.braintreePaymentMethodToken : saleTransactionResponseData.transaction.venmoAccount.token);
                Transaction.wrap(function () {
                    paymentInstrument.custom.braintreeCreditCardMakeDefault = null;
                });
            }
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
exports.handle = handle;
exports.authorize = authorize;
