'use strict';

var page = module.superModule;
var Resource = require('dw/web/Resource');
var URLUtils = require('dw/web/URLUtils');
var Site = require('dw/system/Site');
var server = require('server');

var { getCustomerPaymentInstruments } = require('~/cartridge/scripts/braintree/helpers/customerHelper');
var {
    getAmountPaid,
    getLogger
} = require('~/cartridge/scripts/braintree/helpers/paymentHelper');

var braintreeApiCalls = require('~/cartridge/scripts/braintree/braintreeAPI/braintreeApiCalls');
var prefs = require('~/cartridge/config/braintreePreferences')();

/**
* Creates config button object for paypal
* @param {Basket} basket Basket Object
* @param {string} clientToken Braintree clientToken
* @returns {Object} button config object
*/
function createBraintreePayPalButtonConfig(basket, clientToken) {
    var amount = getAmountPaid(basket);
    var locale = empty(prefs.BRAINTREE_PAYPAL_Locale) || prefs.BRAINTREE_PAYPAL_Locale === 'ShopLocale' ? Site.getCurrent().getDefaultLocale() : prefs.BRAINTREE_PAYPAL_Locale;
    var displayName = empty(prefs.BRAINTREE_PAYPAL_Display_Name) ? '' : prefs.BRAINTREE_PAYPAL_Display_Name;
    var billingAgreementDescription = empty(prefs.BRAINTREE_PAYPAL_Billing_Agreement_Description) ? '' : prefs.BRAINTREE_PAYPAL_Billing_Agreement_Description;

    var flow = 'checkout';
    var intent = prefs.BRAINTREE_PAYPAL_Payment_Model;
    if (prefs.BRAINTREE_PAYPAL_Vault_Mode !== 'not' && customer.authenticated) {
        flow = 'vault';
    }

    if (intent === 'order') {
        flow = 'checkout';
    }

    if (intent === 'authorization') {
        intent = 'authorize';
    }

    var braintreePaypalBillingConfig = {
        clientToken: clientToken,
        paymentMethodName: prefs.paymentMethods.BRAINTREE_PAYPAL.paymentMethodId,
        isFraudToolsEnabled: prefs.BRAINTREE_PAYPAL_Fraud_Tools_Enabled,
        messages: {
            CLIENT_REQUEST_TIMEOUT: Resource.msg('braintree.error.CLIENT_REQUEST_TIMEOUT', 'locale', null),
            CLIENT_GATEWAY_NETWORK: Resource.msg('braintree.error.CLIENT_GATEWAY_NETWORK', 'locale', null),
            CLIENT_REQUEST_ERROR: Resource.msg('braintree.error.CLIENT_REQUEST_ERROR', 'locale', null),
            CLIENT_MISSING_GATEWAY_CONFIGURATION: Resource.msg('braintree.error.CLIENT_MISSING_GATEWAY_CONFIGURATION', 'locale', null),
            PAYPAL_ACCOUNT_TOKENIZATION_FAILED: Resource.msg('braintree.error.PAYPAL_ACCOUNT_TOKENIZATION_FAILED', 'locale', null),
            PAYPAL_INVALID_PAYMENT_OPTION: Resource.msg('braintree.error.PAYPAL_INVALID_PAYMENT_OPTION', 'locale', null),
            PAYPAL_FLOW_FAILED: Resource.msg('braintree.error.PAYPAL_FLOW_FAILED', 'locale', null),
            PAYPAL_BROWSER_NOT_SUPPORTED: Resource.msg('braintree.error.PAYPAL_BROWSER_NOT_SUPPORTED', 'locale', null)
        },
        options: {
            flow: flow,
            offerCredit: false,
            amount: parseFloat(amount.getValue()),
            currency: amount.getCurrencyCode(),
            locale: locale,
            enableShippingAddress: true,
            displayName: displayName,
            billingAgreementDescription: billingAgreementDescription
        },
        paypalConfig: prefs.BRAINTREE_PAYPAL_Billing_Button_Config,
        isOverrideBillingAddress: prefs.BRAINTREE_PAYPAL_Billing_Address_Override,
        getOrderInfoUrl: URLUtils.url('Braintree-GetOrderInfo').toString()
    };

    if (flow === 'checkout' || intent === 'order') {
        braintreePaypalBillingConfig.options.intent = intent;
    }

    if (prefs.BRAINTREE_PAYPAL_PayNow_Button_Enabled && prefs.BRAINTREE_PAYPAL_Payment_Model === 'sale') {
        braintreePaypalBillingConfig.options.useraction = 'commit';
    }

    var isShipped = !!basket.getProductLineItems().size();
    if (isShipped && !prefs.BRAINTREE_PAYPAL_Shipping_Address_Override) {
        braintreePaypalBillingConfig.isShippedAndAddressOverride = true;
        braintreePaypalBillingConfig.options.shippingAddressEditable = false;
    }

    return braintreePaypalBillingConfig;
}

/**
* Creates config button object for Apple Pay
* @param {Basket} basket Basket object
* @param {string} clientToken Braintree clientToken
* @returns {Object} button config object
*/
function createBraintreeApplePayButtonConfig(basket, clientToken) {
    var amount = getAmountPaid(basket);

    var applePayButtonConfig = {
        clientToken: clientToken,
        paymentMethodName: prefs.paymentMethods.BRAINTREE_APPLEPAY.paymentMethodId,
        messages: {
            CLIENT_REQUEST_TIMEOUT: Resource.msg('braintree.error.CLIENT_REQUEST_TIMEOUT', 'locale', null),
            CLIENT_GATEWAY_NETWORK: Resource.msg('braintree.error.CLIENT_GATEWAY_NETWORK', 'locale', null),
            CLIENT_REQUEST_ERROR: Resource.msg('braintree.error.CLIENT_REQUEST_ERROR', 'locale', null),
            CLIENT_MISSING_GATEWAY_CONFIGURATION: Resource.msg('braintree.error.CLIENT_MISSING_GATEWAY_CONFIGURATION', 'locale', null)
        },
        returnUrl: URLUtils.url('Braintree-AppleCheckoutFromCart', 'fromCart', 'true').toString(),
        options: {
            amount: parseFloat(amount.getValue()),
            currency: amount.getCurrencyCode(),
            displayName: prefs.BRAINTREE_APPLEPAY_Display_Name
        },
        /* customFields: {
            field_2: 'client_value'
        },*/
        getOrderInfoUrl: URLUtils.url('Braintree-GetOrderInfo').toString()
    };

    return applePayButtonConfig;
}

/**
* Creates config button object for Venmo
* @param {Basket} basket Basket object
* @param {string} clientToken Braintree clientToken
* @returns {Object} button config object
*/
function createBraintreeVenmoButtonConfig(basket, clientToken) {
    var amount = getAmountPaid(basket);

    var venmoButtonConfig = {
        clientToken: clientToken,
        paymentMethodName: prefs.paymentMethods.BRAINTREE_VENMO.paymentMethodId,
        messages: {
            CLIENT_REQUEST_TIMEOUT: Resource.msg('braintree.error.CLIENT_REQUEST_TIMEOUT', 'locale', null),
            CLIENT_GATEWAY_NETWORK: Resource.msg('braintree.error.CLIENT_GATEWAY_NETWORK', 'locale', null),
            CLIENT_REQUEST_ERROR: Resource.msg('braintree.error.CLIENT_REQUEST_ERROR', 'locale', null),
            CLIENT_MISSING_GATEWAY_CONFIGURATION: Resource.msg('braintree.error.CLIENT_MISSING_GATEWAY_CONFIGURATION', 'locale', null)
        },
        options: {
            amount: parseFloat(amount.getValue()),
            currency: amount.getCurrencyCode(),
            displayName: prefs.BRAINTREE_VENMO_Display_Name
        },
        getOrderInfoUrl: URLUtils.url('Braintree-GetOrderInfo').toString()
    };

    return venmoButtonConfig;
}

/**
* Creates config object for venmo
* @param {Array} paymentMethods Payment methods list
* @returns {Object} venmo config object
*/
function createVenmoConfig(paymentMethods) {
    var customerVenmoPaymentInstruments = getCustomerPaymentInstruments(prefs.paymentMethods.BRAINTREE_VENMO.paymentMethodId);
    var isAllowedAddAccount = prefs.BRAINTREE_VENMO_Vault_Mode !== 'not';
    var newAccountSelected = true;
    var isNeedHideContinueButton = true;
    var braintreeVenmoUserId = '';
    var braintreePaymentMethodNonce = '';
    var isNeedHideVenmoButton = false;


    if (!empty(paymentMethods) && paymentMethods[0].custom.braintreePaymentMethodNonce) {
        braintreePaymentMethodNonce = paymentMethods[0].custom.braintreePaymentMethodNonce;
        braintreeVenmoUserId = paymentMethods[0].custom.braintreeVenmoUserId;
        isNeedHideContinueButton = false;
        isNeedHideVenmoButton = true;
    } else if (customer.authenticated && !empty(customerVenmoPaymentInstruments)) {
        var iterator = customerVenmoPaymentInstruments.iterator();
        var instrument = null;

        while (iterator.hasNext()) {
            instrument = iterator.next();

            if (instrument.custom.braintreeDefaultCard) {
                isNeedHideContinueButton = false;
                newAccountSelected = false;
                break;
            }
        }
    }
    return {
        customerVenmoPaymentInstruments: customerVenmoPaymentInstruments,
        isAllowedAddAccount: isAllowedAddAccount,
        newAccountSelected: newAccountSelected,
        isNeedHideContinueButton: isNeedHideContinueButton,
        isNeedHideVenmoButton: isNeedHideVenmoButton,
        braintreePaymentMethodNonce: braintreePaymentMethodNonce,
        braintreeVenmoUserId: braintreeVenmoUserId
    };
}

/**
* Creates config object for paypal
* @param {Array} paymentMethods Payment methods list
* @returns {Object} paypal config object
*/
function createPaypalConfig(paymentMethods) {
    var customerPaypalPaymentInstruments = getCustomerPaymentInstruments(prefs.paymentMethods.BRAINTREE_PAYPAL.paymentMethodId);
    var isAllowedAddAccount = prefs.BRAINTREE_PAYPAL_Vault_Mode !== 'not';
    var newAccountSelected = true;
    var isNeedHideContinueButton = true;
    var braintreePaypalEmail = '';
    var braintreePaymentMethodNonce = '';
    if (!empty(paymentMethods) && paymentMethods[0].custom.braintreePaymentMethodNonce) {
        braintreePaymentMethodNonce = paymentMethods[0].custom.braintreePaymentMethodNonce;
        braintreePaypalEmail = paymentMethods[0].custom.braintreePaypalEmail;
        isNeedHideContinueButton = false;
    } else if (customer.authenticated && !empty(customerPaypalPaymentInstruments)) {
        var iterator = customerPaypalPaymentInstruments.iterator();
        var instrument = null;
        while (iterator.hasNext()) {
            instrument = iterator.next();
            if (instrument.custom.braintreeDefaultCard) {
                isNeedHideContinueButton = false;
                newAccountSelected = false;
                break;
            }
        }
    }
    return {
        customerPaypalPaymentInstruments: customerPaypalPaymentInstruments,
        isAllowedAddAccount: isAllowedAddAccount,
        newAccountSelected: newAccountSelected,
        isNeedHideContinueButton: isNeedHideContinueButton,
        braintreePaymentMethodNonce: braintreePaymentMethodNonce,
        braintreePaypalEmail: braintreePaypalEmail
    };
}
/**
* Creates config for credit card
* @returns {Object} credit card config object
*/
function createCreditCardConfig() {
    var CREDIT_CARD = require('dw/order/PaymentInstrument').METHOD_CREDIT_CARD;
    var customerCreditCardPaymentInstruments = getCustomerPaymentInstruments(CREDIT_CARD);
    var isAllowedAddCard = prefs.BRAINTREE_Vault_Mode !== 'not';

    var newCardSelected = '';
    if (customer.authenticated && !empty(customerCreditCardPaymentInstruments)) {
        newCardSelected = true;
        var iterator = customerCreditCardPaymentInstruments.iterator();
        var creditCardInst = null;
        while (iterator.hasNext()) {
            creditCardInst = iterator.next();
            if (creditCardInst.custom.braintreeDefaultCard) {
                newCardSelected = false;
                break;
            }
        }
    }

    return {
        customerCreditCardPaymentInstruments: customerCreditCardPaymentInstruments,
        isAllowedAddCard: isAllowedAddCard,
        newCardSelected: newCardSelected
    };
}


/**
* Creates config Brantree hosted fields
* @param {Response} res Response system object
* @param {string} clientToken Braintree clientToken
* @returns {Object} hosted fields config object
*/
function createHostedFieldsConfig(res, clientToken) {
    var isEnable3dSecure = prefs.BRAINTREE_3DSecure_Enabled;
    var billingData = res.getViewData();
    var cardForm = billingData.forms.billingForm.creditCardFields;

    var hostedFieldsStyling = null;
    var hostedFieldsAdvancedOptions = null;

    try {
        hostedFieldsStyling = JSON.parse(prefs.BRAINTREE_Hosted_Fields_Styling);
    } catch (error) {
        getLogger().error(error);
    }

    try {
        hostedFieldsAdvancedOptions = JSON.parse(prefs.BRAINTREE_Hosted_Fields_Advanced_Options);
    } catch (error) {
        getLogger().error(error);
    }

    return {
        paymentMethodName: prefs.paymentMethods.BRAINTREE_CREDIT.paymentMethodId,
        is3dSecureEnabled: isEnable3dSecure,
        isFraudToolsEnabled: prefs.BRAINTREE_Fraud_Tools_Enabled,
        isSkip3dSecureLiabilityResult: prefs.BRAINTREE_3DSecure_Skip_Client_Validation_Result,
        clientToken: clientToken,
        hostedFieldsStyles: hostedFieldsStyling,
        hostedFieldsAdvancedOptions: hostedFieldsAdvancedOptions,
        messages: {
            validation: Resource.msg('braintree.creditcard.error.validation', 'locale', null),
            secure3DFailed: Resource.msg('braintree.creditcard.error.secure3DFailed', 'locale', null),
            HOSTED_FIELDS_FIELDS_EMPTY: Resource.msg('braintree.creditcard.error.HOSTED_FIELDS_FIELDS_EMPTY', 'locale', null),
            HOSTED_FIELDS_FIELDS_INVALID: Resource.msg('braintree.creditcard.error.HOSTED_FIELDS_FIELDS_INVALID', 'locale', null),
            HOSTED_FIELDS_FAILED_TOKENIZATION: Resource.msg('braintree.creditcard.error.HOSTED_FIELDS_FAILED_TOKENIZATION', 'locale', null),
            HOSTED_FIELDS_TOKENIZATION_NETWORK_ERROR: Resource.msg('braintree.creditcard.error.HOSTED_FIELDS_TOKENIZATION_NETWORK_ERROR', 'locale', null),
            CLIENT_REQUEST_TIMEOUT: Resource.msg('braintree.error.CLIENT_REQUEST_TIMEOUT', 'locale', null),
            CLIENT_GATEWAY_NETWORK: Resource.msg('braintree.error.CLIENT_GATEWAY_NETWORK', 'locale', null),
            CLIENT_REQUEST_ERROR: Resource.msg('braintree.error.CLIENT_REQUEST_ERROR', 'locale', null),
            CLIENT_MISSING_GATEWAY_CONFIGURATION: Resource.msg('braintree.error.CLIENT_MISSING_GATEWAY_CONFIGURATION', 'locale', null)
        },
        amount: 0,
        fieldsConfig: {
            initOwnerValue: '',
            ownerHtmlName: cardForm.cardOwner.htmlName,
            typeHtmlName: cardForm.cardType.htmlName,
            numberHtmlName: cardForm.cardNumber.htmlName
        }
    };
}

server.extend(page);
server.append('Begin', function (req, res, next) {
    var BasketMgr = require('dw/order/BasketMgr');
    var basket = BasketMgr.getCurrentBasket();

    if (!basket) {
        next();
        return;
    }

    var clientToken = braintreeApiCalls.getClientToken(basket.getCurrencyCode());
    var paymentMethod;
    var payPalButtonConfig = null;
    var applePayButtonConfig = null;
    var venmoButtonConfig = null;
    var paypalConfig = {};
    var creditCardConfig = {};
    var venmoConfig = {};
    var hostedFieldsConfig = {};

    if (prefs.paymentMethods.BRAINTREE_PAYPAL.isActive) {
        payPalButtonConfig = createBraintreePayPalButtonConfig(basket, clientToken);
        paymentMethod = basket.getPaymentInstruments(prefs.paymentMethods.BRAINTREE_PAYPAL.paymentMethodId);
        paypalConfig = createPaypalConfig(paymentMethod);
    }

    if (prefs.paymentMethods.BRAINTREE_VENMO.isActive) {
        venmoButtonConfig = createBraintreeVenmoButtonConfig(basket, clientToken);
        paymentMethod = basket.getPaymentInstruments(prefs.paymentMethods.BRAINTREE_VENMO.paymentMethodId);
        venmoConfig = createVenmoConfig(paymentMethod);
    }

    if (prefs.paymentMethods.BRAINTREE_APPLEPAY.isActive) {
        applePayButtonConfig = createBraintreeApplePayButtonConfig(basket, clientToken);
    }

    if (prefs.paymentMethods.BRAINTREE_CREDIT.isActive) {
        creditCardConfig = createCreditCardConfig();
        hostedFieldsConfig = createHostedFieldsConfig(res, clientToken);
    }

    res.setViewData({
        braintree: {
            prefs: prefs,
            currency: basket.getCurrencyCode(),
            paypalConfig: paypalConfig,
            payPalButtonConfig: payPalButtonConfig,
            applePayButtonConfig: applePayButtonConfig,
            venmoButtonConfig: venmoButtonConfig,
            venmoConfig: venmoConfig,
            hostedFieldsConfig: hostedFieldsConfig,
            creditCardConfig: creditCardConfig
        }
    });

    next();
});

module.exports = server.exports();
