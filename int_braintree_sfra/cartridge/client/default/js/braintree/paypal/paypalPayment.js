'use strict';
var paypalHelper = require('./paypalHelper');
var helper = require('../helper');
var payPal = require('../braintreePaypal');

var $paypalContent = document.querySelector('.js_braintree_paypalContent');
var $paypalButton = document.querySelector('.js_braintree_paypal_billing_button');
var $braintreePaypalAccountsList = document.querySelector('#braintreePaypalAccountsList');
var $braintreePaypalBillingAddressInput = document.querySelector('input[name=braintreePaypalBillingAddress]');
var $braintreePaypalShippingAddressInput = document.querySelector('input[name=braintreePaypalShippingAddress]');
var $braintreePaypalNonceInput = document.querySelector('input[name=braintreePaypalNonce]');
var $braintreePaypalEmail = document.querySelector('#braintreePaypalEmail');
var $braintreePaypalNonce = document.querySelector('#braintreePaypalNonce');

function makePaypalPayment(continueButton) {
    var config = JSON.parse($paypalButton.getAttribute('data-braintree-config'));
    if (typeof config !== 'object' || config === null) {
        console.error($paypalButton, 'not valid data-braintree-config');
    }

    function hideShowButtons() {
        if ($braintreePaypalAccountsList.value === 'newaccount') {
            $paypalContent.setAttribute('data-paypal-is-hide-continue-button', true);
            continueButton.style.display = 'none';
            $paypalButton.style.display = '';
        } else {
            $paypalContent.setAttribute('data-paypal-is-hide-continue-button', false);
            continueButton.style.display = '';
            $paypalButton.style.display = 'none';
        }
    }

    if ($braintreePaypalAccountsList) {
        $braintreePaypalAccountsList.addEventListener('change', function () {
            hideShowButtons();
        });
    }

    paypalHelper.initAccountListAndSaveFunctionality();

    config.onTokenizePayment = function (data, resolve, reject, actions, btnInstance) {
        var params = btnInstance.params;

        if ($braintreePaypalNonceInput) {
            $braintreePaypalNonceInput.value = data.nonce;
        }
        $braintreePaypalNonce.value = data.nonce;

        if (data.details) {
            var details = data.details;
            $braintreePaypalEmail.value = data.details.email;
            document.querySelector('#braintreePaypalAccount > option').value = data.details.email;
            helper.continueButtonToggle(false);

            if (details.billingAddress && params.isOverrideBillingAddress) {
                var billingAddressData = paypalHelper.createBillingAddressData(details.billingAddress, details);
                if ($braintreePaypalBillingAddressInput) {
                    $braintreePaypalBillingAddressInput.value = billingAddressData;
                }
            }
            if (details.shippingAddress) {
                var shippingAddressData = paypalHelper.createShippingAddressData(details.shippingAddress, details);
                if ($braintreePaypalShippingAddressInput) {
                    $braintreePaypalShippingAddressInput.value = shippingAddressData;
                }
            }
            if ($braintreePaypalAccountsList && $braintreePaypalAccountsList.value === 'newaccount') {
                $paypalContent.setAttribute('data-paypal-is-hide-continue-button', true);
                continueButton.style.display = 'none';
            }
        }
        paypalHelper.showPayPalAccount(data.details.email, data.nonce);
        continueButton.click();
        resolve();
    };

    config.paypalConfig = config.paypalConfig || {};
    config.paypalConfig.validate = function (validateActions) {
        paypalHelper.formValidationConrol(validateActions, true);
    };

    var paypalIns = payPal.init(config, $paypalButton);

    var isShippedAndAddressOverride = config.isShippedAndAddressOverride;
    if (document.querySelector('.js_braintree_used_paypal_account').classList.contains('used-paypal-account')) {
        paypalHelper.showPayPalAccount(document.querySelector('#braintreePaypalEmail').value);
    }
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
                    var $paypalAddress = document.querySelector('input[name=braintreePaypalShippingAddress]');
                    if ($paypalAddress.value !== '') {
                        var newPayPalAddress = $.extend({}, JSON.parse($paypalAddress.value), data.shippingAddress);
                        $paypalAddress.value = JSON.stringify(newPayPalAddress);
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
}

module.exports = {
    makePaypalPayment
};
