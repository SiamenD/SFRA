'use strict';
var braintreeUtils = require('../braintreeUtils');
var applePay = require('../braintreeApplepay');

var $applePayButton = document.querySelector('.js_braintree_applepay_button');
var $applepayButtonsWrap = document.querySelector('.js_braintree_applepayButtonsWrap');
var $applepayDataMethod = document.querySelector('.payment-options[role=tablist] .nav-item[data-method-id="ApplePay"]');

function makeApplePayButtonDisabled() {
    $applePayButton.classList.add('js_braintree_applepay_button_disabled');
}

function hideApplePayButton() {
    $applepayButtonsWrap.style.display = 'none'; // Remove the ApplePay select payment method radiobutton
    if ($applepayDataMethod) {
        $applepayDataMethod.style.display = 'none';
    }
}

function showApplePayButton() {
    $applepayButtonsWrap.style.display = 'block'; // Show the ApplePay select payment method radiobutton
    if ($applepayDataMethod) {
        $applepayDataMethod.style.display = 'block';
    }
}

function initApplepayButton() {
    document.querySelectorAll('.js_braintree_applepay_button').forEach(function (el) {
        var $btn = el;
        if (JSON.parse($btn.getAttribute('data-is-inited'))) {
            return;
        }
        var config = JSON.parse($btn.getAttribute('data-braintree-config'));
        if (typeof config !== 'object' || config === null) {
            console.error(el, 'not valid data-braintree-config');
            return;
        }

        $btn.addEventListener('braintree:deviceNotSupportApplePay', function () {
            hideApplePayButton();
        }, false);
        $btn.addEventListener('braintree:deviceSupportApplePay', function () {
            showApplePayButton();
        }, false);
        $btn.addEventListener('braintree:ApplePayCanNotMakePaymentWithActiveCard', function () {
            makeApplePayButtonDisabled();
        }, false);

        config.isRequiredBillingContactFields = true;
        config.isRequiredShippingContactFields = true;
        var applePayIns = applePay.init(config, $btn);

        $btn.addEventListener('click', function () {
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

        $btn.addEventListener('braintree:ApplePayPaymentAuthorized', function (e) {
            var postData = {
                braintreeApplePayBillingAddress: JSON.stringify(e.detail.data.billingAddress),
                braintreeApplePayShippingAddress: JSON.stringify(e.detail.data.shippingAddress),
                braintreeApplePayNonce: e.detail.data.nonce
            };
            if (config.customFields) {
                postData.braintreeApplePayCustomFields = JSON.stringify(config.customFields);
            }
            applePayIns.loader.show();
            braintreeUtils.postData(config.returnUrl, postData);
        }, false);

        $btn.setAttribute('data-is-inited', true);
    });
}

function applepayPayment(continueButton) {
    var config = JSON.parse($applePayButton.getAttribute('data-braintree-config'));
    if (typeof config !== 'object' || config === null) {
        console.error($applePayButton, 'not valid data-braintree-config');
    }
    var applepayButton = $('.js_braintree_applepay_button');
    applepayButton.on('braintree:deviceNotSupportApplePay', function () {
        hideApplePayButton();
    });
    applepayButton.on('braintree:deviceSupportApplePay', function () {
        showApplePayButton();
    });
    applepayButton.on('braintree:ApplePayCanNotMakePaymentWithActiveCard', function () {
        makeApplePayButtonDisabled();
    });

    var applePayIns = applePay.init(config, $applePayButton);

    function authorizedApplePayPayment(e, data) {
        document.querySelector(('#braintreeApplePayNonce')).value = data.nonce;
        if (config.customFields) {
            document.querySelector('#braintreeApplePayCustomFields').value = JSON.stringify(config.customFields);
        }
        continueButton.click();
        applePayIns.loader.show();
    }

    if (!applePayIns) return;
    $applePayButton.addEventListener('click', function () {
        applePayIns.startPayment();
    });

    applepayButton.on('braintree:ApplePayPaymentAuthorized', authorizedApplePayPayment);

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

module.exports = {
    initApplepayButton,
    applepayPayment
};
