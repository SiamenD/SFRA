var Transaction = require('dw/system/Transaction');
var HookMgr = require('dw/system/HookMgr');
var prefs = require('~/cartridge/config/braintreePreferences')();

/**
 * Parse customer name from single string
 * @param {string} name name string
 * @return {Object} name object
 */
function createFullName(name) {
    var nameNoLongSpaces = name.trim().replace(/\s+/g, ' ').split(' ');
    if (nameNoLongSpaces.length === 1) {
        return {
            firstName: name,
            secondName: null,
            lastName: null
        };
    }
    var firstName = nameNoLongSpaces.shift();
    var lastName = nameNoLongSpaces.pop();
    var secondName = nameNoLongSpaces.join(' ');
    return {
        firstName: firstName,
        secondName: secondName.length ? secondName : null,
        lastName: lastName
    };
}

/**
 * Returns a prepared custom fields string
 * @param {dw.order.Order} order Order
 * @param {dw.order.OrderPaymentInstrument} paymentInstrument Order payment instrument
 * @return {string} custom fields string
 */
function getCustomFields(order, paymentInstrument) {
    var paymentProcessorId = paymentInstrument.getPaymentTransaction().getPaymentProcessor().ID;
    var prefsCustomFields = [];
    var hookMethodName = 'credit';

    switch (paymentProcessorId) {
        case 'BRAINTREE_PAYPAL':
            prefsCustomFields = prefs.BRAINTREE_PAYPAL_Custom_Fields;
            hookMethodName = 'paypal';
            break;
        case 'BRAINTREE_APPLEPAY':
            prefsCustomFields = prefs.BRAINTREE_APPLEPAY_Custom_Fields;
            hookMethodName = 'applepay';
            break;
        case 'BRAINTREE_VENMO':
            prefsCustomFields = prefs.BRAINTREE_VENMO_Custom_Fields;
            hookMethodName = 'venmo';
            break;
        default: // as 'BRAINTREE_CREDIT'
            prefsCustomFields = prefs.BRAINTREE_CREDIT_Custom_Fields;
            hookMethodName = 'credit';
            break;
    }

    var cfObject = {};
    var piCfs = null;
    for (var fName in prefsCustomFields) {
        var f = prefsCustomFields[fName];
        var fArr = f.split(':');
        cfObject[fArr[0]] = fArr[1];
    }
    if (HookMgr.hasHook('braintree.customFields')) {
        var cfs = HookMgr.callHook('braintree.customFields', hookMethodName, { order: order, paymentInstrument: paymentInstrument });
        for (var field in cfs) {
            cfObject[field] = cfs[field];
        }
    }
    try {
        piCfs = JSON.parse(paymentInstrument.custom.braintreeCustomFields);
    } catch (error) {
        piCfs = {};
    }
    for (var field1 in piCfs) {
        if (cfObject[field1] === undefined) {
            cfObject[field1] = piCfs[field1];
        }
    }
    var resultStr = '';
    for (var field2 in cfObject) {
        resultStr += '<' + field2 + '>' + cfObject[field2] + '</' + field2 + '>';
    }
    return resultStr;
}

/**
 * Return boolean Token Exists value
 * @param  {boolean} isCustomerExistInVault customer vault
 * @param {dw.order.OrderPaymentInstrument} paymentInstrument current payment instrument
 * @returns {boolean} Token Exist
 */
function isTokenExists(isCustomerExistInVault, paymentInstrument) {
    var isTokenAllowed = isCustomerExistInVault &&
        paymentInstrument.custom.braintreePaymentMethodToken &&
        !paymentInstrument.custom.braintreeIs3dSecureRequired;
    return isTokenAllowed || !paymentInstrument.custom.braintreePaymentMethodNonce;
}

/** Returns a three-letter abbreviation for this Locale's country, or an empty string if no country has been specified for the Locale
 *
 * @param {string} localeId locale id
 * @return {string} a three-letter abbreviation for this lLocale's country, or an empty string
 */
function getISO3Country(localeId) {
    return require('dw/util/Locale').getLocale(localeId).getISO3Country();
}

/**
 * Create customer data for API call
 * @param {dw.order.Order} order Order object
 * @return {Object} Customer data for request
 */
function createGuestCustomerData(order) {
    var billingAddress = order.getBillingAddress();
    var shippingAddress = order.getDefaultShipment().getShippingAddress();
    return {
        id: null,
        firstName: billingAddress.getFirstName(),
        lastName: billingAddress.getLastName(),
        email: order.getCustomerEmail(),
        phone: billingAddress.getPhone() || shippingAddress.getPhone(),
        company: '',
        fax: ''
    };
}

/**
 * isCountryCodesUpperCase()
 * true - if SiteGenesis uses uppercase for country code values
 * false - if SiteGenesis uses lowercase for country code values
 *
 * @returns {boolean} is country upper case
 */
function isCountryCodesUpperCase() {
    var countryOptions = null;
    var billingForm = session.forms.billing;
    var isCountryUpperCase = true;
    if (billingForm && billingForm.billingAddress && billingForm.billingAddress.addressFields && billingForm.billingAddress.addressFields.country) {
        countryOptions = billingForm.billingAddress.addressFields.country.getOptions();
        for (var optionName in countryOptions) {
            var option = countryOptions[optionName];
            if (option.value && option.value.trim() !== '' && option.value === option.value.toLowerCase()) {
                isCountryUpperCase = false;
                break;
            }
        }
    }
    return isCountryUpperCase;
}

/**
 * Update Billing Address
 * @param  {Object} newBillingAddress new billing address
 * @param  {dw.order.Basket} basket - Current users's basket
 */
function updateBillingAddress(newBillingAddress, basket) {
    var countryCode = isCountryCodesUpperCase() ?
        newBillingAddress.countryCodeAlpha2.toUpperCase() :
        newBillingAddress.countryCodeAlpha2.toLowerCase();
    Transaction.wrap(function () {
        var billing = basket.getBillingAddress() || basket.createBillingAddress();
        billing.setFirstName(newBillingAddress.firstName || '');
        billing.setLastName(newBillingAddress.lastName || '');
        billing.setCountryCode(countryCode);
        billing.setCity(newBillingAddress.locality || '');
        billing.setAddress1(newBillingAddress.streetAddress || '');
        billing.setAddress2(newBillingAddress.extendedAddress || '');
        billing.setPostalCode(newBillingAddress.postalCode || '');
        billing.setStateCode(newBillingAddress.region || '');
        billing.setPhone(newBillingAddress.phone || '');
        basket.setCustomerEmail(newBillingAddress.email);
    });
}

/**
 * Update Shipping Address
 * @param  {Object} braintreeShippingAddress - shipping address
 * @param  {dw.order.Basket} orderShippingAddress basket - Current users's basket Default Shipment
 */
function updateShippingAddress(braintreeShippingAddress, orderShippingAddress) {
    var fullName = {};
    var shipping;
    var newShipping = JSON.parse(braintreeShippingAddress);
    var countryCode = isCountryCodesUpperCase() ?
        newShipping.countryCodeAlpha2.toUpperCase() :
        newShipping.countryCodeAlpha2.toLowerCase();
    if (newShipping.recipientName) {
        fullName = createFullName(newShipping.recipientName);
    }
    Transaction.wrap(function () {
        shipping = orderShippingAddress.getShippingAddress() || orderShippingAddress.createShippingAddress();
        shipping.setCountryCode(countryCode);
        shipping.setCity(newShipping.locality || '');
        shipping.setAddress1(newShipping.streetAddress || '');
        shipping.setAddress2(newShipping.extendedAddress || '');
        shipping.setPostalCode(newShipping.postalCode || '');
        shipping.setStateCode(newShipping.region || '');
        shipping.setPhone(newShipping.phone || '');

        if (!empty(fullName.firstName)) {
            shipping.setFirstName(fullName.firstName || '');
        }
        if (!empty(fullName.secondName)) {
            shipping.setSecondName(fullName.secondName || '');
        }
        if (!empty(fullName.lastName)) {
            shipping.setLastName(fullName.lastName || '');
        }
    });
}

/**
 * Save General Transaction Data
 * @param  {dw.order.Order} order Order
 * @param {dw.order.OrderPaymentInstrument} paymentInstrument Order payment instrument
 * @param  {Object} responseTransaction - response transaction
 */
function saveGeneralTransactionData(order, paymentInstrument, responseTransaction) {
    var Money = require('dw/value/Money');
    var PT = require('dw/order/PaymentTransaction');
    var paymentTransaction = paymentInstrument.getPaymentTransaction();
    paymentTransaction.setTransactionID(responseTransaction.id);
    paymentTransaction.setAmount(new Money(responseTransaction.amount, order.getCurrencyCode()));

    order.custom.isBraintree = true;
    order.custom.braintreePaymentStatus = responseTransaction.status;

    paymentInstrument.custom.braintreePaymentMethodNonce = null;
    paymentInstrument.custom.braintreeCustomFields = null;

    if (responseTransaction.type === 'sale' && responseTransaction.status === 'authorized') {
        paymentTransaction.setType(PT.TYPE_AUTH);
    } else if (responseTransaction.type === 'sale' && (responseTransaction.status === 'settling' || responseTransaction.status === 'submitted_for_settlement')) {
        paymentTransaction.setType(PT.TYPE_CAPTURE);
    }
}

/**
 * Create Base Sale Transaction Data
 * @param  {dw.order.Order} order Order
 * @param {dw.order.OrderPaymentInstrument} paymentInstrument Order payment instrument
 * @returns {Object} data fields
 */
function createBaseSaleTransactionData(order, paymentInstrument) {
    var { isCustomerExistInVault } = require('~/cartridge/scripts/braintree/braintreeAPI/braintreeApiCalls');
    var { getAmountPaid } = require('~/cartridge/scripts/braintree/helpers/paymentHelper');
    var { createCustomerId } = require('~/cartridge/scripts/braintree/helpers/customerHelper');
    var customer = order.getCustomer();
    var isCustomerInVault = isCustomerExistInVault(customer);

    var data = {
        xmlType: 'transaction',
        requestPath: 'transactions',
        orderId: order.getOrderNo(),
        amount: getAmountPaid(order).getValue(),
        currencyCode: order.getCurrencyCode(),
        customFields: getCustomFields(order, paymentInstrument)
    };

    if (isCustomerInVault) {
        data.customerId = createCustomerId(customer);
    } else {
        data.customerId = null;
        data.customer = createGuestCustomerData(order);
    }

    if (isTokenExists(isCustomerInVault, paymentInstrument)) {
        data.paymentMethodToken = paymentInstrument.custom.braintreePaymentMethodToken;
    } else {
        data.paymentMethodNonce = paymentInstrument.custom.braintreePaymentMethodNonce;
    }
    return data;
}

module.exports = {
    updateBillingAddress: updateBillingAddress,
    updateShippingAddress: updateShippingAddress,
    getISO3Country: getISO3Country,
    saveGeneralTransactionData: saveGeneralTransactionData,
    createBaseSaleTransactionData: createBaseSaleTransactionData,
    getCustomFields: getCustomFields,
    createFullName: createFullName,
    createGuestCustomerData: createGuestCustomerData,
    isCountryCodesUpperCase: isCountryCodesUpperCase,
    isTokenExists: isTokenExists
};
