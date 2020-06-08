'use strict';
var braintreeUtils = require('../braintreeUtils');

function clearFormErrors() {
    document.querySelector('.address-form').querySelectorAll('.form-control.is-invalid').forEach(function (el) {
        el.classList.remove('is-invalid');
    });
}

function showFormErrorMsg(e) {
    if (document.querySelector('.address-form')) {
        document.querySelector('.address-form').querySelectorAll('.form-control').forEach(function (el) {
            e.preventDefault();
            el.setCustomValidity('');
            if (!el.validity.valid) {
                var validationMessage = el.validationMessage;
                el.classList.add('is-invalid');
                if (el.classList.contains('is-invalid')) {
                    document.querySelectorAll('.invalid-feedback').forEach(function (input) {
                        input.textContent = validationMessage;
                    });
                }
            }
        });
    }
}

function submitAddressFrom(e) {
    var $addressForm = $('form.address-form');
    e.preventDefault();
    e.stopImmediatePropagation();
    $addressForm.spinner().start();
    var $braintreePDPButton = document.querySelector('.braintree_pdp_button');
    if ($braintreePDPButton && $braintreePDPButton.style.display === '') {
        var res = braintreeUtils.pdpOnlickForAsignedPaypalPayment();
        if (res.error) {
            braintreeUtils.createErrorInstance($addressForm.find('#braintreeFormErrorContainer')).show(res.message);
            $addressForm.spinner().stop();
            return true;
        }
    }
    // 19.2.1 unnecessary code ?
    // $('form.address-form').trigger('address:submit', e);
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
}

var formValidationConrol = function (validateActions) {
    var isFormValid = true;
    if (isFormValid) {
        validateActions.enable();
    } else {
        validateActions.disable();
    }
};

function appendShippingAddressModal() {
    document.querySelector('body').appendChild(document.querySelector('#paypalAddShippingAddressModal'));
    document.querySelector('#paypalAddShippingAddressModal').querySelectorAll('#braintreeFormErrorContainer').innerHTML = null;
    $('#paypalAddShippingAddressModal').modal();
}

function initAccountListAndSaveFunctionality() {
    var $accountsList = document.querySelector('#braintreePaypalAccountsList');
    var $savePaypalAccountCountainerEl = document.querySelector('#braintreeSavePaypalAccountContainer');
    var $savePaypalAccountEl = document.querySelector('#braintreeSavePaypalAccount');
    var $paypalAccounMakeDefaultEl = document.querySelector('#braintreePaypalAccountMakeDefault');

    function accountsListChange() { // eslint-disable-line require-jsdoc
        if ($accountsList.value === 'newaccount') {
            if ($savePaypalAccountCountainerEl) {
                $savePaypalAccountCountainerEl.style.display = '';
                $savePaypalAccountEl.checked = true;
                $savePaypalAccountEl.disabled = false;
            }
            if ($paypalAccounMakeDefaultEl) {
                $paypalAccounMakeDefaultEl.disabled = false;
            }
        } else {
            var selectedAccount = braintreeUtils.getSelectedData($accountsList);
            if (selectedAccount && $paypalAccounMakeDefaultEl) {
                if (selectedAccount['data-default'].value === 'true') {
                    $paypalAccounMakeDefaultEl.disabled = true;
                } else {
                    $paypalAccounMakeDefaultEl.disabled = false;
                }
                $paypalAccounMakeDefaultEl.checked = true;
            }
            if ($savePaypalAccountCountainerEl) {
                $savePaypalAccountEl.checked = false;
                $savePaypalAccountCountainerEl.style.display = 'none';
            }
        }
    }

    if ($savePaypalAccountEl) {
        $savePaypalAccountEl.addEventListener('change', function () {
            if ($savePaypalAccountEl.checked) {
                $paypalAccounMakeDefaultEl.disabled = false;
                $paypalAccounMakeDefaultEl.checked = true;
            } else {
                $paypalAccounMakeDefaultEl.disabled = true;
                $paypalAccounMakeDefaultEl.checked = false;
            }
        });
    }
    if ($accountsList) {
        $accountsList.addEventListener('change', accountsListChange);
        accountsListChange();
    }
}

function createShippingAddressData(inpShippingAddress, details) {
    var shippingAddress = inpShippingAddress;
    if (!shippingAddress.recipientName) {
        shippingAddress.firstName = details.firstName;
        shippingAddress.lastName = details.lastName;
        shippingAddress.recipientName = details.firstName + ' ' + details.lastName;
    }
    shippingAddress.email = details.email;
    shippingAddress.phone = details.phone;
    shippingAddress.countryCodeAlpha2 = shippingAddress.countryCode;
    shippingAddress.streetAddress = shippingAddress.line1;
    shippingAddress.extendedAddress = shippingAddress.line2;
    shippingAddress.locality = shippingAddress.city;
    shippingAddress.region = shippingAddress.state;
    shippingAddress.postalCode = shippingAddress.postalCode;
    return JSON.stringify(shippingAddress);
}

function createBillingAddressData(inpBillingAddress, details) {
    var billingAddress = inpBillingAddress;
    billingAddress.firstName = details.firstName;
    billingAddress.lastName = details.lastName;
    billingAddress.email = details.email;
    billingAddress.phone = details.phone;
    billingAddress.countryCodeAlpha2 = billingAddress.countryCode;
    billingAddress.streetAddress = billingAddress.line1;
    billingAddress.extendedAddress = billingAddress.line2;
    billingAddress.locality = billingAddress.city;
    billingAddress.region = billingAddress.state;
    return JSON.stringify(billingAddress);
}

function appendToUrl(url, param) {
    var newUrl = url;
    newUrl += (newUrl.indexOf('?') !== -1 ? '&' : '?') + Object.keys(param).map(function (key) {
        return key + '=' + encodeURIComponent(param[key]);
    }).join('&');

    return newUrl;
}

function showPayPalAccount(braintreePaypalEmail, braintreePaypalNonce) {
    var braintreePaypalAccount = document.getElementById('braintreePaypalAccount');
    var paypalAccount = document.querySelector('.form-group.js_braintree_used_paypal_account');
    var $paypalContent = document.querySelector('.js_braintree_paypalContent');

    var customerAuthenticated = JSON.parse(braintreePaypalAccount.dataset.customerAuthenticated);

    if (customerAuthenticated || (braintreePaypalEmail && braintreePaypalAccount.options[0].text !== 'PayPal')) {
        if (braintreePaypalNonce && document.getElementById('braintreePaypalAccountsList')) {
            return true;
        }

        document.querySelectorAll('.js_braintree_paypalContent .custom-checkbox').forEach((el) => { el.style.display = 'none'; });
    }

    braintreePaypalAccount.options[0].text = braintreePaypalEmail;
    // eslint-disable-next-line no-unused-expressions, no-mixed-operators
    paypalAccount.classList.contains('used-paypal-account') || paypalAccount.classList.remove('used-paypal-account-hide') && paypalAccount.classList.add('used-paypal-account');
    document.querySelector('.js_braintree_paypal_billing_button').style.display = 'none';
    $paypalContent.setAttribute('data-paypal-is-hide-continue-button', false);
}

module.exports = {
    showFormErrorMsg,
    clearFormErrors,
    submitAddressFrom,
    formValidationConrol,
    appendShippingAddressModal,
    initAccountListAndSaveFunctionality,
    createShippingAddressData,
    createBillingAddressData,
    appendToUrl,
    showPayPalAccount
};
