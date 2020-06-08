'use strict';

var page = module.superModule;
var Resource = require('dw/web/Resource');
var URLUtils = require('dw/web/URLUtils');
var Site = require('dw/system/Site');
var server = require('server');

var { getCustomerPaymentInstruments } = require('~/cartridge/scripts/braintree/helpers/customerHelper');
var {
    addDefaultShipping,
    getAmountPaid,
    isPaypalButtonEnabled
 } = require('~/cartridge/scripts/braintree/helpers/paymentHelper');

var braintreeApiCalls = require('~/cartridge/scripts/braintree/braintreeAPI/braintreeApiCalls');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
var prefs = require('~/cartridge/config/braintreePreferences')();

/**
* Creates config button object for paypal
* @param {Basket} basket Basket object
* @param {string} clientToken Braintree clientToken
* @param {Object} paypalConfig paypal configuration object
* @returns {Object} button config object
*/
function createBraintreePayPalButtonConfig(basket, clientToken, paypalConfig) {
    addDefaultShipping(basket);
    var amount = getAmountPaid(basket);
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

    var locale = empty(prefs.BRAINTREE_PAYPAL_Locale) || prefs.BRAINTREE_PAYPAL_Locale === 'ShopLocale' ? Site.getCurrent().getDefaultLocale() : prefs.BRAINTREE_PAYPAL_Locale;
    var displayName = empty(prefs.BRAINTREE_PAYPAL_Display_Name) ? '' : prefs.BRAINTREE_PAYPAL_Display_Name;
    var billingAgreementDescription = empty(prefs.BRAINTREE_PAYPAL_Billing_Agreement_Description) ? '' : prefs.BRAINTREE_PAYPAL_Billing_Agreement_Description;

    var paypalButtonConfig = {
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
        paypalHandle: URLUtils.url('Braintree-CheckoutFromCart', 'fromCart', 'true').toString(),
        options: {
            flow: flow,
            amount: parseFloat(amount.getValue()),
            currency: amount.getCurrencyCode(),
            locale: locale,
            enableShippingAddress: true,
            displayName: displayName,
            billingAgreementDescription: billingAgreementDescription,
            offerCredit: false,
            style: {
                layout: 'horizontal',
                label: 'paypal',
                maxbuttons: 1,
                fundingicons: false,
                shape: 'rect',
                size: 'medium',
                tagline: false
            }
        },
        paypalConfig: paypalConfig,
        getOrderInfoUrl: URLUtils.url('Braintree-GetOrderInfo').toString()
    };

    if (flow === 'checkout' || intent === 'order') {
        paypalButtonConfig.options.intent = intent;
    }

    if (prefs.BRAINTREE_PAYPAL_PayNow_Button_Enabled && prefs.BRAINTREE_PAYPAL_Payment_Model === 'sale') {
        paypalButtonConfig.options.useraction = 'commit';
    }

    return paypalButtonConfig;
}

/**
* Creates config button object for paypal Billing Agreement
* @param {Basket} basket Basket object
* @param {string} clientToken Braintree
* @param {Object} paypalConfig paypal configuration object
* @returns {Object} button config object
*/
function createBraintreePayPalBAButtonConfig(basket, clientToken, paypalConfig) {
    var buttonConfig = {
        clientToken: clientToken,
        billingAgreementFlow: {
            startBillingAgreementCheckoutUrl: URLUtils.https('Braintree-CheckoutFromCart').toString(),
            isShippingAddressExist: basket.getDefaultShipment().productLineItems.length <= 0,
            editShppingAddressUrl: URLUtils.https('Braintree-EditDefaultShippinAddress').toString(),
            editShppingAddressPopupTitle: Resource.msg('braintree.paypal.editdefaultshippingaddress.title', 'locale', null)
        },
        paypalConfig: paypalConfig
    };
    return buttonConfig;
}

/**
* Creates config button object for Apple Pay
* @param {Basket} basket Basket object
* @param {string} clientToken Braintree clientToken
* @returns {Object} button config object
*/
function createBraintreeApplePayButtonConfig(basket, clientToken) {
    addDefaultShipping(basket);
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
        getOrderInfoUrl: URLUtils.url('Braintree-GetOrderInfo').toString(),
        options: {
            amount: parseFloat(amount.getValue()),
            currency: amount.getCurrencyCode(),
            displayName: prefs.BRAINTREE_APPLEPAY_Display_Name
        }
        /* customFields: {
            field_2: 'client_value'
        },*/
    };

    return applePayButtonConfig;
}

server.extend(page);
server.append('Show', function (req, res, next) {
    if (!isPaypalButtonEnabled('cart')) {
        next();
        return;
    }
    var BasketMgr = require('dw/order/BasketMgr');
    var basket = BasketMgr.getCurrentBasket();

    if (!basket) {
        next();
        return;
    }
    var clientToken = braintreeApiCalls.getClientToken(basket.getCurrencyCode());
    var payPalButtonConfig = null;
    var payPalBAButtonConfig = null;
    var applePayButtonConfig = null;

    if (prefs.paymentMethods.BRAINTREE_PAYPAL.isActive) {
        var paypalConfig = prefs.BRAINTREE_PAYPAL_Cart_Button_Config;
        payPalButtonConfig = createBraintreePayPalButtonConfig(basket, clientToken, paypalConfig);
        var customerPaypalInstruments = getCustomerPaymentInstruments(prefs.paymentMethods.BRAINTREE_PAYPAL.paymentMethodId);
        if (customerPaypalInstruments && customerPaypalInstruments.length > 0) {
            payPalBAButtonConfig = createBraintreePayPalBAButtonConfig(basket, clientToken, paypalConfig);
        }
    }

    if (prefs.paymentMethods.BRAINTREE_APPLEPAY.isActive) {
        applePayButtonConfig = createBraintreeApplePayButtonConfig(basket, clientToken);
    }

    res.setViewData({
        braintree: {
            prefs: prefs,
            payPalButtonConfig: payPalButtonConfig,
            payPalBAButtonConfig: payPalBAButtonConfig,
            applePayButtonConfig: applePayButtonConfig
        },
        addressForm: server.forms.getForm('address'),
        paypalCalculatedCost: basket.totalGrossPrice
    });

    next();
});
server.extend(page);
server.append('MiniCartShow', csrfProtection.generateToken, function (req, res, next) {
    if (!isPaypalButtonEnabled('minicart')) {
        next();
        return;
    }

    var BasketMgr = require('dw/order/BasketMgr');
    var basket = BasketMgr.getCurrentBasket();

    if (!basket) {
        next();
        return;
    }

    var clientToken = braintreeApiCalls.getClientToken(basket.getCurrencyCode());
    var payPalButtonConfig = null;
    var payPalBAButtonConfig = null;

    if (prefs.paymentMethods.BRAINTREE_PAYPAL.isActive) {
        var paypalConfig = prefs.BRAINTREE_PAYPAL_MiniCart_Button_Config;
        payPalButtonConfig = createBraintreePayPalButtonConfig(basket, clientToken, paypalConfig);
        var customerPaypalInstruments = getCustomerPaymentInstruments(prefs.paymentMethods.BRAINTREE_PAYPAL.paymentMethodId);
        if (customerPaypalInstruments && customerPaypalInstruments.length > 0) {
            payPalBAButtonConfig = createBraintreePayPalBAButtonConfig(basket, clientToken, paypalConfig);
        }
    } else {
        next();
        return;
    }

    res.setViewData({
        braintree: {
            payPalButtonConfig: payPalButtonConfig,
            payPalBAButtonConfig: payPalBAButtonConfig
        },
        addressForm: server.forms.getForm('address')
    });

    next();
});

module.exports = server.exports();

