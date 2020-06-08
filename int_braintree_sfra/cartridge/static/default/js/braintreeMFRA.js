'use strict';

/* global braintreeUtils braintree $ */

var console = braintreeUtils.console;
/**
 * Gets required Additional shipping info for 3ds
 *
 * @param {Object} orderAddress - User's shipping address
 * @returns {Object} an object with required fields
 */

function getShippingAdditionalInfo(orderAddress) {
    return {
        workPhoneNumber: orderAddress.phone,
        shippingGivenName: orderAddress.recipientName.split(' ').slice(0, -1).join(' '),
        shippingSurname: orderAddress.recipientName.split(' ').slice(-1).join(' '),
        shippingPhone: orderAddress.phone,
        shippingAddress: {
            streetAddress: orderAddress.line1,
            extendedAddress: orderAddress.line2,
            locality: orderAddress.city,
            region: orderAddress.state,
            postalCode: orderAddress.postalCode,
            countryCodeAlpha2: orderAddress.countryCode
        }
    };
}

function initWathcherCartUpdate() {
    var $grantTotal = $('.grand-total');
    var currentGrantTotalValue = $grantTotal.text();
    $('body').on('cart:update', function () {
        var newGrantTotalValue = $grantTotal.text();
        if (newGrantTotalValue !== '' && newGrantTotalValue !== currentGrantTotalValue) {
            currentGrantTotalValue = newGrantTotalValue;
            $('body').trigger('braintree:updateCartTotals');
        }
    });
}

if ($('.cart-page').length) {
    initWathcherCartUpdate();
}
var $form = $('#dwfrm_billing'); // eslint-disable-line no-unused-vars
var $continueButton = $('button.submit-payment');
var $paymentOptionsTabs = $('.payment-options[role=tablist] a[data-toggle="tab"]');

function initCreditCardFields() {
    $('.js_braintree_creditCardFields').each(function () {
        var $container = $(this);
        if ($container.data('isInited')) {
            return;
        }
        var config = $container.data('braintreeConfig');
        if (typeof config !== 'object' || config === null) {
            console.error(this, '.js_braintree_creditCardFields has not valid data-braintree-config');
            return;
        }
        config.continueButton = $continueButton;
        braintreeUtils.creditCard.initFields(config, $container);
        $container.data('isInited', true);
    });
}

function initAccountAddCreditCard() {
    initCreditCardFields();
    $('.js_braintree_addCreditCardForm').submit(function () {
        var addCreditCardForm = $(this);
        braintreeUtils.creditCard.startTokenize(function (result) {
            if (!result.error) {
                addCreditCardForm.spinner().start();
                $.ajax({
                    url: addCreditCardForm.attr('action'),
                    type: 'post',
                    dataType: 'json',
                    data: addCreditCardForm.serialize(),
                    success: function (data) {
                        addCreditCardForm.spinner().stop();
                        if (!data.success) {
                            $('#braintreeCreditCardErrorContainer').text(data.error).show();
                        } else {
                            location.href = data.redirectUrl;
                        }
                    },
                    error: function (err) {
                        if (err.responseJSON.redirectUrl) {
                            window.location.href = err.responseJSON.redirectUrl;
                        }
                        addCreditCardForm.spinner().stop();
                    }
                });
            }
        });
        return false;
    });
}

if ($('.js_braintree_addCreditCardForm')[0]) {
    initAccountAddCreditCard();
}

function initAddPaypalAccount() {
    $('.js_braintree_accountPaypalButton').each(function () {
        $('button[name=save]').attr('style', 'filter: grayscale(70%)');
        var $btn = $(this);
        if ($btn.data('isInited')) {
            return;
        }
        var config = $btn.data('braintreeConfig');
        if (typeof config !== 'object' || config === null) {
            console.error($btn[0], 'not valid data-braintree-config');
            return;
        }
        config.$loaderContainer = $('#braintreePaypalLoader');
        config.$errorContainer = $('#braintreeFormErrorContainer');
        config.onTokenizePayment = function (data, resolve) {
            $('input[name=braintreePaypalNonce]').val(data.nonce);
            $('#braintreePaypalNonce').val(data.nonce);
            if (data.details) {
                var details = data.details;
                $('#braintreePaypalEmail').val(data.details.email);
                if (details.billingAddress) {
                    var billingAddressData = braintreeUtils.payPal.createBillingAddressData(details.billingAddress, details);
                    $('input[name=braintreePaypalBillingAddress]').val(billingAddressData);
                    $('#braintreePaypalBillingAddress').val(billingAddressData);
                }
                if (details.shippingAddress) {
                    var shippingAddressData = braintreeUtils.payPal.createShippingAddressData(details.shippingAddress, details);
                    $('input[name=braintreePaypalShippingAddress]').val(shippingAddressData);
                }
            }
            if (data.details.email) {
                $('.js_braintree_accountPaypalButton').hide();
                $('#braintreeFormErrorContainer').attr('style', 'margin: 0');
                $('.paypal-account-email').text(data.details.email).show();
                $('button[name=save]').removeAttr('disabled');
                $('button[name=save]').removeAttr('style', 'filter: grayscale(70%)');
            }
            $('#braintreeFormErrorContainer').text('').show();
            resolve();
        };
        braintreeUtils.payPal.init(config, $btn);
        $btn.data('isInited', true);
        $('.js_braintree_addPaypalAccountForm').submit(function () {
            var $addPaypalAccountForm = $(this);
            $addPaypalAccountForm.spinner().start();
            $.ajax({
                url: $addPaypalAccountForm.attr('action'),
                type: 'post',
                dataType: 'json',
                data: $addPaypalAccountForm.serialize(),
                success: function (data) {
                    $addPaypalAccountForm.spinner().stop();
                    if (!data.success) {
                        $btn.show();
                        if ($('#braintreeFormErrorContainer').is(':empty')) {
                            $('#braintreeFormErrorContainer').attr('style', 'margin: 10px 0');
                        }
                        $('#braintreeFormErrorContainer').text(data.error).show();
                    } else {
                        location.href = data.redirectUrl;
                    }
                },
                error: function (err) {
                    if (err.responseJSON.redirectUrl) {
                        window.location.href = err.responseJSON.redirectUrl;
                    }
                    $addPaypalAccountForm.spinner().stop();
                }
            });
            return false;
        });
    });
}
if ($('.js_braintree_addPaypalAccountForm')[0]) {
    initAddPaypalAccount();
}

function miniCartButton() {
    $('.js_braintree_paypal_cart_button').each(function () {
        var $btn = $(this);
        if ($btn.data('isInited')) {
            return;
        }
        // TODO fix amount
        var config = $btn.data('braintreeConfig');
        if (typeof config !== 'object' || config === null) {
            console.error(this, 'not valid data-braintree-config');
            return;
        }

        config.paypalConfig = config.paypalConfig || {};

        if (config.billingAgreementFlow) {
            var billingAgreementFlowConfig = {
                isShippingAddressExist: config.billingAgreementFlow.isShippingAddressExist,
                startBillingAgreementCheckoutUrl: config.billingAgreementFlow.startBillingAgreementCheckoutUrl
            };
            if (!config.paypalConfig.style) {
                config.paypalConfig.style = {
                    layout: 'horizontal',
                    label: 'paypal',
                    maxbuttons: 1,
                    fundingicons: false,
                    shape: 'rect',
                    size: 'responsive',
                    tagline: false
                };
            }
            config.paypalConfig.style.maxbuttons = 1;
            config.paypalConfig.payment = function () { };
            config.paypalConfig.onAuthorize = function () { };
            config.paypalConfig.validate = function (actions) {
                return actions.disable();
            };
            config.paypalConfig.onClick = function () {
                if (billingAgreementFlowConfig.isShippingAddressExist === true) {
                    window.location.href = billingAgreementFlowConfig.startBillingAgreementCheckoutUrl;
                    return;
                }
                var $paypalAddShippingAddressModal = $('#paypalAddShippingAddressModal');
                $('body').append($paypalAddShippingAddressModal);
                $paypalAddShippingAddressModal.find('#braintreeFormErrorContainer').empty();
                $('#paypalAddShippingAddressModal').modal();
            };
            delete config.billingAgreementFlow;
        }

        config.onTokenizePayment = function (payload, resolve, reject, actions, btnInstance) {
            var that = btnInstance;
            var params = btnInstance.params;
            var postData = {
                braintreePaypalNonce: payload.nonce
            };

            if (params.riskData) {
                postData.riskData = params.riskData;
            }

            if (payload.details) {
                var details = payload.details;
                if (!details.billingAddress) {
                    that.er.show('Merchant PayPal account does not support the Billing Address retrieving. Contact PayPal for details on eligibility and enabling this feature.');
                    reject();
                    return;
                }
                var billingAddressData = braintreeUtils.payPal.createBillingAddressData(details.billingAddress, details);
                postData.braintreePaypalBillingAddress = billingAddressData;
                var shippingAddressData = details.shippingAddress ? braintreeUtils.payPal.createShippingAddressData(details.shippingAddress, details) : '{}';
                postData.braintreePaypalShippingAddress = shippingAddressData;
            }

            if (params.options.flow === 'vault') {
                postData.braintreeSavePaypalAccount = 'true';
            }

            if (params.options.offerCredit) {
                postData.braintreeIsPaypalCredit = 'true';
            }

            if (params.customFields) {
                postData.braintreePaypalCustomFields = JSON.stringify(params.customFields);
            }

            braintreeUtils.postData(params.paypalHandle, postData);
        };

        var paypalIns = braintreeUtils.payPal.init(config, $btn);

        function updateCartPaypalAmount() { // eslint-disable-line require-jsdoc
            paypalIns.loader.show();
            $.ajax({
                url: config.getOrderInfoUrl,
                type: 'get',
                dataType: 'json',
                success: function (data) {
                    paypalIns.loader.hide();
                    paypalIns.updateAmount(data.amount);
                },
                error: function () {
                    window.location.reload();
                }
            });
        }
        $('body').on('braintree:updateCartTotals', updateCartPaypalAmount);
        $btn.data('isInited', true);
    });
    $('.cancel-btn').on('click', function () {
        $('#paypalAddShippingAddressModal').modal('hide');
    });
    $('form input, form select').on('invalid', function (e) {
        e.preventDefault();
        this.setCustomValidity('');
        if (!this.validity.valid) {
            var validationMessage = this.validationMessage;
            $(this).addClass('is-invalid');
            if (this.validity.patternMismatch && $(this).data('pattern-mismatch')) {
                validationMessage = $(this).data('pattern-mismatch');
            }
            if ((this.validity.rangeOverflow || this.validity.rangeUnderflow)
                && $(this).data('range-error')) {
                validationMessage = $(this).data('range-error');
            }
            if ((this.validity.tooLong || this.validity.tooShort)
                && $(this).data('range-error')) {
                validationMessage = $(this).data('range-error');
            }
            if (this.validity.valueMissing && $(this).data('missing-error')) {
                validationMessage = $(this).data('missing-error');
            }
            $(this).parents('.form-group').find('.invalid-feedback')
                .text(validationMessage);
        }
    });
    function clearForm(form) {
        $(form).find('.form-control.is-invalid').removeClass('is-invalid');
    }
    $('form button[type="submit"], form input[type="submit"]').on('click', function () {
        // clear all errors when trying to submit the form
        clearForm($(this).parents('form'));
    });

    if ($('form.address-form')[0]) {
        $('form.address-form').submit(function (e) {
            var $addressForm = $(this);
            e.preventDefault();
            e.stopImmediatePropagation();
            $addressForm.spinner().start();
            var $braintreePDPButton = $('.braintree_pdp_button');
            if ($braintreePDPButton.length && $braintreePDPButton.is(':visible')) {
                var res = braintreeUtils.pdpOnlickForAsignedPaypalPayment();
                if (res.error) {
                    braintreeUtils.createErrorInstance($addressForm.find('#braintreeFormErrorContainer')).show(res.message);
                    $addressForm.spinner().stop();
                    return true;
                }
            }
            $('form.address-form').trigger('address:submit', e);
            $.ajax({
                url: $addressForm.attr('action'),
                type: 'post',
                dataType: 'json',
                data: $addressForm.serialize(),
                success: function (data) {
                    $addressForm.spinner().stop();
                    location.href = data.redirectUrl;
                },
                error: function (err) {
                    if (err.responseJSON.redirectUrl) {
                        window.location.href = err.responseJSON.redirectUrl;
                    }
                    $addressForm.spinner().stop();
                }
            });
            return false;
        });
    }
}

$(document).ready(function () {
    miniCartButton();
    var paypalAddShippingAddressModal = $('#paypalAddShippingAddressModal');
    if (paypalAddShippingAddressModal.length > 0) {
        var oldUrl = $('.minicart').data('action-url');
        var newUrl = '?isCartPage=true';
        $('.minicart').data('action-url', (oldUrl + newUrl));
    }
});

var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
        if (mutation.addedNodes.length < 2) { return; }
        miniCartButton();
    });
});

if (document.querySelector('.minicart .popover')) {
    observer.observe(document.querySelector('.minicart .popover'), { childList: true });
}

$('.js_braintree_applepay_button').each(function () {
    var $btn = $(this);
    if ($btn.data('isInited')) {
        return;
    }

    var config = $btn.data('braintreeConfig');
    if (typeof config !== 'object' || config === null) {
        console.error(this, 'not valid data-braintree-config');
        return;
    }

    $btn.on('braintree:deviceNotSupportApplePay', function () {
        $btn.parents('.js_braintree_applepayButtonsWrap:first').hide();
    });
    $btn.on('braintree:deviceSupportApplePay', function () {
        $btn.parents('.js_braintree_applepayButtonsWrap:first').show();
    });
    $btn.on('braintree:ApplePayCanNotMakePaymentWithActiveCard', function () {
        $btn.addClass('js_braintree_applepay_button_disabled');
    });

    config.isRequiredBillingContactFields = true;
    config.isRequiredShippingContactFields = true;
    var applePayIns = braintreeUtils.applePay.init(config, $btn);

    $btn.click(function () {
        applePayIns.startPayment();
    });

    function updateCartApplepayAmount() {
        if (!applePayIns) {
            return;
        }
        applePayIns.loader.show();
        $.ajax({
            url: config.getOrderInfoUrl,
            type: 'get',
            dataType: 'json',
            success: function (data) {
                applePayIns.loader.hide();
                applePayIns.updateAmount(data.amount);
            },
            error: function () {
                window.location.reload();
            }
        });
        return;
    }
    $('body').on('braintree:updateCartTotals', updateCartApplepayAmount);

    $btn.on('braintree:ApplePayPaymentAuthorized', function (e, data) {
        var postData = {
            braintreeApplePayBillingAddress: JSON.stringify(data.billingAddress),
            braintreeApplePayShippingAddress: JSON.stringify(data.shippingAddress),
            braintreeApplePayNonce: data.nonce
        };
        if (config.customFields) {
            postData.braintreeApplePayCustomFields = JSON.stringify(config.customFields);
        }
        applePayIns.loader.show();
        braintreeUtils.postData(config.returnUrl, postData);
    });

    $btn.data('isInited', true);
});

function continueButtonToggle(flag) {
    var stage = window.location.hash.substring(1);
    if (stage !== 'placeOrder' && stage !== 'shipping' && stage !== null && stage !== '') {
        $continueButton.toggle(flag);
    }
}

if ($('.js_braintree_paypalContent')[0]) {
    (function (continueButton) {
        var $paypalContent = $('.js_braintree_paypalContent');
        var $paypalButton = $('.js_braintree_paypal_billing_button');

        var config = $paypalButton.data('braintreeConfig');
        if (typeof config !== 'object' || config === null) {
            console.error($paypalButton[0], 'not valid data-braintree-config');
        }

        $('#braintreePaypalAccountsList').change(function () {
            if ($('#braintreePaypalAccountsList').val() === 'newaccount') {
                $paypalContent.data('paypalIsHideContinueButton', true);
                continueButton.hide();
                $paypalButton.show();
            } else {
                $paypalContent.data('paypalIsHideContinueButton', false);
                continueButtonToggle(true);
                $paypalButton.hide();
            }
        });

        braintreeUtils.payPal.initAccountListAndSaveFunctionality();

        config.onTokenizePayment = function (data, resolve, reject, actions, btnInstance) {
            var params = btnInstance.params;
            $('input[name=braintreePaypalNonce]').val(data.nonce);
            $('#braintreePaypalNonce').val(data.nonce);
            if (data.details) {
                var details = data.details;
                $('#braintreePaypalEmail').val(data.details.email);
                // Show used paypal account and hide paypal button

                $('#braintreePaypalAccount > option').val(data.details.email).text(data.details.email);
                $('.js_braintree_paypalContent').data('paypalIsHideContinueButton', false);
                continueButtonToggle(true);

                if (details.billingAddress && (params.isOverrideBillingAddress || params.isAccountPage)) {
                    var billingAddressData = braintreeUtils.payPal.createBillingAddressData(details.billingAddress, details);
                    $('input[name=braintreePaypalBillingAddress]').val(billingAddressData);
                    $('#braintreePaypalBillingAddress').val(billingAddressData);
                }
                if (details.shippingAddress) {
                    var shippingAddressData = braintreeUtils.payPal.createShippingAddressData(details.shippingAddress, details);
                    $('input[name=braintreePaypalShippingAddress]').val(shippingAddressData);
                }

                if ($('#braintreePaypalAccountsList').val() === 'newaccount') {
                    $paypalContent.data('paypalIsHideContinueButton', true);
                    continueButton.hide();
                }
            }
            continueButton.click();
            resolve();
        };

        var formValidationConrol = function (validateActions) {
            var isFormValid = true;
            if (isFormValid) {
                validateActions.enable();
            } else {
                validateActions.disable();
            }
        };

        config.paypalConfig = config.paypalConfig || {};

        config.paypalConfig.validate = function (validateActions) {
            formValidationConrol(validateActions, true);
        };

        var paypalIns = braintreeUtils.payPal.init(config, $paypalButton);

        var isShippedAndAddressOverride = config.isShippedAndAddressOverride;
        function updateAmountAndShippingData() { // eslint-disable-line require-jsdoc
            paypalIns.loader.show();
            $.ajax({
                url: config.getOrderInfoUrl,
                type: 'get',
                dataType: 'json',
                success: function (data) {
                    paypalIns.loader.hide();
                    paypalIns.updateAmount(data.amount);
                    if (isShippedAndAddressOverride) {
                        paypalIns.updateShippingAddress(data.shippingAddress);
                        var $paypalAddress = $('input[name=braintreePaypalShippingAddress]');
                        if ($paypalAddress.val() !== '') {
                            var newPayPalAddress = $.extend({}, JSON.parse($paypalAddress.val()), data.shippingAddress);
                            $paypalAddress.val(JSON.stringify(newPayPalAddress));
                        }
                    }
                },
                error: function () {
                    window.location.reload();
                }
            });
        }

        $('body').on('checkout:updateCheckoutView', updateAmountAndShippingData);
        updateAmountAndShippingData();
    }($continueButton));
}

function updateData() {
    $.ajax({
        url: $('.js_braintree_getOrderInfoUrl').val(),
        type: 'get',
        dataType: 'json',
        success: function (data) {
            data.shippingAdditionalInfo = data.shippingAddress ? getShippingAdditionalInfo(data.shippingAddress) : null;
            braintreeUtils.creditCard.updateData(data);
        },
        error: function () {
            window.location.reload();
        }
    });
}

if ($('.js_braintree_creditCardContent')[0]) {
    initCreditCardFields();
    braintreeUtils.creditCard.initCardListAndSaveFunctionality();

    $('body').on('checkout:updateCheckoutView', updateData);
    updateData();

    $('#braintreeCreditCardList').change(function () {
        continueButtonToggle(true);
        $continueButton.data('isAllowSubmitForm', false);
    });
    $('body').on('braintree:3dSecure_content_shown', function () {
        continueButtonToggle(false);
    });
    $('body').on('braintree:3dSecure_content_removed', function () {
        setTimeout(function () {
            $('#braintreeCreditCardFieldsContainer').show();
            $('#braintreeSaveCardAndDefaultContainer').show();
            $('#braintree3DSecureContainer').hide();
            continueButtonToggle(true);
            $continueButton.data('isAllowSubmitForm', false);
        }, 2000);
    });

    $continueButton.click(function () {
        var $paypalNonce = $('#braintreePaypalNonce');
        // check if paypal method was used and erase paypalNonce
        if (!$('.paypal-tab').hasClass('active') && $paypalNonce.val() !== '') {
            $paypalNonce.val('');
            $('#braintreePaypalEmail').val('');
            $('.js_braintree_used_paypal_account').hide();
            $('.js_braintree_paypal_billing_button').show();
            $('.js_braintree_paypal_billing_button').parent().removeClass('used-paypal-account-hide');
            $('.js_braintree_paypalContent').data('paypalIsHideContinueButton', true);
        }

        if ($continueButton.data('isAllowSubmitForm') && braintreeUtils.creditCard.isFormValid()) {
            return true;
        }

        if (!$('.payment-options[role=tablist] a[data-toggle="tab"][href="#creditcard-content"]').hasClass('active')) {
            return true;
        }
        var $creditCardList = $('#braintreeCreditCardList');
        if ($creditCardList[0] && $creditCardList.val() !== 'newcard') {
            var selectedCard = braintreeUtils.getSelectedData($creditCardList[0]);
            $.post($creditCardList.data('getPaymentNonceUrl'), { id: selectedCard['data-id'].value }, function (responce) {
                braintreeUtils.creditCard.startTokenize(function (result) {
                    if (!result.error) {
                        $continueButton.data('isAllowSubmitForm', true);
                        $continueButton.click();
                    }
                }, responce);
            });
            return false;
        }

        braintreeUtils.creditCard.startTokenize(function (result) {
            if (!result.error) {
                $continueButton.data('isAllowSubmitForm', true);
                $continueButton.click();
            }
        });
        return false;
    });
}

if ($('.js_braintree_applepayContent')[0]) {
    (function (continueButton) {
        var $applePayButton = $('.js_braintree_applepay_button');

        var config = $applePayButton.data('braintreeConfig');
        if (typeof config !== 'object' || config === null) {
            console.error($applePayButton[0], 'not valid data-braintree-config');
        }

        $applePayButton.on('braintree:deviceNotSupportApplePay', function () {
            $applePayButton.parents('.js_braintree_applepayButtonsWrap:first').hide();
            $('.payment-options[role=tablist] .nav-item[data-method-id="ApplePay"]').hide(); // Remove the ApplePay select payment method radiobutton
        });
        $applePayButton.on('braintree:deviceSupportApplePay', function () {
            $applePayButton.parents('.js_braintree_applepayButtonsWrap:first').show();
            $('.payment-options[role=tablist] .nav-item[data-method-id="ApplePay"]').show(); // Show the ApplePay select payment method radiobutton
        });
        $applePayButton.on('braintree:ApplePayCanNotMakePaymentWithActiveCard', function () {
            $applePayButton.addClass('js_braintree_applepay_button_disabled');
        });

        var applePayIns = braintreeUtils.applePay.init(config, $applePayButton);

        if (applePayIns) {
            $applePayButton.click(function () {
                applePayIns.startPayment();
            });

            $applePayButton.on('braintree:ApplePayPaymentAuthorized', function (e, data) {
                $('#braintreeApplePayNonce').val(data.nonce);
                if (config.customFields) {
                    $('#braintreeApplePayCustomFields').val(JSON.stringify(config.customFields));
                }
                continueButton.click();
                applePayIns.loader.show();
            });

            function appleUpdateAmountData() { // eslint-disable-line no-inner-declarations
                applePayIns.loader.show();
                $.ajax({
                    url: config.getOrderInfoUrl,
                    type: 'get',
                    dataType: 'json',
                    success: function (data) {
                        applePayIns.loader.hide();
                        applePayIns.updateAmount(data.amount);
                    },
                    error: function () {
                        window.location.reload();
                    }
                });
            }

            $('body').on('checkout:updateCheckoutView', appleUpdateAmountData);
            appleUpdateAmountData();
        }
    }($continueButton));
}

function paymentMethodChangeHandle(currentTab) {
    $paymentOptionsTabs.each(function () {
        var $tabContent = $($(this).attr('href'));

        if (this === currentTab) {
            $tabContent.find('input, textarea, select').removeAttr('disabled', 'disabled');
            $tabContent.find('select.no-disable').attr('disabled', 'disabled');
            continueButtonToggle(!$tabContent.data('paypalIsHideContinueButton'));
        } else {
            $tabContent.find('input, textarea, select').attr('disabled', 'disabled');
        }
    });
}
$paymentOptionsTabs.on('shown.bs.tab', function (e) {
    paymentMethodChangeHandle(e.target);
});
paymentMethodChangeHandle($('.payment-options[role=tablist] a.active[data-toggle="tab"]')[0]);

if ($('.summary-details .payment-details')[0]) {
    $('.summary-details .payment-details').removeClass('payment-details').addClass('braintree-payment-details');
}

$('body').on('checkout:updateCheckoutView', function (e, data) {
    console.log('checkout:updateCheckoutView', data);

    var $paymentSummary = $('.summary-details .braintree-payment-details');
    var htmlToAppend = '';
    var order = data.order;

    if (order.billing.payment && order.billing.payment.selectedPaymentInstruments
        && order.billing.payment.selectedPaymentInstruments.length > 0) {
        htmlToAppend += '<div>' + order.billing.payment.selectedPaymentInstruments[0].name + '</div>';
        if (order.billing.payment.selectedPaymentInstruments[0].creditCardNumber) {
            htmlToAppend += '<div>' + order.billing.payment.selectedPaymentInstruments[0].creditCardNumber + '</div>';
        }
        if (order.billing.payment.selectedPaymentInstruments[0].type) {
            htmlToAppend += '<div>' + order.billing.payment.selectedPaymentInstruments[0].type + '</div>';
        }
        htmlToAppend += '<div>' + order.billing.payment.selectedPaymentInstruments[0].amount + '</div>';
    }

    $paymentSummary.empty().append(htmlToAppend);
});

if ($('#braintreePaypalNonce').val() !== '') {
    $('.paypal-tab').click();
}

