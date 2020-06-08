'use strict';

var braintreeUtils = require('../braintreeUtils');
var creditCard = require('../braintreeCreditCard');
var helper = require('../helper');

var $continueButton = document.querySelector('button.submit-payment');
var $creditCardList = document.querySelector('#braintreeCreditCardList');

function doNotAllowSubmitForm() {
    helper.continueButtonToggle(false);
    $continueButton.setAttribute('data-is-allow-submit-form', false);
}

function hide3DSecureContainer() {
    document.querySelector('#braintreeCreditCardFieldsContainer').style.display = '';
    document.querySelector('#braintreeSaveCardAndDefaultContainer').style.display = '';
    document.querySelector('#braintree3DSecureContainer').style.display = 'none';
    doNotAllowSubmitForm();
}

function allowSubmitForm(event) {
    $continueButton.setAttribute('data-is-allow-submit-form', true);
    event.target.click();
}

function isActiveCreditCardTab() {
    return document
        .querySelector('.payment-options[role=tablist] a[data-toggle="tab"][href="#creditcard-content"]')
        .classList
        .contains('active');
}

function isPaypalNonceExist() {
    var hasPaypalNonce = document.querySelector('#braintreePaypalNonce');
    var isActivePaypalTab = document.querySelector('.paypal-tab').classList.contains('active');
    return !isActivePaypalTab && hasPaypalNonce;
}

function makeCreditCardPayment(event) {
    var braintreePaypalAccount = document.getElementById('braintreePaypalAccount');
    var customerAuthenticated = JSON.parse(braintreePaypalAccount.dataset.customerAuthenticated);
    var $braintreePaypalAccountsList = document.querySelector('#braintreePaypalAccountsList');

    // check if paypal method was used and change appearance of paypal tab
    if (isPaypalNonceExist()) {
        var paypalAccount = document.querySelector('.form-group.js_braintree_used_paypal_account');
        var $paypalContent = document.querySelector('.js_braintree_paypalContent');
        var $paypalButton = document.querySelector('.js_braintree_paypal_billing_button');
        var $formIndent = document.querySelector('.form-indent');

        paypalAccount.classList.remove('used-paypal-account');
        paypalAccount.classList.add('used-paypal-account-hide');
        $formIndent.classList.remove('used-paypal-account-hide');
        $formIndent.classList.add('used-paypal-account');
        $paypalButton.style.display = 'block';
        $paypalContent.setAttribute('data-paypal-is-hide-continue-button', true);
        if (customerAuthenticated) {
            document.querySelectorAll('.js_braintree_paypalContent .custom-checkbox').forEach((el) => { el.style.display = ''; });
            if ($braintreePaypalAccountsList && $braintreePaypalAccountsList.value !== 'newaccount') {
                $paypalButton.style.display = 'none';
                $paypalContent.setAttribute('data-paypal-is-hide-continue-button', false);
                document.querySelector('#braintreeSavePaypalAccountContainer').style.display = 'none';
            }
        }
    }
    if (JSON.parse($continueButton.getAttribute('data-is-allow-submit-form')) && creditCard.isFormValid()) {
        return;
    }
    if (!isActiveCreditCardTab()) {
        var paypalAccountList = document.querySelector('#braintreePaypalAccountsList');
        if (paypalAccountList && paypalAccountList.value !== 'newaccount') helper.continueButtonToggle(false);
        return;
    }

    if ($creditCardList) {
        var is3dSecureEnabled = JSON.parse(document.querySelector('.js_braintree_creditCardFields').getAttribute('data-braintree-config')).is3dSecureEnabled;
        if ($creditCardList && $creditCardList.value !== 'newcard') {
            if (!is3dSecureEnabled) {
                allowSubmitForm(event);
                return;
            }

            var selectedCard = braintreeUtils.getSelectedData($creditCardList);
            $.post($creditCardList.getAttribute('data-get-payment-nonce-url'), { id: selectedCard['data-id'].value }, function (responce) {
                creditCard.startTokenize(function (result) {
                    if (!result.error) {
                        allowSubmitForm(event);
                    }
                }, responce);
            });
            event.preventDefault();
            event.stopPropagation();
            return;
        }
    }
    creditCard.startTokenize(function (result) {
        if (!result.error) allowSubmitForm(event);
    });
    event.preventDefault();
    event.stopPropagation();
}

module.exports = {
    doNotAllowSubmitForm,
    hide3DSecureContainer,
    makeCreditCardPayment
};
