'use strict';

module.exports = function () {
    /* global braintreeUtils braintree $ */
    var helper = require('./helper');
    var applepayHelper = require('./applepay/applepayHelper');
    var creditcardHelper = require('./creditcard/creditcardHelper');
    var creditcardPayment = require('./creditcard/creditcardPayment');
    var creditCardFields = require('./creditcard/creditcardFields');
    var creditCardAccount = require('./creditcard/creditcardAccount');
    var minicartHelper = require('./paypal/minicartHelper');
    var paypalAccount = require('./paypal/paypalAccount');
    var paypalPayment = require('./paypal/paypalPayment');

    var $form = document.querySelector('#dwfrm_billing'); // eslint-disable-line no-unused-vars
    var $cartPage = document.querySelectorAll('.cart-page');
    var $continueButton = document.querySelector('button.submit-payment');
    var $summaryDetails = document.querySelector('.summary-details .payment-details');
    var $addCreditCardForm = document.querySelector('.js_braintree_addCreditCardForm');
    var $addPaypalAccountForm = document.querySelector('.js_braintree_addPaypalAccountForm');
    var $paypalContent = document.querySelector('.js_braintree_paypalContent');
    var $creditCardContent = document.querySelector('.js_braintree_creditCardContent');
    var $applepayContent = document.querySelector('.js_braintree_applepayContent');
    var $braintreePaypalNonce = document.querySelector('#braintreePaypalNonce');
    var $minicartPopover = document.querySelector('.minicart .popover');
    var $creditCardList = document.querySelector('#braintreeCreditCardList');

    var venmoAccount = require('./venmo/venmoAccount');
    var venmoPayment = require('./venmo/venmoPayment');
    var $addVenmoAccountForm = document.querySelector('.js_braintree_addVenmoAccountForm');
    var $venmoContent = document.querySelector('.js_braintree_venmoContent');

    if (window.NodeList && !NodeList.prototype.forEach) {
        NodeList.prototype.forEach = Array.prototype.forEach;
    }

    (function () {
        if (typeof window.CustomEvent === 'function') return false; // If not IE

        function CustomEvent(event, params) {
            // eslint-disable-next-line no-param-reassign
            params = params || { bubbles: false, cancelable: false, detail: undefined };
            var evt = document.createEvent('CustomEvent');
            evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
            return evt;
        }

        CustomEvent.prototype = window.Event.prototype;

        window.CustomEvent = CustomEvent;
    }());

    if ($cartPage) {
        helper.initWathcherCartUpdate();
    }

    if ($addCreditCardForm) {
        creditCardAccount.initAccountAddCreditCard();
    }

    if ($addPaypalAccountForm) {
        paypalAccount.initAddPaypalAccount();
    }

    if ($addVenmoAccountForm) {
        venmoAccount.initAddVenmoAccount();
    }

    document.addEventListener('DOMContentLoaded', function () {
        minicartHelper.miniCartButton();
        minicartHelper.changeUrlForMiniCartBtn();
    });

    if ($minicartPopover) {
        minicartHelper.observer.observe($minicartPopover, { childList: true });
    }

    helper.paymentMethodChangeHandle(document.querySelector('.payment-options[role=tablist] a.active[data-toggle="tab"]'));

    applepayHelper.initApplepayButton();

    if ($paypalContent) {
        paypalPayment.makePaypalPayment($continueButton);
    }

    if ($creditCardContent) {
        creditCardFields.initCreditCardFields();
        creditcardHelper.initCardListAndSaveFunctionality();

        $('body').on('checkout:updateCheckoutView', creditCardFields.updateData);

        creditCardFields.updateData();

        if ($creditCardList) {
            $creditCardList.addEventListener('change', function () {
                creditcardPayment.doNotAllowSubmitForm();
            });
        }
        $('body').on('braintree:3dSecure_content_shown', function () {
            helper.continueButtonToggle(false);
        });

        $('body').on('braintree:3dSecure_content_removed', function () {
            setTimeout(function () {
                creditcardPayment.hide3DSecureContainer();
            }, 2000);
        });

        $continueButton.addEventListener('click', function (event) {
            if (!event.isTrusted) {
                return;
            }
            creditcardPayment.makeCreditCardPayment(event);
        });
    }

    if ($applepayContent) {
        applepayHelper.applepayPayment($continueButton);
    }

    if ($venmoContent) {
        venmoPayment.makeVenmoPayment($continueButton);
    }

    $('.payment-options[role=tablist] a[data-toggle="tab"]').on('shown.bs.tab', function (e) {
        helper.paymentMethodChangeHandle(e.target);
        const cardList = document.getElementById('braintreeCreditCardList');
        const paypalList = document.getElementById('braintreePaypalAccountsList');
        var changeEvent;

        if (e.target.hash === '#creditcard-content' && cardList) {
            if (typeof (Event) === 'function') {
                changeEvent = new Event('changeEvent');
                cardList.addEventListener('changeEvent', function () {
                    'change';
                }, false);
            } else {
                changeEvent = document.createEvent('Event');
                changeEvent.initEvent('changeEvent', true, true);
            }
            cardList.dispatchEvent(changeEvent);
        } else if (e.target.hash === '#paypal-content' && paypalList) {
            if (typeof (Event) === 'function') {
                changeEvent = new Event('changeEvent');
                paypalList.addEventListener('changeEvent', function () {
                    'change';
                }, false);
            } else {
                changeEvent = document.createEvent('Event');
                changeEvent.initEvent('changeEvent', true, true);
            }
            paypalList.dispatchEvent(changeEvent);
        }
    });

    if ($summaryDetails) {
        $summaryDetails.classList.add('braintree-payment-details');
        $summaryDetails.classList.remove('payment-details');
    }

    $('body').on('checkout:updateCheckoutView', helper.updateCheckoutView);

    if ($braintreePaypalNonce && $braintreePaypalNonce.value !== '') {
        document.querySelector('.paypal-tab').click();
    }
};
