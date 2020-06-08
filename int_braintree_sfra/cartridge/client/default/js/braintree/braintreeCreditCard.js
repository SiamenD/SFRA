/* eslint-disable block-scoped-var */
'use strict';
var braintreeUtils = require('./braintreeUtils');
var loaderInstance = require('./loaderHelper');
var creditcardHelper = require('./creditcard/creditcardHelper');

/* global braintreeUtils braintree $ */

var bu = braintreeUtils;
var er = null;
var loader;
var params;

function createHostedFields() {
    if (params.isFraudToolsEnabled) {
        loader.show();
        braintree.dataCollector.create({
            authorization: bu.clientToken,
            kount: true,
            paypal: false
        }, function (error, data) {
            loader.hide();
            if (error) {
                return;
            }
            document.querySelector('#braintreeDeviceData').value = data.deviceData;
        });
    }
    loader.show();

    braintree.hostedFields.create({
        authorization: bu.clientToken,
        styles: params.hostedFieldsStyles,
        fields: params.hostedFieldsConfig
    }, function (error, hostedFieldsInstance) {
        loader.hide();
        if (error) {
            er.show(error);
            return;
        }
        params.hostedFieldsInstance = hostedFieldsInstance;
        hostedFieldsInstance.on('validityChange', function () {
            if (params.continueButton && JSON.parse(params.continueButton.getAttribute('data-is-allow-submit-form'))) {
                params.continueButton.setAttribute('data-is-allow-submit-form', false);
            }
        });
    });
}

function isFormValid() {
    var $cardOwnerEl = document.querySelector('#braintreeCardOwner');
    if ($cardOwnerEl.value.length === 0) {
        $cardOwnerEl.parentNode.classList.add('braintree-hosted-fields-invalid');
        er.show(params.messages.validation);
        return false;
    }
    $cardOwnerEl.parentNode.classList.remove('braintree-hosted-fields-invalid');
    er.hide();

    return true;
}

function check3dSecureAndSubmit(response, startTokenizeCb) {
    if (!response.nonce || response.nonce === 'null') {
        document.querySelector('#braintreePaymentMethodNonce').value = 'null';
        startTokenizeCb({
            error: true,
            errorCode: 'nonce_is_null'
        });
        return;
    }
    if (!params.is3dSecureEnabled) {
        document.querySelector('#braintreePaymentMethodNonce').value = response.nonce;
        startTokenizeCb({
            error: false,
            errorCode: 'ok'
        });
        return;
    }

    loader.show();

    var billingData = $('#dwfrm_billing').serialize().split('&')
        .map(function (el) {
            return el.split('=');
        })
        .reduce(function (accumulator, item) {
            var elem = item[0].lastIndexOf('_');
            if (elem < 0) {
                accumulator[item[0]] = item[1];
            } else {
                elem = item[0].substring(elem + 1);
                accumulator[elem] = item[1];
            }
            return accumulator;
        }, {});

    braintree.threeDSecure.create({
        authorization: bu.clientToken,
        version: 2
    }, function (error, threeDSecure) {
        loader.hide();
        if (error) {
            er.show(error);
            startTokenizeCb({
                error: true,
                errorCode: 'bt_3dsecure_create_error',
                btError: error
            });
            return;
        }
        bu.threeDSecure = threeDSecure;
        loader.show();
        threeDSecure.verifyCard({
            amount: params.data.amount,
            nonce: response.nonce,
            bin: response.details ? response.details.bin : '',
            email: document.querySelector('#email').value,
            billingAddress: {
                givenName: billingData.firstName,
                surname: billingData.lastName,
                phoneNumber: billingData.phone,
                streetAddress: billingData.address1,
                extendedAddress: billingData.address2,
                locality: billingData.city,
                region: billingData.stateCode,
                postalCode: billingData.postalCode,
                countryCodeAlpha2: billingData.country
            },
            additionalInformation: params.data.shippingAdditionalInfo,
            onLookupComplete: function (data, next) {
                next();
            }
        }, function (err, data) {
            loader.hide();
            if (err) {
                er.show(err);
                startTokenizeCb({
                    error: true,
                    errorCode: 'bt_3dsecure_verify_error',
                    btError: err
                });
                return;
            }
            if (data.liabilityShifted || params.isSkip3dSecureLiabilityResult) {
                document.querySelector('#braintreeIs3dSecureRequired').value = 'true';
                document.querySelector('#braintreePaymentMethodNonce').value = data.nonce;
                startTokenizeCb({
                    error: false,
                    result: 'ok'
                });
                return;
            }
            er.show(params.messages.secure3DFailed);
            startTokenizeCb({
                error: true,
                result: 'secure3DFailed'
            });
            return;
        });
    });
}

function startTokenize(cb, response) {
    if (response && response.nonce) {
        check3dSecureAndSubmit(response, cb);
        return;
    }
    if (!isFormValid()) {
        cb({
            error: true,
            errorCode: 'fields_not_valid'
        });
        return;
    }
    loader.show();
    params.hostedFieldsInstance.tokenize(function (error, data) {
        loader.hide();
        if (error) {
            er.show(error);
            cb({
                error: true,
                errorCode: 'bt_tokenize_error',
                btError: error
            });
            return;
        }
        if (data.type === 'CreditCard') {
            document.querySelector('#braintreeCardType').value = creditcardHelper.convertCardTypeToDwFormat(data.details.cardType);
            document.querySelector('#braintreeCardMaskNumber').value = '************' + data.details.lastFour;
        }
        check3dSecureAndSubmit(data, cb);
    });
}

function init(initParams) {
    params = initParams;
    bu.clientToken = params.clientToken;
}

function initFields(initParams, $container) {
    params = initParams;
    params.$container = $container;

    er = bu.createErrorInstance(document.querySelector('#braintreeCreditCardErrorContainer'), creditcardHelper.creditcardErrorContainer);
    loader = loaderInstance(document.querySelector('#braintreeCreditCardLoader'));
    bu.clientToken = params.clientToken;
    $.extend(bu.messages, params.messages);

    creditcardHelper.cardOwnerEvents();

    function getHostedFieldsStyles() {
        return {
            input: {
                'font-size': '12px',
                color: '#b7802a'
            },
            ':focus': {
                color: 'blue'
            },
            '.valid': {
                color: 'green'
            },
            '.invalid': {
                color: 'red'
            }
        };
    }

    function getHostedFieldsConfig() {
        return {
            number: {
                selector: '#braintreeCardNumber'
            },
            cvv: {
                selector: '#braintreeCvv'
            },
            expirationDate: {
                selector: '#braintreeExpirationDate'
            }
        };
    }

    if (!params.hostedFieldsStyles) {
        params.hostedFieldsStyles = getHostedFieldsStyles();
    }

    params.hostedFieldsConfig = getHostedFieldsConfig();

    $.extend(params.hostedFieldsConfig, params.hostedFieldsAdvancedOptions);

    createHostedFields();
}

module.exports = {
    init,
    initFields,
    startTokenize,
    isFormValid,
    getHostedFieldInstance: function () {
        return params ? params.hostedFieldsInstance : null;
    },
    updateData: function (data) {
        params.data = data;
    }
};
