'use strict';

var BraintreeHelper = require('~/cartridge/scripts/braintree/braintreeHelper');
var braintreeApiCalls = require('~/cartridge/scripts/braintree/braintreeApiCalls');
var prefs = BraintreeHelper.getPrefs();

var OrderMgr = require('dw/order/OrderMgr');
var PaymentMgr = require('dw/order/PaymentMgr');
var Transaction = require('dw/system/Transaction');


// eslint-disable-next-line require-jsdoc
function updateBillingAddress(customerPaymentInstrument, braintreePaypalBillingAddress, basket) {
    var newBilling;
    var isCountryCodesUpperCase = BraintreeHelper.isCountryCodesUpperCase();
    if (customerPaymentInstrument) {
        newBilling = JSON.parse(customerPaymentInstrument.custom.braintreePaypalAccountAddresses);
        newBilling.email = customerPaymentInstrument.custom.braintreePaypalAccountEmail;
    } else {
        newBilling = JSON.parse(braintreePaypalBillingAddress);
    }
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

// eslint-disable-next-line require-jsdoc
function updateShippingAddress(braintreePaypalShippingAddress, basket) {
    var fullName;
    var newShipping = JSON.parse(braintreePaypalShippingAddress);
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
    if (empty(paymentInstrument.custom.braintreePaymentMethodNonce) && empty(paymentInstrument.custom.braintreePaymentMethodToken)) {
        throw new Error('paymentInstrument.custom.braintreePaymentMethodNonce or paymentInstrument.custom.braintreePaymentMethodToken are empty');
    }

    if ((customer.isAuthenticated() && braintreeApiCalls.isCustomerExist(customer) && paymentInstrument.custom.braintreePaymentMethodToken &&
        !paymentInstrument.custom.braintreeIs3dSecureRequired) || !paymentInstrument.custom.braintreePaymentMethodNonce) {
        data.paymentMethodToken = paymentInstrument.custom.braintreePaymentMethodToken;
    } else {
        data.paymentMethodNonce = paymentInstrument.custom.braintreePaymentMethodNonce;
    }

    data.orderId = order.getOrderNo();
    data.amount = BraintreeHelper.getAmount(order).getValue();
    data.currencyCode = order.getCurrencyCode();
    data.descriptor = {
        name: (!empty(prefs.BRAINTREE_PAYPAL_Descriptor_Name) ? prefs.BRAINTREE_PAYPAL_Descriptor_Name : '')
    };

    if (braintreeApiCalls.isCustomerExist(customer)) {
        data.customerId = BraintreeHelper.createCustomerId(customer);
    } else {
        data.customerId = null;
        data.customer = BraintreeHelper.createCustomerData(order);
    }

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

    data.shipping = BraintreeHelper.createAddressData(order.getDefaultShipment().getShippingAddress());

    data.customFields = BraintreeHelper.getCustomFields(order);

    if (prefs.BRAINTREE_L2_L3) {
        data.level_2_3_processing = data.shipping.level_2_3_processing = true;
        data.taxAmount = order.getTotalTax().toNumberString();
        if (order.getCustomerLocaleID().split('_')[1].toLowerCase() === data.shipping.countryCodeAlpha2.toLowerCase()) {
            data.shipping.countryCodeAlpha3 = BraintreeHelper.getISO3Country(order.getCustomerLocaleID());
        }
        data.l2_only = true;

                /** Rounding issues due to discounts, removed from scope due to bug on PayPal / BT end.
         * No ETA on bug fix and not in roadmap.
         *
       *
       * data.shippingAmount = order.getShippingTotalPrice();
       * data.discountAmount = BraintreeHelper.getOrderLevelDiscountTotal(order);
       * data.lineItems = BraintreeHelper.getLineItems(order.productLineItems);
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
        customerPaymentInstrument = customer.getProfile().getWallet().createPaymentInstrument(prefs.paypalMethodName);
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
    var PT = require('dw/order/PaymentTransaction');
    var paymentTransaction = paymentInstrumentRecord.getPaymentTransaction();
    var paymentProcessor = PaymentMgr.getPaymentMethod(prefs.paypalMethodName).getPaymentProcessor();
    var riskData = responseTransaction.riskData;
    var customer = orderRecord.getCustomer();
    var Money = require('dw/value/Money');

    Transaction.wrap(function () {
        paymentTransaction.setTransactionID(responseTransaction.id);
        paymentTransaction.setPaymentProcessor(paymentProcessor);
        paymentTransaction.setAmount(new Money(responseTransaction.amount, orderRecord.getCurrencyCode()));
        paymentInstrumentRecord.custom.braintreeFraudRiskData = riskData ? riskData.decision : null;

        orderRecord.custom.isBraintree = true;
        orderRecord.custom.braintreePaymentStatus = responseTransaction.status;
        orderRecord.custom.braintreeFraudRiskData = riskData ? riskData.decision : null;

        paymentInstrumentRecord.custom.braintreePaymentMethodNonce = null;
        paymentInstrumentRecord.custom.braintreeCustomFields = null;

        if (responseTransaction.type === 'sale' && responseTransaction.status === 'authorized') {
            paymentTransaction.setType(PT.TYPE_AUTH);
        } else if (responseTransaction.type === 'sale' && responseTransaction.status === 'settling') {
            paymentTransaction.setType(PT.TYPE_CAPTURE);
        }
        if (responseTransaction.paypal) {
            paymentInstrumentRecord.custom.braintreePaymentMethodToken = responseTransaction.paypal.token;
        }

        if (customer.isRegistered() && braintreeApiCalls.isCustomerExist(customer)) {
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

    var existCustomerPaymentInstrument = BraintreeHelper.getPaypalCustomerPaymentInstrumentByEmail(saleTransactionResponseData.transaction.paypal.payerEmail);
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
        paymentInstrument.custom.braintreeCustomFields = JSON.stringify(BraintreeHelper.getCustomFields(order));
        var paymentTransaction = paymentInstrument.getPaymentTransaction();
        var paymentProcessor = PaymentMgr.getPaymentMethod(prefs.paypalMethodName).getPaymentProcessor();
        paymentTransaction.setPaymentProcessor(paymentProcessor);
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
    var paymentTransaction = paymentInstrument.getPaymentTransaction();
    var paymentProcessor = PaymentMgr.getPaymentMethod(prefs.paypalMethodName).getPaymentProcessor();
    var customer = order.getCustomer();
    Transaction.wrap(function () {
        paymentTransaction.setPaymentProcessor(paymentProcessor);
        order.custom.isBraintree = true;
        paymentInstrument.custom.braintreeFailReason = braintreeError;

        if (customer.isRegistered() && braintreeApiCalls.isCustomerExist(customer)) {
            customer.getProfile().custom.isBraintree = true;
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
    var paypalPaymentInstrument = null;
    var customerPaymentInstrument = null;

    if (fromCart) {
        BraintreeHelper.addDefaultShipping(basket);
        customerPaymentInstrument = BraintreeHelper.getDefaultCustomerPaypalPaymentInstrument();
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
            methodName = prefs.paypalMethodName;
        } else {
            BraintreeHelper.deleteBraintreePaymentInstruments(basket);

            if (prefs.isMFRA) {
                methodName = session.forms.billing.paymentMethod.value;
            } else {
                methodName = session.forms.billing.paymentMethods.selectedPaymentMethodID.value;
                session.forms.billing.fulfilled.value = true;
            }
        }

        if (!prefs.isMFRA) {
            session.forms.billing.fulfilled.value = true;
            session.forms.billing.paymentMethods.creditCard.saveCard.value = false;
        }

        paypalPaymentInstrument = basket.createPaymentInstrument(methodName, BraintreeHelper.getAmount(basket));
    });

    var selectedPaypalAccountUuid = httpParameterMap.braintreePaypalAccountList.stringValue;
    if (selectedPaypalAccountUuid !== null && selectedPaypalAccountUuid !== 'newaccount') {
        customerPaymentInstrument = BraintreeHelper.getCustomerPaymentInstrument(selectedPaypalAccountUuid);
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
        updateShippingAddress(braintreePaypalShippingAddress, basket);
    }

    if ((isNewBilling && prefs.BRAINTREE_PAYPAL_Billing_Address_Override) || fromCart) {
        updateBillingAddress(customerPaymentInstrument, braintreePaypalBillingAddress, basket);
    }

    Transaction.wrap(function () {
        var paypalEmail = empty(httpParameterMap.braintreePaypalAccountEmail.stringValue) ? basket.getCustomerEmail() : httpParameterMap.braintreePaypalAccountEmail.stringValue;
        paypalPaymentInstrument.custom.braintreePaymentMethodToken = customerPaymentInstrument ? customerPaymentInstrument.custom.braintreePaymentMethodToken : null;
        paypalPaymentInstrument.custom.braintreePaymentMethodNonce = httpParameterMap.braintreePaypalNonce.stringValue;
        paypalPaymentInstrument.custom.braintreeFraudRiskData = httpParameterMap.braintreePaypalRiskData.stringValue;
        paypalPaymentInstrument.custom.braintreeCreditCardMakeDefault = httpParameterMap.braintreePaypalAccountMakeDefault.booleanValue;
        paypalPaymentInstrument.custom.braintreeSaveCreditCard = httpParameterMap.braintreeSavePaypalAccount.booleanValue;
        paypalPaymentInstrument.custom.braintreeCustomFields = httpParameterMap.braintreePaypalCustomFields.stringValue;
        paypalPaymentInstrument.custom.braintreePaypalEmail = paypalEmail || '';
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
            BraintreeHelper.getLogger().error(error);
            return authorizeFailedFlow(order, paymentInstrument, error.customMessage ? error.customMessage : error.message);
        }
    } else {
        Transaction.wrap(function () {
            order.removePaymentInstrument(paymentInstrument);
        });
    }
    return { authorized: true };
}

exports.updateBillingAddress = updateBillingAddress;
exports.updateShippingAddress = updateShippingAddress;
exports.intentOrderFlow = intentOrderFlow;
exports.savePaypalAccount = savePaypalAccount;
exports.saveTransactionData = saveTransactionData;
exports.authorizeFailedFlow = authorizeFailedFlow;
exports.createSaleTransactionData = createSaleTransactionData;
exports.handle = handle;
exports.authorize = authorize;
