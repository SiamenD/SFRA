var braintreeApi = require('~/cartridge/scripts/braintree/braintreeApi');
var BraintreeHelper = require('~/cartridge/scripts/braintree/braintreeHelper');
var Resource = require('dw/web/Resource');
var Transaction = require('dw/system/Transaction');
var prefs = BraintreeHelper.prefs;

var braintreeApiCalls = {};

/**
 * Call API request
 *
 * @param {Object} requestData Request data
 * @returns {Object} Response data
 */
function call(requestData) {
    var createService = require('*/cartridge/scripts/service/braintreeCreateService.js');
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
        BraintreeHelper.getLogger().error(error);
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
            braintreeError = BraintreeHelper.createErrorMessage(errorObj.apiErrorResponse);
        } else {
            braintreeError = Resource.msg('braintree.server.error', 'locale', null);
            BraintreeHelper.getLogger().error(braintreeError);
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
    var createRequestDataContainer = require('~/cartridge/scripts/braintree/requestDataContainer');
    var responseData = null;
    try {
        var data = createRequestDataContainer(methodName, dataObject);
        responseData = call(data);
        BraintreeHelper.updateData(methodName, dataObject, responseData);
    } catch (error) {
        BraintreeHelper.getLogger().error(error);
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
braintreeApiCalls.isCustomerExist = function (customer) {
    var customerId = BraintreeHelper.createCustomerId(customer);
    try {
        call({
            xmlType: 'empty',
            requestPath: 'customers/' + customerId,
            requestMethod: 'GET'
        });
        return true;
    } catch (error) {
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
        var customerPaymentInstruments = BraintreeHelper.getCustomerPaymentInstruments(creditCardType);
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
        var customerPaymentInstruments = BraintreeHelper.getCustomerPaymentInstruments(prefs.paypalMethodName);
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
 * Create customer on Braintree side and mark current demandware customer with isBraintree flag
 * @returns {boolean} result
 */
braintreeApiCalls.createCustomerOnBraintreeSide = function () {
    try {
        var profile = customer.getProfile();
        callApiMethod('createCustomer', {
            customerId: BraintreeHelper.createCustomerId(customer),
            firstName: profile.getFirstName(),
            lastName: profile.getLastName(),
            email: profile.getEmail(),
            company: profile.getCompanyName(),
            phone: profile.getPhoneMobile() || profile.getPhoneHome() || profile.getPhoneBusiness(),
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
            customerId: BraintreeHelper.createCustomerId(customer),
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
        BraintreeHelper.getLogger().error(error);
    }
};

braintreeApiCalls.createPaymentMethod = function (braintreePaymentMethodNonce, order) {
    var customerId = BraintreeHelper.createCustomerId(customer);
    if (!braintreeApiCalls.isCustomerExist(customer)) {
        var customerData = BraintreeHelper.createCustomerData(order);
        if (!empty(prefs.BRAINTREE_PAYPAL_Payee_Email)) {
            customerData.paypalPayeeEmail = prefs.BRAINTREE_PAYPAL_Payee_Email;
        }
        var createCustomerResponseData = callApiMethod('createCustomer', customerData);
        customerId = createCustomerResponseData.customer.id;
    }
    var createPaymentMethodResponseData = callApiMethod('createPaymentMethod', {
        customerId: customerId,
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
        BraintreeHelper.getLogger().error(error);
    }

    // eslint-disable-next-line no-prototype-builtins
    return responseData && responseData.hasOwnProperty('paymentMethodNonce') ? responseData.paymentMethodNonce.nonce : null;
};

braintreeApiCalls.call = call;
braintreeApiCalls.callApiMethod = callApiMethod;
module.exports = braintreeApiCalls;
