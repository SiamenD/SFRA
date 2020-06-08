'use strict';
var braintreeVenmo = require('../braintreeVenmo');

function submitAddVenmoAccountForm() {
    $('.js_braintree_addVenmoAccountForm').submit(function () {
        var $form = $(this);
        var $btFormErrorContainer = document.querySelector('#braintreeFormErrorContainer');

        $form.spinner().start();
        $.ajax({
            url: $form.attr('action'),
            type: 'post',
            dataType: 'json',
            data: $form.serialize(),
            success: function (data) {
                $form.spinner().stop();
                if (!data.success) {
                    $btFormErrorContainer.textContent = data.error;
                } else {
                    location.href = data.redirectUrl;
                }
            },
            error: function (err) {
                if (err.responseJSON.redirectUrl) {
                    window.location.href = err.responseJSON.redirectUrl;
                }
                $form.spinner().stop();
            }
        });
        return false;
    });
}

function initAddVenmoAccount() {
    var $btn = document.querySelector('.js_braintree_accountVenmoButton');
    var $btFormErrorContainer = document.querySelector('#braintreeFormErrorContainer');
    var $btVenmoLoader = document.querySelector('#braintreeVenmoLoader');
    var $buttonSave = document.querySelector('button[name=save]');

    if (JSON.parse($btn.getAttribute('data-is-inited'))) {
        return;
    }
    var config = JSON.parse($btn.getAttribute('data-braintree-config'));

    if (typeof config !== 'object' || config === null) {
        console.error($btn, 'not valid data-braintree-config');
        return;
    }

    config.$loaderContainer = $btVenmoLoader;
    config.$errorContainer = $btFormErrorContainer;
    config.deviceNotSupportVenmo = function () {
        $btFormErrorContainer.textContent = config.messages.VENMO_BROWSER_NOT_SUPPORTED;
    };
    config.onTokenizePayment = function (data) {
        document.querySelector('.braintree_accountVenmoButton').setAttribute('style', 'filter: grayscale(70%)');
        $buttonSave.removeAttribute('style');
        $btn.setAttribute('style', 'pointer-events:none');

        document.querySelector('#braintreeVenmoNonce').value = data.nonce;
        $btFormErrorContainer.textContent = '';
        $btFormErrorContainer.style.display = 'none';

        document.querySelector('.venmoUsername').textContent = data.details.username;

        $buttonSave.removeAttribute('disabled');
        document.querySelector('input[type=checkbox]').removeAttribute('disabled');
        $btVenmoLoader.style.display = 'none';
    };

    braintreeVenmo.init(config, $btn);
    $buttonSave.setAttribute('style', 'filter: grayscale(70%)');
    $btn.setAttribute('isInited', true);
    submitAddVenmoAccountForm();
}

module.exports = {
    initAddVenmoAccount
};
