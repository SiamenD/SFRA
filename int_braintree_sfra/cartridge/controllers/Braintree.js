'use strict';
var server = require('server');
var URLUtils = require('dw/web/URLUtils');
var Resource = require('dw/web/Resource');
var site = require('dw/system/Site').getCurrent();

var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
var userLoggedIn = require('*/cartridge/scripts/middleware/userLoggedIn');
var consentTracking = require('*/cartridge/scripts/middleware/consentTracking');

var {
    getLogger,
    createAddressData,
    getAmountPaid
} = require('~/cartridge/scripts/braintree/helpers/paymentHelper');
var {
    saveCustomerCreditCard,
    getPaypalCustomerPaymentInstrumentByEmail,
    getCustomerPaymentInstruments
} = require('~/cartridge/scripts/braintree/helpers/customerHelper');

var braintreeApiCalls = require('~/cartridge/scripts/braintree/braintreeAPI/braintreeApiCalls');
var prefs = require('~/cartridge/config/braintreePreferences')();


/**
* Creates config for hosted fields
* @param {Object} cardForm The string to repeat.
* @returns {Object} configuration object
*/
function createHostedFieldsConfig(cardForm) {
    var isEnable3dSecure = prefs.BRAINTREE_3DSecure_Enabled;

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
        clientToken: braintreeApiCalls.getClientToken(site.getDefaultCurrency()),
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
        amount: 1,
        fieldsConfig: {
            initOwnerValue: '',
            ownerHtmlName: cardForm.cardOwner.htmlName,
            typeHtmlName: cardForm.cardType.htmlName,
            numberHtmlName: cardForm.cardNumber.htmlName
        }
    };
}

/**
* Creates config for PayPal button on Profile page
* @returns {Object} configuration object
*/
function createAccountPaypalButtonConfig() {
    var config = {
        paymentMethodName: prefs.paymentMethods.BRAINTREE_PAYPAL.paymentMethodId,
        clientToken: braintreeApiCalls.getClientToken(site.getDefaultCurrency()),
        options: {
            flow: 'vault',
            displayName: empty(prefs.BRAINTREE_PAYPAL_Display_Name) ? '' : prefs.BRAINTREE_PAYPAL_Display_Name,
            billingAgreementDescription: empty(prefs.BRAINTREE_PAYPAL_Billing_Agreement_Description) ? '' : prefs.BRAINTREE_PAYPAL_Billing_Agreement_Description
        },
        paypalConfig: {
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
        messages: {
            CLIENT_REQUEST_TIMEOUT: Resource.msg('braintree.error.CLIENT_REQUEST_TIMEOUT', 'locale', null),
            CLIENT_GATEWAY_NETWORK: Resource.msg('braintree.error.CLIENT_GATEWAY_NETWORK', 'locale', null),
            CLIENT_REQUEST_ERROR: Resource.msg('braintree.error.CLIENT_REQUEST_ERROR', 'locale', null),
            CLIENT_MISSING_GATEWAY_CONFIGURATION: Resource.msg('braintree.error.CLIENT_MISSING_GATEWAY_CONFIGURATION', 'locale', null),
            PAYPAL_ACCOUNT_TOKENIZATION_FAILED: Resource.msg('braintree.error.PAYPAL_ACCOUNT_TOKENIZATION_FAILED', 'locale', null),
            PAYPAL_INVALID_PAYMENT_OPTION: Resource.msg('braintree.error.PAYPAL_INVALID_PAYMENT_OPTION', 'locale', null),
            PAYPAL_FLOW_FAILED: Resource.msg('braintree.error.PAYPAL_FLOW_FAILED', 'locale', null),
            PAYPAL_BROWSER_NOT_SUPPORTED: Resource.msg('braintree.error.PAYPAL_BROWSER_NOT_SUPPORTED', 'locale', null)
        }
    };
    return config;
}

/**
* Saves PayPal account
* @param {boolean} createPaymentMethodResponseData payment method response data
* @returns {Object} Object with token
*/
function savePaypalAccount(createPaymentMethodResponseData) {
    try {
        var Transaction = require('dw/system/Transaction');
        Transaction.begin();

        var customerPaymentInstrument = customer.getProfile().getWallet().createPaymentInstrument(prefs.paymentMethods.BRAINTREE_PAYPAL.paymentMethodId);
        var paymentForm = server.forms.getForm('braintreepaypalaccount');

        customerPaymentInstrument.setCreditCardType('visa'); // hack for MFRA account.js line 99 (paymentInstrument.creditCardType.toLowerCase())
        customerPaymentInstrument.custom.braintreePaypalAccountEmail = createPaymentMethodResponseData.paypalAccount.email;
        customerPaymentInstrument.custom.braintreePaypalAccountAddresses = paymentForm.addresses.value;
        customerPaymentInstrument.custom.braintreePaymentMethodToken = createPaymentMethodResponseData.paypalAccount.token;

        Transaction.commit();
    } catch (error) {
        return {
            error: error.customMessage ? error.customMessage : error.message
        };
    }
    return {
        token: createPaymentMethodResponseData.paypalAccount.token
    };
}

/**
* Creates config for Venmo button on Profile page
* @returns {Object} configuration object
*/
function createAccountVenmoButtonConfig() {
    var config = {
        venmoAccountPage: true,
        paymentMethodName: prefs.paymentMethods.BRAINTREE_VENMO.paymentMethodId,
        clientToken: braintreeApiCalls.getClientToken(site.getDefaultCurrency()),
        options: {
            flow: 'vault',
            displayName: empty(prefs.BRAINTREE_VENMO_Display_Name) ? '' : prefs.BRAINTREE_VENMO_Display_Name
        },
        messages: {
            CLIENT_REQUEST_TIMEOUT: Resource.msg('braintree.error.CLIENT_REQUEST_TIMEOUT', 'locale', null),
            CLIENT_GATEWAY_NETWORK: Resource.msg('braintree.error.CLIENT_GATEWAY_NETWORK', 'locale', null),
            CLIENT_REQUEST_ERROR: Resource.msg('braintree.error.CLIENT_REQUEST_ERROR', 'locale', null),
            CLIENT_MISSING_GATEWAY_CONFIGURATION: Resource.msg('braintree.error.CLIENT_MISSING_GATEWAY_CONFIGURATION', 'locale', null),
            VENMO_ACCOUNT_TOKENIZATION_FAILED: Resource.msg('braintree.error.VENMO_ACCOUNT_TOKENIZATION_FAILED', 'locale', null),
            VENMO_BROWSER_NOT_SUPPORTED: Resource.msg('braintree.error.VENMO_BROWSER_NOT_SUPPORTED', 'locale', null)
        }
    };
    return config;
}

/**
* Saves Venmo account
* @param {boolean} createPaymentMethodResponseData payment method response data
* @returns {Object} Object with token
*/
function saveVenmoAccount(createPaymentMethodResponseData) {
    try {
        var Transaction = require('dw/system/Transaction');
        Transaction.begin();

        var customerPaymentInstrument = customer.getProfile().getWallet().createPaymentInstrument(prefs.paymentMethods.BRAINTREE_VENMO.paymentMethodId);
        customerPaymentInstrument.setCreditCardType('visa'); // hack for MFRA account.js line 99 (paymentInstrument.creditCardType.toLowerCase())
        customerPaymentInstrument.custom.braintreeVenmoUserId = createPaymentMethodResponseData.venmoAccount.venmoUserId;
        customerPaymentInstrument.custom.braintreePaymentMethodToken = createPaymentMethodResponseData.venmoAccount.token;

        Transaction.commit();
    } catch (error) {
        return {
            error: error.customMessage ? error.customMessage : error.message
        };
    }
    return {
        token: createPaymentMethodResponseData.venmoAccount.token
    };
}


server.post('GetPaymentMethodNonceByUUID', server.middleware.https, function (req, res, next) {
    var nonce = require('~/cartridge/scripts/braintree/controllerBase').getPaymentMethodNonceByUUID(request.httpParameterMap.id.stringValue);
    res.json({
        nonce: nonce
    });
    next();
});

server.use('CheckoutFromCart', server.middleware.https, function (req, res, next) {
    var BasketMgr = require('dw/order/BasketMgr');
    var basket = BasketMgr.getCurrentBasket();
    var processorHandle = null;

    try {
        processorHandle = require('~/cartridge/scripts/braintree/processors/processorPaypal').handle(basket, true);
    } catch (error) {
        getLogger().error(error);
    }

    if (processorHandle && processorHandle.success) {
        res.redirect(URLUtils.url('Checkout-Begin', 'stage', 'placeOrder'));
    } else {
        request.custom.isBraintreeCustomError = true;
        res.redirect(URLUtils.url('Cart-Show'));
    }

    next();
    return;
});

server.post('AppleCheckoutFromCart', server.middleware.https, function (req, res, next) {
    var BasketMgr = require('dw/order/BasketMgr');
    var CartModel = require('*/cartridge/models/cart');
    var basket = BasketMgr.getCurrentBasket();
    var processorHandle = null;

    try {
        processorHandle = require('~/cartridge/scripts/braintree/processors/processorApplepay').handle(basket, true);
    } catch (error) {
        getLogger().error(error);
    }

    if (processorHandle && processorHandle.success) {
        res.redirect(URLUtils.url('Checkout-Begin', 'stage', 'placeOrder'));
    } else {
        request.custom.isBraintreeCustomError = true;
        var currentBasket = BasketMgr.getCurrentBasket();
        var basketModel = new CartModel(currentBasket);
        res.render('cart/cart', basketModel);
    }

    res.json({
        error: true,
        redirectUrl: URLUtils.url('Cart-Show').toString()
    });

    next();
});

server.get(
    'AccountAddCreditCard',
    csrfProtection.generateToken,
    consentTracking.consent,
    userLoggedIn.validateLoggedIn,
    function (req, res, next) {
        if (prefs.BRAINTREE_3DSecure_Enabled) {
            res.redirect(URLUtils.url('Account-Show'));
            return next();
        }
        var paymentForm = server.forms.getForm('creditCard');
        paymentForm.clear();
        res.render('braintree/account/editAddCreditCard', {
            paymentForm: paymentForm,
            braintree: {
                prefs: prefs,
                hostedFieldsConfig: createHostedFieldsConfig(paymentForm)
            },
            breadcrumbs: [
                {
                    htmlValue: Resource.msg('global.home', 'common', null),
                    url: URLUtils.home().toString()
                },
                {
                    htmlValue: Resource.msg('page.title.myaccount', 'account', null),
                    url: URLUtils.url('Account-Show').toString()
                },
                {
                    htmlValue: Resource.msg('page.heading.payments', 'payment', null),
                    url: URLUtils.url('Braintree-PaymentInstruments').toString()
                }
            ]
        });

        return next();
    }
);

server.post('AccountAddCreditCardHandle', csrfProtection.validateAjaxRequest, function (req, res, next) {
    var httpParameterMap = request.httpParameterMap;
    if (!braintreeApiCalls.isCustomerExistInVault(customer)) {
        var createCustomerOnBraintreeSideData = braintreeApiCalls.createCustomerOnBraintreeSide();
        if (createCustomerOnBraintreeSideData.error) {
            res.json({
                success: false,
                error: createCustomerOnBraintreeSideData.error
            });
            return next();
        }
    }
    var createPaymentMethodResponseData = braintreeApiCalls.createPaymentMethodOnBraintreeSide(httpParameterMap.braintreePaymentMethodNonce.stringValue, httpParameterMap.braintreeCreditCardMakeDefault.booleanValue);
    if (createPaymentMethodResponseData.error) {
        res.json({
            success: false,
            error: createPaymentMethodResponseData.error
        });
        return next();
    }
    var paymentForm = server.forms.getForm('creditCard');
    var card = saveCustomerCreditCard(createPaymentMethodResponseData, paymentForm.cardType.value, paymentForm.cardOwner.value);
    if (card.error) {
        res.json({
            success: false,
            error: card.error
        });
        return next();
    }
    if (httpParameterMap.makeDefaultPayment && httpParameterMap.makeDefaultPayment.value === 'on') {
        var makeDefaultCreditCardData = braintreeApiCalls.makeDefaultCreditCard(card.paymentMethodToken);
        if (makeDefaultCreditCardData.error) {
            res.json({
                success: false,
                error: makeDefaultCreditCardData.error
            });
            return next();
        }
    }
    paymentForm.clear();
    res.json({
        success: true,
        redirectUrl: URLUtils.https('Braintree-PaymentInstruments').toString()
    });
    return next();
});

server.get(
    'AccountAddPaypalAccount',
    csrfProtection.generateToken,
    consentTracking.consent,
    userLoggedIn.validateLoggedIn,
    function (req, res, next) {
        var paymentForm = server.forms.getForm('braintreepaypalaccount');
        paymentForm.clear();
        res.render('braintree/account/editAddPaypalAccount', {
            paymentForm: paymentForm,
            braintree: {
                prefs: prefs,
                accountPaypalButtonConfig: createAccountPaypalButtonConfig()
            },
            breadcrumbs: [
                {
                    htmlValue: Resource.msg('global.home', 'common', null),
                    url: URLUtils.home().toString()
                },
                {
                    htmlValue: Resource.msg('page.title.myaccount', 'account', null),
                    url: URLUtils.url('Account-Show').toString()
                },
                {
                    htmlValue: Resource.msg('page.heading.payments', 'payment', null),
                    url: URLUtils.url('Braintree-PaymentInstruments').toString()
                }
            ]
        });

        next();
    }
);

server.post('AccountAddPaypalHandle', csrfProtection.validateAjaxRequest, function (req, res, next) {
    var paymentForm = server.forms.getForm('braintreepaypalaccount');
    var paypal = {
        email: paymentForm.email.value,
        nonce: paymentForm.nonce.value,
        makeDefault: paymentForm.makedefault.value
    };
    if (!braintreeApiCalls.isCustomerExistInVault(customer)) {
        var createCustomerOnBraintreeSideData = braintreeApiCalls.createCustomerOnBraintreeSide();
        if (createCustomerOnBraintreeSideData.error) {
            res.json({
                success: false,
                error: createCustomerOnBraintreeSideData.error
            });
            return next();
        }
    }
    if (getPaypalCustomerPaymentInstrumentByEmail(paypal.email)) {
        res.json({
            success: false,
            error: Resource.msgf('braintree.paypal.addaccount.error.existAccount', 'locale', null, paypal.email)
        });
        return next();
    }
    var createPaymentMethodResponseData = braintreeApiCalls.createPaymentMethodOnBraintreeSide(paypal.nonce, paypal.makeDefault);
    if (createPaymentMethodResponseData.error) {
        res.json({
            success: false,
            error: createPaymentMethodResponseData.error
        });
        return next();
    }
    var paypalAccount = savePaypalAccount(createPaymentMethodResponseData);
    if (paypalAccount.error) {
        res.json({
            success: false,
            error: paypalAccount.error
        });
        return next();
    }
    if (paypal.makeDefault) {
        var makeDefaultCreditCardData = braintreeApiCalls.makeDefaultPaypalAccount(paypalAccount.token);
        if (makeDefaultCreditCardData.error) {
            res.json({
                success: false,
                error: makeDefaultCreditCardData.error
            });
            return next();
        }
    }
    paymentForm.clear();
    res.json({
        success: true,
        redirectUrl: URLUtils.https('Braintree-PaymentInstruments').toString()
    });

    return next();
});

server.get(
    'AccountAddVenmoAccount',
    csrfProtection.generateToken,
    consentTracking.consent,
    userLoggedIn.validateLoggedIn,
    function (req, res, next) {
        var paymentForm = server.forms.getForm('braintreevenmoaccount');
        paymentForm.clear();
        res.render('braintree/account/editAddVenmoAccount', {
            paymentForm: paymentForm,
            braintree: {
                prefs: prefs,
                accountVenmoButtonConfig: createAccountVenmoButtonConfig()
            },
            breadcrumbs: [
                {
                    htmlValue: Resource.msg('global.home', 'common', null),
                    url: URLUtils.home().toString()
                },
                {
                    htmlValue: Resource.msg('page.title.myaccount', 'account', null),
                    url: URLUtils.url('Account-Show').toString()
                },
                {
                    htmlValue: Resource.msg('page.heading.payments', 'payment', null),
                    url: URLUtils.url('Braintree-PaymentInstruments').toString()
                }
            ]
        });

        next();
    }
);

server.post('AccountAddVenmoHandle', csrfProtection.validateAjaxRequest, function (req, res, next) {
    var paymentForm = server.forms.getForm('braintreevenmoaccount');
    var venmo = {
        nonce: paymentForm.nonce.value,
        makeDefault: paymentForm.makedefault.value
    };

    if (!braintreeApiCalls.isCustomerExistInVault(customer)) {
        var createCustomerOnBraintreeSideData = braintreeApiCalls.createCustomerOnBraintreeSide();
        if (createCustomerOnBraintreeSideData.error) {
            res.json({
                success: false,
                error: createCustomerOnBraintreeSideData.error
            });
            return next();
        }
    }

    var createPaymentMethodResponseData = braintreeApiCalls.createPaymentMethodOnBraintreeSide(venmo.nonce, venmo.makeDefault);
    if (createPaymentMethodResponseData.error) {
        res.json({
            success: false,
            error: createPaymentMethodResponseData.error
        });
        return next();
    }

    var venmoAccount = saveVenmoAccount(createPaymentMethodResponseData);
    if (venmoAccount.error) {
        res.json({
            success: false,
            error: venmoAccount.error
        });
        return next();
    }

    if (venmo.makeDefault) {
        var makeDefaultCreditCardData = braintreeApiCalls.makeDefaultVenmoAccount(venmoAccount.token);
        if (makeDefaultCreditCardData.error) {
            res.json({
                success: false,
                error: makeDefaultCreditCardData.error
            });
            return next();
        }
    }

    res.json({
        success: true,
        redirectUrl: URLUtils.https('Braintree-PaymentInstruments').toString()
    });

    return next();
});

server.get('PaymentInstruments', userLoggedIn.validateLoggedIn, consentTracking.consent, function (req, res, next) {
    var AccountModel = require('*/cartridge/models/account');
    var CREDIT_CARD = require('dw/order/PaymentInstrument').METHOD_CREDIT_CARD;
    res.render('braintree/account/paymentInstruments', {
        paymentCardInstruments: AccountModel.getCustomerPaymentInstruments(getCustomerPaymentInstruments(CREDIT_CARD)),
        paymentPaypalInstruments: AccountModel.getCustomerPaymentInstruments(getCustomerPaymentInstruments(prefs.paymentMethods.BRAINTREE_PAYPAL.paymentMethodId)),
        paymentVenmoInstruments: AccountModel.getCustomerPaymentInstruments(getCustomerPaymentInstruments(prefs.paymentMethods.BRAINTREE_VENMO.paymentMethodId)),
        actionUrl: URLUtils.url('PaymentInstruments-DeletePayment').toString(),
        breadcrumbs: [
            {
                htmlValue: Resource.msg('global.home', 'common', null),
                url: URLUtils.home().toString()
            },
            {
                htmlValue: Resource.msg('page.title.myaccount', 'account', null),
                url: URLUtils.url('Account-Show').toString()
            }
        ],
        braintree: {
            prefs: prefs
        }
    });
    next();
});

server.post('EditDefaultShippinAddressHandle', csrfProtection.validateAjaxRequest, function (req, res, next) {
    var Transaction = require('dw/system/Transaction');
    var formErrors = require('*/cartridge/scripts/formErrors');

    var addressForm = server.forms.getForm('address');
    var addressFormObj = addressForm.toObject();

    if (addressForm.valid) {
        res.setViewData(addressFormObj);
        this.on('route:BeforeComplete', function () { // eslint-disable-line no-shadow
            var formInfo = res.getViewData();
            Transaction.wrap(function () {
                var BasketMgr = require('dw/order/BasketMgr');
                var basket = BasketMgr.getCurrentBasket();
                var shippingAddress = basket.defaultShipment.createShippingAddress();

                shippingAddress.setFirstName(formInfo.firstName || '');
                shippingAddress.setLastName(formInfo.lastName || '');

                shippingAddress.setAddress1(formInfo.address1 || '');
                shippingAddress.setAddress2(formInfo.address2 || '');
                shippingAddress.setCity(formInfo.city || '');
                shippingAddress.setPostalCode(formInfo.postalCode || '');
                if (formInfo.states && formInfo.states.stateCode) {
                    shippingAddress.setStateCode(formInfo.states.stateCode);
                }
                if (formInfo.country) {
                    shippingAddress.setCountryCode(formInfo.country);
                }
                shippingAddress.setPhone(formInfo.phone || '');
                res.json({
                    success: true,
                    redirectUrl: URLUtils.url('Braintree-CheckoutFromCart').toString()
                });
            });
        });
    } else {
        res.json({
            success: false,
            fields: formErrors(addressForm)
        });
    }
    next();
});

server.get('GetOrderInfo', function (req, res, next) {
    var BasketMgr = require('dw/order/BasketMgr');
    var basket = BasketMgr.getCurrentBasket();
    var basketShippingAddress = basket.getDefaultShipment().getShippingAddress();

    var shippingAddress = null;
    if (!empty(basketShippingAddress)) {
        var shippingInfo = createAddressData(basketShippingAddress);
        var firstName = shippingInfo.firstName || '';
        var lastName = shippingInfo.lastName || '';
        shippingAddress = {
            recipientName: firstName + ' ' + lastName,
            line1: shippingInfo.streetAddress || '',
            line2: shippingInfo.extendedAddress || '',
            city: shippingInfo.locality || '',
            countryCode: (shippingInfo.countryCodeAlpha2).toUpperCase() || '',
            postalCode: shippingInfo.postalCode || '',
            state: shippingInfo.region || '',
            phone: shippingInfo.phoneNumber || ''
        };
    }
    res.json({
        amount: getAmountPaid(basket).getValue(),
        shippingAddress: shippingAddress
    });
    next();
});

module.exports = server.exports();
