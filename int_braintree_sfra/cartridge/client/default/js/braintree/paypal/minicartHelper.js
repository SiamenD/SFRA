'use strict';

var paypalHelper = require('./paypalHelper');
var payPal = require('../braintreePaypal');
var braintreeUtils = require('../braintreeUtils');

function miniCartButton() {
    document.querySelectorAll('.js_braintree_paypal_cart_button').forEach(function (el) {
        var $btn = el;
        if (JSON.parse($btn.getAttribute('data-is-inited'))) {
            return;
        }
        var config = JSON.parse($btn.getAttribute('data-braintree-config'));
        if (typeof config !== 'object' || config === null) {
            console.error(el, 'not valid data-braintree-config');
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
                if (billingAgreementFlowConfig.isShippingAddressExist) {
                    window.location.href = billingAgreementFlowConfig.startBillingAgreementCheckoutUrl;
                    return;
                }
                if (document.querySelector('.popover.popover-bottom.show')) {
                    document.querySelector('.popover.popover-bottom.show').classList.remove('show');
                }
                paypalHelper.appendShippingAddressModal();
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
                var billingAddressData = paypalHelper.createBillingAddressData(details.billingAddress, details);
                postData.braintreePaypalBillingAddress = billingAddressData;
                var shippingAddressData = details.shippingAddress ? paypalHelper.createShippingAddressData(details.shippingAddress, details) : '{}';
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

        var paypalIns = payPal.init(config, $btn);

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
        $btn.setAttribute('data-is-inited', true);
    });

    var $hideModalBtn = document.querySelector('.cancel-btn');
    var $saveAddressBtn = document.querySelector('.saveAddressBtn');
    var $addressForm = document.querySelector('form.address-form');
    function hideModal() {
        $('#paypalAddShippingAddressModal').modal('hide');
    }

    $('form input, form select').on('invalid', paypalHelper.showFormErrorMsg);

    if ($hideModalBtn) {
        $hideModalBtn.addEventListener('click', hideModal);
    }
    if ($saveAddressBtn) {
        $saveAddressBtn.addEventListener('click', paypalHelper.clearFormErrors);
    }
    if ($addressForm) {
        $('form.address-form').submit(paypalHelper.submitAddressFrom);
    }
}

var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
        if (mutation.addedNodes.length < 2) {
            return;
        }
        miniCartButton();
    });
});

function changeUrlForMiniCartBtn() {
    if (document.querySelector('#paypalAddShippingAddressModal')) {
        var $minicart = document.querySelector('.minicart');
        var oldUrl = $minicart.getAttribute('data-action-url');
        var newUrl = '?isCartPage=true';
        $minicart.setAttribute('data-action-url', (oldUrl + newUrl));
    }
}

module.exports = {
    miniCartButton,
    observer,
    changeUrlForMiniCartBtn
};
