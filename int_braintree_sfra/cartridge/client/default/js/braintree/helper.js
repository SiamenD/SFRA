'use strict';
var $continueButton = document.querySelector('button.submit-payment');

function initWathcherCartUpdate() {
    var $grantTotal = document.querySelector('.grand-total');
    if ($grantTotal) {
        var currentGrantTotalValue = $grantTotal.textContent;
        $('body').on('cart:update', function () {
            var newGrantTotalValue = $grantTotal.textContent;
            if (newGrantTotalValue !== '' && newGrantTotalValue !== currentGrantTotalValue) {
                currentGrantTotalValue = newGrantTotalValue;
                var updateCartTotals = document.createEvent('Event');
                updateCartTotals.initEvent('updateCartTotals', true, true);
                document.querySelector('body').addEventListener('updateCartTotals', function () {
                    'braintree:updateCartTotals';
                }, false);
                document.querySelector('body').dispatchEvent(updateCartTotals);
            }
        });
    }
}

function continueButtonToggle(flag) {
    var stage = window.location.hash.substring(1);
    if (stage !== 'placeOrder' && stage !== 'shipping' && stage !== null && stage !== '') {
        if (flag) {
            $continueButton.style.display = 'none';
        } else {
            $continueButton.style.display = '';
        }
    }
}


function paymentMethodChangeHandle(currentTab) {
    document.querySelectorAll('.payment-options[role=tablist] a[data-toggle="tab"]').forEach(function (el) {
        var $tabContent = document.querySelector(el.getAttribute('href'));

        if (el === currentTab) {
            $tabContent.querySelectorAll('input, textarea, select').forEach(function (tab) {
                tab.removeAttribute('disabled', 'disabled');
            });
            $tabContent.querySelectorAll('select.no-disable').forEach(function (tab) {
                tab.setAttribute('disabled', 'disabled');
            });
            continueButtonToggle(JSON.parse($tabContent.getAttribute('data-paypal-is-hide-continue-button')));
        } else {
            $tabContent.querySelectorAll('input, textarea, select').forEach(function (tab) {
                tab.setAttribute('disabled', 'disabled');
            });
        }
    });
}

function updateCheckoutView(e, data) {
    console.log('checkout:updateCheckoutView', data);

    var $paymentSummary = document.querySelector('.summary-details .braintree-payment-details');
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

    if ($paymentSummary) {
        $paymentSummary.innerHTML = htmlToAppend;
    }
}

module.exports = {
    initWathcherCartUpdate,
    paymentMethodChangeHandle,
    continueButtonToggle,
    updateCheckoutView
};
