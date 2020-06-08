'use strict';

var {
    getPaypalCustomerPaymentInstrumentByEmail,
    getDefaultCustomerPaypalPaymentInstrument,
    getCustomerPaymentInstrument
} = require('~/cartridge/scripts/braintree/helpers/customerHelper');
var {
    saveGeneralTransactionData,
    getISO3Country,
    createBaseSaleTransactionData,
    updateShippingAddress,
    updateBillingAddress,
    getCustomFields
} = require('~/cartridge/scripts/braintree/processors/processorHelper');
var {
    createAddressData,
    addDefaultShipping,
    getAmountPaid,
    deleteBraintreePaymentInstruments,
    getLogger
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
        name: (!empty(prefs.BRAINTREE_PAYPAL_Descriptor_Name) ? prefs.BRAINTREE_PAYPAL_Descriptor_Name : '')
    };

    data.options = {
        submitForSettlement: prefs.BRAINTREE_PAYPAL_Payment_Model === 'sale'
    };

    if (prefs.BRAINTREE_PAYPAL_Fraud_Tools_Enabled) {
        data.deviceData = paymentInstrument.custom.braintreeFraudRiskData;
    }

    if (prefs.BRAINTREE_PAYPAL_Vault_Mode === 'always') {
        data.options.storeInVault = true;
    } else if (prefs.BRAINTREE_PAYPAL_Vault_Mode === 'success') {
        data.options.storeInVaultOnSuccess = true;
    }

    if (prefs.BRAINTREE_PAYPAL_Vault_Mode !== 'not') {
        data.options.addBillingAddress = true;
    }

    if (!empty(prefs.BRAINTREE_PAYPAL_Payee_Email)) {
        data.options.payeeEmail = prefs.BRAINTREE_PAYPAL_Payee_Email;
    }

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
 * Save PayPal account as Customer Payment Instrument for the current customer
 * @param {dw.order.Order} order Current order
 * @param {Object} saleTransactionResponseData Response data from API call
 * @returns {Object} Result object
 */
function savePaypalAccount(order, saleTransactionResponseData) {
    var customerPaymentInstrument = null;
    var billingAddress = order.getBillingAddress();
    var billingAddressObject = {
        firstName: billingAddress.getFirstName(),
        lastName: billingAddress.getLastName(),
        countryCodeAlpha2: billingAddress.getCountryCode().value,
        locality: billingAddress.getCity(),
        streetAddress: billingAddress.getAddress1(),
        extendedAddress: billingAddress.getAddress2(),
        postalCode: billingAddress.getPostalCode(),
        region: billingAddress.getStateCode(),
        phone: billingAddress.getPhone()
    };

    try {
        Transaction.begin();
        customerPaymentInstrument = customer.getProfile().getWallet().createPaymentInstrument(prefs.paymentMethods.BRAINTREE_PAYPAL.paymentMethodId);
        customerPaymentInstrument.setCreditCardType('visa'); // hack for MFRA account.js line 99 (paymentInstrument.creditCardType.toLowerCase())
        customerPaymentInstrument.custom.braintreePaypalAccountEmail = saleTransactionResponseData.transaction.paypal.payerEmail;
        customerPaymentInstrument.custom.braintreePaypalAccountAddresses = JSON.stringify(billingAddressObject);
        customerPaymentInstrument.custom.braintreePaymentMethodToken = saleTransactionResponseData.transaction.paypal.token;
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
 * Save result of the success sale transaction
 * @param {dw.order.Order} orderRecord Current order
 * @param {dw.order.OrderPaymentInstrument} paymentInstrumentRecord Current payment instrument
 * @param {Object} responseTransaction Response data from API call
 */
function saveTransactionData(orderRecord, paymentInstrumentRecord, responseTransaction) {
    var riskData = responseTransaction.riskData;
    var customer = orderRecord.getCustomer();
    var isCustomerExistInVault = braintreeApiCalls.isCustomerExistInVault(customer);

    Transaction.wrap(function () {
        saveGeneralTransactionData(orderRecord, paymentInstrumentRecord, responseTransaction);

        if (riskData) {
            orderRecord.custom.braintreeFraudRiskData = riskData.decision;
            paymentInstrumentRecord.custom.braintreeFraudRiskData = riskData.decision;
        }

        if (responseTransaction.paypal) {
            paymentInstrumentRecord.custom.braintreePaymentMethodToken = responseTransaction.paypal.token;
        }

        if (isCustomerExistInVault) {
            customer.getProfile().custom.isBraintree = true;
        }
    });
}

/**
 * Perform API call to create new(sale) transaction
 * @param {dw.order.Order} order Current order
 * @param {dw.order.OrderPaymentInstrument} paymentInstrument Used payment instrument
 */
function mainFlow(order, paymentInstrument) {
    var saleTransactionRequestData = createSaleTransactionData(order, paymentInstrument);
    var saleTransactionResponseData = braintreeApiCalls.call(saleTransactionRequestData);
    saveTransactionData(order, paymentInstrument, saleTransactionResponseData.transaction);

    var existCustomerPaymentInstrument = getPaypalCustomerPaymentInstrumentByEmail(saleTransactionResponseData.transaction.paypal.payerEmail);
    if (paymentInstrument.custom.braintreeSaveCreditCard && !existCustomerPaymentInstrument) {
        savePaypalAccount(order, saleTransactionResponseData);
        Transaction.wrap(function () {
            paymentInstrument.custom.braintreeSaveCreditCard = null;
        });
    }

    if (paymentInstrument.custom.braintreeCreditCardMakeDefault) {
        braintreeApiCalls.makeDefaultPaypalAccount(existCustomerPaymentInstrument ? existCustomerPaymentInstrument.custom.braintreePaymentMethodToken : saleTransactionResponseData.transaction.paypal.token);
        Transaction.wrap(function () {
            paymentInstrument.custom.braintreeCreditCardMakeDefault = null;
        });
    }
}

/**
 * Perform API call to create new(sale) transaction
 * @param {dw.order.Order} order Current order
 * @param {dw.order.OrderPaymentInstrument} paymentInstrument Used payment instrument
 */
function intentOrderFlow(order, paymentInstrument) {
    var paymentMethodToken = paymentInstrument.custom.braintreePaymentMethodToken;
    if (!paymentMethodToken) {
        paymentMethodToken = braintreeApiCalls.createPaymentMethod(paymentInstrument.custom.braintreePaymentMethodNonce, order);
    }
    Transaction.wrap(function () {
        order.custom.isBraintree = true;
        order.custom.isBraintreeIntentOrder = true;
        paymentInstrument.custom.braintreeFraudRiskData = null;
        paymentInstrument.custom.braintreePaymentMethodToken = paymentMethodToken;
        paymentInstrument.custom.braintreeCustomFields = JSON.stringify(getCustomFields(order, paymentInstrument));
    });
}

/**
 * Write info about failed order into payment instrument, and mark customer as Braintree customer
 * @param {dw.order.Order} order Current order
 * @param {dw.order.OrderPaymentInstrument} paymentInstrument Used payment instrument
 * @param {string} braintreeError Error text
 * @returns {Object} Error indicator
 */
function authorizeFailedFlow(order, paymentInstrument, braintreeError) {
    var profile = order.getCustomer().getProfile();
    Transaction.wrap(function () {
        order.custom.isBraintree = true;
        paymentInstrument.custom.braintreeFailReason = braintreeError;

        if (braintreeApiCalls.isCustomerExistInVault(customer)) {
            profile.custom.isBraintree = true;
        }
    });
    return { error: true };
}

/**
 * Create Braintree payment instrument and update shipping and billing address, if the new one was given
 * @param {Basket} basket Basket object
 * @param {Basket} fromCart from cart checkout indicator
 * @returns {Object} success object
 */
function handle(basket, fromCart) {
    var httpParameterMap = request.httpParameterMap;
    var braintreePaypalBillingAddress = httpParameterMap.braintreePaypalBillingAddress.stringValue;
    var braintreePaypalShippingAddress = httpParameterMap.braintreePaypalShippingAddress.stringValue;
    var isNewBilling = !empty(braintreePaypalBillingAddress) && braintreePaypalBillingAddress !== '{}';
    var isNewShipping = !empty(braintreePaypalShippingAddress) && braintreePaypalShippingAddress !== '{}';
    var paymentProcessor = PaymentMgr.getPaymentMethod(prefs.paymentMethods.BRAINTREE_PAYPAL.paymentMethodId).getPaymentProcessor();
    var paypalPaymentInstrument = null;
    var customerPaymentInstrument = null;

    if (fromCart) {
        addDefaultShipping(basket);
        customerPaymentInstrument = getDefaultCustomerPaypalPaymentInstrument();

        if (braintreePaypalBillingAddress) {
            session.custom.btPaypalAccountEmail = JSON.parse(braintreePaypalBillingAddress).email;
        } else if (customerPaymentInstrument) {
            session.custom.btPaypalAccountEmail = customerPaymentInstrument.custom.braintreePaypalAccountEmail;
        }
    }

    Transaction.wrap(function () {
        var methodName;
        if (fromCart) {
            var paymentInstruments = basket.getPaymentInstruments();
            var iterator = paymentInstruments.iterator();
            var instument = null;
            while (iterator.hasNext()) {
                instument = iterator.next();
                basket.removePaymentInstrument(instument);
            }
            methodName = prefs.paymentMethods.BRAINTREE_PAYPAL.paymentMethodId;
        } else {
            deleteBraintreePaymentInstruments(basket);
            methodName = session.forms.billing.paymentMethod.value;
        }

        paypalPaymentInstrument = basket.createPaymentInstrument(methodName, getAmountPaid(basket));
        paypalPaymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);
    });

    var selectedPaypalAccountUuid = httpParameterMap.braintreePaypalAccountList.stringValue;
    if (selectedPaypalAccountUuid !== null && selectedPaypalAccountUuid !== 'newaccount') {
        customerPaymentInstrument = getCustomerPaymentInstrument(selectedPaypalAccountUuid);
        if (!customerPaymentInstrument) {
            return { error: true };
        }
        Transaction.wrap(function () {
            paypalPaymentInstrument.custom.braintreePaymentMethodToken = customerPaymentInstrument.custom.braintreePaymentMethodToken;
            paypalPaymentInstrument.custom.braintreeCreditCardMakeDefault = httpParameterMap.braintreePaypalAccountMakeDefault.booleanValue;
        });
        return { success: true };
    }

    if (!httpParameterMap.braintreePaypalNonce || httpParameterMap.braintreePaypalNonce.stringValue === '') {
        return { error: true };
    }

    if (!basket) {
        return { error: true };
    }

    if (isNewShipping && !!basket.getProductLineItems().size()) {
        updateShippingAddress(braintreePaypalShippingAddress, basket.getDefaultShipment());
    }

    if ((isNewBilling && prefs.BRAINTREE_PAYPAL_Billing_Address_Override) || fromCart) {
        var newBilling;
        if (customerPaymentInstrument) {
            newBilling = JSON.parse(customerPaymentInstrument.custom.braintreePaypalAccountAddresses);
            newBilling.email = customerPaymentInstrument.custom.braintreePaypalAccountEmail;
        } else {
            newBilling = JSON.parse(braintreePaypalBillingAddress);
        }
        updateBillingAddress(newBilling, basket);
    }

    Transaction.wrap(function () {
        paypalPaymentInstrument.custom.braintreePaymentMethodToken = customerPaymentInstrument ? customerPaymentInstrument.custom.braintreePaymentMethodToken : null;
        paypalPaymentInstrument.custom.braintreePaymentMethodNonce = httpParameterMap.braintreePaypalNonce.stringValue;
        paypalPaymentInstrument.custom.braintreeFraudRiskData = httpParameterMap.braintreePaypalRiskData.stringValue;
        paypalPaymentInstrument.custom.braintreeCreditCardMakeDefault = httpParameterMap.braintreePaypalAccountMakeDefault.booleanValue;
        paypalPaymentInstrument.custom.braintreeSaveCreditCard = httpParameterMap.braintreeSavePaypalAccount.booleanValue;
        paypalPaymentInstrument.custom.braintreeCustomFields = httpParameterMap.braintreePaypalCustomFields.stringValue;
        if (httpParameterMap.braintreePaypalEmail.stringValue) {
            paypalPaymentInstrument.custom.braintreePaypalEmail = httpParameterMap.braintreePaypalEmail.stringValue;
        }
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
            if (prefs.BRAINTREE_PAYPAL_Payment_Model === 'order') {
                intentOrderFlow(order, paymentInstrument);
            } else {
                mainFlow(order, paymentInstrument);
            }
        } catch (error) {
            getLogger().error(error);
            return authorizeFailedFlow(order, paymentInstrument, error.customMessage ? error.customMessage : error.message);
        }
    } else {
        Transaction.wrap(function () {
            order.removePaymentInstrument(paymentInstrument);
        });
    }
    return { authorized: true };
}

exports.intentOrderFlow = intentOrderFlow;
exports.savePaypalAccount = savePaypalAccount;
exports.saveTransactionData = saveTransactionData;
exports.authorizeFailedFlow = authorizeFailedFlow;
exports.createSaleTransactionData = createSaleTransactionData;
exports.handle = handle;
exports.authorize = authorize;
