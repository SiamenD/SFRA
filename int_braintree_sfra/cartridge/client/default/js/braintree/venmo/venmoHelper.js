'use strict';
var braintreeUtils = require('../braintreeUtils');
var helper = require('../helper');

var $accountsList = document.querySelector('#braintreeVenmoAccountsList');
var $saveVenmoAccountCountainerEl = document.querySelector('#braintreeSaveVenmoAccountContainer');
var $saveVenmoAccountEl = document.querySelector('#braintreeSaveVenmoAccount');
var $venmoAccounMakeDefaultEl = document.querySelector('#braintreeVenmoAccountMakeDefault');

var $venmoButton = document.querySelector('.js_braintree_venmo_button');
var $braintreeVenmoAccount = document.getElementById('braintreeVenmoAccount');
var $venmoAccount = document.querySelector('.js_braintree_used_venmo_account');
var $braintreeVenmoUserId = document.querySelector('#braintreeVenmoUserId');

var $venmoContent = document.querySelector('.js_braintree_venmoContent');


function initAccountListAndSaveFunctionality() {
    function accountsListChange() { // eslint-disable-line require-jsdoc
        if ($accountsList.value === 'newaccount') {
            if ($saveVenmoAccountCountainerEl) {
                $saveVenmoAccountCountainerEl.style.display = '';
                $saveVenmoAccountEl.checked = true;
                $saveVenmoAccountEl.disabled = false;
            }
            if ($venmoAccounMakeDefaultEl) {
                $venmoAccounMakeDefaultEl.disabled = false;
            }
        } else {
            var selectedAccount = braintreeUtils.getSelectedData($accountsList);
            if (selectedAccount && $venmoAccounMakeDefaultEl) {
                if (selectedAccount['data-default'].value === 'true') {
                    $venmoAccounMakeDefaultEl.disabled = true;
                } else {
                    $venmoAccounMakeDefaultEl.disabled = false;
                }
                $venmoAccounMakeDefaultEl.checked = true;
            }
            if ($saveVenmoAccountCountainerEl) {
                $saveVenmoAccountEl.checked = false;
                $saveVenmoAccountCountainerEl.style.display = 'none';
            }
        }
    }

    if ($saveVenmoAccountEl) {
        $saveVenmoAccountEl.addEventListener('change', function () {
            if ($saveVenmoAccountEl.checked) {
                $venmoAccounMakeDefaultEl.disabled = false;
                $venmoAccounMakeDefaultEl.checked = true;
            } else {
                $venmoAccounMakeDefaultEl.disabled = true;
                $venmoAccounMakeDefaultEl.checked = false;
            }
        });
    }

    if ($accountsList) {
        $accountsList.addEventListener('change', accountsListChange);
        accountsListChange();
    }
}

function showVenmoAccount() {
    if (!$accountsList) {
        $venmoAccount.classList.remove('used-venmo-account-hide');
        $braintreeVenmoAccount.options[0].text = $braintreeVenmoUserId.value;
    }

    $venmoButton.style.display = 'none';
    helper.continueButtonToggle(false);
}

function hideShowButtons() {
    if ($accountsList.value === 'newaccount') {
        $venmoButton.style.display = '';
        helper.continueButtonToggle(true);
        $venmoContent.setAttribute('data-paypal-is-hide-continue-button', true);
    } else {
        $venmoButton.style.display = 'none';
        helper.continueButtonToggle(false);
        $venmoContent.setAttribute('data-paypal-is-hide-continue-button', false);
    }
}

function createLoaderContainter($target) {
    var $loaderContainter = document.createElement('div');
    $loaderContainter.className = 'venmo-braintree-loader';
    helper.continueButtonToggle(true);

    return $target.parentNode.insertBefore($loaderContainter, $target);
}

module.exports = {
    showVenmoAccount,
    initAccountListAndSaveFunctionality,
    hideShowButtons,
    createLoaderContainter
};
