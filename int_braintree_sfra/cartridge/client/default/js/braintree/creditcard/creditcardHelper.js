'use strict';
var braintreeUtils = require('../braintreeUtils');
var bu = braintreeUtils;

var $creditCardList = document.querySelector('#braintreeCreditCardList');
var $creditCardMakeDefault = document.querySelector('#braintreeCreditCardMakeDefault');
var $saveCreditCard = document.querySelector('#braintreeSaveCreditCard');
var $cardOwner = document.querySelector('#braintreeCardOwner');

function creditcardErrorContainer(errorIns, errorData) {
    var error = errorData;
    if (error.details && error.details.invalidFieldKeys) {
        for (var i = 0; i < error.details.invalidFieldKeys.length; i++) {
            var key = error.details.invalidFieldKeys[i];
            if (key === 'number') {
                document.querySelector('#braintreeCardNumber').classList.add('braintree-hosted-fields-invalid');
            }
            if (key === 'cvv') {
                document.querySelector('#braintreeCvv').classList.add('braintree-hosted-fields-invalid');
            }
            if (key === 'expirationDate') {
                document.querySelector('#braintreeExpirationDate').classList.add('braintree-hosted-fields-invalid');
            }
        }
    }
    if (error.code === 'HOSTED_FIELDS_FIELDS_EMPTY') {
        document.querySelector('#braintreeCardNumber, #braintreeCvv, #braintreeExpirationDate').classList.add('braintree-hosted-fields-invalid');
    }
}

function convertCardTypeToDwFormat(braintreeType) {
    switch (braintreeType) {
        case 'American Express':
            return 'Amex';
        case 'MasterCard':
            return 'Master';
        default:
            return braintreeType;
    }
}

function cardOwnerUpdateClasses() {
    var value = $cardOwner.value;
    if (value.length <= parseInt($cardOwner.getAttribute('maxlength'), 10) && value.length !== 0) {
        $cardOwner.parentNode.classList.add('braintree-hosted-fields-valid');
    } else {
        $cardOwner.parentNode.classList.remove('braintree-hosted-fields-valid');
        $cardOwner.parentNode.classList.remove('braintree-hosted-fields-invalid');
    }
}

function cardListChange() {
    var $cardOwnerPh = document.querySelector('#braintreeCardOwnerPh');
    var $cardNumbeber = document.querySelector('#braintreeCardNumber');
    var $cardNumbeberPh = document.querySelector('#braintreeCardNumberPh');
    var $cardCvv = document.querySelector('#braintreeCvv');
    var $cardCvvPh = document.querySelector('#braintreeCvvPh');
    var $cardExpiration = document.querySelector('#braintreeExpirationDate');
    var $cardExpirationPh = document.querySelector('#braintreeExpirationPh');
    var $braintreeSaveCardContainer = document.querySelector('#braintreeSaveCardContainer');
    var $creditCardFieldsContainer = document.querySelector('#braintreeCreditCardFieldsContainer');
    var $braintree3DSecureContainer = document.querySelector('#braintree3DSecureContainer');
    var $saveCardAndDefaultContainer = document.querySelector('#braintreeSaveCardAndDefaultContainer');
    var changeCardOwnerInput;
    if ($cardOwner) {
        if (typeof (Event) === 'function') {
            changeCardOwnerInput = new Event('changeCardOwnerInput');
            $cardOwner.addEventListener('changeCardOwnerInput', function () {
                'change';
            }, false);
        } else {
            changeCardOwnerInput = document.createEvent('Event');
            changeCardOwnerInput.initEvent('changeCardOwnerInput', true, true);
        }
    }

    if ($creditCardFieldsContainer) {
        $creditCardFieldsContainer.style.display = '';
    }
    if ($braintree3DSecureContainer) {
        $braintree3DSecureContainer.style.display = 'none';
    }

    document.querySelector('#braintreeCreditCardErrorContainer').textContent = '';

    if (!$creditCardList || $creditCardList.value === 'newcard') {
        if ($saveCardAndDefaultContainer) {
            $saveCardAndDefaultContainer.style.display = '';
        }
        $cardNumbeberPh.style.display = 'none';
        $cardExpirationPh.style.display = 'none';
        $cardCvvPh.style.display = 'none';
        $cardOwnerPh.style.display = 'none';
        $cardOwner.value = $cardOwner.getAttribute('data-new-cart-value');
        $cardOwner.dispatchEvent(changeCardOwnerInput);
        $cardOwner.style.display = '';
        $cardOwner.parentNode.classList.remove('braintree-hosted-fields-invalid');
        $cardNumbeber.parentNode.classList.remove('braintree-hosted-fields-invalid');
        $cardCvv.parentNode.classList.remove('braintree-hosted-fields-invalid');
        $cardExpiration.parentNode.classList.remove('braintree-hosted-fields-invalid');
        $cardOwner.disabled = false;
        $cardCvv.style.display = '';
        $cardNumbeber.style.display = '';
        $cardExpiration.style.display = '';
        if ($braintreeSaveCardContainer) {
            $braintreeSaveCardContainer.style.display = '';
            $saveCreditCard.checked = true;
            $saveCreditCard.disabled = false;
        }
        if ($creditCardMakeDefault) {
            $creditCardMakeDefault.disabled = false;
        }
        cardOwnerUpdateClasses();
    } else {
        var selectedCard = bu.getSelectedData($creditCardList);
        $cardNumbeberPh.innerHTML = selectedCard['data-number'].value;
        $cardCvvPh.innerHTML = '***';
        $cardExpirationPh.innerHTML = selectedCard['data-expiration'].value;
        $cardOwnerPh.innerHTML = selectedCard['data-owner'].value;
        $cardOwner.value = selectedCard['data-owner'].value;
        $cardOwner.dispatchEvent(changeCardOwnerInput);
        document.querySelector('#braintreeCardType').value = selectedCard['data-type'].value;
        document.querySelector('#braintreeCardMaskNumber').value = selectedCard['data-number'].value;
        $cardNumbeberPh.style.display = '';
        $cardExpirationPh.style.display = '';
        $cardCvvPh.style.display = '';
        $cardOwnerPh.style.display = '';
        $cardOwner.style.display = 'none';
        if ($creditCardMakeDefault) {
            if (selectedCard['data-default'].value === 'true') {
                $creditCardMakeDefault.disabled = true;
            } else {
                $creditCardMakeDefault.disabled = false;
            }
            $creditCardMakeDefault.checked = true;
        }
        $cardOwner.disabled = true;
        $cardCvv.style.display = 'none';
        $cardNumbeber.style.display = 'none';
        $cardExpiration.style.display = 'none';
        if ($braintreeSaveCardContainer) {
            $saveCreditCard.checked = false;
            $braintreeSaveCardContainer.style.display = 'none';
        }
    }
}

function makeCardDefault() {
    if ($saveCreditCard.checked) {
        $creditCardMakeDefault.disabled = false;
        $creditCardMakeDefault.checked = true;
    } else {
        $creditCardMakeDefault.disabled = true;
        $creditCardMakeDefault.checked = false;
    }
}

function initCardListAndSaveFunctionality() {
    if ($saveCreditCard) {
        $saveCreditCard.addEventListener('change', function () {
            makeCardDefault();
        });
    }

    if ($creditCardList) {
        $creditCardList.addEventListener('change', function () {
            cardListChange();
        });
    }
    cardListChange();
}

function cardOwnerEvents() {
    $cardOwner.addEventListener('focus', function () {
        $cardOwner.parentNode.classList.add('braintree-hosted-fields-focused');
    });
    $cardOwner.addEventListener('blur', function () {
        $cardOwner.parentNode.classList.remove('braintree-hosted-fields-focused');
    });
    $cardOwner.addEventListener('keyup', function () {
        document.querySelector('#braintreeCardOwner').setAttribute('data-new-cart-value', $cardOwner.value);
        cardOwnerUpdateClasses();
    });
    $cardOwner.addEventListener('change', function () {
        cardOwnerUpdateClasses();
    });
}

module.exports = {
    creditcardErrorContainer,
    convertCardTypeToDwFormat,
    cardOwnerEvents,
    initCardListAndSaveFunctionality
};
