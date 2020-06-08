'use strict';

var page = module.superModule;
var server = require('server');

var { getCustomerPaymentInstruments } = require('~/cartridge/scripts/braintree/helpers/customerHelper');
var {
    addDefaultShipping,
    isPaypalButtonEnabled
} = require('~/cartridge/scripts/braintree/helpers/paymentHelper');

var braintreeApiCalls = require('~/cartridge/scripts/braintree/braintreeAPI/braintreeApiCalls');
var prefs = require('~/cartridge/config/braintreePreferences')();
var Resource = require('dw/web/Resource');
var URLUtils = require('dw/web/URLUtils');
var Site = require('dw/system/Site');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');

/**
* Creates config button object for paypal Billing Agreement
* @param {Basket} basket Basket object
* @param {Customer} customer Customer
* @param {string} clientToken Braintree
* @returns {Object} button config object
*/
function createBraintreePayPalBAButtonConfig(basket, customer, clientToken) {
    var buttonConfig = {
        clientToken: clientToken,
        billingAgreementFlow: {
            startBillingAgreementCheckoutUrl: URLUtils.https('Braintree-CheckoutFromCart').toString(),
            isShippingAddressExist: false,
            editShppingAddressUrl: URLUtils.https('Braintree-EditDefaultShippinAddress').toString(),
            editShppingAddressPopupTitle: Resource.msg('braintree.paypal.editdefaultshippingaddress.title', 'locale', null)
        },
        paypalConfig: prefs.BRAINTREE_PAYPAL_PDP_Button_Config
    };
    return buttonConfig;
}

/**
* Creates config button object for paypal
* @param {Basket} basket Basket Object
* @param {string} clientToken Braintree clientToken
* @returns {Object} button config object
*/
function createBraintreePayPalButtonConfig(basket, clientToken) {
    addDefaultShipping(basket);
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
            currency: basket.getCurrencyCode(),
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
        paypalConfig: prefs.BRAINTREE_PAYPAL_PDP_Button_Config,
        getOrderInfoUrl: URLUtils.url('Braintree-GetOrderInfo').toString()
        /* customFields: {
            field_2: 'client_value'
        },*/
    };

    if (flow === 'checkout' || intent === 'order') {
        paypalButtonConfig.options.intent = intent;
    }

    return paypalButtonConfig;
}

server.extend(page);
server.append('Show', csrfProtection.generateToken, function (req, res, next) {
    var isSetProductType = !empty(res.getViewData().product.individualProducts);
    if (!isPaypalButtonEnabled('pdp') || isSetProductType) {
        next();
        return;
    }
    var BasketMgr = require('dw/order/BasketMgr');
    var basket = BasketMgr.getCurrentOrNewBasket();

    var clientToken = braintreeApiCalls.getClientToken(basket.getCurrencyCode());
    var payPalButtonConfig = null;
    var payPalBAButtonConfig = null;

    if (prefs.paymentMethods.BRAINTREE_PAYPAL.isActive) {
        payPalButtonConfig = createBraintreePayPalButtonConfig(basket, clientToken);
        if (res.getViewData().product.price.sales) {
            payPalButtonConfig.options.amount = parseFloat(res.getViewData().product.price.sales.decimalPrice);
        }
        var customerPaypalInstruments = getCustomerPaymentInstruments(prefs.paymentMethods.BRAINTREE_PAYPAL.paymentMethodId);
        if (customerPaypalInstruments && customerPaypalInstruments.length > 0) {
            payPalBAButtonConfig = createBraintreePayPalBAButtonConfig(basket, req.currentCustomer, clientToken);
        }
    }
    var braintree = {
        prefs: prefs,
        payPalButtonConfig: payPalButtonConfig,
        payPalBAButtonConfig: payPalBAButtonConfig,
        cartQuantity: basket.productQuantityTotal
    };
    res.setViewData({
        braintree: braintree,
        addressForm: server.forms.getForm('address')
    });

    next();
});


module.exports = server.exports();
