var braintreeApi = require('~/cartridge/scripts/braintree/braintreeAPI/braintreeApi');

var {
    getLogger,
    createErrorMessage,
    updateData
} = require('~/cartridge/scripts/braintree/helpers/paymentHelper');
var {
    createCustomerId,
    getCustomerPaymentInstruments
} = require('~/cartridge/scripts/braintree/helpers/customerHelper');

var { createGuestCustomerData } = require('~/cartridge/scripts/braintree/processors/processorHelper');

var Resource = require('dw/web/Resource');
var Transaction = require('dw/system/Transaction');
var prefs = require('~/cartridge/config/braintreePreferences')();

var braintreeApiCalls = {};

/**
 * @param  {dw.customer.Profile} profile Customer profile
 * @returns {string} Phone number
 */
function getPhoneFromProfile(profile) {
    return profile.getPhoneMobile() || profile.getPhoneHome() || profile.getPhoneBusiness();
}


/**
 * Create customer data for API call
 * @param {dw.order.Order} order Order object
 * @return {Object} Customer data for request
 */
function createRegisteredCustomerData(order) {
    var billingAddress = order.getBillingAddress();
    var shippingAddress = order.getDefaultShipment().getShippingAddress();
    var profile = customer.getProfile();
    return {
        id: createCustomerId(customer),
        firstName: profile.getFirstName(),
        lastName: profile.getLastName(),
        email: profile.getEmail(),
        phone: getPhoneFromProfile(profile) || billingAddress.getPhone() || shippingAddress.getPhone(),
        company: profile.getCompanyName(),
        fax: profile.getFax()
    };
}


/**
 * Call API request
 *
 * @param {Object} requestData Request data
 * @returns {Object} Response data
 */
function call(requestData) {
    var createService = require('*/cartridge/scripts/service/braintreeCreateService');
    var service = null;
    var result = null;

    try {
        service = createService();
    } catch (error) {
        throw new Error('Service int_braintree.http.xml.payment.Braintree is undefined. Need to add this service in Administration > Operations > Services');
    }

    try {
        result = service.setThrowOnError().call(requestData);
    } catch (error) {
        getLogger().error(error);
        error.customMessage = Resource.msg('braintree.server.error.parse', 'locale', null);
        throw error;
    }

    if (result.getStatus() === 'ERROR' && result.getError() === 404) {
        var error = new Error(Resource.msg('braintree.server.error.custom', 'locale', null));
        error.status = '404';
        throw error;
    }

    if (!result.isOk()) {
        var braintreeError;
        var errorObj = null;
        try {
            errorObj = braintreeApi.parseXml(result.getErrorMessage());
        } catch (err) {
            err.customMessage = Resource.msg('braintree.server.error.parse', 'locale', null);
            throw err;
        }

        if (Object.prototype.hasOwnProperty.call(errorObj, 'apiErrorResponse')) {
            braintreeError = createErrorMessage(errorObj.apiErrorResponse);
        } else {
            braintreeError = Resource.msg('braintree.server.error', 'locale', null);
            getLogger().error(braintreeError);
        }
        throw new Error(braintreeError);
    }

    return service.getResponse();
}

/**
 * Call Braintree API methods with specific data
 * @param {string} methodName Method name
 * @param {Object} dataObject Data for call
 * @return {Object} Responce data from API call
 */
function callApiMethod(methodName, dataObject) {
    var createRequestDataContainer = require('~/cartridge/scripts/braintree/braintreeAPI/requestDataContainer');
    var responseData = null;
    try {
        var data = createRequestDataContainer(methodName, dataObject);
        responseData = call(data);
        updateData(methodName, dataObject, responseData);
    } catch (error) {
        getLogger().error(error);
        throw new Error(error);
    }

    return responseData;
}

/**
 * Generate client token
 * @param {string} currencyCode currency code
 * @return {string} Client token value
 */
braintreeApiCalls.getClientToken = function (currencyCode) {
    var responseData = null;
    if (prefs.BRAINTREE_Tokenization_Key && prefs.BRAINTREE_Tokenization_Key !== '') {
        return prefs.BRAINTREE_Tokenization_Key;
    }
    try {
        responseData = call({
            xmlType: 'client_token',
            requestPath: 'client_token',
            currencyCode: currencyCode
        });
    } catch (error) {
        return responseData;
    }
    return responseData.clientToken.value;
};

/**
 * Search transactions by ids
 * @param {Array} ids transactions by ids
 * @return {Object} Search object
 */
braintreeApiCalls.searchTransactionsByIds = function (ids) {
    var responseData = {};
    try {
        responseData = call({
            xmlType: 'search_transactions_by_ids',
            requestPath: 'transactions/advanced_search',
            ids: ids
        });
    } catch (error) {
        return responseData;
    }
    return responseData;
};

/**
 * Make API call, to check if customer exist in braintree
 * @param {dw.customer.Customer} customer Customer object
 * @return {boolean} Exist or not exist status
 */
braintreeApiCalls.isCustomerExistInVault = function (customer) {
    if (!customer.isRegistered()) {
        return false;
    }
    if (session.custom.isCustomerExistInVault) {
        return true;
    }
    try {
        call({
            xmlType: 'empty',
            requestPath: 'customers/' + createCustomerId(customer),
            requestMethod: 'GET'
        });

        session.custom.isCustomerExistInVault = true;
        return true;
    } catch (error) {
        session.custom.isCustomerExistInVault = false;
        return false;
    }
};

/**
 * Remove billing address from payment method
 * @param {string} customerId Customer ID
 * @param {string} addressId Address ID
 * @return {boolean} Call result
 */
braintreeApiCalls.deleteBillingAddress = function (customerId, addressId) {
    try {
        call({
            xmlType: 'empty',
            requestPath: 'customers/' + customerId + '/addresses/' + addressId,
            requestMethod: 'DELETE'
        });
        return true;
    } catch (error) {
        return false;
    }
};

/**
 * Make default credit card payment instrument for current user
 * @param {string} paymentMethodToken payment method token from braintree
 * @return {Object} default card call or error response.
 */
braintreeApiCalls.makeDefaultCreditCard = function (paymentMethodToken) {
    var data = null;
    var creditCardType = require('dw/order/PaymentInstrument').METHOD_CREDIT_CARD;
    try {
        var customerPaymentInstruments = getCustomerPaymentInstruments(creditCardType);
        var iterator = customerPaymentInstruments.iterator();
        var paymentInst = null;

        Transaction.wrap(function () {
            while (iterator.hasNext()) {
                paymentInst = iterator.next();
                paymentInst.custom.braintreeDefaultCard = paymentMethodToken === paymentInst.custom.braintreePaymentMethodToken;
            }
        });

        data = call({
            xmlType: 'payment_method',
            requestPath: 'payment_methods/any/' + paymentMethodToken,
            requestMethod: 'PUT',
            makeDefault: true
        });
    } catch (error) {
        return {
            error: error.customMessage ? error.customMessage : error.message
        };
    }
    return data;
};

/**
 * Make default PayPal payment instrument for current user
 * @param {string} paymentMethodToken Token from Braintree
 * @return {Object} make dafault call result
 */
braintreeApiCalls.makeDefaultPaypalAccount = function (paymentMethodToken) {
    var data = null;
    try {
        var customerPaymentInstruments = getCustomerPaymentInstruments(prefs.paymentMethods.BRAINTREE_PAYPAL.paymentMethodId);
        var iterator = customerPaymentInstruments.iterator();
        var paymentInst = null;

        Transaction.wrap(function () {
            while (iterator.hasNext()) {
                paymentInst = iterator.next();
                paymentInst.custom.braintreeDefaultCard = paymentMethodToken === paymentInst.custom.braintreePaymentMethodToken;
            }
        });

        data = call({
            xmlType: 'payment_method',
            requestPath: 'payment_methods/any/' + paymentMethodToken,
            requestMethod: 'PUT',
            makeDefault: true
        });
    } catch (error) {
        return {
            error: error.customMessage ? error.customMessage : error.message
        };
    }
    return data;
};

/**
 * Make default Venmo payment instrument for current user
 * @param {string} paymentMethodToken Token from Braintree
 * @return {Object} make dafault call result
 */
braintreeApiCalls.makeDefaultVenmoAccount = function (paymentMethodToken) {
    try {
        var customerPaymentInstruments = getCustomerPaymentInstruments(prefs.paymentMethods.BRAINTREE_VENMO.paymentMethodId);
        var iterator = customerPaymentInstruments.iterator();
        var paymentInst = null;

        Transaction.wrap(function () {
            while (iterator.hasNext()) {
                paymentInst = iterator.next();
                paymentInst.custom.braintreeDefaultCard = paymentMethodToken === paymentInst.custom.braintreePaymentMethodToken;
            }
        });
    } catch (error) {
        return {
            error: error.customMessage ? error.customMessage : error.message
        };
    }
    return true;
};

/**
 * Create customer on Braintree side and mark current demandware customer with isBraintree flag
 * @returns {boolean} result
 */
braintreeApiCalls.createCustomerOnBraintreeSide = function () {
    try {
        var profile = customer.getProfile();
        callApiMethod('createCustomer', {
            customerId: createCustomerId(customer),
            firstName: profile.getFirstName(),
            lastName: profile.getLastName(),
            email: profile.getEmail(),
            company: profile.getCompanyName(),
            phone: getPhoneFromProfile(profile),
            fax: profile.getFax()
        });
        Transaction.wrap(function () {
            profile.custom.isBraintree = true;
        });
    } catch (error) {
        return {
            error: error.customMessage ? error.customMessage : error.message
        };
    }
    return true;
};

/**
 * Manually create braintree payment method(on braintree side) for current customer
 * @param {string} nonce Payment method nonce
 * @param {boolean} makeDefault Flag, that indicates if new method is the new default method
 * @return {Object} Responce data from API call
 */
braintreeApiCalls.createPaymentMethodOnBraintreeSide = function (nonce, makeDefault) {
    var responseData = null;

    try {
        responseData = callApiMethod('createPaymentMethod', {
            customerId: customer.isRegistered() ? createCustomerId(customer) : null,
            paymentMethodNonce: nonce,
            makeDefault: makeDefault
        });
    } catch (error) {
        responseData = {
            error: error.customMessage ? error.customMessage : error.message
        };
    }
    return responseData;
};

braintreeApiCalls.deletePaymentMethod = function (token) {
    try {
        callApiMethod('deletePaymentMethod', {
            token: token
        });
    } catch (error) {
        getLogger().error(error);
    }
};

braintreeApiCalls.createPaymentMethod = function (braintreePaymentMethodNonce, order) {
    var customerId;
    if (!braintreeApiCalls.isCustomerExistInVault(customer)) {
        var customerData = customer.isRegistered() ?
            createRegisteredCustomerData(order) :
            createGuestCustomerData(order);
        if (!empty(prefs.BRAINTREE_PAYPAL_Payee_Email)) {
            customerData.paypalPayeeEmail = prefs.BRAINTREE_PAYPAL_Payee_Email;
        }
        var createCustomerResponseData = callApiMethod('createCustomer', customerData);
        customerId = createCustomerResponseData.customer.id;
    }
    var createPaymentMethodResponseData = callApiMethod('createPaymentMethod', {
        customerId: customerId || createCustomerId(customer),
        paymentMethodNonce: braintreePaymentMethodNonce
    });
    return createPaymentMethodResponseData.paypalAccount.token;
};

braintreeApiCalls.getNonceFromToken = function (token) {
    var responseData = null;
    try {
        responseData = call({
            xmlType: 'empty',
            requestPath: 'payment_methods/' + token + '/nonces'
        });
    } catch (error) {
        getLogger().error(error);
    }

    // eslint-disable-next-line no-prototype-builtins
    return responseData && responseData.hasOwnProperty('paymentMethodNonce') ? responseData.paymentMethodNonce.nonce : null;
};

braintreeApiCalls.call = call;
braintreeApiCalls.callApiMethod = callApiMethod;
module.exports = braintreeApiCalls;
