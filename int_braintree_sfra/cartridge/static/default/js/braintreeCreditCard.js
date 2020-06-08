/* eslint-disable block-scoped-var */
'use strict';

/* global braintreeUtils braintree $ */

braintreeUtils.creditCard = (function () {
    var bu = braintreeUtils;
    var er = null;
    var loader = null;
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
                    console.log(error);
                    return;
                }
                $('#braintreeDeviceData').val(data.deviceData);
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
                if (params.continueButton.data('isAllowSubmitForm')) {
                    params.continueButton.data('isAllowSubmitForm', false);
                }
            });
        });
    }

    function check3dSecureAndSubmit(response, startTokenizeCb) {
        if (!response.nonce || response.nonce === 'null') {
            $('#braintreePaymentMethodNonce').val('null');
            startTokenizeCb({
                error: true,
                errorCode: 'nonce_is_null'
            });
            return;
        }
        if (!params.is3dSecureEnabled) {
            $('#braintreePaymentMethodNonce').val(response.nonce);
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
                email: $('#email').val(),
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
                    $('#braintreeIs3dSecureRequired').val('true');
                    $('#braintreePaymentMethodNonce').val(data.nonce);
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

    function convertCardTypeToDwFormat(braintreeType) {
        switch (braintreeType) {
            case 'American Express':
                return 'Amex';
            case 'MasterCard':
                return 'Master';
            default:
                return braintreeType;
        }
    }

    function cardOwnerUpdateClasses() {
        var $cardOwner = $('#braintreeCardOwner');
        var value = $cardOwner.val();
        if (value.length <= parseInt($cardOwner.attr('maxlength'), 10) && value.length !== 0) {
            $cardOwner.parent().addClass('braintree-hosted-fields-valid');
        } else {
            $cardOwner.parent().removeClass('braintree-hosted-fields-valid');
            $cardOwner.parent().removeClass('braintree-hosted-fields-invalid');
        }
    }

    function isFormValid() {
        var $cardOwnerEl = $('#braintreeCardOwner');
        if ($cardOwnerEl.val().length === 0) {
            $cardOwnerEl.parent().addClass('braintree-hosted-fields-invalid');
            er.show(params.messages.validation);
            return false;
        }
        $cardOwnerEl.parent().removeClass('braintree-hosted-fields-invalid');
        er.hide();

        return true;
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
                $('#braintreeCardType').val(convertCardTypeToDwFormat(data.details.cardType));
                $('#braintreeCardMaskNumber').val('************' + data.details.lastFour);
            }
            check3dSecureAndSubmit(data, cb);
        });
    }

    function initCardListAndSaveFunctionality() {
        var $creditCardList = $('#braintreeCreditCardList');
        var $cardOwnerPh = $('#braintreeCardOwnerPh');
        var $cardOwner = $('#braintreeCardOwner');
        var $cardNumbeber = $('#braintreeCardNumber');
        var $cardNumbeberPh = $('#braintreeCardNumberPh');
        var $cardCvv = $('#braintreeCvv');
        var $cardCvvPh = $('#braintreeCvvPh');
        var $cardExpiration = $('#braintreeExpirationDate');
        var $cardExpirationPh = $('#braintreeExpirationPh');
        var $braintreeSaveCardContainer = $('#braintreeSaveCardContainer');
        var $creditCardMakeDefault = $('#braintreeCreditCardMakeDefault');
        var $saveCreditCard = $('#braintreeSaveCreditCard');

        $saveCreditCard.change(function () {
            if ($saveCreditCard[0].checked) {
                $creditCardMakeDefault[0].disabled = false;
                $creditCardMakeDefault[0].checked = true;
            } else {
                $creditCardMakeDefault[0].disabled = true;
                $creditCardMakeDefault[0].checked = false;
            }
        });

        function cardListChange() {
            $('#braintreeCreditCardFieldsContainer').show();
            $('#braintree3DSecureContainer').hide();
            er.show('');
            if (!$creditCardList.length || $creditCardList.val() === 'newcard') {
                $('#braintreeSaveCardAndDefaultContainer').show();
                $cardNumbeberPh.hide();
                $cardExpirationPh.hide();
                $cardCvvPh.hide();
                $cardOwnerPh.hide();
                $cardOwner.val($cardOwner.data('newCartValue'));
                $cardOwner.trigger('change');
                $cardOwner.show();
                $cardOwner.removeClass('braintree-hosted-fields-invalid');
                $cardNumbeber.removeClass('braintree-hosted-fields-invalid');
                $cardCvv.removeClass('braintree-hosted-fields-invalid');
                $cardExpiration.removeClass('braintree-hosted-fields-invalid');
                $cardOwner[0].disabled = false;
                $cardCvv.show();
                $cardNumbeber.show();
                $cardExpiration.show();
                if ($braintreeSaveCardContainer.length) {
                    $braintreeSaveCardContainer.show();
                    $saveCreditCard[0].checked = true;
                    $saveCreditCard[0].disabled = false;
                }
                if ($creditCardMakeDefault.length) {
                    $creditCardMakeDefault[0].disabled = false;
                }
                cardOwnerUpdateClasses();
            } else {
                var selectedCard = bu.getSelectedData($creditCardList[0]);
                $cardNumbeberPh.html(selectedCard['data-number'].value);
                $cardCvvPh.html('***');
                $cardExpirationPh.html(selectedCard['data-expiration'].value);
                $cardOwnerPh.html(selectedCard['data-owner'].value);
                $cardOwner.val(selectedCard['data-owner'].value);
                $cardOwner.trigger('change');
                $('#braintreeCardType').val(selectedCard['data-type'].value);
                $('#braintreeCardMaskNumber').val(selectedCard['data-number'].value);
                $cardNumbeberPh.show();
                $cardExpirationPh.show();
                $cardCvvPh.show();
                $cardOwnerPh.show();
                $cardOwner.hide();
                if ($creditCardMakeDefault.length) {
                    if (selectedCard['data-default'].value === 'true') {
                        $creditCardMakeDefault[0].disabled = true;
                    } else {
                        $creditCardMakeDefault[0].disabled = false;
                    }
                    $creditCardMakeDefault[0].checked = true;
                }
                $cardOwner[0].disabled = true;
                $cardCvv.hide();
                $cardNumbeber.hide();
                $cardExpiration.hide();
                if ($braintreeSaveCardContainer.length) {
                    $saveCreditCard[0].checked = false;
                    $braintreeSaveCardContainer.hide();
                }
            }
        }
        $creditCardList.change(cardListChange);
        cardListChange();
    }

    function init(initParams) {
        params = initParams;
        bu.clientToken = params.clientToken;
    }

    function initFields(initParams, $container) {
        params = initParams;
        params.$container = $container;

        er = bu.createErrorInstance($('#braintreeCreditCardErrorContainer')[0], function (errorIns, errorData) {
            var error = errorData;
            if (error.details && error.details.invalidFieldKeys) {
                for (var i = 0; i < error.details.invalidFieldKeys.length; i++) {
                    var key = error.details.invalidFieldKeys[i];
                    if (key === 'number') {
                        $('#braintreeCardNumber').addClass('braintree-hosted-fields-invalid');
                    }
                    if (key === 'cvv') {
                        $('#braintreeCvv').addClass('braintree-hosted-fields-invalid');
                    }
                    if (key === 'expirationDate') {
                        $('#braintreeExpirationDate').addClass('braintree-hosted-fields-invalid');
                    }
                }
            }
            if (error.code === 'HOSTED_FIELDS_FIELDS_EMPTY') {
                $('#braintreeCardNumber, #braintreeCvv, #braintreeExpirationDate').addClass('braintree-hosted-fields-invalid');
            }
        });
        loader = bu.createLoaderInstance($('#braintreeCreditCardLoader')[0]);

        bu.clientToken = params.clientToken;
        $.extend(bu.messages, params.messages);

        var $cardOwner = $('#braintreeCardOwner');
        $cardOwner.focus(function () {
            $cardOwner.parent().addClass('braintree-hosted-fields-focused');
        });
        $cardOwner.blur(function () {
            $cardOwner.parent().removeClass('braintree-hosted-fields-focused');
        });
        $cardOwner.keyup(function () {
            $cardOwner.data('newCartValue', $cardOwner.val());
            cardOwnerUpdateClasses();
        });
        $cardOwner.change(function () {
            cardOwnerUpdateClasses();
        });

        if (!params.hostedFieldsStyles) {
            params.hostedFieldsStyles = {
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

        params.hostedFieldsConfig = {
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

        $.extend(params.hostedFieldsConfig, params.hostedFieldsAdvancedOptions);

        createHostedFields();
    }

    return {
        init: init,
        initFields: initFields,
        initCardListAndSaveFunctionality: initCardListAndSaveFunctionality,
        startTokenize: startTokenize,
        isFormValid: isFormValid,
        getHostedFieldInstance: function () {
            return params ? params.hostedFieldsInstance : null;
        },
        updateData: function (data) {
            params.data = data;
        }
    };
}());
